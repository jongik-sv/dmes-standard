/**
 * HTML 편집기 스타일 — 도구 막대·링크 입력 칸, 서식 편집 칸·원문 칸·미리보기·읽기 상자 틀, 글자 수 줄.
 *
 * - 포털이 원격 모듈의 CSS 파일을 싣지 않으므로(Part B §18-3) `.css` export 를 만들지 않고 컴포넌트가 이 `<style>` 을 직접 넣는다.
 *   React 19 `<style href precedence>` 라 편집기가 여러 개여도 문서 head 에 한 번만 들어간다.
 * - 글 모양(제목·목록 기호·인용·코드·표·링크)은 읽기 모습과 같아야 하므로 NoticeBodyView 의 `.nbv-doc` 스타일을 그대로 쓴다
 *   (서식 모드 자체가 미리보기다). 목록 기호도 거기서 명시한다(Local-Rules §22).
 * - 도구 막대 모양은 markdown-editor 도구 막대와 같은 값이다. 색·간격은 공통 토큰만 쓴다(밝은·어두운 테마 공통).
 */
const BOX = `
.cm-he { position: relative; box-sizing: border-box; width: 100%; min-width: 0; display: flex; flex-direction: column; }
.cm-he-body, .cm-he-source, .cm-he-preview, .cm-he-view {
  box-sizing: border-box; width: 100%; padding: var(--spacing-xs) var(--spacing-sm); background: var(--color-bg);
  border: 1px solid var(--color-border); border-radius: var(--radius-sm); color: var(--color-text);
}
.cm-he-body { display: flex; flex-direction: column; overflow: auto; cursor: text; }
.cm-he-body > .cm-he-rich { flex: 1 1 auto; outline: none; }
.cm-he-body:focus-within, .cm-he-source:focus { border-color: var(--color-primary); }
.cm-he-source {
  display: block; margin: 0; resize: vertical; outline: none; font-family: var(--font-family-mono); font-size: var(--font-size-sm); line-height: 1.5;
}
.cm-he-preview { overflow: auto; }
.cm-he-view { min-height: 64px; overflow: auto; }
.cm-he-count { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--spacing-xs); margin-top: 2px; color: var(--color-text-secondary); font-size: var(--font-size-xs); }
.cm-he-count[data-over="true"] { color: var(--color-danger); }
`;

const TOOLBAR = `
.cm-he-toolbar {
  position: relative; display: flex; align-items: center; flex-wrap: wrap; gap: 2px; padding: 2px; margin-bottom: var(--spacing-xs); box-sizing: border-box;
  background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-sm); color: var(--color-text);
  font-size: var(--font-size-sm); line-height: 1; white-space: nowrap; cursor: default;
}
.cm-he-group, .cm-he-mode { display: inline-flex; align-items: center; gap: 2px; }
.cm-he-group + .cm-he-group { padding-left: 3px; margin-left: 1px; border-left: 1px solid var(--color-border-light); }
.cm-he-mode { margin-left: auto; padding-left: var(--spacing-xs); }
.cm-he-toolbar .cm-he-btn { width: 24px; min-width: 24px; height: 24px; min-height: 24px; padding: 0; border-color: transparent; background: transparent; color: var(--color-text); }
.cm-he-toolbar .cm-he-btn:hover:not(:disabled) { background: var(--color-bg-hover); }
.cm-he-toolbar .cm-he-btn:disabled { color: var(--color-text-secondary); background: transparent; opacity: 0.5; }
.cm-he-toolbar .cm-he-mode-btn { height: 24px; min-height: 24px; padding: 0 var(--spacing-xs); font-size: var(--font-size-xs); }
.cm-he-toolbar .cm-he-mode-btn + .cm-he-mode-btn { margin-left: -1px; }
.cm-he-toolbar [aria-pressed="true"] { background: var(--color-primary-soft); color: var(--color-primary); border-color: var(--color-primary); }
.cm-he-link-pop {
  position: absolute; left: 0; top: calc(100% + 4px); z-index: 9; display: flex; flex-wrap: wrap; align-items: center; gap: var(--spacing-xs);
  width: 280px; padding: var(--spacing-xs); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-sm);
  box-shadow: var(--shadow-dropdown);
}
.cm-he-link-pop > :first-child { flex: 1 1 160px; min-width: 0; }
.cm-he-link-error { flex: 1 1 100%; color: var(--color-danger); font-size: var(--font-size-xs); white-space: normal; }
`;

export const HTML_EDITOR_CSS = [BOX, TOOLBAR].join("\n");

/** `<style href>` 값 — 같은 값이면 React 가 한 번만 넣는다. */
export const HTML_EDITOR_STYLE_HREF = "cm-html-editor";

/** 편집기가 넣는 스타일(문서 head 에 한 번만 들어간다). */
export function HtmlEditorStyle() {
  return (
    <style href={HTML_EDITOR_STYLE_HREF} precedence="default">
      {HTML_EDITOR_CSS}
    </style>
  );
}
