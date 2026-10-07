import { NextResponse } from "next/server";
import { forceLogoutCookieNames } from "@/lib/auth/session-cookie";

/**
 * 401 응답 시 클라이언트가 호출하는 강제 로그아웃 엔드포인트.
 * 백엔드 재시작 등으로 BFF 토큰이 무효화되었지만 NextAuth JWT 쿠키는 살아있는 상황에서
 * 무한 redirect 루프(/portal ↔ /login)를 끊기 위해 모든 인증 쿠키를 명시적으로 삭제한다.
 *
 * 클리어 대상:
 *  - NextAuth 세션 쿠키 (http·https 변형 모두 포함, 접두는 AUTH_COOKIE_PREFIX)
 *  - NextAuth callback-url, csrf-token 쿠키
 */
export async function POST() {
  const res = NextResponse.json({ ok: true });

  for (const name of forceLogoutCookieNames()) {
    res.cookies.set({
      name,
      value: "",
      path: "/",
      expires: new Date(0),
      // `__Secure-`·`__Host-` 쿠키는 Secure 속성이 없는 Set-Cookie 를 브라우저가 무시한다.
      secure: name.startsWith("__Secure-") || name.startsWith("__Host-"),
    });
  }

  return res;
}
