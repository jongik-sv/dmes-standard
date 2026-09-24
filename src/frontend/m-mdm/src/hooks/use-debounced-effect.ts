"use client";

/**
 * 디바운스 이펙트 — termMng 유사어 추천 패널(A-RECO) 전용(TSK-04-02 design.md §1).
 *
 * 화면 모듈은 `@mantine/hooks` 를 import 할 수 없으므로(SKILL.md Part B) 순수 `useEffect`+`setTimeout`
 * 으로 만든다. `LookupModal.tsx` 의 취소 패턴(디바운스 타이머 + 이전 요청 `AbortController.abort()`)을
 * 그대로 가져온다 — 입력이 빠르게 바뀌는 동안 쌓인 이전 요청들이 늦게 도착해 최신 결과를 덮어쓰는 사고를
 * 막는다.
 */
import { useEffect, useRef } from "react";

/**
 * @param effect 디바운스 뒤 실행할 비동기 콜백. `signal` 을 fetch 에 그대로 넘긴다.
 * @param deps 이 배열이 바뀔 때마다 타이머를 다시 건다(react 의 의존성 배열과 동일 규칙).
 * @param delayMs 디바운스 지연(ms).
 */
export function useDebouncedEffect(
  effect: (signal: AbortSignal) => void | Promise<void>,
  deps: readonly unknown[],
  delayMs: number,
): void {
  // effect 는 매 렌더 새 함수로 내려오므로 ref 로 최신본을 참조한다(LookupModal.tsx 의 fetchRef 와 동일 이유).
  const effectRef = useRef(effect);
  effectRef.current = effect;
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      void effectRef.current(controller.signal);
    }, delayMs);

    return () => {
      window.clearTimeout(timer);
      controllerRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
