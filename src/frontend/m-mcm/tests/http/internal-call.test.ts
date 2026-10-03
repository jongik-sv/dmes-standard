/**
 * BFF 내부 호출 판정 — 브라우저가 붙인 헤더로는 인증·권한 검사를 건너뛸 수 없다(2026-10-03 보안 지적,
 * 스펙 2026-10-02-widget-admin-generic §16.3).
 *  옛 동작: proxy 가 `x-internal-bff-call: 1` 이면 검사 없이 통과시켰고, bff-auth 가 같은 헤더가 있으면
 *  `x-authenticated-user`·`x-authenticated-role` 을 사용자로 믿었다. 그래서 로그인하지 않은 브라우저도 세 헤더만 붙이면
 *  /api/{module}/oasis/* 를 아무 사용자(역할)로 BE 에 보낼 수 있었다(BE 는 X-Client-Key 를 보고 그 사용자를 믿는다).
 *  지금 동작:
 *   1) 내부 호출로 인정하는 곳은 /api/mcm/internal/*(BE → BFF 권한 캐시 무효화) 한 갈래뿐이고, 증명은 BE → BFF 전용 비밀
 *      BFF_INTERNAL_SECRET 을 X-Bff-Internal-Secret 에 싣는 것이다. BFF → BE 마스터 비밀(BACKEND_CLIENT_KEY·X-Client-Key)로는
 *      열리지 않는다(BE 가 마스터 비밀을 BFF 쪽으로 보내지 않게 나눴다). 운영에서 저장소 로컬 값·마스터 비밀과 같은 값이면 거절한다.
 *      그 밖 경로는 어떤 헤더로도 검사를 건너뛰지 않는다.
 *   2) bff-auth 는 세션 쿠키만 본다 — 요청 헤더의 사용자 정보는 믿지 않는다.
 *   3) BE 로 넘기는 헤더는 BFF 가 새로 만든다 — 클라이언트가 보낸 X-Client-Key·X-Authenticated-*·x-internal-bff-call 은 가지 않는다.
 *   4) 서버 코드의 OASIS 호출(oasis-client)은 BFF 를 다시 부르지 않고 BE 를 바로 부른다.
 * 인증(next-auth)·포털 보호·권한 캐시·BE fetch 는 모의로 막고, 판정 정책·OASIS 프록시는 실제 shared 빌드를 쓴다.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.BACKEND_CLIENT_KEY = "test-client-key";
  process.env.BFF_INTERNAL_SECRET = "test-internal-secret";
  process.env.MCM_WAS_URL = "http://be.test";
});

const getToken = vi.hoisted(() =>
  vi.fn(async (): Promise<Record<string, unknown> | null> => ({ sub: "user1", roles: ["USER"] }))
);
const getUserPerms = vi.hoisted(() => vi.fn(async (): Promise<string[]> => []));
const invalidateRole = vi.hoisted(() => vi.fn());
const invalidateAll = vi.hoisted(() => vi.fn());

vi.mock("next-auth/jwt", () => ({ getToken }));
vi.mock("@dk-oasis/shared/auth-proxy", () => ({
  createPortalAuthProxy: () => vi.fn(),
}));
vi.mock("@/lib/auth/api-permission-cache", () => ({ getUserPerms, invalidateRole, invalidateAll }));

import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { isTrustedInternalCall } from "@/lib/http/internal-call";
import { forwardToBackend } from "@/lib/http/be-proxy";
import { callOasisService } from "@/lib/http/oasis-client";
import { POST as oasisPost } from "@/app/api/[module]/oasis/[serviceId]/[action]/route";
import { POST as invalidateRolePost } from "@/app/api/mcm/internal/cache/invalidate-role/route";

const BFF = "http://bff.test";
/** BFF → BE 마스터 비밀(BACKEND_CLIENT_KEY). 내부 경로는 이 값으로 열리지 않는다. */
const KEY = "test-client-key";
/** BE → BFF 내부 호출 비밀(BFF_INTERNAL_SECRET). */
const SECRET = "test-internal-secret";
const LOCAL_DEFAULT = "dmes-bff-internal-local-2026";
const INVALIDATE = "/api/mcm/internal/cache/invalidate-role";
/** 옛 우회에 쓰이던 헤더 묶음 — 내부 표식 + 사칭할 사용자·역할. */
const SPOOF = {
  "x-internal-bff-call": "1",
  "x-authenticated-user": "admin",
  "x-authenticated-role": "SYSADMIN",
  "x-authenticated-user-name": encodeURIComponent("관리자"), // 헤더 값은 바이트 문자열이라 BFF 처럼 URL 인코딩해 붙인다
};

