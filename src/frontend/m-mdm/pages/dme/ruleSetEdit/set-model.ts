/**
 * 룰 세트 화면 즉시 계산 — 입출력 표·의존 룰·저장 시 검사(TSK-08-06 design §6.2·§6.3, I9·I10·I11·I21). React 의존 없는 순수 함수다.
 * 서버 `RuleSetAnalyzer`(mdm/lib `common/rule`)와 같은 알고리즘·같은 문구이고, 한 벌 코퍼스 `rule-set-corpus.json` 이 두 구현의 동치를 고정한다.
 * 알고리즘을 바꾸면 Java 쪽과 코퍼스를 함께 바꾼다. 화면 결과는 안내일 뿐이고 저장·되살리기 거부는 서버가 다시 계산해 판정한다(D9).
 *
 * `rules` 에 없거나 `exists=false` 인 룰, `conds`·`results` 가 null 인 룰은 조건·결과가 빈 것으로 본다. 이름 비교는 대소문자를 구분한다.
 * 비어 있는 칸은 undefined 가 아니라 null 로 낸다(서버 JSON 과 같게).
 * 흐름 세트는 계획 C4 의 경로 검사(`flowChecks`)를 쓰고, 목록 세트는 한 줄 흐름으로 같은 검사를 돌린다(`setChecks`).
 */
import type { RuleSetFlow } from "@/contract/engine-contract.generated";

import { flowRuleIds, isBlankJava, linearFlow, parseFlow, type FlowTree, type RuleStep, type Seq } from "./flow-model";
import type { CondIoMap, InputRow, IoName, IoSource, ResultRow, RuleIo, RuleIoMap, RuleSetCheck, SetIo } from "./types";

const DICT: IoSource = "DICT";
const PROG: IoSource = "PROG";

function ruleOf(rules: RuleIoMap, id: string): RuleIo | undefined {
  return Object.prototype.hasOwnProperty.call(rules, id) ? rules[id] : undefined;
}

function conds(rules: RuleIoMap, id: string): IoName[] {
  const r = ruleOf(rules, id);
  return !r || !r.exists || !r.conds ? [] : r.conds;
}

function results(rules: RuleIoMap, id: string): IoName[] {
  const r = ruleOf(rules, id);
  return !r || !r.exists || !r.results ? [] : r.results;
}

const produces = (rules: RuleIoMap, id: string, name: string) => results(rules, id).some((x) => x.name === name);

/** §6.2 — 목록 순서대로 훑어 앞 룰이 이미 만든 이름을 읽으면 그 결과의 readers 에, 아니면 입력 변수로 모은다. */
export function setIo(ids: readonly string[], rules: RuleIoMap): SetIo {
  const ins = new Map<string, InputRow>();
  const res = new Map<string, ResultRow>();
  for (const id of ids) {
    for (const c of conds(rules, id)) {
      const made = res.get(c.name);
      if (made) {
        made.readers.push(id);
        continue;
      }
      let row = ins.get(c.name);
      if (!row) {
        row = {
          name: c.name,
          label: c.label,
          dataType: c.dataType,
          scale: c.scale,
          dateString: c.dateString,
          maruCodeId: c.maruCodeId,
          source: c.source,
          users: [],
        };
        ins.set(c.name, row);
      }
      row.users.push(id);
    }
    for (const x of results(rules, id)) {
      let row = res.get(x.name);
      if (!row) {
        row = { name: x.name, dataType: x.dataType, scale: x.scale, dateString: x.dateString, maruCodeId: x.maruCodeId, by: [], readers: [] };
        res.set(x.name, row);
      }
      row.by.push(id);
    }
  }
  return { inputs: [...ins.values()], results: [...res.values()] };
}

/** 최종 결과 = 세트 안에서 아무도 뒤에서 읽지 않는다. 그 밖은 중간 결과. */
export const isFinalResult = (row: Pick<ResultRow, "readers">) => row.readers.length === 0;

/** I11 — deps[id] = 세트 안에서 id 가 아닌 룰 가운데 id 의 DICT 가 아닌 조건 이름을 만드는 룰(목록 순, 중복 없음). 목록의 모든 ID 가 키다. */
export function setDeps(ids: readonly string[], rules: RuleIoMap): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const id of ids) {
    if (Object.prototype.hasOwnProperty.call(out, id)) continue;
    const reads = new Set(conds(rules, id).filter((c) => c.source !== DICT).map((c) => c.name));
    const d: string[] = [];
    for (const j of ids) {
      if (j !== id && !d.includes(j) && results(rules, j).some((x) => reads.has(x.name))) d.push(j);
    }
    out[id] = d;
  }
  return out;
}

