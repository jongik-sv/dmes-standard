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
/* 툴바 아이콘 단추(흐름 툴바·디버그 툴바의 ToolButton) — 단추를 감싼 span 이 단추 아래로 바로 뜨는 툴팁을 그린다.
   단추 루트(Mantine Button)가 overflow:hidden 이라 단추 안(::after)에서 그리면 잘린다. 꺼진 단추도 :hover 가 래퍼에 닿아 뜬다. 도움말이 열려 있으면 숨긴다.
   data-tip-align="end" 는 툴팁 오른쪽 끝을 단추 오른쪽 끝에 맞춘다(툴바 오른쪽 끝 단추의 긴 툴팁이 화면 밖으로 나가지 않게). */
.rsf-tip { position: relative; display: inline-flex; }
/* 툴바 아이콘 단추 크기 — 26x26 정사각형, 아이콘 14px(흐름 툴바·디버그 툴바·찾기 위젯 공통). Mantine 이 크기 변수를 단추 style 에 쓰므로 속성을 직접 덮는다. */
.rsf-tip > .rsf-tool-btn { width: 26px; min-width: 26px; height: 26px; min-height: 26px; padding: 0; }
.rsf-tip:hover::after, .rsf-tip:focus-within::after {
  content: attr(data-tip); position: absolute; top: calc(100% + 6px); left: 50%; transform: translateX(-50%); z-index: 10;
  padding: 2px var(--spacing-sm); white-space: nowrap; pointer-events: none; font-size: var(--font-size-sm); font-weight: normal;
  color: var(--color-text); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-sm);
  box-shadow: var(--shadow-dropdown);
}
.rsf-tip[data-tip-off]::after { display: none; }
.rsf-tip[data-tip-align="end"]:hover::after, .rsf-tip[data-tip-align="end"]:focus-within::after { left: auto; right: 0; transform: none; }
`;
