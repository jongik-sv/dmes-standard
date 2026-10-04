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
