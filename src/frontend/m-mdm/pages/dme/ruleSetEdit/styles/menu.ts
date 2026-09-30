/**
 * 우클릭·[+] 메뉴·툴바 찾기·단축키 도움말 스타일(3단계 계획 P4). Task 0 이 메뉴 틀(`ContextMenu`)과 선 [+] 단추 규칙을 두고, Task 8 이 찾기·도움말을 더한다.
 * 색은 의미 토큰만 쓴다. 한 변 색 바는 쓰지 않는다(Local-Rules §8).
 */
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
.rsf-menu-group { display: flex; flex-direction: column; }
.rsf-menu-group-title { padding: 4px var(--spacing-md); font-size: var(--font-size-sm); color: var(--color-text-secondary); }

/* 선 [+] 단추 — 선 이름표 층(pointer-events: none) 위에서 누를 수 있게 한다 */
.rsf-edge-add {
  position: absolute; pointer-events: all; display: inline-flex; align-items: center; justify-content: center;
  width: 18px; height: 18px; padding: 0; border-radius: 50%; cursor: pointer;
  background: var(--color-bg); border: 1px solid var(--color-border-strong); color: var(--color-text-secondary);
}
.rsf-edge-add:hover { border-color: var(--color-primary); color: var(--color-primary); }

/* 툴바 찾기 칸·단축키 도움말 */
.rsf-find-input { width: 180px; }
.rsf-find-count { min-width: 36px; text-align: center; font-size: var(--font-size-sm); color: var(--color-text-secondary); }
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
