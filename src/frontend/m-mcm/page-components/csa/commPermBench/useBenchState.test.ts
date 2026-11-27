/** @vitest-environment happy-dom */
/** 원래 프로그램 → 작업대 열기(useOpenWith 연결)·다시 읽기(epoch)·역할 전체 읽지 않음. JSX 없이 createElement 로 쓴다. */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TabPageContext } from "@dk-oasis/shared/portal-shell";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockPermBenchApi } from "./mock";
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
