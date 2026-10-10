/**
 * 로그 분석 (anl/logViewer) — monaco-editor 로드.
 *
 * 로더와 전역 테마(dmes-code)는 공용 편집기(@dk-oasis/shared/code-editor)의 `loadMonaco` 가 맡는다.
 * 여기서는 shared 가 준 monaco 에 로그 언어('log' Monarch)만 한 번 더 등록한다(등록 가드는 registerLogLanguage 내부).
 * 로그 토큰 색 규칙은 테마 dmes-code 에 들어 있다(shared code-theme.ts).
 */

import { loadMonaco as loadSharedMonaco } from "@dk-oasis/shared/code-editor";
import type { MonacoApi } from "@dk-oasis/shared/code-editor";
import { registerLogLanguage } from "./log-language";

export type { MonacoApi };

export function loadMonaco(): Promise<MonacoApi> {
  return loadSharedMonaco().then((monaco) => {
    registerLogLanguage(monaco);
    return monaco;
  });
}
