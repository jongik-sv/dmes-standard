/**
 * 로그 분석 (anl/logViewer) — Monaco 커스텀 'log' 언어(Monarch 토크나이저) + 'logview' 테마.
 * 원본: analog-express-ui-plate src/config/tokens.js / theme-rules.js 이식.
 * ※ 정규식·색상·fontStyle 은 원본 그대로 — 변경 금지.
 */

import type * as Monaco from "monaco-editor";

export const LOG_LANGUAGE_ID = "log";
export const LOG_THEME_ID = "logview";

/** Monarch root 토큰 규칙 (원본 tokens.js 그대로). */
const LOG_TOKENS: [RegExp, string][] = [
  [/- (service name : |process name : |task )\[.+/, "COMPONENT"],
  [/INFO\s+=+> mapperId :.*$/, "COMPONENT"],
  [/DEBUG ==> Parameters:.*$/, "PARAMETER"],
  [/\bERROR\b/, "ERROR"],
  [/\bWARN\b/, "WARN"],
  [/^\s*at.+$/, "EXCEPTION"],
  [/^Caused by.*$/, "EXCEPTION"],
  [/^###.*$/, "EXCEPTION"],
  [/^\s+\.\.\..*$/, "EXCEPTION"],
  [/^[^2].+$/, "CC"],
];

/** 'logview' 테마 토큰 색 규칙 (원본 theme-rules.js 그대로). */
const LOG_THEME_RULES: Monaco.editor.ITokenThemeRule[] = [
  { token: "PARAMETER", foreground: "#0088FF", fontStyle: "bold" },
  { token: "COMPONENT", foreground: "#AC27FF", fontStyle: "bold" },
  { token: "EXCEPTION", foreground: "#FF2244", fontStyle: "bold" },
  { token: "CC", foreground: "#008800", fontStyle: "bold" },
  { token: "VAL", foreground: "#4b71ca" },
  { token: "EMPHASIZE", foreground: "#4b71ca" },
  { token: "ERROR", foreground: "#ff0000", fontStyle: "bold" },
  { token: "WARN", foreground: "#FFA500" },
];

/**
 * 'log' 언어와 'logview' 테마 등록 — 앱 수명 중 1회만 수행 (기등록 시 no-op).
 * monaco-loader 의 로드 promise 안에서 호출된다.
 */
export function registerLogLanguage(monaco: typeof Monaco): void {
  if (
    monaco.languages.getLanguages().some((lang) => lang.id === LOG_LANGUAGE_ID)
  ) {
    return;
  }

  monaco.languages.register({ id: LOG_LANGUAGE_ID });
  monaco.languages.setMonarchTokensProvider(LOG_LANGUAGE_ID, {
    defaultToken: "",
    tokenizer: {
      root: LOG_TOKENS,
    },
  });
  monaco.editor.defineTheme(LOG_THEME_ID, {
    base: "vs",
    inherit: true,
    rules: LOG_THEME_RULES,
    colors: {
      "editor.lineHighlightBackground": "#ffffff",
      "editorGutter.background": "#f7f7f7",
    },
  });
}
