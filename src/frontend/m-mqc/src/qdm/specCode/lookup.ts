/**
 * 규격약호 간편조회 — 입력 한 벌(규격코드·강종코드)로 두 룰을 함께 판정한다(프로토타입 spec-code 「간편조회」).
 *   규격코드 → 두께관리기준(QD_SPEC_THK_STD), 규격코드 + 강종코드 → 원판강종코드(QD_SPEC_BASE_GRADE).
 * 룰마다 자기 조건 변수만 싣는다(키트 judgeFields·buildJudgeInput). 판정은 서버가 한다. React 에 기대지 않는다.
 */
import {
  buildJudgeInput,
  CATALOG,
  hitRows,
  judgeFields,
  rowKeyOf,
  type Catalog,
  type JudgeField,
  type JudgeResult,
  type RuleDisplay,
  type RuleView,
} from "@/common/rule";

export const THK_STD_RULE = "QD_SPEC_THK_STD";
export const BASE_GRADE_RULE = "QD_SPEC_BASE_GRADE";
export const LOOKUP_RULES = [THK_STD_RULE, BASE_GRADE_RULE] as const;

/** 조회 입력 칸 — 두 룰 조건 변수의 합집합(처음 나온 순서, 라벨은 처음 룰의 것). */
export function lookupFields(
  ruleIds: readonly string[],
  rules: readonly RuleView[],
  catalog: Catalog = CATALOG,
): JudgeField[] {
  const out: JudgeField[] = [];
  for (const ruleId of ruleIds) {
    const rule = rules.find((r) => r.ruleId === ruleId);
    for (const f of judgeFields(rule, ruleId, catalog)) {
      const prev = out.find((x) => x.name === f.name);
      if (prev) prev.numeric ||= f.numeric;
      else out.push({ ...f });
    }
  }
  return out;
}

/** 룰 하나에 보낼 입력 — 그 룰의 조건 변수만. */
export function lookupInput(
  rule: RuleView | undefined,
  ruleId: string,
  values: Readonly<Record<string, string>>,
  catalog: Catalog = CATALOG,
): Record<string, string> {
  return buildJudgeInput(judgeFields(rule, ruleId, catalog), values);
}

export interface LookupItem {
  ruleId: string;
  input: Record<string, string>;
  result: JudgeResult;
  /** 적용 행 룰 ID(TK-·MP-). 없으면 null. */
  ruleKey: string | null;
  /** 적용 행 조건 문장. 없으면 null. */
  condition: string | null;
}

export type JudgeFn = (
  ruleId: string,
  input: Record<string, string>,
  evalTs?: string,
) => Promise<JudgeResult>;

/** 두 룰을 함께 판정한다(동시에 부른다). 한 호출이라도 실패하면 그 오류를 던진다. */
export async function runLookup(
  ruleIds: readonly string[],
  rules: readonly RuleView[],
  values: Readonly<Record<string, string>>,
  judge: JudgeFn,
  evalTs?: string,
  display?: RuleDisplay,
  catalog: Catalog = CATALOG,
): Promise<LookupItem[]> {
  return Promise.all(
    ruleIds.map(async (ruleId) => {
      const rule = rules.find((r) => r.ruleId === ruleId);
      const input = lookupInput(rule, ruleId, values, catalog);
      const result = await judge(ruleId, input, evalTs);
      const hit = hitRows(result, rule, catalog, display)[0];
      return {
        ruleId,
        input,
        result,
        ruleKey:
          result.status === "MATCHED"
            ? rowKeyOf(display, result.results)
            : null,
        condition: hit ? hit.condition : null,
      };
    }),
  );
}
