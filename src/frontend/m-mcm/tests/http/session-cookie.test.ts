/**
 * BFF 세션 쿠키 이름 — NextAuth 와 같은 함수(shared resolveAuthCookieNames)로 정한다(2026-10-03 보안 지적).
 *  옛 동작: proxy.ts·bff-auth.ts·be-proxy.ts 가 `oasis-mcm-auth.session-token` 고정 이름을 읽었다. NextAuth 와 포털 보호 proxy 는
 *  NEXTAUTH_URL 이 https 면 `__Secure-oasis-mcm-auth.session-token` 을 쓰므로, https 에서는 다른 하위 도메인·평문 응답이 심을 수 있는
 *  접두 없는 쿠키를 BFF 가 세션으로 읽었다(`__Secure-` 쿠키는 브라우저가 https 응답에서 Secure 로만 받는다).
 *  지금 동작: https 면 `__Secure-` 쿠키만 읽고 접두 없는 쿠키는 무시, http 면 접두 없는 쿠키.
 * next-auth/jwt 는 모의하지 않는다 — 실제 encode 로 만든 세션 토큰을 실제 getToken 이 어느 쿠키에서 읽는지 본다.
 * 권한 캐시·BE fetch 만 모의로 막는다.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const AUTH_SECRET = vi.hoisted(() => {
  const secret = "test-auth-secret-0123456789abcdef0123456789abcdef";
  process.env.AUTH_SECRET = secret;
  process.env.BACKEND_CLIENT_KEY = "test-client-key";
  process.env.MCM_WAS_URL = "http://be.test";
  return secret;
});

const getUserPerms = vi.hoisted(() => vi.fn(async (): Promise<string[]> => []));
vi.mock("@/lib/auth/api-permission-cache", () => ({
  getUserPerms,
  invalidateRole: vi.fn(),
  invalidateAll: vi.fn(),
}));

import { encode } from "next-auth/jwt";
import { NextRequest } from "next/server";
import { authCookiePrefix, sessionCookieName } from "@/lib/auth/session-cookie";
import { getBffAuthContext } from "@/lib/http/bff-auth";
import { forwardToBackend } from "@/lib/http/be-proxy";
import { proxy } from "@/proxy";

const BFF = "https://portal.test";
const PLAIN = "oasis-mcm-auth.session-token";
const SECURE = "__Secure-oasis-mcm-auth.session-token";
const AUTH_ONLY_PATH = "/api/mcm/oasis/secUser/myMenus";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
vi.spyOn(console, "warn").mockImplementation(() => {});

afterEach(() => {
  vi.unstubAllEnvs();
  fetchMock.mockReset();
});

async function sessionToken(sub = "user1"): Promise<string> {
  return encode({ token: { sub, roles: ["USER"] }, secret: AUTH_SECRET });
}

function request(path: string, cookies: Record<string, string>): NextRequest {
  const cookie = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
  return new NextRequest(`${BFF}${path}`, { headers: cookie ? { cookie } : {} });
}

function beOk(): void {
  fetchMock.mockImplementation(
    async () =>
      new Response(JSON.stringify({ meta: { success: true } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
  );
}

describe("sessionCookieName — NextAuth 와 같은 이름", () => {
  it("NEXTAUTH_URL 이 https 면 __Secure- 접두, http·없음이면 접두 없음", () => {
    vi.stubEnv("NEXTAUTH_URL", "https://portal.example");
    expect(sessionCookieName()).toBe(SECURE);
    vi.stubEnv("NEXTAUTH_URL", "HTTPS://PORTAL.EXAMPLE");
    expect(sessionCookieName()).toBe(SECURE);
    vi.stubEnv("NEXTAUTH_URL", "http://localhost:5100");
    expect(sessionCookieName()).toBe(PLAIN);
    vi.stubEnv("NEXTAUTH_URL", undefined);
    expect(sessionCookieName()).toBe(PLAIN);
  });

  it("접두는 AUTH_COOKIE_PREFIX(기본 oasis-mcm-auth)", () => {
    vi.stubEnv("AUTH_COOKIE_PREFIX", undefined);
    expect(authCookiePrefix()).toBe("oasis-mcm-auth");
    vi.stubEnv("AUTH_COOKIE_PREFIX", "other-auth");
    vi.stubEnv("NEXTAUTH_URL", "https://portal.example");
    expect(sessionCookieName()).toBe("__Secure-other-auth.session-token");
  });
});

describe("https(NEXTAUTH_URL=https://…) — __Secure- 쿠키만 세션으로 읽는다", () => {
  it("bff-auth: 접두 없는 쿠키만 있으면 null, __Secure- 쿠키면 사용자", async () => {
    vi.stubEnv("NEXTAUTH_URL", "https://portal.example");
    const token = await sessionToken();
    expect(await getBffAuthContext(request(AUTH_ONLY_PATH, { [PLAIN]: token }))).toBeNull();
    expect(await getBffAuthContext(request(AUTH_ONLY_PATH, { [SECURE]: token }))).toMatchObject({
      userId: "user1",
    });
    // 둘 다 있으면 __Secure- 쪽 사용자 — 심은 접두 없는 쿠키가 이기지 않는다
    const planted = await sessionToken("attacker");
    expect(
      await getBffAuthContext(request(AUTH_ONLY_PATH, { [PLAIN]: planted, [SECURE]: token }))
    ).toMatchObject({ userId: "user1" });
  });

  it("proxy: 접두 없는 쿠키만 있으면 401, __Secure- 쿠키면 통과", async () => {
    vi.stubEnv("NEXTAUTH_URL", "https://portal.example");
    const token = await sessionToken();
    expect((await proxy(request(AUTH_ONLY_PATH, { [PLAIN]: token }))).status).toBe(401);
    const res = await proxy(request(AUTH_ONLY_PATH, { [SECURE]: token }));
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("forwardToBackend: 접두 없는 쿠키만 있으면 401 이고 BE 를 부르지 않는다, __Secure- 쿠키면 보낸다", async () => {
    vi.stubEnv("NEXTAUTH_URL", "https://portal.example");
    beOk();
    const token = await sessionToken();
    const plain = await forwardToBackend(request("/api/mcm/rest/a/b/api/x", { [PLAIN]: token }), "mcm", "/api/x");
    expect(plain.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    const secure = await forwardToBackend(request("/api/mcm/rest/a/b/api/x", { [SECURE]: token }), "mcm", "/api/x");
    expect(secure.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("http(로컬) — 접두 없는 쿠키", () => {
  it("bff-auth·proxy·forwardToBackend 모두 접두 없는 쿠키를 읽고 __Secure- 쿠키는 읽지 않는다", async () => {
    vi.stubEnv("NEXTAUTH_URL", "http://localhost:5100");
    beOk();
    const token = await sessionToken();
    expect(await getBffAuthContext(request(AUTH_ONLY_PATH, { [PLAIN]: token }))).toMatchObject({
      userId: "user1",
    });
    expect(await getBffAuthContext(request(AUTH_ONLY_PATH, { [SECURE]: token }))).toBeNull();
    expect(
      (await proxy(request(AUTH_ONLY_PATH, { [PLAIN]: token }))).headers.get("x-middleware-next")
    ).toBe("1");
    expect((await proxy(request(AUTH_ONLY_PATH, { [SECURE]: token }))).status).toBe(401);
    expect(
      (await forwardToBackend(request("/api/mcm/rest/a/b/api/x", { [PLAIN]: token }), "mcm", "/api/x")).status
    ).toBe(200);
  });
});
