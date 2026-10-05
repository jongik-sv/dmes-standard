/**
 * 정시 수집 위젯 전용 스타일 — 로컬 .css 대신 TS 문자열을 `<style href precedence>` 로 넣는다(Local-Rules §17). 색·간격은 의미 토큰만 쓴다.
 * 입력 칸·표·버튼 모습은 shared 가 정한다. 편집기는 _query/parts 의 .wq-* 규칙도 함께 쓴다(QueryStyle).
 */
export const COLLECT_STYLE_HREF = "mcm-widget-collect";

export const COLLECT_CSS = `
.wc { display: flex; flex-direction: column; gap: var(--spacing-sm); min-width: 0; }
.wc__fail { margin: 0; padding: 3px var(--spacing-sm); border: 1px solid var(--color-danger); border-radius: var(--radius-sm); font-size: var(--font-size-sm); color: var(--color-danger); }
.wc__pick { display: block; width: 100%; padding: 0; border: 1px solid transparent; border-radius: var(--radius-md); background: none; text-align: left; font: inherit; color: inherit; cursor: pointer; }
.wc__pick[aria-pressed="true"] { border-color: var(--color-primary); }
.wc__pick:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 1px; }
.wc__chart { min-width: 0; }
.wc__chart-title { margin: 0; font-size: var(--font-size-xs); color: var(--color-text-muted); }
.wc__note { margin: 0; font-size: var(--font-size-xs); color: var(--color-text-muted); }
.wc-delta--up { color: var(--color-danger); }
.wc-delta--down { color: var(--color-primary); }
.wc-delta--flat { color: var(--color-text-muted); }
.wc-edit { display: flex; flex-direction: column; gap: var(--spacing-sm); min-width: 0; }
.wc-edit__row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--spacing-sm); }
.wc-edit__row > label { font-size: var(--font-size-sm); color: var(--color-text-secondary); }
.wc-edit__field { width: 160px; max-width: 100%; }
.wc-edit__wide { width: 100%; }
.wc-edit__checks { display: flex; flex-wrap: wrap; gap: var(--spacing-sm) var(--spacing-lg); }
`;
