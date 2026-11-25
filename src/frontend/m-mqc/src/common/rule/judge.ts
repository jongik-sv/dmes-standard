/**
 * 간편판정 순수 로직 — 입력 칸 만들기(judgeFields), 숫자 칸 검사(checkJudgeInput), 서버 입력 만들기(buildJudgeInput),
 * 결과 풀이(적중 행·탈락 근거). React 에 기대지 않는다.
 */
import {
  CATALOG,
  orderedVarNames,
  serverVar,
  varLabel,
  varUnit,
  type Catalog,
} from "./meta";
import {
  displayResultText,
  formatResult,
  rowKeyOf,
  tileResultNames,
  type RuleDisplay,
} from "./display";
import { cellOf, conditionSentence, NA_TEXT, rowResultText } from "./text";
import type { JudgeResult, RuleView } from "./types";

/** 판정 입력 칸 하나 — 룰 조건 변수 하나. */
export interface JudgeField {
  /** Maru 변수명(서버 입력 키). */
  name: string;
  label: string;
  unit?: string;
  /** 숫자 변수(서버 dataType NUMBER)인가. 서버 정의가 없으면 false(글로 보낸다). */
  numeric: boolean;
}

/** 룰의 판정 입력 칸 — 조건 변수 순서(catalog 순서 우선). 서버 정의가 없으면 catalog 조건 목록. */
export function judgeFields(
  rule: RuleView | undefined,
  ruleId: string,
  catalog: Catalog = CATALOG,
): JudgeField[] {
  return orderedVarNames(rule, ruleId, "COND", catalog).map((name) => ({
    name,
    label: varLabel(ruleId, name, catalog),
    unit: varUnit(ruleId, name, catalog),
    numeric: serverVar(rule, name)?.dataType === "NUMBER",
  }));
}

/** 서버가 받는 10진수 꼴(`new BigDecimal(raw.trim())`) — 부호·소수점·지수. 0x·Infinity·쉼표는 숫자가 아니다. */
export const DECIMAL = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;

/**
 * 숫자 칸 검사 — 값이 있는데 숫자가 아니면 칸별 문장. 빈 칸은 검사하지 않는다(그 조건을 보지 않는 행만 맞는다).
 * 문제가 없으면 빈 객체.
 */
export function checkJudgeInput(
  fields: readonly JudgeField[],
  values: Readonly<Record<string, string>>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of fields) {
    if (!f.numeric) continue;
    const raw = (values[f.name] ?? "").trim();
    if (raw !== "" && !DECIMAL.test(raw))
      errors[f.name] = `${f.label} 값이 숫자가 아닙니다: ${values[f.name]}`;
  }
  return errors;
}

/**
 * 서버 입력(변수명 → 값). 그 룰의 칸만 싣는다. 숫자 칸은 앞뒤 공백을 떼고 비면 뺀다. 글 칸은 가공하지 않고(빈 글도) 보낸다 —
 * 판정은 입력값을 대문자로 바꾸거나 공백을 지우지 않는다(As-Is 와 같다).
 */
export function buildJudgeInput(
  fields: readonly JudgeField[],
  values: Readonly<Record<string, string>>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    const raw = values[f.name] ?? "";
    if (f.numeric) {
      if (raw.trim() !== "") out[f.name] = raw.trim();
    } else {
      out[f.name] = raw;
    }
  }
  return out;
}

/** 적중 행 한 줄 — 순번·행 ID·조건 문장·결과 문장. */
export interface HitRowView {
  rowId: number;
  seq: number;
  condition: string;
  result: string;
  isDefault: boolean;
  /** 행 키(display.keyVar 의 값). 표시 설정이 없거나 비면 「—」. */
  ruleKey: string;
}

