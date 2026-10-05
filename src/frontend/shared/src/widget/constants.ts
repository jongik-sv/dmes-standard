/** 위젯 격자 규격·한도(스펙 §3.2·§3.5). */
export const WIDGET_COLS = 24;
export const WIDGET_ROW_HEIGHT = 20;
export const WIDGET_MARGIN = 8;
export const WIDGET_WIDE_MIN_WIDTH = 960;
export const WIDGET_MEDIUM_MIN_WIDTH = 768;
export const WIDGET_DEFAULT_MIN_SIZE = { w: 4, h: 6 } as const;
export const WIDGET_RESIZE_HANDLES = ["n", "e", "s", "w", "ne", "se", "sw", "nw"] as const;

export const HOME_TAB_ID = "home";
export const HOME_TAB_NAME = "홈";
export const MAX_TABS = 10;
export const MAX_WIDGETS_PER_TAB = 30;
export const TAB_NAME_MAX = 20;
export const MIN_REFRESH_SEC = 30;

/* 기본 탭·공유·내보내기(widget-tabs 2026-10-05, 설계 design-widget-tabs §3·§4). */
/** 관리자 기본 탭 한도(배치 키당). 관리자 화면 탭 수는 홈 + 이 값. */
export const MAX_DEFAULT_TABS = 5;
/** 한 번에 공유할 수 있는 받는 사람 수. */
export const MAX_SHARE_USERS = 10;
/** 공유 받는 사람 검색어 최소 글자 수(서버 searchUsers 와 같다). */
export const SHARE_KEYWORD_MIN = 2;
/** 탭 내보내기 파일의 version·kind. 가져올 때 둘 다 같아야 한다. */
export const TAB_EXPORT_VERSION = 1;
export const TAB_EXPORT_KIND = "dmes-widget-tab";