type Headerset = Record<string, string>;

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
// 403 마다 남기는 [RBAC] 경고와 bff-auth 의 인증 실패 기록은 시험 출력에서 숨긴다.
vi.spyOn(console, "warn").mockImplementation(() => {});
// 운영 설정 오류 알림(console.error)도 숨긴다 — 값은 남기지 않는다.
const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

afterEach(() => {
  vi.unstubAllEnvs();
  fetchMock.mockReset();
  getToken.mockReset();
  getToken.mockResolvedValue({ sub: "user1", roles: ["USER"] });
  getUserPerms.mockReset();
  getUserPerms.mockResolvedValue([]);
  invalidateRole.mockReset();
  invalidateAll.mockReset();
});

async function callProxy(path: string, headers: Record<string, string> = {}, method = "POST") {
  const res = await proxy(new NextRequest(`${BFF}${path}`, { method, headers }));
  return { status: res.status, passed: res.headers.get("x-middleware-next") === "1" };
}

function beOk(): void {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ meta: { txId: "t", success: true, code: "OK" }, data: {} }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  );
}

/** fetch 가 받은 헤더를 소문자 이름으로 모은다(대소문자만 다른 같은 이름이 둘이면 값이 둘 다 남는다). */
function sentHeaders(call = 0): Record<string, string[]> {
  const init = fetchMock.mock.calls[call][1] as RequestInit;
  const out: Record<string, string[]> = {};
  for (const [name, value] of Object.entries(init.headers as Record<string, string>)) {
    (out[name.toLowerCase()] ??= []).push(value);
  }
  return out;
}

describe("isTrustedInternalCall — X-Bff-Internal-Secret 이 BFF_INTERNAL_SECRET 과 같을 때만 참", () => {
  const h = (headers: Record<string, string>) => new Headers(headers);

  it("맞는 내부 비밀이면 참", () => {
    expect(isTrustedInternalCall(h({ "x-bff-internal-secret": SECRET }))).toBe(true);
  });

  it("마스터 비밀(X-Client-Key)만·옛 표식·틀린 비밀·길이가 다른 비밀·빈 값·없음은 거짓", () => {
    for (const headers of <Headerset[]>[
      { "x-client-key": KEY },
      { "x-client-key": SECRET },
      { "x-bff-internal-secret": KEY },
      { "x-internal-bff-call": "1" },
      { "x-internal-bff-call": SECRET },
      { "x-bff-internal-secret": "1" },
      { "x-bff-internal-secret": "test-internal-secreu" },
      { "x-bff-internal-secret": `${SECRET}x` },
      { "x-bff-internal-secret": SECRET.slice(0, -1) },
      { "x-bff-internal-secret": "" },
      {},
    ]) {
      expect(isTrustedInternalCall(h(headers)), JSON.stringify(headers)).toBe(false);
    }
  });

  it("서버에 비밀이 없거나(빈 값·공백) 비어 있으면 무엇을 보내도 거짓 — 빈 값끼리 같다고 통과하지 않는다", () => {
    for (const value of [undefined, "", "   "]) {
      vi.stubEnv("BFF_INTERNAL_SECRET", value);
      for (const presented of ["", "   ", SECRET, KEY, "1"]) {
        expect(
          isTrustedInternalCall(h({ "x-bff-internal-secret": presented, "x-client-key": presented })),
          `${value}/${presented}`
        ).toBe(false);
      }
    }
  });

  it("운영(NODE_ENV=production)에서 저장소 로컬 값이면 맞게 보내도 거짓 — 개발에서는 참", () => {
    vi.stubEnv("BFF_INTERNAL_SECRET", LOCAL_DEFAULT);
    const local = h({ "x-bff-internal-secret": LOCAL_DEFAULT });
    vi.stubEnv("NODE_ENV", "development");
    expect(isTrustedInternalCall(local)).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    expect(isTrustedInternalCall(local)).toBe(false);
    vi.stubEnv("BFF_INTERNAL_SECRET", ` ${LOCAL_DEFAULT} `);
    expect(isTrustedInternalCall(h({ "x-bff-internal-secret": ` ${LOCAL_DEFAULT} ` }))).toBe(false);
    // 운영이어도 별도 비밀이면 참
    vi.stubEnv("BFF_INTERNAL_SECRET", "prod-internal-secret");
    expect(isTrustedInternalCall(h({ "x-bff-internal-secret": "prod-internal-secret" }))).toBe(true);
    // 알림에 비밀 값을 남기지 않는다
    for (const call of errorSpy.mock.calls) {
      expect(String(call.join(" "))).not.toContain(LOCAL_DEFAULT);
    }
  });

  it("내부 비밀이 BACKEND_CLIENT_KEY 와 같으면 거짓 — 같으면 BE 가 마스터 비밀을 보내는 것과 다르지 않다", () => {
    vi.stubEnv("BFF_INTERNAL_SECRET", KEY);
    expect(isTrustedInternalCall(h({ "x-bff-internal-secret": KEY }))).toBe(false);
    expect(isTrustedInternalCall(h({ "x-client-key": KEY }))).toBe(false);
  });
});

