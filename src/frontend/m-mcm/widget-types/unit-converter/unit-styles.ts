/**
 * 단위 계산기 렌더러·편집기 스타일 — 로컬 .css import 대신 TS 문자열로 두고 루트에서 `<style href precedence>` 로 넣는다(Local-Rules §17).
 * 색·간격·글꼴은 공통 토큰만 쓴다. 높이는 위젯 칸을 채우고(루트 height 100%) 단위 목록 부분만 스크롤한다.
 * 편집기 FormGroup 의 값 칸 높이 고정 해제(.mcm-fg-block)는 ../_content/styles 가 맡는다.
 */
export const UNIT_STYLE_HREF = "mcm-widget-unit-converter";

export const UNIT_CSS = `
.mcm-uc { display: flex; flex-direction: column; gap: var(--spacing-sm); height: 100%; min-height: 0; box-sizing: border-box; }
.mcm-uc__cat { flex: 0 0 auto; min-width: 0; }
.mcm-uc__cat-caption { font-size: var(--font-size-sm); font-weight: 600; color: var(--color-text); }

.mcm-uc__conv { flex: 0 0 auto; display: grid; grid-template-columns: minmax(0, 1fr) 96px 28px; grid-template-rows: auto auto; gap: var(--spacing-xs); align-items: center; }
.mcm-uc__conv > * { min-width: 0; }
/* .form-button(height 26px·padding 0 10px)보다 우선하도록 .mcm-uc 아래로 한 겹 더 좁힌다. */
.mcm-uc .mcm-uc__swap { grid-column: 3; grid-row: 1 / span 2; align-self: stretch; justify-self: stretch; height: auto; min-height: var(--input-height-xs); padding: 0; }
.mcm-uc__result { display: flex; align-items: center; gap: var(--spacing-xs); min-height: var(--input-height-xs); box-sizing: border-box; padding: 0 var(--spacing-xs) 0 var(--spacing-sm); border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-bg-readonly); }
.mcm-uc__result-text { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--color-text); }
.mcm-uc__result-text--msg { font-weight: 400; font-size: var(--font-size-sm); color: var(--color-text-muted); }
.mcm-uc .mcm-uc__copy { flex: 0 0 auto; height: 20px; padding: 0 4px; }
.mcm-uc__warn { flex: 0 0 auto; font-size: var(--font-size-xs); color: var(--color-danger); }

.mcm-uc__list { flex: 1 1 0; min-height: 56px; margin: 0; padding: 0; list-style: none; overflow: auto; border: 1px solid var(--color-border-light); border-radius: var(--radius-sm); }
.mcm-uc__list li + li { border-top: 1px solid var(--color-border-light); }
.mcm-uc__row { display: flex; align-items: baseline; justify-content: space-between; gap: var(--spacing-sm); width: 100%; box-sizing: border-box; padding: 3px var(--spacing-sm); border: 0; background: transparent; font: inherit; font-size: var(--font-size-sm); color: var(--color-text); text-align: left; cursor: pointer; }
.mcm-uc__row:hover { background: var(--color-bg-hover); }
.mcm-uc__row:focus-visible { outline: 2px solid var(--color-focus); outline-offset: -2px; }
.mcm-uc__row[aria-pressed="true"] { background: var(--color-primary-soft); }
.mcm-uc__row-unit { flex: 0 0 auto; color: var(--color-text-secondary); }
.mcm-uc__row[aria-pressed="true"] .mcm-uc__row-unit { color: var(--color-text); font-weight: 600; }
.mcm-uc__row-val { min-width: 0; text-align: right; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }

.mcm-uc-edit__checks { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: var(--spacing-xs) var(--spacing-md); }
.mcm-uc-edit__actions { display: flex; flex-wrap: wrap; gap: var(--spacing-xs); margin-bottom: var(--spacing-xs); }
`;
