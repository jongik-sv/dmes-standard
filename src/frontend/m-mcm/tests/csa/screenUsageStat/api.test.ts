import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildStatParams,
  createTabRequestTracker,
  fetchByDept,
  fetchByScreen,
  fetchByUser,
  fetchHistory,
  fetchOverview,
  fetchUnused,
  statQueryKey,
} from "@/page-components/csa/screenUsageStat/api";
import type { StatFilters } from "@/page-components/csa/screenUsageStat/types";

const Q: StatFilters = {
  fromDt: "2026-09-01",
  toDt: "2026-09-30",
  deptCd: "",
  userId: "",
  pageId: "",
  unusedDays: "",
};

const fetchMock = vi.fn();

function reply(body: unknown, status = 200) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
  );
}

function sent(i = 0): {
  url: string;
  body: { meta: Record<string, unknown>; params: Record<string, unknown> };
} {
  const [url, init] = fetchMock.mock.calls[i] as [string, RequestInit];
  return { url, body: JSON.parse(String(init.body)) };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildStatParams", () => {
  it("기간을 yyyyMMdd 로 바꾸고 빈 조건은 보내지 않는다", () => {
    expect(buildStatParams("screen", Q)).toEqual({ fromDt: "20260901", toDt: "20260930" });
  });

  it("부서·사용자·화면 조건은 앞뒤 공백을 지워 보낸다", () => {
    const q = { ...Q, deptCd: " D100 ", userId: " kim ", pageId: " csa/commUserMng " };
    expect(buildStatParams("user", q)).toEqual({
      fromDt: "20260901",
      toDt: "20260930",
      deptCd: "D100",
      userId: "kim",
      pageId: "csa/commUserMng",
    });
  });

  it("부서 상세 조회는 인자로 받은 부서코드가 조회조건 부서보다 우선한다", () => {
    expect(buildStatParams("screen", { ...Q, deptCd: "D100" }, "D200").deptCd).toBe("D200");
    expect(buildStatParams("screen", Q, "-").deptCd).toBe("-");
  });

  it("미사용·개요 탭은 unusedDays 를 숫자로 보내고, 빈 값이면 키를 뺀다 (메인 결정 1·7)", () => {
    expect(buildStatParams("unused", { ...Q, unusedDays: "30" }).unusedDays).toBe(30);
    expect(buildStatParams("overview", { ...Q, unusedDays: "30" }).unusedDays).toBe(30);
    expect(buildStatParams("unused", Q)).not.toHaveProperty("unusedDays");
    expect(buildStatParams("overview", { ...Q, unusedDays: "  " })).not.toHaveProperty(
      "unusedDays"
    );
    expect(buildStatParams("screen", { ...Q, unusedDays: "30" })).not.toHaveProperty("unusedDays");
    expect(buildStatParams("history", { ...Q, unusedDays: "30" })).not.toHaveProperty("unusedDays");
  });
});

describe("statQueryKey", () => {
  it("같은 조건이면 같은 키, 미사용 기준 일수만 바뀌면 개요·미사용 탭 키만 바뀐다", () => {
    const q30 = { ...Q, unusedDays: "30" };
    expect(statQueryKey("screen", Q)).toBe(statQueryKey("screen", { ...Q }));
    expect(statQueryKey("screen", Q)).toBe(statQueryKey("screen", q30));
    expect(statQueryKey("unused", Q)).not.toBe(statQueryKey("unused", q30));
    expect(statQueryKey("overview", Q)).not.toBe(statQueryKey("overview", q30));
    expect(statQueryKey("screen", Q)).not.toBe(statQueryKey("user", Q));
  });
});

