"use client";

import { useEffect, useState } from "react";
import { getCurrentUser, peekCurrentUser, type CurrentUser } from "./current-user";

/**
 * PortalShell 내부 훅 — 헤더에 보일 사용자 이름·로그인 아이디.
 * `/api/auth/me` 로 인증 사용자를 한 번 조회하고, props 값이 있으면 그것을 먼저 쓴다.
 * 패키지 공개 export 가 아니다(portal-shell.tsx 만 쓴다).
 */
export function usePortalAuthUser({
  userName,
  userLoginId,
}: {
  userName?: string;
  userLoginId?: string;
}): { displayUserName: string; displayLoginId: string } {
  // Authenticated user — 공유 사용자 확인(진행 중 요청 공유·세션 캐시, K3). 이미 확인됐으면 첫 렌더부터 쓴다.
  const [authenticatedUser, setAuthenticatedUser] = useState<CurrentUser | null>(() => peekCurrentUser());

  useEffect(() => {
    let cancelled = false;
    getCurrentUser().then(
      (result) => {
        if (!cancelled) setAuthenticatedUser(result.ok ? result.user : null);
      },
      () => {
        if (!cancelled) setAuthenticatedUser(null);
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const displayUserName = userName?.trim() || authenticatedUser?.name?.trim() || "사용자";
  const displayLoginId = userLoginId?.trim() || authenticatedUser?.id?.trim() || "로그인아이디";

  return { displayUserName, displayLoginId };
}
