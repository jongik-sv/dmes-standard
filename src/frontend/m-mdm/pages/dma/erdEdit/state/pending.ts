/**
 * 두 층 모델(스펙 4.4, 시험 8, S2-17·S2-18) — 아래층 server(서버가 확인한 마지막 rev)와 위층 pending(응답을 다 맞추지 못한 내 묶음).
 * React 의존이 없고 입력을 바꾸지 않는다. useErdModel 은 이 함수들로만 층을 바꾼다.
 * - 묶음은 한 번에 하나만 보낸다(queued → sending). baseRev 는 보낼 때의 아래층 rev 다.
 * - 응답 rev 가 아래층 rev + 1 이면 응답 델타를 바로 얹는다. 더 크면 남의 앞 rev 가 아직 안 온 것이라 델타를 held 에 보관하고
 *   묶음을 held 로 둔다. SSE 가 그 앞까지 채우면 얹는다. HOLD_LIMIT_MS 안에 못 채우면 부르는 쪽이 모델을 다시 읽는다.
 * - SSE 에코가 응답보다 먼저 올 수 있다(커밋 뒤 전달 실행기, deferred 27). sending 묶음이 있을 때 내 세션 델타가 오면 그 묶음의
 *   에코로 보고 아래층에 얹은 뒤 묶음을 echoed 로 바꿔 투영에서 뺀다. 늦은 응답은 결과만 돌려주고 델타를 다시 얹지 않는다.
 * - 거절이면 묶음을 빼고 알림을 만든다. 다시 읽으면 모든 묶음·보관 델타를 버린다(보내지 않은 queued 수를 센다).
 * - mine: 반영 응답의 rev(되돌리기 제외). 화면은 이 값만 myRevs 에 넣는다. SSE 에코로는 넣지 않는다.
 */
import { landingIndex } from "../audit-columns";
import { noticeFromRejection, type ErdNotice } from "../edit-context";
import type { ErdApplyResult, ErdColumn, ErdCommandJson, ErdDelta, ErdDiagram, ErdDiagramNode, ErdFoldMode, ErdModelJson, ErdState, ErdTable } from "../types";
import { applyDelta, nodeKey, routeKey } from "./model-delta";

export const HOLD_LIMIT_MS = 5000;

export interface PendingBatch {
  id: number; label: string; baseRev: number; commands: ErdCommandJson[]; undoOf?: number;
  state: "queued" | "sending" | "held" | "echoed"; heldRev?: number; heldSince?: number;
}
export interface Layers { server: ErdState; pending: PendingBatch[]; held: ErdDelta[] }
export interface PendingMe { userId: string; session: string }
export interface ResultOutcome { layers: Layers; notice: ErdNotice | null; reload: boolean; mine: number | null }

type Rec = Record<string, unknown>;
const NO_IDS: ReadonlySet<string> = new Set();
const FOLD_MODES: readonly ErdFoldMode[] = ["NONE", "KEYS", "NAME"];
const ID_FIELDS = ["id", "table", "child", "parent"] as const;

const live = (b: PendingBatch): boolean => b.state !== "echoed";
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const rec = (v: unknown): Rec | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : null);
const nodeList = (v: unknown): { table: string; x: number; y: number }[] =>
  Array.isArray(v)
    ? v.flatMap((n) => {
      const o = rec(n);
      const t = str(o?.table);
      return o && t && typeof o.x === "number" && typeof o.y === "number" ? [{ table: t, x: o.x, y: o.y }] : [];
    })
    : [];

/** resizeNodes 의 노드(§7.4) — 표 id 와 w·h(숫자가 아니면 null = 자동 크기). */
const sizeList = (v: unknown): { table: string; w: number | null; h: number | null }[] =>
  Array.isArray(v)
    ? v.flatMap((n) => {
      const o = rec(n);
      const t = str(o?.table);
      return o && t ? [{ table: t, w: typeof o.w === "number" ? o.w : null, h: typeof o.h === "number" ? o.h : null }] : [];
    })
    : [];

export function initLayers(server: ErdState): Layers {
  return { server, pending: [], held: [] };
}

