/**
 * 캔버스 편집 부품 스타일(단계 2 Task 13) — 도구 막대·대기·강조 노드·관계 손잡이·대화상자·마법사. 색은 의미 토큰만(§8).
 * ErdToolbar·DiagramWizard 가 <style href precedence> 로 넣는다. 화면 공통 스타일(erd-styles.ts)과 따로 두어 다른 레인과 겹치지 않게 한다.
 * xyflow 손잡이 규칙(.react-flow__handle)과 겨루는 규칙은 선택자를 한 단계 높인다.
 */
export const ERD_EDIT_STYLE_HREF = "dmes-erd-edit-canvas";

export const ERD_EDIT_CSS = `
.erd-toolbar { position: absolute; top: var(--spacing-sm); left: var(--spacing-sm); z-index: 5; display: flex; align-items: center; gap: 2px;
  padding: 2px; background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-sm); }
.erd-toolbar__sep { width: 1px; align-self: stretch; margin: 0 2px; background: var(--color-border); }
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
.erd-wizard__steps { display: flex; gap: var(--spacing-sm); margin-bottom: var(--spacing-sm); font-size: var(--font-size-sm); color: var(--color-text-muted); }
.erd-wizard__steps [data-current] { font-weight: 600; color: var(--color-text); }
.erd-wizard__tools { display: flex; flex-wrap: wrap; align-items: center; gap: var(--spacing-sm); margin-bottom: var(--spacing-xs); }
.erd-wizard__list { max-height: 320px; overflow-y: auto; padding: var(--spacing-xs); border: 1px solid var(--color-border); border-radius: var(--radius-sm); }
.erd-wizard__row { display: flex; align-items: center; gap: var(--spacing-xs); min-height: 24px; }
.erd-wizard__logical { color: var(--color-text-muted); font-size: var(--font-size-sm); }
.erd-tree__actions { margin-bottom: var(--spacing-sm); }
`;
