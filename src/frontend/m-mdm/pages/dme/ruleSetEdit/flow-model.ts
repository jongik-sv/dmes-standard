/**
 * 룰 세트 흐름 구조 해석 — 엔진 `kr.dongkuk.maru.mdm.engine.flow.FlowParser`·`FlowTree` 의 TS 짝(spec §3.2, 계획 C2·C3).
 * 구조 검사 문구·순서, 블록 트리, 노드 관계가 Java 와 같아야 하고 `rule-set-corpus.json` 의 흐름 사례가 두 구현을 묶는다.
 * 알고리즘을 바꾸면 Java 쪽과 코퍼스를 함께 바꾼다. React 의존 없는 순수 함수다.
 *
 * 중복 노드 ID 는 첫 노드만 본다(a 오류로 보고한다). 빠진 칸(undefined)은 null 로 본다 — 서버 FLOW_JSON 과 코퍼스가 null 칸을 뺄 수 있다.
 */
import type { CatchKind, FlowEdge, FlowNode, FlowNodeKind, RuleSetFlow } from "@/contract/engine-contract.generated";

export type FlowIssueCode = "FLOW_STRUCTURE" | "FLOW_IF_ELSE" | "FLOW_CATCH";

export interface FlowIssue {
  code: FlowIssueCode;
  nodeId: string | null;
  edgeId: string | null;
  message: string;
}

export interface Seq {
  type: "SEQ";
  items: Block[];
}

export interface RuleStep {
  type: "RULE";
  nodeId: string;
  ruleId: string;
}

/** 빈 단계(TASK) 노드 하나 — 읽거나 만드는 것 없이 지나간다(4단계 spec §1.1). 엔진 `flow.TaskStep` 의 짝(Task 2). */
export interface TaskStep {
  type: "TASK";
  nodeId: string;
}

export interface Branch {
  edgeId: string;
  cond: string | null;
  otherwise: boolean;
  label: string | null;
  body: Seq;
}

/** branches 는 실행 순서(IF: order 오름차순 뒤 그 외, PARALLEL: order 오름차순). */
export interface Split {
  type: "SPLIT";
  nodeId: string;
  kind: "IF" | "PARALLEL";
  mergeId: string;
  branches: Branch[];
}

/** 처리 갈래 하나(받는 노드 spec §3) — 엔진 `flow.Guarded.Handler` 짝. ends = END 로 가서 세트를 끝낸다. */
export interface Handler {
  catchNodeId: string;
  kinds: CatchKind[];
  body: Seq;
  ends: boolean;
}

/**
 * 받는 노드가 붙은 룰(받는 노드 spec §3) — 엔진 `flow.Guarded` 짝. 돌아오는 처리 갈래가 없으면 normal 은 비고 mergeId 는 null 이다.
 * 맨 위에 nodeId 를 두지 않는다 — 블록을 걷는 코드가 GUARDED 를 빼먹으면 tsc 가 `b.kind`·`b.nodeId` 에서 막는다.
 */
export interface Guarded {
  type: "GUARDED";
  rule: RuleStep;
  normal: Seq;
  handlers: Handler[];
  mergeId: string | null;
}

export type Block = Seq | RuleStep | TaskStep | Split | Guarded;

/** 받는 종류의 저장 순서(엔진 `CatchKind` 선언 순서). */
export const CATCH_KINDS: readonly CatchKind[] = ["NO_RESULT", "INPUT_ERROR", "EVAL_ERROR", "HIT_CONFLICT"];
/** 받는 노드를 붙일 수 있는 노드 종류(엔진 `FlowParser.catchable`). 하위 세트 호출 스펙이 SET 을 더한다. */
export const CATCHABLE: ReadonlySet<FlowNodeKind> = new Set<FlowNodeKind>(["RULE"]);
const isCatchKind = (k: string): k is CatchKind => (CATCH_KINDS as readonly string[]).includes(k);

/** nodeId 에 붙은 받는 노드(노드 배열 순서, 겹친 ID 는 첫 노드만). 붙은 노드가 받을 수 있는 종류인지는 보지 않는다. */
export function catchesOf(flow: RuleSetFlow, nodeId: string): FlowNode[] {
  const seen = new Set<string>();
  const out: FlowNode[] = [];
  for (const n of flow.nodes ?? []) {
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    if (n.kind === "CATCH" && n.attachTo === nodeId) out.push(n);
  }
  return out;
}

