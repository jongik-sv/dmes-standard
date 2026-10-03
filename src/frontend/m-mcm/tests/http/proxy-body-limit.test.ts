/**
 * BFF 본문 상한(스펙 2026-10-02-widget-admin-generic §16.3 「BFF 본문 상한 전역 확대」).
 *  1) proxy.ts matcher — Next 자신의 matcher 해석기(getMiddlewareMatchers·getMiddlewareRouteMatcher)로 미디어 올리기
 *     한 경로만 proxy 에서 빠지고, 비슷한 모양(끝 슬래시·대소문자·인코딩·다른 BE 경로)은 모두 proxy 를 거치는지 본다.
 *     Next 는 원 경로와 디코드한 경로 중 하나라도 맞으면 proxy 를 돌린다(next/dist/server/lib/router-utils/resolve-routes.js).
 *  2) proxy — 일반 API 는 Content-Length 가 10MB 를 넘으면 413, 인증·권한 검사는 그대로.
 *  3) 올리기 전용 라우트 — proxy 와 같은 인증·권한 검사(401·403), 10MB 를 넘는 본문을 잘림 없이 BE 로 넘기고 101MB 를 넘으면 413.
 * 인증(next-auth)·포털 보호·권한 캐시·BE fetch 는 모의로 막고, 판정 정책은 실제 shared 빌드를 쓴다.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.BACKEND_CLIENT_KEY = "test-client-key";
  process.env.MCM_WAS_URL = "http://be.test";
});

const getToken = vi.hoisted(() =>
  vi.fn(async (): Promise<Record<string, unknown> | null> => ({ sub: "user1", roles: ["USER"] })),
);
const getUserPerms = vi.hoisted(() => vi.fn(async (): Promise<string[]> => []));

vi.mock("next-auth/jwt", () => ({ getToken }));
vi.mock("@dk-oasis/shared/auth-proxy", () => ({
  createPortalAuthProxy: () => vi.fn(),
}));
vi.mock("@/lib/auth/api-permission-cache", () => ({ getUserPerms }));

import { NextRequest } from "next/server";
import * as pageStaticInfo from "next/dist/build/analysis/get-page-static-info";
import type { ProxyMatcher } from "next/dist/build/analysis/get-page-static-info";
import { getMiddlewareRouteMatcher } from "next/dist/shared/lib/router/utils/middleware-route-matcher";
import { config, proxy } from "@/proxy";
import { POST as uploadPost } from "@/app/api/mcm/rest/commWidgetMng/upload/api/mcm/commWidgetMng/upload/route";
import { API_BODY_MAX_BYTES, MEDIA_UPLOAD_BODY_MAX_BYTES } from "@/lib/http/body-limit";
import { MEDIA_UPLOAD_URL } from "@/widget-types/media/upload";

// Next 가 proxy 의 config.matcher 를 정규식으로 바꾸는 함수 — 런타임에는 내보내지만 .d.ts 에 선언이 없어 형을 붙인다.
const { getMiddlewareMatchers } = pageStaticInfo as unknown as {
  getMiddlewareMatchers: (matcher: string[], nextConfig: { basePath: string; i18n?: undefined }) => ProxyMatcher[];
};

const BFF = "http://bff.test";
const UPLOAD_PERM = "mcm/commwidgetmng/upload";
const MB = 1024 * 1024;

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
// 403 마다 남기는 [RBAC] 경고와 끊긴 전달의 [BFF] 오류 기록은 시험 출력에서 숨긴다.
vi.spyOn(console, "warn").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});

afterEach(() => {
  fetchMock.mockReset();
  getToken.mockReset();
  getToken.mockResolvedValue({ sub: "user1", roles: ["USER"] });
  getUserPerms.mockReset();
  getUserPerms.mockResolvedValue([]);
});

/** totalBytes 만큼을 1MB 조각으로 흘려보내는 본문(메모리에 한꺼번에 만들지 않는다). */
function streamOf(totalBytes: number): ReadableStream<Uint8Array> {
  const chunk = new Uint8Array(MB).fill(7);
  let sent = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= totalBytes) {
        controller.close();
        return;
      }
      const n = Math.min(MB, totalBytes - sent);
      controller.enqueue(n === MB ? chunk : chunk.subarray(0, n));
      sent += n;
    },
  });
}

