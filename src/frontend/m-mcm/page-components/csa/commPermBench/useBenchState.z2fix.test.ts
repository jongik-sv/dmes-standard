/** @vitest-environment happy-dom */
/** z2 F5 — 역할 기준에서 퍼미션 없는 화면을 고르면 그 폴더로 searchRolePerm 을 한 번 더 불러 허용 값 줄을 얹는다. JSX 없이 createElement 로 쓴다. */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TabPageContext } from "@dk-oasis/shared/portal-shell";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockPermBenchApi } from "./bench.fixture";
import { changeKey } from "./draft";
import { hasPerm } from "./model";
import { openBench } from "./nav";
import { useBenchState, type BenchState } from "./useBenchState";
import { withFolderRows } from "./useBenchData";
import type { PermBenchApi, RolePermRow } from "./types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const row = (oid: string, btn: string | null): RolePermRow => ({
  ROLE_ID: "R1", OBJECT_ID: oid, OBJECT_NM: oid, MENU_PATH: "", OBJ_BTN_PERM: "search,save", OBJ_POPUP_PERM: "", OBJ_READ_PERM: "search",
  BTN_PERM: btn, POPUP_PERM: btn === null ? null : "", DATA_PERM: null,
});

describe("withFolderRows", () => {
  it("역할 줄 전부에 없는 줄만 얹고, 역할 줄 전부가 없는 역할은 건드리지 않는다", () => {
    const perms = new Map([["R1", new Map([["a", row("a", "search")]])]]);
    const folder = new Map([
      ["R1", new Map([["a", row("a", null)], ["b", row("b", null)]])],
      ["R2", new Map([["c", row("c", null)]])],
    ]);
    const out = withFolderRows(perms, folder);
    expect(out.get("R1")?.get("a")?.BTN_PERM).toBe("search");
    expect(out.get("R1")?.get("b")?.BTN_PERM).toBeNull();
    expect(out.has("R2")).toBe(false);
    expect(withFolderRows(perms, new Map())).toBe(perms);
  });
});

