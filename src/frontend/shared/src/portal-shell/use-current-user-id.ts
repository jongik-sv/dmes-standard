"use client";

import { useEffect, useState } from "react";
import { getCurrentUser, peekCurrentUser, subscribeCurrentUser } from "./current-user";

/**
 * 확인된 사용자 ID 만 필요한 곳(분할 크기 저장 키 등)에 쓰는 훅 — RBAC 구독을 늘리지 않는다(K4).
 * 첫 렌더는 이미 확인된 값(없으면 ""), 확인되거나 사용자가 바뀌면 다시 그린다. 권한 판정에는 쓰지 않는다.
 */
export function useCurrentUserId(): string {
  const [userId, setUserId] = useState(() => peekCurrentUser()?.id ?? "");
  useEffect(() => {
    let cancelled = false;
    const unsubscribe = subscribeCurrentUser((user) => setUserId(user?.id ?? ""));
    getCurrentUser().then(
      (result) => {
        if (!cancelled && result.ok) setUserId(result.user.id);
      },
      () => {}
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);
  return userId;
}

/** {@link useCurrentUserState} 의 결과. */
export interface CurrentUserState {
  /** 확인된 사용자 ID — 확인 전·실패·enabled=false 면 "". */
  userId: string;
  /** 확인이 끝나기 전이면 true. enabled=false 면 처음부터 false. */
  isLoading: boolean;
}

/**
 * 확인된 사용자 ID 와 확인 진행 여부가 필요한 곳(사용자별 저장 키·임시 저장 등)에 쓰는 훅 — RBAC 를 구독하지 않는다(F3).
 * `useUserButtonRbac().userId` 를 대신한다: 권한 목록이 바뀌어도 다시 그리지 않고, 사용자 확인만 기다린다.
 * 첫 렌더는 확인 전(userId "", isLoading true)이다. 이 세션의 마지막 사용자로 미리 읽는 곳은 `peekLastUserId` 를 따로 쓴다.
 * enabled=false 면 사용자 확인을 요청하지 않는다. 권한 판정에는 쓰지 않는다.
 */
export function useCurrentUserState(enabled: boolean = true): CurrentUserState {
  const [state, setState] = useState<CurrentUserState>({ userId: "", isLoading: enabled });
  useEffect(() => {
    if (!enabled) {
      setState((prev) => (prev.userId === "" && !prev.isLoading ? prev : { userId: "", isLoading: false }));
      return;
    }
    let cancelled = false;
    const unsubscribe = subscribeCurrentUser((user) => {
      setState((prev) => (prev.userId === (user?.id ?? "") && !prev.isLoading ? prev : { userId: user?.id ?? "", isLoading: false }));
    });
    getCurrentUser().then(
      (result) => {
        if (cancelled) return;
        const id = result.ok ? result.user.id : "";
        setState((prev) => (prev.userId === id && !prev.isLoading ? prev : { userId: id, isLoading: false }));
      },
      () => {
        if (!cancelled) setState((prev) => (prev.userId === "" && !prev.isLoading ? prev : { userId: "", isLoading: false }));
      }
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [enabled]);
  return state;
}
