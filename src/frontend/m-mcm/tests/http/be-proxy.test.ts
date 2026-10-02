/**
 * be-proxy(BFF → BE 전달) — 미디어 위젯(스펙 2026-10-02-widget-admin-generic §5.1·§5.2)이 기대는 전달 동작.
 *  1) multipart 요청 본문을 바이트 그대로 넘긴다(경계 문자열이 든 Content-Type 포함).
 *  2) 바이너리 응답을 바이트 그대로 돌려준다.
 *  3) Range 요청 헤더를 넘기고, 206·Content-Range·Accept-Ranges·Content-Disposition·X-Content-Type-Options 를 돌려준다.
 * 실제 네트워크 없이 fetch 를 가짜로 바꾼다. 인증(next-auth)·shared 정책은 모의 모듈로 막는다.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.BACKEND_CLIENT_KEY = "test-client-key";
  process.env.MCM_WAS_URL = "http://be.test";
});

vi.mock("next-auth/jwt", () => ({
  getToken: vi.fn(async () => ({ sub: "user1", roles: ["USER"] })),
}));
vi.mock("@dk-oasis/shared/auth-rbac-policy", () => ({
  hasAnyRole: () => false,
}));

import { NextRequest } from "next/server";
import {
  backendTimeoutMs,
  forwardToBackend,
  pickRequestHeaders,
  pickResponseHeaders,
} from "@/lib/http/be-proxy";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

afterEach(() => {
  fetchMock.mockReset();
});

function bytes(n: number, start = 0): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = (start + i) % 256;
  return out;
}

describe("backendTimeoutMs", () => {
  const MIN = 60 * 1000;
  const FILE_ID = "0123456789abcdef0123456789abcdef";

  it("미디어 올리기(POST)·파일 내려받기(GET·HEAD)는 export 와 같은 5분", () => {
    expect(backendTimeoutMs("POST", "/api/mcm/commWidgetMng/upload")).toBe(5 * MIN);
    expect(backendTimeoutMs("GET", `/api/mcm/widgetMedia/file/${FILE_ID}`)).toBe(5 * MIN);
    expect(backendTimeoutMs("HEAD", `/api/mcm/widgetMedia/file/${FILE_ID}`)).toBe(5 * MIN);
  });

  it("미디어 경로라도 다른 메서드·비슷한 이름은 기본 2분", () => {
    expect(backendTimeoutMs("GET", "/api/mcm/commWidgetMng/upload")).toBe(2 * MIN);
    expect(backendTimeoutMs("POST", `/api/mcm/widgetMedia/file/${FILE_ID}`)).toBe(2 * MIN);
    expect(backendTimeoutMs("POST", "/api/mcm/commWidgetMng/uploadX")).toBe(2 * MIN);
    expect(backendTimeoutMs("GET", "/api/mcm/widgetMedia/files")).toBe(2 * MIN);
  });

  it("기존 판정 그대로 — 일반 2분, export·download 5분, 장기 실행 mutation 30분", () => {
    expect(backendTimeoutMs("GET", "/api/mcm/sample-notices")).toBe(2 * MIN);
    expect(backendTimeoutMs("GET", "/api/mpn/plans/export")).toBe(5 * MIN);
    expect(backendTimeoutMs("GET", "/api/mpn/files/1/download")).toBe(5 * MIN);
    expect(backendTimeoutMs("POST", "/api/mpn/planning-runs")).toBe(30 * MIN);
    expect(backendTimeoutMs("GET", "/api/mpn/planning-runs")).toBe(2 * MIN);
  });
});

describe("pickRequestHeaders", () => {
  it("본문 형식·Range·If-Range 만 넘기고 쿠키·인증 헤더는 넘기지 않는다", () => {
    const picked = pickRequestHeaders(
      new Headers({
        "content-type": "multipart/form-data; boundary=----abc",
        range: "bytes=0-9",
        "if-range": '"etag-1"',
        cookie: "oasis-mcm-auth.session-token=secret",
        authorization: "Bearer user-jwt",
      }),
    );
    expect(picked).toEqual({
      "content-type": "multipart/form-data; boundary=----abc",
      range: "bytes=0-9",
      "if-range": '"etag-1"',
    });
  });

  it("없는 헤더는 넣지 않는다", () => {
    expect(pickRequestHeaders(new Headers())).toEqual({});
  });
});

describe("pickResponseHeaders", () => {
  it("내려받기·구간 응답 헤더를 돌려주고 set-cookie 등은 버린다", () => {
    const picked = pickResponseHeaders(
      new Headers({
        "content-type": "video/mp4",
        "content-range": "bytes 0-9/100",
        "accept-ranges": "bytes",
        "x-content-type-options": "nosniff",
        "content-disposition": "inline; filename*=UTF-8''clip.mp4",
        "cache-control": "private, max-age=86400",
        "set-cookie": "JSESSIONID=1",
        server: "tomcat",
      }),
    );
    expect(Object.fromEntries(picked.entries())).toEqual({
      "content-type": "video/mp4",
      "content-range": "bytes 0-9/100",
      "accept-ranges": "bytes",
      "x-content-type-options": "nosniff",
      "content-disposition": "inline; filename*=UTF-8''clip.mp4",
      "cache-control": "private, max-age=86400",
    });
  });

  it("Content-Type 이 없으면 기존처럼 JSON 으로 둔다", () => {
    expect(pickResponseHeaders(new Headers()).get("content-type")).toBe(
      "application/json; charset=utf-8",
    );
  });
});

describe("forwardToBackend", () => {
  it("multipart 본문을 바이트 그대로(이진 바이트 포함) BE 로 넘긴다", async () => {
    const boundary = "----dmesBoundary7MA4YWxk";
    const head = new TextEncoder().encode(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`,
    );
    const tail = new TextEncoder().encode(`\r\n--${boundary}--\r\n`);
    const payload = new Uint8Array([...head, ...bytes(256), ...tail]);

    let sentBody: Uint8Array | null = null;
    let sentInit: RequestInit | undefined;
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      sentInit = init;
      sentBody = new Uint8Array(await new Response(init.body as BodyInit).arrayBuffer());
      return new Response(JSON.stringify({ fileId: "f".repeat(32) }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const req = new NextRequest(
      "http://bff.test/api/mcm/rest/commWidgetMng/upload/api/mcm/commWidgetMng/upload",
      {
        method: "POST",
        body: payload,
        headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      },
    );
    const res = await forwardToBackend(req, "mcm", "/api/mcm/commWidgetMng/upload");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("http://be.test/api/mcm/commWidgetMng/upload");
    const headers = sentInit?.headers as Record<string, string>;
    expect(headers["content-type"]).toBe(`multipart/form-data; boundary=${boundary}`);
    expect(headers["X-Authenticated-User"]).toBe("user1");
    expect(sentBody).toEqual(payload);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ fileId: "f".repeat(32) });
  });

  it("Range 를 넘기고 206 바이너리 응답과 구간 헤더를 그대로 돌려준다", async () => {
    const part = bytes(10, 200);
    fetchMock.mockResolvedValue(
      new Response(part, {
        status: 206,
        headers: {
          "content-type": "video/mp4",
          "content-range": "bytes 0-9/1000",
          "accept-ranges": "bytes",
          "x-content-type-options": "nosniff",
          "content-disposition": "inline; filename*=UTF-8''clip.mp4",
          "cache-control": "private, max-age=86400",
        },
      }),
    );

    const fileId = "0123456789abcdef0123456789abcdef";
    const req = new NextRequest(
      `http://bff.test/api/mcm/rest/widgetMedia/file/api/mcm/widgetMedia/file/${fileId}`,
      { headers: { range: "bytes=0-9" } },
    );
    const res = await forwardToBackend(req, "mcm", `/api/mcm/widgetMedia/file/${fileId}`);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`http://be.test/api/mcm/widgetMedia/file/${fileId}`);
    expect((init.headers as Record<string, string>).range).toBe("bytes=0-9");
    expect(init.body).toBeUndefined();

    expect(res.status).toBe(206);
    expect(res.headers.get("content-type")).toBe("video/mp4");
    expect(res.headers.get("content-range")).toBe("bytes 0-9/1000");
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-disposition")).toBe("inline; filename*=UTF-8''clip.mp4");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(part);
  });
});
