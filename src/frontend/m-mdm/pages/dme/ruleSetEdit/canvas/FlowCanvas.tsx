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
 */
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent } from "react";

import { IconPlus } from "@tabler/icons-react";

import type { RuleSetFlow, TypedValue } from "@/contract/engine-contract.generated";

import type { FlowNote, FlowPos, EditFlow } from "../flow-edit";
import { NODE_SIZE, positionsOf } from "../flow-layout";
import { edgeChips, edgeMarks, nearestEdge, nodeMarks } from "../flow-vars";
import type { FlowMode } from "../state/useRuleSetEdit";
import type { RuleIoMap, RuleSetCheck } from "../types";
import type { MenuTarget } from "./context-menu";
import { GroupNodeData, NODE_TYPES, NoteNodeData, FlowNodeData, handlesOf } from "./nodes";
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
  /** 선 밖에 놓은 끌기 끝(편집 모드만). 메모는 onNoteChange 로 올린다. */
  onMove: (pos: Record<string, FlowPos>) => void;
  /** 놓인 노드·블록을 선 위에 놓음(A2 — Task 7). */
  onMoveNode: (nodeId: string, edgeId: string, pos: Record<string, FlowPos>) => void;
  onConnect: (from: string, to: string) => void;
  /** 팔레트 항목을 놓음(A1) — 놓은 자리에서 가장 가까운 선(없으면 null)을 함께 올린다. */
  onDropPalette: (item: PaletteItem, at: FlowPos, edgeId: string | null) => void;
  /** 룰 목록 줄을 놓음(A4). */
  onDropRule: (ruleId: string, edgeId: string | null) => void;
  onNoteChange: (id: string, patch: Partial<FlowNote>) => void;
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
  chips: string[];
  state: EdgeState | undefined;
  mark: "REJECT" | "WARN" | undefined;
  showVars: boolean;
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
};
type FlowRfEdge = Edge<EdgeData, "rsfFlow">;

