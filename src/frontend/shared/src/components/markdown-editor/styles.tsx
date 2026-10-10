/**
 * 마크다운 편집기 스타일 — 읽기 모습·서식 편집 칸 공통 글 모양(제목·목록·할 일·인용·링크), MD 원문 칸, 도구 막대·링크 입력 칸, 눌러 여는 칸(MarkdownField).
 *
 * - 포털이 원격 모듈의 CSS 파일을 싣지 않으므로(Part B §18-3) `.css` export 를 만들지 않고 컴포넌트가 이 `<style>` 을 직접 넣는다.
 *   React 19 `<style href precedence>` 라 편집기가 여러 개여도 문서 head 에 한 번만 들어간다.
 * - 색·간격은 공통 토큰(`--color-*`, `--spacing-*` 등)만 쓴다(밝은·어두운 테마 공통). 인용은 한 변 색 바 대신 배경 톤·얇은 전체 테두리로 구분한다(Local-Rules §8).
 * - 도구 막대 `floating` 은 편집 칸 위로 뜬다. 감싸는 쪽이 넘침을 자르면(overflow:hidden) 편집 중에만 풀어 줘야 한다 — `.cm-md-editing` 으로 고른다.
 */
/** 문단 사이 간격(읽기 모습·서식 편집 칸 공통). 줄 간격 수준으로 좁게 둔다(2026-10-02 사용자 결정). */
export const PARAGRAPH_GAP = "0.25em";

