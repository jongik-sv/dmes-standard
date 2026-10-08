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
  /** 개인화가 꺼진 그리드의 칸 되돌리기 — 저장값이 없으니 확인 없이 지금 화면만 열 정의의 순서·너비·숨김으로 되돌린다. */
  resetColumns: "컬럼 원래대로",
  /** 칸별 입력 줄을 켜고 끄는 항목 — GridPanel 안의 설정 메뉴가 있는 그리드는 늘 있다(`filter={false}` 만 없다). 빠른 검색 칸은 이 항목과 무관하게 기본으로 보인다. */
  filterRow: "칸별 필터 보기",
  /** 서버 페이징 GridPanel 의 항목 — 빠른 검색 칸이 기본으로 없어서 켜면 검색 칸과 칸별 입력 줄이 함께 나타난다. */
  filterRowPaged: "필터 창 보기",
  /** GridPanel 머리줄 빠른 검색 칸의 안내 글·aria-label. */
  quickFilter: "그리드에서 찾기",
} as const;

/**
 * 빠른 검색 칸의 aria-label — 한 화면에 그리드가 여럿이면 칸이 구별되도록 그리드명(문자열일 때)을 앞에 붙인다. 이름이 없으면 기본 문구 그대로.
 */
export function gridQuickFilterLabel(gridName?: string): string {
  return gridName ? `${gridName} ${GRID_SETTINGS_LABELS.quickFilter}` : GRID_SETTINGS_LABELS.quickFilter;
}

/**
 * 빠른 검색 칸의 안내 글(툴팁 title·보조 설명) — 걸러 보기는 이 그리드가 받아 둔 행 안에서만 찾는다.
 * - 서버 페이징(GridPanel `serverPaged`)이면 지금 쪽에서만 찾는다.
 * - 편집 칸이 있는 그리드는 새로 넣은 행도 조건에 맞지 않으면 숨는다.
 */
export function gridFilterNotice(opts: { paged?: boolean; editable?: boolean }): string {
  const base = opts.paged ? "지금 쪽에서만 찾습니다." : "받아 둔 행 안에서만 찾습니다.";
  return opts.editable ? `${base} 새로 넣은 행도 조건에 맞지 않으면 숨습니다.` : base;
}
