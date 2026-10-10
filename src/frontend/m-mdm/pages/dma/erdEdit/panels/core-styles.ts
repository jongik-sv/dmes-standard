/** 화면 코어(FE1) 스타일 — 캔버스 host·알림 띠·메시지 톤·버전 막대·확정·편집자 창. canvas/erd-styles.ts 의 ERD_CSS 끝에 붙는다. */
export const CORE_CSS = `
.erd-canvas__host { position: absolute; inset: 0; outline: none; }
.erd-canvas__host:focus-visible { box-shadow: inset 0 0 0 2px var(--color-primary); }
.erd-message[data-tone="warn"] { color: var(--color-warning); }
.erd-message[data-tone="error"] { color: var(--color-danger); }
.erd-notice { display: flex; flex-wrap: wrap; align-items: center; gap: var(--spacing-sm); padding: var(--spacing-xs) var(--spacing-sm);
  font-size: var(--font-size-sm); color: var(--color-danger); background: var(--color-danger-soft); }
.erd-notice[data-code="RELOAD"], .erd-notice[data-code="NETWORK"] { color: var(--color-warning); background: var(--color-warning-soft); }
.erd-notice__label { font-weight: 600; }
.erd-notice__hint { color: var(--color-text-secondary); }
.erd-notice__spacer { flex: 1; }
.erd-version { border-top: 1px dashed var(--color-border); }
.erd-history__mine { font-weight: 600; }
.erd-confirm__summary { margin-bottom: var(--spacing-sm); font-size: var(--font-size-sm); }
.erd-confirm__group { margin-top: var(--spacing-sm); }
.erd-confirm__code { font-size: var(--font-size-sm); font-weight: 600; }
.erd-confirm__list { max-height: 240px; overflow-y: auto; margin: var(--spacing-xs) 0 0; padding-left: var(--spacing-md); font-size: var(--font-size-xs); }
.erd-confirm__more { font-size: var(--font-size-xs); color: var(--color-text-muted); }
.erd-confirm__error { margin-top: var(--spacing-sm); font-size: var(--font-size-sm); color: var(--color-danger); }
.erd-editors__row { display: flex; align-items: center; gap: var(--spacing-sm); padding: 2px 0; }
`;
