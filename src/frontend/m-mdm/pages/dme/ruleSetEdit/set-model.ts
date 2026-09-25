/**
 * 룰 세트 화면 즉시 계산 — 입출력 표·의존 룰·저장 시 검사(TSK-08-06 design §6.2·§6.3, I9·I10·I11·I21). React 의존 없는 순수 함수다.
 * 서버 `RuleSetAnalyzer`(mdm/lib `common/rule`)와 같은 알고리즘·같은 문구이고, 한 벌 코퍼스 `rule-set-corpus.json` 이 두 구현의 동치를 고정한다.
 * 알고리즘을 바꾸면 Java 쪽과 코퍼스를 함께 바꾼다. 화면 결과는 안내일 뿐이고 저장·되살리기 거부는 서버가 다시 계산해 판정한다(D9).
 *
 * `rules` 에 없거나 `exists=false` 인 룰, `conds`·`results` 가 null 인 룰은 조건·결과가 빈 것으로 본다. 이름 비교는 대소문자를 구분한다.
 * 비어 있는 칸은 undefined 가 아니라 null 로 낸다(서버 JSON 과 같게).
 */
import type { InputRow, IoName, IoSource, ResultRow, RuleIo, RuleIoMap, RuleSetCheck, SetIo } from "./types";

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
): RuleSetCheck => ({ code, severity, ruleId, otherRuleId, varName, message });

/** §6.3 — 1단계(존재·상태) → EMPTY → 2단계(순서·순환·출처, 중복 대입). 문구는 서버와 같다. */
export function setChecks(ids: readonly string[], rules: RuleIoMap): RuleSetCheck[] {
  const out: RuleSetCheck[] = [];
  for (const id of ids) {
    const r = ruleOf(rules, id);
    if (!r || !r.exists) {
      out.push(check("RULE_NOT_FOUND", "REJECT", id, null, null, `${id}는 없는 룰이다`));
    } else if (r.status === "DEPRECATED") {
      out.push(check("RULE_DEPRECATED", "REJECT", id, null, null, `${id}는 DEPRECATED다`));
    } else if (r.releasedVer == null) {
      out.push(check("NO_RELEASED", "WARN", id, null, null, `${id}는 RELEASED 버전이 없어 입출력을 계산하지 않았다. 이대로 부르면 판정 오류다`));
    }
  }
  if (ids.length === 0) out.push(check("EMPTY", "REJECT", null, null, null, "룰이 하나도 없다"));

  const d = setDeps(ids, rules);
  const produced = new Set<string>();
  const prodBy = new Map<string, string>();
  ids.forEach((id, i) => {
    for (const c of conds(rules, id)) {
      if (c.source === DICT || produced.has(c.name)) continue;
      const later: string[] = [];
      for (let k = i + 1; k < ids.length; k++) {
        const j = ids[k];
        if (j !== id && produces(rules, j, c.name)) later.push(j);
      }
      if (later.length) {
        const cyc = later.find((j) => reaches(j, id, d) || overlaps(results(rules, id), conds(rules, j))) ?? null;
        if (cyc != null) {
          out.push(check("CYCLE", "REJECT", id, cyc, c.name, `${id}와 ${cyc}가 서로의 결과 변수를 읽는다(순환). 순서를 바꿔서는 풀리지 않는다`));
        } else {
          out.push(
            check(
              "ORDER",
              "REJECT",
              id,
              later[0],
              c.name,
              `${id}가 뒤에 도는 ${later.join(", ")}의 결과 변수 ${c.name}를 읽는다. ${later[0]}를 ${id} 앞으로 옮긴다`,
            ),
          );
        }
        continue;
      }
      if (c.source !== PROG) {
        out.push(check("UNKNOWN_INPUT", "REJECT", id, null, c.name, `${id}의 조건 변수 ${c.name}는 컬럼 사전에 없고 세트 안의 어느 룰도 만들지 않는다`));
      }
    }
    for (const x of results(rules, id)) {
      const prev = prodBy.get(x.name);
      if (prev != null) out.push(check("DUP_RESULT", "WARN", id, prev, x.name, `${prev}와 ${id}가 같은 결과 변수 ${x.name}에 대입한다`));
      prodBy.set(x.name, id);
      produced.add(x.name);
    }
  });
  return out;
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
