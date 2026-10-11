/**
 * 모델 → React Flow 노드·선(순수). 캔버스는 결과를 useStableById 로 이전 참조와 맞춰 넘긴다(Local-Rules §19 — 내용이 같은 노드·선은
 * 이전 객체를 그대로 넘겨야 React Flow 가 다시 그리지 않는다).
 * - 지금 보는 버전에 없는 표의 다이어그램 노드는 그리지 않는다(스펙 3.2).
 * - 기각 관계는 그리지 않는다. 추정 후보는 묶음마다 남은 후보 가운데 순위가 가장 앞선 것만 그리고 접힌 후보 수를 단다(S7).
 *   확정·DB 관계는 순위가 남아 있어도 그린다.
 * - 다른 모델 표를 부모로 둔 관계(parentRef)는 단계 1 에서 그리지 않는다. 회색 참조 노드(스펙 D8)는 단계 2 이고 가져오기는 이런 관계를 만들지 않는다.
 * - 감사 컬럼(audit-columns.ts)은 showAudit 가 꺼지면 접기와 따로 행에서 뺀다. 접기가 가린 행(hiddenCount)과 감사 보기가 가린 행(auditHidden)은
 *   서로 세지 않는다 — 접기로 안 보일 감사 컬럼은 auditHidden 이 아니라 hiddenCount 몫이라 「감사 n」과 「접힘」이 겹쳐 뜨지 않는다.
 *   감사 컬럼 쪽을 짝으로 둔 관계는 그 행이 없으므로 아래 "행이 안 보이면" 규칙대로 표 머리 손잡이에 붙는다.
 * - 선이 붙는 변은 두 표의 가로 위치로 정한다(relationSides): 떨어져 있으면 마주 보는 변, 겹치면 둘 다 오른쪽. 끄는 동안은 손잡이 id 가 옛 위치 기준이라
 *   ErdRelationEdge 가 덮개 위치로 변을 다시 정해 그린다(이 함수는 저장 위치로만 짠다).
 * - 컬럼 행이 안 보이면(축소·개요·접기) 선은 표 머리 손잡이에 붙는다. 컬럼 손잡이는 선이 쓰는 것만 행 데이터에 싣는다.
 *   행 데이터는 확대율과 무관하게 만든다. 그래서 확대율이 경계를 넘어도 노드 객체는 그대로이고 선만 바뀐다.
 * - 이름표(단계 2): 접속자가 고른 표와 작업 중 표시를 따로 모은다(조사 A GAP-2). 만료 시각(until·claimUntil)을 실어 두고, now 를 주면 지난 것을 뺀다.
 *   끌기·잇기는 노드가 아니라 캔버스 flowProps 가 정한다(useCanvasEditing).
 */
import { useMemo, useRef } from "react";

import type { Edge, Node } from "@dk-oasis/shared/react-flow";

import { isAuditColumnId } from "../audit-columns";
import { countTableViolations } from "../state/violations";
import type { ErdClaim, ErdColumnStatus, ErdModelJson, ErdPresence, ErdRelation, ErdRelationState, ErdState } from "../types";
import { NODE_WIDTH, nodeHeight, relationSides, typeText, type NodeSide } from "./erd-geometry";

export type ErdMode = "logical" | "physical";
export type ErdPreset = "basic" | "overview" | "both";
export type KeyMark = "PK" | "FK" | "FK?" | "";
export type RowTone = "miss" | "warn" | null;

export interface HandleSpec {
  id: string;
  type: "source" | "target";
  side: NodeSide;
}

export interface ErdRowView {
  id: string;
  key: KeyMark;
  name: string;
  /** 논리+물리 프리셋에서 함께 쓰는 물리명. 아니면 null. */
  nameSub: string | null;
  sub: string;
  tone: RowTone;
  handles: HandleSpec[];
}

export interface ErdNodeViewer {
  session: string;
  userId: string;
  source: string;
  /** 이 세션이 이 표에 작업 중 표시(claim)를 걸었다. */
  claimed: boolean;
  /** 이름표가 사라지는 시각 — MCP·CLI 시한 접속자의 expiresAt(작업 중이면 그 만료와 견줘 늦은 쪽), 작업 중 표시만 있으면 그 만료 시각. SSE 접속자는 null. */
  until: string | null;
  /** 작업 중 표시 만료 시각. 작업 중이 아니면 null. */
  claimUntil: string | null;
}

