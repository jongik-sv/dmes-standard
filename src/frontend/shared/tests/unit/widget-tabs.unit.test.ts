/** @vitest-environment happy-dom */
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getDraggingWidget, WidgetPicker, WidgetTabs } from "../../src/widget";
import type { WidgetItem, WidgetRegistry, WidgetTab } from "../../src/widget";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const tab = (tabId: string, name: string, locked = false): WidgetTab => ({ tabId, name, seq: 0, locked, items: [] });
const TABS = [tab("home", "홈"), tab("tab-1", "내 생산", true), tab("tab-2", "품질")];

function renderTabs(extra: Record<string, unknown> = {}) {
  const handlers = {
    onSelect: vi.fn(), onAdd: vi.fn(), onRenameStart: vi.fn(), onRenameCommit: vi.fn(() => null), onRenameCancel: vi.fn(),
    onToggleLock: vi.fn(), onMove: vi.fn(), onDelete: vi.fn(), onResetHome: vi.fn(),
  };
  act(() => root.render(h(WidgetTabs, { tabs: TABS, activeTabId: "home", editing: false, renamingTabId: null, ...handlers, ...extra })));
  return handlers;
}
const menuLabels = () => [...document.querySelectorAll(".cm-widget-menu button")].map((b) => `${b.textContent?.trim()}${(b as HTMLButtonElement).disabled ? "(off)" : ""}`);
const openMenu = (tabId: string) => act(() => (host.querySelector(`[data-tab-menu="${tabId}"]`) as HTMLButtonElement).click());

describe("WidgetTabs", () => {
  it("탭 이름·잠금 표시와 선택을 그린다", () => {
    const hs = renderTabs();
    const tabs = [...host.querySelectorAll('[role="tab"]')];
    expect(tabs.map((t) => t.getAttribute("aria-selected"))).toEqual(["true", "false", "false"]);
    expect(tabs[1].querySelector(".cm-widget-tab__lock")).not.toBeNull();
    act(() => (tabs[2] as HTMLElement).click());
    expect(hs.onSelect).toHaveBeenCalledWith("tab-2");
  });

  it("「홈」 메뉴에는 잠금과 기본 배치로 되돌리기만 있다", () => {
    renderTabs();
    openMenu("home");
    expect(menuLabels()).toEqual(["탭 잠그기", "기본 배치로 되돌리기"]);
  });

  it("다른 탭 메뉴는 이름 바꾸기·잠금·옮기기·지우기, 맨 끝 탭은 오른쪽으로가 비활성", () => {
    renderTabs();
    openMenu("tab-2");
    expect(menuLabels()).toEqual(["이름 바꾸기", "탭 잠그기", "왼쪽으로", "오른쪽으로(off)", "탭 지우기"]);
  });

  it("편집 모드에서는 이름 바꾸기만 쓸 수 있다", () => {
    renderTabs({ editing: true });
    openMenu("tab-2");
    expect(menuLabels()).toEqual(["이름 바꾸기", "탭 잠그기(off)", "왼쪽으로(off)", "오른쪽으로(off)", "탭 지우기(off)"]);
  });

  it("탭 10개면 (+) 가 비활성이다", () => {
    const many = Array.from({ length: 10 }, (_, i) => tab(i === 0 ? "home" : `tab-${i}`, `t${i}`));
    renderTabs({ tabs: many });
    expect((host.querySelector('[data-action="add-tab"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it("addDisabled 면 (+) 만 막고 ⋯ 메뉴는 그대로이며 addTitle 을 title 로 쓴다", () => {
    renderTabs({ addDisabled: true, addTitle: "위젯 목록을 불러오는 중입니다" });
    const add = host.querySelector('[data-action="add-tab"]') as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    expect(add.title).toBe("위젯 목록을 불러오는 중입니다");
    expect(host.querySelector("[data-tab-menu]")).not.toBeNull();
  });

  it("이름 바꾸기 입력은 Enter 로 확정하고 오류 문구를 보이면 칸을 유지한다", () => {
    const onRenameCommit = vi.fn(() => "같은 이름의 탭이 있습니다.");
    renderTabs({ renamingTabId: "tab-2", onRenameCommit });
    const input = host.querySelector(".cm-widget-tab__name") as HTMLInputElement;
    expect(input.maxLength).toBe(20);
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "내 생산");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(onRenameCommit).toHaveBeenCalledWith("tab-2", "내 생산");
    expect(host.textContent).toContain("같은 이름의 탭이 있습니다.");
  });
});

describe("WidgetTabs 이름 입력 보강", () => {
  const key = (el: Element, k: string) => act(() => el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true })));
  const blur = (el: Element) => act(() => el.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));

  it("Escape 로 취소한 뒤 blur 가 나도 확정하지 않는다", () => {
    const hs = renderTabs({ renamingTabId: "tab-2" });
    const input = host.querySelector(".cm-widget-tab__name") as HTMLInputElement;
    key(input, "Escape");
    blur(input);
    expect(hs.onRenameCancel).toHaveBeenCalledTimes(1);
    expect(hs.onRenameCommit).not.toHaveBeenCalled();
  });

  it("Enter 로 확정에 성공한 뒤 blur 가 나도 한 번만 확정한다", () => {
    const hs = renderTabs({ renamingTabId: "tab-2" });
    const input = host.querySelector(".cm-widget-tab__name") as HTMLInputElement;
    key(input, "Enter");
    blur(input);
    expect(hs.onRenameCommit).toHaveBeenCalledTimes(1);
  });

  it("이름 입력 칸이나 ⋯ 버튼의 Enter·Space 는 탭 선택을 부르지 않는다", () => {
    const hs = renderTabs({ renamingTabId: "tab-2" });
    const input = host.querySelector(".cm-widget-tab__name") as HTMLInputElement;
    key(input, " ");
    key(input, "Enter");
    key(host.querySelector('[data-tab-menu="tab-1"]')!, "Enter");
    expect(hs.onSelect).not.toHaveBeenCalled();
    key(host.querySelector('[data-tab-id="tab-1"]')!, "Enter");
    expect(hs.onSelect).toHaveBeenCalledWith("tab-1");
  });
});

