/**
 * BFF 경로 이동 차단(2026-10-03 보안 지적) — proxy 는 원래 경로 접두로 권한을 보고 라우트는 디코드한 조각으로 BE URL 을 만들어,
 * 인코딩된 구분자가 섞이면 권한 없는 사용자가 다른 BE 서비스를 부를 수 있었다. 리뷰어 재현:
 *   POST /api/mcm/oasis/noticeBoard/search%2F..%2F..%2FnoticeMgmt%2Fsave   → BE /oasis/noticeMgmt/save
 *   POST /api/mcm/oasis/widgetMemo/..%2F..%2Foasis%2FsecUser%2Fdelete     → BE /oasis/secUser/delete
 * next dev(5199) + 가짜 BE(5198)로 확인하다 같은 결과를 낸 변형도 넣는다:
 *   %5C(역슬래시 — fetch 가 `/` 로 바꾼다), %252F(이중 인코딩), `..;`(Tomcat 이 `;…` 를 떼고 `..` 로 정리 — 그대로 BE 까지 갔다).
 * 날 `..`·`%2e%2e` 조각은 Next(=WHATWG URL)가 proxy 앞에서 정리하므로 proxy 에서는 정리된 경로로 판정된다 — 그 경로의 RBAC 결과를 본다.
 * 라우트가 받는 정리 전 조각은 forwardToBackend 가 한 번 더 막는다.
 * 인증(next-auth)·포털 보호·권한 캐시·BE fetch 는 모의로 막는다.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.BACKEND_CLIENT_KEY = "test-client-key";
  process.env.MCM_WAS_URL = "http://be.test";
});

const getToken = vi.hoisted(() =>
  vi.fn(async (): Promise<Record<string, unknown> | null> => ({ sub: "user1", roles: ["USER"] }))
);
const getUserPerms = vi.hoisted(() => vi.fn(async (): Promise<string[]> => []));

vi.mock("next-auth/jwt", () => ({ getToken }));
vi.mock("@dk-oasis/shared/auth-proxy", () => ({
  createPortalAuthProxy: () => vi.fn(),
}));
vi.mock("@/lib/auth/api-permission-cache", () => ({
  getUserPerms,
  invalidateRole: vi.fn(),
  invalidateAll: vi.fn(),
}));

import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { isUnsafeApiPath } from "@/lib/http/path-guard";
import { forwardToBackend } from "@/lib/http/be-proxy";
import { GET as restGet } from "@/app/api/[module]/rest/[objId]/[action]/[...path]/route";

const BFF = "http://bff.test";
const FILE_ID = "0123456789abcdef0123456789abcdef";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
vi.spyOn(console, "warn").mockImplementation(() => {});

afterEach(() => {
  fetchMock.mockReset();
  getToken.mockReset();
  getToken.mockResolvedValue({ sub: "user1", roles: ["USER"] });
  getUserPerms.mockReset();
  getUserPerms.mockResolvedValue([]);
});

async function callProxy(path: string, method = "POST") {
  const res = await proxy(new NextRequest(`${BFF}${path}`, { method }));
  return { status: res.status, passed: res.headers.get("x-middleware-next") === "1" };
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

/** 리뷰어 재현 경로 — 둘 다 로그인만 보는 접두(noticeBoard/search, widgetMemo/) 아래라 옛 proxy 는 통과시켰다. */
const REVIEWER_PATHS = [
  "/api/mcm/oasis/noticeBoard/search%2F..%2F..%2FnoticeMgmt%2Fsave",
  "/api/mcm/oasis/widgetMemo/..%2F..%2Foasis%2FsecUser%2Fdelete",
];
/** 확인 중 같은 결과를 낸 변형. */
const VARIANT_PATHS = [
  "/api/mcm/oasis/noticeBoard/search%5C..%5C..%5CnoticeMgmt%5Csave",
  "/api/mcm/oasis/noticeBoard/search%5c..%5c..%5cnoticeMgmt%5csave",
  "/api/mcm/oasis/noticeBoard/search%2f..%2f..%2fnoticeMgmt%2fsave",
  "/api/mcm/oasis/noticeBoard/search%252F..%252F..%252FnoticeMgmt%252Fsave",
  "/api/mcm/oasis/noticeBoard/search%25252F..%25252FnoticeMgmt",
  "/api/mcm/oasis/noticeBoard/search/..;/..;/..;/..;/..;/oasis/noticeMgmt/save",
  "/api/mcm/oasis/noticeBoard/search/..%3B/..%3b/x",
  "/api/mcm/oasis/noticeBoard/search%2E%2E",
  "/api/mcm/oasis/widgetMemo/%2e%2e%2fx",
];

