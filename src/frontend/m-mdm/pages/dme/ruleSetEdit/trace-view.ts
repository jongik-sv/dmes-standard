/**
 * 실행 기록 해석(2단계 계획 P9) — 서버 기록 실행(`execute`) 의 RunTrace 를 단계별 프레임·캔버스 겹침·값 표로 푼다.
 * 디버거(Task 11)가 쓴다. React 의존 없는 순수 함수이고, 무거운 계산은 호출자가 useMemo 로 한 번만 부른다(Local-Rules §16).
 *
 * ctx 는 엔진 `FlowRun` 을 따라간다: 처음은 input, RULE(OK) 는 지금 범위의 ctx 에 결과를 덮어쓴다(이름은 대소문자 무시로
 * 바꿔 넣는다 — `RecordKeys.putReplacing`). PARALLEL 은 갈래마다 분기 직전 ctx 의 사본을 범위로 두고, 짝 MERGE 에서
 * 갈래를 기록의 `order`(실행 순서)대로 돌며 **그 갈래가 쓴 이름**만 바깥 범위에 덮어쓴다(뒤 갈래가 이긴다). IF 는 범위를 만들지 않는다.
 */
import type { NodeTrace, RunTrace, RuleSetFlow, TypedValue } from "@/contract/engine-contract.generated";

import type { EdgeState, NodeOverlay, Overlay } from "./canvas/overlay";
import { parseFlow, type Seq } from "./flow-model";

export type { EdgeState, NodeOverlay, NodeState, Overlay } from "./canvas/overlay";

export interface TraceFrame { index: number; node: NodeTrace; ctx: Record<string, TypedValue>; changed: string[]; }
export interface ValueTable { vars: string[]; cols: { index: number; nodeId: string; label: string }[]; cells: (TypedValue | null)[][]; changed: boolean[][]; }

type Ctx = Record<string, TypedValue>;
/** 루트에서 노드까지 지나는 병렬 갈래(분기 ID, 갈래 선 ID). IF 갈래는 넣지 않는다. */
type ScopePath = ReadonlyArray<{ split: string; edge: string }>;
interface Scope { ctx: Ctx; made: Ctx; }

// ── 값 ─────────────────────────────────────────────────────────────────────────

/** 십진 문자열을 비교용 정규형으로(부호·앞 0·뒤 0 정리). 십진 표기가 아니면 null. */
function normDecimal(s: string): string | null {
  const m = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(s.trim());
  if (!m || (m[2] === "" && (m[3] ?? "") === "")) return null;
  const int = m[2].replace(/^0+/, "");
  const frac = (m[3] ?? "").replace(/0+$/, "");
  if (int === "" && frac === "") return "0";
  return `${m[1] === "-" ? "-" : ""}${int || "0"}${frac ? `.${frac}` : ""}`;
}

function sameNumber(a: string, b: string): boolean {
  const x = normDecimal(a);
  const y = normDecimal(b);
  if (x != null && y != null) return x === y;
  return a === b || (a.trim() !== "" && b.trim() !== "" && Number(a) === Number(b));
}

/** TypedValue 비교 — type 이 같고 NUMBER 는 값 비교(1.10 == 1.1), LIST 는 원소별. 없음(null·undefined)은 없음과만 같다. */
function sameTyped(a: TypedValue | null | undefined, b: TypedValue | null | undefined): boolean {
  if (a == null || b == null) return a == null && b == null;
  if (a.type !== b.type) return false;
  switch (a.type) {
    case "NULL":
      return true;
    case "NUMBER":
      return sameNumber(a.value, (b as typeof a).value);
    case "LIST": {
      const items = (b as typeof a).items;
      return a.items.length === items.length && a.items.every((v, i) => sameTyped(v, items[i]));
    }
    default:
      return a.value === (b as typeof a).value;
  }
}

/** 값 글자 — NULL·없음은 `NULL`, NUMBER·STRING·BOOLEAN 은 value, LIST 는 `[a, b]`. */
export function typedText(v: TypedValue | null | undefined): string {
  if (v == null || v.type === "NULL") return "NULL";
  if (v.type === "LIST") return `[${v.items.map(typedText).join(", ")}]`;
  return v.value;
}

