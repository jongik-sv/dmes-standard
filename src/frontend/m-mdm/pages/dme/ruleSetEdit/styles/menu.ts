/**
 * 우클릭·[+] 메뉴·찾기 위젯·단축키 도움말 스타일(3단계 계획 P4). Task 0 이 메뉴 틀(`ContextMenu`)과 선 [+] 단추 규칙을 두고, Task 8 이 찾기·도움말을 더한다.
 * 찾기는 2026-10-01 툴바 칸에서 캔버스 오른쪽 위 찾기 위젯(`canvas/FindWidget`)으로 옮겼다.
 * 색은 의미 토큰만 쓴다. 한 변 색 바는 쓰지 않는다(Local-Rules §8).
 */
import { NODE_COLORS } from "../node-style";

/** 색상 견본 — 채움 = 그 색의 연한 노드 채움, 테두리 = 진한 노드 테두리(캔버스와 같은 :root 토큰). 기본은 중립색. */
const SWATCH_RULES = NODE_COLORS.filter((c) => c !== "default")
  .map((c) => `.rsf-menu-swatch[data-color="${c}"] { background: var(--rsf-c-${c}-bg); border-color: var(--rsf-c-${c}-border); }`)
  .join("\n");

export const MENU_CSS = `
/* 우클릭·[+] 메뉴 — 떠 있는 레이어 하나 */
.rsf-menu {
  position: fixed; z-index: 400; min-width: 160px; max-width: 320px; padding: 4px 0;
  display: flex; flex-direction: column;
  background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-md); box-shadow: var(--shadow-dropdown);
}
.rsf-menu-item {
  display: block; width: 100%; padding: 4px var(--spacing-md); text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  background: none; border: none; color: var(--color-text); font: inherit; cursor: pointer;
}
.rsf-menu-item:hover:not(:disabled), .rsf-menu-item:focus-visible { background: var(--color-bg-hover); outline: none; }
.rsf-menu-item:disabled { color: var(--color-text-muted); cursor: default; }
.rsf-menu-item[data-danger="true"]:not(:disabled) { color: var(--color-danger); }
.rsf-menu-item-nested { padding-left: calc(var(--spacing-md) * 2); }
.rsf-menu-item-icon { display: flex; align-items: center; gap: var(--spacing-xs); }
.rsf-menu-group { display: flex; flex-direction: column; }
/* 색상 견본 격자 — 3열 × 2줄, 고른 칸은 견본 둘레에 회색(--color-border-light) 칸 + 진한 가장자리(한 변 색 바 아님, Local-Rules §8) */
.rsf-menu-swatches { display: grid; grid-template-columns: repeat(3, 28px); gap: 8px; padding: 8px var(--spacing-md); }
.rsf-menu-swatch {
  box-sizing: border-box; width: 28px; height: 28px; margin: 0; padding: 0; cursor: pointer;
  background: var(--color-bg); border: 2px solid var(--color-border-strong); border-radius: var(--radius-md);
}
${SWATCH_RULES}
.rsf-menu-swatch:hover, .rsf-menu-swatch:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 1px; }
.rsf-menu-swatch[aria-pressed="true"] { box-shadow: 0 0 0 4px var(--color-border-light), 0 0 0 5px var(--color-border-strong); }
.rsf-menu-group-title { padding: 4px var(--spacing-md); font-size: var(--font-size-sm); color: var(--color-text-secondary); }

/* 선 [+] 단추 — 선 이름표 층(pointer-events: none) 위에서 누를 수 있게 한다. 보일 때 늘 변수 칩(z-index 1)·라벨보다 위다(U1). */
.rsf-edge-add {
  position: absolute; z-index: 2; pointer-events: all; display: inline-flex; align-items: center; justify-content: center;
  width: 18px; height: 18px; padding: 0; border-radius: 50%; cursor: pointer;
  background: var(--color-bg); border: 1px solid var(--color-border-strong); color: var(--color-text-secondary);
}
.rsf-edge-add:hover { border-color: var(--color-primary); color: var(--color-primary); }

/* 찾기 위젯(VS Code 방식) — 캔버스 감싸개 안 오른쪽 위에 떠 있는 작은 상자. React Flow 패널(z-index 5)·도구 상자보다 위라 단추 툴팁이 미니맵 위로 뜬다. */
.rsf-find-widget {
  position: absolute; top: 8px; right: 15px; z-index: 6;
  display: flex; align-items: center; gap: 2px; padding: 4px;
  background: var(--color-bg); border: 1px solid var(--color-border-light); border-radius: var(--radius-md);
  box-shadow: var(--shadow-dropdown);
}
.rsf-find-field { position: relative; display: flex; align-items: center; }
.rsf-find-widget .rsf-find-input { width: 240px; height: 26px; min-height: 26px; padding-right: 70px; font-size: var(--font-size-sm); }
.rsf-find-opts { position: absolute; top: 50%; right: 3px; transform: translateY(-50%); display: flex; gap: 1px; }
.rsf-find-opt {
  display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; padding: 0;
  border: 1px solid transparent; border-radius: var(--radius-sm); background: none; color: var(--color-text-secondary);
  font: inherit; font-size: var(--font-size-xs); font-weight: 600; line-height: 1; cursor: pointer;
}
.rsf-find-opt:hover { background: var(--color-bg-hover); color: var(--color-text); }
.rsf-find-opt[aria-pressed="true"] { background: var(--color-primary-soft); border-color: var(--color-primary); color: var(--color-primary); }
.rsf-find-opt:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 1px; }
.rsf-find-opt[data-opt="wholeWord"] > span { text-decoration: underline; text-underline-offset: 2px; }
.rsf-find-count { min-width: 64px; padding: 0 var(--spacing-xs); font-size: var(--font-size-sm); color: var(--color-text-secondary); white-space: nowrap; }
.rsf-find-count[data-empty] { color: var(--color-danger); }
.rsf-find-widget .rsf-tool-btn { border-color: transparent; background: none; }
.rsf-find-widget .rsf-tool-btn:hover:not(:disabled) { background: var(--color-bg-hover); border-color: transparent; }
/* 위젯이 열려 있는 동안 오른쪽 위 미니맵을 위젯 아래로 내린다(위젯 top 8 + 높이 36 + 간격 8). */
.rsf-canvas-host[data-find-open] .react-flow__minimap { margin-top: 52px; }

/* 단축키 도움말 */
.rsf-help-anchor { position: relative; }
.rsf-help-panel {
  position: absolute; top: 100%; right: 0; z-index: 300; margin-top: var(--spacing-xs); min-width: 300px; padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-md); box-shadow: var(--shadow-dropdown);
}
.rsf-help-list { margin: 0; }
.rsf-help-row { display: flex; gap: var(--spacing-md); padding: 2px 0; }
.rsf-help-row dt { flex: 0 0 150px; margin: 0; font-weight: 600; white-space: nowrap; }
.rsf-help-row dd { margin: 0; color: var(--color-text-secondary); }
.rsf-help-note { margin: var(--spacing-xs) 0 0; font-size: var(--font-size-sm); color: var(--color-text-muted); }
`;
