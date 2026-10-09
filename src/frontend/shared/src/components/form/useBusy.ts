"use client";

/**
 * 용도별 busy 훅 — 목록 조회·저장·삭제처럼 서로 다른 비동기 작업의 진행 상태를 키별로 따로 둔다(Screen-Performance-Guide R5).
 *
 * 화면 루트에 `busy`/`isSaving` 하나만 두면 조회가 끝나는 것만으로도 저장 단추·상세 폼까지 같은 상태에 묶여 다시 그려진다.
 * 키별로 나누면 조회 중에는 `isBusy("list")` 만 켜지고, 저장 단추는 `isBusy("save")` 만 본다.
 * 같은 키로 겹쳐 부르면 횟수를 세어 마지막 작업이 끝날 때까지 busy 를 유지한다.
 *
 * 쓰는 법: `const { isBusy, run } = useBusy();` → `run("save", () => api.save(row))` → `<Button loading={isBusy("save")} />`.
 * 상태가 바뀌면 이 훅을 쓰는 컴포넌트가 다시 그려지므로, busy 를 읽는 부분(단추 줄 등)을 작은 컴포넌트로 나눠 거기서 부른다.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export interface UseBusyResult {
  /** 키가 진행 중인지. 키를 생략하면 어느 작업이든 진행 중인지. */
  isBusy: (key?: string) => boolean;
  /** `fn` 을 부르는 동안 `key` 를 busy 로 둔다. 성공·실패와 관계없이 끝나면 풀리고, 결과·오류는 그대로 돌려준다. */
  run: <T>(key: string, fn: () => Promise<T>) => Promise<T>;
}

export function useBusy(): UseBusyResult {
  const [counts, setCounts] = useState<Readonly<Record<string, number>>>({});
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const bump = useCallback((key: string, delta: 1 | -1) => {
    if (!mountedRef.current) return;
    setCounts((prev) => {
      const n = (prev[key] ?? 0) + delta;
      if (n <= 0) {
        if (!(key in prev)) return prev;
        const { [key]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [key]: n };
    });
  }, []);

  const run = useCallback(
    async <T,>(key: string, fn: () => Promise<T>): Promise<T> => {
      bump(key, 1);
      try {
        return await fn();
      } finally {
        bump(key, -1);
      }
    },
    [bump]
  );

  const isBusy = useCallback(
    (key?: string) => (key === undefined ? Object.keys(counts).length > 0 : (counts[key] ?? 0) > 0),
    [counts]
  );

  return { isBusy, run };
}