const CONTENT = `
.cm-md { position: relative; box-sizing: border-box; width: 100%; height: 100%; display: flex; flex-direction: column; min-height: 0; }
.cm-md-view, .cm-md-rich { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.5; }
.cm-md-view { flex: 1 1 auto; min-height: 0; overflow-x: hidden; overflow-y: auto; }
/* 표(읽기 모습 전용) 틀 — 아래 첫·끝 요소 여백 0 규칙보다 앞에 둬서 같은 우선순위에서 그 규칙이 이긴다. 문서 읽기(.cm-doc-body)는 더 넓힌다. */
.cm-md-view .cm-md-table { margin: 4px 0; }
.cm-md-view > :first-child, .cm-md-rich > :first-child { margin-top: 0; }
.cm-md-view > :last-child, .cm-md-rich > :last-child { margin-bottom: 0; }
.cm-md-view p, .cm-md-rich p { margin: 0; }
/* 문단 사이 간격은 줄 간격 수준(PARAGRAPH_GAP)으로 좁다 — 서식 모드 Enter(새 문단)가 줄바꿈처럼 보인다. 읽기 모습과 서식 편집 칸이 같은 값이다.
   빈 문단(읽기 모습 .cm-md-blank, 편집 칸의 빈 <p>)은 <br> 하나라 한 줄 높이의 빈 줄이고 같은 간격을 둔다 — 두 모습에서 높이가 같다.
   (저장 형식은 그대로: 문단 사이 빈 줄 하나, 빈 문단 규칙은 markdown.ts.) */
.cm-md-view p + p, .cm-md-rich p + p { margin-top: ${PARAGRAPH_GAP}; }
.cm-md-view h1, .cm-md-rich h1 { margin: 2px 0; font-size: var(--font-size-lg); font-weight: 700; line-height: 1.3; }
.cm-md-view h2, .cm-md-rich h2 { margin: 2px 0; font-size: var(--font-size-md); font-weight: 700; line-height: 1.3; }
.cm-md-view h3, .cm-md-rich h3 { margin: 2px 0; font-size: var(--font-size-sm); font-weight: 700; line-height: 1.3; }
.cm-md-view h4, .cm-md-view h5, .cm-md-view h6, .cm-md-rich h4, .cm-md-rich h5, .cm-md-rich h6 { margin: 2px 0; font-size: var(--font-size-sm); font-weight: 600; }
/* 목록 기호를 명시한다 — 포털(m-mcm globals.css)의 Tailwind preflight 가 ol·ul 에 list-style: none(layer base)을 걸어 기호가 사라진다.
   이 <style> 은 layer 밖이라 그 리셋보다 앞선다. 글머리는 단계마다 disc → circle → square, 번호는 decimal. 할 일 목록은 아래에서 기호를 끈다. */
.cm-md-view ul, .cm-md-view ol, .cm-md-rich ul, .cm-md-rich ol { margin: 2px 0; padding-left: 1.4em; white-space: normal; }
.cm-md-view ul, .cm-md-rich ul { list-style: disc outside; }
.cm-md-view ul ul, .cm-md-rich ul ul { list-style-type: circle; }
.cm-md-view ul ul ul, .cm-md-rich ul ul ul { list-style-type: square; }
.cm-md-view ol, .cm-md-rich ol { list-style: decimal outside; }
.cm-md-view li, .cm-md-rich li { display: list-item; white-space: pre-wrap; }
.cm-md-view ul[data-type="taskList"], .cm-md-rich ul[data-type="taskList"] { list-style: none; padding-left: 0.2em; }
.cm-md-view ul[data-type="taskList"] > li, .cm-md-rich ul[data-type="taskList"] > li { display: flex; align-items: flex-start; gap: 6px; list-style: none; }
.cm-md-view ul[data-type="taskList"] > li > label, .cm-md-rich ul[data-type="taskList"] > li > label { flex: 0 0 auto; margin-top: 0.2em; user-select: none; }
.cm-md-view ul[data-type="taskList"] > li > div, .cm-md-rich ul[data-type="taskList"] > li > div { flex: 1 1 auto; min-width: 0; }
.cm-md-view ul[data-type="taskList"] > li[data-checked="true"] > div, .cm-md-rich ul[data-type="taskList"] > li[data-checked="true"] > div { color: var(--color-text-secondary); text-decoration: line-through; }
.cm-md-view input[type="checkbox"], .cm-md-rich input[type="checkbox"] { margin: 0; accent-color: var(--color-primary); }
.cm-md-view blockquote, .cm-md-rich blockquote {
  margin: 2px 0; padding: 2px var(--spacing-sm); color: var(--color-text-secondary);
  background: var(--color-bg-light); border: 1px solid var(--color-border-light); border-radius: var(--radius-sm);
}
.cm-md-view a, .cm-md-rich a { color: var(--color-primary); text-decoration: underline; cursor: pointer; }
.cm-md-view code, .cm-md-rich code { font-family: var(--font-family-mono); font-size: 0.92em; padding: 0 2px; background: var(--color-bg-light); border-radius: var(--radius-sm); }
.cm-md-view pre, .cm-md-rich pre { margin: 2px 0; padding: 4px var(--spacing-xs); background: var(--color-bg-light); border-radius: var(--radius-sm); overflow: auto; }
.cm-md-view pre code, .cm-md-rich pre code { padding: 0; background: transparent; }
.cm-md-view hr, .cm-md-rich hr { border: 0; border-top: 1px solid var(--color-border); margin: 4px 0; }
/* 표 — 틀(.cm-md-table)이 가로로 넘치면 안에서 스크롤한다. 칸은 줄바꿈을 접고(white-space: normal) 긴 낱말은 break-word 로만 꺾어
   (anywhere 는 최소 폭을 줄여 스크롤이 생기지 않는다) 표가 넓어지면 틀 안 스크롤이 된다. 색은 공통 토큰이라 어두운 테마에서도 읽힌다. */
.cm-md-view .cm-md-table { max-width: 100%; overflow-x: auto; white-space: normal; }
.cm-md-view table { border-collapse: collapse; min-width: 100%; font-size: inherit; line-height: 1.5; }
.cm-md-view th, .cm-md-view td {
  padding: 3px var(--spacing-sm); border: 1px solid var(--color-border); text-align: left; vertical-align: top;
  white-space: normal; overflow-wrap: break-word; color: var(--color-text);
}
.cm-md-view th { font-weight: 700; background: var(--color-bg-light); }
@media print {
  .cm-md-view .cm-md-table { overflow: visible; }
  .cm-md-view tr { break-inside: avoid; }
  .cm-md-view th { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
}
`;

