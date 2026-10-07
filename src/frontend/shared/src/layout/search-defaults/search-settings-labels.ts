/**
 * 조회 기본값 설정 메뉴·창의 글(설계 2026-10-07-search-defaults §8.2) — 메뉴·확인 창·설정 창이 같은 이름을 쓰도록 한곳에 둔다.
 */
export const SEARCH_SETTINGS_LABELS = {
  /** 설정 아이콘의 툴팁·aria-label. */
  menu: "조회 기본값",
  open: "기본값 설정…",
  saveCurrent: "지금 조건을 기본값으로",
  reset: "내 기본값 초기화…",
  dialogTitle: "조회 기본값 설정",
  dialogReset: "이 화면 초기화",
  cancel: "취소",
  save: "저장",
  modes: {
    none: "사용 안 함",
    fixed: "고정 값",
    relative: "상대 날짜",
    last: "마지막 조회값",
    range: "묶음",
    custom: "사용자 지정(그대로 둠)",
  },
  columns: { field: "칸", mode: "방식", value: "값", preview: "오늘 기준" },
  /** 설정 창 머리의 일괄 옵션 — 고정 값·상대 날짜는 칸마다 직접 고른다. */
  bulk: "이 화면 모든 칸:",
} as const;
