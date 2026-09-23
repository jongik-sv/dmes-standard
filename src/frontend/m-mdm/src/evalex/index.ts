/**
 * `@dk-oasis/m-mdm/evalex` — 화면 EvalEx 평가기·겹침 빈틈 분석·입력 계약(TSK-03-04).
 *
 * 루트 배럴(`src/index.ts`)은 타입 전용으로 두고 이 모듈은 서브패스로만 공개한다(decimal.js 를 루트 번들에 끌어들이지 않는다, D7).
 * 화면 결과는 즉시 피드백용이고 서버가 기준이다(EG 8.5). 재현할 수 없는 자리는 `fallback` 으로 서버 미리보기를 부른다.
 */
export { D, NUMBER_TEXT } from "./decimal";
export type { EvalValue, EvalOutcome } from "./values";
export { fromTypedValue, toTypedValue, convertForType } from "./values";
export { EvalexError, FallbackSignal } from "./errors";
export { compile, evaluate, validate, prepare, isSupported, usedVariables, checkRecordKeys } from "./interpreter";
export type { EvaluateOptions, CodeSetIndex } from "./interpreter";
export { evaluateCell } from "./cell-compare";
export type { CellVariable, CellOutcome } from "./cell-compare";
export type { RuleDef, RuleVarDef, RuleRowDef, HitPolicy, DispType } from "./rule-model";
export { nullSafety } from "./null-safety";
export { computeInputContract } from "./input-contract";
export { analyzeRule } from "./rule-analysis";
export type { RuleIssue, RuleIssueCode } from "./rule-analysis";
export { previewRule } from "./rule-preview";
export type { RulePreview, RowPreview } from "./rule-preview";
