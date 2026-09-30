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

/* 선 끝 손잡이(R1) — React Flow 가 고른 선의 양 끝에 그리는 원(기본은 투명). 노드 바깥쪽에 놓이고 선 이름표 층 아래라 꺾는 점 손잡이가 겹치면 그쪽이 눌린다. */
.rsf-canvas .react-flow__edgeupdater { fill: var(--color-primary-soft); fill-opacity: 0.7; stroke: var(--color-primary); stroke-width: 2; cursor: crosshair; }
.rsf-canvas .react-flow__edgeupdater:hover { fill-opacity: 1; }
`;
