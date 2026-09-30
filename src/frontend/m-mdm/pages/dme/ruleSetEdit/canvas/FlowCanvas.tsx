"use client";

/**
 * 룰 세트 흐름 캔버스(2단계 계획 Task 9) — React Flow 로 흐름을 그리는 표현 컴포넌트.
 * 상태를 갖지 않는다(선택·확대는 React Flow 내부, 끌던 중 위치만 잠깐 들고 있다). 편집은 모두 콜백으로 올린다.
 * 부모가 편집 모드일 때만 `mode="edit"` 로 부른다. 보기 모드는 끌기·연결이 꺼지고 선택만 된다.
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

import "./canvas.css";

export type PaletteItem = "rule" | "if" | "par" | "note" | "group";
export const PALETTE_MIME = "application/x-rsf-palette";
const PALETTE_ITEMS: readonly string[] = ["rule", "if", "par", "note", "group"];
const GROUP_MARGIN = 16;
const FLASH_MS = 1200;

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
}

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
    flow, rules, checks, mode, showVars, selectedId, selectedEdgeId, overlay, focusId, fitSignal,
    onSelect, onSelectEdge, onOpenRule, onMove, onConnect, onDeleteEdge, onDropPalette, onNoteChange,
  } = props;
  const editable = mode === "edit";
  const rf = useReactFlow();
  const [drag, setDrag] = useState<Record<string, FlowPos>>({});
  const [flashId, setFlashId] = useState<string | null>(null);

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
        id: g.id, type: "rsfGroup", position: { x: b.x, y: b.y }, width: b.w, height: b.h, data,
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
        selected: selectedId === n.id,
        flash: flashId === n.id,
        onOpenRule,
      };
      out.push({ id: n.id, type: "rsfFlow", position: p, width: s.w, height: s.h, data, handles: handlesOf(n.kind), draggable: editable });
    }
    for (const note of flow.view.notes) {
      const data: NoteNodeData = { note, selected: selectedId === note.id, editable, onChange: onNoteChange };
      out.push({
        id: note.id, type: "rsfNote", position: { x: drag[note.id]?.x ?? note.x, y: drag[note.id]?.y ?? note.y },
        width: note.w, height: note.h, data, draggable: editable, connectable: false,
      });
    }
    return out;
  }, [flow, pos, drag, rules, marks, overlay, selectedId, flashId, editable, onOpenRule, onNoteChange]);

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

  const onConnectCb = useCallback((c: Connection) => {
    if (editable && c.source && c.target) onConnect(c.source, c.target);
  }, [editable, onConnect]);

  // 검사 항목을 누르면 그 노드로 옮기고 1.2초 깜빡인다.
  const lastFocus = useRef<string | null>(null);
  useEffect(() => {
    if (!focusId || focusId === lastFocus.current) {
      lastFocus.current = focusId;
      return;
    }
    lastFocus.current = focusId;
    const n = flow.nodes.find((x) => x.id === focusId);
    const p = pos[focusId];
    if (n && p) {
      const s = NODE_SIZE[n.kind];
      void rf.setCenter(p.x + s.w / 2, p.y + s.h / 2, { zoom: rf.getZoom(), duration: 300 });
    }
    setFlashId(focusId);
    const t = setTimeout(() => setFlashId((cur) => (cur === focusId ? null : cur)), FLASH_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

  const firstFit = useRef(true);
  useEffect(() => {
    if (firstFit.current) {
      firstFit.current = false;
      return;
    }
    void rf.fitView({ duration: 200, padding: 0.15 });
  }, [fitSignal, rf]);

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
        selectionKeyCode={null}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.2}
        maxZoom={2}
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