/** 의존 그래프(a → d[a] 의 각 원소)를 j 에서 따라가 target 에 닿는가. */
function reaches(j: string, target: string, d: Readonly<Record<string, readonly string[]>>): boolean {
  const seen = new Set<string>([j]);
  const stack = [j];
  while (stack.length) {
    const a = stack.pop()!;
    for (const b of Object.prototype.hasOwnProperty.call(d, a) ? d[a] : []) {
      if (b === target) return true;
      if (!seen.has(b)) {
        seen.add(b);
        stack.push(b);
      }
    }
  }
  return false;
}

/** 이 룰의 결과 이름과 상대 룰의 조건 이름(출처 무관)이 겹치는가. */
const overlaps = (mine: IoName[], otherConds: IoName[]) => mine.some((x) => otherConds.some((c) => c.name === x.name));

const check = (
  code: RuleSetCheck["code"],
  severity: RuleSetCheck["severity"],
  ruleId: string | null,
  otherRuleId: string | null,
  varName: string | null,
  message: string,
  nodeId: string | null = null,
  edgeId: string | null = null,
): RuleSetCheck => ({ code, severity, ruleId, otherRuleId, varName, message, nodeId, edgeId });

/** §6.3 — 목록 세트 검사. 한 줄 흐름(`linearFlow`)으로 `flowChecks` 를 돌리고 위치(nodeId·edgeId)는 비운다(D8, 기존 코퍼스 사례 불변). */
export function setChecks(ids: readonly string[], rules: RuleIoMap): RuleSetCheck[] {
  return flowChecks(linearFlow(ids), rules, {}).map((c) => ({ ...c, nodeId: null, edgeId: null }));
}

/** 흐름 세트의 입출력 표(D10) — 흐름을 펼친 룰 목록으로 `setIo` 를 계산한다. */
export function flowIo(flow: RuleSetFlow, rules: RuleIoMap): SetIo {
  return setIo(flowRuleIds(flow), rules);
}

/** 흐름 세트의 의존 룰(D10) — 흐름을 펼친 룰 목록으로 `setDeps` 를 계산한다. */
export function flowDeps(flow: RuleSetFlow, rules: RuleIoMap): Record<string, string[]> {
  return setDeps(flowRuleIds(flow), rules);
}

/**
 * 계획 C4 — 존재·상태 → EMPTY → 구조(있으면 끝) → 경로 검사. 서버 `RuleSetAnalyzer.checks(flow, rules, condIo)` 와 같은 코드·문구·순서다.
 */
export function flowChecks(flow: RuleSetFlow, rules: RuleIoMap, condIo: CondIoMap): RuleSetCheck[] {
  const out: RuleSetCheck[] = [];
  const parsed = parseFlow(flow);
  // 컨트롤러 수정(Task 6 대조): 겹친 노드 ID 는 첫 노드만 보고(C3), 공백 판정은 Java isBlank 의미(flow-model.ts 의 blank 를 `isBlankJava` 로 export 해 쓴다).
  const firstNode = new Map<string, string>();
  const seenNodeIds = new Set<string>();
  for (const n of flow.nodes ?? []) {
    if (seenNodeIds.has(n.id)) continue;
    seenNodeIds.add(n.id);
    if (n.kind === "RULE" && !isBlankJava(n.ruleId) && !firstNode.has(n.ruleId!)) firstNode.set(n.ruleId!, n.id);
  }
  for (const id of flowRuleIds(flow, parsed)) {
    const r = ruleOf(rules, id);
    const at = firstNode.get(id) ?? null;
    if (!r || !r.exists) {
      out.push(check("RULE_NOT_FOUND", "REJECT", id, null, null, `${id}는 없는 룰이다`, at));
    } else if (r.status === "DEPRECATED") {
      out.push(check("RULE_DEPRECATED", "REJECT", id, null, null, `${id}는 DEPRECATED다`, at));
    } else if (r.releasedVer == null) {
      out.push(check("NO_RELEASED", "WARN", id, null, null, `${id}는 RELEASED 버전이 없어 입출력을 계산하지 않았다. 이대로 부르면 판정 오류다`, at));
    }
  }
  if (!(flow.nodes ?? []).some((n) => n.kind === "RULE")) out.push(check("EMPTY", "REJECT", null, null, null, "룰이 하나도 없다"));
  if (!parsed.tree) {
    for (const i of parsed.issues) out.push(check(i.code, "REJECT", null, null, null, i.message, i.nodeId, i.edgeId));
    return out;
  }
  pathChecks(parsed.tree, rules, condIo, out);
  return out;
}

