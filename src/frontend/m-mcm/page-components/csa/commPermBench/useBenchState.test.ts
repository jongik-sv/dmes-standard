/** @vitest-environment happy-dom */
/** 원래 프로그램 → 작업대 열기(useOpenWith 연결)·다시 읽기(epoch)·역할 전체 읽지 않음. JSX 없이 createElement 로 쓴다. */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TabPageContext } from "@dk-oasis/shared/portal-shell";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockPermBenchApi } from "./bench.fixture";
import { openBench } from "./nav";
import { useBenchState, type BenchState } from "./useBenchState";
import { roleTreeKey } from "./useBenchData";
import type { PermBenchApi } from "./types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("useBenchState — 원래 프로그램에서 열기", () => {
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

  it("역할·화면을 역할 기준으로 열고, 그 화면의 모듈·폴더를 펼친다. 역할 전체의 퍼미션은 읽지 않는다", async () => {
    const bench = await api.searchBench({});
    const role = bench.roles.find((r) => r.ROLE_ID !== "SYSADMIN" && r.PERM_CNT > 0)!.ROLE_ID;
    const tree = await api.searchMenuTree({ roleId: role, source: "CUR" });
    const screen = tree.menus.filter((m) => m.OBJECT_ID).at(-1)!;
    const spy = vi.spyOn(api, "searchRolePerm");
    openBench("commRoleMng", role, screen.OBJECT_ID!);
    await mount();
    expect(state.sel.by).toBe("role");
    expect(state.sel.roleId).toBe(role);
    expect(state.sel.objectId).toBe(screen.OBJECT_ID);
    expect(state.sel.reveal).toBeNull();
    expect(state.sel.open.has(screen.PARENT_MENU_ID!)).toBe(true);
    expect(state.data.menuTrees.has(roleTreeKey(role))).toBe(true);
    // 고른 역할과 처음 고른 사람이 받은 역할만 읽는다(역할 전체 11개를 읽지 않는다)
    const read = spy.mock.calls.map((c) => c[0].roleId);
    expect(read).toContain(role);
    expect(read.length).toBeLessThan(bench.roles.length - 1);
    // 읽은 약속은 지워진다
    expect(window.sessionStorage.getItem("dmes:open-with:commPermBench")).toBeNull();
  });

  it("ME_SYSADMIN: searchBench me[0] 이 Y 면 SYSADMIN 소속 잠금을 풀고, 기본(N)이면 잠근다", async () => {
    await mount();
    expect(state.isSysadmin).toBe(false);
    act(() => root.unmount());
    root = createRoot(host);
    api = createMockPermBenchApi({ latencyMs: 0, meSysadmin: true });
    await mount();
    expect(state.isSysadmin).toBe(true);
  });

  it("2단계: 칩 편집 → 자동 저장 → 초안 보기·영향 → 충돌이면 초안 유지 → 적용하면 초안이 빈다", async () => {
    const mock = createMockPermBenchApi({ latencyMs: 0 });
    api = mock;
    await mount();
    expect(state.canEdit).toBe(true);
    expect(state.draft.status).toBe("ready");
    const { roleId, objectId } = state.sel;
    expect(roleId && objectId).toBeTruthy();
    const cur = state.data.rolePerms.get(roleId!)!.get(objectId!)!;
    const allBtn = (cur.OBJ_BTN_PERM ?? "").split(",").filter(Boolean);
    await act(async () => state.edit.setPermValues(allBtn, []));
    expect(state.draft.draft.size).toBe(1);
    expect(state.draft.dirty).toBe(true);
    // 메뉴 칸·퍼미션 칸은 저장 전에도 초안 값
    expect(state.view.menuRolePerm?.get(objectId!)?.BTN_PERM).toBe(allBtn.join(","));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 700));
    });
    expect(state.draft.dirty).toBe(false);
    expect(state.draft.savedCount).toBe(1);
    expect((await mock.loadDraft()).draft[0].CHANGE_CNT).toBe(1);
    expect(state.look).toBe("DRAFT");
    expect(state.draft.impact?.summary[0].GAIN_USER_CNT).toBeGreaterThan(0);
    mock.forceConflictOnce();
    await act(async () => {
      await expect(state.draft.apply("", "Y")).rejects.toMatchObject({ code: "PERM_CONFLICT" });
    });
    expect(state.draft.draft.size).toBe(1);
    await act(async () => {
      const r = await state.draft.apply("시험", "Y");
      expect(r.result[0].CHANGE_CNT).toBe(1);
    });
    expect(state.draft.draft.size).toBe(0);
    expect(mock.graph().perms.get(roleId!)?.get(objectId!)?.btn).toEqual(expect.arrayContaining(allBtn));
  });

  it("SYSADMIN 이 아니면 SYSADMIN 을 주는 그룹의 소속·SYSADMIN 역할 체크는 초안에 담지 않는다", async () => {
    await mount();
    await act(async () => state.edit.toggleMember("RG_ADMIN", true));
    expect(state.draft.draft.size).toBe(0);
    await act(async () => state.edit.toggleGroupRole("SYSADMIN", true));
    expect(state.draft.draft.size).toBe(0);
    await act(async () => state.edit.toggleMember("RG_QC_TEAM", true));
    expect(state.draft.draft.size).toBe(1);
    expect(state.sel.groupId).toBe("RG_QC_TEAM");
  });

  it("고른 역할을 그룹에서 빼 고르기가 다른 역할로 옮겨도, 메뉴 칸은 옮겨 간 역할의 초안을 보인다", async () => {
    await mount();
    expect(state.sel.groupId).toBe("RG_CR_OPS");
    await act(async () => state.actions.selectRole("ROLE_VIEWER"));
    const oid = state.sel.objectId!;
    const cur = state.data.rolePerms.get("ROLE_VIEWER")!.get(oid)!;
    const allowed = (cur.OBJ_BTN_PERM ?? "").split(",").filter(Boolean);
    const want = cur.BTN_PERM === null ? allowed.slice(0, 1) : allowed;
    await act(async () => state.edit.setPermValues(want, []));
    const row = [...state.draft.draft.values()].find((c) => c.TP === "ROLE_OBJ")!;
    expect(row).toBeTruthy();
    await act(async () => state.actions.selectRole("ROLE_CR_OPERATOR"));
    await act(async () => state.edit.toggleGroupRole("ROLE_CR_OPERATOR", false));
    expect(state.sel.roleId).toBe("ROLE_VIEWER");
    expect(state.view.menuRolePerm?.get(oid)?.BTN_PERM).toBe(row.BTN_PERM);
  });

  it("모르는 역할은 무시한다(사람 기준 그대로)", async () => {
    openBench("commObjMng", "NO_SUCH_ROLE", "x");
    await mount();
    expect(state.sel.by).toBe("person");
    expect(state.sel.reveal).toBeNull();
  });

  it("그 역할 메뉴에 없는 화면이면 화면은 비우고(첫 화면 고르기가 이어받는다) 역할만 연다", async () => {
    const bench = await api.searchBench({});
    const role = bench.roles.find((r) => r.ROLE_ID !== "SYSADMIN")!.ROLE_ID;
    openBench("commRoleMng", role, "NO_SUCH_OBJECT");
    await mount();
    expect(state.sel.by).toBe("role");
    expect(state.sel.objectId).not.toBe("NO_SUCH_OBJECT");
  });
});
