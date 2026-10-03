/**
 * 단위 계산기 렌더러·편집기 스타일 — 로컬 .css import 대신 TS 문자열로 두고 루트에서 `<style href precedence>` 로 넣는다(Local-Rules §17).
 * 색·간격·글꼴은 공통 토큰만 쓴다. 높이는 위젯 칸을 채우고(루트 height 100%) 단위 목록 부분만 스크롤한다 — 루트는 넘치지 않게 잘라(clip)
 * 최소 높이에서 경고 줄이 생겨도 위젯 본문 전체가 스크롤되지 않고 목록이 줄어든다.
 * 루트는 컨테이너(inline-size)라서 본문이 좁으면(< 300px) 값 칸이 한 줄을 다 쓰고 단위 선택칸이 그 아래로 쌓인다.
 * container-type 은 루트를 absolute·fixed 자손의 기준 상자로 만들지만 이 루트 안에는 그런 팝업이 없다 — 단위·분류 Select 는 shared Select(Mantine NativeSelect)라
 * 목록이 운영체제 네이티브 드롭다운이고, 분류 SegmentedControl 의 선택 표시만 자기 root 안에서 absolute 다.
 * 편집기 FormGroup 의 값 칸 높이 고정 해제(.mcm-fg-block)는 ../_content/styles 가 맡는다.
 */
export const UNIT_STYLE_HREF = "mcm-widget-unit-converter";

export const UNIT_CSS = `
/* 루트는 넘치는 부분을 잘라 위젯 본문이 스크롤되지 않게 한다. overflow: hidden 은 구형 브라우저용 대비책 — clip 은 포커스 이동으로 루트가 스크롤되지 않는다.
   overflow-clip-margin 은 잘리는 영역이 본문 스크롤 범위에 들어가 쓰지 않고, 포커스 링(2px)이 잘리지 않게 안쪽 여백 2px 를 둔다. */
.mcm-uc { container: mcm-uc / inline-size; display: flex; flex-direction: column; gap: var(--spacing-sm); height: 100%; min-height: 0; box-sizing: border-box; padding: 2px; overflow: hidden; overflow: clip; }
.mcm-uc__cat { flex: 0 0 auto; min-width: 0; }
.mcm-uc__cat-caption { font-size: var(--font-size-sm); font-weight: 600; color: var(--color-text); }

.mcm-uc__conv { flex: 0 0 auto; display: grid; grid-template-columns: minmax(0, 1fr) 96px 28px; grid-template-rows: auto auto; gap: var(--spacing-xs); align-items: center; }
.mcm-uc__conv > * { min-width: 0; }
.mcm-uc__value { grid-column: 1; grid-row: 1; }
.mcm-uc__from { grid-column: 2; grid-row: 1; }
.mcm-uc__result { grid-column: 1; grid-row: 2; }
.mcm-uc__to { grid-column: 2; grid-row: 2; }
/* .form-button(height 26px·padding 0 10px)보다 우선하도록 .mcm-uc 아래로 한 겹 더 좁힌다. */
.mcm-uc .mcm-uc__swap { grid-column: 3; grid-row: 1 / span 2; align-self: stretch; justify-self: stretch; height: auto; min-height: var(--input-height-xs); padding: 0; }
.mcm-uc__result { display: flex; align-items: center; gap: var(--spacing-xs); min-height: var(--input-height-xs); box-sizing: border-box; padding: 0 var(--spacing-xs) 0 var(--spacing-sm); border: 1px solid var(--color-border-strong); border-radius: var(--radius-sm); background: var(--color-bg-readonly); }
.mcm-uc__result-text { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--color-text); }
.mcm-uc__result-text--msg { font-weight: 400; font-size: var(--font-size-sm); color: var(--color-text-muted); }
.mcm-uc .mcm-uc__copy { flex: 0 0 auto; height: 20px; padding: 0 4px; }
.mcm-uc__sr { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.mcm-uc__warn { flex: 0 0 auto; font-size: var(--font-size-xs); color: var(--color-danger); }

.mcm-uc__list { flex: 1 1 0; min-height: 28px; margin: 0; padding: 0; list-style: none; overflow: auto; border: 1px solid var(--color-border-light); border-radius: var(--radius-sm); }
@container mcm-uc (max-width: 299px) {
  .mcm-uc__conv { grid-template-columns: minmax(0, 1fr) 28px; grid-template-rows: auto auto auto auto; }
  .mcm-uc__value { grid-column: 1 / span 2; grid-row: 1; }
  .mcm-uc__from { grid-column: 1; grid-row: 2; }
  .mcm-uc__result { grid-column: 1; grid-row: 3; }
  .mcm-uc__to { grid-column: 1; grid-row: 4; }
  .mcm-uc .mcm-uc__swap { grid-column: 2; grid-row: 2 / span 3; }
}
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
