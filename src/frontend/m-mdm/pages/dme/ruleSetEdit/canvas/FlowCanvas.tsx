"use client";

/**
 * 룰 세트 흐름 캔버스(2단계 계획 Task 9) — React Flow 로 흐름을 그리는 표현 컴포넌트.
 * 상태를 갖지 않는다(선택·확대는 React Flow 내부, 끌던 중 위치만 잠깐 들고 있다). 편집은 모두 콜백으로 올린다.
 * 부모가 편집 모드일 때만 `mode="edit"` 로 부른다. 보기 모드는 끌기·연결이 꺼지고 선택만 된다.
 * 편집 모드에서는 여러 노드를 고를 수 있다 — Shift(또는 Cmd·Ctrl)+누르기, Shift+끌기 상자. 고른 흐름 노드 ID 목록은 `onSelectionChange` 로 올린다(Ruling 11).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from "react";

import type { RuleSetFlow } from "@/contract/engine-contract.generated";

import type { FlowNote, FlowPos, EditFlow } from "../flow-edit";
import { NODE_SIZE, positionsOf } from "../flow-layout";
import { edgeChips, edgeMarks, nodeMarks } from "../flow-vars";
import type { RuleIoMap, RuleSetCheck } from "../types";
import { GroupNodeData, NODE_TYPES, NoteNodeData, FlowNodeData, handlesOf } from "./nodes";
import type { EdgeState, Overlay } from "./overlay";
import {
  BaseEdge,
  EdgeLabelRenderer,
  MarkerType,
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

export type PaletteItem = "rule" | "if" | "par" | "note" | "group";
export const PALETTE_MIME = "application/x-rsf-palette";
const PALETTE_ITEMS: readonly string[] = ["rule", "if", "par", "note", "group"];
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
  mode: "view" | "edit";
  showVars: boolean;
  selectedId: string | null; // 노드·메모·그룹 ID
  selectedEdgeId: string | null;
  overlay: Overlay | null; // 디버거 겹침(Task 11)
  focusId: string | null; // 검사 항목을 누르면 이 노드로 이동·깜빡임
  focusSeq: number; // 이동을 요청할 때마다 부모가 1씩 올린다(같은 노드로 다시 이동·깜빡임)
  onSelect: (id: string | null) => void;
  onSelectEdge: (edgeId: string | null) => void;
  onOpenRule: (ruleId: string) => void; // 링크 아이콘만
  onMove: (pos: Record<string, FlowPos>) => void; // 끌기 끝(편집 모드만). 메모는 onNoteChange 로 올린다.
  onConnect: (from: string, to: string) => void;
  onDeleteEdge: (edgeId: string) => void;
  onDropPalette: (item: PaletteItem, at: FlowPos) => void;
  onNoteChange: (id: string, patch: Partial<FlowNote>) => void;
  /** 값이 바뀔 때마다 화면 맞춤(선택 추가 — 툴바의 [화면 맞춤]). */
  fitSignal?: number;
  /**
   * 흐름의 주인(세트 ID). 바뀌면 새 흐름을 그린 뒤 곧바로(애니메이션 없이) 화면을 맞춘다 — 이전 세트의 확대·이동이 남지 않게.
   * 같은 값으로 흐름만 바뀌면(편집·저장·같은 세트 다시 열기) 맞추지 않는다.
   */
  fitKey?: string | null;
  /**
   * React Flow 다중 선택이 바뀌면 고른 흐름 노드 ID(메모·그룹 제외)를 올린다. 선택이 모두 풀리면 빈 목록이다.
   * 메모·그룹만 고른 경우는 올리지 않는다 — 노드를 여러 개 고른 뒤 그룹 제목을 눌러 [선택 노드 더하기] 를 쓸 수 있게 한다.
   */
  onSelectionChange?: (nodeIds: string[]) => void;
}

/** 편집 모드 다중 선택 키 — 누르기로 더하기. */
const MULTI_KEYS = ["Shift", "Meta", "Control"];

type EdgeData = { label: string | null; chips: string[]; state: EdgeState | undefined; mark: "REJECT" | "WARN" | undefined; showVars: boolean };
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

function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}

function Inner(props: FlowCanvasProps) {
  const {
    flow, rules, checks, mode, showVars, selectedId, selectedEdgeId, overlay, focusId, focusSeq, fitSignal, fitKey,
    onSelect, onSelectEdge, onOpenRule, onMove, onConnect, onDeleteEdge, onDropPalette, onNoteChange, onSelectionChange,
  } = props;
  const editable = mode === "edit";
  const rf = useReactFlow();
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
  }, [flow, pos, drag, rules, marks, overlay, selectedId, flashId, editable, onOpenRule, onNoteChange, rfSel, measured]);

  const edges = useMemo(() => {
    const kindOf = new Map(flow.nodes.map((n) => [n.id, n.kind] as const));
    return flow.edges.map<FlowRfEdge>((e) => {
      const fromSplit = kindOf.get(e.from) === "IF" || kindOf.get(e.from) === "PARALLEL";
      const label = fromSplit ? (e.label ?? (e.otherwise ? "그 외" : null)) : null;
      return {
        id: e.id, source: e.from, target: e.to, type: "rsfFlow", selected: selectedEdgeId === e.id,
        markerEnd: { type: MarkerType.ArrowClosed },
        data: { label, chips: chips[e.id] ?? [], state: overlay?.edges[e.id], mark: eMarks[e.id], showVars },
      };
    });
  }, [flow, chips, overlay, eMarks, showVars, selectedEdgeId]);

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

  // 이동 요청(focusSeq)이 올 때마다 focusId 노드로 옮기고 1.2초 깜빡인다. focusId 가 null 이면 깜빡임을 지운다.
  useEffect(() => {
    if (!focusId) {
      setFlashId(null);
      return;
    }
    const n = flow.nodes.find((x) => x.id === focusId);
    const p = pos[focusId];
    if (n && p) {
      const s = NODE_SIZE[n.kind];
      void rf.setCenter(p.x + s.w / 2, p.y + s.h / 2, { zoom: rf.getZoom(), duration: 300 });
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

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!editable || !selectedEdgeId || isTyping(e.target)) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      onDeleteEdge(selectedEdgeId);
    }
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!editable) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    if (!editable) return;
    const item = e.dataTransfer.getData(PALETTE_MIME);
    if (!PALETTE_ITEMS.includes(item)) return;
    e.preventDefault();
    const at = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    onDropPalette(item as PaletteItem, { x: Math.round(at.x), y: Math.round(at.y) });
  };

  return (
    <div
      className="rsf-canvas"
      data-testid="flow-canvas"
      data-mode={mode}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onDragOver={onDragOver}
      onDrop={onDrop}
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
      />
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
