/** @vitest-environment happy-dom */
/**
 * 관리자 고정 탭(WidgetTab.fixed) — 위젯 고정 탭 설계 2026-10-07 §5.
 * 순수 함수(isFixedTab·orderTabs·reuseTabs·parseTabImport 한도), WidgetTabs 메뉴·풍선·한도, WidgetWorkspace(fixedHome·편집 막힘·저장 제외·한도·homeTabName).
 */
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WidgetTabs, WidgetWorkspace, countedTabCount, fixedTabCount, isFixedTab, orderTabs, parseTabImport } from "../../src/widget";
import { reuseTabs } from "../../src/widget/widget-layout";
import type { WidgetItem, WidgetRegistry, WidgetStore, WidgetTab } from "../../src/widget";

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
  vi.restoreAllMocks();
});

const tab = (tabId: string, name: string, extra: Partial<WidgetTab> = {}): WidgetTab => ({ tabId, name, seq: 0, locked: false, items: [], ...extra });
const fixed = (tabId: string, name: string, seq: number, extra: Partial<WidgetTab> = {}) => tab(tabId, name, { seq, fixed: true, ...extra });

describe("고정 탭 순수 함수", () => {
  it("isFixedTab 은 fixed 도 고정으로 본다", () => {
    expect(isFixedTab(fixed("dept-A", "A", 200))).toBe(true);
    expect(isFixedTab(tab("tab-1", "내 탭"))).toBe(false);
    expect(isFixedTab(tab("home", "홈"))).toBe(true);
  });

  it("orderTabs — 홈 다음 fixed 는 기본 탭과 같은 순위로 seq 순, 개인 탭이 그 뒤", () => {
    const out = orderTabs([tab("tab-1", "내", { seq: 1 }), fixed("dept-A", "부서", 200), tab("def-2", "기본", { seq: 101, defaultTab: true }), fixed("def-1", "전사", 100), tab("home", "홈")]);
    expect(out.map((t) => t.tabId)).toEqual(["home", "def-1", "def-2", "dept-A", "tab-1"]);
    expect(fixedTabCount(out)).toBe(4);
  });

  it("countedTabCount — fixed 를 뺀 수, fixed 가 없으면 tabs.length", () => {
    expect(countedTabCount([tab("home", "홈"), tab("tab-1", "내")])).toBe(2);
    expect(countedTabCount([fixed("home", "홈", 0), fixed("def-1", "전사", 100), tab("tab-1", "내")])).toBe(1);
  });

  it("reuseTabs — fixed·origin 이 바뀌면 옛 객체를 재사용하지 않는다", () => {
    const prev = [fixed("def-1", "전사", 100, { origin: "전사 기본 탭" })];
    expect(reuseTabs(prev, [{ ...prev[0] }])).toBe(prev);
    const changedOrigin = reuseTabs(prev, [{ ...prev[0], origin: "정보기술팀 부서 탭" }]);
    expect(changedOrigin[0]).not.toBe(prev[0]);
    const unfixed = reuseTabs(prev, [{ ...prev[0], fixed: false }]);
    expect(unfixed[0]).not.toBe(prev[0]);
  });

  it("parseTabImport — 한도는 fixed 탭을 뺀 수로 센다", () => {
    const file = JSON.stringify({ version: 1, kind: "dmes-widget-tab", name: "가져옴", items: [] });
    const personal = Array.from({ length: 9 }, (_, i) => tab(`tab-${i + 1}`, `개인${i + 1}`));
    const lots = [fixed("home", "홈", 0), fixed("def-1", "전사", 100), fixed("dept-A", "부서", 200), ...personal];
    expect(lots.length).toBeGreaterThan(10);
    expect(parseTabImport(file, { registry: {}, tabs: lots }).ok).toBe(true);
    const full = [...lots, tab("tab-10", "개인10")];
    const res = parseTabImport(file, { registry: {}, tabs: full });
    expect(res.ok).toBe(false);
  });
});