describe("useBenchState — 퍼미션 없는 화면 고르기(z2 F5)", () => {
  let root: Root;
  let host: HTMLElement;
  let state: BenchState;
  let api: PermBenchApi;
  const Probe = () => {
    state = useBenchState(api);
    return null;
  };
  const mount = async () => {
    await act(async () => {
      root.render(createElement(TabPageContext.Provider, { value: { pageId: "mcm:csa/commPermBench", serviceId: "", tabId: "t1" } }, createElement(Probe)));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
  };
  beforeEach(() => {
    window.sessionStorage.clear();
    api = createMockPermBenchApi({ latencyMs: 0 });
    host = document.createElement("div");
    root = createRoot(host);
  });
  afterEach(() => act(() => root.unmount()));

  it("역할 줄 전부에 없는 화면 → 그 폴더(menuFolderId)로 읽어 허용 값이 든 빈 줄을 얹는다", async () => {
    const bench = await api.searchBench({});
    const role = bench.roles.find((r) => r.ROLE_ID !== "SYSADMIN" && r.PERM_CNT > 0)!.ROLE_ID;
    const all = await api.searchRolePerm({ roleId: role, source: "CUR" });
    const tree = await api.searchMenuTree({ roleId: role, source: "CUR" });
    // 역할 줄 전부(menuFolderId 없음)에는 퍼미션 있는 줄만 온다(서버 bench-be #13)
    expect(all.perms.every(hasPerm)).toBe(true);
    const have = new Set(all.perms.map((r) => r.OBJECT_ID));
    const screen = tree.menus.find((m) => m.OBJECT_ID && !have.has(m.OBJECT_ID))!;
    expect(screen).toBeTruthy();

    const spy = vi.spyOn(api, "searchRolePerm");
    openBench("commRoleMng", role, screen.OBJECT_ID!);
    await mount();
    expect(state.sel.by).toBe("role");
    expect(state.sel.objectId).toBe(screen.OBJECT_ID);

    expect(spy.mock.calls.some((c) => c[0].roleId === role && c[0].menuFolderId === screen.PARENT_MENU_ID)).toBe(true);
    const got = state.data.rolePerms.get(role)?.get(screen.OBJECT_ID!);
    expect(got).toBeTruthy();
    expect(hasPerm(got)).toBe(false);
    expect(got!.OBJ_BTN_PERM).toBeTruthy();

    // 메뉴 칸에서 다른 폴더를 펼치면 그 폴더도 읽는다(폴더 체크가 퍼미션 없는 화면을 건너뛰지 않게)
    const other = tree.menus.find((m) => m.OBJECT_ID && !have.has(m.OBJECT_ID) && m.PARENT_MENU_ID !== screen.PARENT_MENU_ID)!;
    expect(other).toBeTruthy();
    if (!state.sel.open.has(other.PARENT_MENU_ID!)) {
      await act(async () => {
        state.actions.toggleOpen(other.PARENT_MENU_ID!);
        await new Promise((r) => setTimeout(r, 30));
      });
    }
    expect(spy.mock.calls.some((c) => c[0].roleId === role && c[0].menuFolderId === other.PARENT_MENU_ID)).toBe(true);
    expect(state.data.rolePerms.get(role)?.has(other.OBJECT_ID!)).toBe(true);
  });

  it("접힌 폴더를 바로 체크하면 그 폴더 줄을 먼저 읽고, 퍼미션 없는 화면도 초안에 넣는다", async () => {
    const bench = await api.searchBench({});
    const role = bench.roles.find((r) => r.ROLE_ID !== "SYSADMIN" && r.PERM_CNT > 0)!.ROLE_ID;
    const all = await api.searchRolePerm({ roleId: role, source: "CUR" });
    const tree = await api.searchMenuTree({ roleId: role, source: "CUR" });
    const have = new Set(all.perms.map((r) => r.OBJECT_ID));
    const start = tree.menus.find((m) => m.OBJECT_ID && have.has(m.OBJECT_ID))!;
    openBench("commRoleMng", role, start.OBJECT_ID!);
    await mount();
    expect(state.canEdit).toBe(true);
    // 고른 화면 폴더와 다른, 접힌 폴더 중 퍼미션 없는 화면이 있는 것
    const target = tree.menus.find(
      (m) => m.OBJECT_ID && !have.has(m.OBJECT_ID) && m.PARENT_MENU_ID !== start.PARENT_MENU_ID && !state.sel.open.has(m.PARENT_MENU_ID!),
    )!;
    expect(target).toBeTruthy();
    const folder = target.PARENT_MENU_ID!;
    const ids = tree.menus.filter((m) => m.PARENT_MENU_ID === folder && m.OBJECT_ID).map((m) => m.OBJECT_ID!);
    expect(state.data.rolePerms.get(role)?.has(target.OBJECT_ID!)).toBe(false);

    // 폴더 읽기를 붙잡아 두고 읽는 동안 등록 체크가 꺼지는지 본다
    const orig = api.searchRolePerm.bind(api);
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const spy = vi.spyOn(api, "searchRolePerm").mockImplementation(async (p) => {
      if (p.menuFolderId) await gate;
      return orig(p);
    });
    await act(async () => {
      state.edit.toggleRegister(ids, true);
    });
    expect(state.registerLoading).toBe(true);
    expect(state.draft.draft.get(changeKey("ROLE_OBJ", role, target.OBJECT_ID!))).toBeUndefined();
    await act(async () => {
      release();
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(state.registerLoading).toBe(false);
    expect(spy.mock.calls.some((c) => c[0].roleId === role && c[0].menuFolderId === folder)).toBe(true);
    const c = state.draft.draft.get(changeKey("ROLE_OBJ", role, target.OBJECT_ID!));
    expect(c?.OP).toBe("ADD");
    expect(c?.BTN_PERM).toBeTruthy();
  });

  it("고른 화면 오브젝트 줄: 폴더 읽는 동안 loading, 다 읽었는데 줄이 없으면 none, 실패면 failed", async () => {
    const bench = await api.searchBench({});
    const role = bench.roles.find((r) => r.ROLE_ID !== "SYSADMIN" && r.PERM_CNT > 0)!.ROLE_ID;
    const all = await api.searchRolePerm({ roleId: role, source: "CUR" });
    const tree = await api.searchMenuTree({ roleId: role, source: "CUR" });
    const have = new Set(all.perms.map((r) => r.OBJECT_ID));
    const screen = tree.menus.find((m) => m.OBJECT_ID && !have.has(m.OBJECT_ID))!;
    const orig = api.searchRolePerm.bind(api);
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    vi.spyOn(api, "searchRolePerm").mockImplementation(async (p) => {
      if (!p.menuFolderId) return orig(p);
      await gate;
      return { perms: [] };
    });
    openBench("commRoleMng", role, screen.OBJECT_ID!);
    await mount();
    expect(state.objRowState).toBe("loading");
    await act(async () => {
      release();
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(state.objRowState).toBe("none");
  });

  it("폴더 줄 읽기가 실패하면 적용하지 않고 알린다", async () => {
    const bench = await api.searchBench({});
    const role = bench.roles.find((r) => r.ROLE_ID !== "SYSADMIN" && r.PERM_CNT > 0)!.ROLE_ID;
    const all = await api.searchRolePerm({ roleId: role, source: "CUR" });
    const tree = await api.searchMenuTree({ roleId: role, source: "CUR" });
    const have = new Set(all.perms.map((r) => r.OBJECT_ID));
    const start = tree.menus.find((m) => m.OBJECT_ID && have.has(m.OBJECT_ID))!;
    openBench("commRoleMng", role, start.OBJECT_ID!);
    await mount();
    const target = tree.menus.find(
      (m) => m.OBJECT_ID && !have.has(m.OBJECT_ID) && m.PARENT_MENU_ID !== start.PARENT_MENU_ID && !state.sel.open.has(m.PARENT_MENU_ID!),
    )!;
    const orig = api.searchRolePerm.bind(api);
    vi.spyOn(api, "searchRolePerm").mockImplementation((p) => (p.menuFolderId ? Promise.reject(new Error("boom")) : orig(p)));
    const before = state.draft.draft.size;
    await act(async () => {
      state.edit.toggleRegister([target.OBJECT_ID!], true);
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(state.draft.draft.size).toBe(before);
    expect(state.sel.flash).toContain("퍼미션을 읽지 못해 등록하지 않았습니다");
    expect(state.registerLoading).toBe(false);
  });
});
