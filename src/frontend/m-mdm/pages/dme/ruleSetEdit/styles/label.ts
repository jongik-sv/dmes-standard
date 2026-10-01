/**
 * 선 이름표 옮기기(3단계 추가 Task L1) — 편집 모드의 조건 라벨·변수 칩 묶음을 끌 수 있게 누름을 받게 한다.
 * 이름표 층(`.rsf-elabel`)은 pointer-events: none 이라 끌 수 있는 것만 다시 켠다. 색은 의미 토큰만 쓴다(Local-Rules §8).
 */
export const LABEL_CSS = `
.rsf-canvas[data-mode="edit"] .rsf-elabel-drag { pointer-events: auto; cursor: grab; user-select: none; -webkit-user-select: none; touch-action: none; }
.rsf-canvas[data-mode="edit"] .rsf-elabel-drag[data-dragging="true"] { cursor: grabbing; }
.rsf-canvas[data-mode="edit"] .rsf-vchips.rsf-elabel-drag[data-dragging="true"] .rsf-vchip { border-color: var(--color-primary); }
.rsf-canvas[data-mode="edit"] .rsf-branch.rsf-elabel-drag[data-dragging="true"] { border-color: var(--color-primary); }

/* 일반 선 라벨(Task 9) — 분기 갈래 칩과 구별되게 테두리 없는 작은 글자 + 캔버스 배경 바탕. 한 줄 최대 160px 에서 말줄임(전체는 title). */
.rsf-edge-text {
  display: inline-block; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: middle;
  font-size: var(--font-size-xs); line-height: 16px; padding: 0 4px; border-radius: var(--radius-sm);
  background: var(--rsf-canvas-bg); color: var(--color-text-secondary);
}
.rsf-edge-text[data-state="chosen"] { color: var(--color-success); }
.rsf-edge-text[data-state="dim"] { opacity: 0.35; }
.rsf-edge-text-edit { pointer-events: auto; cursor: text; }
.rsf-canvas[data-mode="edit"] .rsf-edge-text.rsf-elabel-drag { cursor: grab; }
`;
