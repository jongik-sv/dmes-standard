/** @vitest-environment happy-dom */
/**
 * WidgetTabs — 기본 탭(고정 탭)·공유·내보내기·가져오기 메뉴와 admin 모드(widget-tabs 2026-10-05, 설계 design-widget-tabs §4).
 */
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WidgetTabs } from "../../src/widget";
import type { WidgetTab } from "../../src/widget";

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

const tab = (tabId: string, name: string, extra: Partial<WidgetTab> = {}): WidgetTab => ({ tabId, name, seq: 0, locked: false, items: [], ...extra });
const TABS = [tab("home", "홈"), tab("def-1", "생산 현황", { defaultTab: true }), tab("tab-1", "내 탭"), tab("tab-2", "품질")];

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
const menuItem = (label: string) => [...document.querySelectorAll(".cm-widget-menu button")].find((b) => b.textContent?.trim() === label) as HTMLButtonElement;

describe("WidgetTabs — 기본 탭", () => {
  it("기본 탭 메뉴는 잠그기와 기본으로 되돌리기만 — 이름 바꾸기·옮기기·지우기가 없고, 되돌리기는 개인화 전에는 꺼져 있다", () => {
    renderTabs({ onResetTab: vi.fn() });
    openMenu("def-1");
    expect(menuLabels()).toEqual(["탭 잠그기", "기본으로 되돌리기(off)"]);
  });

  it("개인화한 기본 탭은 되돌리기가 켜지고 누르면 onResetTab 을 부른다", () => {
    const onResetTab = vi.fn();
    renderTabs({ onResetTab, tabs: [TABS[0], { ...TABS[1], customized: true }, TABS[2]] });
    openMenu("def-1");
    act(() => menuItem("기본으로 되돌리기").click());
    expect(onResetTab).toHaveBeenCalledWith("def-1");
  });

  it("onResetTab 이 없으면 기본 탭 메뉴는 잠그기만", () => {
    renderTabs();
    openMenu("def-1");
    expect(menuLabels()).toEqual(["탭 잠그기"]);
  });

  it("기본 탭 바로 뒤 일반 탭은 왼쪽으로가 꺼져 있다(고정 탭 앞으로 못 간다)", () => {
    renderTabs();
    openMenu("tab-1");
    expect(menuLabels()).toEqual(["이름 바꾸기", "탭 잠그기", "왼쪽으로(off)", "오른쪽으로", "탭 지우기"]);
  });

  it("기본 탭에 표시 속성과 안내 title 을 단다", () => {
    renderTabs();
    const def = host.querySelector('[data-tab-id="def-1"]') as HTMLElement;
    expect(def.hasAttribute("data-default-tab")).toBe(true);
    expect(def.title).toContain("기본 탭");
    expect(host.querySelector('[data-tab-id="tab-1"]')!.hasAttribute("data-default-tab")).toBe(false);
  });
});

describe("WidgetTabs — 공유·내보내기", () => {
  it("핸들러가 있으면 홈·기본 탭·일반 탭 모두에 공유…·내보내기가 붙는다", () => {
    const onShare = vi.fn();
    const onExport = vi.fn();
    renderTabs({ onShare, onExport, onResetTab: vi.fn() });
    openMenu("home");
    expect(menuLabels()).toEqual(["탭 잠그기", "기본 배치로 되돌리기", "공유…", "내보내기"]);
    openMenu("home"); // 닫기
    openMenu("def-1");
    expect(menuLabels()).toEqual(["탭 잠그기", "기본으로 되돌리기(off)", "공유…", "내보내기"]);
    act(() => menuItem("공유…").click());
    expect(onShare).toHaveBeenCalledWith("def-1");
    openMenu("tab-2");
    expect(menuLabels()).toEqual(["이름 바꾸기", "탭 잠그기", "왼쪽으로", "오른쪽으로(off)", "공유…", "내보내기", "탭 지우기"]);
    act(() => menuItem("내보내기").click());
    expect(onExport).toHaveBeenCalledWith("tab-2");
  });

  it("편집 모드에서는 공유·내보내기가 꺼진다", () => {
    renderTabs({ onShare: vi.fn(), onExport: vi.fn(), editing: true });
    openMenu("tab-2");
    expect(menuLabels()).toEqual(["이름 바꾸기", "탭 잠그기(off)", "왼쪽으로(off)", "오른쪽으로(off)", "공유…(off)", "내보내기(off)", "탭 지우기(off)"]);
  });
});

describe("WidgetTabs — 가져오기", () => {
  const importBtn = () => host.querySelector('[data-action="import-tab"]') as HTMLButtonElement | null;

  it("onImport 가 없으면 단추가 없다", () => {
    renderTabs();
    expect(importBtn()).toBeNull();
  });

  it("(+) 옆에 그리고 인쇄에서 숨기며, 고른 파일을 onImport 로 넘긴다", () => {
    const onImport = vi.fn();
    renderTabs({ onImport });
    expect(importBtn()!.hasAttribute("data-print-hide")).toBe(true);
    expect(importBtn()!.previousElementSibling?.getAttribute("data-action")).toBe("add-tab");
    const input = host.querySelector('[data-action="import-file"]') as HTMLInputElement;
    expect(input.hasAttribute("data-print-hide")).toBe(true);
    const file = new File(["{}"], "tab.json", { type: "application/json" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    act(() => input.dispatchEvent(new Event("change", { bubbles: true })));
    expect(onImport).toHaveBeenCalledWith(file);
  });

  it("importDisabled·탭 한도면 꺼진다", () => {
    renderTabs({ onImport: vi.fn(), importDisabled: true });
    expect(importBtn()!.disabled).toBe(true);
    renderTabs({ onImport: vi.fn(), maxTabs: 4 });
    expect(importBtn()!.disabled).toBe(true);
    expect((host.querySelector('[data-action="add-tab"]') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("WidgetTabs — admin 모드", () => {
  const ADMIN_TABS = [tab("home", "홈"), tab("def-1", "생산 현황"), tab("tab-1", "새 탭")];

  it("「홈」에는 ⋯ 가 없고, 다른 탭 메뉴에는 잠그기·공유·내보내기가 없다", () => {
    renderTabs({ mode: "admin", tabs: ADMIN_TABS, onShare: vi.fn(), onExport: vi.fn() });
    expect(host.querySelector('[data-tab-menu="home"]')).toBeNull();
    openMenu("def-1");
    expect(menuLabels()).toEqual(["이름 바꾸기", "왼쪽으로(off)", "오른쪽으로", "탭 지우기"]);
  });

  it("maxTabs 에 닿으면 (+) 가 꺼지고 title 에 한도를 적는다", () => {
    renderTabs({ mode: "admin", tabs: ADMIN_TABS, maxTabs: 3 });
    const add = host.querySelector('[data-action="add-tab"]') as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    expect(add.title).toBe("새 탭 (최대 3개)");
  });
});
