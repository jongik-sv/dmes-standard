/**
 * 블록 접기·중단점 점·디버그 노드 상태 모양·변수 칩 툴팁(3단계 계획 Task 11). 색은 의미 토큰만, 한 변 색 바는 쓰지 않는다(Local-Rules §8).
 * 상태 클래스는 base 의 data-state 규칙과 같은 우선순위이고 이 파일이 뒤에 붙어 이긴다.
 */
export const COLLAPSE_CSS = `
/* 접힌 분기 블록 */
.rsf-block { padding: 6px 10px; display: flex; align-items: center; justify-content: center; border-style: dashed; border-width: 1.5px; }
.rsf-collapsed-wrap { display: flex; flex-direction: column; align-items: center; gap: 3px; min-width: 0; }
.rsf-collapsed {
  font-size: var(--font-size-md); font-weight: 600; color: var(--color-text); white-space: nowrap;
  padding: 2px 10px; border: 1.5px solid var(--rsf-border); border-radius: var(--radius-sm);
}
.rsf-collapsed[data-error="true"] { border-color: var(--color-danger); background: var(--color-danger-soft); color: var(--color-danger); }
.rsf-collapsed-ran { font-size: var(--font-size-xs); color: var(--color-text-muted); white-space: nowrap; }
.rsf-block:has(.rsf-collapsed[data-error="true"]) { border-color: var(--color-danger); }

/* 중단점 점 — 왼쪽 가장자리 가운데 */
.rsf-bp {
  position: absolute; left: -7px; top: 50%; transform: translateY(-50%); z-index: 3;
  width: 12px; height: 12px; padding: 0; box-sizing: border-box; border-radius: 50%;
  border: 1.5px solid var(--color-text-muted); background: var(--rsf-node-bg); cursor: pointer;
  opacity: 0.55; transition: opacity 0.12s, background 0.12s;
}
.rsf-bp:hover { opacity: 1; border-color: var(--color-danger); }
.rsf-bp[data-on="true"] { background: var(--color-danger); border-color: var(--color-danger); opacity: 1; }
.rsf-bp-static { width: 8px; height: 8px; left: -4px; cursor: default; pointer-events: none; }

/* 디버그 겹침 모양 — 지금(굵은 테두리) · 다음(점선) · 남은 것(회색) */
.rsf-node.rsf-node-current { border-color: var(--color-primary); border-width: 3px; box-shadow: 0 0 0 4px var(--rsf-ring); }
.rsf-node.rsf-node-next { border-style: dashed; border-color: var(--color-primary); border-width: 1.5px; }
.rsf-node.rsf-node-pending { border-color: var(--rsf-border); background: var(--color-bg-light); color: var(--color-text-muted); opacity: 0.6; }

/* 변수 칩 — 값 툴팁이 있는 칩은 물음표 커서 없이 살짝 밑줄로 알린다 */
.rsf-vchip[title] { cursor: help; }
`;
