/** 위젯 격자 규격·한도(스펙 §3.2·§3.5). */
export const WIDGET_COLS = 24;
export const WIDGET_ROW_HEIGHT = 20;
export const WIDGET_MARGIN = 8;
export const WIDGET_WIDE_MIN_WIDTH = 1200;
export const WIDGET_MEDIUM_MIN_WIDTH = 768;
export const WIDGET_DEFAULT_MIN_SIZE = { w: 4, h: 6 } as const;
export const WIDGET_RESIZE_HANDLES = ["n", "e", "s", "w", "ne", "se", "sw", "nw"] as const;

export const HOME_TAB_ID = "home";
export const HOME_TAB_NAME = "홈";
export const MAX_TABS = 10;
export const MAX_WIDGETS_PER_TAB = 30;
export const TAB_NAME_MAX = 20;
export const MIN_REFRESH_SEC = 30;
