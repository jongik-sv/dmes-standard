"use client";

/**
 * 룰 세트 흐름 캔버스(2단계 계획 Task 9) — React Flow 로 흐름을 그리는 표현 컴포넌트.
 * 상태를 갖지 않는다(선택·확대는 React Flow 내부, 끌던 중 위치만 잠깐 들고 있다). 편집은 모두 콜백으로 올린다.
 * 부모가 편집 모드일 때만 `mode="edit"` 로 부른다. 보기 모드는 끌기·연결이 꺼지고 선택만 된다.
 * 편집 모드에서는 여러 노드를 고를 수 있다 — Shift(또는 Cmd·Ctrl)+누르기, Shift+끌기 상자. 고른 흐름 노드 ID 목록은 `onSelectionChange` 로 올린다(Ruling 11).
 *
 * 3단계(계획 P2): 모드는 보기·편집·디버그 셋이고 끌기·연결은 편집 모드에서만 된다. 키 입력은 받지 않는다 — Delete 등 단축키는 page 가
 * 캔버스 감싸개(`rsf-canvas-host`)의 `onKeyDown` 에서 단축키 디스패처(`shortcuts.ts`)로 받는다(`tabIndex=0` 은 초점을 받으려고 남긴다).
 * 팔레트·룰 줄을 놓으면 놓은 자리에서 화면 80px 안 가장 가까운 선을 찾아(`dropRadius`) 그 선 ID(없으면 null)를 함께 올린다(A1).
 * 우클릭은 모든 모드에서 `onContextMenu` 로 올리고(항목은 메뉴 제공자가 모드로 거른다), 편집 모드면 선 가운데에 [+] 단추를 둔다.
 * [+] 는 선 데이터에 콜백을 넣지 않고 캔버스 틀의 click 위임으로 부른다(선 데이터 참조가 바뀌면 선을 모두 다시 그린다, Local-Rules §16).
 *
 * 선 경로 편집(Task 15, C14): `view.routes[선 ID]` 가 있으면 꺾는 점을 지나는 둥근 꺾은선으로 그린다(모든 모드). 편집 모드에서 고른 선에는 점마다 손잡이가 뜬다.
 * 손잡이 끌기·고른 손잡이는 캔버스 안 저장소(`RouteStore`)에만 두고 놓을 때 `onRouteChange` 를 한 번 부른다(page 는 끌기 중 다시 그리지 않는다).
 * 손잡이를 고른 채 Delete·Backspace 는 page 의 단축키 디스패처가 받는다 — page 가 내려준 `removeRoutePointRef` 에 캔버스가
 * "고른 꺾는 점 빼기(뺐으면 true)" 를 채우고, page 의 delete 핸들러가 그것을 먼저 부른 뒤 false 면 원래 선택 삭제로 간다.
 * 뺀 뒤에는 이웃 점을 고른 채로 둬 연속 Delete 가 선 전체 삭제로 새지 않는다(점이 없으면 선택 없음).
 */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore,
  type DragEvent, type MutableRefObject, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent,
} from "react";

import { IconPlus } from "@tabler/icons-react";

import type { RuleSetFlow, TypedValue } from "@/contract/engine-contract.generated";

import type { FlowNote, FlowPos, EditFlow } from "../flow-edit";
import { NODE_SIZE, drawnPositions } from "../flow-layout";
import { typedText } from "../trace-view";
import { blockDragPositions, dropTargetAt, edgeChips, edgeMarks, nodeMarks, resolveNodeDrop } from "../flow-vars";
import type { FlowMode } from "../state/useRuleSetEdit";
import type { RuleIoMap, RuleSetCheck, VarDisplay } from "../types";
import { collapseView } from "./collapse";
import { insertRoutePoint, routeMidpoint, routePath } from "./route-path";
import type { MenuTarget } from "./context-menu";
import { GroupNodeData, NODE_TYPES, NoteNodeData, FlowNodeData, handlesOf, type CollapsedBlockInfo } from "./nodes";
import type { EdgeState, Overlay } from "./overlay";
import {
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  getSmoothStepPath,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeProps,
  type EdgeTypes,
  type Node,
  type NodeChange,
} from "./react-flow";

export type { CollapsedBlockInfo } from "./nodes";

export type PaletteItem = "rule" | "if" | "par" | "note" | "group";
export const PALETTE_MIME = "application/x-rsf-palette";
/** 룰 목록 줄 끌기(A4). 값 = ruleId. */
export const RULE_MIME = "application/x-rsf-rule";
/** 끌어 놓을 선을 찾는 화면 반경(px). */
export const DROP_RADIUS_PX = 80;
/** 흐름 좌표 반경 — `nearestEdge` 의 max 는 흐름 좌표라 확대 배율로 나눈다. */
export const dropRadius = (zoom: number) => DROP_RADIUS_PX / (zoom > 0 ? zoom : 1);
const PALETTE_ITEMS: readonly string[] = ["rule", "if", "par", "note", "group"];
/** 중단점을 걸 수 있는 노드 종류(E2). */
const BREAKABLE = new Set(["RULE", "IF", "PARALLEL", "MERGE"]);
/** [+] 단추를 선 이름표 오른쪽에 둘 때의 거리(px). */
const ADD_LABEL_GAP = 44;
/** 미니맵을 확대·축소 단추 줄(가로) 위에 둔다. */
const MINIMAP_STYLE = { marginBottom: 48 } as const;
const GROUP_MARGIN = 16;
const FLASH_MS = 1200;
/** 화면 맞춤 여백·확대 한계. 최소 배율 0.1 — 노드 24~27개(높이 약 2050px) 흐름이 400px 대 캔버스에 들어가려면 약 0.17 이 필요하다. */
const FIT_OPTIONS = { padding: 0.15 };
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 2;
/** 선 경로 모서리 반경(C14). */
const ROUTE_RADIUS = 8;
/** 경로가 있는 선의 변수 칩을 가운데 라벨 아래로 띄우는 거리(px). */
const ROUTE_CHIP_GAP = 20;
/**
 * 같은 두 노드를 잇는 경로 없는 선들(빈 갈래 둘인 분기 등)은 그림이 같아 라벨·[+] 가 한 자리에 겹친다 — 이름표 묶음을 가로로 이만큼씩 벌린다(px).
 * 라벨(약 50px)과 오른쪽 [+](ADD_LABEL_GAP)가 이웃 묶음과 닿지 않는 폭이다.
 */
const LABEL_SPREAD = 120;

const NO_LABELS: Readonly<Record<string, string>> = {};

type Measured = { width: number; height: number };

