// TSK-04-03 design.md §4.5·§9.1 B0 — OASIS 호출 래퍼. meta.success=false 면 meta.message 로 throw,
// 배열은 grids 로, grids 는 빈 배열이라도 늘 보내고(B0 c), params 에서 null·빈 값 키는 뺀다(B0 e).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveDomain, searchDomains, validateDomain, executePreview } from "../../../pages/dma/domainMng/api";

const originalFetch = globalThis.fetch;
let calls: Array<{ url: string; body: Record<string, unknown> }>;

function stub(response: unknown) {
  calls = [];
  globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
    return new Response(JSON.stringify(response), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
}

describe("domainMng api", () => {
  beforeEach(() => stub({ meta: { success: true }, data: { result: { domains: [{ DOMAIN_ID: 1 }] } } }));
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("URL 은 /api/mdm/oasis/domainMng/{action} 이고 result 를 펼친다", async () => {
    const out = await searchDomains({ keyword: "두께", domainKind: "" });
    expect(calls[0].url).toBe("/api/mdm/oasis/domainMng/search");
    expect(calls[0].body.params).toEqual({ keyword: "두께" });
    expect((calls[0].body.meta as Record<string, unknown>).menuId).toBe("domainMng");
    expect(out.domains).toEqual([{ DOMAIN_ID: 1 }]);
  });

  it("배열은 grids 로 보내고 빈 grid 도 빠뜨리지 않으며 null 파라미터는 뺀다", async () => {
    await validateDomain(
      { domainId: null, ver: null, domainName: "두께", stdName: "THK", parentDomainId: null, domainKind: "QTY",
        dataType: "NUMBER", length: null, scale: 3, unitCode: "mm", maruCodeId: "", cateId: "", stdRule: "value > 0",
        bizRule: "", description: "" },
      [{ VALUE: "1.6", EXPECT: true, VARS: "", MEMO: "" }],
      [],
    );
    const body = calls[0].body;
    expect(calls[0].url).toBe("/api/mdm/oasis/domainMng/validate");
    expect(body.params).toEqual({ domainName: "두께", stdName: "THK", domainKind: "QTY", dataType: "NUMBER", scale: 3,
      unitCode: "mm", stdRule: "value > 0" });
    expect(body.grids).toEqual({ testCases: { rows: [{ VALUE: "1.6", EXPECT: true, VARS: "", MEMO: "" }] }, examples: { rows: [] } });
  });

  it("미리보기는 vars grid 를 늘 보낸다", async () => {
    await executePreview({ domainKind: "QTY", dataType: "NUMBER", stdRule: "value > 0", value: "1" }, []);
    expect(calls[0].body.grids).toEqual({ vars: { rows: [] } });
  });

  it("meta.success=false 면 meta.message 로 던진다", async () => {
    stub({ meta: { success: false, code: "S001", message: "도메인 저장 거부: R06 길이" } });
    await expect(
      saveDomain({ domainId: 1, ver: 0, domainName: "a", stdName: "A", parentDomainId: null, domainKind: "TEXT",
        dataType: "STRING", length: null, scale: null, unitCode: null, maruCodeId: null, cateId: null, stdRule: null,
        bizRule: null, description: null }, [], []),
    ).rejects.toThrow("도메인 저장 거부: R06 길이");
  });
});