export type Relation = "SAME" | "BEFORE" | "AFTER" | "EXCLUSIVE" | "PARALLEL";

export interface FlowParse {
  tree: FlowTree | null;
  issues: FlowIssue[];
}

interface Degree {
  min: number;
  max: number;
}

const ONE: Degree = { min: 1, max: 1 };
const NONE: Degree = { min: 0, max: 0 };
const MANY: Degree = { min: 2, max: Number.POSITIVE_INFINITY };
const IN_DEGREE: Record<FlowNodeKind, Degree> = { START: NONE, END: ONE, RULE: ONE, TASK: ONE, IF: ONE, PARALLEL: ONE, MERGE: MANY, CATCH: NONE };
const OUT_DEGREE: Record<FlowNodeKind, Degree> = { START: ONE, END: NONE, RULE: ONE, TASK: ONE, IF: MANY, PARALLEL: MANY, MERGE: ONE, CATCH: ONE };

const AT_LEAST_ONE: Degree = { min: 1, max: Number.POSITIVE_INFINITY };
const degreeText = (d: Degree) => (d.max === 0 ? "없어야 한다" : d.max === 1 ? "1개여야 한다" : d.min === 1 ? "1개 이상이어야 한다" : "2개 이상이어야 한다");
/** Java `String.isBlank()` 과 같은 판정(C3 공백 규칙). `trim()` 은 NBSP·BOM 을 공백으로 봐 Java 와 갈라진다. */
const JAVA_WS = /^(?:[\t\n\u000B\f\r\u001C-\u001F]|(?![\u00A0\u2007\u202F])[\p{Zs}\p{Zl}\p{Zp}])*$/u;
export const isBlankJava = (s: string | null | undefined) => s == null || JAVA_WS.test(s);
const orNull = <T>(v: T | null | undefined): T | null => (v === undefined ? null : v);
const isSplit = (k: FlowNodeKind) => k === "IF" || k === "PARALLEL";
const issue = (code: FlowIssueCode, nodeId: string | null, edgeId: string | null, message: string): FlowIssue => ({ code, nodeId, edgeId, message });

class ParseStop extends Error {
  constructor(readonly issue: FlowIssue) {
    super(issue.message);
  }
}

