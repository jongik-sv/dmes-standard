/**
 * 연결점(추가 Task C1, Ruling 28) — 그리기 연결점 · 네 변 잇기 손잡이 · 몸통 받기. 색은 의미 토큰만 쓴다. 한 변 색 바는 쓰지 않는다(Local-Rules §8).
 * 누름 받기는 React Flow 기본 규칙을 따른다 — `.react-flow__handle` 은 누름을 받지 않고, 연결을 시작할 수 있거나(평소) 놓을 수 있는(연결 중) 손잡이에만
 * `connectionindicator` 가 붙어 받는다. 몸통 받기는 연결 시작이 꺼져 있어 평소에는 누름이 노드(끌기·누르기·우클릭)로 가고 연결 중에만 받는다.
 * React Flow 가 `position` 으로 붙이는 `react-flow__handle-{변}`(left:50%·transform 등)보다 이기도록 `.rsf-canvas .react-flow__handle.…` 로 쓴다.
 */
export const CONNECT_CSS = `
/* 그리기 연결점(in 위 가운데 · out 아래 가운데) — 선 끝 자리만 정한다. 보이지 않고 누름을 받지 않는다(크기는 2단계와 같아 선 끝 자리가 그대로다). */
.rsf-canvas .react-flow__handle.rsf-anchor {
  width: 8px; height: 8px; min-width: 0; min-height: 0; border: 1px solid transparent; background: transparent; opacity: 0; pointer-events: none;
}

/* 네 변 잇기 손잡이 — 편집 모드에서 노드에 마우스를 올리면 보인다. 몸통 받기보다 위. */
.rsf-canvas .react-flow__handle.rsf-link {
  width: 10px; height: 10px; min-width: 0; min-height: 0; z-index: 6; opacity: 0; cursor: crosshair;
  background: var(--color-bg); border: 2px solid var(--color-primary); transition: opacity 0.12s;
}
.rsf-canvas[data-mode="edit"] .react-flow__node:hover .rsf-link,
.rsf-canvas .react-flow__handle.rsf-link.connectingfrom { opacity: 1; }
.rsf-canvas .react-flow__handle.rsf-link:hover { background: var(--color-primary); }

/* 몸통 받기 — 노드 전체를 덮는 투명 상자. 연결 중에만 누름을 받고 노드 안 단추·표시보다 위다. 놓을 수 있는 노드 위에 오면 바깥 테두리로 알린다(놓을 수 없는 곳 — 자기 자신·START — 은 표시 없음). */
.rsf-canvas .react-flow__handle.rsf-drop {
  top: 0; left: 0; right: auto; bottom: auto; width: 100%; height: 100%; min-width: 0; min-height: 0; transform: none;
  border: 0; border-radius: inherit; background: transparent; pointer-events: none; z-index: 5;
}
.rsf-canvas .react-flow__handle.rsf-drop.connectionindicator { pointer-events: all; cursor: crosshair; }
.rsf-canvas .react-flow__handle.rsf-drop.connectingto.valid { outline: 2px solid var(--color-primary); outline-offset: 3px; }
`;
