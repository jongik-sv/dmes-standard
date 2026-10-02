/**
 * 엔진 계약에서 온 상수(TSK-03-04 design §6.2). `tests/evalex-contract-parity.test.ts` 가 Java 소스
 * (`FunctionSets`·`MdmFunction`·`ReservedNames`·`MdmExpressionConfig`)와 대조한다.
 */

/** `FunctionSets.BASE` — 화면 지원 함수 = BASE ∪ {INSTR} + 조건부 MASTER(engine-contract §5, MASTER_AT 은 1차 폴백). */
export const BASE_FUNCTIONS = [
  "IF",
  "SWITCH",
  "COALESCE",
  "NOT",
  "ABS",
  "CEILING",
  "FLOOR",
  "SQRT",
  "ROUND",
  "MIN",
  "MAX",
  "SUM",
  "AVERAGE",
  "STR_LENGTH",
  "STR_UPPER",
  "STR_LOWER",
  "STR_TRIM",
  "STR_LEFT",
  "STR_RIGHT",
  "STR_SUBSTRING",
  "STR_CONTAINS",
  "STR_STARTS_WITH",
  "STR_ENDS_WITH",
  "STR_MATCHES",
] as const;

/** `MdmFunction` 최소·최대 인자 수. */
export const MDM_ARITY = { INSTR: [2, 2], MASTER: [3, 4], MASTER_AT: [4, 5] } as const;

/** `ReservedNames.CONSTANTS` — EvalEx 3.7.0 표준 상수 여덟(대소문자 무시). */
export const RESERVED_CONSTANTS = [
  "NULL",
  "TRUE",
  "FALSE",
  "PI",
  "E",
  "DT_FORMAT_ISO_DATE_TIME",
  "DT_FORMAT_LOCAL_DATE_TIME",
  "DT_FORMAT_LOCAL_DATE",
] as const;
export const EVAL_TS = "EVAL_TS";
export const RESERVED_PREFIX = "_";
export const EXPR_VAR_PREFIX = "_V";

/** EvalEx 3.7.0 표준 상수 값(실측, design §0.2). */
export const PI_TEXT =
  "3.1415926535897932384626433832795028841971693993751058209749445923078164062862089986280348253421170679";
export const E_TEXT = "2.71828182845904523536028747135266249775724709369995957496696762772407663";
export const DT_FORMATS = {
  DT_FORMAT_ISO_DATE_TIME: "yyyy-MM-dd'T'HH:mm:ss[.SSS][XXX]['['VV']']",
  DT_FORMAT_LOCAL_DATE_TIME: "yyyy-MM-dd'T'HH:mm:ss[.SSS]",
  DT_FORMAT_LOCAL_DATE: "yyyy-MM-dd",
} as const;

/** 스키마 `InfixOperator` 16종. */
export const INFIX_OPERATORS = ["+", "-", "*", "/", "%", "^", "=", "==", "!=", "<>", "<", "<=", ">", ">=", "&&", "||"] as const;
/** 스키마 `PrefixOperator`. */
export const PREFIX_OPERATORS = ["-", "+", "!"] as const;
