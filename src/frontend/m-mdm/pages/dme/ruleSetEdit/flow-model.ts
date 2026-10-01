/**
 * 룰 세트 흐름 구조 해석 — 엔진 `kr.dongkuk.maru.mdm.engine.flow.FlowParser`·`FlowTree` 의 TS 짝(spec §3.2, 계획 C2·C3).
 * 구조 검사 문구·순서, 블록 트리, 노드 관계가 Java 와 같아야 하고 `rule-set-corpus.json` 의 흐름 사례가 두 구현을 묶는다.
 * 알고리즘을 바꾸면 Java 쪽과 코퍼스를 함께 바꾼다. React 의존 없는 순수 함수다.
 *
 * 중복 노드 ID 는 첫 노드만 본다(a 오류로 보고한다). 빠진 칸(undefined)은 null 로 본다 — 서버 FLOW_JSON 과 코퍼스가 null 칸을 뺄 수 있다.
 *
 * implicit-join spec(D-136): IF 와 처리 갈래는 합류 없이 모이는 자리·돌아오는 자리로 바로 가고, 해석이 그 자리를 줄기(spine)로 계산한다
 * (`makeJoins` — 엔진 `FlowParser.Builder` 의 after·spine·join 짝). 옛 형식(IF·받는 노드가 붙은 노드를 가리키는 MERGE)도 그대로 받는다.
 * 편집기용 관대한 도우미(`joinOf`·`endingBranches`·`handlerTarget`·`returnOf`)는 같은 계산을 쓰되 오류면 null 을 돌려준다.
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

/** 한 칸짜리 단계 — 엔진 `flow.Step`(RULE·TASK, 하위 세트 호출 스펙이 SET 을 더한다). */
export type Step = RuleStep | TaskStep;

/** 갈래 하나. ends = 끝내는 IF 갈래(본문은 END 앞까지, implicit-join spec §2.2). 이어지는 갈래·병렬 갈래·옛 IF 갈래는 false. */
export interface Branch {
  edgeId: string;
  cond: string | null;
  otherwise: boolean;
  label: string | null;
  body: Seq;
  ends: boolean;
}

