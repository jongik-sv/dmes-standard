/**
 * 캔버스 편집 부품 스타일(단계 2 Task 13) — 도구 막대·대기·강조 노드·관계 손잡이·대화상자·마법사. 색은 의미 토큰만(§8).
 * ErdToolbar·DiagramWizard 가 <style href precedence> 로 넣는다. 화면 공통 스타일(erd-styles.ts)과 따로 두어 다른 레인과 겹치지 않게 한다.
 * xyflow 손잡이 규칙(.react-flow__handle)과 겨루는 규칙은 선택자를 한 단계 높인다.
 * 단계별 그리기(U50): useCanvasEditing 이 .react-flow 요소에 data-lod 와 --erd-zoom 을 쓴다. 글자·선 굵기는 calc(값 / --erd-zoom) 으로
 * 화면 기준 크기를 지킨다(12px·60px = erd-geometry OVERVIEW_FONT_PX·OVERVIEW_FONT_MAX_FLOW, 34px = 12 / 0.35).
 * 이름만 단계 머리는 고정 40px(34px 글자가 잘리지 않게). height:auto 로 두면 배율마다 노드 높이가 바뀌어 React Flow 가 노드를 다시 잰다.
 * 머리 손잡이는 xyflow 기본(top:50%)이라 머리 높이와 상관없이 가운데에 붙는다.
 * 도구 막대는 좁은 캔버스(538px)에서 여러 줄로 접힌다(flex-wrap). 관계 도구 안내 줄(U41)은 막대의 자식으로 막대 바로 아래 가운데에 붙어
 * 접힌 높이를 따라간다. 누르기는 아래 캔버스로 넘긴다(pointer-events: none).
 * 미니맵(U51)은 .react-flow 바깥(overlay)에 그려져 xyflow 기본 색 변수를 받지 못한다 — 바탕·가림 색을 토큰으로 준다.
 */
export const ERD_EDIT_STYLE_HREF = "dmes-erd-edit-canvas";

