"use client";

/**
 * 룰 세트 흐름 캔버스(2단계 계획 Task 9) — React Flow 로 흐름을 그리는 표현 컴포넌트.
 * 상태를 갖지 않는다(선택·확대는 React Flow 내부, 끌던 중 위치만 잠깐 들고 있다). 편집은 모두 콜백으로 올린다.
 * 부모가 편집 모드일 때만 `mode="edit"` 로 부른다. 보기 모드는 끌기·연결이 꺼지고 선택만 된다.
 * 편집 모드에서는 여러 노드를 고를 수 있다 — Shift(또는 Cmd·Ctrl)+누르기로 더하기, 빈 곳 끌기 상자(부분 포함). 고른 흐름 노드 ID 목록은 `onSelectionChange` 로 올린다(Ruling 11).
 * 편집 모드 화면 이동은 Figma 방식이다(S1, Ruling 21) — 스페이스+끌기·가운데 버튼 끌기·두 손가락 스크롤, 확대는 핀치·Ctrl/Cmd+휠. 보기·디버그 모드는 끌기 = 화면 이동 그대로다.
 *
 * 공간 넓히기(S1): 편집 모드에서 [공간] 토글(`spaceTool`)이 켜졌거나 Alt 를 누른 채 빈 곳(pane)을 끌면, 누른 자리를 기준으로 처음 6px 을 넘는 순간
 * 주축으로 방향을 정하고 기준선 너머(상자 좌상단 기준)의 노드·메모·꺾는 점을 화면에서만 옮긴다. 미리보기는 캔버스 안 저장소(`SpaceStore`)에만 두고
 * 놓을 때 `onShiftSpace` 를 한 번 부른다(page 는 끌기 중 다시 그리지 않는다). 누르기는 캡처 단계에서 끊어 React Flow 의 화면 이동·영역 선택이 시작되지 않는다.
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
 *
 * 선 [+]·이름표 옮기기(L1): 편집 모드의 [+] 는 그 선에 마우스가 올라가 있거나(선·라벨·칩·[+] 위, 떠난 뒤 150ms 유예) 그 선을 골랐을 때,
 * 또는 끌어 끼우기 대상일 때만 그린다. hover 는 캔버스 안 저장소(`HoverStore`)에 두고 선마다 "내가 올려진 선인가" 만 구독한다(page 는 그대로).
 * 편집 모드에서 조건 라벨·변수 칩 묶음을 화면 4px 넘게 끌면 옮긴다 — 끄는 동안은 캔버스 안 저장소(`LabelStore`)에만 두고 놓을 때
 * `onLabelOffsetChange` 를 한 번 부른다. 오프셋(`view.labels`)은 기본 자리에서의 흐름 좌표 거리라 선 끝이 움직여도 따라간다(보기·디버그 모드도 그대로 그린다).
 */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore,
  type DragEvent, type MutableRefObject, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent,
} from "react";

import { IconPlus } from "@tabler/icons-react";

import type { RuleSetFlow, TypedValue } from "@/contract/engine-contract.generated";

import { MAX_LABEL_OFFSET, type FlowNote, type FlowPos, type EditFlow, type LabelOffset, type LabelPart } from "../flow-edit";
import { NODE_SIZE, beyondLine, drawnPositions, foldOffsetX, spaceMinDelta, type SpaceAxis, type SpaceBlocks } from "../flow-layout";
import { typedText } from "../trace-view";
import { blockDragPositions, dropTargetAt, edgeChips, edgeMarks, nodeMarks, resolveNodeDrop } from "../flow-vars";
import type { FlowMode } from "../state/useRuleSetEdit";
import type { RuleIoMap, RuleSetCheck } from "../types";
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
  SelectionMode,
  ViewportPortal,
  getSmoothStepPath,
  useReactFlow,
  useStore,
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
/** 선에서 [+] 로 옮겨 가는 사이 [+] 를 남겨 두는 시간(ms, L1). */
export const ADD_HOVER_GRACE_MS = 150;
/** 이 화면 거리(px) 미만으로 움직이고 놓으면 라벨·칩 끌기가 아니다(두 번 누르기·툴팁 그대로, L1). */
export const LABEL_DRAG_THRESHOLD_PX = 4;
/** 선 경로 모서리 반경(C14). */
const ROUTE_RADIUS = 8;
/** 경로가 있는 선의 변수 칩을 가운데 라벨 아래로 띄우는 거리(px). */
const ROUTE_CHIP_GAP = 20;
/**
 * 같은 두 노드를 잇는 경로 없는 선들(빈 갈래 둘인 분기 등)은 그림이 같아 라벨·[+] 가 한 자리에 겹친다 — 이름표 묶음을 가로로 이만큼씩 벌린다(px).
 * 라벨(약 50px)과 오른쪽 [+](ADD_LABEL_GAP)가 이웃 묶음과 닿지 않는 폭이다.
 */
