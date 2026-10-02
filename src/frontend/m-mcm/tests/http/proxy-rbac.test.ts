/**
 * proxy.ts(BFF 미들웨어) — 미디어 위젯 REST 경로의 RBAC 연결(2026-10-03 보안 지적).
 *  - 내려받기 `/api/mcm/rest/widgetMedia/file/api/mcm/widgetMedia/file/{fileId}` 는 GET·HEAD 만 인증만 본다.
 *  - 같은 접두에 다른 BE 경로를 붙이거나 쓰기 메서드로 부르면 메뉴 RBAC(권한키 mcm/widgetmedia/file)로 403.
 *  - 올리기 `/api/mcm/rest/commWidgetMng/upload/…` 는 위젯관리 RBAC(mcm/commwidgetmng/upload).
 * 판정 함수 자체는 shared rbac-policy 시험이 본다. 여기서는 proxy.ts 의 정책 설정과 req.method 전달을 실제 shared 빌드로 확인한다.
 * 인증(next-auth)·포털 보호·권한 캐시는 모의 모듈로 막는다.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const getUserPerms = vi.hoisted(() => vi.fn(async (): Promise<string[]> => []));

vi.mock("next-auth/jwt", () => ({
  getToken: vi.fn(async () => ({ sub: "user1", roles: ["USER"] })),
}));
vi.mock("@dk-oasis/shared/auth-proxy", () => ({
  createPortalAuthProxy: () => vi.fn(),
}));
vi.mock("@/lib/auth/api-permission-cache", () => ({ getUserPerms }));

import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

const BFF = "http://bff.test";
const MEDIA_FILE = "/api/mcm/rest/widgetMedia/file/api/mcm/widgetMedia/file/";
const FILE_ID = "0123456789abcdef0123456789abcdef";
const UPLOAD = "/api/mcm/rest/commWidgetMng/upload/api/mcm/commWidgetMng/upload";

// 403 마다 proxy.ts 가 남기는 [RBAC] 경고는 시험 출력에서 숨긴다.
vi.spyOn(console, "warn").mockImplementation(() => {});

afterEach(() => {
  getUserPerms.mockReset();
  getUserPerms.mockResolvedValue([]);
});

async function call(path: string, method: string) {
  const res = await proxy(new NextRequest(`${BFF}${path}`, { method }));
  return { status: res.status, passed: res.headers.get("x-middleware-next") === "1" };
}

describe("proxy — 미디어 파일 내려받기(읽기 전용 AUTH_ONLY)", () => {
  it("GET·HEAD 는 권한키 없이 통과하고 권한 캐시를 보지 않는다", async () => {
    for (const method of ["GET", "HEAD"]) {
      expect(await call(`${MEDIA_FILE}${FILE_ID}`, method)).toEqual({ status: 200, passed: true });
    }
    expect(getUserPerms).not.toHaveBeenCalled();
  });

  it("쓰기 메서드는 403(메뉴 RBAC 로 넘어간다)", async () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(await call(`${MEDIA_FILE}${FILE_ID}`, method)).toEqual({ status: 403, passed: false });
    }
  });

  it("같은 접두에 다른 BE 경로를 붙이면 GET 이어도 403", async () => {
    for (const path of [
      "/api/mcm/rest/widgetMedia/file/api/mcm/sample-notices",
      "/api/mcm/rest/widgetMedia/file/api/mcm/master-codes/groups/B029/items",
      `${MEDIA_FILE}${FILE_ID}/extra`,
    ]) {
      expect(await call(path, "GET"), path).toEqual({ status: 403, passed: false });
    }
  });

  it("경로 조작(.. · %2e%2e · %2f · //)도 403 — URL 이 정규화된 뒤에도 내려받기 모양이 아니다", async () => {
    for (const path of [
      `${MEDIA_FILE}../../sample-notices`,
      `${MEDIA_FILE}%2e%2e/%2e%2e/sample-notices`,
      `${MEDIA_FILE}${FILE_ID}%2f..%2f..%2fsample-notices`,
      `/api/mcm/rest/widgetMedia/file//api/mcm/widgetMedia/file/${FILE_ID}`,
    ]) {
      expect(await call(path, "GET"), path).toEqual({ status: 403, passed: false });
    }
  });
});

describe("proxy — 미디어 올리기(위젯관리 RBAC)", () => {
  it("권한키 mcm/commwidgetmng/upload 가 있으면 통과, 없으면 403", async () => {
    getUserPerms.mockResolvedValue(["mcm/commwidgetmng/upload"]);
    expect(await call(UPLOAD, "POST")).toEqual({ status: 200, passed: true });

    getUserPerms.mockResolvedValue([]);
    expect(await call(UPLOAD, "POST")).toEqual({ status: 403, passed: false });
  });
});
