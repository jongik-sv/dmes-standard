import { NextResponse } from "next/server";

/**
 * 401 응답 시 클라이언트가 호출하는 강제 로그아웃 엔드포인트.
 * 백엔드 재시작 등으로 BFF 토큰이 무효화되었지만 NextAuth JWT 쿠키는 살아있는 상황에서
 * 무한 redirect 루프(/portal ↔ /login)를 끊기 위해 모든 인증 쿠키를 명시적으로 삭제한다.
 *
 * 클리어 대상:
 *  - NextAuth 세션 쿠키 (오리진별 prefix 변형 모두 포함)
 *  - NextAuth callback-url, csrf-token 쿠키
 */
export async function POST() {
  const res = NextResponse.json({ ok: true });

  const cookieNames = [
    "oasis-mcm-auth.session-token",
    "__Secure-oasis-mcm-auth.session-token",
    "oasis-mcm-auth.callback-url",
    "__Secure-oasis-mcm-auth.callback-url",
    "oasis-mcm-auth.csrf-token",
    "__Host-oasis-mcm-auth.csrf-token",
  ];

  for (const name of cookieNames) {
    res.cookies.set({
      name,
      value: "",
      path: "/",
      expires: new Date(0),
    });
  }

  return res;
}