/** 투영 — 아래층에 살아 있는 묶음(queued·sending·held)의 명령을 차례로 얹는다. 없으면 아래층 그대로(같은 객체). */
export function project(server: ErdState, pending: readonly PendingBatch[]): ErdState {
  let s = server;
  for (const b of pending) if (live(b)) for (const c of b.commands) s = projectCommand(s, c);
  return s;
}

/** 살아 있는 묶음이 건드리는 요소 id — 흐린 자리표시용. */
export function pendingIds(pending: readonly PendingBatch[]): ReadonlySet<string> {
  if (!pending.some(live)) return NO_IDS;
  const out = new Set<string>();
  for (const b of pending) {
    if (!live(b)) continue;
    for (const c of b.commands) {
      for (const f of ID_FIELDS) {
        const v = str(c[f]);
        if (v) out.add(v);
      }
      for (const t of strList(c.tables)) out.add(t);
      for (const n of nodeList(c.nodes)) out.add(n.table);
      if (c.op === "resizeNodes") for (const n of sizeList(c.nodes)) out.add(n.table);
    }
  }
  return out;
}

function dropColumns(m: ErdModelJson, ids: ReadonlySet<string>): ErdModelJson {
  const columns = { ...m.columns };
  for (const id of ids) delete columns[id];
  const tables = { ...m.tables };
  for (const [tid, t] of Object.entries(m.tables)) {
    if (t.columnOrder.some((c) => ids.has(c))) tables[tid] = { ...t, columnOrder: t.columnOrder.filter((c) => !ids.has(c)) };
  }
  const keys = { ...m.keys };
  for (const [kid, k] of Object.entries(m.keys)) {
    if (!k.columns.some((c) => ids.has(c))) continue;
    const left = k.columns.filter((c) => !ids.has(c));
    if (left.length === 0) delete keys[kid];
    else keys[kid] = { ...k, columns: left };
  }
  const relations = { ...m.relations };
  for (const [rid, r] of Object.entries(m.relations)) if (r.pairs.some((p) => ids.has(p[0]) || ids.has(p[1]))) delete relations[rid];
  return { ...m, tables, columns, keys, relations };
}

function dropTable(m: ErdModelJson, tableId: string): ErdModelJson {
  const t = m.tables[tableId];
  const cols = new Set([...t.columnOrder, ...Object.keys(m.columns).filter((c) => m.columns[c].table === tableId)]);
  const out = dropColumns(m, cols);
  const tables = { ...out.tables };
  delete tables[tableId];
  const keys = Object.fromEntries(Object.entries(out.keys).filter(([, k]) => k.table !== tableId));
  const relations = Object.fromEntries(Object.entries(out.relations).filter(([, r]) => r.child !== tableId && r.parent !== tableId));
  return { ...out, tables, keys, relations };
}

const withModel = (s: ErdState, model: ErdModelJson): ErdState => ({ ...s, model });

