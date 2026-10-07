export { PageLayout, type PageLayoutProps, type PageButton } from "./PageLayout";
// 팝업 컴포넌트 내부 실행 버튼은 PageLayout 을 거치지 않으므로, 자기 objId 로 직접 판정하도록 재노출.
export {
  canDoButton,
  useUserButtonRbac,
  type ButtonRbacState,
} from "../portal-shell/use-user-button-rbac";
export { SearchArea, type SearchAreaProps } from "./SearchArea";
export { SearchField, type SearchFieldProps, type SearchFieldOption } from "./SearchField";
export { SearchHistoryInput, type SearchHistoryInputProps } from "./SearchHistoryInput";
export {
  isSearchHistoryPage,
  clearAllSearchHistory,
  clearSearchHistory,
  readSearchHistory,
} from "./search-history-store";
export { emitSearch, subscribeSearch, emitSearchReset, subscribeSearchReset } from "./search-history-bus";
// 조회 칸 사용자 기본값(설계 2026-10-07-search-defaults).
export {
  RANGE_PRESETS,
  RELATIVE_DATE_PRESETS,
  isValidIsoDate,
  parseSearchDefaultRule,
  resolveRelativeDate,
  resolveSearchDefault,
  type RelativeDateBase,
  type SearchDefaultRule,
  type SearchDefaultRuleKind,
  type SearchValueType,
} from "./search-defaults/rule";
export {
  getPageSearchDefaults,
  getSearchDefaultsSource,
  getSearchDefaultsStatus,
  preloadSearchDefaults,
  resetSearchDefaults,
  saveSearchDefaults,
  setSearchDefaultsLocalForDev,
  subscribeSearchDefaults,
  type PageRules,
  type SearchDefaultSaveRow,
} from "./search-defaults/store";
export { readSearchLastValues } from "./search-defaults/last-values";
export {
  useSearchDefaultsArea,
  type SearchDefaultsAreaApi,
  type SearchDefaultsFieldInfo,
} from "./search-defaults/area";
export { ContentBody, LayoutContextBoundary, useContentMaximize, type ContentBodyProps } from "./ContentBody";
export { ContentPanel, type ContentPanelProps } from "./ContentPanel";
export { ResizableFormPanel, type ResizableFormPanelProps } from "./ResizableFormPanel";
export { MaxHandle, type MaxHandleProps } from "./MaxHandle";
export { ErrorModal, type ErrorModalProps } from "./ErrorModal";
export {
  DETAIL_TABLE_STYLE,
  DETAIL_LABEL_CELL,
  DETAIL_VALUE_CELL,
  INPUT_BASE,
  INPUT_READONLY,
  INPUT_DISABLED,
} from "./DetailFormStyles";
