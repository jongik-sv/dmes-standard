/**
 * 받는 노드(받는 노드 spec §8) — 룰 아래 테두리에 걸친 작은 원(번개), 룰 노드 오른쪽 아래 "예외" 연결점. 색은 의미 토큰만, 한 변 색 바 없음(Local-Rules §8).
 * 받는 노드에서 나가는 선의 빨간 점선은 선 그리기(FlowCanvas 의 선 style)가 정한다.
 * 디버거(받는 노드 spec §9): 받는 노드로 넘긴 룰(`data-state="caught"`)은 주황 점선 테두리·주황 칩. 상태 규칙은 base 의 `data-state` 규칙과 같은
 * 우선순위이고 이 파일이 뒤에 붙어 이긴다. 툴바 [받은 예외 N건] 목록은 단추 아래에 뜬다.
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
.rsf-node[data-state="caught"] { border-color: var(--color-warning); border-style: dashed; border-width: 2px; }
.rsf-node[data-state="caught"] .rsf-seq { background: var(--color-warning); }
.rsf-node[data-state="caught"] .rsf-chip { background: var(--color-warning-soft); color: var(--color-warning); border-color: var(--color-warning); }
.rsf-dbg-caught { position: relative; }
.rsf-dbg-caught-list { position: absolute; top: 100%; left: 0; z-index: 20; min-width: 320px; margin: var(--spacing-xs) 0 0; padding: var(--spacing-xs);
  list-style: none; background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-sm); }
.rsf-dbg-caught-list li { padding: 2px var(--spacing-xs); }
`;
