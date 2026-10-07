/**
 * 포털 인증 쿠키 접두 — NextAuth 설정(로그인)·포털 보호 proxy·강제 로그아웃이 같은 AUTH_COOKIE_PREFIX 이름을 쓴다.
 *  옛 동작: lib/auth/config.ts 가 접두를 "oasis-mcm-auth" 로 고정해, AUTH_COOKIE_PREFIX 를 바꾸면 로그인은 옛 이름으로 쿠키를 심고
 *  proxy 는 새 이름을 읽어 /login ↔ /portal 무한 리디렉션이 났다(2026-10-02 발견, 10-03 session-cookie.ts 로 한 곳에서 읽게 고침).
 * 접두는 proxy·config 모듈이 불릴 때 한 번 정해지므로 환경 변수를 바꾼 뒤 모듈을 새로 불러 확인한다.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const AUTH_SECRET = vi.hoisted(() => {
  const secret = "test-auth-secret-0123456789abcdef0123456789abcdef";
  process.env.AUTH_SECRET = secret;
  process.env.BACKEND_CLIENT_KEY = "test-client-key";
  process.env.MCM_WAS_URL = "http://be.test";
  return secret;
});

vi.mock("@/lib/auth/api-permission-cache", () => ({
  getUserPerms: vi.fn(async (): Promise<string[]> => []),
  invalidateRole: vi.fn(),
  invalidateAll: vi.fn(),
}));

import { encode } from "next-auth/jwt";
import { NextRequest } from "next/server";

const BFF = "http://localhost:5100";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function load(prefix: string | undefined) {
  vi.resetModules();
  vi.stubEnv("NEXTAUTH_URL", BFF);
  vi.stubEnv("AUTH_COOKIE_PREFIX", prefix);
  const { proxy } = await import("@/proxy");
  const config = await import("@/lib/auth/config");
  const { sessionCookieName, forceLogoutCookieNames } = await import("@/lib/auth/session-cookie");
  return { proxy, config, sessionCookieName, forceLogoutCookieNames };
}

async function page(path: string, cookieName?: string): Promise<NextRequest> {
  const token = await encode({ token: { sub: "user1", roles: ["USER"] }, secret: AUTH_SECRET });
  return new NextRequest(`${BFF}${path}`, {
    headers: cookieName ? { cookie: `${cookieName}=${token}` } : {},
  });
}

describe("환경 변수가 없으면 기본 이름", () => {
  it("로그인(config)·proxy·강제 로그아웃이 oasis-mcm-auth 를 쓴다", async () => {
    const { proxy, config, sessionCookieName, forceLogoutCookieNames } = await load(undefined);
    expect(config.sessionTokenCookieName).toBe("oasis-mcm-auth.session-token");
    expect(sessionCookieName()).toBe("oasis-mcm-auth.session-token");
    expect([...forceLogoutCookieNames()].sort()).toEqual(
      [
        "oasis-mcm-auth.session-token",
        "__Secure-oasis-mcm-auth.session-token",
        "oasis-mcm-auth.callback-url",
        "__Secure-oasis-mcm-auth.callback-url",
        "oasis-mcm-auth.csrf-token",
        "__Host-oasis-mcm-auth.csrf-token",
      ].sort()
    );
    const res = await proxy(await page("/portal", "oasis-mcm-auth.session-token"));
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });
});

describe("AUTH_COOKIE_PREFIX=other-auth", () => {
  it("로그인(config)·proxy·강제 로그아웃이 같은 이름을 쓴다", async () => {
    const { config, sessionCookieName, forceLogoutCookieNames } = await load("other-auth");
    expect(config.sessionTokenCookieName).toBe("other-auth.session-token");
    expect(sessionCookieName()).toBe(config.sessionTokenCookieName);
    const names = forceLogoutCookieNames();
    expect(names).toEqual(
      expect.arrayContaining([
        "other-auth.session-token",
        "__Secure-other-auth.session-token",
        "other-auth.csrf-token",
        "__Host-other-auth.csrf-token",
      ])
    );
    expect(names.some((name) => name.includes("oasis-mcm-auth"))).toBe(false);
  });

  it("강제 로그아웃 라우트가 접두 기준 이름을 만료시키고 __Secure-·__Host- 쿠키에는 Secure 를 붙인다", async () => {
    await load("other-auth");
    const { POST } = await import("@/app/api/auth/force-logout/route");
    const setCookies = (await POST()).headers.getSetCookie();
    expect(setCookies).toHaveLength(6);
    for (const line of setCookies) {
      const name = line.split("=")[0];
      expect(name).toContain("other-auth");
      expect(line).toMatch(/Expires=Thu, 01 Jan 1970/);
      expect(/;\s*Secure/i.test(line)).toBe(name.startsWith("__Secure-") || name.startsWith("__Host-"));
    }
  });

  it("접두에 대문자·특수문자가 있어도 로그인·proxy·강제 로그아웃이 같은 정규화 이름을 쓴다", async () => {
    const { config, sessionCookieName, forceLogoutCookieNames } = await load("Other.Auth");
    expect(config.sessionTokenCookieName).toBe("other-auth.session-token");
    expect(sessionCookieName()).toBe("other-auth.session-token");
    expect(forceLogoutCookieNames()).toContain("other-auth.session-token");
  });

  it("/portal: 로그인이 심는 이름의 쿠키면 통과, 옛 고정 이름 쿠키면 /login 으로 보낸다", async () => {
    const { proxy, config } = await load("other-auth");
    const ok = await proxy(await page("/portal", config.sessionTokenCookieName));
    expect(ok.headers.get("x-middleware-next")).toBe("1");
    const old = await proxy(await page("/portal", "oasis-mcm-auth.session-token"));
    expect(old.status).toBe(307);
    expect(old.headers.get("location")).toContain("/login");
  });

  it("/login: 로그인된 쿠키를 알아봐 되돌려 보내지 않고 쿠키도 지우지 않는다", async () => {
    const { proxy, config } = await load("other-auth");
    const res = await proxy(await page("/login", config.sessionTokenCookieName));
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});