const LABEL_SPREAD = 120;

type Measured = { width: number; height: number };

export interface FlowCanvasProps {
  flow: EditFlow;
  rules: RuleIoMap;
  checks: readonly RuleSetCheck[];
  mode: FlowMode;
  showVars: boolean;
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
  /**
   * 조건 라벨·변수 칩 묶음을 끌어 놓음(L1) — 기본 자리에서의 새 오프셋(흐름 좌표, ±600 으로 자른 정수). 끄는 동안은 부르지 않고 놓을 때 한 번,
   * 임계값(화면 4px) 미만이거나 처음 오프셋 그대로면 부르지 않는다. 편집 모드에서만 부른다.
   */
  onLabelOffsetChange?: (edgeId: string, part: LabelPart, off: LabelOffset | null) => void;
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
  /** [공간] 토글(S1) — 켜져 있으면 편집 모드의 빈 곳 끌기가 공간 넓히기다(영역 선택보다 이긴다). */
  spaceTool?: boolean;
  /** 공간 넓히기 끌기를 놓으면(방향 미확정·0 이어도) 토글이 켜져 있었을 때 false 로 부른다 — 한 번 쓰면 꺼진다. */
  onSpaceToolChange?: (on: boolean) => void;
  /**
   * 공간 넓히기를 놓음(S1) — 방향이 정해지고 delta 가 0 이 아닐 때만 한 번. drawn 은 지금 그린 위치 전체(보이는 노드는 그린 상자 좌상단,
   * 숨은 멤버는 블록과 맞춘 전체 흐름 자리), blocks 는 접힌 블록이다. page 는 `shiftSpace` 로 편집 한 번을 만든다.
   */
  onShiftSpace?: (axis: SpaceAxis, at: number, delta: number, drawn: Record<string, FlowPos>, blocks: SpaceBlocks) => void;
}

/** 편집 모드 다중 선택 키 — 누르기로 더하기. */
const MULTI_KEYS = ["Shift", "Meta", "Control"];
/** 편집 모드 화면 이동 마우스 단추 — 가운데(1)만. 왼쪽 끌기는 영역 선택, 오른쪽은 메뉴(S1). */
const EDIT_PAN_BUTTONS = [1];
/** 공간 넓히기 방향을 정하는 화면 거리(px). */
export const SPACE_THRESHOLD_PX = 6;

