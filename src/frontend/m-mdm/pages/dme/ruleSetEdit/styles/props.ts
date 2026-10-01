/** 속성 패널 보강 스타일(3단계 계획 Task 9 — 갈래 순서 끌기 손잡이). */
export const PROPS_CSS = `
.rsf-branch-grip { display: flex; align-items: center; cursor: grab; margin-right: var(--spacing-xs); }
.rsf-branch-grip:active { cursor: grabbing; }

/* 오른쪽 머리글·섹션(4단계 Task 8 — Camunda Modeler 식). 한 변 색 바 없이 전체 선·배경 톤만 쓴다. */
.rsf-side { display: flex; flex-direction: column; }
.rsf-panel-header { display: flex; align-items: center; gap: var(--spacing-sm); padding: var(--spacing-sm) var(--spacing-md); border-bottom: 1px solid var(--color-border-light); }
.rsf-panel-header-icon { display: flex; color: var(--color-text-secondary); }
.rsf-panel-header-text { min-width: 0; }
.rsf-panel-header-kind { margin: 0; font-size: var(--font-size-xs); font-weight: 700; color: var(--color-text-secondary); }
.rsf-panel-header-name { margin: 0; font-weight: 600; overflow-wrap: anywhere; }
.rsf-side > .rsf-panel { padding: 0; }
.rsf-section { border-bottom: 1px solid var(--color-border-light); }
.rsf-section-head {
  display: flex; align-items: center; justify-content: space-between; width: 100%; padding: var(--spacing-xs) var(--spacing-md);
  background: none; border: 0; color: var(--color-text); font: inherit; font-weight: 600; text-align: left; cursor: pointer;
}
.rsf-section-head:hover { background: var(--color-bg-hover); }
.rsf-section-chevron { flex: none; color: var(--color-text-muted); transition: transform 0.15s; }
.rsf-section[data-open="true"] .rsf-section-chevron { transform: rotate(90deg); }
.rsf-section-body { padding: 0 var(--spacing-md) var(--spacing-sm); }
.rsf-section-body .rsf-rule-panel { flex: none; overflow: visible; }
.rsf-section-body .rsf-rule-list-search, .rsf-section-body .rsf-rule-rows { padding-left: 0; padding-right: 0; }

/* 「외관」 섹션(S1 §3) — 고른 것은 바깥 고리(한 변 색 바 아님, Local-Rules §8). */
.rsf-style { display: flex; flex-direction: column; gap: var(--spacing-sm); }
.rsf-style-row { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.rsf-style-label { font-size: var(--font-size-sm); font-weight: 600; color: var(--color-text-secondary); }
.rsf-style-shapes { display: flex; flex-wrap: wrap; gap: 4px; }
.rsf-style-icons { display: grid; grid-template-columns: repeat(auto-fill, minmax(30px, 1fr)); gap: 4px; }
.rsf-style-icon, .rsf-style-shape {
  box-sizing: border-box; margin: 0; font: inherit; color: var(--color-text); cursor: pointer;
  background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-sm);
}
.rsf-style-icon { height: 30px; display: inline-flex; align-items: center; justify-content: center; padding: 0 4px; font-size: var(--font-size-xs); }
.rsf-style-shape { height: 26px; padding: 0 var(--spacing-sm); font-size: var(--font-size-sm); }
.rsf-style-shape[data-shape="square"] { border-radius: 0; }
.rsf-style-shape[data-shape="pill"] { border-radius: 999px; }
.rsf-style-icon[aria-pressed="true"], .rsf-style-shape[aria-pressed="true"] {
  background: var(--color-primary-soft); border-color: var(--color-primary); outline: 2px solid var(--color-primary); outline-offset: 1px;
}
.rsf-style-icon:disabled, .rsf-style-shape:disabled { cursor: default; opacity: 0.5; }
.rsf-style-parts { display: flex; flex-direction: column; gap: 4px; }
.rsf-style-size { display: flex; flex-wrap: wrap; align-items: flex-end; gap: var(--spacing-xs); }
.rsf-style-size-field { display: flex; flex-direction: column; gap: 2px; width: 96px; font-size: var(--font-size-sm); color: var(--color-text-secondary); }
.rsf-catch-kinds { display: flex; flex-direction: column; gap: var(--spacing-xs); }
.rsf-catch-kind { display: flex; flex-wrap: wrap; align-items: center; gap: var(--spacing-xs); }
`;