/** 이름으로 찾기 — 같은 이름이 먼저, 없으면 대소문자 무시. */
function lookup(ctx: Ctx, name: string): TypedValue | undefined {
  if (Object.prototype.hasOwnProperty.call(ctx, name)) return ctx[name];
  const lower = name.toLowerCase();
  const key = Object.keys(ctx).find((k) => k.toLowerCase() === lower);
  return key === undefined ? undefined : ctx[key];
}

/** 엔진 `RecordKeys.putReplacing` — 대소문자만 다른 옛 키를 지우고 넣는다. */
function putReplacing(ctx: Ctx, name: string, value: TypedValue): void {
  const lower = name.toLowerCase();
  for (const k of Object.keys(ctx)) if (k !== name && k.toLowerCase() === lower) delete ctx[k];
  ctx[name] = value;
}

// ── 프레임 ─────────────────────────────────────────────────────────────────────

/** 노드 → 병렬 갈래 경로. MERGE 는 짝 분기와 같은 경로, START·END·트리에 없는 노드는 루트([]). */
function scopePaths(flow: RuleSetFlow): { paths: Map<string, ScopePath>; branchEdges: Map<string, string[]> } {
  const paths = new Map<string, ScopePath>();
  const branchEdges = new Map<string, string[]>();
  const tree = parseFlow(flow).tree;
  if (!tree) return { paths, branchEdges };
  const walk = (s: Seq, path: ScopePath) => {
    for (const b of s.items) {
      if (b.type === "RULE") paths.set(b.nodeId, path);
      else if (b.type === "SEQ") walk(b, path);
      else {
        paths.set(b.nodeId, path);
        paths.set(b.mergeId, path);
        if (b.kind === "PARALLEL") branchEdges.set(b.nodeId, b.branches.map((br) => br.edgeId));
        for (const br of b.branches) walk(br.body, b.kind === "PARALLEL" ? [...path, { split: b.nodeId, edge: br.edgeId }] : path);
      }
    }
  };
  walk(tree.root, []);
  return { paths, branchEdges };
}

/** 단계(= trace.nodes 순번)마다 그 노드를 실행한 뒤 그 노드 범위의 ctx 사본과 바뀐 이름. */
export function frames(trace: RunTrace, flow: RuleSetFlow): TraceFrame[] {
  if (trace.nodes.length === 0) return [];
  const { paths, branchEdges } = scopePaths(flow);
  const root: Scope = { ctx: { ...trace.input }, made: {} };
  /** 병렬 분기 ID → 갈래 선 ID → 갈래 범위. */
  const branchScopes = new Map<string, Map<string, Scope>>();
  /** 병렬 분기 ID → 합칠 갈래 순서(기록의 order). */
  const mergeOrder = new Map<string, string[]>();

  const scopeOf = (path: ScopePath): Scope => {
    for (let i = path.length - 1; i >= 0; i--) {
      const s = branchScopes.get(path[i].split)?.get(path[i].edge);
      if (s) return s;
    }
    return root;
  };
  const put = (scope: Scope, name: string, value: TypedValue) => {
    putReplacing(scope.ctx, name, value);
    putReplacing(scope.made, name, value);
  };

  return trace.nodes.map((node, index) => {
    const path = paths.get(node.nodeId) ?? [];
    const scope = scopeOf(path);
    const changed: string[] = [];
    const note = (name: string, before: TypedValue | undefined, after: TypedValue) => {
      if (!sameTyped(before, after) && !changed.includes(name)) changed.push(name);
    };

    if (node.status === "OK") {
      if (node.kind === "RULE" && node.result) {
        for (const [name, value] of Object.entries(node.result.results)) {
          note(name, lookup(scope.ctx, name), value);
          put(scope, name, value);
        }
      } else if (node.kind === "PARALLEL") {
        const edges = branchEdges.get(node.nodeId) ?? node.order ?? [];
        branchScopes.set(node.nodeId, new Map(edges.map((e) => [e, { ctx: { ...scope.ctx }, made: {} }])));
        mergeOrder.set(node.nodeId, node.order ?? edges);
      } else if (node.kind === "MERGE") {
        const splitId = node.splitId ?? flow.nodes.find((n) => n.id === node.nodeId)?.splitId ?? null;
        const branches = splitId == null ? undefined : branchScopes.get(splitId);
        if (splitId != null && branches) {
          const before = { ...scope.ctx };
          const written: string[] = [];
          for (const edge of mergeOrder.get(splitId) ?? [...branches.keys()]) {
            for (const [name, value] of Object.entries(branches.get(edge)?.made ?? {})) {
              put(scope, name, value);
              if (!written.includes(name)) written.push(name);
            }
          }
          for (const name of written) note(name, lookup(before, name), lookup(scope.ctx, name)!);
          branchScopes.delete(splitId);
        }
      }
    }
    return { index, node, ctx: { ...scope.ctx }, changed };
  });
}

