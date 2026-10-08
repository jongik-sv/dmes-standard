"use client";

/**
 * 항상 같은 참조를 돌려주면서 호출 시점의 최신 함수를 부르는 콜백.
 * memo 한 자식(서비스 목록·사이드바·탭바 등)에 넘기는 핸들러가 렌더마다 새로 만들어져 memo 가 무효가 되는 것을 막는다.
 * 렌더 중에 호출하면 안 된다(이벤트 핸들러 전용).
 */

import { useCallback, useEffect, useRef } from "react";

export function useStableCallback<Args extends unknown[], Result>(
  fn: (...args: Args) => Result,
): (...args: Args) => Result {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: Args) => ref.current(...args), []);
}
