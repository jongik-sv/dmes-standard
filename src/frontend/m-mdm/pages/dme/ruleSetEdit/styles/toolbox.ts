/**
 * 떠 있는 도구 상자(4단계 계획 Task 7, 스펙 §1.3) — 캔버스 안 왼쪽 위 세로 막대, 아이콘 단추 36px, 오른쪽으로 뜨는 CSS 툴팁(`data-tip`).
 * 색은 의미 토큰만 쓴다. 고른 도구는 전체 테두리·배경 톤으로 보인다(한 변 색 바 금지, Local-Rules §8).
 */
export const TOOLBOX_CSS = `
.rsf-toolbox {
  position: absolute; top: 12px; left: 12px; z-index: 5;
  display: flex; flex-direction: column; gap: 2px; padding: 4px;
  background: var(--color-bg); border: 1px solid var(--color-border-light); border-radius: var(--radius-md);
  box-shadow: var(--shadow-dropdown);
}
.rsf-toolbox-group, .rsf-palette { display: flex; flex-direction: column; gap: 2px; }
.rsf-toolbox-sep { height: 1px; margin: 2px 4px; background: var(--color-border-light); }
.rsf-tool {
  position: relative; display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; padding: 0;
  border: 1px solid transparent; border-radius: var(--radius-sm); background: none; color: var(--color-text-secondary); cursor: pointer;
}
.rsf-tool:hover:not(:disabled) { background: var(--color-bg-hover); color: var(--color-text); }
.rsf-tool[aria-pressed="true"] { background: var(--color-primary-soft); border-color: var(--color-primary); color: var(--color-primary); }
.rsf-tool:disabled { opacity: 0.4; cursor: default; }
.rsf-tool:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 1px; }
.rsf-palette .rsf-tool[draggable="true"] { cursor: grab; }
.rsf-tool[data-tip]:hover::after, .rsf-tool[data-tip]:focus-visible::after {
  content: attr(data-tip); position: absolute; left: calc(100% + 8px); top: 50%; transform: translateY(-50%); z-index: 1;
  padding: 2px var(--spacing-sm); white-space: nowrap; pointer-events: none; font-size: var(--font-size-sm);
  color: var(--color-text); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-sm);
  box-shadow: var(--shadow-dropdown);
}
/* 툴바 아이콘 단추(되돌리기·다시 하기·도움말) — 단추 아래로 바로 뜨는 툴팁. 꺼진 단추도 pointer-events 가 살아 있어 뜬다. 도움말이 열려 있으면 숨긴다. */
.rsf-toolbar [data-tip] { position: relative; }
.rsf-toolbar [data-tip]:hover::after, .rsf-toolbar [data-tip]:focus-visible::after {
  content: attr(data-tip); position: absolute; top: calc(100% + 6px); left: 50%; transform: translateX(-50%); z-index: 10;
  padding: 2px var(--spacing-sm); white-space: nowrap; pointer-events: none; font-size: var(--font-size-sm); font-weight: normal;
  color: var(--color-text); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-sm);
  box-shadow: var(--shadow-dropdown);
}
.rsf-toolbar [data-tip][aria-expanded="true"]::after { display: none; }
`;
