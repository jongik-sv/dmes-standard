/**
 * 로그 분석 (anl/logViewer) — Monaco 커스텀 'log' 언어(Monarch 토크나이저).
 * 원본: analog-express-ui-plate src/config/tokens.js 이식.
 * ※ 정규식은 원본 그대로 — 변경 금지.
 * 토큰 색 규칙('logview' 테마)은 공용 편집기의 전역 테마 dmes-code 로 옮겼다(@dk-oasis/shared/code-editor, code-theme.ts).
 */

import type { MonacoApi } from "@dk-oasis/shared/code-editor";

export const LOG_LANGUAGE_ID = "log";

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

/**
 * 'log' 언어 등록 — 앱 수명 중 1회만 수행 (기등록 시 no-op).
 * monaco-loader 가 shared 로더의 monaco 를 받은 뒤 호출한다.
 */
export function registerLogLanguage(monaco: MonacoApi): void {
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
}
