// TSK-05-02 design.md §3.4 — headerMng OASIS 호출 래퍼. meta.success=false 면 meta.message 로 throw, grid items 는
// 빈 배열이라도 늘 보내고(F11), params 에서 null·빈 값 키는 뺀다. 행은 서버 키만 보낸다(KEY·파생 칸·OFFSET·LENGTH 제외).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanParams, saveHeader, searchColumns, searchHeaders, viewHeader } from "../../../pages/dmb/headerMng/api";

const originalFetch = globalThis.fetch;
let calls: Array<{ url: string; body: Record<string, unknown> }>;

function stub(response: unknown) {
  calls = [];
  globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
    return new Response(JSON.stringify(response), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
}

describe("headerMng api", () => {
  beforeEach(() => stub({ meta: { success: true }, data: { result: { headers: [{ LAYOUT_ID: 1 }], eais: [] } } }));
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("URL 은 /api/mdm/oasis/headerMng/{action} 이고 result 를 펼친다", async () => {
    const out = await searchHeaders("GLUE");
    expect(calls[0].url).toBe("/api/mdm/oasis/headerMng/search");
    expect(calls[0].body.params).toEqual({ keyword: "GLUE" });
    expect((calls[0].body.meta as Record<string, unknown>).menuId).toBe("headerMng");
    expect(out.headers).toEqual([{ LAYOUT_ID: 1 }]);
  });

  it("컬럼 검색은 search 의 target=COLUMN 이다(D8)", async () => {
    await searchColumns("coil");
    expect(calls[0].url).toBe("/api/mdm/oasis/headerMng/search");
    expect(calls[0].body.params).toEqual({ target: "COLUMN", keyword: "coil" });
  });

  it("view 는 layoutId 를 보낸다", async () => {
    await viewHeader(7);
    expect(calls[0].url).toBe("/api/mdm/oasis/headerMng/view");
    expect(calls[0].body.params).toEqual({ layoutId: 7 });
  });

  it("save 는 items grid 를 빈 배열이라도 보내고 null 파라미터·화면 전용 칸을 뺀다", async () => {
    await saveHeader({ layoutId: null, ver: null, rowVersion: null, layoutName: "헤더", eaiCode: "", eaiName: null, encoding: "UTF-8", padRule: "" }, []);
    expect(calls[0].url).toBe("/api/mdm/oasis/headerMng/save");
    expect(calls[0].body.params).toEqual({ layoutName: "헤더", encoding: "UTF-8" });
    expect(calls[0].body.grids).toEqual({ items: { rows: [] } });

    await saveHeader({ layoutId: 3, ver: "1.001", rowVersion: 0, layoutName: "헤더", eaiCode: "G", eaiName: "GLUE", encoding: "EUC-KR", padRule: null }, [
      { KEY: "k1", SEQ: 1, FILL_KIND: "CONST", COLUMN_PHYS: "SND_FAC_TP", DEFAULT_VALUE: "B0", DISPLAY_NAME: "송신", OFFSET: 0, LENGTH: 4,
        DOMAIN_LENGTH: 4, TRANS_UNIT: null },
      { KEY: "k2", SEQ: 2, FILL_KIND: "FILLER", FILLER_LENGTH: 10, COLUMN_PHYS: null },
    ]);
    expect(calls[1].body.params).toEqual({ layoutId: 3, ver: "1.001", rowVersion: 0, layoutName: "헤더", eaiCode: "G", eaiName: "GLUE", encoding: "EUC-KR" });
    expect(calls[1].body.grids).toEqual({ items: { rows: [
      { SEQ: 1, FILL_KIND: "CONST", COLUMN_PHYS: "SND_FAC_TP", DEFAULT_VALUE: "B0" },
      { SEQ: 2, FILL_KIND: "FILLER", FILLER_LENGTH: 10 },
    ] } });
  });

  it("meta.success=false 면 meta.message 로 던진다", async () => {
    stub({ meta: { success: false, message: "헤더 저장 거부: L01[3] 컬럼 사전에 없는 컬럼이다: NOPE_X" } });
    await expect(viewHeader(1)).rejects.toThrow("헤더 저장 거부: L01[3]");
  });

  it("cleanParams 는 null·빈 문자열을 빼고 0·false 는 남긴다", () => {
    expect(cleanParams({ a: null, b: undefined, c: "", d: " ", e: 0, f: false, g: "x" })).toEqual({ e: 0, f: false, g: "x" });
  });
});
