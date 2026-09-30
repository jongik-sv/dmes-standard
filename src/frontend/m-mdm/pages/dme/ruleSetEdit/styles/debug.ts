/**
 * 디버그 모드 스타일(3단계 계획 Task 10 이 채운다).
 *
 * `LEGACY_SIM_CSS` 는 2단계 시뮬레이션 탭(`SimulationPanel`·`TraceStepper`)에서만 쓰는 **탭 전용** 규칙(`.rsim`·`.rsim-bar*`·`.rsim-scroll`·
 * `.rsim-input`·`.rsim-main`·`.rsim-field*`·`.rsim-evalts*`·`.rsim-stepper*`·`.rsim-progress`·`.rsim-status`·`.rsim-error` 등·`.rsf-sim-slot`)을
 * `rsf-styles.ts` 에서 그대로 옮긴 것이다. 시뮬레이션 탭을 지우는 Task 12 가 이 상수를 지운다. 노드 상세(`TraceDetail`)·값 표(`ValueTable`)가
 * 쓰는 `.rsim-list`·`.rsim-values`·`.rsim-pairs` 등은 `base.ts` 에 남긴다.
 */
export const LEGACY_SIM_CSS = `
/* 시뮬레이션 탭 — 본문은 스크롤하지 않고 SimulationPanel 이 버튼 줄 고정 + 아래 영역 스크롤로 나눈다 */
.rsf-bottom-body[data-tab="sim"] { overflow: hidden; display: flex; flex-direction: column; padding-top: 0; padding-bottom: 0; }
.rsf-sim-slot { min-height: 40px; }
.rsf-bottom-body[data-tab="sim"] > .rsf-sim-slot { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; }

/* 룰 세트 디버거 시뮬레이션 탭(2단계 계획 Task 11 — SimulationPanel·TraceStepper). 색은 의미 토큰만 쓴다. 한 변 색 바는 쓰지 않는다(Local-Rules §8). */
.rsim { display: flex; flex-direction: column; flex: 1 1 0; min-height: 0; min-width: 0; outline: none; }
/* 고정 버튼 줄 — [실행]·[표시 지우기] | 따라가기(처음·이전·다음·끝·진행 막대·상태 문구) */
.rsim-bar {
  flex: none; display: flex; flex-wrap: wrap; align-items: center; gap: var(--spacing-xs) var(--spacing-sm);
  padding: var(--spacing-xs) 0; border-bottom: 1px solid var(--color-border-light);
}
.rsim-bar-run { display: inline-flex; flex-wrap: wrap; align-items: center; gap: var(--spacing-xs); }
.rsim-bar-sep { align-self: stretch; width: 1px; margin: 2px 0; background: var(--color-border); }
.rsim-bar .rsim-stepper { flex: 1 1 420px; min-width: 0; flex-direction: row; flex-wrap: wrap; align-items: center; gap: var(--spacing-xs) var(--spacing-sm); }
.rsim-bar .rsim-stepper-row { flex: 1 1 320px; min-width: 0; }
.rsim-bar .rsim-status { flex: 1 1 200px; min-width: 0; }
/* 스크롤 영역 — 입력 폼 | 실행 결과(오류·값 표·경고) */
.rsim-scroll {
  flex: 1 1 0; min-height: 0; overflow: auto; display: flex; flex-wrap: wrap; gap: var(--spacing-md); align-items: flex-start;
  padding: var(--spacing-xs) 0;
}
.rsim-input { flex: 0 1 380px; min-width: 260px; display: flex; flex-direction: column; gap: var(--spacing-xs); }
.rsim-main { flex: 1 1 420px; min-width: 0; display: flex; flex-direction: column; gap: var(--spacing-xs); }
.rsim-title { margin: 0; font-weight: 600; }
.rsim-row { display: flex; flex-wrap: wrap; align-items: flex-start; gap: var(--spacing-xs) var(--spacing-sm); }
.rsim-fields { list-style: none; margin: 0; padding: 0; }
.rsim-field { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--spacing-xs); padding: 2px 0; border-bottom: 1px solid var(--color-border-light); }
.rsim-field-name { display: inline-flex; flex-wrap: wrap; align-items: center; gap: var(--spacing-xs); min-width: 0; }
.rsim-field-label, .rsim-field-type { font-size: var(--font-size-sm); color: var(--color-text-secondary); }
.rsim-field-edit { display: inline-flex; align-items: center; gap: var(--spacing-xs); }
.rsim-send { display: inline-flex; }
.rsim-evalts { display: inline-flex; flex-wrap: wrap; align-items: flex-start; gap: var(--spacing-xs); }
.rsim-evalts-label { line-height: var(--form-height); font-size: var(--font-size-sm); color: var(--color-text-secondary); }

/* 따라가기 */
.rsim-stepper { display: flex; flex-direction: column; gap: var(--spacing-xs); }
.rsim-stepper-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--spacing-xs); }
.rsim-progress { flex: 1 1 120px; min-width: 100px; }
.rsim-status { margin: 0; font-weight: 600; overflow-wrap: anywhere; }
.rsim-status[data-end="stopped"], .rsim-status[data-end="before"], .rsim-error { color: var(--color-danger); }
.rsim-error { margin: 0; overflow-wrap: anywhere; }
`;