describe("WidgetTabs — 고정 탭", () => {
  const FIXED_TABS = [
    fixed("home", "홈", 0),
    fixed("def-1", "생산 현황", 100, { origin: "전사 기본 탭" }),
    fixed("dept-A", "정보기술팀", 200, { origin: "정보기술팀 부서 탭" }),
    tab("tab-1", "내 탭"),
  ];

  function renderTabs(extra: Record<string, unknown> = {}) {
    const handlers = {
      onSelect: vi.fn(), onAdd: vi.fn(), onRenameStart: vi.fn(), onRenameCommit: vi.fn(() => null), onRenameCancel: vi.fn(),
      onToggleLock: vi.fn(), onMove: vi.fn(), onDelete: vi.fn(), onResetHome: vi.fn(),
    };
    act(() => root.render(h(WidgetTabs, { tabs: FIXED_TABS, activeTabId: "home", editing: false, renamingTabId: null, ...handlers, ...extra })));
    return handlers;
  }
  const openMenu = (tabId: string) => act(() => (host.querySelector(`[data-tab-menu="${tabId}"]`) as HTMLButtonElement).click());
  const menuLabels = () => [...document.querySelectorAll(".cm-widget-menu button")].map((b) => `${b.textContent?.trim()}${(b as HTMLButtonElement).disabled ? "(off)" : ""}`);

  it("고정 탭 메뉴는 공유·내보내기만 — 홈·부서 탭 모두 잠그기·되돌리기·이름 바꾸기·옮기기·지우기가 없다", () => {
    renderTabs({ onShare: vi.fn(), onExport: vi.fn(), onResetTab: vi.fn() });
    for (const id of ["home", "def-1", "dept-A"]) {
      openMenu(id);
      expect(menuLabels()).toEqual(["공유…", "내보내기"]);
      openMenu(id); // 닫기
    }
  });

  it("공유·내보내기 핸들러가 없으면 고정 탭에 ⋯ 가 없다", () => {
    renderTabs();
    expect(host.querySelector('[data-tab-menu="def-1"]')).toBeNull();
    expect(host.querySelector('[data-tab-menu="tab-1"]')).not.toBeNull();
  });

  it("탭 풍선에 「관리자가 정한 탭입니다」와 출처를 보이고 표시 속성을 단다", () => {
    renderTabs();
    const def = host.querySelector('[data-tab-id="def-1"]') as HTMLElement;
    expect(def.hasAttribute("data-fixed-tab")).toBe(true);
    expect(def.title).toContain("관리자가 정한 탭입니다(바꿀 수 없습니다)");
    expect(def.title).toContain("전사 기본 탭");
    expect((host.querySelector('[data-tab-id="home"]') as HTMLElement).title).toBe("관리자가 정한 탭입니다(바꿀 수 없습니다)");
    expect((host.querySelector('[data-tab-id="tab-1"]') as HTMLElement).title).toBe("");
  });

  it("(+) 한도는 고정 탭을 뺀 수로 센다", () => {
    const add = () => host.querySelector('[data-action="add-tab"]') as HTMLButtonElement;
    renderTabs({ maxTabs: 2 });
    expect(add().disabled).toBe(false); // 개인 탭 1개 < 2
    renderTabs({ maxTabs: 1 });
    expect(add().disabled).toBe(true);
    renderTabs({ maxTabs: 4, onImport: vi.fn() });
    expect(add().disabled).toBe(false); // 전체 4개지만 개인 탭은 1개
    expect((host.querySelector('[data-action="import-tab"]') as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("WidgetWorkspace — 고정 탭", () => {
  const load = async () => ({ default: () => h("p", null, "위젯") });
  const REG: WidgetRegistry = { "t.a": { meta: { id: "t.a", title: "가", defaultSize: { w: 6, h: 6 } }, load } };
  const it_ = (instId: string, x = 0, y = 0): WidgetItem => ({ instId, widgetId: "t.a", x, y, w: 6, h: 6, locked: false, config: null });
  const HOME_DEFAULT = [it_("d1")];

  type Store = WidgetStore & { calls: string[] };
  function makeStore(tabs: WidgetTab[]): Store {
    const calls: string[] = [];
    return {
      calls,
      load: vi.fn(async () => {
        calls.push("load");
        return tabs;
      }),
      saveTab: vi.fn(async (t: WidgetTab) => {
        calls.push(`saveTab:${t.tabId}`);
      }),
      deleteTab: vi.fn(async () => {}),
      reorderTabs: vi.fn(async () => {}),
      resetHome: vi.fn(async () => {
        calls.push("resetHome");
      }),
      shareTab: vi.fn(async () => []),
      searchUsers: vi.fn(async () => []),
    };
  }
  async function flush() {
    await act(async () => {
      for (let i = 0; i < 5; i += 1) await new Promise((r) => setTimeout(r, 0));
    });
  }
  const $ = (sel: string) => document.querySelector(sel) as HTMLButtonElement | null;
  const click = (sel: string) => act(() => $(sel)!.click());
  const tabIds = () => [...document.querySelectorAll('[role="tab"]')].map((e) => e.getAttribute("data-tab-id"));
  const menuLabels = () => [...document.querySelectorAll(".cm-widget-menu button")].map((b) => `${b.textContent?.trim()}${(b as HTMLButtonElement).disabled ? "(off)" : ""}`);
  const tabText = (id: string) => document.querySelector(`[data-tab-id="${id}"]`)?.textContent ?? "";
  const itemIds = () => [...document.querySelectorAll(".cm-widget[data-inst-id]")].map((e) => e.getAttribute("data-inst-id"));

  async function mount(store: WidgetStore, extra: Record<string, unknown> = {}) {
    const confirm = vi.fn(async () => true);
    const notify = vi.fn();
    act(() => root.render(h(WidgetWorkspace, { registry: REG, homeDefault: HOME_DEFAULT, store, confirm, notify, boardWidth: 1440, ...extra })));
    await flush();
    return { confirm, notify };
  }

  /** 서버 응답 — 새 계약: home 은 없고 고정 탭은 fixed(def-N·dept-*), 개인 탭은 tab-N. */
  const serverTabs = (): WidgetTab[] => [
    { tabId: "tab-1", name: "내 탭", seq: 1, locked: false, items: [it_("u1")] },
    fixed("dept-A", "정보기술팀", 200, { items: [it_("a1")], origin: "정보기술팀 부서 탭" }),
    fixed("def-1", "생산 현황", 100, { items: [it_("p1")], origin: "전사 기본 탭" }),
  ];

  it("fixedHome 이면 서버가 home 을 줘도 무시하고 homeDefault 로 그리며 홈은 고정이다", async () => {
    const tabs = [...serverTabs(), tab("home", "홈", { items: [it_("srv-home")] })];
    await mount(makeStore(tabs), { fixedHome: true });
    expect(tabIds()).toEqual(["home", "def-1", "dept-A", "tab-1"]);
    expect(itemIds()).toEqual(["d1"]);
    expect((document.querySelector('[data-tab-id="home"]') as HTMLElement).hasAttribute("data-fixed-tab")).toBe(true);
  });

  it("fixedHome 이 아니면(기본) 서버 home 이 있으면 그것을 그린다 — 지금과 같다", async () => {
    await mount(makeStore([tab("home", "홈", { items: [it_("srv-home")] })]));
    expect(itemIds()).toEqual(["srv-home"]);
    expect((document.querySelector('[data-tab-id="home"]') as HTMLElement).hasAttribute("data-fixed-tab")).toBe(false);
  });

  it("fixedHome 은 registry·homeDefault 가 바뀌면 다시 그린다", async () => {
    const store = makeStore(serverTabs());
    await mount(store, { fixedHome: true });
    expect(itemIds()).toEqual(["d1"]);
    await mount(store, { fixedHome: true, homeDefault: [it_("d2")] });
    expect(itemIds()).toEqual(["d2"]);
    expect(store.calls.filter((c) => c === "load")).toHaveLength(1);
  });

  it("homeTabName 이 홈 탭 표시 이름이 되고 바뀌면 이름만 바뀐다", async () => {
    const store = makeStore([]);
    await mount(store, { homeTabName: "정보기술팀" });
    expect(tabText("home")).toContain("정보기술팀");
    await mount(store, { homeTabName: "품질팀" });
    expect(tabText("home")).toContain("품질팀");
    expect(store.calls.filter((c) => c === "load")).toHaveLength(1);
    await mount(store);
    expect(tabText("home")).toContain("홈");
  });

  it("고정 탭이 활성이면 [배치 편집]이 막히고 사유를 보인다", async () => {
    await mount(makeStore(serverTabs()), { fixedHome: true });
    for (const id of ["home", "def-1", "dept-A"]) {
      click(`[data-tab-id="${id}"]`);
      const btn = $('[data-action="start-edit"]')!;
      expect(btn.disabled).toBe(true);
      expect(btn.title).toBe("관리자가 정한 탭입니다. 내 탭에서 편집하세요.");
    }
    click('[data-tab-id="tab-1"]');
    expect($('[data-action="start-edit"]')!.disabled).toBe(false);
  });

  it("빈 고정 탭은 [배치 편집] 안내 대신 관리자 안내를 보이고, 고정 「홈」 풍선에 출처(전사 기본 배치)가 나온다", async () => {
    await mount(makeStore([...serverTabs(), fixed("def-2", "빈 탭", 101, { items: [] })]), { fixedHome: true });
    click('[data-tab-id="def-2"]');
    expect($(".cm-widget-board__empty")!.textContent).toBe("관리자가 아직 위젯을 놓지 않은 탭입니다.");
    expect((document.querySelector('[data-tab-id="home"]') as HTMLElement).title).toContain("전사 기본 배치");
    // 새 prop 을 쓰지 않는 기존 사용처는 예전 안내 그대로.
    act(() => root.render(h(WidgetWorkspace, { registry: REG, homeDefault: [], store: makeStore([]), boardWidth: 1440 })));
    await flush();
    expect($(".cm-widget-board__empty")!.textContent).toBe("놓인 위젯이 없습니다. [배치 편집]에서 위젯을 추가하세요.");
  });

  it("편집 중 고정 탭으로 옮기면 서랍이 닫히고, [완료]는 고정 탭을 saveTab 하지 않는다", async () => {
    const store = makeStore(serverTabs());
    await mount(store, { fixedHome: true });
    click('[data-tab-id="tab-1"]');
    click('[data-action="start-edit"]');
    expect($(".cm-widget-picker")).not.toBeNull();
    click('[data-tab-id="def-1"]');
    expect($(".cm-widget-picker")).toBeNull();
    click('[data-tab-id="tab-1"]');
    click('.cm-widget[data-inst-id="u1"] [data-action="remove"]');
    click('[data-action="done-edit"]');
    await flush();
    expect(store.calls).toEqual(["load", "saveTab:tab-1"]);
  });

  it("고정 탭 메뉴는 공유·내보내기만이다(홈 되돌리기 없음)", async () => {
    await mount(makeStore(serverTabs()), { fixedHome: true });
    for (const id of ["home", "def-1", "dept-A"]) {
      click(`[data-tab-menu="${id}"]`);
      expect(menuLabels()).toEqual(["공유…", "내보내기"]);
      click(`[data-tab-menu="${id}"]`);
    }
  });

  it("(+)·가져오기 한도는 고정 탭을 뺀 수 — 전체 탭이 10개를 넘어도 개인 탭(9개)이 10개 미만이면 켜진다", async () => {
    const personal = Array.from({ length: 8 }, (_, i) => tab(`tab-${i + 2}`, `개인${i + 2}`, { seq: i + 2 }));
    await mount(makeStore([...serverTabs(), ...personal]), { fixedHome: true });
    expect(tabIds()).toHaveLength(12);
    expect($('[data-action="add-tab"]')!.disabled).toBe(false);
    expect($('[data-action="import-tab"]')!.disabled).toBe(false);
  });

  it("개인 탭이 10개(tab-1 포함)면 (+)가 꺼진다", async () => {
    const personal = Array.from({ length: 9 }, (_, i) => tab(`tab-${i + 2}`, `개인${i + 2}`, { seq: i + 2 }));
    await mount(makeStore([...serverTabs(), ...personal]), { fixedHome: true });
    expect($('[data-action="add-tab"]')!.disabled).toBe(true);
  });
});
