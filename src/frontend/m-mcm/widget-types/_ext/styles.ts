/**
 * 환율·날씨 위젯 전용 스타일 — 로컬 .css import 대신 TS 문자열로 두고 렌더러·편집기 루트에서 `<style href precedence>` 로 넣는다
 * (home-styles.ts 와 같은 방식, Local-Rules §17). 색·간격은 공통 토큰만 쓴다. 한 변 컬러 바는 쓰지 않는다.
 * 환율 오름·내림 색은 한국 관례(오름 빨강·내림 파랑)를 따라 --color-danger·--color-primary 토큰으로 입힌다.
 */
export const EXT_STYLE_HREF = "mcm-widget-ext";

export const EXT_CSS = `
.mcm-ext { display: flex; flex-direction: column; gap: var(--spacing-sm); min-width: 0; }
.mcm-ext__state { padding: 28px 12px; text-align: center; font-size: var(--font-size-sm); color: var(--color-text-muted); }
.mcm-ext__foot { margin: 0; font-size: var(--font-size-xs); color: var(--color-text-muted); font-variant-numeric: tabular-nums; }

.mcm-ext-cur { font-weight: 500; color: var(--color-text); }
.mcm-ext-diff { font-variant-numeric: tabular-nums; white-space: nowrap; }
.mcm-ext-diff--up { color: var(--color-danger); }
.mcm-ext-diff--down { color: var(--color-primary); }
.mcm-ext-diff--flat, .mcm-ext-diff--none { color: var(--color-text-muted); }
.mcm-ext-spark { display: flex; align-items: center; justify-content: center; height: 100%; }

.mcm-wx { display: flex; flex-direction: column; gap: var(--spacing-md); min-width: 0; }
.mcm-wx__now { display: flex; align-items: center; gap: var(--spacing-lg); flex-wrap: wrap; }
.mcm-wx__icon { display: grid; place-items: center; width: 56px; height: 56px; border-radius: 50%; background: var(--color-primary-soft); color: var(--color-primary); flex-shrink: 0; }
.mcm-wx__temp { font-size: 28px; font-weight: 700; line-height: 1.1; color: var(--color-text); font-variant-numeric: tabular-nums; }
.mcm-wx__desc { font-size: var(--font-size-sm); color: var(--color-text-secondary); }
.mcm-wx__name { font-size: var(--font-size-sm); font-weight: 600; color: var(--color-text); }
.mcm-wx__meta { display: flex; flex-wrap: wrap; gap: 2px var(--spacing-lg); font-size: var(--font-size-sm); color: var(--color-text-secondary); font-variant-numeric: tabular-nums; }
.mcm-wx__meta span { display: inline-flex; align-items: center; gap: var(--spacing-xs); }
.mcm-wx__days { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--spacing-sm); }
.mcm-wx__day { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: var(--spacing-sm); border: 1px solid var(--color-border-light); border-radius: var(--radius-md); font-size: var(--font-size-xs); color: var(--color-text-secondary); font-variant-numeric: tabular-nums; }
.mcm-wx__day b { font-size: var(--font-size-sm); color: var(--color-text); }
.mcm-wx__day-icon { color: var(--color-text-muted); }

.mcm-extedit { display: flex; flex-direction: column; gap: var(--spacing-md); min-width: 0; }
.mcm-extedit__title { margin: 0; font-size: var(--font-size-sm); font-weight: 600; color: var(--color-text); }
.mcm-extedit__hint { margin: 0; font-size: var(--font-size-xs); color: var(--color-text-muted); }
.mcm-extedit__checks { display: grid; grid-template-columns: repeat(auto-fill, minmax(88px, 1fr)); gap: var(--spacing-xs) var(--spacing-md); }
.mcm-extedit__row { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr) auto; gap: var(--spacing-sm); align-items: start; }
.mcm-extedit__quick { display: flex; flex-wrap: wrap; gap: var(--spacing-xs); }
.mcm-extedit__errors { margin: 0; padding: 0; list-style: none; }
/* 여러 줄 내용(체크박스 목록·지점 행·편집기)을 담는 FormGroup — 포털 page-layout.css 가 값 칸을 26px 로 고정해 내용이 위아래 줄을 덮던 것을 막는다. */
.form-group.mcm-fg-block { align-items: stretch; }
.form-group.mcm-fg-block .form-group-label { height: auto; }
.form-group.mcm-fg-block .form-group-field { height: auto; min-height: 26px; padding: var(--spacing-xs) var(--spacing-sm); }
.form-group.mcm-fg-block .form-group-field > * { flex: 1 1 auto; min-width: 0; }
/* 한 칸 = 입력 하나를 전제로 page-layout.css 가 지운 입력칸 테두리를, 여러 입력이 들어가는 이 칸에서는 되살린다. */
.page-layout .form-group.mcm-fg-block .form-group-field .form-input,
.page-layout .form-group.mcm-fg-block .form-group-field .form-select { height: 26px; border: 1px solid var(--color-border); }
`;