export interface ErdNodeData extends Record<string, unknown> {
  title: string;
  subtitle: string;
  /** 개요 단계(U50) 두 줄 — 논리명(없으면 빈 글)·물리명. 보기 모드와 상관없다. */
  logicalName: string;
  physName: string;
  /** 상세 단계 노드 높이(= initialHeight). 개요 단계는 이 높이 상자로 남는다. */
  boxHeight: number;
  rows: ErdRowView[];
  /** 접기(KEYS·NAME)로 가린 컬럼 수. 감사 컬럼 보기와 무관하다. */
  hiddenCount: number;
  /** 감사 컬럼 보기가 꺼져 가린 감사 컬럼 수 — 접기가 이미 가린 행은 세지 않는다(그건 hiddenCount). 보기가 켜져 있으면 0. */
  auditHidden: number;
  violations: number;
  viewers: ErdNodeViewer[];
  /** 관계 도구(4·5) 동안 노드 전체를 덮는 잇기 손잡이를 단다(useCanvasEditing 이 꾸민다). */
  pickable?: boolean;
}
export type ErdFlowNode = Node<ErdNodeData, "erdTable">;

export interface ErdEdgeData extends Record<string, unknown> {
  state: ErdRelationState;
  /** 같은 묶음의 접힌 후보 수(1순위 후보에만). */
  folded: number;
  /** 자식 쪽 기수가 0 을 포함하는가(ZERO_OR_MORE·ZERO_OR_ONE). */
  zeroChild: boolean;
}
export type ErdFlowEdge = Edge<ErdEdgeData, "erdRelation">;

export const BAD_STATUSES: ReadonlySet<string> = new Set<ErdColumnStatus>(["TYPE", "DOMAIN", "MISS"]);

export function handleId(columnId: string | null, side: NodeSide, type: HandleSpec["type"]): string {
  return `${columnId ?? "tbl"}|${side}|${type === "source" ? "s" : "t"}`;
}

/** 표 머리 손잡이 4개 — 컬럼 행이 안 보일 때 선이 붙는다. */
export const TABLE_HANDLES: readonly HandleSpec[] = (["L", "R"] as const).flatMap((side) =>
  (["source", "target"] as const).map((type) => ({ id: handleId(null, side, type), type, side })),
);

/** 허브 후보 묶음 키 — 자식 표 + 자식 컬럼 집합(S7). */
export function candidateGroup(r: ErdRelation): string {
  return `${r.child}|${r.pairs.map((p) => p[0]).sort().join(",")}`;
}

/**
 * 캔버스에 그릴 수 있는 관계인가(묶음 대표 판정 전). 접기는 추정(INFERRED) 후보에만 적용한다.
 * 확정·DB 관계는 순위가 남아 있어도 그린다(엔진 명령은 candidateRank 를 바꾸지 않는다).
 */
export function isDrawn(r: ErdRelation): boolean {
  return r.state !== "REJECTED" && r.parentRef == null && (r.state !== "INFERRED" || r.candidateRank == null || r.candidateRank <= 1);
}

const isRankedCandidate = (r: ErdRelation): boolean => r.state === "INFERRED" && r.parentRef == null && r.candidateRank != null;

/**
 * 허브 묶음마다 그릴 대표 후보와 접힌 수. 대표 = 남은 추정 후보 가운데 순위가 가장 작은 것.
 * 1순위를 기각하거나 확정해도 남은 후보가 사라지지 않게 한다.
 */
function candidateHeads(model: ErdModelJson): Map<string, { id: string; folded: number }> {
  const out = new Map<string, { id: string; rank: number; count: number }>();
  for (const [id, r] of Object.entries(model.relations)) {
    if (!isRankedCandidate(r)) continue;
    const g = candidateGroup(r);
    const cur = out.get(g);
    const rank = r.candidateRank as number;
    if (!cur) out.set(g, { id, rank, count: 1 });
    else {
      cur.count += 1;
      if (rank < cur.rank || (rank === cur.rank && id < cur.id)) Object.assign(cur, { id, rank });
    }
  }
  return new Map([...out].map(([g, h]) => [g, { id: h.id, folded: h.count - 1 }] as const));
}

/** 컬럼별 키 표시. PK 가 먼저다. DB·확정 관계의 자식은 FK, 추정 관계뿐이면 FK?. 기각 관계는 보지 않는다. */
export function keyMarks(model: ErdModelJson): Map<string, KeyMark> {
  const out = new Map<string, KeyMark>();
  for (const k of Object.values(model.keys)) if (k.kind === "PK") for (const c of k.columns) out.set(c, "PK");
  for (const r of Object.values(model.relations)) {
    if (r.state === "REJECTED") continue;
    const mark: KeyMark = r.state === "INFERRED" ? "FK?" : "FK";
    for (const [child] of r.pairs) {
      const cur = out.get(child);
      if (cur === "PK" || cur === "FK") continue;
      out.set(child, mark);
    }
  }
  return out;
}