export interface FlowCanvasProps {
  flow: EditFlow;
  rules: RuleIoMap;
  checks: readonly RuleSetCheck[];
  mode: FlowMode;
  varDisplay: VarDisplay;
  /** 변수 이름 → 표시명(page 가 한 번 만든다). [이름] 모드 칩·툴팁이 쓴다. 없으면 ID. */
  varLabels?: Readonly<Record<string, string>>;
  selectedId: string | null; // 노드·메모·그룹 ID
  selectedEdgeId: string | null;
  /** 디버그 겹침(P9 debugOverlay). 낡은 기록이면 page 가 null 을 넘긴다(P-D9). */
  overlay: Overlay | null;
  focusId: string | null; // 검사 항목을 누르면 이 노드로 이동·깜빡임
  focusSeq: number; // 이동을 요청할 때마다 부모가 1씩 올린다(같은 노드로 다시 이동·깜빡임)
  /** true 면 노드가 이미 화면 안에 다 보이면 옮기지 않고 깜빡이기만 한다(E1 — 디버그 커서 이동). */
  focusReveal?: boolean;
  /** 값이 바뀔 때마다 화면 맞춤(선택 추가 — 툴바의 [화면 맞춤]). */
  fitSignal?: number;
  /**
   * 흐름의 주인(세트 ID). 바뀌면 새 흐름을 그린 뒤 곧바로(애니메이션 없이) 화면을 맞춘다 — 이전 세트의 확대·이동이 남지 않게.
   * 같은 값으로 흐름만 바뀌면(편집·저장·같은 세트 다시 열기) 맞추지 않는다.
   */
  fitKey?: string | null;
  /** 중단점이 걸린 노드(E2 — 그리기는 Task 11). 참조가 렌더마다 바뀌지 않게 넘긴다. */
  breakpoints: ReadonlySet<string>;
  /** 접힌 분기 ID(D16 — 그리기는 Task 11). */
  collapsed: ReadonlySet<string>;
  /** 오른쪽 아래 미니맵(D14). */
  showMiniMap: boolean;
  /** 변수 칩 툴팁 값(E3, undefined = 아직 없음 — Task 11). */
  valueAt?: (name: string) => TypedValue | null | undefined;
  /** 즉석 조건식 편집 중인 선(B10 — Task 7). */
  editingCondEdgeId: string | null;
  onSelect: (id: string | null) => void;
  onSelectEdge: (edgeId: string | null) => void;
  onOpenRule: (ruleId: string) => void; // 링크 아이콘만
  /** 선 밖에 놓은 끌기 끝(편집 모드만). 끈 메모 위치도 함께 올려 이력이 한 칸으로 남는다(B5). */
  onMove: (pos: Record<string, FlowPos>, notes?: Record<string, FlowPos>) => void;
  /** 놓인 노드·블록을 선 위에 놓음(A2 — Task 7). */
  onMoveNode: (nodeId: string, edgeId: string, pos: Record<string, FlowPos>) => void;
  onConnect: (from: string, to: string) => void;
  /**
   * 고른 선의 한쪽 끝을 다른 노드 손잡이에 놓음(R1 — 선 끝 옮기기). 바뀐 끝만 담는다(`from` = 출발 쪽, `to` = 도착 쪽).
   * 편집 모드에서 선을 골랐을 때만 끝 손잡이가 뜨고, 안 넘기면(또는 보기·디버그 모드면) 끝 손잡이가 없다. 끌기 중에는 부르지 않고 놓을 때 한 번 부른다.
   */
  onReconnect?: (edgeId: string, end: { from?: string; to?: string }) => void;
  /** 팔레트 항목을 놓음(A1) — 놓은 자리에서 가장 가까운 선(없으면 null)을 함께 올린다. */
  onDropPalette: (item: PaletteItem, at: FlowPos, edgeId: string | null) => void;
  /** 룰 목록 줄을 놓음(A4). */
  onDropRule: (ruleId: string, edgeId: string | null) => void;
  onNoteChange: (id: string, patch: Partial<FlowNote>) => void;
  /** 선 경로(꺾는 점 목록, 흐름 좌표)를 통째로 바꿈(C14) — 손잡이를 놓을 때·점을 더하거나 뺄 때 한 번. 빈 목록이면 경로를 지운다. */
  onRouteChange?: (edgeId: string, points: FlowPos[]) => void;
  /** 캔버스가 "고른 꺾는 점 빼기 — 뺐으면 true" 를 채우는 ref(page 의 delete 단축키가 먼저 부른다, C14). */
  removeRoutePointRef?: MutableRefObject<(() => boolean) | null>;
  /** 캔버스가 "React Flow 선택 모두 비우기" 를 채우는 ref(page 의 Esc 가 부른다 — disableKeyboardA11y 로 내장 Esc 가 없다). */
  clearSelectionRef?: MutableRefObject<(() => void) | null>;
  /** 우클릭·[+] — 대상과 화면 좌표(B7·A3). */
  onContextMenu: (target: MenuTarget, at: { x: number; y: number }) => void;
  /** 즉석 조건식 Enter(B10 — Task 7). */
  onEditCond: (edgeId: string, cond: string) => void;
  /** 즉석 조건식 Esc·밖 누르기(B10 — Task 7). */
  onEditCondClose: () => void;
  /** 중단점 점 누르기(E2 — Task 11). */
  onToggleBreakpoint: (nodeId: string) => void;
  /**
   * React Flow 다중 선택이 바뀌면 고른 흐름 노드 ID(메모·그룹 제외)를 올린다. 선택이 모두 풀리면 빈 목록이다.
   * 메모·그룹만 고른 경우는 올리지 않는다 — 노드를 여러 개 고른 뒤 그룹 제목을 눌러 [선택 노드 더하기] 를 쓸 수 있게 한다.
   */
  onSelectionChange?: (nodeIds: string[]) => void;
}

/** 편집 모드 다중 선택 키 — 누르기로 더하기. */
const MULTI_KEYS = ["Shift", "Meta", "Control"];

type EdgeData = {
  label: string | null;
  /** 지금 조건식(B10 입력 칸의 처음 값). */
  cond: string | null;
  chips: string[];
  state: EdgeState | undefined;
  mark: "REJECT" | "WARN" | undefined;
  varDisplay: VarDisplay;
  varLabels: Readonly<Record<string, string>>;
  /** 끄는 동안 놓일 선(A1·A2 — Task 7 이 채운다). */
  dropTarget: boolean;
  /** 편집 모드 — 선 가운데 [+] 단추. */
  insertable: boolean;
  /** 편집 모드이고 IF 의 "그 외" 가 아닌 갈래 — 조건식 즉석 편집 가능(B10). */
  condEditable: boolean;
  /** 조건식 즉석 편집 중(B10 — Task 7). */
  editingCond: boolean;
  /** 칩 툴팁 값(E3 — Task 11). */
  valueOf?: (name: string) => TypedValue | null | undefined;
  /** 저장된 꺾는 점(C14). 접힌 분기가 이어 받은 선은 null. */
  route: FlowPos[] | null;
  /** 편집 모드이고 접힌 분기가 이어 받은 선이 아님 — 두 번 눌러 점 더하기. */
  routeEditable: boolean;
  /** 고른 선 — 점마다 손잡이. */
  routeHandles: boolean;
  /** 이름표 묶음(라벨·[+]·여기에 넣기)의 가로 비킴(px) — 같은 두 노드를 잇는 경로 없는 선끼리 겹치지 않게. 없으면 0. */
  spread: number;
};
type FlowRfEdge = Edge<EdgeData, "rsfFlow">;

