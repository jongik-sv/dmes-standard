/** f3 리뷰 고침 시험 — 가짜 API 의 이력 기간·ME_SYSADMIN·메뉴 판정(bench-be #11) + 메뉴 숨김 표시(model). */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockPermBenchApi } from "./bench.fixture";
import { buildMenuTree, flattenNav, hiddenInMenu, indexBench, isHidden } from "./model";
import { PermApplyError, type BenchMenuRow, type HistoryRow } from "./types";

const hisRow = (APPLY_ID: string, APPLY_AT: string): HistoryRow => ({
  APPLY_ID, APPLY_USER_ID: "admin", APPLY_AT, CHANGE_CNT: 1, GAIN_USER_CNT: 0, LOSE_USER_CNT: 0, APPLY_MEMO: null,
});

describe("mock — 적용 이력 기간(bench-be b5)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("기간을 주지 않으면 오늘 − 30일 ~ 오늘, APPLY_AT 내림차순", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 27, 10, 0));
    const api = createMockPermBenchApi({
      history: [hisRow("A", "2026-10-27T09:00:00"), hisRow("B", "2026-10-28T09:00:00"), hisRow("C", "2026-11-27T08:00:00"), hisRow("D", "2026-11-20T09:00:00")],
    });
    const r = await api.searchHistory({});
    expect(r.his.map((h) => h.APPLY_ID)).toEqual(["C", "D", "B"]);
  });

  it("형식이 틀리거나 366일을 넘으면 PERM_BAD_VALUE", async () => {
    const api = createMockPermBenchApi();
    await expect(api.searchHistory({ fromDt: "2026/01/01", toDt: "2026-11-27" })).rejects.toMatchObject({ code: "PERM_BAD_VALUE" });
    const e = await api.searchHistory({ fromDt: "2025-01-01", toDt: "2026-11-27" }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(PermApplyError);
    expect((e as PermApplyError).code).toBe("PERM_BAD_VALUE");
  });

  it("앞 500줄만 · dtl 은 SEQ_NO 오름차순 · 모르는 applyId 는 빈 목록", async () => {
    const many = Array.from({ length: 620 }, (_, i) => hisRow(`P${i}`, `2026-11-${String(1 + (i % 26)).padStart(2, "0")}T${String(i % 24).padStart(2, "0")}:00:00`));
    const api = createMockPermBenchApi({ history: many });
    const r = await api.searchHistory({ fromDt: "2026-11-01", toDt: "2026-11-27" });
    expect(r.his).toHaveLength(500);
    for (let i = 1; i < r.his.length; i++) expect(r.his[i - 1].APPLY_AT >= r.his[i].APPLY_AT).toBe(true);
    const d = await api.searchHistoryDtl({ applyId: "PA20261120-0001" });
    expect(d.dtl.map((x) => x.SEQ_NO)).toEqual([1, 2]);
    expect((await api.searchHistoryDtl({ applyId: "NONE" })).dtl).toEqual([]);
  });
});

describe("mock — ME_SYSADMIN(bench-be f3 추가)", () => {
  it("searchBench 는 me[0].ME_SYSADMIN 을 주고, 화면 색인이 meSysadmin 으로 읽는다", async () => {
    const n = await createMockPermBenchApi().searchBench({});
    expect(n.me).toEqual([{ ME_SYSADMIN: "N" }]);
    expect(indexBench(n).meSysadmin).toBe(false);
    const y = await createMockPermBenchApi({ meSysadmin: true }).searchBench({});
    expect(indexBench(y).meSysadmin).toBe(true);
    expect(indexBench({ ...y, me: undefined }).meSysadmin).toBe(false);
  });
});

