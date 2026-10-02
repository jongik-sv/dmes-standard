/**
 * 미디어 위젯 유형 전용 스타일 — 로컬 .css import 대신 TS 문자열로 두고 renderer·editor 가 `<style href precedence>` 로 한 번만 넣는다(Local-Rules §17).
 * 색·간격은 공통 토큰만 쓴다. 한 변 컬러 바 금지(Local-Rules §8) — 상태는 배경 톤·전체 테두리로 구분한다.
 */
export const MEDIA_STYLE_HREF = "mcm-widget-media";

export const MEDIA_CSS = `
.mwm { display: flex; flex-direction: column; height: 100%; min-height: 160px; box-sizing: border-box; background: var(--color-bg); }
.mwm__stage { position: relative; flex: 1 1 0; min-height: 0; overflow: hidden; background: var(--color-bg-light); }
.mwm__media { position: absolute; inset: 0; display: block; width: 100%; height: 100%; border: 0; object-fit: contain; background: var(--color-bg-light); }
.mwm__media--cover { object-fit: cover; }
.mwm__state { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: var(--spacing-lg); text-align: center; font-size: var(--font-size-sm); color: var(--color-text-muted); }
.mwm__nav { position: absolute; top: 50%; z-index: 2; display: grid; place-items: center; width: 28px; height: 44px; padding: 0; margin-top: -22px; border: 0; border-radius: var(--radius-sm); background: color-mix(in srgb, var(--color-text) 55%, transparent); color: var(--color-on-primary); cursor: pointer; opacity: 0; transition: opacity 120ms ease; }
.mwm__nav--prev { left: var(--spacing-sm); }
.mwm__nav--next { right: var(--spacing-sm); }
.mwm__stage:hover .mwm__nav, .mwm__nav:focus-visible { opacity: 1; }
.mwm__nav:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 1px; }
@media (hover: none) { .mwm__nav { opacity: 0.85; } }
.mwm__foot { flex: 0 0 auto; display: flex; align-items: center; gap: var(--spacing-md); min-height: 28px; box-sizing: border-box; padding: 4px 10px; border-top: 1px solid var(--color-border-light); background: var(--color-bg); font-size: var(--font-size-sm); color: var(--color-text-secondary); }
.mwm__caption { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mwm__dots { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 6px; }
.mwm__dot { width: 10px; height: 10px; padding: 0; border: 0; border-radius: 50%; background: var(--color-border); cursor: pointer; }
.mwm__dot:hover { background: var(--color-text-muted); }
.mwm__dot--active, .mwm__dot--active:hover { background: var(--color-primary); }
.mwm__dot:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
.mwm__counter { font-size: var(--font-size-xs); color: var(--color-text-muted); font-variant-numeric: tabular-nums; white-space: nowrap; }

.mwm-ed { display: flex; flex-direction: column; gap: var(--spacing-md); font-size: var(--font-size-md); color: var(--color-text); }
.mwm-ed__section { display: flex; flex-direction: column; gap: var(--spacing-sm); }
.mwm-ed__title { margin: 0; font-size: var(--font-size-md); font-weight: 700; color: var(--color-text); }
.mwm-ed__row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--spacing-sm); }
.mwm-ed__grow { flex: 1 1 200px; min-width: 0; }
.mwm-ed__kind { flex: 0 0 120px; }
.mwm-ed__hint { margin: 0; font-size: var(--font-size-xs); color: var(--color-text-muted); }
.mwm-ed__busy { font-size: var(--font-size-sm); color: var(--color-text-muted); }
.mwm-ed__empty { padding: var(--spacing-md); border: 1px dashed var(--color-border); border-radius: var(--radius-md); background: var(--color-bg-light); text-align: center; font-size: var(--font-size-sm); color: var(--color-text-muted); }
.mwm-ed__list { display: flex; flex-direction: column; gap: var(--spacing-sm); margin: 0; padding: 0; list-style: none; }
.mwm-ed__item { display: grid; grid-template-columns: 22px 56px minmax(0, 1fr) auto; align-items: center; gap: var(--spacing-sm); padding: 6px 8px; border: 1px solid var(--color-border-light); border-radius: var(--radius-md); background: var(--color-bg); }
.mwm-ed__item--invalid { border-color: var(--color-danger); background: var(--color-danger-soft); }
.mwm-ed__no { font-size: var(--font-size-sm); color: var(--color-text-muted); font-variant-numeric: tabular-nums; text-align: center; }
.mwm-ed__thumb { display: grid; place-items: center; width: 56px; height: 40px; overflow: hidden; border-radius: var(--radius-sm); background: var(--color-bg-hover); font-size: var(--font-size-xs); color: var(--color-text-muted); }
.mwm-ed__thumb img { display: block; width: 100%; height: 100%; object-fit: cover; }
.mwm-ed__body { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.mwm-ed__src { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--font-size-xs); color: var(--color-text-muted); }
.mwm-ed__actions { display: inline-flex; align-items: center; gap: 4px; }
.mwm-ed__settings { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--spacing-md); }
.mwm-ed__field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.mwm-ed__label { font-size: var(--font-size-sm); font-weight: 600; color: var(--color-text-secondary); }
.mwm-ed__errors { margin: 0; padding: var(--spacing-sm) var(--spacing-md); list-style: none; border: 1px solid color-mix(in srgb, var(--color-danger) 35%, transparent); border-radius: var(--radius-md); background: var(--color-danger-soft); color: var(--color-danger); font-size: var(--font-size-sm); }
`;