/** 경로 상태 — 반드시 만들어진 이름, 일부 IF 갈래에서만 만들어진 이름, 이름별 마지막 생산 노드(C4 4). */
interface PathState {
  defined: Set<string>;
  maybe: Set<string>;
  prodBy: Map<string, RuleStep>;
}

const copyState = (s: PathState): PathState => ({ defined: new Set(s.defined), maybe: new Set(s.maybe), prodBy: new Map(s.prodBy) });
const uniq = (xs: readonly string[]) => [...new Set(xs)];

/** 합류 — IF 는 모든 갈래가 만든 것만 defined, 나머지는 maybe. PARALLEL 은 어느 갈래든 만든 것이 defined. prodBy 는 갈래 순서로 처음 바뀐 값. */
function mergeState(kind: "IF" | "PARALLEL", s: PathState, ends: readonly PathState[]): void {
  const over = new Map<string, RuleStep>();
  for (const e of ends) {
    for (const [k, v] of e.prodBy) if (s.prodBy.get(k) !== v && !over.has(k)) over.set(k, v);
  }
  if (kind === "IF") {
    const all = new Set<string>();
    for (const e of ends) for (const x of e.defined) all.add(x);
    for (const x of all) if (ends.every((e) => e.defined.has(x))) s.defined.add(x);
    for (const e of ends) for (const x of e.maybe) s.maybe.add(x);
    for (const x of all) if (!s.defined.has(x)) s.maybe.add(x);
  } else {
    for (const e of ends) {
      for (const x of e.defined) s.defined.add(x);
      for (const x of e.maybe) s.maybe.add(x);
    }
  }
  for (const [k, v] of over) s.prodBy.set(k, v);
}

/** C4 4 — 트리를 깊이 우선으로 돌며 조건식·룰 검사를 낸다. */
function pathChecks(tree: FlowTree, rules: RuleIoMap, condIo: CondIoMap, out: RuleSetCheck[]): void {
  const steps = tree.ruleSteps();
  const index = new Map(steps.map((s, i) => [s.nodeId, i] as const));
  const d = setDeps(tree.ruleIds(), rules);
  const makers = (name: string) => steps.filter((m) => produces(rules, m.ruleId, name));

  const cond = (ifId: string, edgeId: string, s: PathState) => {
    const io = Object.prototype.hasOwnProperty.call(condIo, edgeId) ? condIo[edgeId] : undefined;
    if (!io || !io.ok) {
      out.push(check("FLOW_COND", "REJECT", null, null, null, `${edgeId} 갈래 조건식을 읽을 수 없다: ${io?.message ?? "조건식 정보 없음"}`, ifId, edgeId));
      return;
    }
    for (const v of io.vars) {
      if (v.source === DICT || s.defined.has(v.name)) continue;
      if (s.maybe.has(v.name)) {
        out.push(
          check("FLOW_PARTIAL", "WARN", null, null, v.name, `${edgeId} 갈래 조건식이 읽는 ${v.name}는 IF 의 일부 갈래에서만 만들어진다. 다른 갈래를 타면 판정 오류다`, ifId, edgeId),
        );
      } else {
        out.push(check("FLOW_COND", "REJECT", null, null, v.name, `${edgeId} 갈래 조건식이 읽는 ${v.name}는 이 지점에서 정의되지 않았다`, ifId, edgeId));
      }
    }
  };

  const rule = (n: RuleStep, s: PathState) => {
    const id = n.ruleId;
    for (const c of conds(rules, id)) {
      if (c.source === DICT || s.defined.has(c.name)) continue;
      if (s.maybe.has(c.name)) {
        out.push(check("FLOW_PARTIAL", "WARN", id, null, c.name, `${id}가 읽는 ${c.name}는 IF 의 일부 갈래에서만 만들어진다. 다른 갈래를 타면 판정 오류다`, n.nodeId));
        continue;
      }
      const mk = makers(c.name);
      const later = uniq(mk.filter((m) => m.ruleId !== id && tree.relation(n.nodeId, m.nodeId) === "BEFORE").map((m) => m.ruleId));
      if (later.length) {
        const cyc = later.find((j) => reaches(j, id, d) || overlaps(results(rules, id), conds(rules, j))) ?? null;
        if (cyc != null) {
          out.push(check("CYCLE", "REJECT", id, cyc, c.name, `${id}와 ${cyc}가 서로의 결과 변수를 읽는다(순환). 순서를 바꿔서는 풀리지 않는다`, n.nodeId));
        } else {
          out.push(
            check("ORDER", "REJECT", id, later[0], c.name, `${id}가 뒤에 도는 ${later.join(", ")}의 결과 변수 ${c.name}를 읽는다. ${later[0]}를 ${id} 앞으로 옮긴다`, n.nodeId),
          );
        }
        continue;
      }
      const excl = uniq(mk.filter((m) => tree.relation(n.nodeId, m.nodeId) === "EXCLUSIVE").map((m) => m.ruleId));
      if (excl.length) {
        out.push(
          check("IF_SIBLING", "REJECT", id, excl[0], c.name, `${id}가 읽는 ${c.name}는 같은 IF 의 다른 갈래(${excl.join(", ")})에서만 만들어진다. 이 갈래를 타면 값이 없다`, n.nodeId),
        );
        continue;
      }
      const par = uniq(mk.filter((m) => tree.relation(n.nodeId, m.nodeId) === "PARALLEL").map((m) => m.ruleId));
      if (par.length) {
        out.push(check("PAR_SIBLING", "REJECT", id, par[0], c.name, `${id}가 병렬 형제 갈래의 ${par[0]}가 만드는 ${c.name}를 읽는다. 병렬 갈래끼리는 결과를 읽을 수 없다`, n.nodeId));
        continue;
      }
      if (c.source !== PROG) {
        out.push(check("UNKNOWN_INPUT", "REJECT", id, null, c.name, `${id}의 조건 변수 ${c.name}는 컬럼 사전에 없고 세트 안의 어느 룰도 만들지 않는다`, n.nodeId));
      }
    }
    for (const x of results(rules, id)) {
      const sib = steps.find(
        (m) => index.get(m.nodeId)! < index.get(n.nodeId)! && tree.relation(n.nodeId, m.nodeId) === "PARALLEL" && produces(rules, m.ruleId, x.name),
      );
      if (sib) {
        out.push(check("PAR_SIBLING", "REJECT", id, sib.ruleId, x.name, `병렬 갈래의 ${sib.ruleId}와 ${id}가 같은 결과 변수 ${x.name}에 대입한다`, n.nodeId));
      } else {
        const prev = s.prodBy.get(x.name);
        if (prev) out.push(check("DUP_RESULT", "WARN", id, prev.ruleId, x.name, `${prev.ruleId}와 ${id}가 같은 결과 변수 ${x.name}에 대입한다`, n.nodeId));
      }
      s.prodBy.set(x.name, n);
      s.defined.add(x.name);
    }
  };

  const walk = (seq: Seq, s: PathState) => {
    for (const b of seq.items) {
      if (b.type === "RULE") rule(b, s);
      else if (b.type === "SEQ") walk(b, s);
      else {
        if (b.kind === "IF") for (const br of b.branches) if (!br.otherwise) cond(b.nodeId, br.edgeId, s);
        const ends = b.branches.map((br) => {
          const sb = copyState(s);
          walk(br.body, sb);
          return sb;
        });
        mergeState(b.kind, s, ends);
      }
    }
  };
  walk(tree.root, { defined: new Set(), maybe: new Set(), prodBy: new Map() });
}

