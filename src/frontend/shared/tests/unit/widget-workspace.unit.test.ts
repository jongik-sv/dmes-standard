/** @vitest-environment happy-dom */
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WidgetWorkspace } from "../../src/widget";
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
});

const REG: WidgetRegistry = {
  "t.a": { meta: { id: "t.a", title: "가", defaultSize: { w: 6, h: 6 } }, load: async () => ({ default: () => h("p", null, "가") }) },
};
const it_ = (instId: string, x = 0, y = 0): WidgetItem => ({ instId, widgetId: "t.a", x, y, w: 6, h: 6, locked: false, config: null });
const HOME_DEFAULT = [it_("d1")];

function makeStore(tabs: WidgetTab[] | Error = []): WidgetStore & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    load: vi.fn(async () => {
      calls.push("load");
      if (tabs instanceof Error) throw tabs;
      return tabs;
    }),
    saveTab: vi.fn(async (t: WidgetTab) => {
      calls.push(`saveTab:${t.tabId}:${t.name}:${t.items.length}`);
    }),
    deleteTab: vi.fn(async (id: string) => {
      calls.push(`deleteTab:${id}`);
    }),
    reorderTabs: vi.fn(async (ids: string[]) => {
      calls.push(`reorder:${ids.join(",")}`);
    }),
    resetHome: vi.fn(async () => {
      calls.push("resetHome");
    }),
  };
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });
}
const btn = (sel: string) => host.querySelector(sel) as HTMLButtonElement;
const click = (sel: string) => act(() => btn(sel).click());

async function mount(store: WidgetStore, extra: Record<string, unknown> = {}) {
  const confirm = vi.fn(async () => true);
  const notify = vi.fn();
  act(() =>
    root.render(h(WidgetWorkspace, { registry: REG, homeDefault: HOME_DEFAULT, store, confirm, notify, boardWidth: 1440, ...extra }))
  );
  await flush();
  return { confirm, notify };
}
const tabNames = () => [...host.querySelectorAll('[role="tab"] > span:first-child')].map((e) => e.textContent);

