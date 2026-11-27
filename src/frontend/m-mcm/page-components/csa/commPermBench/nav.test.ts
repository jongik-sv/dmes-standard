/** @vitest-environment happy-dom */
/** 3단계 링크 — openLegacy(이벤트·sessionStorage), readOpenWith 왕복, useReloadOnReturn(탭 복귀). JSX 없이 createElement 로 쓴다. */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TabPageContext } from "@dk-oasis/shared/portal-shell";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearOpenWith, legacyPageId, legacyTip, openBench, openLegacy, readOpenWith, useOpenWith, useReloadOnReturn } from "./nav";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("openLegacy", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("portal-open-tab 을 mcm:csa/<screenId> pageId 로 보내고 약속을 적는다", () => {
    const got: unknown[] = [];
    const on = (e: Event) => got.push((e as CustomEvent).detail);
    window.addEventListener("portal-open-tab", on);
    openLegacy("role", "edit", "R-1");
    window.removeEventListener("portal-open-tab", on);
    expect(got).toEqual([{ pageId: "mcm:csa/commRoleMng" }]);
    const saved = JSON.parse(window.sessionStorage.getItem("dmes:open-with:commRoleMng") ?? "null");
    expect(saved).toMatchObject({ from: "commPermBench", mode: "edit", id: "R-1" });
    expect(typeof saved.at).toBe("number");
  });

  it("folder 는 메뉴 관리로 간다. mode=new 는 id 가 없다", () => {
    expect(legacyPageId("folder")).toBe("mcm:csa/commMenuMng");
    openLegacy("folder", "new");
    const saved = JSON.parse(window.sessionStorage.getItem("dmes:open-with:commMenuMng") ?? "null");
    expect(saved.mode).toBe("new");
    expect("id" in saved).toBe(false);
  });

  it("sessionStorage 가 막혀도 탭은 연다", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const on = vi.fn();
    window.addEventListener("portal-open-tab", on);
    expect(() => openLegacy("user", "edit", "U1")).not.toThrow();
    window.removeEventListener("portal-open-tab", on);
    spy.mockRestore();
    expect(on).toHaveBeenCalledTimes(1);
  });
});

describe("readOpenWith", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("왕복·지우기", () => {
    expect(readOpenWith("commObjMng")).toBeNull();
    openLegacy("obj", "edit", "O-9");
    expect(readOpenWith("commObjMng")).toMatchObject({ from: "commPermBench", mode: "edit", id: "O-9" });
    expect(readOpenWith("commObjMng", true)).not.toBeNull();
    expect(readOpenWith("commObjMng")).toBeNull();
    openLegacy("obj", "new");
    clearOpenWith("commObjMng");
    expect(readOpenWith("commObjMng")).toBeNull();
  });

  it("깨진 값은 null", () => {
    window.sessionStorage.setItem("dmes:open-with:commUserMng", "{oops");
    expect(readOpenWith("commUserMng")).toBeNull();
    window.sessionStorage.setItem("dmes:open-with:commUserMng", JSON.stringify({ from: "x", mode: "edit" }));
    expect(readOpenWith("commUserMng")).toBeNull();
  });
});

describe("openBench (원래 프로그램 → 작업대)", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("portal-open-tab 을 mcm:csa/commPermBench 로 보내고 약속에 from·id·objectId 를 적는다", () => {
    const got: unknown[] = [];
    const on = (e: Event) => got.push((e as CustomEvent).detail);
    window.addEventListener("portal-open-tab", on);
    openBench("commRoleMng", "ROLE_A", "mcm0014");
    window.removeEventListener("portal-open-tab", on);
    expect(got).toEqual([{ pageId: "mcm:csa/commPermBench" }]);
    const saved = JSON.parse(window.sessionStorage.getItem("dmes:open-with:commPermBench") ?? "null");
    expect(saved).toMatchObject({ from: "commRoleMng", mode: "edit", id: "ROLE_A", objectId: "mcm0014" });
    expect(typeof saved.at).toBe("number");
  });

  it("objectId 를 안 주면 키가 없다. 읽으면 같은 값이 돌아온다", () => {
    openBench("commObjMng", "ROLE_B");
    const saved = JSON.parse(window.sessionStorage.getItem("dmes:open-with:commPermBench") ?? "null");
    expect("objectId" in saved).toBe(false);
    expect(readOpenWith("commPermBench")).toMatchObject({ from: "commObjMng", mode: "edit", id: "ROLE_B", objectId: undefined });
    openBench("commPermMng", "ROLE_C", "O1");
    expect(readOpenWith("commPermBench", true)).toMatchObject({ from: "commPermMng", id: "ROLE_C", objectId: "O1" });
    expect(readOpenWith("commPermBench")).toBeNull();
  });

  it("모르는 from 이나 문자열이 아닌 objectId 는 받지 않는다", () => {
    window.sessionStorage.setItem("dmes:open-with:commPermBench", JSON.stringify({ from: "commUserMng", mode: "edit", id: "R" }));
    expect(readOpenWith("commPermBench")).toBeNull();
    window.sessionStorage.setItem("dmes:open-with:commPermBench", JSON.stringify({ from: "commRoleMng", mode: "edit", id: "R", objectId: 7 }));
    expect(readOpenWith("commPermBench")?.objectId).toBeUndefined();
  });
});