function FlowEdgeView(props: EdgeProps<FlowRfEdge>) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected } = props;
  const [path, lx, ly] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 8 });
  const state = data?.state;
  const style: React.CSSProperties = { stroke: "var(--rsf-edge)", strokeWidth: 1.5 };
  if (data?.mark) style.stroke = data.mark === "REJECT" ? "var(--color-danger)" : "var(--color-warning)";
  if (selected) {
    style.stroke = "var(--color-primary)";
    style.strokeWidth = 2.5;
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
  return (
    <>
      <BaseEdge id={id} path={path} style={style} markerEnd={props.markerEnd} interactionWidth={20} />
      <EdgeLabelRenderer>
        {data?.label && (
          <div className="rsf-elabel" style={at(lx, ly)}>
            <span className="rsf-branch" data-testid={`flow-edge-label-${id}`} data-state={state ?? "idle"}>
              {data.label}
            </span>
          </div>
        )}
        {chips.length > 0 && (
          <div className="rsf-elabel" style={at(sourceX, sourceY + 20)}>
            <span className="rsf-vchips" data-testid={`flow-edge-chips-${id}`}>
              {chips.map((c) => (
                <span key={c} className="rsf-vchip">
                  {c}
                </span>
              ))}
            </span>
          </div>
        )}
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

const EDGE_TYPES: EdgeTypes = { rsfFlow: FlowEdgeView };

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
    breakpoints, showMiniMap, editingCondEdgeId,
    onSelect, onSelectEdge, onOpenRule, onMove, onConnect, onDropPalette, onDropRule, onNoteChange, onContextMenu, onToggleBreakpoint,
    onSelectionChange,
  } = props;
  const editable = mode === "edit";
  const debugging = mode === "debug";
  const rf = useReactFlow();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Record<string, FlowPos>>({});
  const [flashId, setFlashId] = useState<string | null>(null);
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

  const pos = useMemo(() => ({ ...positionsOf(flow), ...drag }), [flow, drag]);
  const marks = useMemo(() => nodeMarks(checks), [checks]);
  const eMarks = useMemo(() => edgeMarks(checks), [checks]);
  const chips = useMemo(() => edgeChips(flow as RuleSetFlow, rules), [flow, rules]);

  const nodes = useMemo(() => {
    const out: Node[] = [];
    const kinds = new Map(flow.nodes.map((n) => [n.id, n.kind] as const));
    for (const g of flow.view.groups) {
      const b = groupBox(g.nodeIds, pos, kinds);
      if (!b) continue;
      const data: GroupNodeData = { id: g.id, title: g.title, selected: selectedId === g.id };
      out.push({
        id: g.id, type: "rsfGroup", position: { x: b.x, y: b.y }, width: b.w, height: b.h, measured: measured[g.id], data, selected: rfSel.has(g.id),
        draggable: false, connectable: false, zIndex: -1, style: { pointerEvents: "none" },
      });
    }
    for (const n of flow.nodes) {
      const p = pos[n.id] ?? { x: 0, y: 0 };
      const s = NODE_SIZE[n.kind];
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
        collapsed: null, // SEAM(T11): 접힌 분기면 collapseView 의 블록 요약(count·ran·error)
        onToggleBreakpoint,
      };
      out.push({
        id: n.id, type: "rsfFlow", position: p, width: s.w, height: s.h, measured: measured[n.id], data, handles: handlesOf(n.kind), draggable: editable,
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
  }, [flow, pos, drag, rules, marks, overlay, selectedId, flashId, editable, debugging, breakpoints, onOpenRule, onToggleBreakpoint, onNoteChange, rfSel, measured]);

  const edges = useMemo(() => {
    const kindOf = new Map(flow.nodes.map((n) => [n.id, n.kind] as const));
    return flow.edges.map<FlowRfEdge>((e) => {
      const fromSplit = kindOf.get(e.from) === "IF" || kindOf.get(e.from) === "PARALLEL";
      const label = fromSplit ? (e.label ?? (e.otherwise ? "그 외" : null)) : null;
      const data: EdgeData = {
        label, chips: chips[e.id] ?? [], state: overlay?.edges[e.id], mark: eMarks[e.id], showVars,
        dropTarget: false, // SEAM(T7): 끄는 동안 놓일 선(dropEdge 내부 상태)
        insertable: editable,
        condEditable: editable && kindOf.get(e.from) === "IF" && !e.otherwise,
        editingCond: editingCondEdgeId === e.id,
        valueOf: undefined, // SEAM(T11): 디버그 모드 칩 툴팁(valueAt)
      };
      return {
        id: e.id, source: e.from, target: e.to, type: "rsfFlow", selected: selectedEdgeId === e.id,
        markerEnd: { type: MarkerType.ArrowClosed },
        data,
      };
    });
  }, [flow, chips, overlay, eMarks, showVars, selectedEdgeId, editable, editingCondEdgeId]);

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

  const onNodeDragStop = useCallback((_e: unknown, _n: Node, dragged: Node[]) => {
    if (!editable) return;
    const noteIds = new Set(flow.view.notes.map((n) => n.id));
    const moved: Record<string, FlowPos> = {};
    for (const n of dragged) {
      const p = { x: Math.round(n.position.x), y: Math.round(n.position.y) };
      if (noteIds.has(n.id)) onNoteChange(n.id, p);
      else if (n.type === "rsfFlow") moved[n.id] = p;
    }
    if (Object.keys(moved).length > 0) onMove(moved);
  }, [editable, flow, onMove, onNoteChange]);

  // 흐름이 바뀌면 없어진 요소를 선택에서 뺀다.
  useEffect(() => {
    setRfSel((cur) => {
      const alive = new Set<string>([...flow.nodes.map((n) => n.id), ...flow.view.notes.map((n) => n.id), ...flow.view.groups.map((g) => g.id)]);
      const next = new Set([...cur].filter((id) => alive.has(id)));
      return next.size === cur.size ? cur : next;
    });
  }, [flow]);

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
    const n = flow.nodes.find((x) => x.id === focusId);
    const p = pos[focusId];
    if (n && p) {
      const s = NODE_SIZE[n.kind];
      if (!(focusReveal && inView(p.x, p.y, s.w, s.h))) {
        void rf.setCenter(p.x + s.w / 2, p.y + s.h / 2, { zoom: rf.getZoom(), duration: 300 });
      }
    }
    setFlashId(null);
    const start = setTimeout(() => setFlashId(focusId), 0);
    const end = setTimeout(() => setFlashId((cur) => (cur === focusId ? null : cur)), FLASH_MS);
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

  const carries = (e: DragEvent<HTMLDivElement>) => {
    const types = Array.from(e.dataTransfer?.types ?? []);
    return types.includes(PALETTE_MIME) || types.includes(RULE_MIME);
  };
  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!editable || !carries(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    if (!editable || !e.dataTransfer) return;
    const item = e.dataTransfer.getData(PALETTE_MIME);
    const ruleId = e.dataTransfer.getData(RULE_MIME);
    const isPalette = PALETTE_ITEMS.includes(item);
    if (!isPalette && !ruleId) return;
    e.preventDefault();
    const at = flowAt(e.clientX, e.clientY);
    const edgeId = nearestEdge(flow, pos, at, dropRadius(rf.getZoom()));
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

  return (
    <div
      ref={wrapRef}
      className="rsf-canvas"
      data-testid="flow-canvas"
      data-mode={mode}
      tabIndex={0}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClickCapture={onClickCapture}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        nodesDraggable={editable}
        nodesConnectable={editable}
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
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnectCb}
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
  );
}

export function FlowCanvas(props: FlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  );
}
