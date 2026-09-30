/**
 * 공간 넓히기(S1) — [공간] 토글이 켜진 캔버스의 빈 곳 커서와 끄는 동안의 기준선(점선). 색은 의미 토큰만 쓴다.
 * 기준선 굵기는 확대 배율에 맞춰 캔버스가 인라인으로 준다(흐름 좌표 층 안이라 배율에 따라 굵어지거나 가늘어지지 않게).
 */
export const SPACE_CSS = `
.rsf-canvas[data-space-tool="true"] .react-flow__pane { cursor: crosshair; }
.rsf-space-guide { position: absolute; pointer-events: none; border: 0 dashed var(--color-primary); }
.rsf-space-guide[data-axis="x"] { top: -100000px; height: 200000px; width: 0; border-left-style: dashed; }
.rsf-space-guide[data-axis="y"] { left: -100000px; width: 200000px; height: 0; border-top-style: dashed; }
`;
