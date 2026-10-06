export * from "./types";
export {
  bringDockWindowToFront,
  clampDockWindow,
  closeDockWindow,
  DOCK_CELL_PX,
  DOCK_ICON_SIZE,
  DOCK_MAX_WINDOWS,
  DOCK_MIN_SIZE,
  DOCK_WINDOW_ID_PATTERN,
  dockItemSize,
  dockStackOrder,
  isDockableEntry,
  isDockMenuEntry,
  listDockableEntries,
  moveDockWindow,
  openDockWindow,
  placeDockWindow,
  dockWindowSlotId,
  resizeDockWindow,
  sanitizeDockWindows,
  stableDockWindowId,
  toggleDockCollapse,
  windowSizeFor,
} from "./dock-model";
export type { OpenDockResult } from "./dock-model";
export {
  createBrowserDockStore,
  DOCK_STORAGE_PREFIX,
  dockStorageKey,
  parseDockWindows,
} from "./browser-dock-store";
export { DOCK_SAVE_DELAY_MS, useDockableEntries, useWidgetDock } from "./use-widget-dock";
export type { UseWidgetDockOptions, WidgetDockApi } from "./use-widget-dock";
export { readDockViewport, useDockViewport } from "./use-dock-viewport";
export { FLOATING_DRAG_THRESHOLD, FloatingWindow } from "./FloatingWindow";
export type { FloatingWindowProps } from "./FloatingWindow";
export { WidgetDockLayer } from "./WidgetDockLayer";
export type { WidgetDockLayerProps } from "./WidgetDockLayer";
export { DockToolsMenu } from "./DockToolsMenu";
export type { DockToolsMenuProps } from "./DockToolsMenu";
export {
  FLOATING_WINDOW_CSS,
  FloatingWindowStyle,
  WIDGET_DOCK_CSS,
  WIDGET_DOCK_Z_INDEX,
  WidgetDockStyle,
} from "./styles";