type EdgeData = {
  label: string | null;
  /** 지금 조건식(B10 입력 칸의 처음 값). */
  cond: string | null;
  chips: string[];
  state: EdgeState | undefined;
  mark: "REJECT" | "WARN" | undefined;
  showVars: boolean;
  /** 끄는 동안 놓일 선(A1·A2 — Task 7 이 채운다). */
  dropTarget: boolean;
  /** 편집 모드 — 선 가운데 [+] 단추(그 선에 올리거나 고르거나 끼우기 대상일 때만 그린다, L1). */
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
  /** 저장된 조건 라벨 오프셋(L1, 흐름 좌표). 접힌 분기가 이어 받은 선·옮기지 않은 선은 null. */
  labelOff: LabelOffset | null;
  /** 저장된 변수 칩 묶음 오프셋(L1). */
  chipsOff: LabelOffset | null;
  /** 편집 모드이고 접힌 분기가 이어 받은 선이 아님 — 라벨·칩을 끌어 옮길 수 있다(L1). */
  labelsMovable: boolean;
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

/** 변수 칩 툴팁(E3) — 값이 만들어졌으면 `이름 = 값`, 아직이면 `이름 · 아직 없음`. valueOf 가 없으면(디버그 모드가 아니거나 낡은 기록) 툴팁이 없다. */
function chipTitle(name: string, valueOf: EdgeData["valueOf"]): string | undefined {
  if (!valueOf) return undefined;
  const v = valueOf(name);
  return v === undefined ? `${name} · 아직 없음` : `${name} = ${typedText(v)}`;
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

/**
 * 선 hover 저장소(L1) — 편집 모드 [+] 표시용. 선마다 "내가 올려진 선인가" 만 구독하므로 바뀐 선만 다시 그린다(다른 선·page 는 그대로).
 * 떠날 때는 ADD_HOVER_GRACE_MS 뒤에 비운다 — 그 사이 같은 선의 라벨·칩·[+] 에 들어오면 취소된다(선 g 와 이름표 층은 다른 DOM 이다).
 */
interface HoverStore {
  edgeId: string | null;
  enter(edgeId: string): void;
  leave(edgeId: string): void;
  /** 유예 타이머를 끄고 비운다(편집 모드를 떠날 때·언마운트). */
  reset(): void;
  subscribe(cb: () => void): () => void;
}
function createHoverStore(): HoverStore {
  const listeners = new Set<() => void>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const stopTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const store: HoverStore = {
    edgeId: null,
    enter: (edgeId) => {
      stopTimer();
      if (store.edgeId === edgeId) return;
      store.edgeId = edgeId;
      listeners.forEach((cb) => cb());
    },
    leave: (edgeId) => {
      if (store.edgeId !== edgeId) return;
      stopTimer();
      timer = setTimeout(() => {
        timer = null;
        if (store.edgeId !== edgeId) return;
        store.edgeId = null;
        listeners.forEach((cb) => cb());
      }, ADD_HOVER_GRACE_MS);
    },
    reset: () => {
      stopTimer();
      if (store.edgeId === null) return;
      store.edgeId = null;
      listeners.forEach((cb) => cb());
    },
    subscribe: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
  return store;
}
const HoverContext = createContext<HoverStore | null>(null);

/** 라벨·칩 끌기 저장소(L1) — 끄는 동안의 오프셋. 선 하나만 구독해 그 선만 다시 그린다(page 는 그대로). */
interface LabelDrag {
  edgeId: string;
  part: LabelPart;
  off: LabelOffset;
}
interface LabelStore {
  drag: LabelDrag | null;
  subscribe(cb: () => void): () => void;
  emit(): void;
}
function createLabelStore(): LabelStore {
  const listeners = new Set<() => void>();
  return {
    drag: null,
    subscribe: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    emit: () => listeners.forEach((cb) => cb()),
  };
}
interface LabelApi {
  store: LabelStore;
  /** 라벨·칩 누르기 — 임계값을 넘으면 끌기, 놓을 때 한 번 올린다. base 는 지금 저장된 오프셋. */
  startDrag(e: ReactPointerEvent, edgeId: string, part: LabelPart, base: LabelOffset): void;
}
const LabelContext = createContext<LabelApi | null>(null);
const ZERO_OFFSET: LabelOffset = Object.freeze({ dx: 0, dy: 0 });
const clampLabelOffset = (n: number) => Math.max(-MAX_LABEL_OFFSET, Math.min(MAX_LABEL_OFFSET, Math.round(n)));

/** 공간 넓히기 미리보기(S1) — 방향이 정해진 뒤의 기준선·이동량. 끄는 동안 캔버스·선·기준선만 구독해 다시 그린다(page 는 그대로). */
interface SpaceShift {
  axis: SpaceAxis;
  at: number;
  delta: number;
}
interface SpaceStore {
  shift: SpaceShift | null;
  subscribe(cb: () => void): () => void;
  emit(): void;
}
function createSpaceStore(): SpaceStore {
  const listeners = new Set<() => void>();
  return {
    shift: null,
    subscribe: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    emit: () => listeners.forEach((cb) => cb()),
  };
}
const SpaceContext = createContext<SpaceStore | null>(null);
/** 기준선 너머면 delta 만큼 옮긴 점(아니면 그대로). */
function shifted(s: SpaceShift | null, p: FlowPos): FlowPos {
  if (!s || s.delta === 0 || !beyondLine(s.axis, s.at, p)) return p;
  return s.axis === "x" ? { x: p.x + s.delta, y: p.y } : { x: p.x, y: p.y + s.delta };
}

/** 끄는 동안의 기준선(점선) — 흐름 좌표 층에 그리고, 굵기는 배율로 나눠 화면에서 1.5px 로 보이게 한다. */
function SpaceGuide({ store }: { store: SpaceStore }) {
  const s = useSyncExternalStore(store.subscribe, () => store.shift, () => null);
  const zoom = useStore((st) => st.transform[2]);
  if (!s) return null;
  const w = 1.5 / (zoom > 0 ? zoom : 1);
  const style: React.CSSProperties = s.axis === "x" ? { left: s.at, borderLeftWidth: w } : { top: s.at, borderTopWidth: w };
  return (
    <ViewportPortal>
      <div className="rsf-space-guide" data-testid="flow-space-guide" data-axis={s.axis} style={style} />
    </ViewportPortal>
  );
}

function FlowEdgeView(props: EdgeProps<FlowRfEdge>) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected } = props;
  const routeApi = useContext(RouteContext);
  const spaceStore = useContext(SpaceContext);
  const hoverStore = useContext(HoverContext);
  const labelApi = useContext(LabelContext);
  // [+] 표시(L1) — 이 선이 올려진 선인지만 구독한다.
  const hovered = useSyncExternalStore(
    hoverStore ? hoverStore.subscribe : NO_SUBSCRIBE,
    () => hoverStore?.edgeId === id,
    () => false,
  );
  // 끄는 중인 이름표(L1) — 이 선의 끌기만 구독한다.
  const labelDrag = useSyncExternalStore(
    labelApi ? labelApi.store.subscribe : NO_SUBSCRIBE,
    () => (labelApi?.store.drag?.edgeId === id ? labelApi.store.drag : null),
    () => null,
  );
  // 공간 넓히기 미리보기 — 이 선의 꺾는 점 가운데 기준선 너머가 있을 때만 구독 값이 바뀐다(다른 선은 다시 그리지 않는다).
  const spaceShift = useSyncExternalStore(
    spaceStore ? spaceStore.subscribe : NO_SUBSCRIBE,
    () => {
      const sh = spaceStore?.shift ?? null;
      return sh && sh.delta !== 0 && data?.route?.some((p) => beyondLine(sh.axis, sh.at, p)) ? sh : null;
    },
    () => null,
  );
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
  const baseRoute = dragged ?? data?.route ?? null;
  const route = spaceShift && baseRoute ? baseRoute.map((p) => shifted(spaceShift, p)) : baseRoute;
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
  const chips = data?.showVars ? (data.chips ?? []) : [];
  const at = (x: number, y: number) => ({ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)` });
  const addX = data?.label ? lx + ADD_LABEL_GAP : lx;
  // 이름표 오프셋(L1) — 끄는 중이면 그 값, 아니면 저장된 값. 기본 자리에 더한다.
  const labelOff = (labelDrag?.part === "label" ? labelDrag.off : data?.labelOff) ?? ZERO_OFFSET;
  const chipsOff = (labelDrag?.part === "chips" ? labelDrag.off : data?.chipsOff) ?? ZERO_OFFSET;
  const chipBase = route && route.length > 0 ? { x: lx, y: ly + ROUTE_CHIP_GAP } : { x: sourceX, y: sourceY + 20 };
  const movable = !!data?.labelsMovable && !!labelApi;
  const dragProps = (part: LabelPart, base: LabelOffset | null) =>
    movable ? { onPointerDown: (e: ReactPointerEvent) => labelApi!.startDrag(e, id, part, base ?? ZERO_OFFSET) } : {};
  // 선·라벨·칩·[+] 에 마우스를 올리면 이 선이 올려진 선이다(L1). 편집 모드에서만 단다.
  const hoverProps = data?.insertable && hoverStore
    ? { onMouseEnter: () => hoverStore.enter(id), onMouseLeave: () => hoverStore.leave(id) }
    : {};
  const showAdd = !!data?.insertable && (hovered || !!selected || !!data.dropTarget);
  return (
    <>
      <g
        {...hoverProps}
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
            <div className="rsf-elabel" style={at(lx + labelOff.dx, ly + labelOff.dy)}>
              <span
                className={
                  "rsf-branch" + (data.condEditable ? " rsf-cond-label nopan" : "") + (movable ? " rsf-elabel-drag nodrag nopan nokey" : "")
                }
                data-testid={`flow-edge-label-${id}`}
                data-state={state ?? "idle"}
                data-cond-edge={data.condEditable ? id : undefined}
                data-dragging={labelDrag?.part === "label" ? "true" : undefined}
                title={data.condEditable ? (movable ? "끌어 옮기고, 두 번 눌러 조건식을 고친다" : "두 번 눌러 조건식을 고친다") : movable ? "끌어 옮긴다" : undefined}
                {...hoverProps}
                {...dragProps("label", data.labelOff)}
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
          <div className="rsf-elabel rsf-elabel-chips" style={at(chipBase.x + chipsOff.dx, chipBase.y + chipsOff.dy)}>
            <span
              className={movable ? "rsf-vchips rsf-elabel-drag nodrag nopan nokey" : "rsf-vchips"}
              data-testid={`flow-edge-chips-${id}`}
              data-dragging={labelDrag?.part === "chips" ? "true" : undefined}
              title={movable ? "끌어 옮긴다" : undefined}
              {...hoverProps}
              {...dragProps("chips", data?.chipsOff ?? null)}
            >
              {chips.map((c) => (
                <span key={c} className="rsf-vchip" title={chipTitle(c, data?.valueOf)}>
                  {c}
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
        {showAdd && (
          <button
            type="button"
            className="rsf-edge-add nodrag nopan"
            style={at(addX, ly)}
            data-testid={`flow-edge-add-${id}`}
            data-edge-id={id}
            aria-label="선에 넣기"
            title="선에 넣기"
            {...hoverProps}
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
    flow, rules, checks, mode, showVars, selectedId, selectedEdgeId, overlay, focusId, focusSeq, focusReveal, fitSignal, fitKey,
    breakpoints, collapsed, valueAt, showMiniMap, editingCondEdgeId,
    onSelect, onSelectEdge, onOpenRule, onMove, onMoveNode, onConnect, onReconnect, onDropPalette, onDropRule, onNoteChange, onContextMenu, onToggleBreakpoint,
    onEditCond, onRouteChange, onLabelOffsetChange, removeRoutePointRef, clearSelectionRef, onEditCondClose, onSelectionChange,
    spaceTool, onSpaceToolChange, onShiftSpace,
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
  // 공간 넓히기 미리보기(S1) — 캔버스 안 저장소를 구독한다. 배치(dagre)는 다시 돌지 않고 너머 좌표만 옮긴다.
  const spaceStore = useMemo(createSpaceStore, []);
  const space = useSyncExternalStore(spaceStore.subscribe, () => spaceStore.shift, () => null);
  const pos = useMemo(() => {
    const p: Record<string, FlowPos> = { ...basePos, ...drag };
    if (space && space.delta !== 0) for (const id of Object.keys(p)) p[id] = shifted(space, p[id]);
    return p;
  }, [basePos, drag, space]);
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
        id: note.id, type: "rsfNote", position: shifted(space, { x: drag[note.id]?.x ?? note.x, y: drag[note.id]?.y ?? note.y }),
        width: note.w, height: note.h, measured: measured[note.id], data, draggable: editable, connectable: false, selected: rfSel.has(note.id),
      });
    }
    return out;
  }, [flow, vflow, view, pos, drag, space, rules, marks, overlay, selectedId, flashId, editable, debugging, breakpoints, onOpenRule, onToggleBreakpoint, onNoteChange, rfSel, measured]);

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
        label, cond: e.cond, chips: chips[e.id] ?? [], state: overlay?.edges[e.id], mark: eMarks[e.id], showVars,
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
        // 이름표 오프셋(L1) — 접힌 분기가 이어 받은 선은 원래 선의 자리라 쓰지 않는다(경로와 같다).
        labelOff: folded ? null : (flow.view.labels?.[e.id]?.label ?? null),
        chipsOff: folded ? null : (flow.view.labels?.[e.id]?.chips ?? null),
        labelsMovable: editable && !folded,
      };
      return {
        id: e.id, source: e.from, target: e.to, type: "rsfFlow", selected: selectedEdgeId === e.id,
        // 끝 손잡이(R1)는 편집 모드에서 고른 선에만 — 접힌 분기가 이어 받은 선은 원래 끝이 아니라 옮길 수 없다. 나머지 선은 끝 손잡이를 그리지 않는다.
        reconnectable: !!onReconnect && editable && !folded && selectedEdgeId === e.id,
        markerEnd: { type: MarkerType.ArrowClosed },
        data,
      };
    });
  }, [flow, vflow, view, chips, overlay, eMarks, showVars, selectedEdgeId, editable, debugging, valueAt, editingCondEdgeId, condEdge, dropEdge, onReconnect]);

  /** 영역 선택(상자 끌기) 중인가 — onSelectionStart~onSelectionEnd. */
  const boxingRef = useRef(false);
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
    // 영역 선택 중에는 그룹 틀을 고르지 않는다(부분 포함 상자가 그룹 틀까지 걸어 선택 상자가 커지지 않게). 그룹 제목 누르기 선택은 그대로다.
    const groupIds = boxingRef.current ? new Set(fullRef.current.view.groups.map((g) => g.id)) : null;
    const selects = changes.filter(
      (c): c is Extract<NodeChange, { type: "select" }> => c.type === "select" && !(groupIds?.has(c.id) && c.selected),
    );
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

  /**
   * 접힌 분기를 그린 자리(splitAt, 접힌 상자 좌상단이면 folded)에 맞추려면 전체 흐름 자리에 더할 이동량 — 블록 끌기(blockPositionsOf)와
   * 공간 넓히기(spaceDrawn)가 같은 기준을 쓴다(Minor C: 접힌 상자는 제 상자와 가운데·위를 맞춘다).
   */
  const blockDelta = (splitId: string, splitAt: FlowPos, fullAt: FlowPos, folded: boolean): FlowPos => {
    const kind = fullRef.current.nodes.find((x) => x.id === splitId)?.kind;
    const fold = folded && kind ? foldOffsetX(kind) : 0;
    return { x: splitAt.x + fold - fullAt.x, y: splitAt.y - fullAt.y };
  };

  /** 흐름 노드(룰·IF·병렬)만 선 위에 놓아 옮길 수 있다. */
  const isMovable = (n: Node) =>
    n.type === "rsfFlow" && !viewRef.current.blocks[n.id] && ["RULE", "IF", "PARALLEL"].includes(flowRef.current.nodes.find((x) => x.id === n.id)?.kind ?? "");
  const isSplit = (id: string) => ["IF", "PARALLEL"].includes(flowRef.current.nodes.find((x) => x.id === id)?.kind ?? "");
  /**
   * 분기를 끄는 동안 블록 멤버가 같은 만큼 움직인 위치. 분기가 아니면 빈 맵.
   * 접힌 분기는 접힌 상자(룰 크기) 좌상단을 끌므로 전체 흐름 좌상단을 같은 기준(가운데 맞춤, foldOffsetX)으로 바꿔 이동량을 잰다 —
   * 그래야 펼쳤을 때 끈 만큼 가고, 분기 자신은 제 크기 기준 좌표로 적힌다(Minor C).
   */
  const blockPositionsOf = (n: Node): Record<string, FlowPos> => {
    if (!isSplit(n.id)) return {};
    const base = fullPosOf();
    const from = base[n.id];
    if (!from) return {};
    return blockDragPositions(fullRef.current, n.id, blockDelta(n.id, n.position, from, !!viewRef.current.blocks[n.id]), base);
  };

  const onNodeDrag = useCallback((e: MouseEvent | TouchEvent, node: Node, dragged: Node[]) => {
    if (!editable) return;
    // 분기 자신은 React Flow 가 준 위치(그린 상자 좌상단) 그대로 둔다 — 블록 위치의 분기 값은 저장 기준(접힌 분기면 foldOffsetX 만큼 다르다).
    const block = blockPositionsOf(node);
    delete block[node.id];
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

  // 선 hover(L1) — [+] 표시용. 편집 모드를 떠나거나 언마운트하면 비운다(유예 타이머 포함).
  const hoverStore = useMemo(createHoverStore, []);
  useEffect(() => {
    if (!editable) hoverStore.reset();
  }, [editable, hoverStore]);
  useEffect(() => () => hoverStore.reset(), [hoverStore]);

  // 라벨·칩 끌기(L1) — 끄는 동안은 labelStore 에만 두고 놓을 때 onLabelOffsetChange 를 한 번 부른다.
  const labelStore = useMemo(createLabelStore, []);
  const labelChangeRef = useRef(onLabelOffsetChange);
  labelChangeRef.current = onLabelOffsetChange;
  const editableRef = useRef(editable);
  editableRef.current = editable;
  const labelDragRef = useRef<{ stop: () => void } | null>(null);
  const labelApi = useMemo<LabelApi>(() => ({
    store: labelStore,
    startDrag: (e, edgeId, part, base) => {
      if (e.button !== 0 || !editableRef.current) return;
      labelDragRef.current?.stop();
      const sx = e.clientX;
      const sy = e.clientY;
      let dragging = false;
      const onMoveEvt = (ev: MouseEvent) => {
        // 단추가 모두 떨어진 채 움직이면 pointerup 을 잃은 것이다(창 밖에서 놓음) — 기록 없이 버린다.
        if (ev.buttons === 0) {
          finish(false);
          return;
        }
        const dx = ev.clientX - sx;
        const dy = ev.clientY - sy;
        if (!dragging) {
          if (Math.hypot(dx, dy) < LABEL_DRAG_THRESHOLD_PX) return;
          dragging = true;
        }
        const k = rf.getZoom() || 1;
        const off = { dx: clampLabelOffset(base.dx + dx / k), dy: clampLabelOffset(base.dy + dy / k) };
        const cur = labelStore.drag;
        if (cur && cur.off.dx === off.dx && cur.off.dy === off.dy) return;
        labelStore.drag = { edgeId, part, off };
        labelStore.emit();
      };
      const finish = (commit: boolean) => {
        stop();
        const d = labelStore.drag;
        if (!d) return;
        labelStore.drag = null;
        labelStore.emit();
        if (commit && editableRef.current && (d.off.dx !== base.dx || d.off.dy !== base.dy)) labelChangeRef.current?.(edgeId, part, d.off);
      };
      const onUpEvt = () => finish(true);
      const onCancelEvt = () => finish(false);
      const stop = () => {
        labelDragRef.current = null;
        window.removeEventListener("pointermove", onMoveEvt);
        window.removeEventListener("pointerup", onUpEvt);
        window.removeEventListener("pointercancel", onCancelEvt);
      };
      labelDragRef.current = { stop };
      window.addEventListener("pointermove", onMoveEvt);
      window.addEventListener("pointerup", onUpEvt);
      window.addEventListener("pointercancel", onCancelEvt);
    },
  }), [labelStore, rf]);
  // 편집 모드를 떠나거나 언마운트하면 끌던 이름표를 버린다.
  useEffect(() => {
    if (editable) return;
    labelDragRef.current?.stop();
    if (labelStore.drag) {
      labelStore.drag = null;
      labelStore.emit();
    }
  }, [editable, labelStore]);
  useEffect(() => () => labelDragRef.current?.stop(), []);

  useEffect(() => {
    if (!clearSelectionRef) return;
    clearSelectionRef.current = () => setRfSel((cur) => (cur.size === 0 ? cur : new Set()));
    return () => {
      clearSelectionRef.current = null;
    };
  }, [clearSelectionRef]);

  // 공간 넓히기(S1) — 누른 자리·방향·줄이기 한계는 끄는 동안만 ref 에 둔다. 미리보기는 spaceStore 로만 알린다.
  const spaceToolRef = useRef(!!spaceTool);
  spaceToolRef.current = !!spaceTool;
  const spaceCbRef = useRef({ onShiftSpace, onSpaceToolChange });
  spaceCbRef.current = { onShiftSpace, onSpaceToolChange };
  const spaceDragRef = useRef<{ stop: () => void } | null>(null);
  /**
   * 놓을 때 넘길 그린 위치 전체 — 보이는 노드는 그린 상자 좌상단(basePos), 숨은 멤버는 전체 흐름 자리를 블록(접힌 분기)의
   * 저장 기준 자리에 맞춘 값(블록 끌기 blockPositionsOf 와 같은 기준). 접힌 블록이 없으면 전체 배치를 다시 계산하지 않는다.
   */
  const spaceDrawn = (): Record<string, FlowPos> => {
    const base = basePosRef.current;
    const out: Record<string, FlowPos> = { ...base };
    const blocks = viewRef.current.blocks;
    if (Object.keys(blocks).length === 0) return out;
    const full = fullPosOf();
    for (const [sid, b] of Object.entries(blocks)) {
      const sp = base[sid];
      const fp = full[sid];
      if (!sp || !fp) continue;
      const d = blockDelta(sid, sp, fp, true);
      for (const m of b.members) if (m !== sid && full[m]) out[m] = { x: full[m].x + d.x, y: full[m].y + d.y };
    }
    return out;
  };
  const startSpaceDrag = (clientX: number, clientY: number) => {
    spaceDragRef.current?.stop();
    const origin = rf.screenToFlowPosition({ x: clientX, y: clientY });
    const toolWasOn = spaceToolRef.current;
    let axis: SpaceAxis | null = null;
    let at = 0;
    let min: number | null = null;
    const onMoveEvt = (ev: MouseEvent) => {
      // 단추가 모두 떨어진 채 움직이면 pointerup 을 잃은 것이다(창 밖에서 놓음) — 기록 없이 버린다(리뷰 Minor 2).
      if (ev.buttons === 0) {
        finish(false);
        return;
      }
      const dx = ev.clientX - clientX;
      const dy = ev.clientY - clientY;
      if (!axis) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < SPACE_THRESHOLD_PX) return;
        axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
        at = Math.round(axis === "x" ? origin.x : origin.y);
        min = spaceMinDelta(fullRef.current, axis, at, basePosRef.current, viewRef.current.blocks);
      }
      const zoom = rf.getZoom() || 1;
      const raw = Math.round((axis === "x" ? dx : dy) / zoom);
      const delta = min === null ? 0 : Math.max(raw, min);
      const cur = spaceStore.shift;
      if (cur && cur.axis === axis && cur.at === at && cur.delta === delta) return;
      spaceStore.shift = { axis, at, delta };
      spaceStore.emit();
    };
    const finish = (commit: boolean) => {
      stop();
      const s = spaceStore.shift;
      spaceStore.shift = null;
      spaceStore.emit();
      const { onShiftSpace: shift, onSpaceToolChange: toolChange } = spaceCbRef.current;
      if (toolWasOn) toolChange?.(false);
      if (commit && s && s.delta !== 0) shift?.(s.axis, s.at, s.delta, spaceDrawn(), viewRef.current.blocks);
    };
    const onUpEvt = () => finish(true);
    const onCancelEvt = () => finish(false);
    const stop = () => {
      spaceDragRef.current = null;
      window.removeEventListener("pointermove", onMoveEvt);
      window.removeEventListener("pointerup", onUpEvt);
      window.removeEventListener("pointercancel", onCancelEvt);
    };
    spaceDragRef.current = { stop };
    window.addEventListener("pointermove", onMoveEvt);
    window.addEventListener("pointerup", onUpEvt);
    window.addEventListener("pointercancel", onCancelEvt);
  };
  // 언마운트·모드가 편집이 아니게 되면 끌던 공간 넓히기를 버린다.
  useEffect(() => {
    if (editable) return;
    spaceDragRef.current?.stop();
    if (spaceStore.shift) {
      spaceStore.shift = null;
      spaceStore.emit();
    }
  }, [editable, spaceStore]);
  useEffect(() => () => spaceDragRef.current?.stop(), []);
  /**
   * 빈 곳(pane) 누르기 — 편집 모드에서 [공간] 토글이 켜졌거나 Alt 가 눌렸으면 공간 넓히기를 시작하고, 캡처 단계에서 끊어
   * React Flow 의 영역 선택(pane 캡처 리스너)·화면 이동(d3-zoom mousedown)에 닿지 않게 한다. 노드·선·손잡이 위 누르기는 해당하지 않는다.
   * 영역 선택이 켜진 편집 모드의 빈 곳 누르기(선택 풀기)는 pane 이 pointerup 에서 판정하는데 누르기를 끊었으므로 놓을 때 선택이 풀리지 않는다.
   */
  const onPointerDownCapture = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!editable || e.button !== 0 || !(spaceToolRef.current || e.altKey)) return;
    if (!(e.target as Element | null)?.classList?.contains("react-flow__pane")) return;
    e.stopPropagation();
    e.preventDefault(); // 호환 마우스 이벤트(mousedown)도 막힌다
    wrapRef.current?.focus({ preventScroll: true });
    startSpaceDrag(e.clientX, e.clientY);
  };
  /** 공간 넓히기 중의 mousedown(브라우저가 호환 이벤트를 보낼 때) — d3-zoom 화면 이동으로 가지 않게 끊는다. */
  const onMouseDownCapture = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!spaceDragRef.current) return;
    e.stopPropagation();
    e.preventDefault();
  };

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
    <SpaceContext.Provider value={spaceStore}>
    <HoverContext.Provider value={hoverStore}>
    <LabelContext.Provider value={labelApi}>
    <div
      ref={wrapRef}
      className="rsf-canvas"
      data-testid="flow-canvas"
      data-mode={mode}
      data-space-tool={editable && spaceTool ? "true" : undefined}
      tabIndex={0}
      onPointerDownCapture={onPointerDownCapture}
      onMouseDownCapture={onMouseDownCapture}
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
        // 편집 모드는 Figma 방식(S1, Ruling 21): 빈 곳 끌기 = 영역 선택(상자에 조금이라도 걸린 노드), 이동 = 스페이스+끌기·가운데 버튼·두 손가락 스크롤,
        // 확대 = 핀치·Ctrl/Cmd+휠(zoomActivationKeyCode 설치본 기본값 — Mac Meta, 그 밖 Control). 보기·디버그 모드는 끌기 = 이동, 휠 = 확대 그대로다.
        selectionOnDrag={editable}
        selectionMode={SelectionMode.Partial}
        panOnDrag={editable ? EDIT_PAN_BUTTONS : true}
        panOnScroll={editable}
        panActivationKeyCode="Space"
        zoomOnPinch
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
        // 영역 선택을 시작하면 단일 선택(속성 패널·Delete·복사 대상)을 푼다 — 상자 선택이 옛 노드를 가리킨 채 남지 않게(리뷰 Minor 1).
        onSelectionStart={() => {
          boxingRef.current = true;
          onSelect(null);
          onSelectEdge(null);
        }}
        onSelectionEnd={() => {
          boxingRef.current = false;
        }}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
      >
        {/* 오른쪽 아래 — 확대·축소 단추 줄 위에 미니맵(D14) */}
        <Controls position="bottom-right" orientation="horizontal" showInteractive={false} />
        {showMiniMap && <MiniMap position="bottom-right" style={MINIMAP_STYLE} pannable zoomable />}
        <SpaceGuide store={spaceStore} />
      </ReactFlow>
    </div>
    </LabelContext.Provider>
    </HoverContext.Provider>
    </SpaceContext.Provider>
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
