/**
 * 화면 코어(FE1) 스타일 — 캔버스 host·위 막대 한 줄·칩·버전 팝오버·시작 화면·등록 창·알림 띠·확정·편집자 창.
 * canvas/erd-styles.ts 의 ERD_CSS 끝에 붙는다(같은 세기의 규칙은 여기 것이 이긴다).
 */
export const CORE_CSS = `
.erd-canvas__host { position: absolute; inset: 0; outline: none; }
.erd-canvas__host:focus-visible { box-shadow: inset 0 0 0 2px var(--color-primary); }
.page-layout.erd-page > .page-layout__header { display: none; }
.erd-bar__row--top { flex-wrap: nowrap; min-width: 0; }
.erd-bar__row--top > * { flex-shrink: 0; }
.erd-bar__row--top > .erd-bar__summary { flex: 0 1 280px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: var(--font-size-sm); color: var(--color-text-secondary); }
.erd-bar__models { flex-wrap: nowrap; }
.cm-dpop-trigger.erd-chip { gap: var(--spacing-xs); padding: 2px var(--spacing-sm); border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm); background: var(--color-bg); color: var(--color-text); text-decoration: none; font-size: var(--font-size-sm); white-space: nowrap; }
.cm-dpop-trigger.erd-chip:hover:not(:disabled), .cm-dpop-trigger.erd-chip[aria-expanded="true"] { background: var(--color-bg-hover); }
.cm-dpop-trigger.erd-chip--warn { color: var(--color-warning); border-color: var(--color-warning); background: var(--color-warning-soft); }
.cm-dpop-trigger.erd-chip--warn:hover:not(:disabled), .cm-dpop-trigger.erd-chip--warn[aria-expanded="true"] { background: var(--color-warning-soft); }
.erd-chip__text { display: inline-flex; align-items: center; gap: var(--spacing-xs); }
.erd-ver-pop { display: flex; flex-direction: column; gap: var(--spacing-sm); }
.erd-ver-pop__rev { font-size: var(--font-size-sm); color: var(--color-text-secondary); }
.erd-ver-pop [data-testid="erd-ver-confirm"]:disabled { background: var(--color-bg-disabled); border-color: var(--color-border); color: var(--color-text-disabled); }
.erd-readonly-pop { white-space: normal; }
.erd-start-host { height: 100%; }
.erd-start__box { display: flex; flex-direction: column; align-items: center; gap: var(--spacing-md); max-width: 640px; padding: var(--spacing-md); text-align: center; }
.erd-start__text { color: var(--color-text-secondary); }
.erd-start__cards, .erd-start__actions { display: flex; flex-wrap: wrap; justify-content: center; gap: var(--spacing-sm); }
.erd-reg { display: grid; grid-template-columns: auto 1fr; align-items: center; gap: var(--spacing-sm) var(--spacing-md); }
.erd-reg__row { display: contents; }
.erd-reg__label { font-size: var(--font-size-sm); color: var(--color-text-secondary); }
.erd-reg__help { grid-column: 1 / -1; font-size: var(--font-size-xs); color: var(--color-text-muted); }
.erd-notice { display: flex; flex-wrap: wrap; align-items: center; gap: var(--spacing-sm); padding: var(--spacing-xs) var(--spacing-sm);
  font-size: var(--font-size-sm); color: var(--color-danger); background: var(--color-danger-soft); }
.erd-notice[data-code="RELOAD"], .erd-notice[data-code="NETWORK"] { color: var(--color-warning); background: var(--color-warning-soft); }
.erd-notice__label { font-weight: 600; }
.erd-notice__hint { color: var(--color-text-secondary); }
.erd-notice__spacer { flex: 1; }
.erd-history__mine { font-weight: 600; }
.erd-confirm__summary { margin-bottom: var(--spacing-sm); font-size: var(--font-size-sm); }
.erd-confirm__group { margin-top: var(--spacing-sm); }
.erd-confirm__code { font-size: var(--font-size-sm); font-weight: 600; }
.erd-confirm__list { max-height: 240px; overflow-y: auto; margin: var(--spacing-xs) 0 0; padding-left: var(--spacing-md); font-size: var(--font-size-xs); }
.erd-confirm__more { font-size: var(--font-size-xs); color: var(--color-text-muted); }
.erd-confirm__error { margin-top: var(--spacing-sm); font-size: var(--font-size-sm); color: var(--color-danger); }
.erd-editors__row { display: flex; align-items: center; gap: var(--spacing-sm); padding: 2px 0; }
`;