describe("proxy — 업무 경로는 어떤 헤더로도 검사를 건너뛰지 않는다", () => {
  const RBAC_PATH = "/api/mcm/oasis/commWidgetMng/save"; // 메뉴 RBAC(권한키 mcm/commwidgetmng/save)

  it("로그인하지 않은 요청에 옛 우회 헤더를 붙여도 401", async () => {
    getToken.mockResolvedValue(null);
    for (const path of [
      RBAC_PATH,
      "/api/mcm/oasis/secUser/myMenus",
      "/api/mcm/rest/commWidgetMng/search/api/x",
    ]) {
      expect(await callProxy(path, SPOOF), path).toEqual({ status: 401, passed: false });
    }
  });

  it("로그인했지만 권한키가 없는 사용자가 옛 우회 헤더를 붙여도 403", async () => {
    expect(await callProxy(RBAC_PATH, SPOOF)).toEqual({ status: 403, passed: false });
    expect(getUserPerms).toHaveBeenCalledWith("user1", { roles: ["USER"] });
  });

  it("맞는 X-Client-Key·내부 비밀을 붙여도 내부 경로가 아니면 일반 검사 그대로(로그인 없으면 401, 권한 없으면 403)", async () => {
    const both = { ...SPOOF, "x-client-key": KEY, "x-bff-internal-secret": SECRET };
    getToken.mockResolvedValue(null);
    expect(await callProxy(RBAC_PATH, both)).toEqual({ status: 401, passed: false });
    getToken.mockResolvedValue({ sub: "user1", roles: ["USER"] });
    expect(await callProxy(RBAC_PATH, both)).toEqual({ status: 403, passed: false });
  });

  it("권한키가 있으면 통과 — 정상 경로는 그대로", async () => {
    getUserPerms.mockResolvedValue(["mcm/commwidgetmng/save"]);
    expect(await callProxy(RBAC_PATH)).toEqual({ status: 200, passed: true });
  });
});

