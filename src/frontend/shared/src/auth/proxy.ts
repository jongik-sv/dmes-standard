import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { resolveAuthCookieNames } from "./cookies";

export const PORTAL_PAGE_PROXY_MATCHER = ["/portal/:path*"];

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

export function createPortalAuthProxy(options: CreatePortalAuthProxyOptions) {
  const loginPath = options.loginPath ?? "/login";
  const protectedPathPrefix = options.protectedPathPrefix ?? "/portal";
  const authCookieNames = resolveAuthCookieNames({
    cookiePrefix: options.authCookiePrefix,
    nextAuthUrl: options.nextAuthUrl,
  });

  return async function proxy(request: NextRequest) {
    if (!request.nextUrl.pathname.startsWith(protectedPathPrefix)) {
      return NextResponse.next();
    }

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

    if (token?.sub) {
      return NextResponse.next();
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = loginPath;
    loginUrl.search = "";
    loginUrl.searchParams.set("callbackUrl", resolveCallbackUrl(request));

    return NextResponse.redirect(loginUrl);
  };
}
