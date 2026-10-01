/**
 * 받는 노드(받는 노드 spec §8) — 룰 아래 테두리에 걸친 작은 원(번개), 룰 노드 오른쪽 아래 "예외" 연결점. 색은 의미 토큰만, 한 변 색 바 없음(Local-Rules §8).
 * 받는 노드에서 나가는 선의 빨간 점선은 선 그리기(FlowCanvas 의 선 style)가 정한다. 디버거 상태(caught)는 Task 10 이 이 파일에 덧붙인다.
 */
export const CATCH_CSS = `
.rsf-node.rsf-catch {
  width: 28px; height: 28px; min-width: 0; padding: 0; border-radius: 50%; border: 2px solid var(--color-danger);
  background: var(--color-bg); color: var(--color-danger); display: flex; align-items: center; justify-content: center;
}
.rsf-node.rsf-catch .rsf-catch-icon { display: flex; }
.rsf-canvas .react-flow__handle.rsf-catch-link {
  width: 14px; height: 14px; min-width: 0; min-height: 0; z-index: 6; opacity: 0; cursor: crosshair; border-radius: 50%;
  display: flex; align-items: center; justify-content: center; left: auto; right: 6px; transform: translateY(50%);
  background: var(--color-bg); border: 2px solid var(--color-danger); color: var(--color-danger); transition: opacity 0.12s;
}
.rsf-canvas[data-mode="edit"] .react-flow__node:hover .rsf-catch-link,
.rsf-canvas .react-flow__handle.rsf-catch-link.connectingfrom { opacity: 1; }
.rsf-canvas .react-flow__handle.rsf-catch-link:hover { background: var(--color-danger); color: var(--color-bg); }
`;
