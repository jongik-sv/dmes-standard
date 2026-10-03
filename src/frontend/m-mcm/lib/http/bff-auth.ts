/**
 * BFF API 라우트에서 인증된 사용자 컨텍스트를 추출하는 헬퍼.
 *
 * <p>BFF↔BE 신뢰 채널 모델 — 백엔드 액세스 토큰은 더 이상 forward 대상이 아니다.
 * 사용자 컨텍스트(userId, roles)만 추출하여 OASIS proxy 가 X-Authenticated-* 헤더로
 * 부착한다. BE 는 ClientKeyFilter 가 X-Client-Key 검증 후 두 헤더로 인증을 set 한다.
 */
import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";
import { sessionCookieName } from "@/lib/auth/session-cookie";

const AUTH_SECRET = process.env.AUTH_SECRET;

export interface BffAuthContext {
  userId: string;
  role?: string;
  roles?: string[];
  userName?: string;
}

/**
 * NextAuth 세션에서 사용자 컨텍스트(userId, roles)를 추출한다.
 *
 * 인증 소스는 NextAuth 세션 쿠키 하나뿐이다. 요청 헤더(`X-Authenticated-User` / `X-Authenticated-Role` 등)의
 * 사용자 정보는 어떤 표식이 붙어 있어도 믿지 않는다 — 옛 `X-Internal-Bff-Call: 1` + 사용자 헤더 fallback 은
 * 로그인하지 않은 브라우저도 그 헤더를 붙여 아무 사용자로 BE 를 부를 수 있었다(2026-10-03 보안 지적).
 * 서버 코드가 사용자 대신 OASIS 를 부를 때는 BFF 를 다시 부르지 않고 BE 를 바로 부른다(oasis-client.ts).
 *
 * 인증 실패 시 null 을 반환한다.
 */
export async function getBffAuthContext(req: NextRequest): Promise<BffAuthContext | null> {
  // 1) 쿠키 기반 NextAuth 세션 — 이름은 NextAuth 와 같은 함수로 정한다(https 면 `__Secure-` 쿠키만, lib/auth/session-cookie.ts).
  const cookieName = sessionCookieName();
  const token = await getToken({ req, secret: AUTH_SECRET, cookieName });
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

  // 토큰 내용·요청 헤더 값은 남기지 않는다(세션 정보·비밀이 로그로 새지 않게).
  console.warn(
    "[bff-auth] 인증 실패 — cookie:",
    cookieName,
    "secret존재:",
    !!AUTH_SECRET,
    "token:",
    token ? "sub 없음" : "없음"
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
