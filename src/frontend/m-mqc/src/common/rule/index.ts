/**
 * 룰 기준 화면 공용 키트 — import { RuleStandardScreen, useRules, judgeRule, ... } from "@/common/rule".
 * 서비스: qcdRule(search·judge·history·codes). 라벨: catalog.ts(없으면 Maru 변수명).
 */
export * from "./types";
export {
  QCD_RULE_SERVICE,
  MAX_IDS_PER_CALL,
  searchRules,
  judgeRule,
  ruleHistory,
  searchCodes,
  toRuleDef,
  unreachableRowIds,
} from "./api";
export {
  CATALOG,
  HIT_POLICY_LABEL,
  codeTitle,
  groupOfRule,
  groupsForRules,
  hitPolicyOf,
  orderedVarNames,
  ruleMetaOf,
  ruleOptions,
  ruleTitle,
  screenCodeIds,
  screenGroups,
  serverVar,
  varLabel,
  varMetaOf,
  varUnit,
  type Catalog,
  type RuleGroup,
} from "./meta";
export {
  NA_TEXT,
  cellOf,
  cellText,
  conditionSentence,
  isNaSummary,
  isNumberVar,
  rowConditionText,
  rowResultText,
  valueWithUnit,
} from "./text";
export {
  columnSpecs,
  filterRows,
  flattenRules,
  groupCounts,
  type ColumnSpec,
  type ListFilter,
  type ListRow,
} from "./list";
export {
  cleanResults,
  displayResultText,
  formatResult,
  formatResultWithUnit,
  isBlankValue,
  isPrimaryVar,
  leadText,
  leadVarNames,
  numberOrNull,
  rowBadges,
  rowKeyOf,
  signedNumber,
  tidyNumber,
  tileResultNames,
  visibleResultNames,
  type DisplayResults,
  type JudgeTile,
  type JudgeTileArgs,
  type RuleBadge,
  type RuleDisplay,
} from "./display";
export {
  ROW_DIFF_LABEL,
  diffSummary,
  diffVersions,
  versionRowText,
  type RowDiff,
  type RowDiffKind,
} from "./diff";
export {
  DECIMAL,
  buildJudgeInput,
  checkJudgeInput,
  failedRows,
  hitRows,
  judgeFields,
  resultEntries,
  type FailedRowView,
  type HitRowView,
  type JudgeField,
} from "./judge";
export {
  useCodes,
  useRuleHistory,
  useRules,
  type LoadOptions,
  type UseCodesResult,
  type UseRuleHistoryResult,
  type UseRulesResult,
} from "./hooks";
export {
  RULE_EDIT_PAGE_ID,
  RULE_EDIT_TARGET_EVENT,
  RULE_EDIT_TARGET_KEY,
  openRuleEdit,
} from "./open-rule-edit";
export { RulePicker, type RulePickerProps } from "./RulePicker";
export {
  RuleStandardScreen,
  evalTsOf,
  tabItems,
  type RuleExtraTab,
  type RuleScreenContext,
  type RuleStandardScreenProps,
  type RuleTabKey,
} from "./RuleStandardScreen";
