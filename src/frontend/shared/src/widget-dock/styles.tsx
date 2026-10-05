/**
 * 떠 있는 창·위젯 도크 스타일 — 컴포넌트가 `<style href precedence>` 로 한 번만 넣는다(Part B §18-3, widget/styles.tsx 와 같은 방식).
 * 색·간격은 공통 토큰만 쓴다. 한 변 컬러 바 금지.
 */
export const FLOATING_WINDOW_CSS = `
.cm-float-win { position: absolute; display: flex; flex-direction: column; box-sizing: border-box; min-width: 0; background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-md); box-shadow: var(--shadow-modal); overflow: hidden; pointer-events: auto; }
.cm-float-win[data-dragging="true"] { user-select: none; }
.cm-float-win[data-dragging="true"] iframe { pointer-events: none; }
.cm-float-win__bar { flex: 0 0 auto; display: flex; align-items: center; gap: 4px; height: 26px; padding: 0 4px 0 6px; background: var(--color-bg-header); border-bottom: 1px solid var(--color-border-light); cursor: grab; user-select: none; touch-action: none; }
.cm-float-win[data-dragging="true"] .cm-float-win__bar { cursor: grabbing; }
.cm-float-win__grip { flex: 0 0 auto; display: inline-flex; color: var(--color-text-muted); }
.cm-float-win__title { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--font-size-sm); font-weight: 600; color: var(--color-text-secondary); }
.cm-float-win__btn { flex: 0 0 auto; width: 22px; height: 22px; display: inline-grid; place-items: center; padding: 0; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--color-text-muted); cursor: pointer; }
.cm-float-win__btn:hover { background: var(--color-bg-hover); color: var(--color-text); }
.cm-float-win__btn:focus-visible { outline: 2px solid var(--color-focus); outline-offset: -2px; }
.cm-float-win__body { position: relative; flex: 1 1 0; min-height: 0; overflow: hidden; }
.cm-float-win__resize { position: absolute; right: 0; bottom: 0; width: 14px; height: 14px; cursor: se-resize; touch-action: none; z-index: 6; }
.cm-float-win__resize::after { content: ""; position: absolute; right: 3px; bottom: 3px; width: 7px; height: 7px; border-right: 2px solid var(--color-border); border-bottom: 2px solid var(--color-border); }
.cm-float-win:hover .cm-float-win__resize::after { border-color: var(--color-primary); }
.cm-float-win__icon { position: absolute; display: grid; place-items: center; padding: 0; box-sizing: border-box; border: 1px solid var(--color-primary); border-radius: 50%; background: var(--color-primary); color: var(--color-on-primary); font-size: var(--font-size-lg); font-weight: 700; box-shadow: var(--shadow-dropdown); cursor: pointer; pointer-events: auto; user-select: none; touch-action: none; }
.cm-float-win__icon:hover { background: var(--color-primary-hover); }
.cm-float-win__icon:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
.cm-float-win__icon[data-dragging="true"] { cursor: grabbing; }
`;

/**
 * 창 층의 쌓임 높이 — 셸 쌓임 맥락(AppShell 루트)에서 다른 층과 이렇게 겹친다.
 * - 아래: 탭 화면 일반 요소(1~2)·AppShell 머리(100)·사이드바(.sidebar-container 150, 폭 조절 손잡이 1002 와 펼침 손잡이는 그 안에 갇힌다)·
 *   전체 화면 슬라이딩 사이드바(140).
 * - 위: Mantine 모달(200)·Menu/Popover/Select 드롭다운(300, 「도구」 메뉴 포함 — 새 창이 놓이는 머리 오른쪽 아래를 가리지 않는다)·
 *   공용 Modal(9999)·MessageModal·알림(10000)·DetailPopover(9000).
 * - 탭 화면 안에서 연 드롭다운(TabsBar 탭 목록·page-layout·ComboBox 1000)은 셸 쌓임에 그대로 참여해 창 위에 보인다 — 방금 연 메뉴가 창에 가리지 않는 쪽이 낫다.
 * 도크 층 값만 1002 위로 올리면 모달(200)·팝오버(300)가 창 뒤로 깔려 위 목록이 뒤집힌다. 그래서 손잡이를 사이드바 안에 가둔다(Sidebar.css).
 */
export const WIDGET_DOCK_Z_INDEX = 160;

export const WIDGET_DOCK_CSS = `
.cm-widget-dock { position: fixed; inset: 0; z-index: ${WIDGET_DOCK_Z_INDEX}; pointer-events: none; }
.cm-widget-dock .cm-float-win__body > .cm-widget { border: 0; border-radius: 0; }
.cm-widget-dock-tools { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 10px; border: 1px solid transparent; border-radius: var(--radius-sm); background: transparent; color: var(--shell-header-fg); font-size: var(--font-size-md); cursor: pointer; }
.cm-widget-dock-tools:hover, .cm-widget-dock-tools[aria-expanded="true"] { background-color: var(--shell-header-control-bg); border-color: var(--shell-header-control-border); }
.cm-widget-dock-tools:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 1px; }
.cm-widget-dock-tools svg { color: var(--shell-header-muted); }
.cm-widget-dock-tools__count { min-width: 16px; height: 16px; padding: 0 4px; box-sizing: border-box; border-radius: 8px; background: var(--color-primary); color: var(--color-on-primary); font-size: var(--font-size-xs); line-height: 16px; text-align: center; font-variant-numeric: tabular-nums; }
.cm-widget-dock-menu__count { margin-left: auto; padding-left: 8px; font-size: var(--font-size-xs); color: var(--color-text-muted); font-variant-numeric: tabular-nums; }
.cm-widget-dock-menu__note { padding: 4px 12px 6px; font-size: var(--font-size-xs); color: var(--color-text-muted); }
`;

export function FloatingWindowStyle() {
  return (
    <style href="cm-floating-window" precedence="default">
      {FLOATING_WINDOW_CSS}
    </style>
  );
}

export function WidgetDockStyle() {
  return (
    <style href="cm-widget-dock" precedence="default">
      {WIDGET_DOCK_CSS}
    </style>
  );
}
