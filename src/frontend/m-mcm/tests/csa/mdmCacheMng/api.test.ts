import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiRequest = vi.fn();
const getJson = vi.fn();

vi.mock("@dk-oasis/shared/http", () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  getJson: (...args: unknown[]) => getJson(...args),
}));

/** shared HttpError 와 같은 모양(status 를 가진 Error). */
const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { name: "HttpError", status });

import * as api from "../../../page-components/csa/mdmCacheMng/api";
import { MODULE_STATE_LABELS, emptyFilters, isReachable } from "../../../page-components/csa/mdmCacheMng/types";

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
  bytes: { COLUMN: 2048, DOMAIN: 512 },
  totalBytes: 2560,
  heap: { usedBytes: 300 * 1024 * 1024, maxBytes: 4 * 1024 * 1024 * 1024 },
  maxEntries: 20000,
  maxAgeSeconds: 86400,
  maxIdleSeconds: 3600,
});

describe("mdmCacheMng api", () => {
  beforeEach(() => {
    apiRequest.mockReset();
    getJson.mockReset();
  });

  it("상태 — 모듈 다섯을 부르고 응답 없는 모듈은 DOWN, 뒤처지면 LAGGING, 실패 중이면 FAILING", async () => {
    getJson.mockImplementation(async (url: string) => {
      if (url.startsWith("/api/mqc/")) throw httpError(502);
      if (url.startsWith("/api/mls/")) return status("mls", 5, 9);
      if (url.startsWith("/api/mpp/")) return status("mpp", 9, 9, 2);
      return status(url.split("/")[2], 9, 9);
    });

    const { rows, latestSeq } = await api.fetchAllStatus(["mcm", "mls", "mqc", "mpp", "mpn"]);

    expect(apiRequest).not.toHaveBeenCalled();
    expect(getJson.mock.calls.map((c) => c[0])).toEqual([
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
    // 추정 크기·힙·수명 — 숫자 그대로 둔다(열 정렬이 글자 순이 되지 않게, 표시는 화면이 formatBytes 로)
    expect(rows[0]).toMatchObject({
      totalBytes: 2560,
      heapUsed: 300 * 1024 * 1024,
      heapMax: 4 * 1024 * 1024 * 1024,
      maxIdleSeconds: 3600,
      maxAgeSeconds: 86400,
    });
    expect(rows[2]).toMatchObject({ totalBytes: null, heapUsed: null, heapMax: null, maxIdleSeconds: null, maxAgeSeconds: null });
  });

  it("상태 — 크기·힙·유휴 수명을 모르는 옛 모듈 응답이면 그 칸만 null 이다", async () => {
    getJson.mockImplementation(async () => {
      const old: Record<string, unknown> = { ...status("mcm", 9, 9), maxAgeSeconds: 3600 };
      for (const k of ["bytes", "totalBytes", "heap", "maxIdleSeconds"]) delete old[k];
      return old;
    });

    const { rows } = await api.fetchAllStatus(["mcm"]);

    expect(rows[0]).toMatchObject({
      state: "OK",
      total: 3,
      totalBytes: null,
      heapUsed: null,
      heapMax: null,
      maxIdleSeconds: null,
      maxAgeSeconds: 3600,
    });
  });

  it("상태 — 401 은 인증 실패, 403 은 권한 없음, 네트워크·5xx 는 연결 안 됨이고 로그인으로 보내는 apiRequest 를 쓰지 않는다", async () => {
    getJson.mockImplementation(async (url: string) => {
      if (url.startsWith("/api/mqc/")) throw httpError(401);
      if (url.startsWith("/api/mpp/")) throw httpError(403);
      if (url.startsWith("/api/mpn/")) throw new Error("서버와 연결할 수 없습니다.");
      if (url.startsWith("/api/mls/")) throw httpError(500);
      return status("mcm", 9, 9);
    });

    const { rows } = await api.fetchAllStatus(["mcm", "mls", "mqc", "mpp", "mpn"]);

    expect(apiRequest).not.toHaveBeenCalled();
    expect(rows.map((r) => [r.module, r.state])).toEqual([
      ["mcm", "OK"],
      ["mls", "DOWN"],
      ["mqc", "UNAUTHORIZED"],
      ["mpp", "FORBIDDEN"],
      ["mpn", "DOWN"],
    ]);
    expect(rows.map((r) => MODULE_STATE_LABELS[r.state])).toEqual(["정상", "연결 안 됨", "인증 실패", "권한 없음", "연결 안 됨"]);
    expect(rows.map((r) => isReachable(r.state))).toEqual([true, false, false, false, false]);
  });

  it("항목 — 401 이어도 로그인으로 보내지 않고 상태 이름을 붙여 throw", async () => {
    getJson.mockRejectedValue(httpError(401));
    await expect(api.fetchEntries("mqc", { type: "", q: "", sort: "key" })).rejects.toThrow("인증 실패");
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("항목 — 종류·검색어·쪽을 쿼리로 보내고 행 키를 만든다", async () => {
    getJson.mockResolvedValue({
      total: 1,
      page: 0,
      size: 200,
      items: [
        {
          type: "COLUMN",
          key: "COIL_THK",
          absent: false,
          loadedAt: "2026-10-02T00:00:00Z",
          lastAccessAt: "2026-10-02T00:10:00Z",
          hits: 3,
          remainingSeconds: 3000,
          bytes: 1536,
        },
      ],
    });

    const page = await api.fetchEntries("mls", { type: "COLUMN", q: " coil ", sort: "key" });

    expect(getJson.mock.calls[0][0]).toBe("/api/mls/mdmMeta/entries?type=COLUMN&q=coil&page=0&size=200");
    expect(page.items[0].rowId).toBe("COLUMN:COIL_THK");
    expect(page.items[0].hits).toBe(3);
    expect(page.items[0].bytes).toBe(1536);
    expect(page.items[0].lastAccessAt).toBe(api.formatInstant("2026-10-02T00:10:00Z"));
    expect(page.items[0].lastAccessAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it("항목 — 정렬이 크기·조회 수면 sort 를 보내고(서버가 쪽을 자르기 전에 정렬), 키 순(기본)이면 보내지 않는다", async () => {
    getJson.mockResolvedValue({ total: 0, page: 0, size: 200, items: [] });

    await api.fetchEntries("mls", { type: "", q: "", sort: "bytes" });
    await api.fetchEntries("mls", { type: "RULE", q: "", sort: "hits" });
    await api.fetchEntries("mls", emptyFilters());

    expect(getJson.mock.calls.map((c) => c[0])).toEqual([
      "/api/mls/mdmMeta/entries?sort=bytes&page=0&size=200",
      "/api/mls/mdmMeta/entries?type=RULE&sort=hits&page=0&size=200",
      "/api/mls/mdmMeta/entries?page=0&size=200",
    ]);
  });

  it("항목 — 크기·마지막 조회를 모르는 옛 모듈 응답이면 크기는 null, 마지막 조회는 빈 문자열이다", async () => {
    getJson.mockResolvedValue({
      total: 1,
      page: 0,
      size: 200,
      items: [{ type: "DOMAIN", key: "7", absent: true, loadedAt: "2026-10-02T00:00:00Z", hits: 0, remainingSeconds: 10 }],
    });

    const page = await api.fetchEntries("mls", { type: "", q: "", sort: "key" });

    expect(page.items[0]).toMatchObject({ bytes: null, lastAccessAt: "" });
  });

  describe("항목 상세(entry)", () => {
    const fetchMock = vi.fn();
    /** fetch 응답 흉내 — status 와 JSON 본문(null 이면 JSON 아님). */
    const reply = (status: number, body: unknown) => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => {
        if (body === null) throw new SyntaxError("not json");
        return body;
      },
    });

    beforeEach(() => {
      fetchMock.mockReset();
      vi.stubGlobal("fetch", fetchMock);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    const detail = {
      type: "COLUMN",
      key: "COIL_THK",
      absent: false,
      loadedAt: "2026-10-02T00:00:00Z",
      lastAccessAt: "2026-10-02T00:30:00Z",
      hits: 0,
      remainingSeconds: 3600,
      loadSeq: 7,
      bytes: 2048,
      value: { physName: "COIL_THK", bizExpr: { text: "value <= COIL_WID" } },
    };

    it("type·key 를 인코딩해 GET 하고 토큰 헤더를 붙이며 로그인으로 보내는 apiRequest 를 쓰지 않는다", async () => {
      vi.stubGlobal("window", { localStorage: { getItem: (k: string) => (k === "oasis_access_token" ? "tok" : null) } });
      fetchMock.mockResolvedValue(reply(200, { ...detail, type: "RULE", key: "R 1/가&b" }));

      const r = await api.fetchEntry("mls", "RULE", "R 1/가&b");

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, { method: string; headers: Record<string, string> }];
      expect(url).toBe(`/api/mls/mdmMeta/entry?type=RULE&key=${encodeURIComponent("R 1/가&b").replace(/%20/g, "+")}`);
      expect(new URL(url, "http://x").searchParams.get("key")).toBe("R 1/가&b");
      expect(init).toEqual({ method: "GET", headers: { "Content-Type": "application/json", Authorization: "Bearer tok" } });
      expect(apiRequest).not.toHaveBeenCalled();
      expect(getJson).not.toHaveBeenCalled();
      expect(r.found).toBe(true);
    });

    it("값 전체(bizExpr.text 포함)와 요약을 돌려주고 적재 시각은 로컬 시각 문자열이다", async () => {
      fetchMock.mockResolvedValue(reply(200, detail));

      const r = await api.fetchEntry("mcm", "COLUMN", "COIL_THK");

      if (!r.found) throw new Error("found 여야 한다");
      expect(r.detail.value).toEqual(detail.value);
      expect(r.detail.loadSeq).toBe(7);
      expect(r.detail.loadedAt).toBe(api.formatInstant("2026-10-02T00:00:00Z"));
      expect(r.detail.loadedAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
      expect(r.detail.lastAccessAt).toBe(api.formatInstant("2026-10-02T00:30:00Z"));
      expect(r.detail.bytes).toBe(2048);
    });

    it("없음 항목은 absent 와 null 값이다", async () => {
      fetchMock.mockResolvedValue(reply(200, { ...detail, absent: true, value: null }));
      const r = await api.fetchEntry("mcm", "COLUMN", "NOPE");
      expect(r).toMatchObject({ found: true, detail: { absent: true, value: null } });
    });

    it("캐시에 없음 본문(code MDM_ENTRY_NOT_CACHED)의 404 만 캐시에 없음(만료·삭제됨)으로 돌려주고 throw 하지 않는다", async () => {
      fetchMock.mockResolvedValue(reply(404, { code: "MDM_ENTRY_NOT_CACHED", message: "캐시에 없습니다(만료·삭제됨): COLUMN COIL_THK" }));
      await expect(api.fetchEntry("mls", "COLUMN", "COIL_THK")).resolves.toEqual({ found: false, message: "캐시에 없음(만료·삭제됨)" });
      expect(apiRequest).not.toHaveBeenCalled();
    });

    it("다른 404(모듈 불일치 빈 본문·없는 경로)는 조회할 수 없음(404)으로 throw 한다", async () => {
      fetchMock.mockResolvedValueOnce(reply(404, null));
      await expect(api.fetchEntry("mqc", "COLUMN", "A")).rejects.toThrow("조회할 수 없음(404)");
      fetchMock.mockResolvedValueOnce(reply(404, { status: 404, error: "Not Found", path: "/api/mqc/mdmMeta/entry" }));
      await expect(api.fetchEntry("mqc", "COLUMN", "A")).rejects.toThrow("조회할 수 없음(404)");
      fetchMock.mockResolvedValueOnce(reply(404, { message: "캐시에 없습니다(만료·삭제됨)" })); // code 없이 문구만 같으면 믿지 않는다
      await expect(api.fetchEntry("mqc", "COLUMN", "A")).rejects.toThrow("조회할 수 없음(404)");
    });

    it("401·403·5xx·네트워크 실패는 이유 문구를 붙여 throw 한다", async () => {
      fetchMock.mockResolvedValueOnce(reply(401, null));
      await expect(api.fetchEntry("mqc", "COLUMN", "A")).rejects.toThrow("인증 실패: HTTP 401");
      fetchMock.mockResolvedValueOnce(reply(403, { message: "시스템 관리자만 할 수 있습니다" }));
      await expect(api.fetchEntry("mqc", "COLUMN", "A")).rejects.toThrow("권한 없음: 시스템 관리자만 할 수 있습니다");
      fetchMock.mockResolvedValueOnce(reply(502, null));
      await expect(api.fetchEntry("mqc", "COLUMN", "A")).rejects.toThrow("연결 안 됨: HTTP 502");
      fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
      await expect(api.fetchEntry("mqc", "COLUMN", "A")).rejects.toThrow("연결 안 됨: Failed to fetch");
      expect(apiRequest).not.toHaveBeenCalled();
    });
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

  it("강제 기록 응답에 data.result 가 없으면 성공으로 넘기지 않고 throw", async () => {
    apiRequest.mockResolvedValue({ meta: { success: true }, data: {} });
    await expect(api.forceKeys("COLUMN", ["A"], "EVICT")).rejects.toThrow("결과가 없습니다");
    apiRequest.mockResolvedValue(undefined);
    await expect(api.forceKeys("COLUMN", ["A"], "EVICT")).rejects.toThrow("결과가 없습니다");
  });

  it("여러 종류 강제 기록 — 중간에 실패하면 거기서 멈추고 적용된 종류와 실패한 종류를 알려 준다", async () => {
    apiRequest
      .mockResolvedValueOnce({ meta: { success: true }, data: { result: { fromSeq: 1, toSeq: 1, count: 1 } } })
      .mockResolvedValueOnce({ meta: { success: false, message: "시스템 관리자만 할 수 있습니다" } });

    const r = await api.forceByType(
      [
        ["COLUMN", ["A"]],
        ["RULE", ["R"]],
        ["CODE", ["C"]],
      ],
      "EVICT",
    );

    expect(apiRequest).toHaveBeenCalledTimes(2);
    expect(r.applied).toEqual(["COLUMN"]);
    expect(r.failedType).toBe("RULE");
    expect(r.error).toBe("시스템 관리자만 할 수 있습니다");
    expect(api.describeForceFailure(r)).toBe(
      "컬럼은(는) 반영했고, 룰부터 반영하지 못했습니다(남은 종류: 룰, 마스터코드). 시스템 관리자만 할 수 있습니다",
    );
  });

  it("여러 종류 강제 기록 — 모두 성공하면 실패 없음", async () => {
    apiRequest.mockResolvedValue({ meta: { success: true }, data: { result: { fromSeq: 1, toSeq: 1, count: 1 } } });
    const r = await api.forceByType(
      [
        ["COLUMN", ["A"]],
        ["RULE", ["R"]],
      ],
      "RELOAD",
    );
    expect(r).toEqual({ applied: ["COLUMN", "RULE"], failedType: null, pending: [], error: null });
  });

  it("등록 결과 문구 — 빈 목록이면 괄호를 붙이지 않는다", () => {
    expect(api.describeLoadResult({ loaded: ["A"], missing: ["X"], unavailable: [] })).toBe(
      "적재 1건, MDM 에 없음 1건(X), 받을 수 없음 0건",
    );
    expect(api.describeLoadResult({ loaded: [], missing: [], unavailable: ["U1", "U2"] })).toBe(
      "적재 0건, MDM 에 없음 0건, 받을 수 없음 2건(U1, U2)",
    );
  });

  it("키 입력은 쉼표·공백·줄바꿈으로 나누고, 강제 기록은 대상 종류별로 묶는다", () => {
    expect(api.parseKeys("A, B\nC  A")).toEqual(["A", "B", "C"]);
    expect(
      api.groupByType([
        { rowId: "COLUMN:A", type: "COLUMN", key: "A", absent: false, loadedAt: "", lastAccessAt: "", hits: 0, remainingSeconds: 0, bytes: 1 },
        { rowId: "RULE:R", type: "RULE", key: "R", absent: false, loadedAt: "", lastAccessAt: "", hits: 0, remainingSeconds: 0, bytes: 1 },
        { rowId: "COLUMN:B", type: "COLUMN", key: "B", absent: true, loadedAt: "", lastAccessAt: "", hits: 0, remainingSeconds: 0, bytes: 0 },
      ]),
    ).toEqual([
      ["COLUMN", ["A", "B"]],
      ["RULE", ["R"]],
    ]);
  });
});
