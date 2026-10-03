/**
 * 계산기 렌더러 전용 스타일 — 로컬 .css import 대신 TS 문자열로 두고 렌더러 루트에서 한 번 넣는다(Local-Rules §17).
 * 색·간격·글꼴 크기는 공통 토큰만 쓴다. 단추 5행 4열은 CSS grid 로 본문 높이·너비를 채운다.
 * 글자 크기는 렌더러가 본문 크기에 맞춰 --calc-key-font·--calc-value-font 로 넣고, 없으면(크기를 모르면) 토큰 기본값이다.
 * 단추는 shared Button(Mantine, 고정 높이)이 grid 늘이기와 맞지 않아 button 을 직접 꾸민다.
 */
import { CALC_GAP, CALC_HISTORY_WIDTH } from "./calculator-model";

export const CALC_STYLE_HREF = "mcm-widget-calculator";

export const CALC_CSS = `
.mcm-calc { display: flex; gap: var(--spacing-sm); height: 100%; min-height: 0; box-sizing: border-box; outline: none; }
.mcm-calc:focus-visible { outline: 2px solid var(--color-focus); outline-offset: -2px; border-radius: var(--radius-md); }
.mcm-calc__main { flex: 1 1 0; min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: ${CALC_GAP}px; }

.mcm-calc__display { flex: 0 0 auto; box-sizing: border-box; padding: var(--spacing-xs) var(--spacing-sm); border: 1px solid var(--color-border-light); border-radius: var(--radius-md); background: var(--color-bg-light); }
.mcm-calc__expr { display: flex; justify-content: flex-end; overflow: hidden; min-height: 1.5em; font-size: var(--font-size-sm); line-height: 1.5; color: var(--color-text-muted); font-variant-numeric: tabular-nums; }
.mcm-calc__expr > span { flex: none; white-space: nowrap; }
.mcm-calc__row { display: flex; align-items: center; gap: var(--spacing-xs); }
.mcm-calc__value { flex: 1 1 0; min-width: 0; overflow: hidden; text-align: right; white-space: nowrap; font-size: var(--calc-value-font, var(--font-size-title)); font-weight: 600; line-height: 1.25; color: var(--color-text); font-variant-numeric: tabular-nums; }
.mcm-calc__value--error { font-size: var(--font-size-md); color: var(--color-danger); white-space: normal; line-height: 1.4; }
.mcm-calc__copy { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; padding: var(--spacing-xs); border: 1px solid transparent; border-radius: var(--radius-sm); background: transparent; color: var(--color-text-muted); cursor: pointer; }
.mcm-calc__copy:hover:not(:disabled) { background: var(--color-bg-hover); color: var(--color-text); }
.mcm-calc__copy:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 1px; }
.mcm-calc__copy:disabled { color: var(--color-text-disabled); cursor: default; }
.mcm-calc__copy--done { color: var(--color-success); }

.mcm-calc__keys { flex: 1 1 0; min-height: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); grid-template-rows: repeat(5, minmax(0, 1fr)); gap: ${CALC_GAP}px; }
.mcm-calc__key { min-width: 0; min-height: 0; margin: 0; padding: 0; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-bg); color: var(--color-text); font-family: inherit; font-size: var(--calc-key-font, var(--font-size-lg)); line-height: 1; cursor: pointer; user-select: none; -webkit-user-select: none; touch-action: manipulation; }
.mcm-calc__key:hover { background: var(--color-bg-hover); }
.mcm-calc__key:active { background: var(--color-primary-soft); border-color: var(--color-selection-border); }
.mcm-calc__key--fn, .mcm-calc__key--op { background: var(--color-bg-header); }
.mcm-calc__key--op { color: var(--color-primary); }
.mcm-calc__key--fn:hover, .mcm-calc__key--op:hover { background: var(--color-bg-hover); }
.mcm-calc__key--eq { border-color: var(--color-primary); background: var(--color-primary); color: var(--color-on-primary); }
.mcm-calc__key--eq:hover { background: var(--color-primary-hover); }
.mcm-calc__key--eq:active { background: var(--color-primary-active); }

.mcm-calc__history { flex: 0 0 ${CALC_HISTORY_WIDTH}px; min-width: 0; min-height: 0; box-sizing: border-box; display: flex; flex-direction: column; padding-left: var(--spacing-sm); border-left: 1px solid var(--color-border-light); }
.mcm-calc__htitle { flex: 0 0 auto; margin: 0 0 var(--spacing-xs); font-size: var(--font-size-xs); font-weight: 600; color: var(--color-text-muted); }
.mcm-calc__hempty { font-size: var(--font-size-xs); color: var(--color-text-muted); }
.mcm-calc__hlist { flex: 1 1 0; min-height: 0; margin: 0; padding: 0; list-style: none; overflow: auto; }
.mcm-calc__hitem { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; width: 100%; box-sizing: border-box; padding: var(--spacing-xs) var(--spacing-sm); border: 0; border-bottom: 1px solid var(--color-border-light); border-radius: 0; background: transparent; font-family: inherit; text-align: right; cursor: pointer; }
.mcm-calc__hitem:hover { background: var(--color-bg-hover); }
.mcm-calc__hitem:focus-visible { outline: 2px solid var(--color-focus); outline-offset: -2px; }
.mcm-calc__hexpr { max-width: 100%; font-size: var(--font-size-xs); color: var(--color-text-muted); overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.mcm-calc__hres { max-width: 100%; font-size: var(--font-size-lg); color: var(--color-text); overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
`;
