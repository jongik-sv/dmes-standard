/**
 * mcm 포털 NextAuth 쿠키 이름 — 한 곳에서 정한다(서버 전용, 순수 모듈).
 *
 * <p>NextAuth(lib/auth/config.ts → shared auth-server)와 포털 보호 proxy(shared auth-proxy)는 shared
 * {@link resolveAuthCookieNames} 로 이름을 정해, NEXTAUTH_URL 이 https 면 `__Secure-oasis-mcm-auth.session-token` 을 쓴다.
 * 그런데 proxy.ts·bff-auth.ts·be-proxy.ts 는 접두 없는 고정 이름을 읽어, https 에서는 같은 사이트의 다른 하위 도메인이나 평문
 * 응답이 심은 접두 없는 쿠키를 세션으로 읽을 수 있었다(`__Secure-` 쿠키는 브라우저가 https 응답에서 Secure 로만 받는다).
 * 이제 모두 이 함수 결과를 쓴다 — https 에서는 `__Secure-` 쿠키만 읽고 접두 없는 쿠키는 무시한다(2026-10-03 보안 지적).
 *
 * <p>환경변수는 부를 때마다 읽는다(시험이 NEXTAUTH_URL 을 바꿔 볼 수 있게). 계산은 문자열 몇 개라 요청마다 불러도 된다.
 * lib/auth/config.ts 는 proxy 에서 import 하지 않는다(AUTH_SECRET 이 없으면 던지는 인증 묶음을 만든다) — 그래서 이 모듈을 따로 둔다.
 */
import { resolveAuthCookieNames } from "@dk-oasis/shared/auth-cookies";

/** 쿠키 이름 접두 기본값 — .env.example 의 AUTH_COOKIE_PREFIX 와 같다. */
export const DEFAULT_AUTH_COOKIE_PREFIX = "oasis-mcm-auth";

/** NextAuth 쿠키 접두(AUTH_COOKIE_PREFIX). NextAuth 설정·포털 보호 proxy·BFF 세션 읽기가 같은 값을 쓴다. */
export function authCookiePrefix(): string {
  return process.env.AUTH_COOKIE_PREFIX ?? DEFAULT_AUTH_COOKIE_PREFIX;
}

/** 강제 로그아웃이 지울 인증 쿠키 이름 — 접두는 AUTH_COOKIE_PREFIX, http·https 변형을 모두 담는다. */
export function forceLogoutCookieNames(): string[] {
  const names = new Set<string>();
  for (const nextAuthUrl of ["http://x", "https://x"]) {
    const { sessionToken, callbackUrl, csrfToken } = resolveAuthCookieNames({
      cookiePrefix: authCookiePrefix(),
      nextAuthUrl,
    });
    names.add(sessionToken);
    names.add(callbackUrl);
    names.add(csrfToken);
  }
  return [...names];
}

/** 세션 토큰 쿠키 이름 — NEXTAUTH_URL 이 https 면 `__Secure-` 접두가 붙는다. */
export function sessionCookieName(): string {
  return resolveAuthCookieNames({
    cookiePrefix: authCookiePrefix(),
    nextAuthUrl: process.env.NEXTAUTH_URL,
  }).sessionToken;
}
