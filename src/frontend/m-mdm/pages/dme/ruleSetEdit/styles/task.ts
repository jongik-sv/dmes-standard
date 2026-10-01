/** 빈 단계 노드(4단계 T1) — 점선 테두리, 제목 고치기 칸, 룰 줄을 놓을 노드 강조. 색은 의미 토큰만 쓴다(한 변 색 바 금지). */
export const TASK_CSS = `
.rsf-node.rsf-task { border-style: dashed; padding: 6px 10px; }
.rsf-task-input {
  width: 100%; box-sizing: border-box; padding: 1px var(--spacing-xs); font: inherit; font-weight: 600; color: var(--color-text);
  background: var(--color-bg); border: 1px solid var(--color-primary); border-radius: var(--radius-sm); outline: none;
}
.rsf-node.rsf-node-drop { outline: 2px solid var(--color-primary); outline-offset: 2px; background: var(--color-primary-soft); }
`;
