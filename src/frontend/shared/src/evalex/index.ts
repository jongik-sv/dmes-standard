/**
 * `@dk-oasis/shared/evalex` — 화면 EvalEx 평가기·겹침 빈틈 분석·입력 계약(TSK-03-04).
 * 2026-10-03 m-mdm(`src/evalex`)에서 shared 로 옮겼다 — 화면 검증(`mdm-meta`)이 표준식을 평가해야 하는데 shared 가 m-mdm 을
 * 가져오면 순환이라서다. `@dk-oasis/m-mdm/evalex` 는 이 모듈을 다시 내보낸다.
 *
 * 루트 배럴(`src/index.ts`)에는 싣지 않고 서브패스로만 공개한다(decimal.js 를 루트 번들에 끌어들이지 않는다, D7. tsup
 * splitting:false 라 루트에 넣으면 같은 모듈이 두 번 묶여 `instanceof`·`NUMBER_TEXT` WeakMap 이 갈라진다).
 * 화면 결과는 즉시 피드백용이고 서버가 기준이다(EG 8.5). 재현할 수 없는 자리는 `fallback` 으로 서버 미리보기를 부른다.
 */
export type * from "./engine-contract.generated";
export { D, NUMBER_TEXT, PLAIN_DECIMAL } from "./decimal";
export type { Dec } from "./decimal";
export { PatternRejected, classify } from "./pattern";
export { FUNCTIONS } from "./functions";
export { BASE_FUNCTIONS, EVAL_TS, EXPR_VAR_PREFIX, MDM_ARITY, RESERVED_CONSTANTS, RESERVED_PREFIX } from "./contract-constants";
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
export { analyzeDeriveOrder, analyzeRule } from "./rule-analysis";
export type { RuleIssue, RuleIssueCode } from "./rule-analysis";
export { previewRule } from "./rule-preview";
export type { RulePreview, RowPreview } from "./rule-preview";
