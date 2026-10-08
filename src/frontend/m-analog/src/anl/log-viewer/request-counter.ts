"use client";

/**
 * 동시 요청 카운터 — 로딩 wave 표시용 외부 스토어 (원본 loadingRequestCnt 동일 의미).
 * 화면 루트 state 로 두면 조회 1회에 begin/end 두 번 루트 전체가 다시 그려지므로(Screen-Performance-Guide R5),
 * 값을 쓰는 탭바만 useSyncExternalStore 로 구독한다.
 */

export interface RequestCounter {
  begin: () => void;
  end: () => void;
  subscribe: (listener: () => void) => () => void;
  /** 진행 중인 요청이 있는지 — 불리언이라 개수가 바뀌어도 로딩 여부가 같으면 구독자를 깨우지 않는다. */
  isLoading: () => boolean;
}

export function createRequestCounter(): RequestCounter {
  let count = 0;
  const listeners = new Set<() => void>();
  const change = (delta: number) => {
    const wasLoading = count > 0;
    count = Math.max(0, count + delta);
    if (wasLoading !== count > 0) listeners.forEach((listener) => listener());
  };
  return {
    begin: () => change(1),
    end: () => change(-1),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    isLoading: () => count > 0,
  };
}