export const ERD_EDIT_CSS = `
.erd-toolbar { position: absolute; top: var(--spacing-sm); left: var(--spacing-sm); z-index: 5; display: flex; flex-wrap: wrap; align-items: center;
  gap: 2px; max-width: calc(100% - 2 * var(--spacing-sm)); padding: 2px; background: var(--color-bg); border: 1px solid var(--color-border);
  border-radius: var(--radius-sm); }
.erd-toolbar__sep { width: 1px; align-self: stretch; margin: 0 2px; background: var(--color-border); }
.erd-toolbar__txt { display: inline-flex; }
.erd-tool-hint { position: absolute; top: calc(100% + var(--spacing-xs)); left: 50%; transform: translateX(-50%); z-index: 5; width: max-content;
  max-width: 100%; padding: 2px var(--spacing-sm); background: var(--color-primary-soft); color: var(--color-text); border: 1px solid var(--color-border);
  border-radius: var(--radius-sm); font-size: var(--font-size-sm); pointer-events: none; }
.react-flow__node.erd-pending .erd-node { opacity: 0.6; border-style: dashed; }
.react-flow__node.erd-hl .erd-node { border-color: var(--color-danger); box-shadow: 0 0 0 2px var(--color-danger-soft); }
.erd-node .react-flow__handle.erd-pick { position: absolute; top: 0; left: 0; width: 100%; height: 100%; min-width: 0; min-height: 0;
  transform: none; border: 0; border-radius: 0; background: transparent; opacity: 1; z-index: 4; cursor: crosshair; pointer-events: all; }
.erd-node .react-flow__handle.erd-pick:hover, .erd-node .react-flow__handle.erd-pick.connectingto,
.erd-node .react-flow__handle.erd-pick.connectingfrom { background: var(--color-primary-soft); opacity: 0.5; }
.erd-dialog__row { display: flex; flex-direction: column; gap: var(--spacing-xs); margin-bottom: var(--spacing-sm); }
.erd-dialog__actions { display: flex; justify-content: flex-end; gap: var(--spacing-xs); }
.erd-dialog__list { margin: var(--spacing-xs) 0; padding-left: var(--spacing-lg); font-family: var(--font-family-mono); font-size: var(--font-size-sm); }
.erd-dialog__note { font-size: var(--font-size-xs); color: var(--color-text-muted); }
.erd-dialog__error { font-size: var(--font-size-sm); color: var(--color-danger); }
.erd-props { display: flex; flex-direction: column; gap: var(--spacing-md); }
.erd-props__note { font-size: var(--font-size-sm); color: var(--color-text-muted); }
.erd-props__h { margin: 0 0 var(--spacing-xs); font-size: var(--font-size-sm); font-weight: 600; }
.erd-props__sub { margin-left: var(--spacing-xs); font-weight: 400; font-size: var(--font-size-xs); color: var(--color-text-muted); }
.erd-props__grid2 { display: grid; grid-template-columns: max-content 1fr; align-items: center; gap: var(--spacing-xs) var(--spacing-sm); }
.erd-props__cell { display: flex; align-items: center; gap: var(--spacing-xs); width: 100%; height: 100%; min-width: 0; }
.erd-props__cell:not(.erd-props__cell--center) > * { flex: 1 1 0; min-width: 0; }
.erd-props__cell--center { justify-content: center; }
.erd-props__cell[data-deleted] { opacity: 0.5; text-decoration: line-through; }
.erd-props__keypick { position: relative; display: flex; align-items: center; gap: var(--spacing-sm); margin-top: var(--spacing-xs); }
.erd-props__keypick-label { flex: 0 0 auto; font-size: var(--font-size-sm); color: var(--color-text-muted); }
.erd-props__keypick > .form-multiselect { flex: 1 1 auto; min-width: 0; }
.erd-wizard__steps { display: flex; gap: var(--spacing-sm); margin-bottom: var(--spacing-sm); font-size: var(--font-size-sm); color: var(--color-text-muted); }
.erd-wizard__steps [data-current] { font-weight: 600; color: var(--color-text); }
.erd-wizard__tools { display: flex; flex-wrap: wrap; align-items: center; gap: var(--spacing-sm); margin-bottom: var(--spacing-xs); }
.erd-wizard__list { max-height: 320px; overflow-y: auto; padding: var(--spacing-xs); border: 1px solid var(--color-border); border-radius: var(--radius-sm); }
.erd-wizard__row { display: flex; align-items: center; gap: var(--spacing-xs); min-height: 24px; }
.erd-wizard__logical { color: var(--color-text-muted); font-size: var(--font-size-sm); }
.erd-tree__actions { margin-bottom: var(--spacing-sm); }
.erd-node[data-lod="overview"] { display: flex; align-items: center; justify-content: center; background: var(--color-bg-header); }
.erd-node__ov { max-height: 100%; padding: 0 var(--spacing-xs); text-align: center; overflow: hidden;
  font-size: min(calc(12px / var(--erd-zoom, 1)), 60px); line-height: 1.15; word-break: break-all;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }
.erd-node__ov-p { font-family: var(--font-family-mono); color: var(--color-text-muted); }
.react-flow[data-lod="names"] .erd-node[data-names-only] .erd-node__title { font-size: min(calc(12px / var(--erd-zoom, 1)), 34px); line-height: 1; }
.react-flow[data-lod="names"] .erd-node[data-names-only] .erd-node__hd { height: 40px; }
.react-flow[data-lod="overview"] .erd-rel__end, .react-flow[data-lod="overview"] .erd-rel__zero,
.react-flow[data-lod="overview"] .erd-rel__label { display: none; }
.react-flow[data-lod="overview"] .erd-rel .erd-rel__line { stroke-width: min(calc(1.5px / var(--erd-zoom, 1)), 8px); }
.react-flow[data-lod="overview"] .erd-rel[data-selected] .erd-rel__line { stroke-width: min(calc(2.4px / var(--erd-zoom, 1)), 12px); }
.react-flow[data-lod="overview"] .erd-rel__pt, .react-flow[data-lod="overview"] .erd-rel__seg, .react-flow[data-lod="overview"] .erd-rel__endgrip { display: none; }
.erd-minimap-slot { display: contents; }
.erd-minimap.react-flow__minimap { background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-sm); }
.erd-minimap .react-flow__minimap-mask { fill: var(--color-bg-hover); fill-opacity: 0.6; }
`;
