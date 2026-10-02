/**
 * dashboard 컴포넌트 공용 스타일 — 컴포넌트가 `<style href precedence>` 로 한 번만 넣는다(Part B §18-3).
 * 색·간격은 공통 토큰만 쓴다. 칸 너비는 12열 격자의 span 값(data-span*)으로 정한다.
 */

/** 화면 폭이 이 값 이하이면 data-span-md 를 쓴다(카드 세로 쌓기). */
export const DASHBOARD_BREAKPOINT_MD = 1100;
/** 화면 폭이 이 값 이하이면 data-span-sm 을 쓴다(작은 타일 두 줄). */
export const DASHBOARD_BREAKPOINT_SM = 480;

function spanRules(attr: string): string {
  const rules: string[] = [];
  for (let n = 1; n <= 12; n += 1) {
    rules.push(
      `.cm-dash-grid > [${attr}="${n}"], .cm-dash-row > [${attr}="${n}"] { grid-column: span ${n}; }`
    );
  }
  return rules.join("\n");
}

export const DASHBOARD_CSS = `
.cm-dash-grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: var(--spacing-sm); align-content: start; box-sizing: border-box; min-width: 0; }
/* fill: 스크롤은 바깥 감싸개가 맡고, 격자는 높이를 정하지 않는다(내용 높이). 격자 자체에 고정 높이를 주면 자동 행이
   남는 공간이 음수인 상태로 크기를 정해, overflow:hidden 카드(최소 높이 0)가 머리 높이로 눌린다(2026-10-02 실측 76px). */
.cm-dash-scroll { flex: 1 1 0; min-height: 0; overflow-y: auto; overflow-x: hidden; scrollbar-gutter: stable; padding: 0 var(--spacing-md) var(--spacing-md); box-sizing: border-box; }
.cm-dash-grid > *, .cm-dash-row > * { min-width: 0; grid-column: span 12; }
/* 행: 한 줄 전체를 차지하는 12열 하위 격자. 폭 조절로 행 안에서 줄바꿈이 생겨도 다른 행과 섞이지 않는다.
   행이 접히면 그 안 카드가 모두 머리만 남아 행 높이가 머리 높이가 되고 아래 행이 바로 올라온다. */
.cm-dash-grid > .cm-dash-row { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: var(--spacing-sm); align-items: stretch; min-width: 0; }
/* 카드는 내용 높이보다 줄어들지 않는다(height 를 준 카드는 그 높이). */
.cm-dash-grid > .cm-dash-card:not(.cm-dash-card--fixed), .cm-dash-row > .cm-dash-card:not(.cm-dash-card--fixed) { min-height: min-content; }
${spanRules("data-span")}
@media (max-width: ${DASHBOARD_BREAKPOINT_MD}px) {
${spanRules("data-span-md")}
}
@media (max-width: ${DASHBOARD_BREAKPOINT_SM}px) {
${spanRules("data-span-sm")}
}

.cm-dash-cell { min-width: 0; }

.cm-dash-card { display: flex; flex-direction: column; box-sizing: border-box; min-width: 0; background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-md); overflow: hidden; position: relative; }
/* 접힌 카드는 행 높이만큼 늘어나지 않는다(같은 줄의 펼친 카드가 있으면 그 줄 높이는 그대로다 — grid 의 행 배치 한계). */
.cm-dash-card--collapsed { align-self: start; }
.cm-dash-card--collapsed .cm-dash-card__head { border-bottom: 0; }
/* 작성자 display(flex 등)가 [hidden] 을 이기지 않게 한다 — 안 그러면 fill 본문이 접히지 않는다. */
.cm-dash-card__body[hidden], .cm-dash-card__toolbar[hidden] { display: none !important; }
.cm-dash-card__toggle { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; padding: 0; border: 1px solid transparent; border-radius: var(--radius-sm); background: transparent; color: var(--color-text-secondary); cursor: pointer; }
.cm-dash-card__toggle:hover { background: var(--color-bg-hover); border-color: var(--color-border); }
.cm-dash-card__toggle:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 1px; }
.cm-dash-card__resize { position: absolute; z-index: 2; display: flex; align-items: center; justify-content: center; outline: none; touch-action: none; }
.cm-dash-card__resize--x { top: 50%; right: 0; width: 8px; height: 56px; margin-top: -28px; cursor: col-resize; }
.cm-dash-card__resize--y { left: 50%; bottom: 0; width: 80px; height: 8px; margin-left: -40px; cursor: row-resize; }
.cm-dash-card__grip { display: block; border-radius: 2px; background: transparent; transition: background-color var(--transition-fast); }
.cm-dash-card__resize--x .cm-dash-card__grip { width: 3px; height: 36px; }
.cm-dash-card__resize--y .cm-dash-card__grip { width: 36px; height: 3px; }
.cm-dash-card:hover .cm-dash-card__grip { background: var(--color-border-strong); }
.cm-dash-card__resize:hover .cm-dash-card__grip, .cm-dash-card__resize:focus-visible .cm-dash-card__grip, .cm-dash-card__resize[data-dragging] .cm-dash-card__grip { background: var(--color-primary); }
@media (max-width: ${DASHBOARD_BREAKPOINT_MD}px) {
  .cm-dash-card__resize--x { display: none; }
}
.cm-dash-card__head { display: flex; align-items: center; gap: var(--spacing-sm); flex-shrink: 0; min-height: 32px; padding: 0 var(--spacing-md); box-sizing: border-box; background: var(--color-bg-header); border-bottom: 1px solid var(--color-border-light); }
.cm-dash-card__title { margin: 0; font-size: 13px; font-weight: 700; line-height: 1.3; color: var(--color-text); white-space: nowrap; }
.cm-dash-card__sub { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--font-size-xs); color: var(--color-text-muted); }
.cm-dash-card__extra { display: inline-flex; align-items: center; gap: var(--spacing-xs); flex-shrink: 0; }
.cm-dash-card__actions { margin-left: auto; display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.cm-dash-card__toolbar { flex-shrink: 0; padding: 6px var(--spacing-md); border-bottom: 1px solid var(--color-border-light); }
.cm-dash-card__body { flex: 1 1 auto; min-width: 0; box-sizing: border-box; }
.cm-dash-card__body--padded { padding: var(--spacing-md); }
.cm-dash-card--fixed .cm-dash-card__body { flex: 1 1 0; min-height: 0; overflow-y: auto; scrollbar-gutter: stable; }
.cm-dash-card .cm-dash-card__body--fill { display: flex; flex-direction: column; flex: 1 1 0; min-height: 0; overflow: hidden; scrollbar-gutter: auto; }
.cm-dash-card__body--fill.cm-dash-card__body--padded { padding: var(--spacing-sm) 0 0; }

.cm-kpi { display: flex; flex-direction: column; gap: 2px; box-sizing: border-box; min-width: 0; height: 100%; padding: var(--spacing-md); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-md); }
.cm-kpi__label { display: flex; align-items: center; justify-content: space-between; gap: var(--spacing-xs); min-width: 0; font-size: var(--font-size-sm); color: var(--color-text-muted); }
.cm-kpi__label > span:first-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cm-kpi__main { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 2px var(--spacing-sm); min-width: 0; }
.cm-kpi__value { font-size: 22px; font-weight: 700; letter-spacing: -0.01em; color: var(--color-text); font-variant-numeric: tabular-nums; white-space: nowrap; }
.cm-kpi__unit { margin-left: 2px; font-size: var(--font-size-sm); font-weight: 400; color: var(--color-text-muted); }
.cm-kpi__spark { flex-shrink: 0; }
.cm-kpi__foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--spacing-sm); min-width: 0; font-size: var(--font-size-xs); color: var(--color-text-muted); font-variant-numeric: tabular-nums; }
.cm-kpi__delta { white-space: nowrap; }
.cm-kpi__delta--good { color: var(--color-success); }
.cm-kpi__delta--bad { color: var(--color-danger); }
.cm-kpi__bar { height: 4px; margin-top: 6px; overflow: hidden; border-radius: 2px; background: var(--color-bg-hover); }
.cm-kpi__bar > i { display: block; height: 100%; background: var(--color-primary); }
.cm-kpi--warn .cm-kpi__bar > i { background: var(--color-warning); }

.cm-sparkline { display: block; overflow: visible; }

/* KPI 묶음 — 위젯 안에서 타일이 폭에 맞춰 줄바꿈된다. */
/* auto-fit: 위젯 전체 폭(12칸)에서는 타일 6개가 한 줄, 위젯을 좁히면 그때만 줄바꿈된다(남는 빈 칸 없이 타일이 늘어난다). */
.cm-kpi-group { display: grid; grid-template-columns: repeat(auto-fit, minmax(var(--cm-kpi-min, 150px), 1fr)); gap: var(--spacing-sm); min-width: 0; }
/* 좁은 타일: 추이 선을 값 아래로 내리고 폭에 맞춰 줄이며, 기준·증감은 두 줄로 놓는다(타일 폭 기준 컨테이너 질의). */
.cm-kpi-group > .cm-kpi { container-type: inline-size; padding: var(--spacing-sm) var(--spacing-md); }
@container (max-width: 210px) {
  .cm-kpi__main { flex-direction: column; align-items: stretch; gap: 2px; }
  .cm-kpi__value { font-size: 20px; }
  .cm-kpi__spark { display: block; line-height: 0; }
  .cm-kpi__spark .cm-sparkline { width: 100%; height: 22px; }
  .cm-kpi__foot { flex-direction: column; align-items: flex-start; gap: 0; }
}

/* 보드 편집 모드 — 점선 전체 테두리로 편집 중임을 보인다(한 변 컬러 바 금지). */
.cm-dash-card[data-editing] { border-style: dashed; border-color: var(--color-border-strong); }
.cm-dash-card[data-editing] > .cm-dash-card__head { cursor: grab; user-select: none; touch-action: none; }
.cm-dash-card[data-drag-source] { opacity: 0.45; }
.cm-dash-card__drag { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 20px; height: 22px; margin-left: -4px; padding: 0; border: 1px solid transparent; border-radius: var(--radius-sm); background: transparent; color: var(--color-text-muted); cursor: grab; touch-action: none; }
.cm-dash-card__drag:hover { background: var(--color-bg-hover); color: var(--color-text); }
.cm-dash-card__drag:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 1px; }
.cm-dash-board__gap { height: 12px; box-sizing: border-box; border: 1px dashed transparent; border-radius: var(--radius-md); }
.cm-dash-board__gap[data-active] { border-color: var(--color-primary); background: var(--color-primary-soft); }
.cm-dash-board__empty { padding: 28px 12px; text-align: center; font-size: var(--font-size-sm); color: var(--color-text-muted); border: 1px dashed var(--color-border); border-radius: var(--radius-md); }
.cm-dash-board__sr { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.cm-dash-board__ghost { position: fixed; z-index: 1000; pointer-events: none; padding: 4px 10px; font-size: var(--font-size-sm); font-weight: 600; color: var(--color-text); background: var(--color-bg); border: 1px solid var(--color-primary); border-radius: var(--radius-md); box-shadow: var(--shadow-dropdown); white-space: nowrap; }
.cm-dash-board__indicator { position: fixed; z-index: 999; pointer-events: none; border-radius: 2px; background: var(--color-primary); }
.cm-dash-board__ghost[hidden], .cm-dash-board__indicator[hidden] { display: none; }

/* 위젯 추가 목록(드롭다운) */
.cm-dash-picker { position: relative; z-index: 20; display: inline-flex; }
.cm-dash-picker__pop { position: absolute; top: calc(100% + 4px); right: 0; width: 280px; max-height: 340px; overflow-y: auto; box-sizing: border-box; background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-md); box-shadow: var(--shadow-dropdown); }
.cm-dash-picker__head { padding: 7px 10px; font-size: var(--font-size-sm); font-weight: 700; color: var(--color-text); background: var(--color-bg-header); border-bottom: 1px solid var(--color-border-light); }
.cm-dash-picker__list { list-style: none; margin: 0; padding: 4px; }
.cm-dash-picker__item { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; width: 100%; padding: 6px 8px; border: 1px solid transparent; border-radius: var(--radius-sm); background: transparent; text-align: left; cursor: pointer; font: inherit; color: var(--color-text); }
.cm-dash-picker__item:hover, .cm-dash-picker__item:focus-visible { background: var(--color-bg-hover); outline: none; border-color: var(--color-border); }
.cm-dash-picker__name { font-size: var(--font-size-sm); font-weight: 600; }
.cm-dash-picker__desc { font-size: var(--font-size-xs); color: var(--color-text-muted); }
.cm-dash-picker__empty { padding: 16px 10px; text-align: center; font-size: var(--font-size-sm); color: var(--color-text-muted); }
`;

const STYLE_HREF = "cm-dashboard";

/** dashboard 스타일을 한 번만 넣는다(React 19 가 같은 href 의 style 을 하나로 합친다). */
export function DashboardStyle() {
  return (
    <style href={STYLE_HREF} precedence="default">
      {DASHBOARD_CSS}
    </style>
  );
}