/** 구조 검사(C3) 후 블록 트리를 만든다. 1단계 오류는 모두 모아 tree=null, 2단계 오류는 첫 오류에서 멈춘다. */
export function parseFlow(flow: RuleSetFlow): FlowParse {
  const nodes = flow.nodes ?? [];
  const edges = flow.edges ?? [];
  const issues: FlowIssue[] = [];

  // a — 겹치는 노드 ID(뒤 노드만 보고, 첫 노드로 계속 본다)
  const byId = new Map<string, FlowNode>();
  const unique: FlowNode[] = [];
  for (const n of nodes) {
    if (byId.has(n.id)) issues.push(issue("FLOW_STRUCTURE", n.id, null, `노드 ID ${n.id}가 겹친다`));
    else {
      byId.set(n.id, n);
      unique.push(n);
    }
  }

  const hasCatch = unique.some((n) => n.kind === "CATCH");
  /** 받는 룰 → 붙은 받는 노드(노드 배열 순서). 붙임이 맞는 것만 — e·h6·h7·2단계가 쓴다. */
  const catchMap = new Map<string, FlowNode[]>();
  for (const n of unique) {
    if (n.kind !== "CATCH" || isBlankJava(n.attachTo)) continue;
    const t = byId.get(n.attachTo as string);
    if (t && CATCHABLE.has(t.kind)) {
      if (!catchMap.has(t.id)) catchMap.set(t.id, []);
      catchMap.get(t.id)!.push(n);
    }
  }

  // b1·b2 — 시작·끝 개수
  const startCount = unique.filter((n) => n.kind === "START").length;
  if (startCount !== 1) issues.push(issue("FLOW_STRUCTURE", null, null, `시작 노드가 ${startCount}개다. 정확히 1개여야 한다`));
  const endCount = unique.filter((n) => n.kind === "END").length;
  if (endCount !== 1) issues.push(issue("FLOW_STRUCTURE", null, null, `끝 노드가 ${endCount}개다. 정확히 1개여야 한다`));

  // c — 없는 노드를 가리키는 선(차수 계산에서 뺀다)
  const ins = new Map<string, FlowEdge[]>();
  const outs = new Map<string, FlowEdge[]>();
  for (const e of edges) {
    let ok = true;
    if (!byId.has(e.from)) {
      issues.push(issue("FLOW_STRUCTURE", e.from, e.id, `선 ${e.id}가 없는 노드 ${e.from}를 가리킨다`));
      ok = false;
    }
    if (!byId.has(e.to)) {
      issues.push(issue("FLOW_STRUCTURE", e.to, e.id, `선 ${e.id}가 없는 노드 ${e.to}를 가리킨다`));
      ok = false;
    }
    if (!ok) continue;
    if (!outs.has(e.from)) outs.set(e.from, []);
    outs.get(e.from)!.push(e);
    if (!ins.has(e.to)) ins.set(e.to, []);
    ins.get(e.to)!.push(e);
  }
  const outOf = (id: string) => outs.get(id) ?? [];

  // d1·d2·e·f1 — 노드별
  for (const n of unique) {
    const inN = (ins.get(n.id) ?? []).length;
    const outN = outOf(n.id).length;
    const di = n.kind === "END" && hasCatch ? AT_LEAST_ONE : IN_DEGREE[n.kind];
    const dout = OUT_DEGREE[n.kind];
    if (inN < di.min || inN > di.max) issues.push(issue("FLOW_STRUCTURE", n.id, null, `${n.id}의 들어오는 선이 ${inN}개다. ${degreeText(di)}`));
    if (outN < dout.min || outN > dout.max) issues.push(issue("FLOW_STRUCTURE", n.id, null, `${n.id}의 나가는 선이 ${outN}개다. ${degreeText(dout)}`));
    if (n.kind === "RULE" && isBlankJava(n.ruleId)) issues.push(issue("FLOW_STRUCTURE", n.id, null, `룰 노드 ${n.id}에 룰 ID가 없다`));
    if (n.kind === "MERGE") {
      const splitId = orNull(n.splitId);
      const s = splitId == null ? undefined : byId.get(splitId);
      if (!s || (!isSplit(s.kind) && !catchMap.has(s.id))) issues.push(issue("FLOW_STRUCTURE", n.id, null, `합류 ${n.id}의 짝 분기 ${splitId ?? "-"}가 없다`));
    }
  }

  // f2·g1~g5 — 분기 노드별
  for (const n of unique) {
    if (!isSplit(n.kind)) continue;
    const merges = unique.filter((m) => m.kind === "MERGE" && orNull(m.splitId) === n.id).length;
    if (merges !== 1) issues.push(issue("FLOW_STRUCTURE", n.id, null, `분기 ${n.id}를 닫는 합류가 ${merges}개다. 정확히 1개여야 한다`));
    const out = outOf(n.id);
    if (n.kind === "IF") {
      const others = out.filter((e) => e.otherwise === true).length;
      if (others !== 1) issues.push(issue("FLOW_IF_ELSE", n.id, null, `IF ${n.id}에 "그 외" 갈래가 ${others}개다. 정확히 1개여야 한다`));
      for (const e of out) {
        if (e.otherwise !== true && isBlankJava(e.cond)) issues.push(issue("FLOW_IF_ELSE", n.id, e.id, `IF ${n.id}의 갈래 ${e.id}에 조건식이 없다`));
      }
    } else {
      for (const e of out) {
        if (!isBlankJava(e.cond) || e.otherwise === true) issues.push(issue("FLOW_STRUCTURE", n.id, e.id, `병렬 분기 ${n.id}의 갈래 ${e.id}에는 조건을 둘 수 없다`));
      }
    }
    const ordered = n.kind === "IF" ? out.filter((e) => e.otherwise !== true) : out;
    for (const e of ordered) {
      if (e.order == null) issues.push(issue("FLOW_STRUCTURE", n.id, e.id, `분기 ${n.id}의 갈래 ${e.id}에 순서가 없다`));
    }
    const seen = new Set<number>();
    for (const e of ordered) {
      if (e.order == null) continue;
      if (seen.has(e.order)) issues.push(issue("FLOW_STRUCTURE", n.id, e.id, `분기 ${n.id}의 갈래 순서 ${e.order}가 겹친다`));
      else seen.add(e.order);
    }
  }

  // h1~h5 — 받는 노드별(FLOW_CATCH)
  for (const n of unique) {
    if (n.kind !== "CATCH") continue;
    const at = orNull(n.attachTo);
    const target = isBlankJava(at) ? undefined : byId.get(at as string);
    if (!target) issues.push(issue("FLOW_CATCH", n.id, null, `받는 노드 ${n.id}가 붙은 룰 ${isBlankJava(at) ? "-" : at}가 없다`));
    else if (!CATCHABLE.has(target.kind)) issues.push(issue("FLOW_CATCH", n.id, null, `받는 노드 ${n.id}는 룰 노드에만 붙일 수 있다(${target.id}는 ${target.kind})`));
    const keys = n.catches ?? [];
    if (keys.length === 0) issues.push(issue("FLOW_CATCH", n.id, null, `받는 노드 ${n.id}에 받을 예외 종류가 없다`));
    const seenKeys = new Set<string>();
    for (const k of keys) {
      if (!isCatchKind(k)) issues.push(issue("FLOW_CATCH", n.id, null, `받는 노드 ${n.id}의 예외 종류 ${k}를 모른다`));
      else if (seenKeys.has(k)) issues.push(issue("FLOW_CATCH", n.id, null, `받는 노드 ${n.id}에 예외 종류 ${k}가 겹친다`));
      else seenKeys.add(k);
    }
  }
  // h6·h7 — 받는 룰별
  for (const [ruleNode, cs] of catchMap) {
    const owner = new Map<string, string>();
    for (const c of cs) {
      for (const k of c.catches ?? []) {
        if (!isCatchKind(k)) continue;
        const prev = owner.get(k);
        if (prev === undefined) owner.set(k, c.id);
        else if (prev !== c.id) issues.push(issue("FLOW_CATCH", c.id, null, `룰 노드 ${ruleNode}에서 예외 종류 ${k}를 ${prev}와 ${c.id}가 함께 받는다`));
      }
    }
    const merges = unique.filter((m) => m.kind === "MERGE" && orNull(m.splitId) === ruleNode).length;
    if (merges > 1) issues.push(issue("FLOW_STRUCTURE", ruleNode, null, `룰 ${ruleNode}로 돌아오는 합류가 ${merges}개다. 1개까지 둔다`));
  }

  if (issues.length > 0) return { tree: null, issues };
  try {
    return { tree: build(unique, byId, outOf, catchMap), issues: [] };
  } catch (e) {
    if (e instanceof ParseStop) return { tree: null, issues: [e.issue] };
    throw e;
  }
}