/** 룰 목록 한 행의 조건 변수 칩 하나. */
export interface CondMark {
  name: string;
  source: IoSource | null;
  /** 붉은 칩 — DICT 가 아니고, 앞에서 아직 안 만든 PROG 도 아니다. */
  red: boolean;
  /** "앞에 없음" 배지 — 붉은 칩이면서 앞 룰이 아직 만들지 않았다. */
  missingBefore: boolean;
}

/**
 * §6.9(시안 H:2196) — 목록 행마다(ids 와 같은 자리) 조건 변수 칩의 강조. DICT 거나 (앞에서 아직 안 만들어졌고 PROG) 면 보통 칩, 그 밖은 붉은 칩이고
 * 앞에서 만들어지지 않은 것에는 "앞에 없음" 배지를 단다.
 */
export function condMarks(ids: readonly string[], rules: RuleIoMap): CondMark[][] {
  const produced = new Set<string>();
  return ids.map((id) => {
    const marks = conds(rules, id).map((c) => {
      const before = produced.has(c.name);
      const plain = c.source === DICT || (!before && c.source === PROG);
      return { name: c.name, source: c.source, red: !plain, missingBefore: !plain && !before };
    });
    for (const x of results(rules, id)) produced.add(x.name);
    return marks;
  });
}

/** 의존 룰 가운데 목록에서 그 룰보다 뒤에 있는 것("뒤에 있음" 배지). 목록의 모든 ID 가 키다. */
export function laterDeps(ids: readonly string[], deps: Readonly<Record<string, readonly string[]>>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  ids.forEach((id, i) => {
    if (Object.prototype.hasOwnProperty.call(out, id)) return;
    const mine = Object.prototype.hasOwnProperty.call(deps, id) ? deps[id] : [];
    out[id] = mine.filter((j) => ids.indexOf(j) > i);
  });
  return out;
}