export interface BuildFlowInput {
  state: ErdState;
  diagramId: string | null;
  mode: ErdMode;
  preset: ErdPreset;
  /** 확대율 50% 미만 — 선을 표 머리 손잡이에 붙인다. */
  namesOnly: boolean;
  /** 감사 컬럼(C_/U_ 8개)을 그린다. 꺼져 있으면 노드 행에서 빼고 머리에 「감사 n」을 단다. */
  showAudit: boolean;
  statuses: Readonly<Record<string, ErdColumnStatus>>;
  domains: Readonly<Record<string, { name: string }>>;
  selected: ReadonlySet<string>;
  mySession: string;
  /** 주면 이 시각에 지난 작업 중 표시·시한 접속자를 뺀다(시험용. 화면은 decorateNodes 가 시계로 거른다). */
  now?: number;
}

export interface ErdFlow {
  nodes: ErdFlowNode[];
  edges: ErdFlowEdge[];
}

const NO_HANDLES: HandleSpec[] = [];
const NO_VIEWERS: ErdNodeViewer[] = [];
const EMPTY_FLOW: ErdFlow = { nodes: [], edges: [] };

const isPast = (iso: string | null | undefined, now: number | undefined): boolean =>
  now !== undefined && !!iso && Date.parse(iso) <= now;

/** 두 ISO 시각 가운데 늦은 것. */
const laterIso = (a: string, b: string): string => (Date.parse(b) > Date.parse(a) ? b : a);

/** 작업 중 표시만 있고 접속자 목록에 없는 세션의 출처 — 화면 세션은 ui-, CLI 는 cli-, 나머지(claude-·mcp-·직접 준 이름)는 MCP. */
export function sourceOfSession(session: string): string {
  if (session.startsWith("ui-")) return "UI";
  if (session.startsWith("cli-")) return "CLI";
  return "MCP";
}

/**
 * 표마다 이름표. 접속자 목록에서 다른 세션이 고른 표(MCP·CLI 시한 항목은 서버가 건드린 표를 selectedTables 로 준다, S2-11),
 * 그리고 작업 중 표시를 따로 단다 — 그 세션이 목록에 없거나 그 표를 고르지 않았어도 단다. 내 세션은 달지 않는다.
 */
function viewersByTable(state: ErdState, mySession: string, now: number | undefined): Map<string, ErdNodeViewer[]> {
  const claimOf = new Map<string, ErdClaim>();
  for (const c of state.claims) if (!isPast(c.expiresAt, now)) claimOf.set(`${c.tableId}|${c.session}`, c);
  const out = new Map<string, ErdNodeViewer[]>();
  const seen = new Set<string>();
  const add = (table: string, v: ErdNodeViewer) => {
    const key = `${table}|${v.session}`;
    if (seen.has(key)) return;
    seen.add(key);
    const list = out.get(table) ?? [];
    list.push(v);
    out.set(table, list);
  };
  const bySession = new Map<string, ErdPresence>();
  for (const p of state.presence) {
    bySession.set(p.session, p);
    if (p.session === mySession || isPast(p.expiresAt, now)) continue;
    for (const t of p.selectedTables) {
      const c = claimOf.get(`${t}|${p.session}`);
      // 작업 중 표시는 접속과 따로 산다(규칙 6). 시한 접속이 먼저 끝나도 작업 중 표시가 끝날 때까지 이름표를 남긴다.
      const until = p.expiresAt && c ? laterIso(p.expiresAt, c.expiresAt) : p.expiresAt ?? null;
      add(t, { session: p.session, userId: p.userId, source: p.source, claimed: !!c, until, claimUntil: c?.expiresAt ?? null });
    }
  }
  for (const c of claimOf.values()) {
    if (c.session === mySession) continue;
    add(c.tableId, {
      session: c.session, userId: c.userId, source: bySession.get(c.session)?.source ?? sourceOfSession(c.session),
      claimed: true, until: c.expiresAt, claimUntil: c.expiresAt,
    });
  }
  return out;
}

/** now 에 지난 이름표를 뺀다. 작업 중 표시만 지났으면 이름표는 남기고 작업 중을 끈다. 바뀐 것이 없으면 같은 배열(참조 안정). */
export function viewersAt(viewers: ErdNodeViewer[], now: number): ErdNodeViewer[] {
  let changed = false;
  const out: ErdNodeViewer[] = [];
  for (const v of viewers) {
    if (v.until && Date.parse(v.until) <= now) {
      changed = true;
      continue;
    }
    if (v.claimed && v.claimUntil && Date.parse(v.claimUntil) <= now) {
      changed = true;
      out.push({ ...v, claimed: false, claimUntil: null });
      continue;
    }
    out.push(v);
  }
  return changed ? out : viewers;
}

