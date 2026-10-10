/**
 * DMES 코드 편집기 공용 — monaco-editor 동적 로드 싱글턴.
 *
 * SSR 회피: monaco-editor 는 모듈 최상위에서 import 하면 서버 렌더 때 DOM API 를 참조해 깨진다.
 * 그래서 이 파일은 `import type` 으로 타입만 가져오고 실제 모듈은 `import("monaco-editor")` 동적 호출로만 읽는다.
 * 로드 promise 를 싱글턴으로 공유하고, 처음 한 번 전역 테마 `dmes-code` 를 정의한다.
 * 불러오기에 실패하면 promise 를 비워 다음 호출이 다시 시도하게 한다(호출자는 대체 칸을 보인다).
 *
 * 웹워커는 배선하지 않는다. Monaco 가 콘솔 경고를 내고 메인 스레드로 동작한다(로그 뷰어와 같은 동작).
 */
import type * as Monaco from "monaco-editor";
import { defineDmesCodeTheme } from "./code-theme";

export type MonacoApi = typeof Monaco;

let monacoPromise: Promise<MonacoApi> | null = null;

export function loadMonaco(): Promise<MonacoApi> {
  if (!monacoPromise) {
    monacoPromise = import("monaco-editor").then(
      (monaco) => {
        defineDmesCodeTheme(monaco);
        return monaco;
      },
      (err: unknown) => {
        monacoPromise = null;
        throw err;
      },
    );
  }
  return monacoPromise;
}