/** 적중 행(COLLECT 면 모두). 룰 정의에 없는 행이면 문장 칸은 「—」. display 를 주면 결과 문장에 표시 설정을 쓴다. */
export function hitRows(
  result: JudgeResult | null,
  rule: RuleView | undefined,
  catalog: Catalog = CATALOG,
  display?: RuleDisplay,
): HitRowView[] {
  if (!result) return [];
  return result.hits.map((h) => {
    const row = rule?.rows.find((r) => r.rowId === h.rowId);
    if (!rule || !row)
      return {
        rowId: h.rowId,
        seq: h.seq,
        condition: NA_TEXT,
        result: NA_TEXT,
        isDefault: false,
        ruleKey: NA_TEXT,
      };
    const conds = orderedVarNames(rule, rule.ruleId, "COND", catalog)
      .map((n) =>
        conditionSentence(
          cellOf(rule.vars, row, n)?.summary,
          varLabel(rule.ruleId, n, catalog),
        ),
      )
      .filter((s): s is string => !!s);
    return {
      rowId: h.rowId,
      seq: h.seq,
      condition:
        conds.length > 0
          ? conds.join(" · ")
          : row.rowKind === "DEFAULT"
            ? "기본 행"
            : "조건 없음",
      result: display
        ? displayResultText(rule, row, display, catalog)
        : rowResultText(rule, row, catalog),
      isDefault: row.rowKind === "DEFAULT",
      ruleKey: rowKeyOf(display, row.results) ?? NA_TEXT,
    };
  });
}

/** 탈락 근거 한 줄 — 평가했지만 적중하지 않은 행과 처음 거짓이 된 조건. */
export interface FailedRowView {
  rowId: number;
  seq: number;
  /** 처음 거짓인 조건의 라벨(모르면 변수명, 없으면 「—」). */
  varLabel: string;
  /** 그 행의 그 조건 문장. */
  condition: string;
  /** 넣은 값(없으면 「(빈 값)」). */
  input: string;
}

/** 앞선 행의 탈락 근거 — trace 의 evaluated && !hit. input 은 판정에 보낸 값. */
export function failedRows(
  result: JudgeResult | null,
  rule: RuleView | undefined,
  input: Readonly<Record<string, string>>,
  catalog: Catalog = CATALOG,
): FailedRowView[] {
  if (!result) return [];
  const ruleId = result.ruleId;
  return result.trace
    .filter((t) => t.evaluated && !t.hit)
    .map((t) => {
      const name = t.firstFalseVar;
      const row = rule?.rows.find((r) => r.rowId === t.rowId);
      const label = name ? varLabel(ruleId, name, catalog) : NA_TEXT;
      const cell =
        name && rule && row ? cellOf(rule.vars, row, name) : undefined;
      const value = name ? input[name] : undefined;
      return {
        rowId: t.rowId,
        seq: t.seq,
        varLabel: label,
        condition: (name && conditionSentence(cell?.summary, label)) || NA_TEXT,
        input: name
          ? value === undefined || value === ""
            ? "(빈 값)"
            : value
          : NA_TEXT,
      };
    });
}

/**
 * 결과 값 목록 — 결과 변수 순서(서버 정의·catalog), 판정 결과에만 있는 키는 뒤에.
 * display 를 주면 타일로 보일 변수만(업무 결과 우선, 숨김·룰 ID·앞 열 제외) 형식을 입혀 낸다.
 */
export function resultEntries(
  result: JudgeResult | null,
  rule: RuleView | undefined,
  catalog: Catalog = CATALOG,
  display?: RuleDisplay,
): { name: string; label: string; unit?: string; value: string }[] {
  if (!result) return [];
  const ruleId = result.ruleId;
  const all = orderedVarNames(rule, ruleId, "RESULT", catalog);
  for (const k of Object.keys(result.results))
    if (!all.includes(k)) all.push(k);
  const names = display ? tileResultNames(all, display) : all;
  return names.map((name) => {
    const v = result.results[name];
    return {
      name,
      label: varLabel(ruleId, name, catalog),
      unit: varUnit(ruleId, name, catalog),
      value: display
        ? formatResult(display, name, v, result.results)
        : v === null || v === undefined || String(v) === ""
          ? NA_TEXT
          : String(v),
    };
  });
}