/** 조건식 즉석 편집 칸의 확정·취소 — 선 데이터에 콜백을 넣지 않으려고 문맥으로 준다(Local-Rules §16). */
interface CondEditActions {
  commit(edgeId: string, cond: string): void;
  cancel(): void;
}
const CondEditContext = createContext<CondEditActions | null>(null);

/** 선 라벨 자리의 조건식 입력 칸(B10) — Enter 확정, Esc·칸 밖 누르기 취소. 키 입력은 캔버스 단축키로 번지지 않게 막는다. */
function CondInput({ edgeId, initial }: { edgeId: string; initial: string }) {
  const actions = useContext(CondEditContext);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    if (commit) actions?.commit(edgeId, ref.current?.value ?? "");
    else actions?.cancel();
  };
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
    const outside = (e: Event) => {
      if (!ref.current?.contains(e.target as globalThis.Node)) finish(false);
    };
    document.addEventListener("mousedown", outside, true);
    document.addEventListener("pointerdown", outside, true);
    return () => {
      document.removeEventListener("mousedown", outside, true);
      document.removeEventListener("pointerdown", outside, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <input
      ref={ref}
      type="text"
      className="rsf-cond-input nodrag nopan nowheel"
      data-testid={`flow-edge-cond-input-${edgeId}`}
      defaultValue={initial}
      aria-label="조건식"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          finish(true);
        } else if (e.key === "Escape") {
          e.preventDefault();
          finish(false);
        }
      }}
      onBlur={() => finish(false)}
    />
  );
}

/** 변수 칩 툴팁(E3) — 모드와 관계없이 `표시명 (ID)`(표시명이 없으면 `ID`) 뒤에 값이 만들어졌으면 ` = 값`, 아직이면 ` · 아직 없음`. valueOf 가 없으면(디버그 모드가 아니거나 낡은 기록) 값 부분이 없고, 덧붙일 것도 없으면(표시명 없음) 툴팁이 없다. */
function chipTitle(name: string, label: string | undefined, valueOf: EdgeData["valueOf"]): string | undefined {
  const who = label && label !== name ? `${label} (${name})` : name;
  if (!valueOf) return who === name ? undefined : who;
  const v = valueOf(name);
  return v === undefined ? `${who} · 아직 없음` : `${who} = ${typedText(v)}`;
}

/** 손잡이 끌기·고른 손잡이 저장소(C14). 선 하나만 구독해 끄는 동안 그 선만 다시 그린다(다른 선·page 는 그대로). */
interface RouteStore {
  drag: { edgeId: string; index: number; points: FlowPos[] } | null;
  sel: { edgeId: string; index: number } | null;
  subscribe(cb: () => void): () => void;
  emit(): void;
}
function createRouteStore(): RouteStore {
  const listeners = new Set<() => void>();
  return {
    drag: null,
    sel: null,
    subscribe: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    emit: () => listeners.forEach((cb) => cb()),
  };
}
interface RouteApi {
  store: RouteStore;
  startDrag(e: ReactPointerEvent, edgeId: string, index: number, points: readonly FlowPos[]): void;
  addPoint(edgeId: string, points: readonly FlowPos[], source: FlowPos, target: FlowPos, clientX: number, clientY: number): void;
  removePoint(edgeId: string, points: readonly FlowPos[], index: number): void;
}
const RouteContext = createContext<RouteApi | null>(null);

