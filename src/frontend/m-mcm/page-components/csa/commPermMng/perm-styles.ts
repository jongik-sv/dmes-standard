/**
 * commPermMng 화면 전용 스타일 — 페이지 루트에서 React 19 `<style href precedence>` 로 한 번만 넣는다.
 * m-* 로컬 `.css` import 는 포털이 싣지 않으므로 쓰지 않는다(Local-Rules §17, noticeMgmt 와 같은 방식). 색은 의미 토큰만 쓴다.
 * 칩 모양은 shared ToggleChipGroup 이 넣는다. 여기에는 칩 바깥 배치(.cpm-chipline)와 칩 글자(.cpm-hit)만 둔다.
 */
export const PERM_MNG_STYLE_HREF = "mcm-comm-perm-mng";

export const PERM_MNG_CSS = `
.cpm-chipline { display: inline-block; width: max-content; vertical-align: middle; }
.cpm-hit { font-weight: 700; text-decoration: underline; }
.cpm-warn { font-size: var(--font-size-xs); color: var(--color-warning); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cpm-sr { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.cpm-none { font-size: var(--font-size-xs); color: var(--color-text-muted); }
.cpm-cell2 { display: flex; flex-direction: column; justify-content: center; height: 100%; line-height: 1.25; min-width: 0; }
.cpm-cell2 > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cpm-sub { font-size: var(--font-size-xs); color: var(--color-text-muted); }
.cpm-mono { font-family: var(--font-family-mono); }
.cm-data-grid .cpm-row-empty .ag-cell { color: var(--color-text-muted); }
.cpm-inline { display: flex; flex-wrap: wrap; align-items: center; gap: 4px var(--spacing-sm); }
.cpm-stack { display: flex; flex-direction: column; gap: 6px; }
.cpm-stack > .cpm-warn { white-space: normal; }
.cpm-hint { font-size: var(--font-size-xs); color: var(--color-text-muted); line-height: 1.4; }
.cpm-empty { padding: var(--spacing-md) 10px; font-size: var(--font-size-sm); color: var(--color-text-muted); }
`;