/** 명령 하나를 화면 상태에 미리 얹는다(S2-18). 모르는 명령·없는 대상은 그대로 둔다. */
export function projectCommand(state: ErdState, cmd: ErdCommandJson): ErdState {
  const m = state.model;
  const id = str(cmd.id);
  switch (cmd.op) {
    case "addTable": {
      const phys = str(cmd.phys);
      if (!id || !phys || m.tables[id]) return state;
      const t: ErdTable = { phys, logical: str(cmd.logical) ?? "", comment: str(cmd.comment), columnOrder: [] };
      return withModel(state, { ...m, tables: { ...m.tables, [id]: t } });
    }
    case "updateTable": {
      const t = id ? m.tables[id] : undefined;
      const set = rec(cmd.set);
      if (!id || !t || !set) return state;
      return withModel(state, { ...m, tables: { ...m.tables, [id]: { ...t, ...set } as ErdTable } });
    }
    case "updateColumn": {
      const c = id ? m.columns[id] : undefined;
      const set = rec(cmd.set);
      if (!id || !c || !set) return state;
      return withModel(state, { ...m, columns: { ...m.columns, [id]: { ...c, ...set } as ErdColumn } });
    }
    case "moveColumn": {
      const c = id ? m.columns[id] : undefined;
      const t = c ? m.tables[c.table] : undefined;
      if (!id || !c || !t || typeof cmd.position !== "number") return state;
      const order = t.columnOrder.filter((x) => x !== id);
      // 엔진 moveColumn 과 같은 자리 계산 — 끝 자리는 표 끝의 감사 컬럼 덩어리 앞이다(결정 23, audit-columns landingIndex).
      order.splice(landingIndex(order, cmd.position, c.phys, (x) => m.columns[x]?.phys), 0, id);
      return withModel(state, { ...m, tables: { ...m.tables, [c.table]: { ...t, columnOrder: order } } });
    }
    case "deleteTable":
      return id && m.tables[id] ? withModel(state, dropTable(m, id)) : state;
    case "deleteColumn":
      return id && m.columns[id] ? withModel(state, dropColumns(m, new Set([id]))) : state;
    case "confirmRelation":
    case "rejectRelation": {
      const r = id ? m.relations[id] : undefined;
      if (!id || !r) return state;
      const next = cmd.op === "confirmRelation" ? "CONFIRMED" : "REJECTED";
      return withModel(state, { ...m, relations: { ...m.relations, [id]: { ...r, state: next } } });
    }
    case "addDiagram": {
      const areaName = str(cmd.areaName);
      const diagramName = str(cmd.diagramName);
      if (!id || !areaName || !diagramName || state.diagrams[id]) return state;
      const sortSeq = typeof cmd.sortSeq === "number" ? cmd.sortSeq : Math.max(-1, ...Object.values(state.diagrams).map((d) => d.sortSeq)) + 1;
      return { ...state, diagrams: { ...state.diagrams, [id]: { id, areaName, diagramName, sortSeq } } };
    }
    case "updateDiagram": {
      const d = id ? state.diagrams[id] : undefined;
      const set = rec(cmd.set);
      if (!id || !d || !set) return state;
      return { ...state, diagrams: { ...state.diagrams, [id]: { ...d, ...set, id } as ErdDiagram } };
    }
    case "deleteDiagram": {
      if (!id || !state.diagrams[id]) return state;
      const diagrams = { ...state.diagrams };
      delete diagrams[id];
      return {
        ...state, diagrams,
        nodes: Object.fromEntries(Object.entries(state.nodes).filter(([, n]) => n.diagram !== id)),
        routes: Object.fromEntries(Object.entries(state.routes).filter(([, r]) => r.diagram !== id)),
      };
    }
    case "setRoute": {
      // 경유점(§7.1). 빈 목록·이 버전에 없는 관계는 서버가 INVALID 로 거절하므로 미리 보이지 않는다.
      const diagram = str(cmd.diagram);
      const relation = str(cmd.relation);
      const points = Array.isArray(cmd.points) ? (cmd.points as { x: number; y: number }[]) : [];
      if (!diagram || !relation || points.length === 0 || !state.model.relations[relation]) return state;
      // 점만 바꾼다 — 고른 끝점 변(§7.5)은 그대로 둔다.
      const key = routeKey(diagram, relation);
      return { ...state, routes: { ...state.routes, [key]: { ...state.routes[key], diagram, relation, points } } };
    }
    case "setRouteSides": {
      // 끝점 변(§7.5) — 두 변을 함께 덮어쓴다(null·키 없음 = 자동). 점은 그대로. 점도 변도 없으면 행이 사라진다.
      const diagram = str(cmd.diagram);
      const relation = str(cmd.relation);
      const r = relation ? state.model.relations[relation] : undefined;
      if (!diagram || !relation || !r || r.child === r.parent) return state;
      // 다른 값은 서버가 묶음째 INVALID 로 거절한다 — 미리 보이지 않는다.
      const okSide = (v: unknown): boolean => v === undefined || v === null || v === "L" || v === "R";
      if (!okSide(cmd.childSide) || !okSide(cmd.parentSide)) return state;
      const side = (v: unknown): "L" | "R" | undefined => (v === "L" || v === "R" ? v : undefined);
      const childSide = side(cmd.childSide);
      const parentSide = side(cmd.parentSide);
      const key = routeKey(diagram, relation);
      const points = state.routes[key]?.points ?? [];
      const routes = { ...state.routes };
      if (points.length === 0 && !childSide && !parentSide) delete routes[key];
      else routes[key] = { diagram, relation, points, ...(childSide ? { childSide } : {}), ...(parentSide ? { parentSide } : {}) };
      return { ...state, routes };
    }
    case "clearRoutes": {
      // 빈 relations 는 서버도 no-op(거절 아님)이다.
      const diagram = str(cmd.diagram);
      const rels = strList(cmd.relations);
      if (!diagram || rels.length === 0) return state;
      const routes = { ...state.routes };
      for (const r of rels) delete routes[routeKey(diagram, r)];
      return { ...state, routes };
    }
    case "placeTables":
    case "moveNodes": {
      const diagram = str(cmd.diagram);
      const list = nodeList(cmd.nodes);
      if (!diagram || list.length === 0) return state;
      const nodes = { ...state.nodes };
      for (const n of list) {
        const key = nodeKey(diagram, n.table);
        const prev = nodes[key];
        if (prev) nodes[key] = { ...prev, x: n.x, y: n.y };
        else if (cmd.op === "placeTables") nodes[key] = { diagram, table: n.table, x: n.x, y: n.y, foldMode: "NONE" };
      }
      return { ...state, nodes };
    }
    case "resizeNodes": {
      // 표 크기(§7.4). null(또는 키 없음) = 자동 크기 — 키를 지운다(undefined 로 두면 참조 재사용 비교가 키 수로 어긋난다).
      const diagram = str(cmd.diagram);
      const list = sizeList(cmd.nodes);
      if (!diagram || list.length === 0) return state;
      const nodes = { ...state.nodes };
      for (const n of list) {
        const key = nodeKey(diagram, n.table);
        const prev = nodes[key];
        if (!prev) continue;
        const next: ErdDiagramNode = { ...prev };
        delete next.w;
        delete next.h;
        if (n.w !== null) next.w = n.w;
        if (n.h !== null) next.h = n.h;
        nodes[key] = next;
      }
      return { ...state, nodes };
    }
    case "setFold": {
      const diagram = str(cmd.diagram);
      const mode = FOLD_MODES.find((f) => f === cmd.foldMode);
      if (!diagram || !mode) return state;
      const nodes = { ...state.nodes };
      for (const t of strList(cmd.tables)) {
        const key = nodeKey(diagram, t);
        if (nodes[key]) nodes[key] = { ...nodes[key], foldMode: mode };
      }
      return { ...state, nodes };
    }
    case "removeFromDiagram": {
      const diagram = str(cmd.diagram);
      if (!diagram) return state;
      const nodes = { ...state.nodes };
      for (const t of strList(cmd.tables)) delete nodes[nodeKey(diagram, t)];
      return { ...state, nodes };
    }
    default:
      return state; // addColumn·addKey·addRelation·applyDomain·setPrimaryKey 등 — 서버가 결과를 정한다(자리표시만)
  }
}