function FlowEdgeView(props: EdgeProps<FlowRfEdge>) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected } = props;
  const routeApi = useContext(RouteContext);
  const dragged = useSyncExternalStore(
    routeApi ? routeApi.store.subscribe : NO_SUBSCRIBE,
    () => (routeApi?.store.drag?.edgeId === id ? routeApi.store.drag.points : null),
    () => null,
  );
  const selHandle = useSyncExternalStore(
    routeApi ? routeApi.store.subscribe : NO_SUBSCRIBE,
    () => (routeApi?.store.sel?.edgeId === id ? routeApi.store.sel.index : -1),
    () => -1,
  );
  const route = dragged ?? data?.route ?? null;
  const [smoothPath, slx, sly] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 8 });
  let path = smoothPath;
  let lx = slx;
  let ly = sly;
  if (route && route.length > 0) {
    const pts = [{ x: sourceX, y: sourceY }, ...route, { x: targetX, y: targetY }];
    path = routePath(pts, ROUTE_RADIUS);
    ({ x: lx, y: ly } = routeMidpoint(pts));
  }
  lx += data?.spread ?? 0; // 같은 두 노드를 잇는 선끼리 이름표를 벌린다(경로가 있는 선은 0)
  const state = data?.state;
  const style: React.CSSProperties = { stroke: "var(--rsf-edge)", strokeWidth: 1.5 };
  if (data?.mark) style.stroke = data.mark === "REJECT" ? "var(--color-danger)" : "var(--color-warning)";
  if (selected) {
    style.stroke = "var(--color-primary)";
    style.strokeWidth = 2.5;
  }
  if (data?.dropTarget) {
    style.stroke = "var(--color-primary)";
    style.strokeWidth = 4;
  }
  if (state === "run") {
    style.stroke = "var(--color-success)";
    style.strokeWidth = 2;
  } else if (state === "chosen") {
    style.stroke = "var(--color-success)";
    style.strokeWidth = 4;
  } else if (state === "dim") style.opacity = 0.22;
  const chips = data && data.varDisplay !== "off" ? (data.chips ?? []) : [];
  const labelOf = data?.varLabels;
  const at = (x: number, y: number) => ({ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)` });
  const addX = data?.label ? lx + ADD_LABEL_GAP : lx;
  return (
    <>
      <g
        onDoubleClick={
          data?.routeEditable && routeApi
            ? (e) => {
                e.stopPropagation();
                routeApi.addPoint(id, route ?? [], { x: sourceX, y: sourceY }, { x: targetX, y: targetY }, e.clientX, e.clientY);
              }
            : undefined
        }
      >
        <BaseEdge id={id} path={path} style={style} markerEnd={props.markerEnd} interactionWidth={20} className={data?.dropTarget ? "rsf-edge-drop" : undefined} />
      </g>
      <EdgeLabelRenderer>
        {data?.editingCond && data.condEditable ? (
          <div className="rsf-elabel" style={at(lx, ly)}>
            <CondInput edgeId={id} initial={data.cond ?? ""} />
          </div>
        ) : (
          data?.label && (
            <div className="rsf-elabel" style={at(lx, ly)}>
              <span
                className={data.condEditable ? "rsf-branch rsf-cond-label nopan" : "rsf-branch"}
                data-testid={`flow-edge-label-${id}`}
                data-state={state ?? "idle"}
                data-cond-edge={data.condEditable ? id : undefined}
                title={data.condEditable ? "두 번 눌러 조건식을 고친다" : undefined}
              >
                {data.label}
              </span>
            </div>
          )
        )}
        {data?.dropTarget && (
          <div className="rsf-elabel" style={at(lx, ly - 22)}>
            <span className="rsf-drop-mark" data-testid={`flow-edge-drop-${id}`}>
              여기에 넣기
            </span>
          </div>
        )}
        {chips.length > 0 && (
          <div className="rsf-elabel rsf-elabel-chips" style={route && route.length > 0 ? at(lx, ly + ROUTE_CHIP_GAP) : at(sourceX, sourceY + 20)}>
            <span className="rsf-vchips" data-testid={`flow-edge-chips-${id}`}>
              {chips.map((c) => (
                <span key={c} className="rsf-vchip" title={chipTitle(c, labelOf?.[c], data?.valueOf)}>
                  {data?.varDisplay === "name" ? (labelOf?.[c] ?? c) : c}
                </span>
              ))}
            </span>
          </div>
        )}
        {data?.routeHandles &&
          routeApi &&
          route?.map((p, i) => (
            <div key={i} className="rsf-elabel" style={at(p.x, p.y)}>
              <span
                className="rsf-route-handle nodrag nopan"
                role="button"
                aria-label="꺾는 점"
                title="끌어 옮기고, 두 번 눌러 뺀다"
                data-testid={`flow-route-handle-${id}-${i}`}
                data-selected={selHandle === i ? "true" : undefined}
                data-dragging={dragged && routeApi.store.drag?.index === i ? "true" : undefined}
                onPointerDown={(e) => routeApi.startDrag(e, id, i, route)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  routeApi.removePoint(id, route, i);
                }}
              />
            </div>
          ))}
        {data?.insertable && (
          <button
            type="button"
            className="rsf-edge-add nodrag nopan"
            style={at(addX, ly)}
            data-testid={`flow-edge-add-${id}`}
            data-edge-id={id}
            aria-label="선에 넣기"
            title="선에 넣기"
          >
            <IconPlus size={12} aria-hidden="true" />
          </button>
        )}
      </EdgeLabelRenderer>
    </>
  );
}

const NO_SUBSCRIBE = () => () => {};
const EDGE_TYPES: EdgeTypes = { rsfFlow: FlowEdgeView };

/**
 * 접힌 분기 블록 요약(D16). `count` 는 분기·짝 합류를 뺀 안쪽 노드 수, `ran` 은 그 가운데 디버그/실행 기록에서 실행된 수(run·error),
 * `error` 는 안쪽 또는 합류가 오류로 끝났는가. 겹침이 없으면 0·false.
 */
function blockInfo(flow: EditFlow, block: { count: number; members: string[] }, splitId: string, overlay: Overlay | null): CollapsedBlockInfo {
  const mergeId = flow.nodes.find((n) => n.kind === "MERGE" && n.splitId === splitId)?.id;
  let ran = 0;
  let error = false;
  for (const id of block.members) {
    if (id === splitId) continue;
    const st = overlay?.nodes[id]?.state;
    if (st === "error") error = true;
    if (id !== mergeId && (st === "run" || st === "error")) ran++;
  }
  return { count: block.count, ran, error };
}

/** 그룹 틀 — 멤버 위치의 바깥 상자 + 여백. 멤버가 하나도 없으면 null. */
function groupBox(nodeIds: readonly string[], pos: Record<string, FlowPos>, kinds: Map<string, keyof typeof NODE_SIZE>) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const id of nodeIds) {
    const p = pos[id];
    const k = kinds.get(id);
    if (!p || !k) continue;
    const s = NODE_SIZE[k];
    x1 = Math.min(x1, p.x);
    y1 = Math.min(y1, p.y);
    x2 = Math.max(x2, p.x + s.w);
    y2 = Math.max(y2, p.y + s.h);
  }
  if (!Number.isFinite(x1)) return null;
  return { x: x1 - GROUP_MARGIN, y: y1 - GROUP_MARGIN, w: x2 - x1 + GROUP_MARGIN * 2, h: y2 - y1 + GROUP_MARGIN * 2 };
}

function Inner(props: FlowCanvasProps) {
  const {
    flow, rules, checks, mode, varDisplay, varLabels, selectedId, selectedEdgeId, overlay, focusId, focusSeq, focusReveal, fitSignal, fitKey,
    breakpoints, collapsed, valueAt, showMiniMap, editingCondEdgeId,
    onSelect, onSelectEdge, onOpenRule, onMove, onMoveNode, onConnect, onReconnect, onDropPalette, onDropRule, onNoteChange, onContextMenu, onToggleBreakpoint,
    onEditCond, onRouteChange, removeRoutePointRef, clearSelectionRef, onEditCondClose, onSelectionChange,
  } = props;
  const editable = mode === "edit";
  const debugging = mode === "debug";
  const rf = useReactFlow();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Record<string, FlowPos>>({});
  const [flashId, setFlashId] = useState<string | null>(null);
  /** 끄는 동안 놓일 선(A1·A2, P-D20) — 캔버스 안 상태. 부모는 놓은 순간의 선 ID 만 받는다. */
  const [dropEdge, setDropEdgeState] = useState<string | null>(null);
  const dropEdgeRef = useRef<string | null>(null);
  const setDropEdge = useCallback((id: string | null) => {
    if (dropEdgeRef.current === id) return; // 같은 값이면 상태를 바꾸지 않는다(다시 그리기 반복 방지)
    dropEdgeRef.current = id;
    setDropEdgeState(id);
  }, []);
  /** 조건식 즉석 편집 중인 선(B10) — 메뉴가 연 `editingCondEdgeId` 와 같은 칸을 쓴다. */
  const [condEdge, setCondEdge] = useState<string | null>(null);
  /** React Flow 선택(노드·메모·그룹 ID). 노드 배열을 제어하므로 select 변경을 여기 적는다. */
  const [rfSel, setRfSel] = useState<ReadonlySet<string>>(() => new Set());
  /**
   * React Flow 가 잰 노드 크기(dimensions 변경). 노드 배열을 새로 만들 때 `measured` 로 되돌려 준다.
   * 빠지면 React Flow 는 새 노드 객체를 "아직 안 잰 노드" 로 보는데, width/height 를 준 노드는 다시 재지 않으므로
   * fitView 가 무기한 미뤄지거나(= [화면 맞춤] 무반응) 나중에 잰 노드만으로 맞춰 최대 배율에 걸린다(브라우저 확인 3번).
   * 세트를 바꿔도 비우지 않는다 — start·r1·end 같은 ID 는 세트마다 겹치고, 그 노드는 다시 재지 않는다. 크기가 바뀌면 React Flow 가 다시 잰다.
   */
  const [measured, setMeasured] = useState<Readonly<Record<string, Measured>>>({});

  // 부모가 새 흐름을 내려주면 끌던 중 위치는 버린다(부모 값이 정본).
  useEffect(() => setDrag({}), [flow]);

  /** 접힌 분기를 반영한 표시 흐름(D16). 저장 흐름(`flow`)은 그대로다. */
  const view = useMemo(() => collapseView(flow, collapsed), [flow, collapsed]);
  const vflow = view.flow;
  /**
   * 자동 배치(dagre)는 표시 흐름과 저장 위치에만 묶어 따로 memo 한다 — 끌기 오프셋(drag)이 바뀌어도 다시 돌지 않는다(§16).
   * 같은 memo 안에서 겹침을 푼다(Ruling 19) — 저장 위치가 없는 노드가 저장 위치 노드와 겹치면 그리는(접힌) 흐름에서 가로로 비킨다. 좌표는 저장하지 않는다.
   */
  const basePos = useMemo(() => drawnPositions(vflow, view.blocks), [vflow, view.blocks]);
  const pos = useMemo(() => ({ ...basePos, ...drag }), [basePos, drag]);
  const posRef = useRef(pos);
  posRef.current = pos;
  const basePosRef = useRef(basePos);
  basePosRef.current = basePos;
  /** 끌기 대상 선 계산은 표시 흐름의 선만 본다. 블록을 통째로 옮기는 위치 계산은 원래 흐름(감춘 멤버 포함)으로 한다. */
  const flowRef = useRef(vflow);
  flowRef.current = vflow;
  const fullRef = useRef(flow);
  fullRef.current = flow;
  /** 원래 흐름(감춘 멤버 포함)의 배치 — 흐름이 바뀔 때만 한 번 계산하고 블록 끌기가 읽는다(펼쳐져 있으면 표시 배치를 그대로 쓴다). */
  const fullPosCache = useRef<{ flow: unknown; pos: Record<string, FlowPos> } | null>(null);
  const fullPosOf = () => {
    const cur = fullRef.current;
    if (fullPosCache.current?.flow !== cur) {
      fullPosCache.current = { flow: cur, pos: cur === flowRef.current ? basePosRef.current : drawnPositions(cur) };
    }
    return fullPosCache.current.pos;
  };
  const viewRef = useRef(view);
  viewRef.current = view;

  const condActions = useMemo<CondEditActions>(() => {
    const close = () => {
      setCondEdge(null);
      onEditCondClose();
    };
    return {
      commit: (edgeId, cond) => {
        onEditCond(edgeId, cond);
        close();
      },
      cancel: close,
    };
  }, [onEditCond, onEditCondClose]);
  useEffect(() => {
    if (!editable) setCondEdge(null);
  }, [editable]);
  const marks = useMemo(() => nodeMarks(checks), [checks]);
  const eMarks = useMemo(() => edgeMarks(checks), [checks]);
  const chips = useMemo(() => edgeChips(vflow as RuleSetFlow, rules), [vflow, rules]);

  const nodes = useMemo(() => {
    const out: Node[] = [];
    const kinds = new Map(vflow.nodes.map((n) => [n.id, n.kind] as const));
    for (const g of flow.view.groups) {
      const b = groupBox(g.nodeIds, pos, kinds);
      if (!b) continue;
      const data: GroupNodeData = { id: g.id, title: g.title, selected: selectedId === g.id };
      out.push({
        id: g.id, type: "rsfGroup", position: { x: b.x, y: b.y }, width: b.w, height: b.h, measured: measured[g.id], data, selected: rfSel.has(g.id),
        draggable: false, connectable: false, zIndex: -1, style: { pointerEvents: "none" },
      });
    }
    for (const n of vflow.nodes) {
      const p = pos[n.id] ?? { x: 0, y: 0 };
      const block = view.blocks[n.id];
      const s = NODE_SIZE[block ? "RULE" : n.kind];
      const data: FlowNodeData = {
        node: n,
        io: n.ruleId ? rules[n.ruleId] : undefined,
        mark: marks[n.id],
        overlay: overlay?.nodes[n.id],
        selected: selectedId === n.id || rfSel.has(n.id),
        flash: flashId === n.id,
        onOpenRule,
        breakpoint: breakpoints.has(n.id),
        canBreak: debugging && BREAKABLE.has(n.kind),
        collapsed: block ? blockInfo(flow, block, n.id, overlay) : null,
        onToggleBreakpoint,
      };
      out.push({
        id: n.id, type: "rsfFlow", position: p, width: s.w, height: s.h, measured: measured[n.id], data, handles: handlesOf(block ? "RULE" : n.kind), draggable: editable,
        selected: rfSel.has(n.id),
      });
    }
    for (const note of flow.view.notes) {
      const data: NoteNodeData = { note, selected: selectedId === note.id, editable, onChange: onNoteChange };
      out.push({
        id: note.id, type: "rsfNote", position: { x: drag[note.id]?.x ?? note.x, y: drag[note.id]?.y ?? note.y },
        width: note.w, height: note.h, measured: measured[note.id], data, draggable: editable, connectable: false, selected: rfSel.has(note.id),
      });
    }
    return out;
  }, [flow, vflow, view, pos, drag, rules, marks, overlay, selectedId, flashId, editable, debugging, breakpoints, onOpenRule, onToggleBreakpoint, onNoteChange, rfSel, measured]);

  const edges = useMemo(() => {
    const kindOf = new Map(vflow.nodes.map((n) => [n.id, n.kind] as const));
    // 같은 두 노드를 잇는 경로 없는 선 묶음 — 묶음 안 순서대로 이름표를 가로로 벌린다(가운데 기준).
    const routeOf = (id: string, folded: boolean) => (folded ? null : (flow.view.routes?.[id] ?? null));
    const twins = new Map<string, string[]>();
    for (const e of vflow.edges) {
      if (routeOf(e.id, !!view.blocks[e.from])?.length) continue;
      const k = JSON.stringify([e.from, e.to]);
      twins.set(k, [...(twins.get(k) ?? []), e.id]);
    }
    const spreadOf = (e: { id: string; from: string; to: string }) => {
      const list = twins.get(JSON.stringify([e.from, e.to]));
      if (!list || list.length < 2) return 0;
      return (list.indexOf(e.id) - (list.length - 1) / 2) * LABEL_SPREAD;
    };
    return vflow.edges.map<FlowRfEdge>((e) => {
      // 접힌 분기에서 나가는 선은 합류에서 나가던 선이다 — 갈래 이름·조건식이 없다.
      const folded = !!view.blocks[e.from];
      const fromSplit = !folded && (kindOf.get(e.from) === "IF" || kindOf.get(e.from) === "PARALLEL");
      const condEditable = editable && !folded && kindOf.get(e.from) === "IF" && !e.otherwise;
      // 조건 갈래는 이름(label)이 없어도 두 번 누를 자리가 있어야 한다(F10) — 대체 라벨 `갈래 {order}`.
      const label = fromSplit ? (e.label ?? (e.otherwise ? "그 외" : condEditable ? `갈래 ${e.order ?? ""}`.trim() : null)) : null;
      const data: EdgeData = {
        label, cond: e.cond, chips: chips[e.id] ?? [], state: overlay?.edges[e.id], mark: eMarks[e.id], varDisplay, varLabels: varLabels ?? NO_LABELS,
        dropTarget: dropEdge === e.id,
        insertable: editable,
        condEditable,
        editingCond: (editingCondEdgeId ?? condEdge) === e.id,
        valueOf: debugging ? valueAt : undefined,
        // 접힌 분기가 이어 받은 선(같은 ID 라도 양 끝이 다르다)에는 원래 경로를 그리지 않는다.
        route: routeOf(e.id, folded),
        routeEditable: editable && !folded,
        routeHandles: editable && !folded && selectedEdgeId === e.id,
        spread: spreadOf(e),
      };
      return {
        id: e.id, source: e.from, target: e.to, type: "rsfFlow", selected: selectedEdgeId === e.id,
        // 끝 손잡이(R1)는 편집 모드에서 고른 선에만 — 접힌 분기가 이어 받은 선은 원래 끝이 아니라 옮길 수 없다. 나머지 선은 끝 손잡이를 그리지 않는다.
        reconnectable: !!onReconnect && editable && !folded && selectedEdgeId === e.id,
        markerEnd: { type: MarkerType.ArrowClosed },
        data,
      };
    });
  }, [flow, vflow, view, chips, overlay, eMarks, varDisplay, varLabels, selectedEdgeId, editable, debugging, valueAt, editingCondEdgeId, condEdge, dropEdge, onReconnect]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const dims = changes.filter((c): c is Extract<NodeChange, { type: "dimensions" }> => c.type === "dimensions" && !!c.dimensions);
    if (dims.length > 0) {
      setMeasured((cur) => {
        let next: Record<string, Measured> | null = null;
        for (const c of dims) {
          const { width, height } = c.dimensions!;
          if (cur[c.id]?.width === width && cur[c.id]?.height === height) continue;
          next ??= { ...cur };
          next[c.id] = { width, height };
        }
        return next ?? cur; // 같은 값이면 상태를 바꾸지 않는다(다시 그리기 반복 방지)
      });
    }
    const selects = changes.filter((c): c is Extract<NodeChange, { type: "select" }> => c.type === "select");
    if (selects.length > 0) {
      setRfSel((cur) => {
        const next = new Set(cur);
        for (const c of selects) {
          if (c.selected) next.add(c.id);
          else next.delete(c.id);
        }
        return next;
      });
    }
    const moved = changes.filter((c): c is Extract<NodeChange, { type: "position" }> => c.type === "position" && !!c.position);
    if (moved.length === 0) return;
    setDrag((d) => {
      const next = { ...d };
      for (const c of moved) next[c.id] = { x: c.position!.x, y: c.position!.y };
      return next;
    });
  }, []);

  /** 흐름 노드(룰·IF·병렬)만 선 위에 놓아 옮길 수 있다. */
  const isMovable = (n: Node) =>
    n.type === "rsfFlow" && !viewRef.current.blocks[n.id] && ["RULE", "IF", "PARALLEL"].includes(flowRef.current.nodes.find((x) => x.id === n.id)?.kind ?? "");
  const isSplit = (id: string) => ["IF", "PARALLEL"].includes(flowRef.current.nodes.find((x) => x.id === id)?.kind ?? "");
  /** 분기를 끄는 동안 블록 멤버가 같은 만큼 움직인 위치. 분기가 아니면 빈 맵. */
  const blockPositionsOf = (n: Node): Record<string, FlowPos> => {
    if (!isSplit(n.id)) return {};
    const base = fullPosOf();
    const from = base[n.id];
    if (!from) return {};
    return blockDragPositions(fullRef.current, n.id, { x: n.position.x - from.x, y: n.position.y - from.y }, base);
  };

  const onNodeDrag = useCallback((e: MouseEvent | TouchEvent, node: Node, dragged: Node[]) => {
    if (!editable) return;
    const block = blockPositionsOf(node);
    if (Object.keys(block).length > 0) {
      setDrag((d) => ({ ...d, ...block }));
    }
    if (dragged.length > 1 || !isMovable(node)) {
      setDropEdge(null);
      return;
    }
    const point = "touches" in e ? (e.touches[0] ?? e.changedTouches[0]) : e; // 손가락 끌기도 받는다
    if (!point) return;
    const p = rf.screenToFlowPosition({ x: point.clientX, y: point.clientY });
    setDropEdge(resolveNodeDrop(flowRef.current, posRef.current, node.id, { x: Math.round(p.x), y: Math.round(p.y) }, rf.getZoom()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable, rf, setDropEdge]);

  const onNodeDragStop = useCallback((_e: unknown, node: Node, dragged: Node[]) => {
    const target = dropEdgeRef.current;
    setDropEdge(null);
    if (!editable) return;
    const noteIds = new Set(flow.view.notes.map((n) => n.id));
    const moved: Record<string, FlowPos> = {};
    const movedNotes: Record<string, FlowPos> = {};
    for (const n of dragged) {
      const p = { x: Math.round(n.position.x), y: Math.round(n.position.y) };
      if (noteIds.has(n.id)) movedNotes[n.id] = p;
      else if (n.type === "rsfFlow") {
        moved[n.id] = p;
        for (const [id, bp] of Object.entries(blockPositionsOf(n))) moved[id] = { x: Math.round(bp.x), y: Math.round(bp.y) };
      }
    }
    if (Object.keys(moved).length === 0) {
      if (Object.keys(movedNotes).length > 0) onMove({}, movedNotes); // 메모만 끌었어도 놓을 때 한 번(B5)
      return;
    }
    if (target && dragged.length === 1 && isMovable(node)) {
      onMoveNode(node.id, target, moved);
      setDrag({}); // 옮기기가 거부돼 흐름이 그대로면 끌던 위치를 되돌린다(성공하면 새 흐름 위치가 정본)
    } else if (Object.keys(movedNotes).length > 0) onMove(moved, movedNotes);
    else onMove(moved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable, flow, onMove, onMoveNode, setDropEdge]);

  // 흐름이 바뀌면 없어진 요소를 선택에서 뺀다.
  useEffect(() => {
    setRfSel((cur) => {
      const alive = new Set<string>([...vflow.nodes.map((n) => n.id), ...flow.view.notes.map((n) => n.id), ...flow.view.groups.map((g) => g.id)]);
      const next = new Set([...cur].filter((id) => alive.has(id)));
      return next.size === cur.size ? cur : next;
    });
  }, [flow, vflow]);

  // 접어서 숨긴 노드·선을 가리키던 선택은 푼다 — 보이지 않는 대상에 Delete·복사·속성 편집이 적용되지 않게(D16).
  useEffect(() => {
    if (selectedId && view.hidden.has(selectedId)) onSelect(null);
    if (selectedEdgeId && !vflow.edges.some((e) => e.id === selectedEdgeId) && flow.edges.some((e) => e.id === selectedEdgeId)) onSelectEdge(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, selectedId, selectedEdgeId]);

  const lastSent = useRef("[]");
  useEffect(() => {
    if (!onSelectionChange) return;
    const ids = flow.nodes.filter((n) => rfSel.has(n.id)).map((n) => n.id); // 흐름 노드 순서
    if (ids.length === 0 && rfSel.size > 0) return; // 메모·그룹만 고름 — 올리지 않는다.
    const key = JSON.stringify(ids);
    if (key === lastSent.current) return;
    lastSent.current = key;
    onSelectionChange(ids);
  }, [rfSel, flow, onSelectionChange]);

  const onConnectCb = useCallback((c: Connection) => {
    if (editable && c.source && c.target) onConnect(c.source, c.target);
  }, [editable, onConnect]);

  // 선 끝 옮기기(R1) — 놓을 때 한 번. RF 는 끝이 제자리여도 부르므로 바뀐 끝이 있을 때만 올린다.
  const onReconnectCb = useCallback((old: Edge, c: Connection) => {
    if (!editable || !onReconnect || !c.source || !c.target) return;
    const end: { from?: string; to?: string } = {};
    if (c.source !== old.source) end.from = c.source;
    if (c.target !== old.target) end.to = c.target;
    if (end.from !== undefined || end.to !== undefined) onReconnect(old.id, end);
  }, [editable, onReconnect]);

  /** 흐름 좌표 상자가 지금 캔버스 화면 안에 모두 들어 있는가(E1 — focusReveal). */
  const inView = (x: number, y: number, w: number, h: number) => {
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box || box.width <= 0 || box.height <= 0) return false;
    const vp = rf.getViewport();
    const left = x * vp.zoom + vp.x;
    const top = y * vp.zoom + vp.y;
    return left >= 0 && top >= 0 && left + w * vp.zoom <= box.width && top + h * vp.zoom <= box.height;
  };

  // 이동 요청(focusSeq)이 올 때마다 focusId 노드로 옮기고 1.2초 깜빡인다. focusId 가 null 이면 깜빡임을 지운다.
  // focusReveal 이면 노드가 이미 화면 안에 다 보일 때 옮기지 않는다(디버그 커서 이동이 화면을 흔들지 않게).
  useEffect(() => {
    if (!focusId) {
      setFlashId(null);
      return;
    }
    // 접힌 블록 안 노드면 펼치지 않고 그 노드를 품은 접힌 블록으로 옮긴다(D16).
    const target = view.hidden.has(focusId) ? (Object.keys(view.blocks).find((id) => view.blocks[id].members.includes(focusId)) ?? focusId) : focusId;
    const n = vflow.nodes.find((x) => x.id === target);
    const p = pos[target];
    if (n && p) {
      const s = NODE_SIZE[view.blocks[target] ? "RULE" : n.kind];
      if (!(focusReveal && inView(p.x, p.y, s.w, s.h))) {
        void rf.setCenter(p.x + s.w / 2, p.y + s.h / 2, { zoom: rf.getZoom(), duration: 300 });
      }
    }
    setFlashId(null);
    const start = setTimeout(() => setFlashId(target), 0);
    const end = setTimeout(() => setFlashId((cur) => (cur === target ? null : cur)), FLASH_MS);
    return () => {
      clearTimeout(start);
      clearTimeout(end);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSeq, focusId]);

  // 처음 그릴 때는 ReactFlow 의 fitView 가 맞춘다. 그 뒤 [화면 맞춤](fitSignal)·세트 바꿈(fitKey)마다 맞춘다.
  // rf.fitView 는 노드를 다 잴 때까지 기다렸다 맞추므로 새 세트의 노드를 그리기 전에 불러도 된다.
  const lastFit = useRef({ signal: fitSignal, key: fitKey });
  useEffect(() => {
    const last = lastFit.current;
    if (last.signal === fitSignal && last.key === fitKey) return;
    lastFit.current = { signal: fitSignal, key: fitKey };
    void rf.fitView({ ...FIT_OPTIONS, duration: last.key === fitKey ? 200 : 0 });
  }, [fitSignal, fitKey, rf]);

  /** 화면 좌표 → 흐름 좌표(정수). */
  const flowAt = (clientX: number, clientY: number): FlowPos => {
    const p = rf.screenToFlowPosition({ x: clientX, y: clientY });
    return { x: Math.round(p.x), y: Math.round(p.y) };
  };

  // 선 경로 손잡이(C14) — 끌기·고른 손잡이는 캔버스 안 저장소에만 두고 놓을 때 한 번 올린다.
  const routeStore = useMemo(createRouteStore, []);
  const routeChangeRef = useRef(onRouteChange);
  routeChangeRef.current = onRouteChange;
  const flowAtRef = useRef(flowAt);
  flowAtRef.current = flowAt;
  const routeApi = useMemo<RouteApi>(() => {
    const removePoint = (edgeId: string, points: readonly FlowPos[], index: number) => {
      routeStore.sel = null;
      routeStore.emit();
      routeChangeRef.current?.(edgeId, points.filter((_, k) => k !== index).map((p) => ({ x: p.x, y: p.y })));
    };
    return {
      store: routeStore,
      removePoint,
      addPoint: (edgeId, points, source, target, clientX, clientY) => {
        routeChangeRef.current?.(edgeId, insertRoutePoint(points, source, target, flowAtRef.current(clientX, clientY)));
      },
      startDrag: (e, edgeId, index, points) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        wrapRef.current?.focus({ preventScroll: true });
        const original = points.map((p) => ({ x: p.x, y: p.y }));
        routeStore.sel = { edgeId, index };
        routeStore.drag = { edgeId, index, points: original };
        routeStore.emit();
        let moved = false;
        const onMoveEvt = (ev: MouseEvent) => {
          const at = flowAtRef.current(ev.clientX, ev.clientY);
          if (at.x === routeStore.drag?.points[index]?.x && at.y === routeStore.drag?.points[index]?.y) return;
          moved = true;
          const next = original.map((p) => ({ x: p.x, y: p.y }));
          next[index] = at;
          routeStore.drag = { edgeId, index, points: next };
          routeStore.emit();
        };
        const stop = () => {
          window.removeEventListener("pointermove", onMoveEvt);
          window.removeEventListener("pointerup", onUpEvt);
          window.removeEventListener("pointercancel", onCancelEvt);
        };
        const onUpEvt = () => {
          stop();
          const final = routeStore.drag?.points;
          routeStore.drag = null;
          routeStore.emit();
          if (moved && final) routeChangeRef.current?.(edgeId, final);
        };
        const onCancelEvt = () => {
          stop();
          routeStore.drag = null;
          routeStore.emit();
        };
        window.addEventListener("pointermove", onMoveEvt);
        window.addEventListener("pointerup", onUpEvt);
        window.addEventListener("pointercancel", onCancelEvt);
      },
    };
  }, [routeStore]);

  // 고른 손잡이는 편집 모드에서 그 선을 고르고 있는 동안, 그 점이 남아 있는 동안만 유지한다.
  useEffect(() => {
    const sel = routeStore.sel;
    if (!sel) return;
    const count = flow.view.routes?.[sel.edgeId]?.length ?? 0;
    if (!editable || selectedEdgeId !== sel.edgeId || sel.index >= count) {
      routeStore.sel = null;
      routeStore.emit();
    }
  }, [flow, editable, selectedEdgeId, routeStore]);

  // 손잡이를 고른 채 Delete·Backspace — page 의 delete 핸들러가 먼저 부른다. 점을 뺐으면 true, 이웃 점(없으면 선택 없음)을 고른 채로 둔다.
  useEffect(() => {
    if (!removeRoutePointRef) return;
    removeRoutePointRef.current = () => {
      const sel = routeStore.sel;
      const points = sel ? fullRef.current.view.routes?.[sel.edgeId] : undefined;
      if (!editable || !sel || !points || sel.index >= points.length) return false;
      routeApi.removePoint(sel.edgeId, points, sel.index);
      if (points.length > 1) routeStore.sel = { edgeId: sel.edgeId, index: Math.min(sel.index, points.length - 2) };
      routeStore.emit();
      return true;
    };
    return () => {
      removeRoutePointRef.current = null;
    };
  }, [removeRoutePointRef, editable, routeApi, routeStore]);

  useEffect(() => {
    if (!clearSelectionRef) return;
    clearSelectionRef.current = () => setRfSel((cur) => (cur.size === 0 ? cur : new Set()));
    return () => {
      clearSelectionRef.current = null;
    };
  }, [clearSelectionRef]);

  const carries = (e: DragEvent<HTMLDivElement>) => {
    const types = Array.from(e.dataTransfer?.types ?? []);
    return types.includes(PALETTE_MIME) || types.includes(RULE_MIME);
  };
  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!editable || !carries(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDropEdge(dropTargetAt(vflow, pos, flowAt(e.clientX, e.clientY), rf.getZoom()));
  };
  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    // 캔버스 안의 자식 사이를 오가는 것은 떠남이 아니다.
    if (!e.currentTarget.contains(e.relatedTarget as globalThis.Node | null)) setDropEdge(null);
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    if (!editable || !e.dataTransfer) return;
    const item = e.dataTransfer.getData(PALETTE_MIME);
    const ruleId = e.dataTransfer.getData(RULE_MIME);
    const isPalette = PALETTE_ITEMS.includes(item);
    setDropEdge(null);
    if (!isPalette && !ruleId) return;
    e.preventDefault();
    const at = flowAt(e.clientX, e.clientY);
    const edgeId = dropTargetAt(vflow, pos, at, rf.getZoom());
    if (isPalette) onDropPalette(item as PaletteItem, at, edgeId);
    else onDropRule(ruleId, edgeId);
  };

  // 우클릭 — 모든 모드. 메모·그룹은 빈 곳 메뉴로 연다.
  const openMenu = (e: ReactMouseEvent | MouseEvent, target: MenuTarget) => {
    e.preventDefault();
    onContextMenu(target, { x: e.clientX, y: e.clientY });
  };
  const onNodeContextMenu = (e: ReactMouseEvent, n: Node) =>
    openMenu(e, n.type === "rsfFlow" ? { kind: "node", nodeId: n.id } : { kind: "pane", at: flowAt(e.clientX, e.clientY) });
  const onEdgeContextMenu = (e: ReactMouseEvent, ed: Edge) => openMenu(e, { kind: "edge", edgeId: ed.id, via: "context" });
  const onPaneContextMenu = (e: ReactMouseEvent | MouseEvent) => openMenu(e, { kind: "pane", at: flowAt(e.clientX, e.clientY) });

  // [+] 단추 — 선 이름표 층의 단추를 틀에서 위임으로 받는다(단추 아래 왼쪽에 메뉴를 연다).
  // 이름표 층은 React 트리에서 선 컴포넌트 안이라 누르기가 선 누르기(선 선택)로 번진다 — 틀의 캡처 단계에서 받아 끊는다.
  const onClickCapture = (e: ReactMouseEvent<HTMLDivElement>) => {
    const btn = (e.target as Element | null)?.closest?.("[data-edge-id]");
    const edgeId = btn?.getAttribute("data-edge-id");
    if (!btn || !edgeId) return;
    e.stopPropagation();
    const r = btn.getBoundingClientRect();
    onContextMenu({ kind: "edge", edgeId, via: "plus" }, { x: r.left, y: r.bottom });
  };

  // 조건 갈래 이름표를 두 번 누르면 조건식 입력 칸(B10, P-D17). 이름표는 선 데이터에 콜백이 없어 틀에서 위임으로 받는다.
  const onDoubleClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!editable) return;
    const id = (e.target as Element | null)?.closest?.("[data-cond-edge]")?.getAttribute("data-cond-edge");
    if (id) setCondEdge(id);
  };

  return (
    <CondEditContext.Provider value={condActions}>
    <RouteContext.Provider value={routeApi}>
    <div
      ref={wrapRef}
      className="rsf-canvas"
      data-testid="flow-canvas"
      data-mode={mode}
      tabIndex={0}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClickCapture={onClickCapture}
      onDoubleClick={onDoubleClick}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        nodesDraggable={editable}
        nodesConnectable={editable}
        disableKeyboardA11y
        elementsSelectable
        deleteKeyCode={null}
        selectionKeyCode={editable ? "Shift" : null}
        multiSelectionKeyCode={editable ? MULTI_KEYS : null}
        fitView
        fitViewOptions={FIT_OPTIONS}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        proOptions={{ hideAttribution: true }}
        onNodesChange={onNodesChange}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnectCb}
        onReconnect={editable && onReconnect ? onReconnectCb : undefined}
        edgesReconnectable={false}
        onNodeClick={(_e, n) => onSelect(n.id)}
        onEdgeClick={(_e, ed) => onSelectEdge(ed.id)}
        onPaneClick={() => {
          onSelect(null);
          onSelectEdge(null);
        }}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
      >
        {/* 오른쪽 아래 — 확대·축소 단추 줄 위에 미니맵(D14) */}
        <Controls position="bottom-right" orientation="horizontal" showInteractive={false} />
        {showMiniMap && <MiniMap position="bottom-right" style={MINIMAP_STYLE} pannable zoomable />}
      </ReactFlow>
    </div>
    </RouteContext.Provider>
    </CondEditContext.Provider>
  );
}

export function FlowCanvas(props: FlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  );
}
