/**
 * 룰 세트 화면 즉시 계산 — 입출력 표·의존 룰·저장 시 검사(TSK-08-06 design §6.2·§6.3, I9·I10·I11·I21). React 의존 없는 순수 함수다.
 * 서버 `RuleSetAnalyzer`(mdm/lib `common/rule`)와 같은 알고리즘·같은 문구이고, 한 벌 코퍼스 `rule-set-corpus.json` 이 두 구현의 동치를 고정한다.
 * 알고리즘을 바꾸면 Java 쪽과 코퍼스를 함께 바꾼다. 화면 결과는 안내일 뿐이고 저장·되살리기 거부는 서버가 다시 계산해 판정한다(D9).
 *
 * `rules` 에 없거나 `exists=false` 인 룰, `conds`·`results` 가 null 인 룰은 조건·결과가 빈 것으로 본다. 이름 비교는 대소문자를 구분한다.
 * 비어 있는 칸은 undefined 가 아니라 null 로 낸다(서버 JSON 과 같게).
 * 흐름 세트는 계획 C4 의 경로 검사(`flowChecks`)를 쓰고, 목록 세트는 한 줄 흐름으로 같은 검사를 돌린다(`setChecks`).
 * IF 블록 뒤 상태는 이어지는 갈래만 합친다 — 끝내는 IF 갈래·끝내는 처리 갈래는 세지 않는다(implicit-join spec §6).
 *
 * SET 노드(하위 세트 호출)는 그 세트의 겉모양 `SetCallIo` 를 키 `set:{setId}` 의 룰 입출력으로 넣어 RULE 처럼 돈다(하위 세트 Ruling 6).
 * 입출력 표·의존 룰에는 그 키가 그대로 나오고, 검사 문구에서는 "세트 {setId}", 검사 칸(ruleId·otherRuleId)은 세트 ID 다.
 * RULE 만 있는 흐름의 문구·순서는 바뀌지 않는다.
 */
import type { RuleSetFlow } from "@/contract/engine-contract.generated";

import {
  CATCH_NAMES,
  flowRuleIds,
  isBlankJava,
  linearFlow,
  parseFlow,
  type FlowParse,
  type FlowTree,
  type Guarded,
  type RuleStep,
  type Seq,
  type SetStep,
  type Step,
} from "./flow-model";
import type { CondIoMap, InputRow, IoName, IoSource, ResultRow, RuleIo, RuleIoMap, RuleSetCheck, SetCallIo, SetCallIoMap, SetIo } from "./types";

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

// ───────────────────────── 하위 세트(SET 노드) 키 — 서버 `SetCallIo`·`RuleSetAnalyzer` 짝 ─────────────────────────

/** 분석기 맵 키 접두(서버 `SetCallIo.KEY_PREFIX`) — 소문자 접두는 룰 ID 정규식에 없어 룰 ID 와 겹치지 않는다. */
const SET_KEY_PREFIX = "set:";
/** 분석기 맵 키(하위 세트 Ruling 6). */
export const setKey = (setId: string) => `${SET_KEY_PREFIX}${setId}`;
export const isSetKey = (key: string | null | undefined): key is string => key != null && key.startsWith(SET_KEY_PREFIX);
/** 세트 키면 세트 ID, 아니면 그대로(룰 ID). */
export const setIdOfKey = (key: string) => (isSetKey(key) ? key.slice(SET_KEY_PREFIX.length) : key);
/** 검사 문구의 이름 — 세트 키면 "세트 {setId}", 룰이면 그대로. */
const disp = (key: string) => (isSetKey(key) ? `세트 ${setIdOfKey(key)}` : key);

/** RULE·SET 단계(TASK 는 뺀다). */
export type CallStep = RuleStep | SetStep;

/** RULE 은 룰 ID, SET 은 set:{setId}. 빈 세트 ID·TASK 는 null(서버 `RuleSetAnalyzer.keyOf`). */
export function keyOf(c: Step): string | null {
  if (c.type === "RULE") return c.ruleId;
  if (c.type === "SET") return isBlankJava(c.setId) ? null : setKey(c.setId as string);
  return null;
}

/** 분석기용 룰 입출력의 releasedVer 표시(서버 `SetCallIo.RELEASED_MARK`) — 분석기는 null 인지만 본다(RELEASED 가 있음 = exists). */
const RELEASED_MARK = "1.000";

