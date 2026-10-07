export * from "./types";
export * from "./constants";
export {
  addItem,
  canAddWidget,
  colsForWidth,
  homeTab,
  itemsEqual,
  maxSizeOf,
  minSizeOf,
  moveByKey,
  newInstanceId,
  nextTabId,
  reflowLayout,
  removeItem,
  sanitizeLayout,
  tabsEqual,
  toggleLock,
  validateTabName,
  validateWidgetMeta,
} from "./widget-layout";
export {
  applyWidgetOverride,
  defWidgetLoader,
  defWidgetMeta,
  mergeWidgetRegistry,
  toWidgetDefRow,
} from "./widget-registry";
export { normalizeWidgetPlacement, resolveWidgetPlacement } from "./widget-placement";
export type { WidgetPlacementResolved } from "./widget-placement";
export { useWidgetVisible } from "./use-widget-visible";
export { WidgetFrame } from "./WidgetFrame";
export type { WidgetFrameProps } from "./WidgetFrame";
export {
  openPortalPage,
  useWidgetBodySize,
  useWidgetRename,
  useWidgetStatus,
  useWidgetTitle,
  WidgetHeaderActions,
  WidgetTitleExtra,
} from "./frame-context";
export type { WidgetRenameHandler, WidgetStatus } from "./frame-context";
export { WIDGET_CSS, WidgetStyle } from "./styles";
export { WidgetBoard } from "./WidgetBoard";
export type { WidgetBoardProps } from "./WidgetBoard";
export { getDraggingWidget, setDraggingWidget } from "./widget-dnd";
export { WidgetTabs } from "./WidgetTabs";
export type { WidgetTabsProps } from "./WidgetTabs";
export { WidgetPicker } from "./WidgetPicker";
export type { WidgetPickerProps } from "./WidgetPicker";
export { WidgetWorkspace } from "./WidgetWorkspace";
export type { WidgetWorkspaceProps } from "./WidgetWorkspace";
// 기본 탭·공유·탭 파일(widget-tabs 2026-10-05)
export {
  buildTabExport,
  countedTabCount,
  fixedTabCount,
  isFixedTab,
  orderTabs,
  parseTabImport,
  shareResultMessage,
  tabImportMessage,
  uniqueTabName,
} from "./widget-layout";
export type { TabImportContext, TabImportDrop, TabImportResult } from "./widget-layout";
// 미리 배치(widget-tabs 항목 8)
export { firstFreeSpot, placedSizeOf } from "./widget-layout";
export type { WidgetBoardPreview } from "./WidgetBoard";
