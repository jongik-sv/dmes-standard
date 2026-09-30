/**
 * 선 이름표 옮기기(3단계 추가 Task L1) — 편집 모드의 조건 라벨·변수 칩 묶음을 끌 수 있게 누름을 받게 한다.
 * 이름표 층(`.rsf-elabel`)은 pointer-events: none 이라 끌 수 있는 것만 다시 켠다. 색은 의미 토큰만 쓴다(Local-Rules §8).
 */
export const LABEL_CSS = `
.rsf-canvas[data-mode="edit"] .rsf-elabel-drag { pointer-events: auto; cursor: grab; user-select: none; -webkit-user-select: none; touch-action: none; }
.rsf-canvas[data-mode="edit"] .rsf-elabel-drag[data-dragging="true"] { cursor: grabbing; }
.rsf-canvas[data-mode="edit"] .rsf-vchips.rsf-elabel-drag[data-dragging="true"] .rsf-vchip { border-color: var(--color-primary); }
.rsf-canvas[data-mode="edit"] .rsf-branch.rsf-elabel-drag[data-dragging="true"] { border-color: var(--color-primary); }
`;