/** 하위 세트 겉모양 → 분석기용 룰 입출력(입력 = 조건, 출력 = 결과, 기본 행 없음). 서버 `SetCallIo.asRuleIo` 와 같다. */
export function callRuleIo(c: SetCallIo): RuleIo {
  return {
    ruleId: setKey(c.setId),
    ruleName: null,
    ruleKind: null,
    status: c.status,
    exists: c.exists,
    releasedVer: c.exists ? RELEASED_MARK : null,
    hitPolicy: null,
    conds: c.inputs,
    results: c.outputs.map((o) => ({ name: o.name, source: null, label: null, dataType: o.dataType, scale: o.scale, dateString: o.dateString, maruCodeId: o.maruCodeId })),
    hasDefault: false,
  };
}

/** 룰 입출력 맵에 세트 겉모양을 키 set:{setId} 로 더한 사본(calls 가 비면 rules 그대로 — 서버 `RuleSetAnalyzer.withCalls`). */
function withCalls(rules: RuleIoMap, calls: SetCallIoMap): RuleIoMap {
  const entries = Object.entries(calls).filter((e): e is [string, SetCallIo] => e[1] != null);
  if (entries.length === 0) return rules;
  const all: Record<string, RuleIo | undefined> = { ...rules };
  for (const [id, c] of entries) all[setKey(id)] = callRuleIo(c);
  return all;
}

const callOf = (calls: SetCallIoMap, setId: string): SetCallIo | undefined =>
  Object.prototype.hasOwnProperty.call(calls, setId) ? calls[setId] : undefined;

/**
 * 흐름 트리의 RULE·SET 단계(서버 `RuleSetAnalyzer.callSteps` 짝 — 엔진·화면 `FlowTree` 에 callSteps 를 두지 않는다). 루트부터 깊이 우선으로 RULE·SET 은
 * 담고 TASK 는 건너뛴다. 받는 노드 블록은 자기 단계(RULE·SET 일 때) → 정상 갈래 → 처리 갈래(배열 순서), 분기는 갈래 실행 순서. 같은 노드는 한 번만.
 * RULE 부분은 `FlowTree.ruleSteps()`, SET 부분은 `setSteps()` 와 같은 순서다(시험이 코퍼스 전체로 단언한다).
 */
export function callSteps(tree: FlowTree): CallStep[] {
  const out: CallStep[] = [];
  const seen = new Set<string>();
  const add = (st: Step) => {
    if ((st.type === "RULE" || st.type === "SET") && !seen.has(st.nodeId)) {
      seen.add(st.nodeId);
      out.push(st);
    }
  };
  const collect = (s: Seq) => {
    for (const b of s.items) {
      if (b.type === "RULE" || b.type === "TASK" || b.type === "SET") add(b);
      else if (b.type === "GUARDED") {
        add(b.step);
        collect(b.normal);
        for (const h of b.handlers) collect(h.body);
      } else if (b.type === "SPLIT") {
        for (const br of b.branches) collect(br.body);
      } else collect(b);
    }
  };
  collect(tree.root);
  return out;
}

/**
 * 흐름의 RULE·SET 노드 키(룰 ID, SET 은 set:{setId})를 깊이 우선으로 중복 없이(빈 ID 제외). 구조 오류로 트리가 없으면 노드 배열 순서(노드 ID 가 겹치면
 * 첫 노드만). 세트 키를 뺀 목록은 `flowRuleIds` 와 같다(서버 `RuleSetAnalyzer.callKeys`).
 */
export function flowCallKeys(flow: RuleSetFlow, parsed: FlowParse = parseFlow(flow)): string[] {
  const out = new Set<string>();
  if (parsed.tree) {
    for (const c of callSteps(parsed.tree)) {
      const k = keyOf(c);
      if (k != null) out.add(k);
    }
    return [...out];
  }
  const seenNodes = new Set<string>();
  for (const n of flow.nodes ?? []) {
    if (seenNodes.has(n.id)) continue;
    seenNodes.add(n.id);
    if (n.kind === "RULE" && !isBlankJava(n.ruleId)) out.add(n.ruleId as string);
    else if (n.kind === "SET" && !isBlankJava(n.setId)) out.add(setKey(n.setId as string));
  }
  return [...out];
}

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