/**
 * 디버그 모드 규칙(3단계 계획 Task 10) — 디버그 툴바·입력 패널·테스트 케이스·변수 패널·실행 비교·값 표 탭.
 * 색은 의미 토큰만 쓴다. 한 변 색 바는 쓰지 않는다(Local-Rules §8) — 상태는 배경 톤·배지·글자 색으로 보인다.
 * 표 줄 강조는 `AgDataGrid` `getRowClassExtra` 클래스(`rsf-var-new`·`rsf-var-changed`·`rsf-cmp-diff`)에 공용 행 상태(grid.css)와 같은 방식으로 배경을 준다.
 */
const DEBUG_MODE_CSS = `
/* 디버그 툴바 — 흐름 툴바 아래 둘째 줄(P-D22) */
.rsf-dbg-toolbar {
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--spacing-xs) var(--spacing-sm);
  padding: var(--spacing-xs) var(--spacing-md); border-bottom: 1px solid var(--color-border-light); background: var(--color-bg-light);
}
.rsf-dbg-buttons { display: inline-flex; flex-wrap: wrap; align-items: center; gap: var(--spacing-xs); }
.rsf-dbg-buttons button svg { margin-right: 2px; }
.rsf-dbg-sep { align-self: stretch; width: 1px; margin: 2px 0; background: var(--color-border); }
.rsf-dbg-status { font-weight: 600; min-width: 0; overflow-wrap: anywhere; }
.rsf-dbg-status[data-end="error"] { color: var(--color-danger); }
.rsf-dbg-status[data-end="done"] { color: var(--color-success); }
.rsf-dbg-notice { font-size: var(--font-size-sm); color: var(--color-warning); overflow-wrap: anywhere; }
.rsf-dbg-notice[data-kind="error"] { color: var(--color-danger); }

/* 왼쪽 입력 패널 — 입력 · JSON · 최근 입력 · 테스트 케이스(위에서 아래로, 패널 안에서 스크롤) */
.rsf-dbg-inputs {
  height: 100%; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: var(--spacing-md);
  padding: var(--spacing-sm) var(--spacing-md);
}
.rsf-dbg-section { display: flex; flex-direction: column; gap: var(--spacing-xs); min-width: 0; }
.rsf-dbg-title { margin: 0; font-weight: 600; }
.rsf-dbg-label { font-size: var(--font-size-sm); color: var(--color-text-secondary); }
.rsf-dbg-evalts, .rsf-dbg-recent { display: flex; flex-direction: column; gap: 2px; }
.rsf-dbg-fields { list-style: none; margin: 0; padding: 0; }
.rsf-dbg-field {
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--spacing-xs);
  padding: 2px 0; border-bottom: 1px solid var(--color-border-light);
}
.rsf-dbg-field-name { display: inline-flex; flex-wrap: wrap; align-items: center; gap: var(--spacing-xs); min-width: 0; }
.rsf-dbg-field-sub { font-size: var(--font-size-sm); color: var(--color-text-secondary); }
.rsf-dbg-field-edit { display: inline-flex; align-items: center; gap: var(--spacing-xs); flex: 1 1 140px; min-width: 0; }
.rsf-dbg-field-edit > :last-child { flex: 1 1 auto; min-width: 0; }
.rsf-dbg-send { display: inline-flex; }
.rsf-dbg-fold { border: 1px solid var(--color-border-light); border-radius: var(--radius-sm); padding: 2px var(--spacing-xs); }
.rsf-dbg-fold > summary { cursor: pointer; font-size: var(--font-size-sm); color: var(--color-text-secondary); padding: 2px 0; }
.rsf-dbg-fold[open] { display: flex; flex-direction: column; gap: var(--spacing-xs); padding-bottom: var(--spacing-xs); }
.rsf-dbg-fold[open] > button { align-self: flex-start; }
.rsf-dbg-error { margin: 0; color: var(--color-danger); overflow-wrap: anywhere; white-space: pre-wrap; }

/* 테스트 케이스 */
.rsf-case-panel { display: flex; flex-direction: column; gap: var(--spacing-xs); min-width: 0; border-top: 1px solid var(--color-border-light); padding-top: var(--spacing-sm); }
.rsf-case-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: var(--spacing-xs); }
.rsf-case-summary { font-size: var(--font-size-sm); }
.rsf-case-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--spacing-xs); }
.rsf-case-confirm { display: inline-flex; flex-wrap: wrap; align-items: center; gap: var(--spacing-xs); font-size: var(--font-size-sm); color: var(--color-danger); }
.rsf-case-grid, .rsf-case-diff { min-width: 0; }
.rsf-case-diff .rsim-list { color: var(--color-danger); }

/* 오른쪽 변수 패널 — 조사식 · 변수 표 · 노드 상세 · 식 평가 */
.rsf-var-panel { display: flex; flex-direction: column; gap: var(--spacing-md); padding: var(--spacing-sm) var(--spacing-md); min-width: 0; }
.rsf-var-section { display: flex; flex-direction: column; gap: var(--spacing-xs); min-width: 0; }
.rsf-var-section > .rsf-panel { padding: 0; }
.rsf-var-watches { list-style: none; margin: 0; padding: 0; }
.rsf-var-watch {
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--spacing-xs);
  padding: 2px 0; border-bottom: 1px solid var(--color-border-light);
}
.rsf-var-watch[data-missing="true"] code { color: var(--color-text-muted); text-decoration: line-through; }
.rsf-var-watch-value { flex: 1 1 auto; min-width: 0; text-align: right; overflow-wrap: anywhere; font-family: var(--font-family-mono); }
.rsf-var-grid .ag-row.rsf-var-changed { background-color: var(--color-warning-soft); }
.rsf-var-grid .ag-row.rsf-var-new { background-color: var(--color-primary-soft); }
.rsf-var-grid [col-id="pin"] { cursor: pointer; }
.rsf-expr-result { margin: 0; font-weight: 600; overflow-wrap: anywhere; }
.rsf-expr-result[data-kind="true"] { color: var(--color-success); }
.rsf-expr-result[data-kind="error"], .rsf-expr-result[data-kind="fallback"] { color: var(--color-danger); }
.rsf-expr-recent { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--spacing-xs); }
.rsf-expr-recent button { font-family: var(--font-family-mono); max-width: 100%; overflow: hidden; text-overflow: ellipsis; }

/* 아래 패널 — 값 표 · 실행 비교 */
.rsf-values-tab, .rsf-run-compare { display: flex; flex-direction: column; gap: var(--spacing-xs); min-width: 0; }
.rsf-run-compare .ag-row.rsf-cmp-diff { background-color: var(--color-warning-soft); }
.rsf-cmp-path { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.rsf-cmp-path code { overflow-wrap: anywhere; }
`;

export const DEBUG_CSS = [LEGACY_SIM_CSS, DEBUG_MODE_CSS].join("\n");