function streamRequest(path: string, body: ReadableStream<Uint8Array>, headers: Record<string, string> = {}) {
  return new NextRequest(`${BFF}${path}`, {
    method: "POST",
    body,
    headers: { "content-type": "multipart/form-data; boundary=----dmes", ...headers },
    duplex: "half",
  } as ConstructorParameters<typeof NextRequest>[1]);
}

/** BE 대역 — 받은 본문 바이트 수를 세고 올리기 성공 응답을 준다. 본문 스트림이 오류로 끝나면 fetch 처럼 실패한다. */
function backendCountingBytes(): { received: () => number } {
  let received = 0;
  fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
    const reader = (init.body as ReadableStream<Uint8Array>).getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
    }
    return new Response(JSON.stringify({ fileId: "f".repeat(32) }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  return { received: () => received };
}

describe("proxy matcher — 미디어 올리기 한 경로만 proxy 에서 뺀다", () => {
  const matches = getMiddlewareRouteMatcher(getMiddlewareMatchers(config.matcher, { basePath: "" }));
  /** resolve-routes.js 와 같다 — 원 경로 또는 디코드한 경로 중 하나라도 맞으면 proxy 를 돌린다. */
  const proxyRuns = (pathname: string): boolean => {
    let decoded = pathname;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      /* 디코드 실패는 원 경로만 본다 */
    }
    const req = { headers: {} } as never;
    return matches(pathname, req, {}) || matches(decoded, req, {});
  };

  it("화면이 부르는 올리기 URL 은 proxy 를 거치지 않는다", () => {
    expect(MEDIA_UPLOAD_URL).toBe("/api/mcm/rest/commWidgetMng/upload/api/mcm/commWidgetMng/upload");
    expect(proxyRuns(MEDIA_UPLOAD_URL)).toBe(false);
  });

  it("비슷한 모양은 모두 proxy 를 거친다(끝 슬래시·뒤 경로·다른 BE 경로·대소문자·인코딩·.json)", () => {
    for (const path of [
      `${MEDIA_UPLOAD_URL}/`,
      `${MEDIA_UPLOAD_URL}/extra`,
      `${MEDIA_UPLOAD_URL}.json`,
      `${MEDIA_UPLOAD_URL}X`,
      "/api/mcm/rest/commWidgetMng/upload/api/mcm/sample-notices",
      "/api/mcm/rest/commWidgetMng/upload/api/mcm/commWidgetMng",
      "/api/mcm/rest/commwidgetmng/upload/api/mcm/commWidgetMng/upload",
      "/api/mcm/rest/commWidgetMng/upload/api/mcm/commWidgetMng/Upload",
      "/api/mcm/rest/commWidgetMng/upload/api/mcm/commWidgetMng/uploa%64",
      "/api/mcm/rest/commWidgetMng/upload/api%2Fmcm%2FcommWidgetMng%2Fupload",
      "/api/mcm/rest/commWidgetMng/upload//api/mcm/commWidgetMng/upload",
      "/api/mpn/rest/commWidgetMng/upload/api/mcm/commWidgetMng/upload",
    ]) {
      expect(proxyRuns(path), path).toBe(true);
    }
  });

  it("그 밖 /api·포털·로그인 경로는 그대로 proxy 를 거친다", () => {
    for (const path of [
      "/api/mcm/oasis/commWidgetMng/save",
      "/api/mcm/rest/widgetMedia/file/api/mcm/widgetMedia/file/0123456789abcdef0123456789abcdef",
      "/api/mpn/rest/plannedOrderMng/search/api/planned-orders",
      "/api/auth/session",
      "/api/",
      "/portal",
      "/portal/home",
      "/login",
    ]) {
      expect(proxyRuns(path), path).toBe(true);
    }
  });
});