/** 변수 이름 → 표시명 표(선의 변수 칩 [이름] 모드). 룰 입출력의 conds·results 에서 처음 나온 비어 있지 않은 표시명을 쓴다. 표시명이 없는 이름은 표에 없다. */
export function varLabelsOf(rules: RuleIoMap): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of Object.values(rules)) {
    if (!r || !r.exists) continue;
    for (const x of [...(r.conds ?? []), ...(r.results ?? [])]) {
      if (x.label && x.label.trim() && !(x.name in out)) out[x.name] = x.label;
    }
  }
  return out;
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

/** 흐름 세트의 입출력 표(D10) — 흐름을 펼친 RULE·SET 키 목록으로 `setIo` 를 계산한다. SET 노드는 키 set:{setId} 의 룰처럼 센다(하위 세트 Ruling 6). */
export function flowIo(flow: RuleSetFlow, rules: RuleIoMap, calls: SetCallIoMap = {}): SetIo {
  return setIo(flowCallKeys(flow), withCalls(rules, calls));
}

/** 흐름 세트의 의존 룰(D10) — 흐름을 펼친 RULE·SET 키 목록으로 `setDeps` 를 계산한다. SET 노드는 키 set:{setId} 의 룰처럼 센다. */
export function flowDeps(flow: RuleSetFlow, rules: RuleIoMap, calls: SetCallIoMap = {}): Record<string, string[]> {
  return setDeps(flowCallKeys(flow), withCalls(rules, calls));
}

/**
 * 계획 C4 — 존재·상태 → 세트 호출(CALL_MISSING) → EMPTY → 빈 단계(EMPTY_TASK) → 구조(있으면 끝) → 경로 검사.
 * 서버 `RuleSetAnalyzer.checks(flow, rules, condIo, calls)` 와 같은 코드·문구·순서다. calls 에 없는 세트 ID 는 없는 세트다(하위 세트 Ruling 8).
 * 노드·선만 읽고 `view` 는 읽지 않는다 — `useRuleSetEdit` 의 `checks` 가 이 전제로 노드·선 JSON 을 캐시 키로 쓴다. `view` 를 읽게 되면 그 키도 고친다.
 */