describe("호출과 envelope 해제", () => {
  it("byScreen: 경로·meta·params 를 보내고 grids.screens.rows 를 돌려준다", async () => {
    reply({
      meta: { success: true },
      grids: { screens: { rows: [{ pageId: "csa/commUserMng", menuNm: "(메뉴 없음)" }] } },
    });
    const rows = await fetchByScreen(Q);
    const { url, body } = sent();
    expect(url).toBe("/api/mcm/oasis/screenUsageStat/byScreen");
    expect(body.meta).toEqual({ menuId: "screenUsageStat" });
    expect(body.params).toEqual({ fromDt: "20260901", toDt: "20260930" });
    expect(rows).toEqual([{ pageId: "csa/commUserMng", menuNm: "(메뉴 없음)" }]);
  });

  it("byScreen(deptCd): 부서 상세는 deptCd 를 params 에 싣는다", async () => {
    reply({ meta: { success: true }, grids: { screens: { rows: [] } } });
    await fetchByScreen(Q, "D100");
    expect(sent().body.params.deptCd).toBe("D100");
  });

  it("overview: data.result 를 펴서 돌려준다", async () => {
    const result = {
      totalOpenCnt: 12,
      userCnt: 3,
      totalDurationMs: 3_720_000,
      unusedScreenCnt: 5,
      daily: [{ usageDt: "20260901", openCnt: 12, userCnt: 3, durationMs: 3_720_000 }],
      topScreens: [
        { pageId: "csa/commUserMng", menuNm: "사용자 관리", openCnt: 12, durationMs: 3_720_000 },
      ],
    };
    reply({ meta: { success: true }, data: { result } });
    expect(await fetchOverview({ ...Q, unusedDays: "60" })).toEqual(result);
    expect(sent().url).toBe("/api/mcm/oasis/screenUsageStat/overview");
    expect(sent().body.params.unusedDays).toBe(60);
  });

  it("overview: 필드가 빠진 빈 응답은 0 과 빈 배열", async () => {
    reply({ meta: { success: true }, data: { result: {} } });
    expect(await fetchOverview(Q)).toEqual({
      totalOpenCnt: 0,
      userCnt: 0,
      totalDurationMs: 0,
      unusedScreenCnt: 0,
      daily: [],
      topScreens: [],
    });
  });

  it("grids 가 없으면 빈 배열", async () => {
    reply({ meta: { success: true } });
    expect(await fetchByDept(Q)).toEqual([]);
    expect(sent().url).toBe("/api/mcm/oasis/screenUsageStat/byDept");
  });

  it("byUser: 부서를 옮긴 사용자도 행 키가 겹치지 않는다", async () => {
    reply({
      meta: { success: true },
      grids: {
        users: {
          rows: [
            { userId: "kim", deptCd: "D100" },
            { userId: "kim", deptCd: "D200" },
          ],
        },
      },
    });
    const rows = await fetchByUser(Q);
    expect(rows.map((r) => r.rowKey)).toEqual(["kim|D100", "kim|D200"]);
    expect(sent().url).toBe("/api/mcm/oasis/screenUsageStat/byUser");
  });

  it("unused: unusedDays 를 싣고 grids.unused.rows 를 돌려준다", async () => {
    reply({
      meta: { success: true },
      grids: { unused: { rows: [{ pageId: "a/b", lastUsedDt: null }] } },
    });
    const rows = await fetchUnused({ ...Q, unusedDays: "45" });
    const { url, body } = sent();
    expect(url).toBe("/api/mcm/oasis/screenUsageStat/unused");
    expect(body.params.unusedDays).toBe(45);
    expect(rows).toEqual([{ pageId: "a/b", lastUsedDt: null }]);
  });

  it("history: grids.history.rows 를 돌려준다", async () => {
    reply({ meta: { success: true }, grids: { history: { rows: [{ usageId: "u1" }] } } });
    expect(await fetchHistory(Q)).toEqual([{ usageId: "u1" }]);
    expect(sent().url).toBe("/api/mcm/oasis/screenUsageStat/history");
  });

  it("meta.success=false 는 서버 문구로 거절한다", async () => {
    reply({ meta: { success: false, message: "조회 기간이 너무 깁니다." } });
    await expect(fetchHistory(Q)).rejects.toThrow("조회 기간이 너무 깁니다.");
  });

  it("meta.success=false 에 문구가 없으면 기본 문구", async () => {
    reply({ meta: { success: false } });
    await expect(fetchByUser(Q)).rejects.toThrow("요청이 거부되었습니다.");
  });

  it("HTTP 403 은 권한 문구로 거절한다", async () => {
    reply({}, 403);
    await expect(fetchByScreen(Q)).rejects.toThrow("권한이 없습니다.");
  });
});

describe("createTabRequestTracker", () => {
  it("같은 탭의 마지막 요청만 최신이다", () => {
    const t = createTabRequestTracker<"screen" | "dept">();
    const first = t.begin("screen");
    const second = t.begin("screen");
    expect(t.isLatest("screen", first)).toBe(false);
    expect(t.isLatest("screen", second)).toBe(true);
    const other = t.begin("dept");
    expect(t.isLatest("dept", other)).toBe(true);
    expect(t.isLatest("screen", second)).toBe(true);
  });

  it("남은 요청이 있으면 finish 가 true(로딩 유지), 모두 끝나면 false", () => {
    const t = createTabRequestTracker<"screen" | "dept">();
    t.begin("screen");
    t.begin("dept");
    expect(t.finish()).toBe(true);
    expect(t.finish()).toBe(false);
    expect(t.finish()).toBe(false);
  });

  it("받은 조건 키를 기억하고 reset 으로 모두 잊는다", () => {
    const t = createTabRequestTracker<"screen">();
    expect(t.isLoaded("screen", "k1")).toBe(false);
    t.markLoaded("screen", "k1");
    expect(t.isLoaded("screen", "k1")).toBe(true);
    expect(t.isLoaded("screen", "k2")).toBe(false);
    t.reset();
    expect(t.isLoaded("screen", "k1")).toBe(false);
  });
});
