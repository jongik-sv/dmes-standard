/**
 * 조건 셀 요약을 사람이 읽는 글로 바꾼다. 입력은 Maru 엔진 CellSummary 글이다:
 *   범위 `0.22 <= 변수 <= 0.249` · 비교 `= A`, `<> A`, `< 5` · 목록 `IN (A, B)`, `NOT IN (A)` · EQUAL 표시 열은 값만(`A`) · NA `-`.
 * 그리드 칸은 열 머리가 변수를 말하므로 `x` 로, 문장(상세·근거·이력)은 변수 라벨을 넣는다. React 에 기대지 않는 순수 함수다.
 */
import {
  orderedVarNames,
  serverVar,
  varLabel,
  varUnit,
  type Catalog,
  CATALOG,
} from "./meta";
import type { RuleCell, RuleRow, RuleVar, RuleView } from "./types";

/** 보지 않는 조건·빈 값의 표시. */
export const NA_TEXT = "—";

const OPERATOR_START = /^(=|<>|<=|>=|<|>|IN\b|NOT\b|IS\b|CONTAINS\b|INSTR\b)/;

/** 셀 요약이 NA(조건을 보지 않음)인가. 셀이 없어도 NA 다. */
export function isNaSummary(summary: string | null | undefined): boolean {
  const s = (summary ?? "").trim();
  return s === "" || s === "-";
}

/** 비교 기호를 읽기 쉬운 기호로(<= ≤, >= ≥, <> ≠). */
function prettyOps(s: string): string {
  return s.replaceAll("<=", "≤").replaceAll(">=", "≥").replaceAll("<>", "≠");
}

/** 그리드 칸 글 — NA 는 「—」, 범위의 「변수」 는 x, 값만 있는 EQUAL 칸은 그대로. */
export function cellText(summary: string | null | undefined): string {
  if (isNaSummary(summary)) return NA_TEXT;
  return prettyOps(summary!.trim().replaceAll("변수", "x"));
}

/**
 * 조건 문장 — 「두께 0.22 ≤ … 」 대신 「0.22 ≤ 두께 ≤ 0.249」, 「원자재코드 IN (A, B)」, 「품명코드 = L」. NA 면 null.
 */
export function conditionSentence(
  summary: string | null | undefined,
  label: string,
): string | null {
  if (isNaSummary(summary)) return null;
  const s = summary!.trim();
  if (s.includes("변수")) return prettyOps(s.replaceAll("변수", label));
  if (OPERATOR_START.test(s)) return prettyOps(`${label} ${s}`);
  return `${label} = ${s}`;
}

/** 행의 셀 — 변수명으로(서버 cells 는 varId 키). */
export function cellOf(
  vars: readonly RuleVar[],
  row: RuleRow,
  name: string,
): RuleCell | undefined {
  const v = vars.find((x) => x.name === name);
  return v ? row.cells[String(v.varId)] : undefined;
}

/** 행 조건 전체 문장 — 보는 조건만 「 · 」 로 잇는다. 모두 NA 면 「조건 없음」. */
export function rowConditionText(
  rule: Pick<RuleView, "ruleId" | "vars">,
  row: RuleRow,
  catalog: Catalog = CATALOG,
): string {
  const parts: string[] = [];
  for (const name of orderedVarNames(rule, rule.ruleId, "COND", catalog)) {
    const sentence = conditionSentence(
      cellOf(rule.vars, row, name)?.summary,
      varLabel(rule.ruleId, name, catalog),
    );
    if (sentence) parts.push(sentence);
  }
  return parts.length > 0 ? parts.join(" · ") : "조건 없음";
}

/** 결과 값 + 단위(「2 mm」). 값이 없으면 「—」. */
export function valueWithUnit(value: unknown, unit?: string): string {
  if (value === null || value === undefined || String(value).trim() === "")
    return NA_TEXT;
  return unit ? `${String(value)} ${unit}` : String(value);
}

/** 행 결과 문장 — 「폭 수축량 2 mm」 들을 「 · 」 로. */
export function rowResultText(
  rule: Pick<RuleView, "ruleId" | "vars">,
  row: RuleRow,
  catalog: Catalog = CATALOG,
): string {
  const names = orderedVarNames(rule, rule.ruleId, "RESULT", catalog);
  const keys = names.length > 0 ? names : Object.keys(row.results);
  if (keys.length === 0) return NA_TEXT;
  return keys
    .map(
      (n) =>
        `${varLabel(rule.ruleId, n, catalog)} ${valueWithUnit(row.results[n], varUnit(rule.ruleId, n, catalog))}`,
    )
    .join(" · ");
}

/** 변수가 숫자인가 — 서버 dataType. */
export function isNumberVar(rule: RuleView | undefined, name: string): boolean {
  return serverVar(rule, name)?.dataType === "NUMBER";
}
