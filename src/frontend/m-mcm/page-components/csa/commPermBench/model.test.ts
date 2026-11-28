import { describe, expect, it } from "vitest";
import { BENCH_USER_LIMIT, buildMenuTree, flattenMenuRows, flattenNav, foundHint, indexBench, menuPathOf, peopleHint, peopleList, pickList, sortRows, unusedObjectsOf } from "./model";
import { createMockPermBenchApi } from "./bench.fixture";
import type { BenchMenuRow } from "./types";

const m = (id: string, parent: string | null, name: string, obj: string | null, extra: Partial<BenchMenuRow> = {}): BenchMenuRow => ({
  MENU_ID: id, PARENT_MENU_ID: parent, MENU_NM: name, OBJECT_ID: obj, SORT_SEQ: "1", SHOW_TP: "Y", USE_TP: "Y", VISIBLE: "Y", REASON: null, ...extra,
});

describe("commPermBench model", () => {
  it("peopleList: 찾는 말이 없으면 받은 사람 전부를 USER_ID 순으로 두고, 고른 사람도 자기 자리에 둔다", async () => {
    const api = createMockPermBenchApi();
    const idx = indexBench(await api.searchBench({}));
    const shuffled = { ...idx, users: [...idx.users].reverse() };
    const ids = [...idx.users.map((u) => u.USER_ID)].sort();
    const all = peopleList(shuffled, null, "");
    expect(all.found).toBeNull();
    expect(all.list.map((u) => u.USER_ID)).toEqual(ids);
    const pick = ids[10];
    const withSel = peopleList(shuffled, pick, "");
    expect(withSel.list.map((u) => u.USER_ID)).toEqual(ids);
    expect(withSel.list[10].USER_ID).toBe(pick);
  });

  it("peopleList: 찾는 말은 이름·부서·사번에 맞추고, 걸러진 고른 사람은 정렬 자리에 남는다", async () => {
    const api = createMockPermBenchApi();
    const idx = indexBench(await api.searchBench({}));
    const ids = [...idx.users.map((u) => u.USER_ID)].sort();
    // 고른 사람이 찾은 사람보다 뒤 ID 면 뒤에, 앞 ID 면 앞에 둔다
    const r1 = peopleList(idx, ids[20], ids[3].toUpperCase());
    expect(r1.found).toBe(1);
    expect(r1.list.map((u) => u.USER_ID)).toEqual([ids[3], ids[20]]);
    const r2 = peopleList(idx, ids[0], ids[3]);
    expect(r2.list.map((u) => u.USER_ID)).toEqual([ids[0], ids[3]]);
  });

  it("peopleList: 이름 내림 정렬도 고른 사람을 그 자리에 둔다", async () => {
    const api = createMockPermBenchApi();
    const idx = indexBench(await api.searchBench({}));
    const byNameDesc = peopleList(idx, idx.users[5].USER_ID, "", { key: "name", dir: "desc" }).list;
    const expected = [...idx.users].sort((a, b) => a.USER_NM.localeCompare(b.USER_NM, "ko") || (a.USER_ID < b.USER_ID ? -1 : 1)).reverse();
    expect(byNameDesc.map((u) => u.USER_ID)).toEqual(expected.map((u) => u.USER_ID));
  });

  it("sortRows: ID 는 글자 코드 순, 이름은 한국어 순(같으면 ID 순), 내림은 뒤집고 입력은 그대로", () => {
    const rows = [
      { id: "RG_b", nm: "나" },
      { id: "RGA", nm: "가" },
      { id: "RG_A", nm: "나" },
    ];
    const idOf = (r: { id: string }) => r.id;
    const nmOf = (r: { nm: string }) => r.nm;
    expect(sortRows(rows, { key: "id", dir: "asc" }, idOf, nmOf).map(idOf)).toEqual(["RGA", "RG_A", "RG_b"]);
    expect(sortRows(rows, { key: "id", dir: "desc" }, idOf, nmOf).map(idOf)).toEqual(["RG_b", "RG_A", "RGA"]);
    expect(sortRows(rows, { key: "name", dir: "asc" }, idOf, nmOf).map(idOf)).toEqual(["RGA", "RG_A", "RG_b"]);
    expect(sortRows(rows, { key: "name", dir: "desc" }, idOf, nmOf).map(idOf)).toEqual(["RG_b", "RG_A", "RGA"]);
    expect(rows.map(idOf)).toEqual(["RG_b", "RGA", "RG_A"]);
  });

  it("peopleHint: 찾는 중이면 N명 찾음, 서버 상한(200명)이면 좁히라는 안내, 그 밖에는 없음", () => {
    expect(BENCH_USER_LIMIT).toBe(200);
    expect(peopleHint(200, null)).toBe("앞 200명만 보입니다. 찾기로 좁히세요");
    expect(peopleHint(199, null)).toBeNull();
    expect(peopleHint(200, 3)).toBe("3명 찾음");
    expect(peopleHint(12, 0)).toBe("0명 찾음");
  });

  it("pickList: 대소문자 무시 부분 일치, 걸러진 고른 항목은 받은 순서 자리에 남고, 찾는 말이 없으면 순서 그대로", () => {
    const rows = [
      { id: "RG_ADMIN", nm: "관리자" },
      { id: "RG_PROD", nm: "생산팀" },
      { id: "RG_QC_TEAM", nm: "품질팀" },
    ];
    const idOf = (r: { id: string }) => r.id;
    const textOf = (r: { id: string; nm: string }) => `${r.id} ${r.nm}`;
    expect(pickList(rows, "RG_QC_TEAM", "", idOf, textOf)).toEqual({ list: rows, found: null });
    expect(pickList(rows, null, "rg_q", idOf, textOf)).toEqual({ list: [rows[2]], found: 1 });
    // 고른 관리자는 맞지 않아도 남고, 맨 위가 아니라 자기 자리(첫째)에 있다
    expect(pickList(rows, "RG_ADMIN", "품질", idOf, textOf)).toEqual({ list: [rows[0], rows[2]], found: 1 });
    expect(pickList(rows, "RG_QC_TEAM", "생산", idOf, textOf)).toEqual({ list: [rows[1], rows[2]], found: 1 });
    expect(pickList(rows, "RG_PROD", "팀", idOf, textOf)).toEqual({ list: [rows[1], rows[2]], found: 2 });
    expect(pickList(rows, null, "없는말", idOf, textOf)).toEqual({ list: [], found: 0 });
    expect(foundHint(null)).toBeNull();
    expect(foundHint(2)).toBe("2개 찾음");
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
