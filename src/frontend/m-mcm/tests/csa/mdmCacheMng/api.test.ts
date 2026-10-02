import { beforeEach, describe, expect, it, vi } from "vitest";

const apiRequest = vi.fn();

vi.mock("@dk-oasis/shared/http", () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

import * as api from "../../../page-components/csa/mdmCacheMng/api";

const bodyOf = (call: unknown[]) => JSON.parse((call[1] as { body: string }).body);

const status = (module: string, appliedSeq: number, latestSeq: number, consecutiveFailures = 0) => ({
  module,
  instanceId: `${module}@host`,
  appliedSeq,
  latestSeq,
  lastSuccessAt: "2026-10-02T00:00:00Z",
  consecutiveFailures,
  lastError: null,
  counts: { COLUMN: 2, DOMAIN: 1 },
  maxEntries: 20000,
  maxAgeSeconds: 3600,
});

describe("mdmCacheMng api", () => {
  beforeEach(() => {
    apiRequest.mockReset();
  });

  it("상태 — 모듈 다섯을 부르고 응답 없는 모듈은 DOWN, 뒤처지면 LAGGING, 실패 중이면 FAILING", async () => {
    apiRequest.mockImplementation(async (url: string) => {
      if (url.startsWith("/api/mqc/")) throw new Error("502");
      if (url.startsWith("/api/mls/")) return status("mls", 5, 9);
      if (url.startsWith("/api/mpp/")) return status("mpp", 9, 9, 2);
      return status(url.split("/")[2], 9, 9);
    });

    const { rows, latestSeq } = await api.fetchAllStatus(["mcm", "mls", "mqc", "mpp", "mpn"]);

    expect(apiRequest.mock.calls.map((c) => c[0])).toEqual([
      "/api/mcm/mdmMeta/status",
      "/api/mls/mdmMeta/status",
      "/api/mqc/mdmMeta/status",
      "/api/mpp/mdmMeta/status",
      "/api/mpn/mdmMeta/status",
    ]);
    expect(latestSeq).toBe(9);
    expect(rows.map((r) => [r.module, r.state])).toEqual([
      ["mcm", "OK"],
      ["mls", "LAGGING"],
      ["mqc", "DOWN"],
      ["mpp", "FAILING"],
      ["mpn", "OK"],
    ]);
    expect(rows[0].total).toBe(3);
    expect(rows[2].appliedSeq).toBeNull();
  });

  it("항목 — 종류·검색어·쪽을 쿼리로 보내고 행 키를 만든다", async () => {
    apiRequest.mockResolvedValue({
      total: 1,
      page: 0,
      size: 200,
      items: [{ type: "COLUMN", key: "COIL_THK", absent: false, loadedAt: "2026-10-02T00:00:00Z", hits: 3, remainingSeconds: 3000 }],
    });

    const page = await api.fetchEntries("mls", { type: "COLUMN", q: " coil " });

    expect(apiRequest.mock.calls[0][0]).toBe("/api/mls/mdmMeta/entries?type=COLUMN&q=coil&page=0&size=200");
    expect(page.items[0].rowId).toBe("COLUMN:COIL_THK");
    expect(page.items[0].hits).toBe(3);
  });

  it("등록 — 고른 모듈에 type·keys 를 POST 한다", async () => {
    apiRequest.mockResolvedValue({ loaded: ["COIL_THK"], missing: [], unavailable: [] });

    const r = await api.loadKeys("mcm", "COLUMN", ["coilThk"]);

    expect(apiRequest.mock.calls[0][0]).toBe("/api/mcm/mdmMeta/load");
    expect((apiRequest.mock.calls[0][1] as { method: string }).method).toBe("POST");
    expect(bodyOf(apiRequest.mock.calls[0])).toEqual({ type: "COLUMN", keys: ["coilThk"] });
    expect(r.loaded).toEqual(["COIL_THK"]);
  });

  it("삭제·재등록 — MDM metaFeed/save 에 OASIS 봉투로 보내고 키는 grids.keys.rows 다", async () => {
    apiRequest.mockResolvedValue({ meta: { success: true }, data: { result: { fromSeq: 10, toSeq: 11, count: 2 } } });

    const r = await api.forceKeys("RULE", ["R1", "R2"], "RELOAD");

    expect(apiRequest.mock.calls[0][0]).toBe("/api/mdm/oasis/metaFeed/save");
    expect(bodyOf(apiRequest.mock.calls[0])).toEqual({
      meta: { menuId: "mdmCacheMng" },
      params: { type: "RULE", kind: "RELOAD" },
      grids: { keys: { rows: [{ key: "R1" }, { key: "R2" }] } },
    });
    expect(r.count).toBe(2);
  });

  it("강제 기록이 거부되면(meta.success=false) 서버 메시지로 throw", async () => {
    apiRequest.mockResolvedValue({ meta: { success: false, message: "시스템 관리자만 할 수 있습니다" } });
    await expect(api.forceKeys("COLUMN", ["A"], "EVICT")).rejects.toThrow("시스템 관리자만 할 수 있습니다");
  });

  it("키 입력은 쉼표·공백·줄바꿈으로 나누고, 강제 기록은 대상 종류별로 묶는다", () => {
    expect(api.parseKeys("A, B\nC  A")).toEqual(["A", "B", "C"]);
    expect(
      api.groupByType([
        { rowId: "COLUMN:A", type: "COLUMN", key: "A", absent: false, loadedAt: "", hits: 0, remainingSeconds: 0 },
        { rowId: "RULE:R", type: "RULE", key: "R", absent: false, loadedAt: "", hits: 0, remainingSeconds: 0 },
        { rowId: "COLUMN:B", type: "COLUMN", key: "B", absent: true, loadedAt: "", hits: 0, remainingSeconds: 0 },
      ]),
    ).toEqual([
      ["COLUMN", ["A", "B"]],
      ["RULE", ["R"]],
    ]);
  });
});
