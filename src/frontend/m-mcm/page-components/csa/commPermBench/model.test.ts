import { describe, expect, it } from "vitest";
import { buildMenuTree, flattenMenuRows, flattenNav, indexBench, menuPathOf, peopleList, unusedObjectsOf } from "./model";
import { createMockPermBenchApi } from "./bench.fixture";
import type { BenchMenuRow } from "./types";

const m = (id: string, parent: string | null, name: string, obj: string | null, extra: Partial<BenchMenuRow> = {}): BenchMenuRow => ({
  MENU_ID: id, PARENT_MENU_ID: parent, MENU_NM: name, OBJECT_ID: obj, SORT_SEQ: "1", SHOW_TP: "Y", USE_TP: "Y", VISIBLE: "Y", REASON: null, ...extra,
});

describe("commPermBench model", () => {
  it("peopleList: 그룹마다 첫 사람이 같아도 한 번만 올린다", async () => {
    const api = createMockPermBenchApi();
    const idx = indexBench(await api.searchBench({}));
    const { list } = peopleList(idx, null, "");
    expect(new Set(list.map((u) => u.USER_ID)).size).toBe(list.length);
  });

  it("같은 화면이 두 폴더에 걸려도 폴더마다 자기 줄로 거르고, 누른 줄의 경로를 쓴다", () => {
    const tree = buildMenuTree([
      m("MOD", null, "모듈", null),
      m("FA", "MOD", "폴더A", null),
      m("FB", "MOD", "폴더B", null),
      m("A1", "FA", "공용 화면", "O1"),
      m("B1", "FB", "다른 이름", "O1"),
    ]);
    expect(tree.menusOf.get("O1")?.map((x) => x.MENU_ID)).toEqual(["A1", "B1"]);
    expect(tree.byObject.get("O1")?.MENU_ID).toBe("A1");
    expect(menuPathOf(tree, "O1", "B1")).toBe("모듈 › 폴더B");
    const opts = { open: new Set(["MOD", "FA", "FB"]), filter: "all" as const, isReg: () => true, btnText: () => "" };
    // 폴더A 이름 찾기 = 폴더A 아래 줄 이름으로만 맞춘다(폴더B 의 「다른 이름」 줄이 폴더A 를 살리지 않는다)
    const rows = flattenMenuRows(tree, { ...opts, query: "다른" });
    expect(rows.map((r) => r.MENU_ID)).toEqual(["MOD", "FB", "B1"]);
    expect(flattenNav(tree, new Set(["MOD", "FA", "FB"])).items.filter((i) => i.OBJECT_ID).map((i) => i.MENU_ID)).toEqual(["A1", "B1"]);
  });

  it("OBJ_USE_TP 가 있으면 REASON 보다 먼저, 없으면 REASON 으로 사용 안 함을 판정한다", () => {
    const tree = buildMenuTree([
      m("A", null, "a", "O1", { OBJ_USE_TP: "N", REASON: "NO_PERM" }),
      m("B", null, "b", "O2", { OBJ_USE_TP: "Y", REASON: "OBJ_UNUSED" }),
      m("C", null, "c", "O3", { REASON: "OBJ_UNUSED" }),
      m("D", null, "d", "O4"),
    ]);
    expect([...unusedObjectsOf([tree])].sort()).toEqual(["O1", "O3"]);
    const rows = flattenMenuRows(tree, { open: new Set(), filter: "all", query: "", isReg: () => true, btnText: () => "", objUnused: () => true });
    // 줄의 OBJ_USE_TP 가 있으면 화면이 넘긴 판정보다 먼저다
    expect(rows.map((r) => r.OBJ_UNUSED)).toEqual([true, false, true, true]);
  });

  it("가짜 서버: 사람 기준·역할 기준 메뉴 트리 모두 화면 줄에 OBJ_USE_TP 를 준다", async () => {
    const api = createMockPermBenchApi();
    const bench = await api.searchBench({});
    const role = bench.roles.find((r) => r.ROLE_ID !== "SYSADMIN")!.ROLE_ID;
    const byRole = await api.searchMenuTree({ roleId: role, source: "CUR" });
    const screens = byRole.menus.filter((x) => x.OBJECT_ID);
    expect(screens.every((x) => x.OBJ_USE_TP === "Y" || x.OBJ_USE_TP === "N")).toBe(true);
    expect(screens.some((x) => x.OBJ_USE_TP === "N")).toBe(true);
    expect(byRole.menus.filter((x) => !x.OBJECT_ID).every((x) => x.OBJ_USE_TP == null)).toBe(true);
    const byUser = await api.searchMenuTree({ userId: bench.users[0].USER_ID, source: "CUR" });
    expect(byUser.menus.filter((x) => x.OBJECT_ID).every((x) => x.OBJ_USE_TP === "Y" || x.OBJ_USE_TP === "N")).toBe(true);
  });
});