export function flowChecks(flow: RuleSetFlow, rules: RuleIoMap, condIo: CondIoMap, calls: SetCallIoMap = {}): RuleSetCheck[] {
  const out: RuleSetCheck[] = [];
  const parsed = parseFlow(flow);
  // 겹친 노드 ID 는 첫 노드만 보고(C3), 공백 판정은 Java isBlank 의미(flow-model.ts 의 blank 를 `isBlankJava` 로 export 해 쓴다).
  const firstNode = new Map<string, string>();
  const seenNodeIds = new Set<string>();
  let tasks = 0;
  for (const n of flow.nodes ?? []) {
    if (seenNodeIds.has(n.id)) continue;
    seenNodeIds.add(n.id);
    if (n.kind === "RULE" && !isBlankJava(n.ruleId) && !firstNode.has(n.ruleId!)) firstNode.set(n.ruleId!, n.id);
    if (n.kind === "TASK") tasks++;
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
  callMissing(flow, calls, out);
  // 빈 단계·SET 노드도 단계로 센다 — 그림부터 그리고 룰을 나중에 채우는 흐름, SET 노드만 있는 세트를 저장할 수 있게(컨트롤러 Ruling, 하위 세트 Ruling 18)
  if (!(flow.nodes ?? []).some((n) => n.kind === "RULE" || n.kind === "TASK" || n.kind === "SET")) out.push(check("EMPTY", "REJECT", null, null, null, "룰이 하나도 없다"));
  if (tasks > 0) out.push(check("EMPTY_TASK", "WARN", null, null, null, `빈 단계 ${tasks}개 — 실행 때 그냥 지나간다`));
  if (!parsed.tree) {
    for (const i of parsed.issues) out.push(check(i.code, "REJECT", null, null, null, i.message, i.nodeId, i.edgeId));
    return out;
  }
  pathChecks(parsed.tree, withCalls(rules, calls), condIo, calls, out);
  return out;
}

/** 하위 세트 spec §5 CALL_MISSING(Ruling 8, 수준 WARN — 편차 13) — 노드 배열 순서, 같은 세트 ID 는 첫 노드에만, 빈 ID 는 노드마다. */
function callMissing(flow: RuleSetFlow, calls: SetCallIoMap, out: RuleSetCheck[]): void {
  const seenNodes = new Set<string>();
  const seenSets = new Set<string>();
  for (const n of flow.nodes ?? []) {
    if (seenNodes.has(n.id)) continue;
    seenNodes.add(n.id);
    if (n.kind !== "SET") continue;
    if (isBlankJava(n.setId)) {
      out.push(check("CALL_MISSING", "WARN", null, null, null, `세트 노드 ${n.id}에 세트 ID가 없다`, n.id));
      continue;
    }
    const id = n.setId as string;
    if (seenSets.has(id)) continue;
    seenSets.add(id);
    const c = callOf(calls, id);
    if (!c || !c.exists) out.push(check("CALL_MISSING", "WARN", id, null, null, `${id}는 없는 세트다`, n.id));
    else if (c.status === "DEPRECATED") out.push(check("CALL_MISSING", "WARN", id, null, null, `${id}는 폐기된 세트다`, n.id));
  }
}

/** 경로 상태 — 반드시 만들어진 이름, 일부 IF 갈래에서만 만들어진 이름, 이름별 마지막 생산 노드(RULE·SET, C4 4). */
interface PathState {
  defined: Set<string>;
  maybe: Set<string>;
  prodBy: Map<string, CallStep>;
}

const copyState = (s: PathState): PathState => ({ defined: new Set(s.defined), maybe: new Set(s.maybe), prodBy: new Map(s.prodBy) });
const uniq = (xs: readonly string[]) => [...new Set(xs)];

/** 합류 — IF 는 모든 갈래가 만든 것만 defined, 나머지는 maybe. PARALLEL 은 어느 갈래든 만든 것이 defined. prodBy 는 갈래 순서로 처음 바뀐 값. */
function mergeState(kind: "IF" | "PARALLEL", s: PathState, ends: readonly PathState[]): void {
  const over = new Map<string, CallStep>();
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

/**
 * C4 4 — 트리를 깊이 우선으로 돌며 조건식·RULE·SET 검사를 낸다(서버 `RuleSetAnalyzer.PathWalk`). rules 는 세트 겉모양(키 set:{setId})을 더한 맵,
 * calls 는 세트 ID → 겉모양(always·endsEarly 판정용).
 */
function pathChecks(tree: FlowTree, rules: RuleIoMap, condIo: CondIoMap, calls: SetCallIoMap, out: RuleSetCheck[]): void {
  const steps = callSteps(tree);
  const index = new Map(steps.map((s, i) => [s.nodeId, i] as const));
  const d = setDeps(uniq(steps.map(keyOf).filter((k): k is string => k != null)), rules);
  const makers = (name: string) =>
    steps.filter((m) => {
      const k = keyOf(m);
      return k != null && produces(rules, k, name);
    });
  // P3 — 세트 안 룰(입출력을 아는 룰)이 선언한 이름(대문자). 경로와 무관하게 세트 전체로 센다. 하위 세트 선언은 세지 않는다(하위 세트 Ruling 20).
  const declared = new Set<string>();
  for (const id of tree.ruleIds()) {
    const r = ruleOf(rules, id);
    if (r && r.exists && r.releasedVer != null) {
      for (const c of conds(rules, id)) declared.add(c.name.toUpperCase());
      for (const x of results(rules, id)) declared.add(x.name.toUpperCase());
    }
  }

  const cond = (ifId: string, edgeId: string, s: PathState) => {
    const io = Object.prototype.hasOwnProperty.call(condIo, edgeId) ? condIo[edgeId] : undefined;
    if (!io || !io.ok) {
      out.push(check("FLOW_COND", "REJECT", null, null, null, `${edgeId} 갈래 조건식을 읽을 수 없다: ${io?.message ?? "조건식 정보 없음"}`, ifId, edgeId));
      return;
    }
    for (const v of io.vars) {
      const dict = v.source === DICT;
      if (!dict && !s.defined.has(v.name)) {
        if (s.maybe.has(v.name)) {
          out.push(
            check("FLOW_PARTIAL", "WARN", null, null, v.name, `${edgeId} 갈래 조건식이 읽는 ${v.name}는 IF 의 일부 갈래에서만 만들어진다. 다른 갈래를 타면 판정 오류다`, ifId, edgeId),
          );
        } else {
          out.push(check("FLOW_COND", "REJECT", null, null, v.name, `${edgeId} 갈래 조건식이 읽는 ${v.name}는 이 지점에서 정의되지 않았다`, ifId, edgeId));
        }
      }
      // P3 — DICT 변수는 판정을 통과해도 선언 검사로 이어진다(엔진은 선언이 없으면 레코드 값 그대로 비교한다).
      if (dict && !declared.has(v.name.toUpperCase())) {
        out.push(
          check(
            "COND_UNTYPED",
            "WARN",
            null,
            null,
            v.name,
            `${edgeId} 갈래 조건식이 읽는 ${v.name}는 세트 안 어느 룰도 타입을 선언하지 않아 레코드 값 그대로 비교한다. 숫자를 문자열로 넘기면 사전순으로 비교된다`,
            ifId,
            edgeId,
          ),
        );
      }
    }
  };

  /** 세트 키면 그 세트의 always=false 출력 이름(하위 세트 Ruling 7). 룰이면 빈 집합. */
  const partial = (id: string): Set<string> => {
    const c = isSetKey(id) ? callOf(calls, setIdOfKey(id)) : undefined;
    return new Set((c?.outputs ?? []).filter((o) => !o.always).map((o) => o.name));
  };

  /**
   * RULE·SET 노드 하나 — id 는 룰 ID 또는 set:{setId}. 문구의 이름은 `disp`(세트면 "세트 {setId}"), 검사 칸은 `setIdOfKey`(하위 세트 Ruling 6).
   * RULE 만 있는 흐름의 문구·순서는 바뀌지 않는다.
   */
  const step = (n: CallStep, id: string, s: PathState) => {
    const me = disp(id);
    const meId = setIdOfKey(id);
    for (const c of conds(rules, id)) {
      // 받는 노드 예약 이름(R13) — 처리 갈래 안이면 지나가고, 밖이면 ORDER 다.
      const upper = c.name.toUpperCase();
      if (CATCH_NAMES.includes(upper)) {
        if (!s.defined.has(upper)) {
          out.push(check("ORDER", "REJECT", meId, null, c.name, `${me}가 읽는 ${c.name}는 받는 노드의 처리 갈래 안에서만 있다`, n.nodeId));
        }
        continue;
      }
      if (c.source === DICT || s.defined.has(c.name)) continue;
      if (s.maybe.has(c.name)) {
        out.push(check("FLOW_PARTIAL", "WARN", meId, null, c.name, `${me}가 읽는 ${c.name}는 IF 의 일부 갈래에서만 만들어진다. 다른 갈래를 타면 판정 오류다`, n.nodeId));
        continue;
      }
      const mk = makers(c.name);
      const later = uniq(mk.filter((m) => keyOf(m) !== id && tree.relation(n.nodeId, m.nodeId) === "BEFORE").map((m) => keyOf(m) as string));
      if (later.length) {
        const cyc = later.find((j) => reaches(j, id, d) || overlaps(results(rules, id), conds(rules, j))) ?? null;
        if (cyc != null) {
          out.push(check("CYCLE", "REJECT", meId, setIdOfKey(cyc), c.name, `${me}와 ${disp(cyc)}가 서로의 결과 변수를 읽는다(순환). 순서를 바꿔서는 풀리지 않는다`, n.nodeId));
        } else {
          out.push(
            check(
              "ORDER",
              "REJECT",
              meId,
              setIdOfKey(later[0]),
              c.name,
              `${me}가 뒤에 도는 ${later.map(disp).join(", ")}의 결과 변수 ${c.name}를 읽는다. ${disp(later[0])}를 ${me} 앞으로 옮긴다`,
              n.nodeId,
            ),
          );
        }
        continue;
      }
      const excl = uniq(mk.filter((m) => m.nodeId !== n.nodeId && tree.relation(n.nodeId, m.nodeId) === "EXCLUSIVE").map((m) => keyOf(m) as string));
      if (excl.length) {
        out.push(
          check(
            "IF_SIBLING",
            "REJECT",
            meId,
            setIdOfKey(excl[0]),
            c.name,
            `${me}가 읽는 ${c.name}는 같은 IF 의 다른 갈래(${excl.map(disp).join(", ")})에서만 만들어진다. 이 갈래를 타면 값이 없다`,
            n.nodeId,
          ),
        );
        continue;
      }
      const par = uniq(mk.filter((m) => m.nodeId !== n.nodeId && tree.relation(n.nodeId, m.nodeId) === "PARALLEL").map((m) => keyOf(m) as string));
      if (par.length) {
        out.push(
          check("PAR_SIBLING", "REJECT", meId, setIdOfKey(par[0]), c.name, `${me}가 병렬 형제 갈래의 ${disp(par[0])}가 만드는 ${c.name}를 읽는다. 병렬 갈래끼리는 결과를 읽을 수 없다`, n.nodeId),
        );
        continue;
      }
      if (c.source !== PROG) {
        out.push(check("UNKNOWN_INPUT", "REJECT", meId, null, c.name, `${me}의 조건 변수 ${c.name}는 컬럼 사전에 없고 세트 안의 어느 룰도 만들지 않는다`, n.nodeId));
      }
    }
    const part = partial(id);
    for (const x of results(rules, id)) {
      const sib = steps.find((m) => {
        const k = keyOf(m);
        return index.get(m.nodeId)! < index.get(n.nodeId)! && k != null && tree.relation(n.nodeId, m.nodeId) === "PARALLEL" && produces(rules, k, x.name);
      });
      if (sib) {
        const sk = keyOf(sib) as string;
        out.push(check("PAR_SIBLING", "REJECT", meId, setIdOfKey(sk), x.name, `병렬 갈래의 ${disp(sk)}와 ${me}가 같은 결과 변수 ${x.name}에 대입한다`, n.nodeId));
      } else {
        const prev = s.prodBy.get(x.name);
        if (prev) {
          const pk = keyOf(prev) as string;
          out.push(check("DUP_RESULT", "WARN", meId, setIdOfKey(pk), x.name, `${disp(pk)}와 ${me}가 같은 결과 변수 ${x.name}에 대입한다`, n.nodeId));
        }
      }
      s.prodBy.set(x.name, n);
      // always=false 출력은 이미 반드시 정의된 이름이 아니면 일부 갈래에서만 정의된 이름이다(하위 세트 Ruling 7). prodBy 는 always 와 무관하게 갱신한다.
      if (part.has(x.name) && !s.defined.has(x.name)) s.maybe.add(x.name);
      else s.defined.add(x.name);
    }
  };

  /** RULE·TASK 노드의 받는 노드가 SUBSET_ENDED 를 받으면 처리 갈래마다 FLOW_CATCH(하위 세트 Ruling 9). what 은 "룰 노드"·"빈 단계 노드". */
  const subsetEndedMisplaced = (g: Guarded, what: string) => {
    for (const h of g.handlers) {
      if (h.kinds.includes("SUBSET_ENDED")) {
        out.push(check("FLOW_CATCH", "REJECT", null, null, null, `받는 노드 ${h.catchNodeId}: ${what}에는 하위 세트 예외 끝(SUBSET_ENDED)을 붙일 수 없다`, h.catchNodeId));
      }
    }
  };

  /**
   * SET 노드의 받는 노드(하위 세트 Ruling 9) — 처리 갈래 순서·받는 종류 저장 순서. NO_RESULT 는 FLOW_CATCH, SUBSET_ENDED 인데 겉모양이 있고 끝냄이
   * 없으면(endsEarly=false) CATCH_NEVER. 겉모양이 없는 세트는 CALL_MISSING 이 따로 알린다.
   */
  const neverSet = (g: Guarded, st: SetStep) => {
    const call = isBlankJava(st.setId) ? undefined : callOf(calls, st.setId as string);
    for (const h of g.handlers) {
      for (const k of h.kinds) {
        if (k === "NO_RESULT") {
          out.push(check("FLOW_CATCH", "REJECT", null, null, null, `받는 노드 ${h.catchNodeId}: 세트 노드에는 결과 없음(NO_RESULT)을 붙일 수 없다`, h.catchNodeId));
        } else if (k === "SUBSET_ENDED" && call && call.exists && !call.endsEarly) {
          out.push(
            check(
              "CATCH_NEVER",
              "WARN",
              st.setId,
              null,
              null,
              `받는 노드 ${h.catchNodeId}: 세트 ${st.setId}에는 END 로 가는 처리 갈래가 없어 하위 세트 예외 끝이 일어나지 않는다`,
              h.catchNodeId,
            ),
          );
        }
      }
    }
  };

  /**
   * CATCH_NEVER(R12, implicit-join spec §6)와 종류·대상 불일치 FLOW_CATCH(하위 세트 Ruling 9). 분기 순서는 SET → TASK → RULE. TASK·RULE 은 먼저
   * SUBSET_ENDED 를 받는 처리 갈래마다 FLOW_CATCH 를 낸 뒤 기존 CATCH_NEVER 를 낸다. 빈 단계는 받는 노드마다 한 줄, 룰은 처리 갈래 순서·받는 종류 저장
   * 순서(룰이 있고 RELEASED 가 있을 때만). FLOW_CATCH 는 ruleId 가 null, CATCH_NEVER 는 대상 ID(SET 이면 세트 ID), nodeId 는 둘 다 받는 노드다.
   */
  const never = (g: Guarded) => {
    if (g.step.type === "SET") {
      neverSet(g, g.step);
      return;
    }
    if (g.step.type === "TASK") {
      subsetEndedMisplaced(g, "빈 단계 노드");
      for (const h of g.handlers) out.push(check("CATCH_NEVER", "WARN", null, null, null, `${g.step.nodeId}는 빈 단계라 ${h.catchNodeId}가 받는 예외가 일어나지 않는다`, h.catchNodeId));
      return;
    }
    subsetEndedMisplaced(g, "룰 노드");
    const id = g.step.ruleId;
    const r = ruleOf(rules, id);
    if (!r || !r.exists || r.releasedVer == null) return;
    for (const h of g.handlers) {
      for (const k of h.kinds) {
        if (k === "NO_RESULT" && r.hasDefault === true) {
          out.push(check("CATCH_NEVER", "WARN", id, null, null, `${id}에 기본 행이 있어 ${h.catchNodeId}가 받는 결과 없음이 일어나지 않는다`, h.catchNodeId));
        } else if (k === "HIT_CONFLICT" && r.hitPolicy !== "UNIQUE" && r.hitPolicy !== "ANY") {
          out.push(
            check("CATCH_NEVER", "WARN", id, null, null, `${id}의 적중 정책 ${r.hitPolicy ?? "-"}에서는 ${h.catchNodeId}가 받는 판정 충돌이 일어나지 않는다`, h.catchNodeId),
          );
        }
      }
    }
  };

  /** 받는 노드 블록 — 서버 `RuleSetAnalyzer.PathWalk.guarded` 와 같은 순서·합류 규칙(단계 검사 → never → 정상 갈래 → 처리 갈래). */
  const guarded = (g: Guarded, s: PathState) => {
    const before = copyState(s);
    const key = keyOf(g.step);
    if (key != null && g.step.type !== "TASK") step(g.step, key, s);
    never(g);
    const normal = copyState(s);
    walk(g.normal, normal);
    const back: PathState[] = [normal];
    for (const h of g.handlers) {
      const hs = copyState(before);
      for (const x of CATCH_NAMES) hs.defined.add(x);
      walk(h.body, hs);
      for (const x of CATCH_NAMES) hs.defined.delete(x);
      if (!h.ends) back.push(hs);
    }
    // s 를 단계 직전 상태로 되돌린 뒤 IF 합류 규칙(defined·maybe·prodBy)으로 합친다.
    s.defined.clear();
    for (const x of before.defined) s.defined.add(x);
    s.maybe.clear();
    for (const x of before.maybe) s.maybe.add(x);
    s.prodBy.clear();
    for (const [k, v] of before.prodBy) s.prodBy.set(k, v);
    mergeState("IF", s, back);
  };

  const walk = (seq: Seq, s: PathState) => {
    for (const b of seq.items) {
      if (b.type === "RULE" || b.type === "SET") {
        const k = keyOf(b);
        if (k != null) step(b, k, s);
      } else if (b.type === "SEQ") walk(b, s);
      else if (b.type === "TASK") continue; // 빈 단계 — 읽거나 만드는 이름이 없다(4단계 spec §1.1)
      else if (b.type === "GUARDED") guarded(b, s);
      else {
        if (b.kind === "IF") for (const br of b.branches) if (!br.otherwise) cond(b.nodeId, br.edgeId, s);
        const ends: PathState[] = [];
        for (const br of b.branches) {
          const sb = copyState(s);
          walk(br.body, sb);
          if (!br.ends) ends.push(sb); // 끝내는 IF 갈래는 블록 뒤로 이어지지 않는다(implicit-join spec §6)
        }
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
