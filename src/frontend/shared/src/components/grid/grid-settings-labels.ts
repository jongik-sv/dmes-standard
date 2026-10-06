/**
 * 그리드 설정 항목의 이름 — GridPanel 의 설정 아이콘 메뉴(GridSettingsMenu)와 머리글 우클릭 메뉴(GridHeaderContextMenu)가
 * 같은 글을 쓰도록 한곳에 둔다. 한쪽만 바꿔 이름이 어긋나는 일을 막기 위한 파일이다.
 */
export const GRID_SETTINGS_LABELS = {
  /** 설정 아이콘 버튼의 툴팁·aria-label. */
  menu: "그리드 설정",
  settings: "컬럼 설정…",
  autoSave: "자동 설정 저장",
  excel: "엑셀 출력",
  /** 서버 페이징 그리드(GridPanel 안에 Pagination 이 둘 이상의 쪽을 보일 때)의 엑셀 항목 — 지금 쪽의 행만 나간다. */
  excelPaged: "엑셀 출력 (현재 페이지)",
  reset: "설정 초기화…",
} as const;