describe("WidgetWorkspace", () => {
  it("저장한 홈이 없으면 기본 배치로 「홈」 탭을 보인다", async () => {
    await mount(makeStore([]));
    expect(tabNames()).toEqual(["홈"]);
    expect(host.querySelectorAll(".cm-widget").length).toBe(1);
  });

  it("불러오기 실패면 안내 띠를 보이고 [배치 편집]을 막는다", async () => {
    await mount(makeStore(new Error("network")));
    expect(host.textContent).toContain("저장한 위젯 화면을 불러오지 못했습니다");
    expect(btn('[data-action="start-edit"]').disabled).toBe(true);
  });

  it("좁은 폭이면 [배치 편집]이 비활성이고 안내 제목을 단다", async () => {
    await mount(makeStore([]), { boardWidth: 900 });
    expect(btn('[data-action="start-edit"]').disabled).toBe(true);
    expect(btn('[data-action="start-edit"]').title).toBe("넓은 화면에서 편집할 수 있습니다");
  });

  it("서랍이 보드 폭을 줄여도 칸 수·손잡이·서랍이 유지된다(D1)", async () => {
    // 바깥 폭 1100(24칸), 보드 폭 820(서랍이 연 상태를 흉내)
    const store = makeStore([{ tabId: "home", name: "홈", seq: 0, locked: false, items: [it_("a"), it_("b", 6, 0)] }]);
    const props = { registry: REG, homeDefault: HOME_DEFAULT, store, confirm: vi.fn(async () => true), notify: vi.fn(), workspaceWidth: 1100, boardWidth: 820 };
    act(() => root.render(h(WidgetWorkspace, props)));
    await flush();
    click('[data-action="start-edit"]');
    for (let n = 0; n < 4; n += 1) {
      act(() => root.render(h(WidgetWorkspace, { ...props })));
      await flush();
      expect(host.querySelector(".cm-widget-board")!.getAttribute("data-cols")).toBe("24");
      expect(host.querySelector(".react-resizable-handle")).not.toBeNull();
      expect(host.querySelector(".cm-widget-picker")).not.toBeNull();
    }
  });

  it("편집 중 바깥 폭이 문턱 밑으로 가면 서랍이 사라지고 [완료]·[취소]는 동작한다", async () => {
    const store = makeStore([]);
    const props = { registry: REG, homeDefault: HOME_DEFAULT, store, confirm: vi.fn(async () => true), notify: vi.fn(), workspaceWidth: 1100, boardWidth: 820 };
    act(() => root.render(h(WidgetWorkspace, props)));
    await flush();
    click('[data-action="start-edit"]');
    act(() => root.render(h(WidgetWorkspace, { ...props, workspaceWidth: 900 })));
    await flush();
    expect(host.querySelector(".cm-widget-picker")).toBeNull();
    expect(host.querySelector(".react-resizable-handle")).toBeNull();
    expect(btn('[data-action="done-edit"]')).not.toBeNull();
    expect(btn('[data-action="cancel-edit"]').disabled).toBe(false);
  });

  it("편집 → 위젯 빼기 → [완료] 는 바뀐 탭만 저장한다", async () => {
    const store = makeStore([{ tabId: "home", name: "홈", seq: 0, locked: false, items: [it_("a"), it_("b", 6, 0)] }]);
    await mount(store);
    click('[data-action="start-edit"]');
    click('.cm-widget[data-inst-id="a"] [data-action="remove"]');
    click('[data-action="done-edit"]');
    await flush();
    expect(store.calls).toEqual(["load", "saveTab:home:홈:1"]);
    expect(btn('[data-action="start-edit"]')).not.toBeNull();
  });

  it("[완료] 저장이 실패하면 편집 모드와 변경을 유지하고 알린다", async () => {
    const store = makeStore([{ tabId: "home", name: "홈", seq: 0, locked: false, items: [it_("a"), it_("b", 6, 0)] }]);
    (store.saveTab as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("탭 이름이 중복입니다."));
    const { notify } = await mount(store);
    click('[data-action="start-edit"]');
    click('.cm-widget[data-inst-id="a"] [data-action="remove"]');
    click('[data-action="done-edit"]');
    await flush();
    expect(notify).toHaveBeenCalledWith("탭 이름이 중복입니다.", "error");
    expect(btn('[data-action="done-edit"]')).not.toBeNull();
    expect(host.querySelectorAll(".cm-widget").length).toBe(1);
  });

  it("[취소] 는 바뀐 것이 있으면 확인 후 되돌린다", async () => {
    const store = makeStore([{ tabId: "home", name: "홈", seq: 0, locked: false, items: [it_("a"), it_("b", 6, 0)] }]);
    const { confirm } = await mount(store);
    click('[data-action="start-edit"]');
    click('.cm-widget[data-inst-id="a"] [data-action="remove"]');
    click('[data-action="cancel-edit"]');
    await flush();
    expect(confirm).toHaveBeenCalledWith("변경 내용을 버릴까요?", expect.any(String));
    expect(host.querySelectorAll(".cm-widget").length).toBe(2);
    expect(store.calls).toEqual(["load"]);
  });

  it("(+) 새 탭은 편집 모드로 들어가고 [취소]하면 사라진다", async () => {
    await mount(makeStore([]));
    click('[data-action="add-tab"]');
    expect(tabNames()).toHaveLength(1); // 새 탭은 이름 입력 칸이라 span 이 아니다
    expect(host.querySelector(".cm-widget-tab__name")).not.toBeNull();
    expect(btn('[data-action="done-edit"]')).not.toBeNull();
    act(() => (host.querySelector(".cm-widget-tab__name") as HTMLInputElement).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    click('[data-action="cancel-edit"]');
    await flush();
    expect(tabNames()).toEqual(["홈"]);
  });

  it("보기 모드 탭 지우기는 확인 후 바로 저장소에 지운다", async () => {
    const store = makeStore([
      { tabId: "home", name: "홈", seq: 0, locked: false, items: [] },
      { tabId: "tab-1", name: "내 생산", seq: 1, locked: false, items: [] },
    ]);
    const { confirm } = await mount(store);
    act(() => btn('[data-tab-menu="tab-1"]').click());
    const del = [...document.querySelectorAll(".cm-widget-menu button")].find((b) => b.textContent?.includes("탭 지우기")) as HTMLButtonElement;
    act(() => del.click());
    await flush();
    expect(confirm).toHaveBeenCalled();
    expect(store.calls).toContain("deleteTab:tab-1");
    expect(tabNames()).toEqual(["홈"]);
  });

  it("보기 모드 탭 잠금 저장이 실패하면 원래대로 되돌린다", async () => {
    const store = makeStore([
      { tabId: "home", name: "홈", seq: 0, locked: false, items: [] },
      { tabId: "tab-1", name: "내 생산", seq: 1, locked: false, items: [] },
    ]);
    (store.saveTab as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("저장 실패"));
    const { notify } = await mount(store);
    act(() => btn('[data-tab-menu="tab-1"]').click());
    const lock = [...document.querySelectorAll(".cm-widget-menu button")].find((b) => b.textContent?.includes("탭 잠그기")) as HTMLButtonElement;
    act(() => lock.click());
    await flush();
    expect(notify).toHaveBeenCalledWith("저장 실패", "error");
    expect(host.querySelector('[data-tab-id="tab-1"] .cm-widget-tab__lock')).toBeNull();
  });

  it("편집 중 Escape 는 편집을 취소한다(바뀐 것이 없으면 확인 없이)", async () => {
    const { confirm } = await mount(makeStore([]));
    click('[data-action="start-edit"]');
    act(() => document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    await flush();
    expect(confirm).not.toHaveBeenCalled();
    expect(btn('[data-action="start-edit"]')).not.toBeNull();
  });

  it("잠긴 탭은 [배치 편집]이 비활성이다", async () => {
    await mount(makeStore([{ tabId: "home", name: "홈", seq: 0, locked: true, items: [] }]));
    expect(btn('[data-action="start-edit"]').disabled).toBe(true);
  });

  it("「기본 배치로 되돌리기」는 확인 후 resetHome 을 부르고 기본 배치를 보인다", async () => {
    const store = makeStore([{ tabId: "home", name: "홈", seq: 0, locked: false, items: [it_("a"), it_("b", 6, 0), it_("c", 12, 0)] }]);
    await mount(store);
    act(() => btn('[data-tab-menu="home"]').click());
    const reset = [...document.querySelectorAll(".cm-widget-menu button")].find((b) => b.textContent?.includes("기본 배치")) as HTMLButtonElement;
    act(() => reset.click());
    await flush();
    expect(store.calls).toContain("resetHome");
    expect(host.querySelectorAll(".cm-widget").length).toBe(1);
  });
  it("편집 중 store 가 바뀌어 다시 불러오다 실패하면 편집이 끝나고 저장이 막힌다", async () => {
    const store = makeStore([{ tabId: "home", name: "홈", seq: 0, locked: false, items: [it_("a"), it_("b", 6, 0)] }]);
    const { confirm, notify } = await mount(store);
    click('[data-action="start-edit"]');
    click('.cm-widget[data-inst-id="a"] [data-action="remove"]');
    const broken = makeStore(new Error("network"));
    act(() => root.render(h(WidgetWorkspace, { registry: REG, homeDefault: HOME_DEFAULT, store: broken, confirm, notify, boardWidth: 1440 })));
    await flush();
    expect(btn('[data-action="done-edit"]')).toBeNull();
    expect(btn('[data-action="start-edit"]').disabled).toBe(true);
    expect(store.calls).toEqual(["load"]);
    expect(broken.calls).toEqual(["load"]);
  });

  const twoTabs = (): WidgetTab[] => [
    { tabId: "home", name: "홈", seq: 0, locked: false, items: [it_("a"), it_("b", 6, 0)] },
    { tabId: "tab-1", name: "내 생산", seq: 1, locked: false, items: [it_("c"), it_("d", 6, 0)] },
  ];
  async function editBothTabs(store: WidgetStore & { calls: string[] }) {
    const m = await mount(store);
    click('[data-action="start-edit"]');
    click('.cm-widget[data-inst-id="a"] [data-action="remove"]');
    click('[data-tab-id="tab-1"]');
    click('.cm-widget[data-inst-id="c"] [data-action="remove"]');
    return m;
  }

  it("둘째 탭 저장이 실패한 뒤 [취소] 는 저장 안 된 탭만 되돌린다", async () => {
    const store = makeStore(twoTabs());
    (store.saveTab as ReturnType<typeof vi.fn>).mockImplementationOnce(async (t: WidgetTab) => {
      store.calls.push(`saveTab:${t.tabId}`);
    });
    (store.saveTab as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("저장 실패"));
    await editBothTabs(store);
    click('[data-action="done-edit"]');
    await flush();
    click('[data-action="cancel-edit"]');
    await flush();
    expect(host.querySelectorAll(".cm-widget").length).toBe(2); // tab-1 은 편집 전으로
    click('[data-tab-id="home"]');
    expect(host.querySelectorAll(".cm-widget").length).toBe(1); // home 은 저장된 배치로 남는다
  });

  it("저장 실패 뒤 다시 [완료] 하면 실패했던 탭에만 saveTab 을 부른다", async () => {
    const store = makeStore(twoTabs());
    (store.saveTab as ReturnType<typeof vi.fn>).mockImplementationOnce(async (t: WidgetTab) => {
      store.calls.push(`saveTab:${t.tabId}`);
    });
    (store.saveTab as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("저장 실패"));
    await editBothTabs(store);
    click('[data-action="done-edit"]');
    await flush();
    click('[data-action="done-edit"]');
    await flush();
    expect(store.calls).toEqual(["load", "saveTab:home", "saveTab:tab-1:내 생산:1"]);
    expect(btn('[data-action="start-edit"]')).not.toBeNull();
  });
});
