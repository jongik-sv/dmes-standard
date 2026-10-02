/**
 * 콘텐츠 유형 4종(markdown·html·web·links) 스타일 — 포털이 원격 모듈의 CSS 파일을 싣지 않으므로 TS 문자열로 두고
 * 렌더러·편집기가 <style href precedence> 로 넣는다(React 가 같은 href 를 한 번만 넣는다. home-styles.ts 와 같은 방식).
 * 색·간격은 공통 토큰만 쓴다.
 */
export const CONTENT_STYLE_HREF = "mcm-widget-content";

export const CONTENT_CSS = `
.mcm-wt-state { box-sizing: border-box; height: 100%; display: flex; align-items: center; justify-content: center; padding: var(--spacing-lg); text-align: center; font-size: var(--font-size-sm); color: var(--color-text-muted); }
.mcm-wt-state--error { color: var(--color-danger); }

.mcm-wt-frame { display: block; box-sizing: border-box; width: 100%; height: 100%; border: 0; background: var(--color-bg); }

.mcm-wt-web { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.mcm-wt-web .mcm-wt-frame { flex: 1 1 0; height: auto; min-height: 0; }
.mcm-wt-web__hint { flex: 0 0 auto; padding: 2px var(--spacing-md); border-top: 1px solid var(--color-border-light); font-size: var(--font-size-xs); color: var(--color-text-muted); }

.mcm-wt-links { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--spacing-xs); }
.mcm-wt-links__btn { width: 100%; }
.mcm-wt-links__icon { margin-left: 6px; color: var(--color-text-muted); vertical-align: -2px; }

.mcm-wt-editor { display: flex; flex-direction: column; gap: var(--spacing-sm); min-width: 0; }
.mcm-wt-editor .mcm-wt-code { font-family: var(--font-family-mono); }
.mcm-wt-editor__warn { padding: var(--spacing-xs) var(--spacing-sm); border: 1px solid var(--color-warning); border-radius: var(--radius-sm); background: var(--color-warning-soft); font-size: var(--font-size-sm); color: var(--color-text); }
.mcm-wt-editor__note { font-size: var(--font-size-xs); color: var(--color-text-muted); }

.mcm-wt-litems { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--spacing-sm); }
.mcm-wt-litem { display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: var(--spacing-xs) var(--spacing-sm); align-items: center; padding: var(--spacing-sm); border: 1px solid var(--color-border-light); border-radius: var(--radius-sm); }
.mcm-wt-litem__no { font-size: var(--font-size-sm); color: var(--color-text-muted); text-align: right; font-variant-numeric: tabular-nums; }
.mcm-wt-litem__row { display: flex; align-items: center; gap: var(--spacing-xs); min-width: 0; }
.mcm-wt-litem__row > .mcm-wt-litem__grow { flex: 1 1 auto; min-width: 0; }
.mcm-wt-litem__kind { flex: 0 0 96px; }
.mcm-wt-litem__target { grid-column: 2; min-width: 0; }
`;

export function ContentStyle() {
  return (
    <style href={CONTENT_STYLE_HREF} precedence="default">
      {CONTENT_CSS}
    </style>
  );
}
