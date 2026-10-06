/**
 * 룰 계산기 렌더러·편집기 전용 스타일 — 로컬 .css import 대신 TS 문자열로 두고 루트에서 한 번 넣는다(Local-Rules §17).
 * 색·간격·글꼴 크기는 공통 토큰만 쓴다. 입력 칸은 칸 너비에 맞춰 자동으로 1~N 열이 되어(auto-fit) 도크의 좁은 창에서도 쓸 수 있다.
 * 본문이 길면 위젯 안에서 스크롤한다(칸 높이를 넘겨도 계산 단추는 입력 칸 아래에 붙어 있다).
 */
export const RULE_CALC_STYLE_HREF = "mcm-widget-rule-calc";

export const RULE_CALC_CSS = `
.mcm-rc { display: flex; flex-direction: column; gap: var(--spacing-sm); height: 100%; min-height: 0; box-sizing: border-box; overflow: auto; }
.mcm-rc__head { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--spacing-xs); font-size: var(--font-size-xs); color: var(--color-text-muted); }
.mcm-rc__name { font-size: var(--font-size-sm); font-weight: 600; color: var(--color-text); }
.mcm-rc__badge { padding: 0 var(--spacing-xs); border: 1px solid var(--color-warning); border-radius: var(--radius-sm); background: var(--color-warning-soft); color: var(--color-text); }

.mcm-rc__state { display: flex; align-items: center; justify-content: center; flex: 1 1 auto; padding: var(--spacing-lg); text-align: center; font-size: var(--font-size-sm); color: var(--color-text-muted); }
.mcm-rc__state--error { color: var(--color-danger); }

.mcm-rc__inputs { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: var(--spacing-xs) var(--spacing-sm); }
.mcm-rc__field { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.mcm-rc__label { display: flex; align-items: baseline; gap: var(--spacing-xs); min-width: 0; font-size: var(--font-size-xs); color: var(--color-text-secondary); }
.mcm-rc__label > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mcm-rc__req { color: var(--color-danger); }
.mcm-rc__unit { flex: none; color: var(--color-text-muted); }
.mcm-rc__err { font-size: var(--font-size-xs); color: var(--color-danger); }

.mcm-rc__actions { display: flex; align-items: center; gap: var(--spacing-sm); }

.mcm-rc__msgs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--spacing-xs); }
.mcm-rc__msg { padding: var(--spacing-xs) var(--spacing-sm); border: 1px solid var(--color-border-light); border-radius: var(--radius-sm); font-size: var(--font-size-sm); color: var(--color-text); }
.mcm-rc__msg--error { border-color: var(--color-danger); background: var(--color-danger-soft); }
.mcm-rc__msg--warn { border-color: var(--color-warning); background: var(--color-warning-soft); }
.mcm-rc__msg--info { background: var(--color-bg-light); }

.mcm-rc__results { margin: 0; display: grid; grid-template-columns: minmax(0, 1fr) auto; border: 1px solid var(--color-border-light); border-radius: var(--radius-md); background: var(--color-bg-light); }
.mcm-rc__results > dt, .mcm-rc__results > dd { margin: 0; padding: var(--spacing-xs) var(--spacing-sm); border-top: 1px solid var(--color-border-light); }
.mcm-rc__results > dt:first-of-type, .mcm-rc__results > dt:first-of-type + dd { border-top: 0; }
.mcm-rc__results > dt { font-size: var(--font-size-sm); color: var(--color-text-secondary); overflow: hidden; text-overflow: ellipsis; }
.mcm-rc__results > dd { display: flex; align-items: baseline; justify-content: flex-end; gap: var(--spacing-xs); text-align: right; font-size: var(--font-size-lg); font-weight: 600; color: var(--color-text); font-variant-numeric: tabular-nums; word-break: break-all; }
.mcm-rc__results .mcm-rc__unit { font-size: var(--font-size-xs); font-weight: 400; }

.mcm-rc__steps { display: flex; flex-direction: column; gap: var(--spacing-xs); font-size: var(--font-size-xs); color: var(--color-text-secondary); }
.mcm-rc__steps-title { font-weight: 600; }
.mcm-rc__step { display: flex; flex-direction: column; gap: 2px; padding: var(--spacing-xs) var(--spacing-sm); border-left: 3px solid var(--color-border-medium); background: var(--color-bg-light); }
.mcm-rc__step-head { display: flex; flex-wrap: wrap; gap: var(--spacing-xs); color: var(--color-text); }
.mcm-rc__step-note { color: var(--color-text-muted); }
.mcm-rc__step-row { display: flex; justify-content: space-between; gap: var(--spacing-sm); font-variant-numeric: tabular-nums; }
.mcm-rc__step-row > span:last-child { text-align: right; word-break: break-all; }

.mcm-rc-editor { display: flex; flex-direction: column; gap: var(--spacing-sm); min-width: 0; }
.mcm-rc-editor__row { display: flex; align-items: center; gap: var(--spacing-xs); min-width: 0; }
.mcm-rc-editor__row > .mcm-rc-editor__grow { flex: 1 1 auto; min-width: 0; }
.mcm-rc-editor__note { font-size: var(--font-size-xs); color: var(--color-text-muted); }
.mcm-rc-editor__preview { display: flex; flex-direction: column; gap: var(--spacing-xs); padding: var(--spacing-sm); border: 1px solid var(--color-border-light); border-radius: var(--radius-sm); background: var(--color-bg-light); font-size: var(--font-size-sm); }
.mcm-rc-editor__list { margin: 0; padding-left: var(--spacing-lg); }
`;