export function enqueue(l: Layers, b: Omit<PendingBatch, "state">): Layers {
  return { ...l, pending: [...l.pending, { ...b, state: "queued" }] };
}

/** 그 묶음을 보내기 시작한다. 보내는 묶음이 이미 있거나 그 묶음이 없으면(다시 읽어 버렸으면) null. */
export function markSending(l: Layers, batchId: number): { layers: Layers; batch: PendingBatch } | null {
  if (l.pending.some((b) => b.state === "sending")) return null;
  const b = l.pending.find((x) => x.id === batchId && x.state === "queued");
  if (!b) return null;
  const batch: PendingBatch = { ...b, state: "sending", baseRev: l.server.rev };
  return { layers: { ...l, pending: l.pending.map((x) => (x.id === batchId ? batch : x)) }, batch };
}

/** 보내다 실패한(던진) 묶음을 뺀다. */
export function dropBatch(l: Layers, batchId: number): Layers {
  return l.pending.some((b) => b.id === batchId) ? { ...l, pending: l.pending.filter((b) => b.id !== batchId) } : l;
}

export function resultDelta(r: ErdApplyResult, modelId: string, me: PendingMe): ErdDelta {
  return { modelId, rev: r.rev, userId: me.userId, session: me.session, source: "UI", rowVersion: r.rowVersion ?? null, changes: r.changes };
}