// ── 캔버스 겹침 ────────────────────────────────────────────────────────────────

function chipOf(node: NodeTrace): string | null {
  if (node.status === "ERROR") return node.violations?.[0]?.code ?? null;
  if (node.kind === "RULE" && node.result) {
    const first = Object.entries(node.result.results)[0];
    return first ? `${first[0]}=${typedText(first[1])}` : null;
  }
  return null;
}

/** 단계 k 의 겹침 — nodes[0..k] 실행, nodes[k] 가 지금 노드. 기록이 비면 모든 노드 pending·선 idle. */
export function overlayAt(trace: RunTrace, flow: RuleSetFlow, step: number): Overlay {
  const n = trace.nodes.length;
  const k = n === 0 ? -1 : Math.min(Math.max(Math.trunc(step), 0), n - 1);
  const last = n > 0 && k === n - 1;
  const rest: NodeOverlay["state"] = last ? "dim" : "pending";

  const done = new Map<string, NodeTrace>();
  for (let i = 0; i <= k; i++) done.set(trace.nodes[i].nodeId, trace.nodes[i]);

  const nodes: Record<string, NodeOverlay> = {};
  for (const fn of flow.nodes) nodes[fn.id] = { state: rest, seq: null, chip: null };
  for (let i = 0; i <= k; i++) {
    const t = trace.nodes[i];
    const state = t.status === "ERROR" ? "error" : i === k ? "current" : "run";
    nodes[t.nodeId] = { state, seq: t.seq, chip: chipOf(t) };
  }

  const edges: Record<string, EdgeState> = {};
  for (const e of flow.edges) {
    const from = done.get(e.from);
    if (from && from.kind === "IF") edges[e.id] = e.id === from.chosenEdgeId ? "chosen" : "dim";
    else if (from && done.has(e.to)) edges[e.id] = "run";
    else edges[e.id] = last ? "dim" : "idle";
  }
  return { nodes, edges };
}

// ── 값 표 ──────────────────────────────────────────────────────────────────────

/** 변수 × 단계 표. 열은 RULE(OK) 프레임과 병렬 합류 프레임, 칸은 그 프레임 범위의 값. */
export function valueTable(trace: RunTrace, flow: RuleSetFlow): ValueTable {
  const fr = frames(trace, flow);
  const kindOf = new Map(flow.nodes.map((fn) => [fn.id, fn.kind]));
  const isParallelMerge = (t: NodeTrace) =>
    t.kind === "MERGE" && (t.merged != null || (t.splitId != null && kindOf.get(t.splitId) === "PARALLEL"));
  const colFrames = fr.filter((f) => f.node.status === "OK" && ((f.node.kind === "RULE" && f.node.result) || isParallelMerge(f.node)));

  const vars = Object.keys(trace.input);
  for (const f of fr) {
    if (f.node.status !== "OK" || !f.node.result) continue;
    for (const name of Object.keys(f.node.result.results)) if (!vars.includes(name)) vars.push(name);
  }

  const cols = colFrames.map((f) => ({
    index: f.index,
    nodeId: f.node.nodeId,
    label: f.node.kind === "RULE" ? (f.node.ruleId ?? f.node.nodeId) : `합류 ${f.node.nodeId}`,
  }));
  const cells = vars.map((v) => colFrames.map((f) => lookup(f.ctx, v) ?? null));
  const changed = vars.map((v, i) => {
    let prev: TypedValue | null = lookup(trace.input, v) ?? null;
    return cells[i].map((cell) => {
      const diff = !sameTyped(cell, prev);
      prev = cell;
      return diff;
    });
  });
  return { vars, cols, cells, changed };
}
