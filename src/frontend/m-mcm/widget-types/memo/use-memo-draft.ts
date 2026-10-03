"use client";

/**
 * 개인 메모 임시 저장 쓰기 — 글·형식이 바뀔 때마다 바로 쓰지 않고 300ms 디바운스로 모아 쓴다.
 * - schedule(key, draft): 쓸 값(draft=null 이면 임시본 지우기)을 맡기고 타이머를 다시 건다.
 * - drop(): 맡긴 값을 쓰지 않고 버린다 — 저장 성공·[취소]·[버리기]처럼 임시본을 지우는 순간에 부른다. 그러지 않으면 타이머나
 *   언마운트 뒤처리가 방금 지운 임시본을 다시 쓴다(지우기 → drop 순서가 아니라 drop → 지우기 순서로 부른다).
 * - 위젯이 사라질 때(탭 전환·화면 이동) 아직 못 쓴 값은 바로 쓴다. 위젯이 그대로인 채 페이지가 사라지는 경우(새로 고침·탭 닫기·401 리다이렉트)는
 *   언마운트 뒤처리가 돌지 않을 수 있으므로 `pagehide` 와 `visibilitychange`(hidden)에서도 바로 쓴다.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";

import { removeDraft, writeDraft } from "./memo-draft-storage";
import { MEMO_DRAFT_DELAY_MS, type MemoDraft } from "./memo-model";

interface PendingWrite {
  key: string;
  /** null 이면 임시본을 지운다. */
  draft: MemoDraft | null;
}

export interface MemoDraftWriter {
  schedule(key: string, draft: MemoDraft | null): void;
  drop(): void;
}

export function useMemoDraftWriter(): MemoDraftWriter {
  const pending = useRef<PendingWrite | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopTimer = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const flush = useCallback(() => {
    stopTimer();
    const write = pending.current;
    pending.current = null;
    if (!write) return;
    if (write.draft) writeDraft(write.key, write.draft);
    else removeDraft(write.key);
  }, [stopTimer]);

  const schedule = useCallback(
    (key: string, draft: MemoDraft | null) => {
      pending.current = { key, draft };
      stopTimer();
      timer.current = setTimeout(flush, MEMO_DRAFT_DELAY_MS);
    },
    [flush, stopTimer]
  );

  const drop = useCallback(() => {
    stopTimer();
    pending.current = null;
  }, [stopTimer]);

  // 페이지가 사라지거나 가려질 때(pagehide·visibilitychange hidden)와 언마운트 때 아직 못 쓴 값을 바로 쓴다. 리스너는 마운트 때 달고 정리 때 뗀다.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      flush();
    };
  }, [flush]);

  return useMemo(() => ({ schedule, drop }), [schedule, drop]);
}
