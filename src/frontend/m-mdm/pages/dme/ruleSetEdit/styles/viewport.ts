/**
 * 화면 밖 안내(`ViewportGuard`) — 화면에 걸친 노드가 하나도 없을 때 캔버스 가운데에 뜨는 상자.
 * 바깥 틀은 포인터를 통과시켜(빈 곳 끌기·휠 그대로) 상자만 누를 수 있다. 색은 의미 토큰만 쓴다(Local-Rules §8).
 */
export const VIEWPORT_CSS = `
.rsf-lost {
  position: absolute; inset: 0; z-index: 5; display: flex; align-items: center; justify-content: center; pointer-events: none;
}
.rsf-lost-card {
  pointer-events: auto; display: flex; flex-direction: column; align-items: center; gap: var(--spacing-sm);
  padding: var(--spacing-md) var(--spacing-lg); font-size: var(--font-size-sm); color: var(--color-text-secondary);
  background: var(--color-bg); border: 1px solid var(--color-border-light); border-radius: var(--radius-md); box-shadow: var(--shadow-dropdown);
}
.rsf-lost-btn {
  display: inline-flex; align-items: center; gap: var(--spacing-xs); padding: 4px var(--spacing-md); cursor: pointer;
  font: inherit; color: var(--color-primary); background: var(--color-primary-soft); border: 1px solid var(--color-primary); border-radius: var(--radius-sm);
}
.rsf-lost-btn:hover { filter: brightness(0.97); }
.rsf-lost-btn:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 1px; }
.rsf-lost-btn kbd { font: inherit; font-size: var(--font-size-xs); color: var(--color-text-secondary); }
`;
