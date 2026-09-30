/**
 * 맞춤 안내선(추가 Task G1) — 노드·메모를 끄는 동안 붙은 축마다 맞은 상자와 끄는 상자를 잇는 실선. 색은 의미 토큰만 쓴다(Local-Rules §8).
 * 자리·길이·굵기(화면 1px = 1/zoom)는 흐름 좌표 층 안이라 캔버스가 인라인으로 준다.
 */
export const SNAP_CSS = `
.rsf-snap-guide { position: absolute; pointer-events: none; border: 0 solid var(--color-primary); }
.rsf-snap-guide[data-axis="x"] { width: 0; border-left-style: solid; }
.rsf-snap-guide[data-axis="y"] { height: 0; border-top-style: solid; }
`;