describe("proxy — 내부 경로(/api/mcm/internal/*)는 BFF_INTERNAL_SECRET 으로만 연다", () => {
  it("맞는 내부 비밀이면 세션 없이 통과하고 세션·권한 캐시를 보지 않는다", async () => {
    getToken.mockResolvedValue(null);
    expect(await callProxy(INVALIDATE, { "x-bff-internal-secret": SECRET })).toEqual({
      status: 200,
      passed: true,
    });
    expect(getToken).not.toHaveBeenCalled();
    expect(getUserPerms).not.toHaveBeenCalled();
  });

  it("마스터 비밀(X-Client-Key)만·옛 표식만·틀린 비밀·없음은 로그인한 사용자여도 403", async () => {
    for (const headers of <Headerset[]>[
      { "x-client-key": KEY },
      { "x-bff-internal-secret": KEY },
      { "x-internal-bff-call": "1" },
      { "x-bff-internal-secret": "wrong" },
      { "x-bff-internal-secret": "" },
      {},
    ]) {
      expect(await callProxy(INVALIDATE, headers), JSON.stringify(headers)).toEqual({
        status: 403,
        passed: false,
      });
    }
  });

  it("서버에 비밀이 없거나 비면 무엇을 보내도 403", async () => {
    for (const value of ["", "   "]) {
      vi.stubEnv("BFF_INTERNAL_SECRET", value);
      for (const headers of <Headerset[]>[
        { "x-bff-internal-secret": value },
        { "x-bff-internal-secret": SECRET },
        { "x-client-key": KEY },
        { "x-internal-bff-call": "1" },
      ]) {
        expect(await callProxy(INVALIDATE, headers), `${value}/${JSON.stringify(headers)}`).toEqual({
          status: 403,
          passed: false,
        });
      }
    }
  });

  it("여는 경로는 무효화 정확 경로 하나뿐 — internal 아래 다른 경로는 맞는 비밀이어도 404, BE·세션을 보지 않는다", async () => {
    getToken.mockResolvedValue(null);
    for (const path of [
      "/api/mcm/internal/",
      "/api/mcm/internal/cache",
      "/api/mcm/internal/cache/",
      "/api/mcm/internal/cache/invalidate-role/",
      "/api/mcm/internal/cache/invalidate-role/x",
      "/api/mcm/internal/cache/invalidate-roles",
      "/api/mcm/internal/cache/invalidate-all",
      "/api/mcm/internal/sec/perm-keys",
    ]) {
      for (const headers of <Headerset[]>[{ "x-bff-internal-secret": SECRET }, {}]) {
        expect(await callProxy(path, headers), `${path} ${JSON.stringify(headers)}`).toEqual({
          status: 404,
          passed: false,
        });
      }
    }
    expect(getToken).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("운영에서 저장소 로컬 값이면 403", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BFF_INTERNAL_SECRET", LOCAL_DEFAULT);
    expect(await callProxy(INVALIDATE, { "x-bff-internal-secret": LOCAL_DEFAULT })).toEqual({
      status: 403,
      passed: false,
    });
  });
});

describe("OASIS 라우트 — 요청 헤더로 사용자를 바꿀 수 없다", () => {
  const params = {
    params: Promise.resolve({ module: "mcm", serviceId: "secUser", action: "save" }),
  };
  const oasisRequest = (headers: Record<string, string>) =>
    new NextRequest(`${BFF}/api/mcm/oasis/secUser/save`, {
      method: "POST",
      body: "{}",
      headers: { "content-type": "application/json", ...headers },
    });

  it("세션 없이 옛 우회 헤더(내부 표식 + 사용자·역할)를 붙이면 401 — BE 를 부르지 않는다", async () => {
    getToken.mockResolvedValue(null);
    const res = await oasisPost(oasisRequest({ ...SPOOF, "x-client-key": KEY }), params);
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("로그인한 사용자가 사용자·역할 헤더를 붙여도 BE 에는 세션의 사용자만 간다", async () => {
    beOk();
    const res = await oasisPost(oasisRequest({ ...SPOOF, "x-client-key": "evil" }), params);
    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls[0][0]).toBe("http://be.test/oasis/secUser/save");
    const sent = sentHeaders();
    expect(sent["x-client-key"]).toEqual([KEY]);
    expect(sent["x-authenticated-user"]).toEqual(["user1"]);
    expect(sent["x-authenticated-role"]).toEqual(["USER"]);
    expect(sent["x-authenticated-user-name"]).toBeUndefined();
    expect(sent["x-internal-bff-call"]).toBeUndefined();
  });
});

describe("권한 캐시 무효화 라우트 — 라우트도 비밀을 한 번 더 본다", () => {
  const invalidate = (headers: Record<string, string>, body = { roleId: "SYSADMIN" }) =>
    invalidateRolePost(
      new NextRequest(`${BFF}${INVALIDATE}`, {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json", ...headers },
      })
    );

  it("맞는 내부 비밀이면 무효화한다", async () => {
    const res = await invalidate({ "x-bff-internal-secret": SECRET });
    expect(res.status).toBe(200);
    expect(invalidateRole).toHaveBeenCalledWith("SYSADMIN");
  });

  it("마스터 비밀만·옛 표식만·틀린 비밀·비밀 없음·운영 로컬 값은 403 — 캐시를 건드리지 않는다", async () => {
    for (const headers of <Headerset[]>[
      { "x-client-key": KEY },
      { "x-internal-bff-call": "1" },
      { "x-bff-internal-secret": "wrong" },
      {},
    ]) {
      expect((await invalidate(headers, {} as never)).status, JSON.stringify(headers)).toBe(403);
    }
    vi.stubEnv("BFF_INTERNAL_SECRET", "");
    expect((await invalidate({ "x-bff-internal-secret": "" }, {} as never)).status).toBe(403);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BFF_INTERNAL_SECRET", LOCAL_DEFAULT);
    expect((await invalidate({ "x-bff-internal-secret": LOCAL_DEFAULT }, {} as never)).status).toBe(403);
    expect(invalidateRole).not.toHaveBeenCalled();
    expect(invalidateAll).not.toHaveBeenCalled();
  });
});

describe("forwardToBackend — 클라이언트가 보낸 신뢰 헤더는 BE 로 가지 않는다", () => {
  it("X-Client-Key·X-Authenticated-*·x-internal-bff-call 은 BFF 가 만든 값만 간다", async () => {
    beOk();
    const req = new NextRequest(`${BFF}/api/mcm/rest/sampleNotice/search/api/mcm/sample-notices`, {
      headers: { ...SPOOF, "x-client-key": "evil" },
    });
    await forwardToBackend(req, "mcm", "/api/mcm/sample-notices");

    const sent = sentHeaders();
    expect(sent["x-client-key"]).toEqual([KEY]);
    expect(sent["x-authenticated-user"]).toEqual(["user1"]);
    expect(sent["x-authenticated-role"]).toEqual(["USER"]);
    expect(sent["x-authenticated-user-name"]).toBeUndefined();
    expect(sent["x-internal-bff-call"]).toBeUndefined();
  });
});

describe("callOasisService — 서버 코드는 BFF 를 다시 부르지 않고 BE 를 바로 부른다", () => {
  it("MCM_WAS_URL 이 있으면 그 WAS 의 /oasis/… 로 신뢰 채널 헤더를 실어 보낸다", async () => {
    beOk();
    await callOasisService(
      "secUser",
      "search",
      { params: {} },
      { userId: "user1", roles: ["USER", "PLANNER"] }
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://be.test/oasis/secUser/search");
    expect(init.method).toBe("POST");
    const sent = sentHeaders();
    expect(sent["x-client-key"]).toEqual([KEY]);
    expect(sent["x-authenticated-user"]).toEqual(["user1"]);
    expect(sent["x-authenticated-role"]).toEqual(["USER,PLANNER"]);
    expect(sent["x-internal-bff-call"]).toBeUndefined();
  });

  it("MCM_WAS_URL 이 없으면 BACKEND_API_URL(게이트웨이)의 /mcm/oasis/… 로 보낸다", async () => {
    vi.stubEnv("MCM_WAS_URL", "");
    vi.stubEnv("BACKEND_API_URL", "http://gateway.test");
    beOk();
    await callOasisService("secUser", "search", {}, { userId: "user1" });
    expect(fetchMock.mock.calls[0][0]).toBe("http://gateway.test/mcm/oasis/secUser/search");
  });
});
