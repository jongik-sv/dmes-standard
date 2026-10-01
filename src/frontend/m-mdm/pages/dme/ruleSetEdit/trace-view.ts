/**
 * 실행 기록 해석(2단계 계획 P9) — 서버 기록 실행(`execute`) 의 RunTrace 를 단계별 프레임·캔버스 겹침·값 표로 푼다.
 * 디버거(Task 11)가 쓴다. React 의존 없는 순수 함수이고, 무거운 계산은 호출자가 useMemo 로 한 번만 부른다(Local-Rules §16).
 *
 * ctx 는 엔진 `FlowRun` 을 따라간다: 처음은 input, RULE(OK) 는 지금 범위의 ctx 에 결과를 덮어쓴다(이름은 대소문자 무시로
 * 바꿔 넣는다 — `RecordKeys.putReplacing`). PARALLEL 은 갈래마다 분기 직전 ctx 의 사본을 범위로 두고, 짝 MERGE 에서
 * 갈래를 기록의 `order`(실행 순서)대로 돌며 **그 갈래가 쓴 이름**만 바깥 범위에 덮어쓴다(뒤 갈래가 이긴다). IF 는 범위를 만들지 않는다.
 * 4단계 E4: 기록의 `edits` 를 노드 seq 직전에 그 노드 범위에 넣는다(엔진 `FlowRun` 퍼짐 규칙 — 스펙 §2.2).
 * 받는 노드(받는 노드 spec §4·§9, implicit-join spec §11): CATCH 노드는 CATCH_* 넷을 그 범위 ctx 에 넣고(made 에는 넣지 않는다), 받는 노드 블록의
 * 돌아오는 자리(옛 형식이면 돌아오는 합류) 기록은 고친 값 전에 그 자리를 끝으로 하는 블록을 안쪽부터 블록 직전 값으로 되돌리며, END 는 지운다.
 * 병렬 갈래 안에서 끝냈으면(받는 노드·IF 끝냄 모두) END 앞에서 열린 갈래를 합류 규칙대로 합친다. CAUGHT 룰은 겹침 상태 `caught` 다.
 */
import type { CatchKind, NodeTrace, RunTrace, RuleSetFlow, TraceEdit, TypedValue } from "@/contract/engine-contract.generated";

import type { EdgeState, NodeOverlay, Overlay } from "./canvas/overlay";
import { CATCH_KIND_LABEL } from "./catch-text";
import { CATCH_NAMES, parseFlow, type Seq } from "./flow-model";

export type { EdgeState, NodeOverlay, NodeState, Overlay } from "./canvas/overlay";

/** 단계 프레임 — `before` 는 노드를 실행하기 전 그 노드 범위의 ctx 사본(3단계 P9: MERGE 는 합치기 전, PARALLEL 은 갈래 범위를 만들기 전), `ctx` 는 실행 뒤. `edited` 는 이 노드 직전에 고친 이름(edit 의 철자, 4단계 E4). */
export interface TraceFrame { index: number; node: NodeTrace; before: Record<string, TypedValue>; ctx: Record<string, TypedValue>; changed: string[]; edited: string[]; }
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

