/**
 * 로그 분석 (anl/logViewer) — monaco-editor 동적 로드 싱글턴.
 *
 * SSR 회피: monaco-editor 는 모듈 top-level 에서 import 하면 서버 렌더 시 DOM API 참조로
 * 깨지므로, 반드시 클라이언트(useEffect) 컨텍스트에서 본 로더를 통해 동적 import 한다.
 * 로드 promise 를 싱글턴으로 공유하고, 최초 1회 'log' 언어/'logview' 테마를 등록한다.
 *
 * 웹워커 미구성 참고: 번들러 워커 배선을 하지 않으므로 monaco 는 콘솔 경고 후
 * 메인 스레드 폴백으로 동작한다(원본 CRA 구성과 동일 동작 — 로그 뷰어 용도로 충분).
 */

import type * as Monaco from "monaco-editor";
import { registerLogLanguage } from "./log-language";

export type MonacoApi = typeof Monaco;

let monacoPromise: Promise<MonacoApi> | null = null;

/** monaco-editor 로드 (1회) + 커스텀 언어/테마 등록 (1회 가드는 registerLogLanguage 내부). */
export function loadMonaco(): Promise<MonacoApi> {
  if (!monacoPromise) {
    monacoPromise = import("monaco-editor").then((monaco) => {
      registerLogLanguage(monaco);
      return monaco;
    });
  }
  return monacoPromise;
}
