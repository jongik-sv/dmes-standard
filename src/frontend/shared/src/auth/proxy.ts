import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { resolveAuthCookieNames } from "./cookies";

// 로그인 경로도 포함한다 — 복호화 불가한 세션 쿠키를 여기서 지워야 하기 때문이다(아래 staleSession 주석).
export const PORTAL_PAGE_PROXY_MATCHER = ["/portal/:path*", "/login"];

export interface CreatePortalAuthProxyOptions {
  authCookiePrefix: string;
  authSecret?: string;
  nextAuthUrl?: string;
  loginPath?: string;
  protectedPathPrefix?: string;
}

function resolveCallbackUrl(request: NextRequest): string {
  return `${request.nextUrl.pathname}${request.nextUrl.search}`;
}

/**
 * 복호화 불가/만료된 세션 쿠키 제거.
 *
 * <p>AUTH_SECRET 이 바뀌면(배포·시크릿 교체·개발자 .env 재생성) 브라우저에 남은 JWE 세션 쿠키를
 * 더 이상 풀 수 없다. next-auth 는 이때 예외를 밖으로 던지지 않고 콘솔에
 * {@code [next-auth][error][JWT_SESSION_ERROR] "decryption operation failed"} 를 찍고 null 을 준다.
 * 화면은 로그인으로 잘 떨어지지만, 쿠키를 그대로 두면 <b>요청마다</b> 같은 오류가 반복된다.
 * 그래서 토큰을 못 얻은 시점에 쿠키를 즉시 만료시켜 스스로 회복하게 한다.
 */
function clearStaleSessionCookies(
  response: NextResponse,
  cookieNames: { sessionToken: string; callbackUrl: string }
): NextResponse {
  response.cookies.set(cookieNames.sessionToken, "", { path: "/", maxAge: 0 });
  response.cookies.set(cookieNames.callbackUrl, "", { path: "/", maxAge: 0 });
  return response;
}

export function createPortalAuthProxy(options: CreatePortalAuthProxyOptions) {
  const loginPath = options.loginPath ?? "/login";
  const protectedPathPrefix = options.protectedPathPrefix ?? "/portal";
  const authCookieNames = resolveAuthCookieNames({
    cookiePrefix: options.authCookiePrefix,
    nextAuthUrl: options.nextAuthUrl,
  });

  return async function proxy(request: NextRequest) {
    const path = request.nextUrl.pathname;
    const isProtected = path.startsWith(protectedPathPrefix);
    const isLoginPage = path === loginPath;

    if (!isProtected && !isLoginPage) {
      return NextResponse.next();
    }

    const hasSessionCookie = Boolean(request.cookies.get(authCookieNames.sessionToken));

    let token: Awaited<ReturnType<typeof getToken>> = null;
    try {
      token = await getToken({
        req: request,
        secret: options.authSecret,
        cookieName: authCookieNames.sessionToken,
      });
    } catch {
      token = null;
    }

    // 쿠키는 있는데 토큰이 안 나오면 복호화 실패이거나 만료다 — 쿠키를 지워 반복 오류를 끊는다.
    const staleSession = hasSessionCookie && !token?.sub;

    if (isLoginPage) {
      const response = NextResponse.next();
      return staleSession ? clearStaleSessionCookies(response, authCookieNames) : response;
    }

    if (token?.sub) {
      return NextResponse.next();
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = loginPath;
    loginUrl.search = "";
    loginUrl.searchParams.set("callbackUrl", resolveCallbackUrl(request));

    const response = NextResponse.redirect(loginUrl);
    return staleSession ? clearStaleSessionCookies(response, authCookieNames) : response;
  };
}
