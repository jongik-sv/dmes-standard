"use client";

/** 콘텐츠 유형 렌더러·편집기 공용 훅(markdown·html·web·links). */
import { useEffect, useRef, useSyncExternalStore } from "react";

/**
 * 편집기 검사 결과를 관리 화면(onValidate)에 알린다. 처음 그릴 때 한 번, 그 뒤로는 오류 목록이 바뀔 때만 부른다.
 * onValidate 는 ref 로 들고 오류 목록 문자열을 의존값으로 쓴다 — 부모가 매번 새 함수를 넘기고 그 안에서 상태를 바꿔도
 * 다시 부르는 고리(무한 렌더)가 생기지 않는다.
 */
export function useReportErrors(errors: readonly string[], onValidate?: (errors: string[]) => void): void {
  const ref = useRef(onValidate);
  useEffect(() => {
    ref.current = onValidate;
  });
  const key = JSON.stringify(errors);
  useEffect(() => {
    ref.current?.(JSON.parse(key) as string[]);
  }, [key]);
}

const noopSubscribe = () => () => {};

/** 포털(지금 문서)의 출처. 서버 렌더에서는 null — window 를 렌더 중에 바로 읽지 않는다. */
export function usePortalOrigin(): string | null {
  return useSyncExternalStore(
    noopSubscribe,
    () => window.location.origin,
    () => null
  );
}

/** 새 탭으로 연다(opener 없이 — 열린 사이트가 포털 창을 조작하지 못하게). */
export function openInNewTab(url: string): void {
  window.open(url, "_blank", "noopener");
}
