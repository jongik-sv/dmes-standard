/**
 * BE 로 넘기는 X-Forwarded-For — 클라이언트가 보낸 값으로 사용자 IP 를 위조하지 못한다(2026-10-03 보안 지적).
 *  옛 동작: 들어온 XFF 를 그대로 넘겨, 브라우저가 붙인 `X-Forwarded-For: 6.6.6.6` 이 BE 화면 사용 기록의 사용자 IP 가 됐다
 *  (next dev 5199 + 가짜 BE 로 확인 — BE 가 6.6.6.6 을 받았다).
 *  지금 동작: TRUSTED_PROXY_HOPS(기본 0) 만큼 오른쪽에서 고른 주소 하나만. 0 이면 넘기지 않는다
 *  (Next 16 은 소켓 주소 API 가 없고, 헤더가 없을 때만 소켓 주소를 채워 위조 값과 구별할 수 없다 — lib/http/forwarded-for.ts).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.BACKEND_CLIENT_KEY = "test-client-key";
  process.env.MCM_WAS_URL = "http://be.test";
});

vi.mock("next-auth/jwt", () => ({
  getToken: vi.fn(async () => ({ sub: "user1", roles: ["USER"] })),
}));

import { NextRequest } from "next/server";
import { forwardedForHeader, trustedProxyHops } from "@/lib/http/forwarded-for";
import { forwardToBackend } from "@/lib/http/be-proxy";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

afterEach(() => {
  vi.unstubAllEnvs();
  fetchMock.mockReset();
});

const xff = (value: string) => new Headers({ "x-forwarded-for": value });

describe("trustedProxyHops — TRUSTED_PROXY_HOPS", () => {
  it("없거나 0~10 정수가 아니면 0", () => {
    for (const value of [undefined, "", " ", "-1", "1.5", "abc", "11", "999", "1e1"]) {
      vi.stubEnv("TRUSTED_PROXY_HOPS", value);
      expect(trustedProxyHops(), String(value)).toBe(0);
    }
  });

  it("0~10 정수는 그 값", () => {
    for (const [value, hops] of [["0", 0], ["1", 1], [" 2 ", 2], ["10", 10]] as const) {
      vi.stubEnv("TRUSTED_PROXY_HOPS", value);
      expect(trustedProxyHops(), value).toBe(hops);
    }
  });
});

describe("forwardedForHeader", () => {
  it("단계 수 0(기본) — 클라이언트 XFF 를 넘기지 않는다", () => {
    expect(forwardedForHeader(xff("6.6.6.6"))).toBeUndefined();
    expect(forwardedForHeader(xff("6.6.6.6, 10.1.2.3"), 0)).toBeUndefined();
    expect(forwardedForHeader(new Headers(), 0)).toBeUndefined();
  });

  it("단계 수 1 — 앞단이 덧붙인 맨 오른쪽 주소 하나만(클라이언트가 붙인 왼쪽은 버린다)", () => {
    expect(forwardedForHeader(xff("6.6.6.6, 203.0.113.7"), 1)).toBe("203.0.113.7");
    // Nginx `proxy_set_header X-Forwarded-For $remote_addr;` 는 하나로 덮어쓴다
    expect(forwardedForHeader(xff("203.0.113.7"), 1)).toBe("203.0.113.7");
    expect(forwardedForHeader(xff("6.6.6.6, 2001:db8::1"), 1)).toBe("2001:db8::1");
  });

  it("단계 수 2 — 오른쪽에서 두 번째(바깥 앞단이 본 클라이언트), 맨 오른쪽은 안쪽 앞단이 본 바깥 앞단 주소", () => {
    expect(forwardedForHeader(xff("6.6.6.6, 203.0.113.7, 10.0.0.5"), 2)).toBe("203.0.113.7");
  });

  it("항목이 단계 수보다 적거나 고른 값이 IP 가 아니면 넘기지 않는다", () => {
    expect(forwardedForHeader(xff("203.0.113.7"), 2)).toBeUndefined();
    expect(forwardedForHeader(xff("6.6.6.6, evil"), 1)).toBeUndefined();
    expect(forwardedForHeader(xff("6.6.6.6, 203.0.113.7:443"), 1)).toBeUndefined();
    expect(forwardedForHeader(xff("6.6.6.6, "), 1)).toBeUndefined();
    expect(forwardedForHeader(xff("  "), 1)).toBeUndefined();
    expect(forwardedForHeader(new Headers(), 1)).toBeUndefined();
  });
});

describe("forwardToBackend — 클라이언트 XFF 위조가 BE 로 그대로 가지 않는다", () => {
  function beOk(): void {
    fetchMock.mockImplementation(
      async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } })
    );
  }
  const sentXff = () => {
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    return Object.entries(headers)
      .filter(([name]) => name.toLowerCase() === "x-forwarded-for")
      .map(([, value]) => value);
  };
  const call = (forwardedFor: string) =>
    forwardToBackend(
      new NextRequest("http://bff.test/api/mcm/rest/a/b/api/x", {
        headers: { "x-forwarded-for": forwardedFor },
      }),
      "mcm",
      "/api/x"
    );

  it("TRUSTED_PROXY_HOPS 없음 — 위조 XFF 는 BE 로 가지 않는다", async () => {
    beOk();
    await call("6.6.6.6");
    expect(sentXff()).toEqual([]);
  });

  it("TRUSTED_PROXY_HOPS=1 — 앞단이 덧붙인 주소 하나만 간다", async () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
    beOk();
    await call("6.6.6.6, 203.0.113.7");
    expect(sentXff()).toEqual(["203.0.113.7"]);
  });
});
