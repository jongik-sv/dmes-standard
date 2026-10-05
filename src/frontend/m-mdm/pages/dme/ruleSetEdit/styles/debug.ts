/**
 * 디버그 모드 규칙(3단계 계획 Task 10) — 디버그 툴바·입력 패널·테스트 케이스·변수 패널·실행 비교·값 표 탭. 노드 상세(`TraceDetail`)·값 표(`ValueTable`)가 쓰는 `.rsim-list`·`.rsim-values`·`.rsim-pairs` 등은 `base.ts` 에 있다.
 * 색은 의미 토큰만 쓴다. 한 변 색 바는 쓰지 않는다(Local-Rules §8) — 상태는 배경 톤·배지·글자 색으로 보인다.
 * 표 줄 강조는 `AgDataGrid` `getRowClassExtra` 클래스(`rsf-var-new`·`rsf-var-changed`·`rsf-var-pending`·`rsf-cmp-diff`)에 공용 행 상태(grid.css)와 같은 방식으로 배경을 준다.
 */
const DEBUG_MODE_CSS = `
/* 디버그 툴바 — 흐름 툴바 아래 둘째 줄(P-D22) */
.rsf-dbg-toolbar {
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--spacing-xs) var(--spacing-sm);
  padding: var(--spacing-xs) var(--spacing-md); border-bottom: 1px solid var(--color-border-light); background: var(--color-bg-light);
}
.rsf-dbg-buttons { display: inline-flex; flex-wrap: wrap; align-items: center; gap: var(--spacing-xs); }
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
.rsf-var-grid .ag-row.rsf-var-pending { background-color: var(--color-edited); }
.rsf-var-grid [col-id="pin"] { cursor: pointer; }
.rsf-var-grid [col-id="act"] button { padding: 0 4px; }
.rsf-var-add { display: flex; flex-wrap: wrap; align-items: center; gap: var(--spacing-xs); min-width: 0; }
.rsf-var-add > * { min-width: 0; }
.rsf-var-edit-error { margin: 0; font-size: var(--font-size-sm); color: var(--color-danger); overflow-wrap: anywhere; }

/* 값 고친 지점(4단계 E4) — 노드 오른쪽 아래 작은 원. 한 변 색 바가 아니다(Local-Rules §8). title 이 뜨도록 누름을 받는다 */
.rsf-edited {
  position: absolute; right: -8px; bottom: -8px; width: 16px; height: 16px; box-sizing: border-box; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center; z-index: 2; pointer-events: auto;
  background: var(--color-warning); color: var(--color-on-primary); border: 2px solid var(--rsf-node-bg);
}
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

/* 하위 세트(하위 세트 spec §10.4·§11) — 확정 안 한 하위 세트 경고 줄, 들어간 프레임의 경로 표시 줄(캔버스 위, 본문을 세로로 쌓는다) */
.rsf-dbg-subset-warn { display: flex; flex-direction: column; gap: 2px; padding: var(--spacing-xs) var(--spacing-md); border-bottom: 1px solid var(--color-border-light); background: var(--color-warning-soft); }
.rsf-dbg-subset-warn p { margin: 0; font-size: var(--font-size-sm); color: var(--color-text-secondary); overflow-wrap: anywhere; }
.rsf-body[data-frame] { flex-direction: column; }
.rsf-body[data-frame] .rsf-bp { display: none; } /* 하위 프레임은 중단점을 쓰지 않는다(Ruling 21) */
.rsf-callpath { display: flex; flex-wrap: wrap; align-items: center; gap: var(--spacing-xs); padding: var(--spacing-xs) var(--spacing-md); border-bottom: 1px solid var(--color-border-light); background: var(--color-bg); font-size: var(--font-size-sm); min-width: 0; }
.rsf-callpath-crumbs { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 4px; min-width: 0; overflow-wrap: anywhere; }
.rsf-callpath-sep { color: var(--color-text-muted); }
.rsf-callpath-link { padding: 0; border: 0; background: none; color: var(--color-primary); font: inherit; cursor: pointer; text-decoration: underline; }
.rsf-callpath-step { margin-left: auto; display: inline-flex; align-items: center; gap: 4px; }
.rsf-callpath-step button { min-width: 24px; padding: 0 4px; border: 1px solid var(--color-border-light); border-radius: var(--radius-sm); background: var(--color-bg); color: inherit; font: inherit; cursor: pointer; }
.rsf-callpath-step button:disabled { color: var(--color-text-muted); cursor: default; }
`;

export const DEBUG_CSS = DEBUG_MODE_CSS;
