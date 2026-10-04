// TSK-05-02 design.md §3.4 — layoutMng OASIS 호출 래퍼. save 는 grid headers·consts·items 셋을 늘 보낸다(F11).
// 헤더 항목을 보내는 grid 는 없다(불변 I8).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanParams, exportSnapshot, renderSample, saveLayout, searchColumns, searchHeaders, searchImpact, searchLayouts, validateLayout, viewLayout,
} from "../../../pages/dmb/layoutMng/api";
import { newLayoutVersion } from "@/layout/version-api";
import type { LayoutDraft } from "../../../pages/dmb/layoutMng/types";
import { NOISY_PARAMS, NOISY_SENT, describeOasisEnvelope } from "../../helpers/oasis-envelope";

const originalFetch = globalThis.fetch;
let calls: Array<{ url: string; body: Record<string, unknown> }>;

function stub(response: unknown) {
  calls = [];
  globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
    return new Response(JSON.stringify(response), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
}

describe("layoutMng api", () => {
  beforeEach(() => stub({ meta: { success: true }, data: { result: { layouts: [{ LAYOUT_ID: 5 }] } } }));
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("URL 은 /api/mdm/oasis/layoutMng/{action} 이고 조회 조건의 빈 값은 뺀다", async () => {
    const out = await searchLayouts({ keyword: "", headerLayoutId: "3", sndSystem: "L2", rcvSystem: "" });
    expect(calls[0].url).toBe("/api/mdm/oasis/layoutMng/search");
    expect(calls[0].body.params).toEqual({ headerLayoutId: 3, sndSystem: "L2" });
    expect((calls[0].body.meta as Record<string, unknown>).menuId).toBe("layoutMng");
    expect(out.layouts).toEqual([{ LAYOUT_ID: 5 }]);
  });

  it("헤더·컬럼 검색은 search 의 target 이다(D8)", async () => {
    await searchHeaders("");
    await searchColumns("coil");
    expect(calls[0].body.params).toEqual({ target: "HEADER" });
    expect(calls[1].body.params).toEqual({ target: "COLUMN", keyword: "coil" });
  });

  it("view 는 layoutId 를 보낸다", async () => {
    await viewLayout(9);
    expect(calls[0].url).toBe("/api/mdm/oasis/layoutMng/view");
    expect(calls[0].body.params).toEqual({ layoutId: 9 });
  });

  it("save 는 grid 셋을 빈 배열이라도 늘 보내고 헤더 항목 grid 는 없다", async () => {
    await saveLayout({ layoutId: null, ver: null, rowVersion: null, asOf: null, layoutName: "전문", eaiCode: null, sndSystem: "L2", rcvSystem: "MES" }, [], [], []);
    expect(calls[0].url).toBe("/api/mdm/oasis/layoutMng/save");
    expect(calls[0].body.params).toEqual({ layoutName: "전문", sndSystem: "L2", rcvSystem: "MES" });
    expect(calls[0].body.grids).toEqual({ headers: { rows: [] }, consts: { rows: [] }, items: { rows: [] } });

    await saveLayout({ layoutId: 1, ver: "1.001", rowVersion: 2, asOf: null, layoutName: "전문", eaiCode: "G", sndSystem: "L2", rcvSystem: "MES" },
      [{ HEADER_LAYOUT_ID: 10 }, { HEADER_LAYOUT_ID: 11 }],
      [{ HEADER_LAYOUT_ID: 10, HEADER_SEQ: 2, CONST_VALUE: "B1" }],
      [{ KEY: "a", SEQ: 1, FILL_KIND: "DATA", COLUMN_PHYS: "COIL_THK", NUM_FORMAT: "SIGN=N;ZERO=Y;SCALE=1;WIDTH=4", OFFSET: 130, LENGTH: 4 }]);
    expect(calls[1].body.grids).toEqual({
      headers: { rows: [{ SEQ: 1, HEADER_LAYOUT_ID: 10 }, { SEQ: 2, HEADER_LAYOUT_ID: 11 }] },
      consts: { rows: [{ HEADER_LAYOUT_ID: 10, HEADER_SEQ: 2, CONST_VALUE: "B1" }] },
      items: { rows: [{ SEQ: 1, FILL_KIND: "DATA", COLUMN_PHYS: "COIL_THK", NUM_FORMAT: "SIGN=N;ZERO=Y;SCALE=1;WIDTH=4" }] },
    });
    expect(Object.keys(calls[1].body.grids as object)).toEqual(["headers", "consts", "items"]);
  });

  // ── TSK-05-03 design.md §3.5 — validate·execute·export·search(IMPACT) ──
  const DRAFT = { layoutId: 7, ver: "1.000", rowVersion: 3, asOf: null, layoutName: "전문", eaiCode: "G", sndSystem: "L2", rcvSystem: "MES" };
  const ITEM = { KEY: "a", SEQ: 1, FILL_KIND: "DATA" as const, COLUMN_PHYS: "COIL_ID", OFFSET: 130, LENGTH: 20 };

  it("validate 는 grid 셋을 빈 배열이라도 보낸다", async () => {
    await validateLayout(DRAFT, [], [], []);
    expect(calls[0].url).toBe("/api/mdm/oasis/layoutMng/validate");
    expect(calls[0].body.params).toEqual({ layoutId: 7, ver: "1.000", rowVersion: 3, layoutName: "전문", eaiCode: "G", sndSystem: "L2", rcvSystem: "MES" });
    expect(calls[0].body.grids).toEqual({ headers: { rows: [] }, consts: { rows: [] }, items: { rows: [] } });
  });

  it("execute 는 samples 를 포함한 grid 넷을 보낸다", async () => {
    await renderSample(DRAFT, [{ HEADER_LAYOUT_ID: 10 }], [], [ITEM], { COIL_ID: "C1", PROD_DT: "" }, { sendTime: "20260922143015", seq: 1 });
    expect(calls[0].url).toBe("/api/mdm/oasis/layoutMng/execute");
    expect(calls[0].body.params).toEqual({ ...{ layoutId: 7, ver: "1.000", rowVersion: 3, layoutName: "전문", eaiCode: "G", sndSystem: "L2", rcvSystem: "MES" },
      sendTime: "20260922143015", seq: 1 });
    expect(Object.keys(calls[0].body.grids as object)).toEqual(["headers", "consts", "items", "samples"]);
    expect(calls[0].body.grids).toEqual({
      headers: { rows: [{ SEQ: 1, HEADER_LAYOUT_ID: 10 }] }, consts: { rows: [] },
      items: { rows: [{ SEQ: 1, FILL_KIND: "DATA", COLUMN_PHYS: "COIL_ID" }] },
      samples: { rows: [{ COLUMN_PHYS: "COIL_ID", VALUE: "C1" }, { COLUMN_PHYS: "PROD_DT", VALUE: "" }] },
    });
    await renderSample(DRAFT, [], [], [], {});
    expect(calls[1].body.grids).toEqual({ headers: { rows: [] }, consts: { rows: [] }, items: { rows: [] }, samples: { rows: [] } });
  });

  it("export 는 layoutId·ver·asOf 를 문자열로 보낸다", async () => {
    await exportSnapshot(7, "1.001", "2026-07-01 00:00:00");
    await exportSnapshot(7);
    expect(calls[0].url).toBe("/api/mdm/oasis/layoutMng/export");
    expect(calls[0].body.params).toEqual({ layoutId: 7, ver: "1.001", asOf: "2026-07-01 00:00:00" });
    expect(calls[1].body.params).toEqual({ layoutId: 7 });
    expect(calls[0].body.grids).toBeUndefined();
  });

  it("view 는 ver·asOf 를 문자열로 보낸다", async () => {
    await viewLayout(9, "1.010", "2026-07-01 00:00:00");
    expect(calls[0].body.params).toEqual({ layoutId: 9, ver: "1.010", asOf: "2026-07-01 00:00:00" });
  });

  it("copy 는 verKind 를 보내고 minor 버전을 문자열로 받는다", async () => {
    stub({ meta: { success: true }, data: { result: { layoutId: 201, ver: "1.001", verKind: "MINOR", rowVersion: 0 } } });
    const out = await newLayoutVersion("layoutMng", 201, "MINOR");
    expect(calls[0].url).toBe("/api/mdm/oasis/layoutMng/copy");
    expect(calls[0].body.params).toEqual({ layoutId: 201, verKind: "MINOR" });
    expect(out.ver).toBe("1.001");
  });

  it("영향도 검색은 search 의 target=IMPACT 다", async () => {
    stub({ meta: { success: true }, data: { result: { impacts: [{ COLUMN_PHYS: "COIL_THK" }] } } });
    const rows = await searchImpact("COIL_THK");
    expect(calls[0].url).toBe("/api/mdm/oasis/layoutMng/search");
    expect(calls[0].body.params).toEqual({ target: "IMPACT", keyword: "COIL_THK" });
    expect(rows).toEqual([{ COLUMN_PHYS: "COIL_THK" }]);
  });

  it("meta.success=false 면 meta.message 로 던진다", async () => {
    stub({ meta: { success: false, message: "전문 저장 거부: L10 CONST 항목만 재정의할 수 있다" } });
    await expect(viewLayout(1)).rejects.toThrow("전문 저장 거부: L10");
  });

  it("cleanParams 는 null·빈 문자열을 뺀다", () => {
    expect(cleanParams({ a: null, b: "", c: 0 })).toEqual({ c: 0 });
  });
});

// 공통 계약으로 옮기기 전 현재 동작 고정(특성 시험).
describeOasisEnvelope("layoutMng", {
  call: () => viewLayout(7),
  url: "/api/mdm/oasis/layoutMng/view",
  menuId: "layoutMng",
  merge: "data+result",
  reject: "unified",
  labelled: { field: "LAYOUT_NAME", label: "전문 이름" },
  noGrids: true,
  noisy: { call: (p) => saveLayout(p as unknown as LayoutDraft, [], [], []), omit: "nullish+blank" },
});

describe("layoutMng — export 한 cleanParams 는 nullish+blank 방식이다", () => {
  it("NOISY_PARAMS", () => {
    expect(cleanParams({ ...NOISY_PARAMS })).toEqual(NOISY_SENT["nullish+blank"]);
  });
});