/** TypedValue 비교 — type 이 같고 NUMBER 는 값 비교(1.10 == 1.1), LIST 는 원소별. 없음(null·undefined)은 없음과만 같다. 디버거 모델(3단계 P9)도 쓴다. */
export function sameTyped(a: TypedValue | null | undefined, b: TypedValue | null | undefined): boolean {
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

/** ctx 에 있는 CATCH_* 값(엔진 `FlowRun.catchValues` — 이름 그대로 찾는다). */
function pickCatch(ctx: Ctx): Ctx {
  const out: Ctx = {};
  for (const n of CATCH_NAMES) if (Object.prototype.hasOwnProperty.call(ctx, n)) out[n] = ctx[n];
  return out;
}

/** CATCH_* 를 지우고 saved 를 넣는다(엔진 `FlowRun.restoreCatch` — 이름 그대로 지운다). */
function restoreCatch(ctx: Ctx, saved: Ctx): void {
  for (const n of CATCH_NAMES) delete ctx[n];
  Object.assign(ctx, saved);
}

/** CATCH 노드 기록이 넣는 네 값(엔진 `FlowRun.catchNode` 순서 — CATCH_NAMES 와 같다). 노드 상세(TraceDetail)도 쓴다. */
export function catchValues(node: NodeTrace): Record<string, TypedValue> {
  return {
    CATCH_KIND: { type: "STRING", value: node.catchKind ?? "" },
    CATCH_RULE: { type: "STRING", value: node.ruleId ?? "" },
    CATCH_CODE: { type: "STRING", value: node.code ?? "" },
    CATCH_MSG: { type: "STRING", value: node.message ?? "" },
  };
}

// ── 프레임 ─────────────────────────────────────────────────────────────────────

const NULL_TYPED: TypedValue = { type: "NULL" };

/** 적용되는 고친 값 — beforeSeq 자리 노드 ID 가 edit.nodeId 와 같은 것만(기록 순서). 서버는 어긋나면 EDIT_POINT_MISMATCH 로 멈춘다. */
export function validEdits(trace: RunTrace): TraceEdit[] {
  const edits = trace.edits ?? [];
  if (edits.length === 0) return [];
  const idAt = new Map(trace.nodes.map((n) => [n.seq, n.nodeId] as const));
  return edits.filter((e) => idAt.get(e.beforeSeq) === e.nodeId);
}

/** 노드 → 병렬 갈래 경로. MERGE 는 짝 분기와 같은 경로, START·END·트리에 없는 노드는 루트([]). 받는 노드 블록의 단계·돌아오는 자리도 함께 모은다. */
function scopePaths(flow: RuleSetFlow): {
  paths: Map<string, ScopePath>;
  branchEdges: Map<string, string[]>;
  /** 돌아오는 자리(옛 형식이면 돌아오는 합류) → 그 자리를 끝으로 하는 받는 노드 블록의 단계 ID(안쪽 블록이 먼저). */
  guardJoins: Map<string, string[]>;
  /** 받는 노드가 붙은 단계 ID(RULE·TASK). */
  guardSteps: Set<string>;
} {
  const paths = new Map<string, ScopePath>();
  const branchEdges = new Map<string, string[]>();
  const guardJoins = new Map<string, string[]>();
  const guardSteps = new Set<string>();
  const tree = parseFlow(flow).tree;
  if (!tree) return { paths, branchEdges, guardJoins, guardSteps };
  const walk = (s: Seq, path: ScopePath) => {
    for (const b of s.items) {
      if (b.type === "RULE" || b.type === "TASK") paths.set(b.nodeId, path);
      else if (b.type === "SEQ") walk(b, path);
      else if (b.type === "GUARDED") {
        paths.set(b.step.nodeId, path);
        guardSteps.add(b.step.nodeId);
        if (b.mergeId) paths.set(b.mergeId, path);
        walk(b.normal, path);
        for (const h of b.handlers) {
          paths.set(h.catchNodeId, path);
          walk(h.body, path);
        }
        // 안쪽을 다 걸은 뒤에 넣으므로 같은 자리를 닫는 블록은 안쪽이 먼저다.
        if (b.joinId) guardJoins.set(b.joinId, [...(guardJoins.get(b.joinId) ?? []), b.step.nodeId]);
      } else {
        paths.set(b.nodeId, path);
        if (b.mergeId) paths.set(b.mergeId, path);
        if (b.kind === "PARALLEL") branchEdges.set(b.nodeId, b.branches.map((br) => br.edgeId));
        for (const br of b.branches) walk(br.body, b.kind === "PARALLEL" ? [...path, { split: b.nodeId, edge: br.edgeId }] : path);
      }
    }
  };
  walk(tree.root, []);
  return { paths, branchEdges, guardJoins, guardSteps };
}

/**
 * 단계(= trace.nodes 순번)마다 그 노드를 실행하기 전·뒤 그 노드 범위의 ctx 사본과 바뀐 이름.
 * 받는 노드(받는 노드 spec §4, implicit-join spec §11, R3·R4): 받는 노드가 붙은 단계 직전 그 범위의 CATCH_* 를 적어 두고, 돌아오는 자리는 고친 값 전에
 * 그 자리를 끝으로 하는 블록을 안쪽부터 그 값으로 되돌리며,
 * END 는 고친 값 전에 CATCH_* 를 지운다. CATCH 노드는 고친 값 뒤 CATCH_* 를 ctx 에만 넣는다. 병렬 갈래 안에서 끝냈으면(R5) END 는 CATCH_* 를
 * 지우기 전에 아직 열린 병렬 갈래를 안쪽부터 합류 규칙대로 합친다(엔진 `FlowRun.parallel` 의 `Ended` 처리).
 */
export function frames(trace: RunTrace, flow: RuleSetFlow): TraceFrame[] {
  if (trace.nodes.length === 0) return [];
  const { paths, branchEdges, guardJoins, guardSteps } = scopePaths(flow);
  const root: Scope = { ctx: { ...trace.input }, made: {} };
  const editsAt = new Map(validEdits(trace).map((e) => [e.beforeSeq, e] as const));
  /** 병렬 분기 ID → 갈래 선 ID → 갈래 범위. */
  const branchScopes = new Map<string, Map<string, Scope>>();
  /** 병렬 분기 ID → 합칠 갈래 순서(기록의 order). */
  const mergeOrder = new Map<string, string[]>();
  /** 받는 노드가 붙은 단계 ID → 그 단계 직전 그 범위의 CATCH_* 값(엔진 `FlowRun.guarded` 의 outer). */
  const outerCatch = new Map<string, Ctx>();

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

  /** 병렬 분기의 갈래 결과를 기록 순서대로 바깥 범위에 덮어쓴다(엔진 `mergeOuts`). 합친 이름(처음 나온 순서). */
  const mergeBranches = (splitId: string, branches: Map<string, Scope>, into: Scope): string[] => {
    const written: string[] = [];
    for (const edge of mergeOrder.get(splitId) ?? [...branches.keys()]) {
      for (const [name, value] of Object.entries(branches.get(edge)?.made ?? {})) {
        put(into, name, value);
        if (!written.includes(name)) written.push(name);
      }
    }
    branchScopes.delete(splitId);
    return written;
  };

  return trace.nodes.map((node, index) => {
    const path = paths.get(node.nodeId) ?? [];
    const scope = scopeOf(path);
    // R5 — 병렬 갈래 안에서 끝냈으면 합류 기록이 없다. 엔진은 끝난 형제 + 지금 갈래를 바깥에 합친 뒤 다시 던지므로 안쪽 분기부터 합친다.
    // 안 탄 갈래의 made 는 비어 있어 아무것도 쓰지 않는다. 끝내지 않은 기록은 END 에서 열린 분기가 없다.
    if (node.kind === "END") {
      for (const splitId of [...branchScopes.keys()].reverse()) mergeBranches(splitId, branchScopes.get(splitId)!, scopeOf(paths.get(splitId) ?? []));
    }
    // R3·R4 — 엔진은 받는 노드가 붙은 단계를 시작하기 전에 CATCH_* 를 적고, 돌아오는 자리·END 는 고친 값을 넣기 전에 CATCH_* 를 되돌리거나 지운다.
    if ((node.kind === "RULE" || node.kind === "TASK") && guardSteps.has(node.nodeId)) outerCatch.set(node.nodeId, pickCatch(scope.ctx));
    // 돌아오는 자리 — 그 자리를 끝으로 하는 블록을 안쪽부터, 블록 단계 직전 CATCH_* 가 적힌 것만 되돌린다. 범위는 받는 노드 블록의 범위다
    // (병렬 갈래 안 블록이 병렬 합류로 돌아오면 엔진은 갈래 범위에서 되돌린 뒤 합친다).
    for (const step of guardJoins.get(node.nodeId) ?? []) {
      const saved = outerCatch.get(step);
      if (saved === undefined) continue;
      restoreCatch(scopeOf(paths.get(step) ?? []).ctx, saved);
      outerCatch.delete(step);
    }
    if (node.kind === "END") restoreCatch(scope.ctx, {});
    // 4단계 E4 — 노드를 시작하기 직전에 그 노드 범위에 고친 값을 넣는다. 같은 이름이 그 범위 made 에 있으면 made 도 바꾼다(스펙 §2.2).
    const edited: string[] = [];
    const edit = editsAt.get(node.seq);
    if (edit) {
      for (const [name, raw] of Object.entries(edit.values ?? {})) {
        const value = raw ?? NULL_TYPED;
        putReplacing(scope.ctx, name, value);
        if (lookup(scope.made, name) !== undefined) putReplacing(scope.made, name, value);
        edited.push(name);
      }
    }
    const before = { ...scope.ctx };
    const changed: string[] = [];
    const note = (name: string, old: TypedValue | undefined, after: TypedValue) => {
      if (!sameTyped(old, after) && !changed.includes(name)) changed.push(name);
    };

    if (node.status === "OK") {
      if (node.kind === "RULE" && node.result) {
        for (const [name, value] of Object.entries(node.result.results)) {
          note(name, lookup(scope.ctx, name), value);
          put(scope, name, value);
        }
      } else if (node.kind === "CATCH") {
        for (const [name, value] of Object.entries(catchValues(node))) {
          note(name, lookup(scope.ctx, name), value);
          putReplacing(scope.ctx, name, value); // CATCH_* 는 made(최종 결과)에 넣지 않는다
        }
      } else if (node.kind === "PARALLEL") {
        const edges = branchEdges.get(node.nodeId) ?? node.order ?? [];
        branchScopes.set(node.nodeId, new Map(edges.map((e) => [e, { ctx: { ...scope.ctx }, made: {} }])));
        mergeOrder.set(node.nodeId, node.order ?? edges);
      } else if (node.kind === "MERGE") {
        const splitId = node.splitId ?? flow.nodes.find((n) => n.id === node.nodeId)?.splitId ?? null;
        const branches = splitId == null ? undefined : branchScopes.get(splitId);
        if (splitId != null && branches) {
          const written = mergeBranches(splitId, branches, scope);
          // 엔진 FlowRun 은 갈래를 합친 뒤 merge() 에서 edit 를 넣는다 — 고친 값이 합친 값을 이긴다(made 에 이미 있으면 made 도).
          if (edit) {
            for (const [name, raw] of Object.entries(edit.values ?? {})) {
              const value = raw ?? NULL_TYPED;
              putReplacing(scope.ctx, name, value);
              if (lookup(scope.made, name) !== undefined) putReplacing(scope.made, name, value);
            }
          }
          for (const name of written) note(name, lookup(before, name), lookup(scope.ctx, name)!);
        }
      }
    }
    return { index, node, before, ctx: { ...scope.ctx }, changed, edited };
  });
}

// ── 캔버스 겹침 ────────────────────────────────────────────────────────────────

/** 칩 — 오류 코드, 받은 룰은 바로 뒤 CATCH 기록의 종류 이름, CATCH 노드는 자기 종류 이름(R16), 룰은 첫 결과. */
function chipOf(node: NodeTrace, next?: NodeTrace): string | null {
  if (node.status === "ERROR") return node.violations?.[0]?.code ?? null;
  if (node.status === "CAUGHT") return next?.kind === "CATCH" && next.catchKind ? CATCH_KIND_LABEL[next.catchKind as CatchKind] : null;
  if (node.kind === "CATCH" && node.catchKind) return CATCH_KIND_LABEL[node.catchKind as CatchKind];
  if (node.kind === "RULE" && node.result) {
    const first = Object.entries(node.result.results)[0];
    return first ? `${first[0]}=${typedText(first[1])}` : null;
  }
  return null;
}

/** 실행된 노드의 겹침 상태 — ERROR 는 error, CAUGHT(받는 노드로 넘긴 룰)는 caught, 나머지 run. */
const doneState = (t: NodeTrace): NodeOverlay["state"] => (t.status === "ERROR" ? "error" : t.status === "CAUGHT" ? "caught" : "run");

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
    const state = t.status === "ERROR" ? "error" : t.status === "CAUGHT" ? "caught" : i === k ? "current" : "run";
    nodes[t.nodeId] = { state, seq: t.seq, chip: chipOf(t, trace.nodes[i + 1]) };
  }

  const edges: Record<string, EdgeState> = {};
  for (const e of flow.edges) {
    const from = done.get(e.from);
    if (from && from.status === "CAUGHT") edges[e.id] = last ? "dim" : "idle"; // 받은 룰의 정상 갈래 선은 타지 않았다
    else if (from && from.kind === "IF") edges[e.id] = e.id === from.chosenEdgeId ? "chosen" : "dim";
    else if (from && done.has(e.to)) edges[e.id] = "run";
    else edges[e.id] = last ? "dim" : "idle";
  }
  return { nodes, edges };
}