describe("WidgetPicker", () => {
  const REG: WidgetRegistry = {
    "t.a": { meta: { id: "t.a", title: "공지사항", description: "공지 목록", defaultSize: { w: 10, h: 16 } }, load: async () => ({ default: () => null }) },
    "t.one": { meta: { id: "t.one", title: "주요 지표", defaultSize: { w: 24, h: 6 }, multiple: false }, load: async () => ({ default: () => null }) },
  };
  const placed: WidgetItem[] = [{ instId: "x", widgetId: "t.one", x: 0, y: 0, w: 24, h: 6, locked: false, config: null }];

  it("이름·크기를 보이고 multiple:false 로 이미 놓인 위젯은 비활성이다", () => {
    const onAdd = vi.fn();
    act(() => root.render(h(WidgetPicker, { registry: REG, items: placed, onAdd })));
    const items = [...host.querySelectorAll(".cm-widget-picker__item")] as HTMLButtonElement[];
    expect(items.map((b) => b.querySelector(".cm-widget-picker__size")!.textContent)).toEqual(["10×16", "24×6"]);
    expect(items[1].disabled).toBe(true);
    act(() => items[0].click());
    expect(onAdd).toHaveBeenCalledWith("t.a");
  });

  it("검색어로 이름·설명을 거른다", () => {
    act(() => root.render(h(WidgetPicker, { registry: REG, items: [], onAdd: vi.fn() })));
    const input = host.querySelector(".cm-widget-picker__search") as HTMLInputElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "지표");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect([...host.querySelectorAll(".cm-widget-picker__name")].map((e) => e.firstChild?.textContent)).toEqual(["주요 지표"]);
  });

  it("끌기 시작하면 끄는 위젯 ID 를 적고 끝나면 지운다", () => {
    act(() => root.render(h(WidgetPicker, { registry: REG, items: [], onAdd: vi.fn() })));
    const item = host.querySelector(".cm-widget-picker__item") as HTMLElement;
    act(() => item.dispatchEvent(new Event("dragstart", { bubbles: true })));
    expect(getDraggingWidget()).toBe("t.a");
    act(() => item.dispatchEvent(new Event("dragend", { bubbles: true })));
    expect(getDraggingWidget()).toBeNull();
  });
});
