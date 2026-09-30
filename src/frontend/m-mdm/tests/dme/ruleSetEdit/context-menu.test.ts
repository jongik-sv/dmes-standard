/** @vitest-environment happy-dom */
// 우클릭·[+] 메뉴 모델(3단계 계획 P4·Task 0) — 제공자 잇기·같은 id 는 앞 것만, 보기 메뉴 항목, 제공자 등록 순서,
// 메뉴 레이어(ContextMenu) — 항목 누르기·Esc·항목 0개면 열지 않기·메뉴 안 키는 위(캔버스 감싸개)로 올리지 않기(F27).
import { createElement, act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import { ContextMenu } from "../../../pages/dme/ruleSetEdit/canvas/ContextMenu";
import { buildMenu, type CanvasActions, type MenuContext, type MenuProvider } from "../../../pages/dme/ruleSetEdit/canvas/context-menu";
import { MENU_PROVIDERS } from "../../../pages/dme/ruleSetEdit/canvas/menus";
import { viewMenu } from "../../../pages/dme/ruleSetEdit/canvas/menus/view-menu";
import { insertSplit, toEditFlow, type EditFlow } from "../../../pages/dme/ruleSetEdit/flow-edit";
import type { FlowMode } from "../../../pages/dme/ruleSetEdit/state/useRuleSetEdit";

function actions(): CanvasActions {
  return {
    openRule: vi.fn(), fit: vi.fn(), autoLayout: vi.fn(), addNote: vi.fn(), pickRuleFor: vi.fn(), insertSplitAt: vi.fn(),
    removeNode: vi.fn(), removeEdge: vi.fn(), addBranch: vi.fn(), editCond: vi.fn(), copy: vi.fn(), paste: vi.fn(),
    duplicate: vi.fn(), replaceRule: vi.fn(), changeSplitKind: vi.fn(), dissolveSplit: vi.fn(), toggleCollapse: vi.fn(),
    toggleBreakpoint: vi.fn(), runTo: vi.fn(),
  };
}

/** start → r1(R_A) → if1 { … } → m1 → end */
function ifFlow(): EditFlow {
  const r = insertSplit(toEditFlow(null, ["R_A"]), "e2", "IF");
  if (!r.ok) throw new Error(r.reason);
  return r.flow;
}

function ctx(mode: FlowMode, flow: EditFlow = ifFlow()): MenuContext {
  return {
    flow, rules: {}, mode, hasClipboard: false, selectedEdgeId: null, collapsed: new Set(), breakpoints: new Set(), canRun: true, act: actions(),
  };
}

describe("buildMenu", () => {
  it("제공자 순서대로 잇고, 같은 id 는 앞 것만 남긴다", () => {
    const a: MenuProvider = () => [{ id: "x", label: "A-x" }, { id: "y", label: "A-y" }];
    const b: MenuProvider = () => [{ id: "y", label: "B-y" }, { id: "z", label: "B-z" }];
    const items = buildMenu([a, b], { kind: "pane", at: { x: 0, y: 0 } }, ctx("edit"));
    expect(items.map((i) => `${i.id}:${i.label}`)).toEqual(["x:A-x", "y:A-y", "z:B-z"]);
  });

  it("제공자는 대상·문맥을 그대로 받는다", () => {
    const p = vi.fn<MenuProvider>(() => []);
    const c = ctx("view");
    const target = { kind: "edge", edgeId: "e1", via: "plus" } as const;
    buildMenu([p], target, c);
    expect(p).toHaveBeenCalledWith(target, c);
  });
});

describe("viewMenu", () => {
  for (const mode of ["view", "edit", "debug"] as const) {
    it(`${mode} 모드 — RULE 노드는 open-rule, IF 노드는 없음, 빈 곳은 fit`, () => {
      const c = ctx(mode);
      const rule = viewMenu({ kind: "node", nodeId: "r1" }, c);
      expect(rule.map((i) => i.id)).toEqual(["open-rule"]);
      expect(rule[0].label).toBe("룰 편집 열기");
      rule[0].run!();
      expect(c.act.openRule).toHaveBeenCalledWith("R_A");

      expect(viewMenu({ kind: "node", nodeId: "if1" }, c)).toEqual([]);
      expect(viewMenu({ kind: "edge", edgeId: "e1", via: "context" }, c)).toEqual([]);

      const pane = viewMenu({ kind: "pane", at: { x: 1, y: 2 } }, c);
      expect(pane.map((i) => i.id)).toEqual(["fit"]);
      expect(pane[0].label).toBe("화면 맞춤");
      pane[0].run!();
      expect(c.act.fit).toHaveBeenCalledOnce();
    });
  }
});

describe("MENU_PROVIDERS", () => {
  it("편집·접기·디버그·보기 넷이고 보기 메뉴가 끝이다", () => {
    expect(MENU_PROVIDERS).toHaveLength(4);
    expect(MENU_PROVIDERS[3]).toBe(viewMenu);
    // 빈 곳 메뉴 — 지금은 보기 메뉴의 fit 만 나온다(편집·접기·디버그 제공자는 뒤 태스크가 채운다).
    expect(buildMenu(MENU_PROVIDERS, { kind: "pane", at: { x: 0, y: 0 } }, ctx("view")).map((i) => i.id)).toContain("fit");
  });
});

describe("ContextMenu", () => {
  async function mount(items: Parameters<typeof ContextMenu>[0]["items"], onClose = vi.fn(), onParentKey = vi.fn()) {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(createElement("div", { onKeyDown: onParentKey }, createElement(ContextMenu, { items, at: { x: 10, y: 20 }, onClose })));
    });
    const done = () => {
      act(() => root.unmount());
      host.remove();
    };
    return { host, onClose, onParentKey, done };
  }
  const q = (host: Element, id: string) => host.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

  it("항목이 0개면 열지 않는다", async () => {
    const m = await mount([]);
    expect(q(m.host, "flow-menu")).toBeNull();
    m.done();
  });

  it("항목을 누르면 run 뒤 닫고, 꺼진 항목은 disabled + title, children 은 들여 쓴 버튼", async () => {
    const run = vi.fn();
    const child = vi.fn();
    const m = await mount([
      { id: "a", label: "가", run },
      { id: "b", label: "나", disabled: true, title: "안 되는 이유" },
      { id: "c", label: "묶음", children: [{ id: "c-1", label: "하위", run: child }] },
    ]);
    expect(q(m.host, "flow-menu")!.style.left).toBe("10px");
    const b = q(m.host, "flow-menu-item-b") as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(b.title).toBe("안 되는 이유");
    expect(q(m.host, "flow-menu-item-c")!.tagName).toBe("DIV");
    expect(q(m.host, "flow-menu-item-c-1")!.className).toContain("rsf-menu-item-nested");
    await act(async () => {
      q(m.host, "flow-menu-item-a")!.click();
    });
    expect(run).toHaveBeenCalledOnce();
    expect(m.onClose).toHaveBeenCalledOnce();
    m.done();
  });

  it("메뉴 단추에서 Delete 는 위 onKeyDown 으로 올라가지 않고, Esc 는 스스로 닫는다", async () => {
    const m = await mount([{ id: "a", label: "가", run: vi.fn() }]);
    const btn = q(m.host, "flow-menu-item-a")!;
    await act(async () => {
      btn.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true }));
    });
    expect(m.onParentKey).not.toHaveBeenCalled();
    expect(m.onClose).not.toHaveBeenCalled();
    await act(async () => {
      btn.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });
    expect(m.onParentKey).not.toHaveBeenCalled();
    expect(m.onClose).toHaveBeenCalled();
    m.done();
  });

  it("바깥을 누르면 닫는다", async () => {
    const m = await mount([{ id: "a", label: "가", run: vi.fn() }]);
    await act(async () => {
      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    expect(m.onClose).toHaveBeenCalled();
    m.done();
  });
});