describe("proxy — 일반 API 본문 상한 10MB", () => {
  const SAVE = "/api/mcm/oasis/secWidget/save"; // AUTH_ONLY — 로그인만 되면 통과

  async function call(contentLength: number) {
    const res = await proxy(
      new NextRequest(`${BFF}${SAVE}`, {
        method: "POST",
        body: "{}",
        headers: { "content-type": "application/json", "content-length": String(contentLength) },
      }),
    );
    return { status: res.status, passed: res.headers.get("x-middleware-next") === "1" };
  }

  it("Content-Length 가 10MB 를 넘으면 인증을 보기 전에 413", async () => {
    const res = await call(API_BODY_MAX_BYTES + 1);
    expect(res).toEqual({ status: 413, passed: false });
    expect(getToken).not.toHaveBeenCalled();
  });

  it("10MB 이하는 인증·권한 판정으로 넘어간다 — 로그인이면 통과, 아니면 401", async () => {
    expect(await call(API_BODY_MAX_BYTES)).toEqual({ status: 200, passed: true });
    getToken.mockResolvedValue(null);
    expect(await call(API_BODY_MAX_BYTES)).toEqual({ status: 401, passed: false });
  });

  it("올리기 경로를 proxy 로 부르면(인코딩 등으로 matcher 에 걸린 경우) 10MB 상한·권한 검사를 그대로 받는다", async () => {
    getUserPerms.mockResolvedValue([UPLOAD_PERM]);
    const big = await proxy(
      new NextRequest(`${BFF}${MEDIA_UPLOAD_URL}`, {
        method: "POST",
        body: "x",
        headers: { "content-length": String(API_BODY_MAX_BYTES + 1) },
      }),
    );
    expect(big.status).toBe(413);
  });
});

describe("미디어 올리기 전용 라우트 — proxy 와 같은 인증·권한 검사", () => {
  it("로그인하지 않으면 401 — 본문을 BE 로 보내지 않는다", async () => {
    getToken.mockResolvedValue(null);
    const res = await uploadPost(streamRequest(MEDIA_UPLOAD_URL, streamOf(1024)));
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("자기참조 헤더(x-internal-bff-call)를 붙여도 검사를 건너뛰지 않는다", async () => {
    getToken.mockResolvedValue(null);
    const res = await uploadPost(
      streamRequest(MEDIA_UPLOAD_URL, streamOf(1024), { "x-internal-bff-call": "1" }),
    );
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("권한키 mcm/commwidgetmng/upload 가 없으면 403 — 본문을 BE 로 보내지 않는다", async () => {
    getUserPerms.mockResolvedValue(["mcm/commwidgetmng/save"]);
    const res = await uploadPost(streamRequest(MEDIA_UPLOAD_URL, streamOf(1024)));
    expect(res.status).toBe(403);
    expect(getUserPerms).toHaveBeenCalledWith("user1", { roles: ["USER"] });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("미디어 올리기 전용 라우트 — 본문 상한 101MB", () => {
  it("10MB 를 넘는 본문(12MB)을 잘림 없이 BE 로 넘긴다", async () => {
    getUserPerms.mockResolvedValue([UPLOAD_PERM]);
    const be = backendCountingBytes();
    const res = await uploadPost(streamRequest(MEDIA_UPLOAD_URL, streamOf(12 * MB)));

    expect(res.status).toBe(200);
    expect(be.received()).toBe(12 * MB);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://be.test/api/mcm/commWidgetMng/upload");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["content-type"]).toBe(
      "multipart/form-data; boundary=----dmes",
    );
  });

  it("Content-Length 가 101MB 를 넘으면 본문을 읽지 않고 413", async () => {
    getUserPerms.mockResolvedValue([UPLOAD_PERM]);
    const res = await uploadPost(
      streamRequest(MEDIA_UPLOAD_URL, streamOf(1024), {
        "content-length": String(MEDIA_UPLOAD_BODY_MAX_BYTES + 1),
      }),
    );
    expect(res.status).toBe(413);
    expect((await res.json()).error.code).toBe("PAYLOAD_TOO_LARGE");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Content-Length 없이 101MB 를 넘게 흘려보내면 넘는 순간 끊고 413", async () => {
    getUserPerms.mockResolvedValue([UPLOAD_PERM]);
    const be = backendCountingBytes();
    const res = await uploadPost(streamRequest(MEDIA_UPLOAD_URL, streamOf(MEDIA_UPLOAD_BODY_MAX_BYTES + 1)));
    expect(res.status).toBe(413);
    expect(be.received()).toBeLessThanOrEqual(MEDIA_UPLOAD_BODY_MAX_BYTES);
  });
});
