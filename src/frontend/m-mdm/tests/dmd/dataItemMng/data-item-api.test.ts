// TSK-07-03 design.md A4 — OASIS params 에 null·빈 값을 넣지 않는다(F14: null 이면 요청 전체가 실패한다).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { closeDataItem, searchDataItems } from "../../../pages/dmd/dataItemMng/api";
import { emptyFilters } from "../../../pages/dmd/dataItemMng/types";

const originalFetch = globalThis.fetch;
let bodies: Record<string, unknown>[] = [];

describe("dataItemMng api", () => {
  beforeEach(() => {
    bodies = [];
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} });
    globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ data: { result: { list: [] } }, meta: { success: true } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllGlobals();
  });

  it("빈 조건은 params 키에서 빠지고 null 이 없다", async () => {
    await searchDataItems({ ...emptyFilters(), maruDataId: "PORT" }, 0, 50);
    const params = bodies[0].params as Record<string, unknown>;
    // nodeFilter 는 emptyFilters() 가 null 이라 A4(F14)로 키째 빠진다. withTree 는 boolean(false)이라 빠지지 않는다.
    expect(params).toEqual({ maruDataId: "PORT", showClosed: false, page: 0, size: 50, withTree: false });
    expect(Object.values(params).some((v) => v === null || v === "" || Array.isArray(v))).toBe(false);
    expect((bodies[0].meta as Record<string, unknown>).menuId).toBe("dataItemMng");
  });

  it("withTree=true·nodeFilter 를 주면 그대로 실린다(TSK-07-04 design.md §2)", async () => {
    await searchDataItems({ ...emptyFilters(), maruDataId: "PORT", nodeFilter: "KR" }, 0, 1, true);
    const params = bodies[0].params as Record<string, unknown>;
    expect(params).toEqual({ maruDataId: "PORT", showClosed: false, nodeFilter: "KR", page: 0, size: 1, withTree: true });
  });

  it("닫기는 row_version 을 expectedRowVersion 으로 보낸다", async () => {
    await closeDataItem("PORT", "KRPUS", 3);
    expect(bodies[0].params).toEqual({ maruDataId: "PORT", code: "KRPUS", expectedRowVersion: 3 });
  });
});