function sortBranches(kind: FlowNodeKind, out: readonly FlowEdge[]): FlowEdge[] {
  const byOrder = (a: FlowEdge, b: FlowEdge) => (a.order ?? 0) - (b.order ?? 0);
  if (kind === "IF") return [...out.filter((e) => e.otherwise !== true).sort(byOrder), ...out.filter((e) => e.otherwise === true)];
  return [...out].sort(byOrder);
}

/** 2단계 — seq(from, stop) 로 블록 트리를 만든다(C3 의사코드). 첫 오류에서 ParseStop 을 던진다. */
function build(
  unique: readonly FlowNode[],
  byId: ReadonlyMap<string, FlowNode>,
  outOf: (id: string) => FlowEdge[],
  catchMap: ReadonlyMap<string, readonly FlowNode[]>,
): FlowTree {
  const visited = new Set<string>();
  const mergeOf = new Map<string, string>();
  for (const m of unique) if (m.kind === "MERGE" && m.splitId != null) mergeOf.set(m.splitId, m.id);
  const next = (id: string) => outOf(id)[0].to;
  const end = unique.find((n) => n.kind === "END")!;

  /** 노드 하나를 블록으로 만들어 items 에 넣고 다음 노드 ID 를 돌려준다(Java `Builder.step`). */
  const step = (cur: string, items: Block[], notClosed: string): string => {
    if (visited.has(cur)) {
      throw new ParseStop(issue("FLOW_STRUCTURE", cur, null, `${cur}를 두 번 지난다. 순환이 있거나 갈래가 짝 합류 밖에서 만난다`));
    }
    const node = byId.get(cur)!;
    if (node.kind === "START" || node.kind === "END" || node.kind === "MERGE") {
      throw new ParseStop(issue("FLOW_STRUCTURE", cur, null, `${notClosed}${cur}로 나간다`));
    }
    visited.add(cur);
    if (node.kind === "RULE") {
      const rule: RuleStep = { type: "RULE", nodeId: cur, ruleId: node.ruleId as string };
      const cs = catchMap.get(cur) ?? [];
      if (cs.length === 0) {
        items.push(rule);
        return next(cur);
      }
      const g = guarded(rule, cs);
      items.push(g);
      return g.mergeId == null ? next(cur) : next(g.mergeId);
    }
    if (node.kind === "TASK") {
      items.push({ type: "TASK", nodeId: cur });
      return next(cur);
    }
    const splitId = cur;
    const mergeId = mergeOf.get(splitId)!;
    const branches = sortBranches(node.kind, outOf(splitId)).map((e) => ({
      edgeId: e.id,
      cond: orNull(e.cond),
      otherwise: e.otherwise === true,
      label: orNull(e.label),
      body: seq(e.to, mergeId),
    }));
    visited.add(mergeId);
    items.push({ type: "SPLIT", nodeId: splitId, kind: node.kind as "IF" | "PARALLEL", mergeId, branches });
    return next(mergeId);
  };

  const seq = (from: string, stop: string): Seq => {
    const items: Block[] = [];
    let cur = from;
    while (cur !== stop) cur = step(cur, items, `갈래가 ${stop}에서 닫히지 않고 `);
    return { type: "SEQ", items };
  };

  const guarded = (rule: RuleStep, cs: readonly FlowNode[]): Guarded => {
    const mergeId = mergeOf.get(rule.nodeId) ?? null;
    const normal: Seq = mergeId == null ? { type: "SEQ", items: [] } : seq(next(rule.nodeId), mergeId);
    const handlers = cs.map((c): Handler => {
      visited.add(c.id);
      const items: Block[] = [];
      const notClosed = `처리 갈래 ${c.id}가 ${mergeId == null ? "끝" : `합류 ${mergeId}나 끝`}에 닿지 않고 `;
      let cur = next(c.id);
      while (cur !== end.id && cur !== mergeId) cur = step(cur, items, notClosed);
      return { catchNodeId: c.id, kinds: (c.catches ?? []).filter(isCatchKind), body: { type: "SEQ", items }, ends: cur === end.id };
    });
    if (mergeId != null) visited.add(mergeId);
    return { type: "GUARDED", rule, normal, handlers, mergeId };
  };

  const start = unique.find((n) => n.kind === "START")!;
  visited.add(start.id);
  const root = seq(next(start.id), end.id);
  visited.add(end.id);
  for (const n of unique) {
    if (!visited.has(n.id)) {
      throw new ParseStop(issue("FLOW_STRUCTURE", n.id, null, `${n.id}에 도달할 수 없다`));
    }
  }
  return new FlowTree(root, start.id, end.id);
}

