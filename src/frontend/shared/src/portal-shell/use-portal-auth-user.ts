"use client";

import { useEffect, useState } from "react";
import { getJson } from "../http";

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
  // Authenticated user fetch
  const [authenticatedUser, setAuthenticatedUser] = useState<{
    id: string;
    name: string | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await getJson<{
          authenticated: boolean;
          user: { id: string; name?: string | null } | null;
        }>("/api/auth/me", { credentials: "same-origin" });
        if (!cancelled) {
          if (response.authenticated && response.user) {
            setAuthenticatedUser({ id: response.user.id, name: response.user.name ?? null });
          } else {
            setAuthenticatedUser(null);
          }
        }
      } catch {
        if (!cancelled) setAuthenticatedUser(null);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const displayUserName = userName?.trim() || authenticatedUser?.name?.trim() || "사용자";
  const displayLoginId = userLoginId?.trim() || authenticatedUser?.id?.trim() || "로그인아이디";

  return { displayUserName, displayLoginId };
}
