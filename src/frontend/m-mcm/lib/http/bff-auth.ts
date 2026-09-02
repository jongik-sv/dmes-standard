/**
 * BFF API 라우트에서 인증된 사용자 컨텍스트를 추출하는 헬퍼.
 *
 * <p>BFF↔BE 신뢰 채널 모델 — 백엔드 액세스 토큰은 더 이상 forward 대상이 아니다.
 * 사용자 컨텍스트(userId, roles)만 추출하여 OASIS proxy 가 X-Authenticated-* 헤더로
 * 부착한다. BE 는 ClientKeyFilter 가 X-Client-Key 검증 후 두 헤더로 인증을 set 한다.
 */
import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

const AUTH_SECRET = process.env.AUTH_SECRET;
const AUTH_COOKIE_PREFIX = process.env.AUTH_COOKIE_PREFIX ?? "oasis-mcm-auth";
const SESSION_COOKIE_NAME = `${AUTH_COOKIE_PREFIX}.session-token`;

export interface BffAuthContext {
  userId: string;
  role?: string;
  roles?: string[];
  userName?: string;
}

/**
 * NextAuth 세션에서 사용자 컨텍스트(userId, roles)를 추출한다.
 *
 * 인증 소스 우선순위:
 *  1) NextAuth 세션 쿠키 (브라우저 → BFF 일반 호출)
 *  2) `X-Internal-Bff-Call: 1` + `X-Authenticated-User` / `X-Authenticated-Role` 헤더 fallback
 *     서버 사이드 self-fetch (oasis-client.ts → BFF) 는 NextAuth 쿠키가 자동 전달되지
 *     않으므로, internal 표식이 있을 때 호출자가 명시 부착한 두 헤더로 컨텍스트 복원.
 *
 * 인증 실패 시 null 을 반환한다.
 */
export async function getBffAuthContext(req: NextRequest): Promise<BffAuthContext | null> {
  // 1) 쿠키 기반 NextAuth 세션
  const token = await getToken({ req, secret: AUTH_SECRET, cookieName: SESSION_COOKIE_NAME });
  if (token?.sub) {
    const tokenRoles = Array.isArray(token.roles)
      ? (token.roles as unknown[]).filter((r): r is string => typeof r === "string")
      : undefined;
    return {
      userId: token.sub,
      role: typeof token.role === "string" ? token.role : undefined,
      roles: tokenRoles,
      userName: typeof token.name === "string" && token.name.trim() ? token.name.trim() : undefined,
    };
  }

  // 2) Internal self-fetch fallback (oasis-client.ts → BFF)
  if (req.headers.get("x-internal-bff-call") === "1") {
    const headerUser = req.headers.get("x-authenticated-user");
    if (headerUser && headerUser.trim()) {
      const headerRole = req.headers.get("x-authenticated-role");
      const roles = headerRole
        ? headerRole.split(",").map((r) => r.trim()).filter(Boolean)
        : undefined;
      return {
        userId: headerUser.trim(),
        role: roles?.[0],
        roles,
        userName: req.headers.get("x-authenticated-user-name")?.trim() || undefined,
      };
    }
  }

  console.warn(
    "[bff-auth] 인증 실패 — cookie:",
    SESSION_COOKIE_NAME,
    "secret존재:",
    !!AUTH_SECRET,
    "internal:",
    req.headers.get("x-internal-bff-call"),
    "token:",
    token
  );
  return null;
}

/**
 * 인증 실패 시 401 응답을 반환한다.
 */
export function unauthorizedResponse(): NextResponse {
  return NextResponse.json(
    { success: false, error: { code: "UNAUTHORIZED", message: "인증이 필요합니다." } },
    { status: 401 }
  );
}