describe("legacyTip", () => {
  it("문구", () => {
    expect(legacyTip("role", "역할 편집")).toBe("역할 편집 — 역할 관리(commRoleMng)에서 엽니다 ↗");
  });
});

describe("useReloadOnReturn", () => {
  let root: Root;
  let host: HTMLElement;
  const reload = vi.fn();
  const activate = (tabId: string) => act(() => void window.dispatchEvent(new CustomEvent("portal-tab-activated", { detail: { tabId } })));
  const Probe = () => {
    useReloadOnReturn(reload);
    return null;
  };
  const mount = (tabId: string | undefined) => {
    host = document.createElement("div");
    root = createRoot(host);
    act(() => root.render(createElement(TabPageContext.Provider, { value: { pageId: "mcm:csa/commPermBench", serviceId: "", tabId } }, createElement(Probe))));
  };
  beforeEach(() => reload.mockClear());
  afterEach(() => act(() => root.unmount()));

  it("처음 활성은 건너뛰고, 떠났다 돌아오면 한 번 부른다", () => {
    mount("t1");
    activate("t1");
    expect(reload).not.toHaveBeenCalled();
    activate("t2");
    expect(reload).not.toHaveBeenCalled();
    activate("t1");
    expect(reload).toHaveBeenCalledTimes(1);
    activate("t1");
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("포털 밖(tabId 없음)에서는 부르지 않는다", () => {
    mount(undefined);
    activate("t2");
    activate("t1");
    expect(reload).not.toHaveBeenCalled();
  });
});

describe("useOpenWith", () => {
  let root: Root;
  let host: HTMLElement;
  const handler = vi.fn<(ow: { mode: string; id?: string }, attempt: number) => "wait" | void>();
  const Probe = ({ ready }: { ready: boolean }) => {
    useOpenWith("commUserMng", handler as never, ready);
    return null;
  };
  const render = (tabId: string | undefined, ready: boolean) =>
    act(() => root.render(createElement(TabPageContext.Provider, { value: { pageId: "mcm:csa/commUserMng", serviceId: "", tabId } }, createElement(Probe, { ready }))));
  const activate = (tabId: string) => act(() => void window.dispatchEvent(new CustomEvent("portal-tab-activated", { detail: { tabId } })));
  beforeEach(() => {
    window.sessionStorage.clear();
    handler.mockReset();
    host = document.createElement("div");
    root = createRoot(host);
  });
  afterEach(() => act(() => root.unmount()));

  it("마운트 때 읽고 지우며, ready 가 될 때까지 기다렸다 한 번 부른다", () => {
    openLegacy("user", "edit", "U1");
    render("t1", false);
    expect(handler).not.toHaveBeenCalled();
    expect(readOpenWith("commUserMng")).toBeNull();
    render("t1", true);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toMatchObject({ mode: "edit", id: "U1" });
    expect(handler.mock.calls[0][1]).toBe(0);
    render("t1", false);
    render("t1", true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("약속이 없으면 부르지 않는다", () => {
    render("t1", true);
    expect(handler).not.toHaveBeenCalled();
  });

  it("이미 열린 탭은 활성화 이벤트 때 읽는다(다른 탭 이벤트는 무시)", () => {
    render("t1", true);
    openLegacy("user", "new");
    activate("t2");
    expect(handler).not.toHaveBeenCalled();
    activate("t1");
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toMatchObject({ mode: "new" });
  });

  it("wait 를 돌려주면 약속을 쥐고 다음 ready 변화 때 attempt 1 로 다시 부른다", () => {
    handler.mockReturnValueOnce("wait");
    openLegacy("user", "edit", "U2");
    render("t1", true);
    expect(handler).toHaveBeenCalledTimes(1);
    render("t1", false);
    render("t1", true);
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler.mock.calls[1][1]).toBe(1);
    render("t1", false);
    render("t1", true);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("오래된 약속은 버린다", () => {
    const now = Date.now();
    window.sessionStorage.setItem("dmes:open-with:commUserMng", JSON.stringify({ from: "commPermBench", mode: "edit", id: "U3", at: now - 61_000 }));
    render("t1", true);
    expect(handler).not.toHaveBeenCalled();
  });
});