/**
 * 디버그 커서 k 의 겹침(3단계 P9·P-D13) — 커서 k 는 "노드 k 실행 전"이다. nodes[0..k-1] 실행(ERROR 면 error, CAUGHT 면 caught)·순번·칩, nodes[k] 지금(순번·칩 없음),
 * nodes[k+1] 다음, 나머지 흐름 노드 pending. 선은 실행된 IF 에서 나가면 chosen/dim, 양 끝이 실행됐으면 run, 실행된 노드에서 지금 노드로 들어오면 run, 나머지 idle.
 * k ≥ n 이면 끝 — 2단계 최종 겹침(안 탄 갈래 dim). 기록이 비면 모두 pending.
 */
export function debugOverlay(trace: RunTrace, flow: RuleSetFlow, cursor: number): Overlay {
  const o = debugOverlayAt(trace, flow, cursor);
  // 4단계 E4 — 고친 지점 노드에 표시(커서와 무관하게, 끝 겹침에서도). overlayAt·debugOverlayAt 은 늘 새 객체를 돌려준다.
  for (const e of validEdits(trace)) {
    const cur = o.nodes[e.nodeId];
    if (cur) o.nodes[e.nodeId] = { ...cur, edited: true };
  }
  return o;
}

function debugOverlayAt(trace: RunTrace, flow: RuleSetFlow, cursor: number): Overlay {
  const n = trace.nodes.length;
  const k = Math.max(0, Math.trunc(cursor));
  if (k >= n) return overlayAt(trace, flow, n > 0 ? n - 1 : 0);

  const done = new Map<string, NodeTrace>();
  for (let i = 0; i < k; i++) done.set(trace.nodes[i].nodeId, trace.nodes[i]);
  const currentId = trace.nodes[k].nodeId;

  const nodes: Record<string, NodeOverlay> = {};
  for (const fn of flow.nodes) nodes[fn.id] = { state: "pending", seq: null, chip: null };
  for (let i = 0; i < k; i++) {
    const t = trace.nodes[i];
    nodes[t.nodeId] = { state: doneState(t), seq: t.seq, chip: chipOf(t, trace.nodes[i + 1]) };
  }
  nodes[currentId] = { state: "current", seq: null, chip: null };
  if (k + 1 < n) nodes[trace.nodes[k + 1].nodeId] = { state: "next", seq: null, chip: null };

  const edges: Record<string, EdgeState> = {};
  for (const e of flow.edges) {
    const from = done.get(e.from);
    if (from && from.status === "CAUGHT") edges[e.id] = "idle"; // 받은 룰의 정상 갈래 선 — 돌아오는 합류가 실행돼도 칠하지 않는다
    else if (from && from.kind === "IF") edges[e.id] = e.id === from.chosenEdgeId ? "chosen" : "dim";
    else if (from && (done.has(e.to) || e.to === currentId)) edges[e.id] = "run";
    else edges[e.id] = "idle";
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
