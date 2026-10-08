/**
 * 스스로 머리줄을 그리는 AgDataGrid(GridPanel 밖)가 표 위에 더하는 머리줄의 높이(px) — `.page-layout`·모달 기준 머리줄 높이 32px + 바깥 상자 테두리 위·아래 1px씩 2px.
 * 값은 `grid.css` 의 `.grid-panel-header`(`.page-layout`·`.cm-modal-body` 는 32px 고정) 와 `.cm-grid-with-header` 테두리를 합친 것이라 그쪽을 바꾸면 이 값도 맞춘다.
 *
 * 쓰는 곳: 부모가 높이를 이미 정해 둔 고정 높이 래퍼 안에 숫자 `height` 그리드를 넣어 넘치지 않게 맞출 때.
 *   `height={420 - GRID_HEADER_HEIGHT}` — 래퍼 420px 안에 머리줄 + 표가 들어간다. 걸린 조건 칩 줄(조건이 걸린 동안만 생기는 약 28px)은 포함하지 않는다.
 * 숫자 `height` 는 표 높이이고 머리줄은 그 위에 더해진다(GridPanel 안 그리드와 같은 뜻). `height` 생략·"100%" 는 부모를 채우므로 이 값이 필요 없다.
 */
export const GRID_HEADER_HEIGHT = 34;
