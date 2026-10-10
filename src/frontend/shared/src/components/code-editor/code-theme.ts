/**
 * DMES 코드 편집기 공용 — Monaco 전역 테마 `dmes-code`.
 *
 * Monaco 테마는 페이지 전체에 하나만 걸린다. 그래서 DMES 의 모든 Monaco 편집기(로그 뷰어·DB 뷰어·SQL 편집기)가 이 테마 하나를 쓴다.
 * `base: "vs"` 위에 로그 뷰어의 토큰 색 규칙을 얹었다. 로그 언어 토큰(PARAMETER·COMPONENT 등)은 SQL 토큰 이름과 겹치지 않아 함께 산다.
 * 정규식·색·fontStyle 은 로그 뷰어(원본 analog-express-ui-plate theme-rules.js) 그대로 — 바꾸지 않는다.
 * `defineTheme` 는 monaco-loader 만 부른다. 다른 코드는 `editor.create({ theme: DMES_CODE_THEME_ID })` 만 쓴다.
 */
import type * as Monaco from "monaco-editor";

export const DMES_CODE_THEME_ID = "dmes-code";

/** 로그 언어 토큰 색 규칙. */
export const LOG_THEME_RULES: Monaco.editor.ITokenThemeRule[] = [
  { token: "PARAMETER", foreground: "#0088FF", fontStyle: "bold" },
  { token: "COMPONENT", foreground: "#AC27FF", fontStyle: "bold" },
  { token: "EXCEPTION", foreground: "#FF2244", fontStyle: "bold" },
  { token: "CC", foreground: "#008800", fontStyle: "bold" },
  { token: "VAL", foreground: "#4b71ca" },
  { token: "EMPHASIZE", foreground: "#4b71ca" },
  { token: "ERROR", foreground: "#ff0000", fontStyle: "bold" },
  { token: "WARN", foreground: "#FFA500" },
];

/** 테마를 정의한다(같은 이름 재정의는 덮어쓰기라 여러 번 불러도 안전하다). */
export function defineDmesCodeTheme(monaco: typeof Monaco): void {
  monaco.editor.defineTheme(DMES_CODE_THEME_ID, {
    base: "vs",
    inherit: true,
    rules: LOG_THEME_RULES,
    colors: {
      "editor.lineHighlightBackground": "#ffffff",
      "editorGutter.background": "#f7f7f7",
    },
  });
}
