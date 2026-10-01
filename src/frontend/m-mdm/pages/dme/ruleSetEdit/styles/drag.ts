/** 끌어 놓기·옮기기·룰 목록·조건식 즉석 편집 스타일(3단계 계획 Task 7). 색은 의미 토큰만 쓴다. 한 변 색 바는 쓰지 않는다(Local-Rules §8). */
export const DRAG_CSS = `
/* 끄는 동안 놓일 선(A1·A2) */
.rsf-edge-drop { stroke: var(--color-primary); stroke-width: 4; }
.rsf-drop-mark {
  display: inline-block; padding: 1px var(--spacing-sm); border-radius: var(--radius-sm); border: 1px solid var(--color-primary);
  background: var(--color-primary); color: var(--color-bg); font-size: var(--font-size-sm); white-space: nowrap;
}

/* 조건식 즉석 편집(B10) */
.rsf-cond-label { pointer-events: auto; cursor: text; }
.rsf-cond-input {
  pointer-events: auto; width: 180px; padding: 2px var(--spacing-xs); font-size: var(--font-size-sm); color: var(--color-text);
  background: var(--color-bg); border: 1px solid var(--color-primary); border-radius: var(--radius-sm); outline: none;
}

/* 룰 목록(A4) */
.rsf-rule-list-search { display: flex; gap: var(--spacing-xs); padding: var(--spacing-xs) var(--spacing-sm); }
.rsf-rule-list-empty { margin: 0; padding: var(--spacing-xs) var(--spacing-sm); color: var(--color-text-muted); font-size: var(--font-size-sm); }
.rsf-rule-rows { list-style: none; margin: 0; padding: 0 var(--spacing-sm) var(--spacing-sm); overflow-y: auto; }
.rsf-rule-row {
  display: grid; grid-template-columns: 1fr auto auto; gap: 0 var(--spacing-xs); padding: 4px var(--spacing-sm); margin-bottom: 2px;
  background: var(--color-bg); border: 1px solid var(--color-border-light); border-radius: var(--radius-sm); color: var(--color-text); user-select: none;
}
.rsf-rule-row[draggable="true"] { cursor: grab; }
.rsf-rule-row:hover { background: var(--color-bg-hover); }
.rsf-rule-row-id { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: var(--font-size-sm); overflow: hidden; text-overflow: ellipsis; }
.rsf-rule-row-name { grid-column: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--font-size-sm); color: var(--color-text-muted); }
.rsf-rule-used { grid-row: 2; grid-column: 2; justify-self: end; }
.rsf-rule-row-kind { grid-row: 1; grid-column: 2; font-size: var(--font-size-sm); color: var(--color-text-muted); }
.rsf-rule-assign { grid-row: 1 / span 2; grid-column: 3; align-self: center; }
`;