describe("isUnsafeApiPath — 순수 판정", () => {
  it("인코딩된 / \\ . ; (대소문자·이중 인코딩)·날 \\ ;·점 조각이면 참", () => {
    for (const path of [
      ...REVIEWER_PATHS,
      ...VARIANT_PATHS,
      "/api/a/%2F",
      "/api/a/%5C",
      "/api/a/%2E",
      "/api/a/%3B",
      "/api/a/%252e",
      "/api/a/%25255C",
      "/api/a\\b",
      "/api/a;b",
      // 날 점 조각 — Next 가 proxy 앞에서 정리하지만, 라우트 조각으로 만든 BE 경로에는 남는다.
      "/api/a/../b",
      "/api/a/./b",
      "/../x",
      "/a/..",
    ]) {
      expect(isUnsafeApiPath(path), path).toBe(true);
    }
  });

  it("정상 호출부 경로는 거짓 — 파일 이름의 점·한글 인코딩·퍼센트 글자 자체·숫자 16진 파일 id", () => {
    for (const path of [
      "/api/mcm/oasis/noticeBoard/search",
      "/api/mcm/oasis/secUser/myMenus",
      `/api/mcm/rest/widgetMedia/file/api/mcm/widgetMedia/file/${FILE_ID}`, // widget-types/media/media.ts
      "/api/mcm/rest/commWidgetMng/upload/api/mcm/commWidgetMng/upload", // widget-types/media/upload.ts
      "/api/analog/rest/logViewer/search/log/range/time", // m-analog log-viewer-api.ts (조회 문자열은 경로가 아니다)
      "/api/mcm/mdmMeta/columns", // shared mdm-meta store
      "/api/mcm/lov/master/UNIT/KG",
      "/api/mpn/rest/plannedOrderMng/search/api/planned-orders",
      "/api/mcm/rest/x/download/api/files/report.v2.xlsx",
      "/api/mcm/rest/x/download/api/files/.hidden", // 점으로 시작하는 이름은 점 조각이 아니다
      "/api/mcm/rest/x/download/api/files/%ED%95%9C%EA%B8%80.xlsx",
      "/api/mcm/rest/x/download/api/files/50%25.txt",
      "/api/mcm/rest/x/download/api/files/a...b",
    ]) {
      expect(isUnsafeApiPath(path), path).toBe(false);
    }
  });
});

describe("proxy — 경로 모양 검사는 권한 판정보다 먼저", () => {
  it("리뷰어 재현 경로와 변형은 로그인한 사용자여도 400 — 권한 캐시를 보지 않는다", async () => {
    for (const path of [...REVIEWER_PATHS, ...VARIANT_PATHS]) {
      expect(await callProxy(path), path).toEqual({ status: 400, passed: false });
    }
    expect(getUserPerms).not.toHaveBeenCalled();
  });

  it("로그인하지 않았어도 401 이 아니라 400 — 세션을 보기 전에 거절한다", async () => {
    getToken.mockResolvedValue(null);
    for (const path of REVIEWER_PATHS) {
      expect(await callProxy(path), path).toEqual({ status: 400, passed: false });
    }
    expect(getToken).not.toHaveBeenCalled();
  });

  it("내부 경로 아래 인코딩 흔적도 400", async () => {
    expect(await callProxy("/api/mcm/internal/cache%2Finvalidate-role")).toEqual({
      status: 400,
      passed: false,
    });
  });

  it("정상 경로는 그대로 — 로그인만 보는 경로 통과, 파일 이름 점·조회 문자열의 ; 는 RBAC 결과대로", async () => {
    expect(await callProxy("/api/mcm/oasis/noticeBoard/search")).toEqual({ status: 200, passed: true });
    expect(await callProxy("/api/mcm/oasis/widgetMemo/save")).toEqual({ status: 200, passed: true });
    expect(
      await callProxy(`/api/mcm/rest/widgetMedia/file/api/mcm/widgetMedia/file/${FILE_ID}`, "GET")
    ).toEqual({ status: 200, passed: true });
    getUserPerms.mockResolvedValue(["mcm/x/download", "analog/logviewer/search"]);
    expect(await callProxy("/api/mcm/rest/x/download/api/files/report.v2.xlsx", "GET")).toEqual({
      status: 200,
      passed: true,
    });
    expect(
      await callProxy("/api/analog/rest/logViewer/search/log/range/time?from=1;to=2", "GET")
    ).toEqual({ status: 200, passed: true });
  });

  it("날 `..`·`%2e%2e` 조각은 Next 가 proxy 앞에서 정리한다 — 정리된 경로(noticeMgmt/save)의 RBAC 로 403", async () => {
    // NextRequest(=WHATWG URL)가 정리하므로 proxy 는 `..` 를 보지 못한다. 실제 서버(next dev)도 같았다.
    for (const path of [
      "/api/mcm/oasis/noticeBoard/search/../../noticeMgmt/save",
      "/api/mcm/oasis/noticeBoard/search/%2e%2e/%2e%2e/noticeMgmt/save",
    ]) {
      expect(await callProxy(path), path).toEqual({ status: 403, passed: false });
    }
  });
});

describe("forwardToBackend·rest 라우트 — 라우트 조각의 날 점 조각도 BE 로 보내지 않는다", () => {
  it("점 조각·인코딩된 / ; 가 든 BE 경로는 400 이고 BE 를 부르지 않는다", async () => {
    for (const backendPath of [
      "/../../../oasis/widgetMemo/x",
      "/api/mcm/a/./b",
      "/api/mcm/a%2Fb",
      "/api/mcm/a%3Bb",
      "/api/mcm/a/..;/b",
    ]) {
      const res = await forwardToBackend(new NextRequest(`${BFF}/api/mcm/rest/a/b/x`), "mcm", backendPath);
      expect(res.status, backendPath).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rest 라우트 — params 에 `..` 조각이 오면(정리 전 경로) 400", async () => {
    const res = await restGet(new NextRequest(`${BFF}/api/mcm/oasis/widgetMemo/x`), {
      params: Promise.resolve({
        module: "mcm",
        objId: "A",
        action: "B",
        path: ["..", "..", "..", "oasis", "widgetMemo", "x"],
      }),
    });
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("정상 BE 경로는 그대로 보낸다", async () => {
    beOk();
    const res = await forwardToBackend(
      new NextRequest(`${BFF}/api/mcm/rest/x/download/api/files/report.v2.xlsx`),
      "mcm",
      "/api/files/report.v2.xlsx"
    );
    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls[0][0]).toBe("http://be.test/api/files/report.v2.xlsx");
  });
});