describe("mock — 메뉴 판정(bench-be #11 런타임 PermExplainService)", () => {
  it("a) 권한이 닿는 숨긴 화면 = VISIBLE Y · MENU_HIDDEN · SHOW_TP N", async () => {
    const api = createMockPermBenchApi();
    const { menus } = await api.searchMenuTree({ roleId: "SYSADMIN", source: "CUR" });
    const hidden = menus.filter((m) => m.OBJECT_ID && m.SHOW_TP === "N");
    expect(hidden.length).toBeGreaterThan(0);
    for (const m of hidden) expect(m).toMatchObject({ VISIBLE: "Y", REASON: "MENU_HIDDEN" });
  });

  it("d) 역할 기준 트리도 실제 이유(ROLE_UNUSED·OBJ_UNUSED)를 준다 — NO_PERM 하나로 바꾸지 않는다", async () => {
    const api = createMockPermBenchApi();
    const old = (await api.searchMenuTree({ roleId: "ROLE_OLD_REPORT", source: "CUR" })).menus;
    expect(old.some((m) => m.OBJECT_ID && m.REASON === "ROLE_UNUSED")).toBe(true);
    const sys = (await api.searchMenuTree({ roleId: "SYSADMIN", source: "CUR" })).menus;
    const unused = sys.filter((m) => m.OBJECT_ID && m.OBJ_USE_TP === "N");
    expect(unused.length).toBeGreaterThan(0);
    for (const m of unused) expect(m).toMatchObject({ VISIBLE: "N", REASON: "OBJ_UNUSED" });
  });

  it("e) 줄 순서 = 그래프 메뉴 순서(가짜 그래프 menus 순서 그대로)", async () => {
    const api = createMockPermBenchApi();
    const { menus } = await api.searchMenuTree({ roleId: "SYSADMIN", source: "CUR" });
    expect(menus.map((m) => m.MENU_ID)).toEqual(api.graph().menus.map((m) => m.MENU_ID));
  });
});

const row = (MENU_ID: string, PARENT_MENU_ID: string | null, OBJECT_ID: string | null, extra: Partial<BenchMenuRow> = {}): BenchMenuRow => ({
  MENU_ID, PARENT_MENU_ID, MENU_NM: MENU_ID, OBJECT_ID, SORT_SEQ: "1", SHOW_TP: "Y", USE_TP: "Y", VISIBLE: "Y", REASON: null, ...extra,
});

describe("model — 메뉴 숨김 표시(bench-be #11)", () => {
  const tree = buildMenuTree([
    row("M", null, null),
    row("F1", "M", null, { REASON: "MENU_HIDDEN" }), // b) 보이는 화면의 숨긴 위 폴더
    row("S1", "F1", "o1"),
    row("F2", "M", null),
    row("S2", "F2", "o2", { SHOW_TP: "N", REASON: "MENU_HIDDEN" }), // a) 주소로 여는 숨긴 화면
    row("S3", "F2", "o3"),
    row("S4", "F2", null, { VISIBLE: "N", REASON: "NO_PERM" }), // c) OBJECT_ID 없는 화면
  ]);

  it("「숨김」은 SHOW_TP N 또는 REASON MENU_HIDDEN, 위 폴더가 숨김이면 그 아래 화면도 메뉴에서 숨김", () => {
    expect(isHidden(tree.byId.get("S2"))).toBe(true);
    expect(isHidden(tree.byId.get("F1"))).toBe(true);
    expect(isHidden(tree.byId.get("S3"))).toBe(false);
    expect(hiddenInMenu(tree, tree.byId.get("S1"))).toBe(true);
    expect(hiddenInMenu(tree, tree.byId.get("S3"))).toBe(false);
  });

  it("미리보기 메뉴: 숨긴 화면은 줄로 보이되 HIDDEN, 메뉴 수에는 넣지 않는다", () => {
    const nav = flattenNav(tree, new Set(["M", "F1", "F2"]));
    const byId = new Map(nav.items.map((x) => [x.MENU_ID, x]));
    expect(byId.get("S1")?.HIDDEN).toBe(true);
    expect(byId.get("S2")?.HIDDEN).toBe(true);
    expect(byId.get("S3")?.HIDDEN).toBeUndefined();
    expect(byId.has("S4")).toBe(false);
    expect(nav.visibleCnt).toBe(1);
  });

  it("buildMenuTree 는 SORT_SEQ 로 다시 정렬하지 않는다(서버 순서 그대로)", () => {
    const t = buildMenuTree([row("M", null, null), row("B", "M", "ob", { SORT_SEQ: "9" }), row("A", "M", "oa", { SORT_SEQ: "1" })]);
    expect((t.children.get("M") ?? []).map((m) => m.MENU_ID)).toEqual(["B", "A"]);
  });
});