interface Position {
  /** 루트에서 이 노드까지 지나는 (분기 또는 받는 룰, 갈래 번호). 받는 룰은 0 = 정상 갈래, k+1 = k번째 처리 갈래(Ruling R8). */
  chain: ReadonlyArray<{ split: string; kind: "IF" | "PARALLEL" | "GUARD"; branch: number }>;
  /** 깊이 우선 순번(RULE·TASK·분기 노드). */
  order: number;
}

/** 블록 트리와 노드 관계(C2). */
export class FlowTree {
  private readonly positions = new Map<string, Position>();
  private readonly steps: RuleStep[] = [];
  private hasSplit = false;

  constructor(
    readonly root: Seq,
    readonly startId: string,
    readonly endId: string,
  ) {
    let counter = 0;
    const walk = (s: Seq, chain: Position["chain"]) => {
      for (const b of s.items) {
        if (b.type === "RULE") {
          this.positions.set(b.nodeId, { chain, order: counter++ });
          this.steps.push(b);
        } else if (b.type === "TASK") {
          this.positions.set(b.nodeId, { chain, order: counter++ });
        } else if (b.type === "GUARDED") {
          this.positions.set(b.rule.nodeId, { chain, order: counter++ });
          this.steps.push(b.rule);
          walk(b.normal, [...chain, { split: b.rule.nodeId, kind: "GUARD", branch: 0 }]);
          b.handlers.forEach((h, i) => walk(h.body, [...chain, { split: b.rule.nodeId, kind: "GUARD", branch: i + 1 }]));
        } else if (b.type === "SPLIT") {
          this.hasSplit = true;
          this.positions.set(b.nodeId, { chain, order: counter++ });
          b.branches.forEach((br, i) => walk(br.body, [...chain, { split: b.nodeId, kind: b.kind, branch: i }]));
        } else {
          walk(b, chain);
        }
      }
    };
    walk(root, []);
  }