const EDITING = `
.cm-md-editing { cursor: text; }
.cm-md-body { flex: 1 1 auto; min-height: 0; overflow: auto; }
.cm-md-rich { min-height: 100%; outline: none; color: inherit; font: inherit; }
.cm-md-source {
  flex: 1 1 auto; min-height: 0; width: 100%; box-sizing: border-box; resize: none; margin: 0; padding: 0;
  border: 0; outline: none; background: transparent; color: inherit; font-family: var(--font-family-mono); font-size: inherit; line-height: 1.5;
}
.cm-md-inline .cm-md-body, .cm-md-inline .cm-md-source {
  min-height: 120px; padding: var(--spacing-xs) var(--spacing-sm); background: var(--color-bg);
  border: 1px solid var(--color-border); border-radius: var(--radius-sm);
}
.cm-md-inline.cm-md-editing:focus-within .cm-md-body, .cm-md-inline .cm-md-source:focus { border-color: var(--color-primary); }
/* 칸(MarkdownField)의 읽기 모습(고칠 수 없을 때) — 편집 칸과 같은 틀. 고칠 수 있으면 처음부터 편집기를 보인다. */
.cm-md-field-view {
  box-sizing: border-box; min-height: 64px; max-height: 320px; overflow: auto; padding: var(--spacing-xs) var(--spacing-sm);
  background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-sm);
  color: var(--color-text); font-size: var(--font-size-sm);
}
.cm-md-field-view .cm-md-view { overflow: visible; }
.cm-md-empty { color: var(--color-text-secondary); }
/* fill — 부모(세로 flex)의 남은 높이를 채운다. 편집 칸(서식·MD)이 그 높이까지 늘고, 넘치면 칸 안에서 스크롤한다. */
.cm-md-fill { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; }
.cm-md.cm-md-fill { height: auto; }
.cm-md-fill .cm-md-body, .cm-md-fill .cm-md-source { flex: 1 1 0; }
.cm-md-field-view.cm-md-fill { display: block; min-height: 64px; max-height: none; }
`;

const TOOLBAR = `
.cm-md-toolbar {
  position: relative; display: flex; align-items: center; flex-wrap: wrap; gap: 2px; padding: 2px; box-sizing: border-box;
  background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-sm); color: var(--color-text);
  font-size: var(--font-size-sm); line-height: 1; white-space: nowrap; cursor: default;
}
.cm-md-inline .cm-md-toolbar { margin-bottom: var(--spacing-xs); }
.cm-md-floating .cm-md-toolbar {
  position: absolute; left: -1px; bottom: calc(100% + 6px); z-index: 8; flex-wrap: nowrap; width: max-content; box-shadow: var(--shadow-dropdown);
}
.cm-md-group, .cm-md-mode { display: inline-flex; align-items: center; gap: 2px; }
.cm-md-group + .cm-md-group { padding-left: 3px; margin-left: 1px; border-left: 1px solid var(--color-border-light); }
.cm-md-mode { margin-left: auto; padding-left: var(--spacing-xs); }
.cm-md-toolbar .cm-md-btn { width: 24px; min-width: 24px; height: 24px; min-height: 24px; padding: 0; border-color: transparent; background: transparent; color: var(--color-text); }
.cm-md-toolbar .cm-md-btn:hover { background: var(--color-bg-hover); }
.cm-md-toolbar .cm-md-mode-btn { height: 24px; min-height: 24px; padding: 0 var(--spacing-xs); font-size: var(--font-size-xs); }
.cm-md-toolbar .cm-md-mode-btn + .cm-md-mode-btn { margin-left: -1px; }
.cm-md-toolbar [aria-pressed="true"] { background: var(--color-primary-soft); color: var(--color-primary); border-color: var(--color-primary); }
.cm-md-link-pop {
  position: absolute; left: 0; top: calc(100% + 4px); z-index: 9; display: flex; flex-wrap: wrap; align-items: center; gap: var(--spacing-xs);
  width: 280px; padding: var(--spacing-xs); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-sm);
  box-shadow: var(--shadow-dropdown);
}
.cm-md-link-pop > :first-child { flex: 1 1 160px; min-width: 0; }
.cm-md-link-error { flex: 1 1 100%; color: var(--color-danger); font-size: var(--font-size-xs); white-space: normal; }
`;

export const MARKDOWN_EDITOR_CSS = [CONTENT, EDITING, TOOLBAR].join("\n");

/** `<style href>` 값 — 같은 값이면 React 가 한 번만 넣는다. */
export const MARKDOWN_EDITOR_STYLE_HREF = "cm-markdown-editor";

/** 편집기·읽기 모습·칸이 각자 넣는 스타일(문서 head 에 한 번만 들어간다). */
export function MarkdownEditorStyle() {
  return (
    <style href={MARKDOWN_EDITOR_STYLE_HREF} precedence="default">
      {MARKDOWN_EDITOR_CSS}
    </style>
  );
}