/** branches 는 실행 순서. mergeId 는 PARALLEL·옛 IF 의 짝 MERGE(새 IF 는 null), joinId 는 이어지는 갈래가 모이는 노드. */
export interface Split {
  type: "SPLIT";
  nodeId: string;
  kind: "IF" | "PARALLEL";
  mergeId: string | null;
  joinId: string;
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
 * 받는 노드가 붙은 단계(받는 노드 spec §3, implicit-join spec §2.3) — 엔진 `flow.Guarded` 짝. joinId = 돌아오는 자리(돌아오는 처리 갈래가 없으면 null),
 * mergeId 는 옛 돌아오는 MERGE 일 때만 joinId 와 같다. 맨 위에 nodeId 를 두지 않는다 — 블록을 걷는 코드가 GUARDED 를 빼먹으면 tsc 가 막는다.
 */
export interface Guarded {
  type: "GUARDED";
  step: Step;
  normal: Seq;
  handlers: Handler[];
  mergeId: string | null;
  joinId: string | null;
}

export type Block = Seq | Step | Split | Guarded;

/** 받는 종류의 저장 순서(엔진 `CatchKind` 선언 순서). */
export const CATCH_KINDS: readonly CatchKind[] = ["NO_RESULT", "INPUT_ERROR", "EVAL_ERROR", "HIT_CONFLICT"];
/** 받는 노드를 붙일 수 있는 노드 종류(엔진 `FlowParser.catchable` — RULE·TASK). 하위 세트 호출 스펙이 SET 을 더한다. */
export const CATCHABLE: ReadonlySet<FlowNodeKind> = new Set<FlowNodeKind>(["RULE", "TASK"]);
/** 처리 갈래 안에서만 있는 예약 이름(엔진 `ReservedNames.CATCH_NAMES`, 받는 노드 spec §4). */
export const CATCH_NAMES: readonly string[] = ["CATCH_KIND", "CATCH_RULE", "CATCH_CODE", "CATCH_MSG"];
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
const AT_LEAST_ONE: Degree = { min: 1, max: Number.POSITIVE_INFINITY };
const IN_DEGREE: Record<FlowNodeKind, Degree> = {
  START: NONE, END: AT_LEAST_ONE, RULE: AT_LEAST_ONE, TASK: AT_LEAST_ONE, IF: AT_LEAST_ONE, PARALLEL: AT_LEAST_ONE, MERGE: MANY, CATCH: NONE,
};
const OUT_DEGREE: Record<FlowNodeKind, Degree> = { START: ONE, END: NONE, RULE: ONE, TASK: ONE, IF: MANY, PARALLEL: MANY, MERGE: ONE, CATCH: ONE };

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
    const di = IN_DEGREE[n.kind];
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
    if (n.kind === "PARALLEL" && merges !== 1) issues.push(issue("FLOW_STRUCTURE", n.id, null, `분기 ${n.id}를 닫는 합류가 ${merges}개다. 정확히 1개여야 한다`));
    if (n.kind === "IF" && merges > 1) issues.push(issue("FLOW_STRUCTURE", n.id, null, `IF ${n.id}를 닫는 합류가 ${merges}개다. IF 는 합류를 두지 않는다`));
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
    if (n.kind === "IF" && merges === 0) {
      const first = new Map<string, string>();
      for (const e of out) {
        const prev = first.get(e.to);
        if (prev === undefined) first.set(e.to, e.id);
        else issues.push(issue("FLOW_STRUCTURE", n.id, e.id, `IF ${n.id}의 갈래 ${e.id}가 갈래 ${prev}와 같은 노드 ${e.to}로 간다. 같은 노드로 가는 갈래는 하나만 둔다`));
      }
    }
  }

  // h1~h5 — 받는 노드별(FLOW_CATCH)
  for (const n of unique) {
    if (n.kind !== "CATCH") continue;
    const at = orNull(n.attachTo);
    const target = isBlankJava(at) ? undefined : byId.get(at as string);
    if (!target) issues.push(issue("FLOW_CATCH", n.id, null, `받는 노드 ${n.id}가 붙은 노드 ${isBlankJava(at) ? "-" : at}가 없다`));
    else if (!CATCHABLE.has(target.kind)) issues.push(issue("FLOW_CATCH", n.id, null, `받는 노드 ${n.id}는 룰·빈 단계 노드에만 붙일 수 있다(${target.id}는 ${target.kind})`));
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

/** IF 하나의 모이는 자리와 끝내는 갈래 선 ID(§2.2) — 엔진 `FlowParser.Join` 짝. */
interface JoinInfo {
  joinId: string;
  ending: ReadonlySet<string>;
}

const twiceIssue = (id: string) => issue("FLOW_STRUCTURE", id, null, `${id}를 두 번 지난다. 순환이 있거나 갈래가 모이는 자리 밖에서 만난다`);

/**
 * 줄기·모이는 자리 계산(§2.1·§2.2) — 엔진 `FlowParser.Builder` 의 after·spine·join 짝. 해석(build)과 관대한 도우미가 함께 쓴다.
 * 순환·모이는 자리 재진입은 ParseStop(S6)으로 던진다. 1단계가 막는 모양(나가는 선 없음·짝 없는 병렬)은 Error 로 던진다(관대한 도우미만 만난다).
 */
function makeJoins(byId: ReadonlyMap<string, FlowNode>, outOf: (id: string) => FlowEdge[], mergeOf: ReadonlyMap<string, string>, endId: string) {
  const memo = new Map<string, JoinInfo>();
  const joining = new Set<string>();
  const next = (id: string): string => {
    const o = outOf(id);
    if (o.length === 0) throw new Error(`${id}에서 나가는 선이 없다`);
    return o[0].to;
  };
  const after = (x: string): string | null => {
    const n = byId.get(x);
    if (!n) throw new Error(`없는 노드 ${x}`);
    if (n.kind === "END") return null;
    if (n.kind === "IF") return mergeOf.get(x) ?? join(x).joinId;
    if (n.kind === "PARALLEL") {
      const m = mergeOf.get(x);
      if (m === undefined) throw new Error(`병렬 ${x}의 합류가 없다`);
      return m;
    }
    return next(x);
  };
  const spine = (from: string, stop: string | null): string[] => {
    const out: string[] = [];
    const seen = new Set<string>();
    let cur: string | null = from;
    while (cur !== null) {
      if (seen.has(cur)) throw new ParseStop(twiceIssue(cur));
      seen.add(cur);
      out.push(cur);
      if (cur === stop || cur === endId) break;
      cur = after(cur);
    }
    return out;
  };
  function join(s: string): JoinInfo {
    const have = memo.get(s);
    if (have) return have;
    if (joining.has(s)) throw new ParseStop(twiceIssue(s));
    joining.add(s);
    const br = sortBranches("IF", outOf(s));
    const spines = br.map((e) => spine(e.to, null));
    const ns = spines.map((sp) => new Set(sp.filter((x) => x !== endId)));
    const ending = new Set<string>();
    const cont: number[] = [];
    br.forEach((e, i) => {
      const alone = ns.every((other, k) => k === i || ![...ns[i]].some((x) => other.has(x)));
      if (alone) ending.add(e.id);
      else cont.push(i);
    });
    let joinId = endId;
    if (cont.length > 0) {
      const first = cont[0];
      for (const x of spines[first]) {
        if (x === endId) break;
        if (cont.every((k) => k === first || ns[k].has(x))) {
          joinId = x;
          break;
        }
      }
      if (joinId === endId) ending.clear(); // §2.2 4 예외 — 갈래를 만들 때 S6·S5 로 거부된다
    } else {
      let pick = -1;
      for (let i = br.length - 1; i >= 0; i--) {
        if (br[i].to !== endId) {
          pick = i;
          break;
        }
      }
      if (pick < 0) ending.clear(); // 모든 갈래가 END 로 바로 감 — 1단계 f4 가 막으므로 해석에서는 오지 않는다
      else {
        joinId = br[pick].to;
        ending.delete(br[pick].id);
      }
    }
    joining.delete(s);
    const info: JoinInfo = { joinId, ending };
    memo.set(s, info);
    return info;
  }
  return { next, spine, join };
}

/** 2단계 — 블록 트리를 만든다(엔진 `FlowParser.Builder`). 첫 오류에서 ParseStop 을 던진다. */
function build(
  unique: readonly FlowNode[],
  byId: ReadonlyMap<string, FlowNode>,
  outOf: (id: string) => FlowEdge[],
  catchMap: ReadonlyMap<string, readonly FlowNode[]>,
): FlowTree {
  const visited = new Set<string>();
  const mergeOf = new Map<string, string>();
  for (const m of unique) if (m.kind === "MERGE" && m.splitId != null) mergeOf.set(m.splitId, m.id);
  const endId = unique.find((n) => n.kind === "END")!.id;
  const { next, spine, join } = makeJoins(byId, outOf, mergeOf, endId);
  /** 지켜보는 정상 줄기 묶음(§2.4 1) — 배열 끝이 가장 안쪽. */
  const watches: { guardId: string; catchId: string; normal: ReadonlySet<string> }[] = [];

  const seq = (from: string, stop: string, notClosed = `갈래가 ${stop}에서 닫히지 않고 `): Seq => {
    const items: Block[] = [];
    let cur = from;
    while (cur !== stop) cur = step(cur, stop, items, notClosed);
    return { type: "SEQ", items };
  };

  /** 노드 하나를 블록으로 만들어 items 에 넣고 다음 노드 ID 를 돌려준다(§2.4 — 침범 → 방문 → 종류). stop 은 둘러싼 끝. */
  const step = (cur: string, stop: string, items: Block[], notClosed: string): string => {
    for (let i = watches.length - 1; i >= 0; i--) {
      const w = watches[i];
      if (w.normal.has(cur)) {
        throw new ParseStop(
          issue("FLOW_STRUCTURE", cur, null, `처리 갈래 ${w.catchId}가 ${w.guardId}의 정상 갈래 노드 ${cur}로 들어간다. 처리 갈래는 한 노드로 돌아오거나 끝 노드로 가야 한다`),
        );
      }
    }
    if (visited.has(cur)) throw new ParseStop(twiceIssue(cur));
    const node = byId.get(cur)!;
    if (node.kind === "START" || node.kind === "END" || node.kind === "MERGE") {
      throw new ParseStop(issue("FLOW_STRUCTURE", cur, null, `${notClosed}${cur}로 나간다`));
    }
    visited.add(cur);
    if (node.kind === "RULE" || node.kind === "TASK") {
      const s: Step = node.kind === "RULE" ? { type: "RULE", nodeId: cur, ruleId: node.ruleId as string } : { type: "TASK", nodeId: cur };
      const cs = catchMap.get(cur) ?? [];
      if (cs.length === 0) {
        items.push(s);
        return next(cur);
      }
      return guarded(s, cs, stop, items);
    }
    if (node.kind === "IF") return ifBlock(cur, items);
    return parallelBlock(cur, items);
  };

  const ifBlock = (id: string, items: Block[]): string => {
    const legacy = mergeOf.get(id);
    const info: JoinInfo = legacy !== undefined ? { joinId: legacy, ending: new Set() } : join(id);
    const branches: Branch[] = sortBranches("IF", outOf(id)).map((e) => {
      const ends = info.ending.has(e.id);
      return { edgeId: e.id, cond: orNull(e.cond), otherwise: e.otherwise === true, label: orNull(e.label), body: seq(e.to, ends ? endId : info.joinId), ends };
    });
    if (legacy !== undefined) {
      visited.add(legacy);
      items.push({ type: "SPLIT", nodeId: id, kind: "IF", mergeId: legacy, joinId: legacy, branches });
      return next(legacy);
    }
    items.push({ type: "SPLIT", nodeId: id, kind: "IF", mergeId: null, joinId: info.joinId, branches });
    return info.joinId;
  };

  const parallelBlock = (id: string, items: Block[]): string => {
    const mergeId = mergeOf.get(id)!;
    const branches: Branch[] = sortBranches("PARALLEL", outOf(id)).map((e) => ({
      edgeId: e.id, cond: orNull(e.cond), otherwise: e.otherwise === true, label: orNull(e.label), body: seq(e.to, mergeId), ends: false,
    }));
    visited.add(mergeId);
    items.push({ type: "SPLIT", nodeId: id, kind: "PARALLEL", mergeId, joinId: mergeId, branches });
    return next(mergeId);
  };

  /** 받는 노드 블록(§2.3) — 정상 줄기 → 처리 줄기들 → 도착 비교(S7) → 정상 갈래 → 처리 갈래. */
  const guarded = (s: Step, cs: readonly FlowNode[], stop: string, items: Block[]): string => {
    const id = s.nodeId;
    const normalSpine = spine(next(id), stop);
    const inS = new Set(normalSpine);
    const targets = cs.map((c) => {
      for (const x of spine(next(c.id), null)) if (inS.has(x) || x === endId) return x;
      return endId;
    });
    let j: string | null = null;
    let jCatch = "";
    for (let k = 0; k < cs.length; k++) {
      const t = targets[k];
      if (t === endId) continue;
      if (j === null) {
        j = t;
        jCatch = cs[k].id;
      } else if (t !== j) {
        throw new ParseStop(issue("FLOW_STRUCTURE", cs[k].id, null, `${id}의 처리 갈래 ${cs[k].id}가 ${t}로 돌아온다. 앞 처리 갈래 ${jCatch}처럼 ${j}로 돌아와야 한다`));
      }
    }
    const back: string | null = j;
    const mergeId = back !== null && mergeOf.get(id) === back ? back : null;
    const normal: Seq = back === null ? { type: "SEQ", items: [] } : seq(next(id), back);
    const watched = new Set(normalSpine.filter((x) => x !== endId));
    const handlers: Handler[] = cs.map((c, k) => {
      visited.add(c.id);
      const t = targets[k];
      const notClosed = `처리 갈래 ${c.id}가 ${t === endId ? "끝" : t === mergeId ? `합류 ${t}나 끝` : `돌아올 자리 ${t}나 끝`}에 닿지 않고 `;
      watches.push({ guardId: id, catchId: c.id, normal: watched });
      try {
        return { catchNodeId: c.id, kinds: (c.catches ?? []).filter(isCatchKind), body: seq(next(c.id), t, notClosed), ends: t === endId };
      } finally {
        watches.pop();
      }
    });
    if (mergeId !== null) visited.add(mergeId);
    items.push({ type: "GUARDED", step: s, normal, handlers, mergeId, joinId: back });
    return back === null ? next(id) : mergeId !== null ? next(mergeId) : back;
  };

  const start = unique.find((n) => n.kind === "START")!;
  visited.add(start.id);
  const root = seq(next(start.id), endId);
  visited.add(endId);
  for (const n of unique) {
    if (!visited.has(n.id)) throw new ParseStop(issue("FLOW_STRUCTURE", n.id, null, `${n.id}에 도달할 수 없다`));
  }
  return new FlowTree(root, start.id, endId);
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
          this.positions.set(b.step.nodeId, { chain, order: counter++ });
          if (b.step.type === "RULE") this.steps.push(b.step);
          walk(b.normal, [...chain, { split: b.step.nodeId, kind: "GUARD", branch: 0 }]);
          b.handlers.forEach((h, i) => walk(h.body, [...chain, { split: b.step.nodeId, kind: "GUARD", branch: i + 1 }]));
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

// ───────────────────────── 편집기용 관대한 도우미(implicit-join spec §8.1) ─────────────────────────

interface Lenient {
  byId: Map<string, FlowNode>;
  outOf: (id: string) => FlowEdge[];
  mergeOf: Map<string, string>;
  endId: string | null;
}

/** 구조 오류가 있어도 쓰는 그래프 — 겹친 ID 는 첫 노드, 없는 노드를 가리키는 선은 뺀다, MERGE 짝은 처음 나온 것. */
function lenient(flow: RuleSetFlow): Lenient {
  const byId = new Map<string, FlowNode>();
  for (const n of flow.nodes ?? []) if (!byId.has(n.id)) byId.set(n.id, n);
  const outs = new Map<string, FlowEdge[]>();
  for (const e of flow.edges ?? []) {
    if (!byId.has(e.from) || !byId.has(e.to)) continue;
    if (!outs.has(e.from)) outs.set(e.from, []);
    outs.get(e.from)!.push(e);
  }
  const mergeOf = new Map<string, string>();
  for (const n of byId.values()) if (n.kind === "MERGE" && n.splitId != null && !mergeOf.has(n.splitId)) mergeOf.set(n.splitId, n.id);
  const end = [...byId.values()].find((n) => n.kind === "END");
  return { byId, outOf: (id) => outs.get(id) ?? [], mergeOf, endId: end ? end.id : null };
}

/** 분기의 모이는 자리 — IF 는 옛 짝 MERGE 또는 §2.2 의 모이는 자리, PARALLEL 은 짝 MERGE. 분기 아님·순환 등으로 못 정하면 null. */
export function joinOf(flow: RuleSetFlow, splitId: string): string | null {
  const L = lenient(flow);
  const s = L.byId.get(splitId);
  if (!s || L.endId === null) return null;
  if (s.kind === "PARALLEL") return L.mergeOf.get(splitId) ?? null;
  if (s.kind !== "IF") return null;
  const legacy = L.mergeOf.get(splitId);
  if (legacy !== undefined) return legacy;
  try {
    return makeJoins(L.byId, L.outOf, L.mergeOf, L.endId).join(splitId).joinId;
  } catch {
    return null;
  }
}

/** §2.2 의 끝내는 갈래 선 ID(실행 순서). 옛 IF·병렬은 빈 목록, 분기 아님·못 정하면 null. */
export function endingBranches(flow: RuleSetFlow, splitId: string): string[] | null {
  const L = lenient(flow);
  const s = L.byId.get(splitId);
  if (!s || L.endId === null || (s.kind !== "IF" && s.kind !== "PARALLEL")) return null;
  if (s.kind === "PARALLEL" || L.mergeOf.has(splitId)) return [];
  try {
    const info = makeJoins(L.byId, L.outOf, L.mergeOf, L.endId).join(splitId);
    return sortBranches("IF", L.outOf(splitId)).filter((e) => info.ending.has(e.id)).map((e) => e.id);
  } catch {
    return null;
  }
}

/** 처리 갈래 도착(§2.3 2 — 정상 줄기는 둘러싼 끝을 모르므로 END 까지 본다). END ID 면 끝내는 처리 갈래. 못 정하면 null. */
export function handlerTarget(flow: RuleSetFlow, catchId: string): string | null {
  const L = lenient(flow);
  const c = L.byId.get(catchId);
  if (!c || c.kind !== "CATCH" || L.endId === null || isBlankJava(c.attachTo)) return null;
  const host = L.byId.get(c.attachTo as string);
  if (!host || !CATCHABLE.has(host.kind)) return null;
  try {
    const J = makeJoins(L.byId, L.outOf, L.mergeOf, L.endId);
    const S = new Set(J.spine(J.next(host.id), null));
    for (const x of J.spine(J.next(catchId), null)) if (S.has(x) || x === L.endId) return x;
    return null;
  } catch {
    return null;
  }
}

/** 노드의 돌아오는 자리 J — 노드 배열 순서로 첫 돌아오는 처리 갈래의 도착. 없으면 null. */
export function returnOf(flow: RuleSetFlow, nodeId: string): string | null {
  const L = lenient(flow);
  if (L.endId === null) return null;
  for (const c of catchesOf(flow, nodeId)) {
    const t = handlerTarget(flow, c.id);
    if (t !== null && t !== L.endId) return t;
  }
  return null;
}