  /** 모든 RULE 노드, 깊이 우선(갈래 실행 순서, 받는 룰은 정상 갈래 다음 처리 갈래). */
  ruleSteps(): RuleStep[] {
    return [...this.steps];
  }

  /** ruleSteps 의 룰 ID 를 처음 나온 순서로 중복 없이 = RULE_IDS 로 저장할 목록. */
  ruleIds(): string[] {
    return [...new Set(this.steps.map((s) => s.ruleId))];
  }

  branched(): boolean {
    return this.hasSplit;
  }

  /** a 기준 b 의 관계. 같은 분기에서 갈래 번호가 처음 달라지면 PARALLEL=PARALLEL, 그 밖(IF·받는 룰의 정상·처리 갈래)=EXCLUSIVE, 아니면 같은 경로(순번 비교). */
  relation(a: string, b: string): Relation {
    if (a === b) return "SAME";
    const pa = this.positions.get(a);
    const pb = this.positions.get(b);
    if (!pa || !pb) throw new Error(`흐름 트리에 없는 노드: ${!pa ? a : b}`);
    const n = Math.min(pa.chain.length, pb.chain.length);
    for (let i = 0; i < n; i++) {
      const x = pa.chain[i];
      const y = pb.chain[i];
      if (x.split !== y.split) break;
      if (x.branch !== y.branch) return x.kind === "PARALLEL" ? "PARALLEL" : "EXCLUSIVE";
    }
    return pa.order < pb.order ? "BEFORE" : "AFTER";
  }
}

/** ruleIds 순서의 한 줄 흐름. 노드 ID: start, r1..rN, end. 선 ID: e1..e(N+1). */
export function linearFlow(ids: readonly string[]): RuleSetFlow {
  const nodes: FlowNode[] = [{ id: "start", kind: "START", ruleId: null, splitId: null, label: null }];
  ids.forEach((ruleId, i) => nodes.push({ id: `r${i + 1}`, kind: "RULE", ruleId, splitId: null, label: null }));
  nodes.push({ id: "end", kind: "END", ruleId: null, splitId: null, label: null });
  const edges: FlowEdge[] = [];
  for (let i = 0; i + 1 < nodes.length; i++) {
    edges.push({ id: `e${i + 1}`, from: nodes[i].id, to: nodes[i + 1].id, order: null, cond: null, otherwise: false, label: null });
  }
  return { version: 1, nodes, edges };
}

/** 흐름의 룰 목록 — 트리가 있으면 `tree.ruleIds()`, 구조 오류면 RULE 노드의 룰 ID 를 노드 배열 순서로 중복 없이(C4 1). */
export function flowRuleIds(flow: RuleSetFlow, parsed: FlowParse = parseFlow(flow)): string[] {
  if (parsed.tree) return parsed.tree.ruleIds();
  const out: string[] = [];
  const seenNodes = new Set<string>();
  for (const n of flow.nodes ?? []) {
    if (seenNodes.has(n.id)) continue;
    seenNodes.add(n.id);
    if (n.kind === "RULE" && !isBlankJava(n.ruleId) && !out.includes(n.ruleId as string)) out.push(n.ruleId as string);
  }
  return out;
}
