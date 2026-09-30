/**
 * 선 경로 편집 손잡이(3단계 계획 Task 15, C14). 색은 의미 토큰만 쓴다. 한 변 색 바는 쓰지 않는다(Local-Rules §8).
 * 손잡이는 선 이름표 층(`.rsf-elabel`, pointer-events: none) 위에 놓이므로 손잡이만 눌림을 받게 한다.
 */
export const ROUTE_CSS = `
.rsf-route-handle {
  display: block; box-sizing: border-box; width: 12px; height: 12px; border-radius: 50%; pointer-events: all; cursor: grab; touch-action: none;
  background: var(--color-bg); border: 2px solid var(--color-primary);
}
.rsf-route-handle:hover { background: var(--color-primary-soft); }
.rsf-route-handle[data-selected="true"] { background: var(--color-primary); }
.rsf-route-handle[data-dragging="true"] { cursor: grabbing; }
`;