/** now 뒤의 가장 이른 만료 시각(작업 중 표시·시한 접속자). 없으면 null. 화면은 이때 시계를 올려 이름표를 다시 거른다(S2-26). */
export function nextExpiry(state: Pick<ErdState, "claims" | "presence">, now: number): number | null {
  let next: number | null = null;
  const consider = (iso: string | null | undefined) => {
    if (!iso) return;
    const t = Date.parse(iso);
    if (Number.isFinite(t) && t > now && (next === null || t < next)) next = t;
  };
  for (const c of state.claims) consider(c.expiresAt);
  for (const p of state.presence) consider(p.expiresAt);
  return next;
}

export function buildFlow(i: BuildFlowInput): ErdFlow {
  if (!i.diagramId) return EMPTY_FLOW;
  const m = i.state.model;
  const placed = Object.values(i.state.nodes)
    .filter((n) => n.diagram === i.diagramId && m.tables[n.table])
    .sort((a, b) => m.tables[a.table].phys.localeCompare(m.tables[b.table].phys));
  const at = new Map(placed.map((n) => [n.table, n] as const));
  const marks = keyMarks(m);
  const ukCols = new Set(Object.values(m.keys).filter((k) => k.kind === "UK").flatMap((k) => k.columns));

  // 1. 표마다 그릴 컬럼(확대율과 무관). 접기를 먼저 적용하고(foldRows), 감사 보기가 꺼져 있으면 감사 컬럼을 뺀다.
  const shown = new Map<string, string[]>();
  const auditHiddenOf = new Map<string, number>();
  for (const n of placed) {
    const order = m.tables[n.table].columnOrder.filter((c) => m.columns[c]);
    const foldRows = i.preset === "overview" || n.foldMode === "NAME" ? []
      : n.foldMode === "KEYS" ? order.filter((c) => (marks.get(c) ?? "") !== "" || ukCols.has(c))
      : order;
    const rows = i.showAudit ? foldRows : foldRows.filter((c) => !isAuditColumnId(m, c));
    shown.set(n.table, rows);
    auditHiddenOf.set(n.table, foldRows.length - rows.length);
  }
  const visible = new Map([...shown].map(([t, rows]) => [t, new Set(rows)] as const));

  // 2. 선과 선이 쓰는 컬럼 손잡이
  const heads = candidateHeads(m);
  const handles = new Map<string, HandleSpec[]>();
  const need = (col: string, h: HandleSpec) => {
    const list = handles.get(col) ?? [];
    if (!list.some((x) => x.id === h.id)) list.push(h);
    handles.set(col, list);
  };
  const edges: ErdFlowEdge[] = [];
  for (const [id, r] of Object.entries(m.relations).sort(([a], [b]) => a.localeCompare(b))) {
    const head = isRankedCandidate(r) ? heads.get(candidateGroup(r)) : undefined;
    if (head ? head.id !== id : !isDrawn(r)) continue;
    if (r.pairs.length === 0) continue;
    const c = at.get(r.child);
    const p = at.get(r.parent);
    if (!c || !p) continue;
    const sides = relationSides(c.x, p.x, r.child === r.parent);
    const [childCol, parentCol] = r.pairs[0];
    const childRow = visible.get(r.child)!.has(childCol);
    const parentRow = visible.get(r.parent)!.has(parentCol);
    const src: HandleSpec = { id: handleId(childCol, sides.child, "source"), type: "source", side: sides.child };
    const tgt: HandleSpec = { id: handleId(parentCol, sides.parent, "target"), type: "target", side: sides.parent };
    if (childRow) need(childCol, src);
    if (parentRow) need(parentCol, tgt);
    edges.push({
      id, type: "erdRelation", source: r.child, target: r.parent,
      sourceHandle: childRow && !i.namesOnly ? src.id : handleId(null, sides.child, "source"),
      // 자기 참조가 표 머리에 붙으면 두 끝이 같은 점(머리 오른쪽)이 되어 선이 접힌다. 부모 끝을 머리 왼쪽에 붙여 표를 돌아가게 한다.
      targetHandle: parentRow && !i.namesOnly ? tgt.id : handleId(null, r.child === r.parent ? "L" : sides.parent, "target"),
      selectable: false, focusable: false,
      data: {
        state: r.state, folded: head ? head.folded : 0,
        zeroChild: r.cardinality.child.startsWith("ZERO"),
      },
    });
  }

  // 3. 노드
  const viewers = viewersByTable(i.state, i.mySession, i.now);
  const physical = i.mode === "physical";
  const both = i.preset === "both";
  const nodes = placed.map((n): ErdFlowNode => {
    const t = m.tables[n.table];
    const total = t.columnOrder.filter((c) => m.columns[c]).length;
    const rows = shown.get(n.table)!.map((cid): ErdRowView => {
      const c = m.columns[cid];
      const st = i.statuses[cid] as ErdColumnStatus | undefined;
      return {
        id: cid,
        key: marks.get(cid) ?? "",
        name: physical && !both ? c.phys : c.logical || c.phys,
        nameSub: both ? c.phys : null,
        sub: !physical && !both ? (c.domainId != null ? i.domains[String(c.domainId)]?.name ?? "" : "") : typeText(c),
        tone: st === "MISS" ? "miss" : st === "TYPE" || st === "DOMAIN" ? "warn" : null,
        handles: handles.get(cid) ?? NO_HANDLES,
      };
    });
    const auditHidden = auditHiddenOf.get(n.table) ?? 0;
    // 접기로 가린 수 = 전체 - 접기 뒤 행(= 지금 행 + 감사로 뺀 행). 감사 보기 전환에 흔들리지 않는다.
    const hiddenCount = i.preset === "overview" ? 0 : total - (rows.length + auditHidden);
    // 고칠 위반 수 = 요약 줄·왼쪽 목록·[표준 위반] 탭과 같은 규칙(U25, 감사 컬럼은 감사 보기일 때만)
    const violations = countTableViolations(m, n.table, i.statuses, i.showAudit);
    // 행은 namesOnly 와 상관없이 만든다 — 높이는 늘 상세 단계 높이다(개요 단계 상자 높이 = boxHeight, U50).
    const boxHeight = nodeHeight(rows.length, hiddenCount > 0);
    return {
      id: n.table, type: "erdTable", position: { x: n.x, y: n.y },
      data: {
        title: physical ? t.phys : t.logical || t.phys, subtitle: physical ? t.logical : t.phys,
        logicalName: t.logical, physName: t.phys, boxHeight,
        rows, hiddenCount, auditHidden, violations, viewers: viewers.get(n.table) ?? NO_VIEWERS,
      },
      selected: i.selected.has(n.table),
      initialWidth: NODE_WIDTH, initialHeight: boxHeight,
    };
  });
  return { nodes, edges };
}

