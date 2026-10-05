/**
 * 위젯 공용 스타일 — 컴포넌트가 `<style href precedence>` 로 한 번만 넣는다(Part B §18-3, dashboard/styles.tsx 와 같은 방식).
 * react-grid-layout·react-resizable 의 배치 필수 규칙을 옮겨 왔다(원본: node_modules/react-grid-layout/css/styles.css,
 * node_modules/react-resizable/css/styles.css, MIT). 색·간격은 공통 토큰만 쓴다. 한 변 컬러 바 금지.
 */
export const WIDGET_CSS = `
/* ── react-grid-layout 필수 규칙(원본에서 옮김) ── */
.react-grid-layout { position: relative; transition: height 200ms ease; }
.react-grid-item { transition: all 200ms ease; transition-property: left, top, width, height; }
.react-grid-item.cssTransforms { transition-property: transform, width, height; }
.react-grid-item.resizing { transition: none; z-index: 3; will-change: width, height; }
.react-grid-item.react-draggable-dragging { transition: none; z-index: 3; will-change: transform; }
.react-grid-item.dropping { visibility: hidden; }
.react-grid-item.react-grid-placeholder { background: var(--color-primary); opacity: 0.12; transition-duration: 100ms; z-index: 2; border-radius: var(--radius-md); user-select: none; }
.react-grid-item > .react-resizable-handle { position: absolute; width: 12px; height: 12px; z-index: 4; }
.react-resizable-handle-se { right: 2px; bottom: 2px; cursor: se-resize; }
.react-resizable-handle-sw { left: 2px; bottom: 2px; cursor: sw-resize; }
.react-resizable-handle-ne { right: 2px; top: 2px; cursor: ne-resize; }
.react-resizable-handle-nw { left: 2px; top: 2px; cursor: nw-resize; }
.react-grid-item > .react-resizable-handle.react-resizable-handle-n,
.react-grid-item > .react-resizable-handle.react-resizable-handle-s { left: 12px; right: 12px; width: auto; height: 8px; cursor: ns-resize; }
.react-grid-item > .react-resizable-handle.react-resizable-handle-n { top: -2px; }
.react-grid-item > .react-resizable-handle.react-resizable-handle-s { bottom: -2px; }
.react-grid-item > .react-resizable-handle.react-resizable-handle-e,
.react-grid-item > .react-resizable-handle.react-resizable-handle-w { top: 12px; bottom: 12px; height: auto; width: 8px; cursor: ew-resize; }
.react-grid-item > .react-resizable-handle.react-resizable-handle-e { right: -2px; }
.react-grid-item > .react-resizable-handle.react-resizable-handle-w { left: -2px; }
.react-grid-item:hover > .react-resizable-handle-se { border-right: 2px solid var(--color-primary); border-bottom: 2px solid var(--color-primary); }
.react-grid-item:hover > .react-resizable-handle-sw { border-left: 2px solid var(--color-primary); border-bottom: 2px solid var(--color-primary); }
.react-grid-item:hover > .react-resizable-handle-ne { border-right: 2px solid var(--color-primary); border-top: 2px solid var(--color-primary); }
.react-grid-item:hover > .react-resizable-handle-nw { border-left: 2px solid var(--color-primary); border-top: 2px solid var(--color-primary); }

/* ── 위젯 틀 ── */
.cm-widget { position: relative; display: flex; flex-direction: column; height: 100%; box-sizing: border-box; background: var(--color-bg); border: 1px solid var(--color-border-light); border-radius: var(--radius-md); overflow: hidden; }
.cm-widget[data-editing="true"] .cm-widget__head { background: var(--color-bg-header); cursor: grab; }
.cm-widget[data-locked="true"][data-editing="true"] .cm-widget__head { cursor: default; }
.cm-widget[data-locked="true"] { border-color: var(--color-border); }
.cm-widget__head { flex: 0 0 auto; display: flex; align-items: center; gap: 4px; min-height: 34px; padding: 0 6px 0 12px; border-bottom: 1px solid var(--color-border-light); outline: none; }
.cm-widget__head:focus-visible { box-shadow: inset 0 0 0 2px var(--color-focus); }
.cm-widget__title { margin: 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--font-size-lg); font-weight: 700; color: var(--color-text); }
.cm-widget__rename { flex: 0 1 280px; min-width: 0; height: 24px; padding: 0 6px; border: 1px solid var(--color-primary); border-radius: var(--radius-sm); background: var(--color-bg); color: var(--color-text); font: inherit; font-size: var(--font-size-lg); font-weight: 700; }
.cm-widget__rename:read-only { opacity: 0.7; }
.cm-widget__rename-error { position: absolute; left: 12px; top: 38px; z-index: 6; max-width: calc(100% - 24px); padding: 4px 8px; border-radius: var(--radius-sm); background: var(--color-danger-soft); color: var(--color-danger); font-size: var(--font-size-xs); }
.cm-widget__sub { flex-shrink: 0; font-size: var(--font-size-xs); color: var(--color-text-muted); }
.cm-widget__title-extra { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
.cm-widget__spacer { flex: 1 1 auto; }
.cm-widget__actions { display: inline-flex; align-items: center; gap: 4px; }
.cm-widget__btn { width: 24px; height: 24px; display: inline-grid; place-items: center; padding: 0; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--color-text-muted); cursor: pointer; font-size: 13px; }
.cm-widget__btn:hover:not(:disabled) { background: var(--color-bg-hover); color: var(--color-text); }
.cm-widget__btn:disabled { opacity: 0.35; cursor: not-allowed; }
.cm-widget__btn[aria-pressed="true"] { color: var(--color-primary); background: var(--color-primary-soft); }
.cm-widget__body { flex: 1 1 0; min-height: 0; overflow: auto; }
.cm-widget__body--padded { padding: var(--spacing-md) var(--spacing-lg); }
.cm-widget__state { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--spacing-sm); padding: var(--spacing-lg); text-align: center; font-size: var(--font-size-sm); color: var(--color-text-muted); }
.cm-widget__state--error { color: var(--color-danger); }
.cm-widget__text-btn { height: 26px; padding: 0 10px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-bg); color: var(--color-text); font-size: var(--font-size-sm); cursor: pointer; }
.cm-widget__text-btn:hover { background: var(--color-bg-hover); }
.cm-widget__loading { position: absolute; top: 40px; right: var(--spacing-md); z-index: 5; padding: 2px var(--spacing-sm); border: 1px solid var(--color-border-light); border-radius: var(--radius-sm); background: var(--color-bg); color: var(--color-text-muted); font-size: var(--font-size-xs); pointer-events: none; }
.cm-widget__size { position: absolute; right: 8px; bottom: 8px; z-index: 5; padding: 2px 7px; border-radius: var(--radius-sm); background: var(--shell-header-bg); color: var(--shell-header-fg); font-size: var(--font-size-xs); font-variant-numeric: tabular-nums; pointer-events: none; }
.cm-widget--missing { background: var(--color-bg-light); border-style: dashed; border-color: var(--color-border); }
.cm-widget--missing .cm-widget__title { color: var(--color-text-muted); }
.cm-widget--disabled .cm-widget__title { color: var(--color-text-muted); }
.cm-widget__disabled { flex: 1 1 0; min-height: 0; margin: var(--spacing-sm); display: flex; align-items: center; justify-content: center; padding: var(--spacing-sm); border: 1px dashed var(--color-border); border-radius: var(--radius-sm); background: var(--color-bg-light); color: var(--color-text-muted); font-size: var(--font-size-sm); text-align: center; }
.cm-widget__skeleton { padding: var(--spacing-lg); display: flex; flex-direction: column; gap: var(--spacing-sm); }
.cm-widget__skeleton i { display: block; height: 12px; border-radius: var(--radius-sm); background: var(--color-bg-hover); }

/* ── 보드·탭·서랍·작업 공간(뒤 작업에서 쓰는 클래스도 여기 둔다) ── */
.cm-widget-board { position: relative; min-height: 120px; }
.cm-widget-board[data-editing="true"] { border-radius: var(--radius-md); outline: 1px dashed color-mix(in srgb, var(--color-primary) 35%, transparent); outline-offset: 2px; background-color: color-mix(in srgb, var(--color-primary) 2%, transparent); }
/* 편집 모드에서는 iframe 이 마우스를 삼켜 끌기·크기 조절이 끊기므로 유형 구분 없이 한 번에 막는다. */
.cm-widget-board[data-editing="true"] iframe { pointer-events: none; }
.cm-widget-board__empty { padding: 40px 12px; text-align: center; font-size: var(--font-size-sm); color: var(--color-text-muted); }
.cm-widget-tabs { display: flex; align-items: flex-end; gap: 4px; min-height: 34px; border-bottom: 1px solid var(--color-border); }
.cm-widget-tab { position: relative; display: inline-flex; align-items: center; gap: 6px; height: 32px; margin-bottom: -1px; padding: 0 6px 0 12px; border: 1px solid transparent; border-bottom: 0; border-radius: var(--radius-md) var(--radius-md) 0 0; background: transparent; color: var(--color-text-secondary); font-size: var(--font-size-md); cursor: pointer; }
.cm-widget-tab:hover { background: var(--color-bg-hover); }
.cm-widget-tab[aria-selected="true"] { background: var(--color-bg); border-color: var(--color-border); color: var(--color-text); font-weight: 600; }
.cm-widget-tab__lock { font-size: var(--font-size-xs); color: var(--color-text-muted); }
.cm-widget-tab__more { width: 20px; height: 20px; display: inline-grid; place-items: center; padding: 0; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--color-text-muted); cursor: pointer; letter-spacing: 1px; }
.cm-widget-tab__more:hover { background: var(--color-bg-hover); color: var(--color-text); }
.cm-widget-tab__name { width: 120px; height: 24px; padding: 0 6px; border: 1px solid var(--color-primary); border-radius: var(--radius-sm); font: inherit; }
.cm-widget-tab__error { position: absolute; left: 0; top: 100%; z-index: 30; margin-top: 4px; padding: 4px 8px; border-radius: var(--radius-sm); background: var(--color-danger-soft); color: var(--color-danger); font-size: var(--font-size-xs); white-space: nowrap; }
.cm-widget-tabs__add { width: 28px; height: 28px; margin-bottom: 3px; border: 1px dashed var(--color-border); border-radius: var(--radius-md); background: transparent; color: var(--color-text-muted); font-size: 16px; line-height: 1; cursor: pointer; }
.cm-widget-tabs__add:hover:not(:disabled) { color: var(--color-primary); border-color: var(--color-primary); }
.cm-widget-tabs__add:disabled { opacity: 0.4; cursor: not-allowed; }
.cm-widget-tabs__import { height: 28px; margin-bottom: 3px; padding: 0 8px; border: 1px dashed var(--color-border); border-radius: var(--radius-md); background: transparent; color: var(--color-text-muted); font-size: var(--font-size-sm); cursor: pointer; white-space: nowrap; }
.cm-widget-tabs__import:hover:not(:disabled) { color: var(--color-primary); border-color: var(--color-primary); }
.cm-widget-tabs__import:disabled { opacity: 0.4; cursor: not-allowed; }
.cm-widget-tabs__trailing { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; padding-bottom: 4px; }
.cm-widget-menu { position: absolute; z-index: 40; min-width: 176px; padding: 4px; background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-md); box-shadow: 0 6px 20px rgba(15, 23, 32, 0.16); }
.cm-widget-menu button { display: flex; width: 100%; align-items: center; gap: 8px; padding: 6px 10px; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--color-text); font-size: var(--font-size-md); text-align: left; cursor: pointer; }
.cm-widget-menu button:hover:not(:disabled) { background: var(--color-bg-hover); }
.cm-widget-menu button:disabled { color: var(--color-text-disabled); cursor: not-allowed; }
.cm-widget-menu button[data-danger="true"] { color: var(--color-danger); }
.cm-widget-menu hr { margin: 4px 0; border: 0; border-top: 1px solid var(--color-border-light); }
.cm-widget-picker { display: flex; flex-direction: column; width: 268px; flex: 0 0 268px; max-height: calc(100vh - 160px); position: sticky; top: 8px; background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-md); }
.cm-widget-picker__head { padding: 10px 12px 8px; border-bottom: 1px solid var(--color-border-light); }
.cm-widget-picker__title { display: block; margin: 0 0 6px; font-size: var(--font-size-lg); font-weight: 700; }
.cm-widget-picker__search { width: 100%; height: 28px; box-sizing: border-box; padding: 0 8px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); font: inherit; }
.cm-widget-picker__list { overflow: auto; padding: 6px; display: flex; flex-direction: column; gap: 4px; }
.cm-widget-picker__item { display: block; width: 100%; padding: 7px 9px; border: 1px solid var(--color-border-light); border-radius: var(--radius-md); background: var(--color-bg); text-align: left; cursor: grab; }
.cm-widget-picker__item:hover:not(:disabled) { border-color: var(--color-primary); background: var(--color-primary-soft); }
.cm-widget-picker__item:disabled { opacity: 0.45; cursor: not-allowed; }
.cm-widget-picker__name { display: flex; justify-content: space-between; gap: 6px; font-weight: 600; font-size: var(--font-size-md); color: var(--color-text); }
.cm-widget-picker__size { font-weight: 400; color: var(--color-text-muted); font-variant-numeric: tabular-nums; }
.cm-widget-picker__type { display: block; margin-top: 1px; font-size: var(--font-size-xs); color: var(--color-text-secondary); }
.cm-widget-picker__desc { margin: 2px 0 0; font-size: var(--font-size-xs); color: var(--color-text-muted); white-space: normal; overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; line-clamp: 3; overflow-wrap: anywhere; }
.cm-widget-picker__cats { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
.cm-widget-picker__cat { height: 22px; padding: 0 8px; border: 1px solid var(--color-border); border-radius: 11px; background: var(--color-bg); color: var(--color-text-secondary); font-size: var(--font-size-xs); cursor: pointer; white-space: nowrap; }
.cm-widget-picker__cat:hover { border-color: var(--color-primary); }
.cm-widget-picker__cat[aria-pressed="true"] { border-color: var(--color-primary); background: var(--color-primary-soft); color: var(--color-primary); font-weight: 600; }
.cm-widget-picker__section { display: flex; flex-direction: column; gap: 4px; }
.cm-widget-picker__group { margin: 4px 2px 0; font-size: var(--font-size-xs); font-weight: 700; color: var(--color-text-secondary); }
.cm-widget-picker__foot { padding: 8px 12px; border-top: 1px solid var(--color-border-light); font-size: var(--font-size-xs); color: var(--color-text-muted); }
.cm-widget-ws { display: flex; flex-direction: column; gap: var(--spacing-sm); min-width: 0; }
.cm-widget-ws__body { display: flex; gap: 10px; align-items: flex-start; }
.cm-widget-ws__board { flex: 1 1 auto; min-width: 0; }
.cm-widget-ws__banner { display: flex; align-items: center; gap: var(--spacing-md); padding: 6px 10px; border: 1px solid color-mix(in srgb, var(--color-danger) 35%, transparent); border-radius: var(--radius-md); background: var(--color-danger-soft); color: var(--color-danger); font-size: var(--font-size-sm); }
.cm-widget-ws__btn { height: 28px; padding: 0 12px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-bg); color: var(--color-text); font-size: var(--font-size-sm); cursor: pointer; white-space: nowrap; }
.cm-widget-ws__btn:hover:not(:disabled) { background: var(--color-bg-hover); }
.cm-widget-ws__btn:disabled { opacity: 0.45; cursor: not-allowed; }
.cm-widget-ws__btn--primary { background: var(--color-primary); border-color: var(--color-primary); color: var(--color-on-primary); }
.cm-widget-ws__btn--primary:hover:not(:disabled) { background: var(--color-primary-hover); }
.cm-widget-ws__btn--icon { display: inline-flex; align-items: center; gap: 4px; }
.cm-widget-ws__hint { font-size: var(--font-size-sm); font-weight: 600; color: var(--color-primary); }
.cm-widget-ws__head { display: flex; align-items: center; gap: 6px; min-height: 34px; padding-bottom: 4px; border-bottom: 1px solid var(--color-border); }
.cm-widget-ws__title { margin: 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--font-size-lg); font-weight: 700; color: var(--color-text); }
.cm-widget-ws__head-trailing { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; }
`;

const STYLE_HREF = "cm-widget";

export function WidgetStyle() {
  return (
    <style href={STYLE_HREF} precedence="default">
      {WIDGET_CSS}
    </style>
  );
}
