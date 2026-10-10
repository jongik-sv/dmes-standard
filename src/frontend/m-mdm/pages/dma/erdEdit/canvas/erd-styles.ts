/**
 * erdEdit 화면 스타일 — 포털은 모듈 dist 의 page.css 를 싣지 않으므로 TS 문자열로 두고 page 가 `<style href precedence>` 로 한 번 넣는다
 * (Local-Rules §17). 색은 의미 토큰만 쓴다(§8). 논리 모드 배경은 푸른 계열, 물리 모드 배경은 붉은 계열이다(스펙 8절 F3).
 * xyflow 스타일시트(.react-flow__handle·.react-flow__edge-path)와 겨루는 규칙은 선택자를 한 단계 높인다. 두 스타일의 순서가 정해지지 않아서다.
 */
export const ERD_STYLE_HREF = "dmes-erd-edit";

export const ERD_CSS = `
.erd-canvas { position: absolute; inset: 0; }
.erd-canvas[data-mode="logical"] .react-flow { background: var(--color-primary-soft); }
.erd-canvas[data-mode="physical"] .react-flow { background: var(--color-danger-soft); }
.erd-canvas .react-flow__nodesselection-rect { pointer-events: none; }
.erd-node { position: relative; width: 240px; box-sizing: border-box; background: var(--color-bg); color: var(--color-text);
  border: 1px solid var(--color-border-strong); border-radius: var(--radius-sm); font-size: var(--font-size-xs); }
.react-flow__node.selected .erd-node { border-color: var(--color-primary); box-shadow: var(--shadow-focus); }
.erd-node__hd { position: relative; display: flex; align-items: center; gap: var(--spacing-xs); height: 30px; padding: 0 var(--spacing-sm);
  background: var(--color-bg-header); border-bottom: 1px solid var(--color-border); font-weight: 600; overflow: hidden; }
.erd-node__title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.erd-node__sub { min-width: 0; font-family: var(--font-family-mono); font-weight: 400; color: var(--color-text-muted);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.erd-node__warn { margin-left: auto; color: var(--color-danger); }
.erd-node[data-names-only] .erd-node__hd { border-bottom: 0; }
.erd-col { position: relative; display: grid; grid-template-columns: 26px minmax(0, 1fr) auto; align-items: center; gap: var(--spacing-xs);
  height: 20px; padding: 0 var(--spacing-sm); }
.erd-col[data-tone="miss"] { background: var(--color-danger-soft); }
.erd-col[data-tone="warn"] { background: var(--color-warning-soft); }
.erd-col__key { font-weight: 600; color: var(--color-text-muted); }
.erd-col__key[data-key="PK"] { color: var(--color-warning); }
.erd-col__name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.erd-col__name-sub { margin-left: var(--spacing-xs); font-family: var(--font-family-mono); color: var(--color-text-muted); }
.erd-col__sub { font-family: var(--font-family-mono); color: var(--color-text-muted); white-space: nowrap; }
.erd-node__more { height: 20px; line-height: 20px; padding: 0 var(--spacing-sm); border-top: 1px dashed var(--color-border); color: var(--color-text-muted); }
.erd-node .erd-handle { width: 4px; height: 4px; min-width: 0; min-height: 0; border: 0; background: transparent; pointer-events: none; }
.erd-node__viewers { position: absolute; left: 0; bottom: 100%; display: flex; gap: 2px; }
.erd-viewer { padding: 0 var(--spacing-xs); border-radius: var(--radius-sm) var(--radius-sm) 0 0; font-size: var(--font-size-xs);
  white-space: nowrap; color: var(--color-on-primary); background: var(--color-warning); }
.erd-viewer[data-source="llm"] { background: var(--color-success); }
.erd-rel .erd-rel__line, .erd-rel .erd-rel__end { stroke: var(--color-text); stroke-width: 1.4; }
.erd-rel[data-state="INFERRED"] .erd-rel__line { stroke: var(--color-warning); stroke-dasharray: 5 4; }
.erd-rel[data-state="INFERRED"] .erd-rel__end { stroke: var(--color-warning); }
.erd-rel .erd-rel__zero { fill: var(--color-bg); stroke: var(--color-text); stroke-width: 1.2; }
.erd-rel[data-state="INFERRED"] .erd-rel__zero { stroke: var(--color-warning); }
.erd-rel__label { position: absolute; padding: 0 var(--spacing-xs); font-size: var(--font-size-xs); color: var(--color-warning);
  background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-sm); }
.erd-app { display: grid; grid-template-columns: 220px minmax(0, 1fr) 400px; grid-template-rows: auto minmax(360px, 1fr) 260px;
  grid-template-areas: "bar bar bar" "side center grid" "review review review"; height: 100%; min-height: 720px;
  border: 1px solid var(--color-border); background: var(--color-bg); }
.erd-area-bar { grid-area: bar; border-bottom: 1px solid var(--color-border); }
.erd-area-side { grid-area: side; min-height: 0; overflow-y: auto; padding: var(--spacing-sm); border-right: 1px solid var(--color-border); }
.erd-area-center { grid-area: center; position: relative; min-width: 0; min-height: 0; }
.erd-area-grid { grid-area: grid; position: relative; min-height: 0; display: flex; flex-direction: column; border-left: 1px solid var(--color-border); }
.erd-area-review { grid-area: review; min-height: 0; display: flex; flex-direction: column; border-top: 1px solid var(--color-border); }
.erd-bar__row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--spacing-sm); padding: var(--spacing-xs) var(--spacing-sm); }
.erd-bar__label { font-size: var(--font-size-sm); color: var(--color-text-secondary); }
.erd-bar__meta { font-family: var(--font-family-mono); font-size: var(--font-size-sm); color: var(--color-text-secondary); }
.erd-bar__people, .erd-bar__group { display: inline-flex; gap: 2px; }
.erd-bar__spacer { flex: 1; }
.erd-avatar { display: inline-flex; align-items: center; justify-content: center; min-width: 22px; height: 22px; padding: 0 var(--spacing-xs);
  border-radius: 11px; border: 1px solid var(--color-border); background: var(--color-bg-header); font-size: var(--font-size-xs); }
.erd-avatar[data-source="llm"] { color: var(--color-success); background: var(--color-success-soft); }
.erd-banner { padding: var(--spacing-xs) var(--spacing-sm); font-size: var(--font-size-sm); }
.erd-banner[data-kind="lost"] { color: var(--color-danger); background: var(--color-danger-soft); }
.erd-banner[data-kind="readonly"] { color: var(--color-warning); background: var(--color-warning-soft); }
.erd-message { min-height: 18px; padding: 0 var(--spacing-sm) var(--spacing-xs); font-size: var(--font-size-sm); color: var(--color-text-secondary); }
.erd-empty { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--color-text-muted); }
.erd-tree__find { margin-bottom: var(--spacing-sm); }
.erd-tree__area-name { margin-top: var(--spacing-sm); font-size: var(--font-size-sm); font-weight: 600; }
.erd-tree__item { display: flex; width: 100%; align-items: center; gap: var(--spacing-xs); padding: 2px var(--spacing-sm); border: 0;
  border-radius: var(--radius-sm); background: transparent; color: var(--color-text); font-size: var(--font-size-sm); text-align: left; cursor: pointer; }
.erd-tree__item:hover { background: var(--color-bg-hover); }
.erd-tree__item[data-active] { background: var(--color-selection); }
.erd-tree__count { margin-left: auto; color: var(--color-text-muted); }
.erd-tree__bad { color: var(--color-danger); }
.erd-tree__note, .erd-tree__legend { margin-top: var(--spacing-sm); font-size: var(--font-size-xs); color: var(--color-text-muted); }
.erd-review__panel { display: flex; flex: 1; flex-direction: column; min-height: 0; }
.erd-review__head { display: flex; align-items: center; gap: var(--spacing-sm); padding: 0 var(--spacing-sm); }
.erd-review__note { padding: 0 var(--spacing-sm); font-size: var(--font-size-xs); color: var(--color-text-muted); }
.erd-review__body { position: relative; flex: 1; min-height: 0; }
.erd-review__grid { position: absolute; inset: 0; }
.erd-actions { display: inline-flex; gap: var(--spacing-xs); }
.erd-mono { font-family: var(--font-family-mono); }
@media (max-width: 1180px) {
  .erd-app { grid-template-columns: 200px minmax(0, 1fr); grid-template-rows: auto minmax(360px, 1fr) 280px 260px;
    grid-template-areas: "bar bar" "side center" "grid grid" "review review"; }
}
`;