// ── 참조 재사용. 룰 세트 편집기 canvas/reuse.ts 와 같은 방식이다. 그 파일은 shared 복사 대상(Task 6)이 아니어서 여기 둔다. ──

const isPlain = (v: unknown): v is Record<string, unknown> => {
  if (v === null || typeof v !== "object") return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

function sameValue(a: unknown, b: unknown, depth: number): boolean {
  if (Object.is(a, b)) return true;
  if (depth <= 0) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let k = 0; k < a.length; k++) if (!sameValue(a[k], b[k], depth - 1)) return false;
    return true;
  }
  if (!isPlain(a) || !isPlain(b) || Array.isArray(b)) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) if (!Object.prototype.hasOwnProperty.call(b, k) || !sameValue(a[k], b[k], depth - 1)) return false;
  return true;
}

/** 노드 → data → rows → 행 → handles → 손잡이까지 견주는 깊이. */
const REUSE_DEPTH = 7;

/** next 의 항목마다 prev 에서 같은 id 를 찾아 내용이 같으면 prev 참조를 쓴다. 모두 같은 자리에서 재사용되면 prev 배열 자체를 돌려준다. */
export function reuseById<T extends { id: string }>(prev: readonly T[] | null, next: readonly T[]): T[] {
  if (!prev) return next as T[];
  const byId = new Map(prev.map((x) => [x.id, x] as const));
  let all = prev.length === next.length;
  const out = next.map((x, k) => {
    const p = byId.get(x.id);
    const kept = p !== undefined && sameValue(p, x, REUSE_DEPTH) ? p : x;
    if (kept !== prev[k]) all = false;
    return kept;
  });
  return all ? (prev as T[]) : out;
}

/** 렌더마다 새로 만든 배열을 이전 결과와 구조적으로 공유한 배열로 바꾼다. */
export function useStableById<T extends { id: string }>(raw: readonly T[]): T[] {
  const last = useRef<T[] | null>(null);
  return useMemo(() => {
    const out = reuseById(last.current, raw);
    last.current = out;
    return out;
  }, [raw]);
}