/** 보관 델타 가운데 아래층에 이어지는 것을 얹고, 이미 지난 rev 는 버린다. 얹은 rev 의 held 묶음을 뺀다. */
function drain(l: Layers): { layers: Layers; reload: boolean } {
  let { server, pending, held } = l;
  while (held.length > 0 && held[0].rev <= server.rev + 1) {
    const d = held[0];
    held = held.slice(1);
    pending = pending.filter((b) => !(b.state === "held" && b.heldRev === d.rev));
    if (d.rev <= server.rev) continue;
    const out = applyDelta(server, d);
    if (out.kind !== "applied") return { layers: { server, pending, held }, reload: true };
    server = out.state;
  }
  const same = server === l.server && pending === l.pending && held === l.held;
  return { layers: same ? l : { server, pending, held }, reload: false };
}

export function onResult(l: Layers, batchId: number, r: ErdApplyResult, me: PendingMe, now: number): ResultOutcome {
  const b = l.pending.find((x) => x.id === batchId);
  if (!r.applied) return { layers: dropBatch(l, batchId), notice: noticeFromRejection(r.rejection, b?.commands ?? []), reload: false, mine: null };
  if (!b) return { layers: l, notice: null, reload: false, mine: null }; // 다시 읽어 버린 묶음 — 결과는 다시 읽은 모델이나 SSE 에 있다
  const mine = b.undoOf === undefined ? r.rev : null;
  const rest = l.pending.filter((x) => x.id !== batchId);
  if (b.state === "echoed" || r.rev <= l.server.rev) return { layers: { ...l, pending: rest }, notice: null, reload: false, mine };
  const d = resultDelta(r, l.server.modelId, me);
  if (r.rev === l.server.rev + 1) {
    const out = applyDelta(l.server, d);
    if (out.kind !== "applied") return { layers: { ...l, pending: rest }, notice: null, reload: true, mine };
    const drained = drain({ server: out.state, pending: rest, held: l.held });
    return { layers: drained.layers, notice: null, reload: drained.reload, mine };
  }
  const held = [...l.held.filter((h) => h.rev !== d.rev), d].sort((a, c) => a.rev - c.rev);
  const pending = l.pending.map((x) => (x.id === batchId ? { ...x, state: "held" as const, heldRev: r.rev, heldSince: now } : x));
  return { layers: { ...l, pending, held }, notice: null, reload: false, mine };
}

export function onStream(l: Layers, d: ErdDelta, _now: number, me: PendingMe): { layers: Layers; reload: boolean } {
  if (d.rev <= l.server.rev) return { layers: l, reload: false }; // 응답이나 보관 델타로 이미 얹었다
  if (d.rev !== l.server.rev + 1) return { layers: l, reload: true };
  const out = applyDelta(l.server, d);
  if (out.kind !== "applied") return { layers: l, reload: true };
  let pending = l.pending;
  let held = l.held;
  const heldBatch = pending.find((b) => b.state === "held" && b.heldRev === d.rev);
  if (heldBatch || held.some((h) => h.rev === d.rev)) {
    pending = pending.filter((b) => b !== heldBatch);
    held = held.filter((h) => h.rev !== d.rev);
  } else if (d.session === me.session) {
    const sending = pending.find((b) => b.state === "sending");
    if (sending) pending = pending.map((b) => (b === sending ? { ...b, state: "echoed" as const } : b));
  }
  return drain({ server: out.state, pending, held });
}

export function onTick(l: Layers, now: number): { reload: boolean } {
  return { reload: l.pending.some((b) => b.state === "held" && now - (b.heldSince ?? now) > HOLD_LIMIT_MS) };
}

export function onReloaded(l: Layers, server: ErdState): { layers: Layers; dropped: number } {
  return { layers: initLayers(server), dropped: l.pending.filter((b) => b.state === "queued").length };
}
