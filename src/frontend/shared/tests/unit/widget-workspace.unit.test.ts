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

  it("저장 중에는 (+) 가 비활성이고 눌러도 탭이 늘지 않는다", async () => {
    const store = makeStore([{ tabId: "home", name: "홈", seq: 0, locked: false, items: [it_("a"), it_("b", 6, 0)] }]);
    let release!: () => void;
    (store.saveTab as ReturnType<typeof vi.fn>).mockImplementationOnce(() => new Promise<void>((r) => (release = r)));
    await mount(store);
    click('[data-action="start-edit"]');
    click('.cm-widget[data-inst-id="a"] [data-action="remove"]');
    click('[data-action="done-edit"]');
    await flush();
    expect(btn('[data-action="add-tab"]').disabled).toBe(true);
    click('[data-action="add-tab"]');
    expect(host.querySelectorAll('[role="tab"]')).toHaveLength(1);
    await act(async () => release());
    await flush();
    expect(btn('[data-action="add-tab"]').disabled).toBe(false);
    expect(host.querySelectorAll('[role="tab"]')).toHaveLength(1);
  });

  it("저장 중에는 열려 있던 이름 입력이 확정되지 않고 탭 메뉴도 숨는다", async () => {
    const store = makeStore([{ tabId: "home", name: "홈", seq: 0, locked: false, items: [it_("a"), it_("b", 6, 0)] }]);
    let release!: () => void;
    (store.saveTab as ReturnType<typeof vi.fn>).mockImplementationOnce(() => new Promise<void>((r) => (release = r)));
    await mount(store);
    click('[data-action="add-tab"]'); // 새 탭 + 이름 입력 칸이 열린다
    const input = host.querySelector(".cm-widget-tab__name") as HTMLInputElement;
    expect(input).not.toBeNull();
    click('[data-action="done-edit"]');
    await flush();
    expect(host.querySelector("[data-tab-menu]")).toBeNull();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => {
      setter.call(input, "바뀐 이름");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    await act(async () => release());
    await flush();
    expect(tabNames()).toEqual(["홈", "새 탭"]);
    expect((store.saveTab as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({ tabId: "tab-1", name: "새 탭" });
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

  const REG2: WidgetRegistry = {
    ...REG,
    "t.b": { meta: { id: "t.b", title: "나", defaultSize: { w: 6, h: 6 } }, load: async () => ({ default: () => h("p", null, "나") }) },
  };

  it("서랍에서 눌러 추가한 위젯으로 스크롤한다(§3.4)", async () => {
    const scroll = vi.fn();
    const orig = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scroll;
    try {
      await mount(makeStore([{ tabId: "home", name: "홈", seq: 0, locked: false, items: [it_("a")] }]), { registry: REG2 });
      click('[data-action="start-edit"]');
      expect(scroll).not.toHaveBeenCalled();
      click('.cm-widget-picker [data-widget-id="t.b"]');
      await flush();
      expect(scroll).toHaveBeenCalledTimes(1);
      expect(scroll).toHaveBeenCalledWith({ block: "nearest" });
      expect((scroll.mock.contexts[0] as HTMLElement).getAttribute("data-widget-id")).toBe("t.b");
    } finally {
      HTMLElement.prototype.scrollIntoView = orig;
    }
  });

  it("저장 중에는 서랍·빼기·Escape 가 동작하지 않는다", async () => {
    const store = makeStore([{ tabId: "home", name: "홈", seq: 0, locked: false, items: [it_("a"), it_("b", 6, 0)] }]);
    let release: () => void = () => {};
    (store.saveTab as ReturnType<typeof vi.fn>).mockImplementationOnce(() => new Promise<void>((r) => { release = r; }));
    const { confirm } = await mount(store, { registry: REG2 });
    click('[data-action="start-edit"]');
    click('.cm-widget[data-inst-id="a"] [data-action="remove"]');
    click('[data-action="done-edit"]');
    await flush();
    expect(host.querySelector(".cm-widget-picker")).toBeNull();
    expect(host.querySelector('.cm-widget-board [data-action="remove"]')).toBeNull();
    act(() => document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    await flush();
    expect(confirm).not.toHaveBeenCalled();
    expect(btn('[data-action="done-edit"]')).not.toBeNull();
    release();
    await flush();
    expect(btn('[data-action="start-edit"]')).not.toBeNull();
  });

  it("기본 배치로 되돌리면 화면의 홈 탭 잠금도 풀린다(서버가 행을 지우므로)", async () => {
    const store = makeStore([{ tabId: "home", name: "홈", seq: 0, locked: true, items: [it_("a")] }]);
    await mount(store);
    expect(host.querySelector(".cm-widget-tab__lock")).not.toBeNull();
    act(() => btn('[data-tab-menu="home"]').click());
    const reset = [...document.querySelectorAll(".cm-widget-menu button")].find((b) => b.textContent?.includes("기본 배치")) as HTMLButtonElement;
    act(() => reset.click());
    await flush();
    expect(store.calls).toContain("resetHome");
    expect(host.querySelector(".cm-widget-tab__lock")).toBeNull();
  });

  it("확인 창(role=dialog) 안의 Escape 는 편집 취소를 다시 부르지 않는다", async () => {
    const store = makeStore([{ tabId: "home", name: "홈", seq: 0, locked: false, items: [it_("a"), it_("b", 6, 0)] }]);
    const { confirm } = await mount(store);
    click('[data-action="start-edit"]');
    click('.cm-widget[data-inst-id="a"] [data-action="remove"]');
    const dlg = document.createElement("div");
    dlg.setAttribute("role", "dialog");
    document.body.appendChild(dlg);
    act(() => dlg.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    await flush();
    dlg.remove();
    expect(confirm).not.toHaveBeenCalled();
  });

  /* ── 정의 목록 상태(registryStatus) — 스펙 widget-admin-generic §1.1·W-D19 ── */
  it('registryStatus="loading" 이면 [배치 편집]이 비활성이고 안내 제목을 달며 띠는 없다', async () => {
    await mount(makeStore([]), { registryStatus: "loading", testId: "ws" });
    expect(btn('[data-action="start-edit"]').disabled).toBe(true);
    expect(btn('[data-action="start-edit"]').title).toBe("위젯 목록을 불러오는 중입니다");
    expect(host.querySelector('[data-testid="ws-registry-error"]')).toBeNull();
    expect(host.textContent).not.toContain("위젯 정의를 불러오지 못했습니다");
  });

  it('registryStatus="error" 면 [배치 편집] 비활성 + 띠 + [다시 시도] 가 onRetryRegistry 를 한 번 부른다', async () => {
    const onRetryRegistry = vi.fn();
    await mount(makeStore([]), { registryStatus: "error", onRetryRegistry, testId: "ws" });
    expect(btn('[data-action="start-edit"]').disabled).toBe(true);
    expect(btn('[data-action="start-edit"]').title).toBe("위젯 정의를 불러오지 못했습니다");
    const banner = host.querySelector('[data-testid="ws-registry-error"]');
    expect(banner).not.toBeNull();
    expect(banner!.textContent).toContain("위젯 정의를 불러오지 못했습니다");
    // 띠는 탭 줄 위에 있다.
    const tabs = host.querySelector('[role="tablist"]')!;
    expect(banner!.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    click('[data-action="retry-registry"]');
    expect(onRetryRegistry).toHaveBeenCalledTimes(1);
  });

  it('registryStatus="error" 인데 onRetryRegistry 가 없으면 [다시 시도] 를 그리지 않는다', async () => {
    await mount(makeStore([]), { registryStatus: "error", testId: "ws" });
    expect(host.querySelector('[data-testid="ws-registry-error"]')).not.toBeNull();
    expect(host.querySelector('[data-action="retry-registry"]')).toBeNull();
  });

  it("registryStatus 가 ready 로 바뀌면 띠가 사라지고 [배치 편집]이 켜진다", async () => {
    const store = makeStore([]);
    const base = { registry: REG, homeDefault: HOME_DEFAULT, store, confirm: vi.fn(async () => true), notify: vi.fn(), boardWidth: 1440, testId: "ws" };
    act(() => root.render(h(WidgetWorkspace, { ...base, registryStatus: "error" })));
    await flush();
    expect(btn('[data-action="start-edit"]').disabled).toBe(true);
    act(() => root.render(h(WidgetWorkspace, { ...base, registryStatus: "ready" })));
    await flush();
    expect(host.querySelector('[data-testid="ws-registry-error"]')).toBeNull();
    expect(btn('[data-action="start-edit"]').disabled).toBe(false);
    // 상태만 바뀐 것이라 저장소를 다시 부르지 않는다.
    expect(store.calls).toEqual(["load"]);
  });

  it('편집 중 registryStatus 가 "error" 로 바뀌면 [완료]가 막힌다', async () => {
    const store = makeStore([{ tabId: "home", name: "홈", seq: 0, locked: false, items: [it_("a"), it_("b", 6, 0)] }]);
    const base = { registry: REG, homeDefault: HOME_DEFAULT, store, confirm: vi.fn(async () => true), notify: vi.fn(), boardWidth: 1440 };
    act(() => root.render(h(WidgetWorkspace, { ...base, registryStatus: "ready" })));
    await flush();
    click('[data-action="start-edit"]');
    click('.cm-widget[data-inst-id="a"] [data-action="remove"]');
    act(() => root.render(h(WidgetWorkspace, { ...base, registryStatus: "error" })));
    await flush();
    expect(btn('[data-action="done-edit"]').disabled).toBe(true);
    click('[data-action="done-edit"]');
    await flush();
    expect(store.calls).toEqual(["load"]);
  });

  it("typeTitles 를 서랍으로 넘겨 정의 위젯 아래 유형 이름을 보인다", async () => {
    const reg: WidgetRegistry = {
      ...REG,
      "def.k3x9q2ab": {
        meta: { id: "def.k3x9q2ab", title: "생산 실적표", kind: "def", typeId: "query-table", defaultSize: { w: 6, h: 6 } },
        load: async () => ({ default: () => h("p", null, "표") }),
      },
    };
    await mount(makeStore([]), { registry: reg, typeTitles: { "query-table": "쿼리 표" } });
    click('[data-action="start-edit"]');
    const type = host.querySelector('.cm-widget-picker [data-widget-id="def.k3x9q2ab"] .cm-widget-picker__type');
    expect(type!.textContent).toBe("쿼리 표");
  });

  /* ── 관리자 단일 탭(singleTab) — 스펙 §10.2 ── */
  it("singleTab 이면 탭 줄 없이 제목을 보이고 「홈」만 다룬다", async () => {
    const store = makeStore([
      { tabId: "home", name: "홈", seq: 0, locked: false, items: [it_("a")] },
      { tabId: "tab-1", name: "내 생산", seq: 1, locked: false, items: [it_("c"), it_("d", 6, 0)] },
    ]);
    await mount(store, { singleTab: { title: "전사 기본 배치" } });
    expect(host.querySelector('[role="tablist"]')).toBeNull();
    expect(host.querySelector('[data-action="add-tab"]')).toBeNull();
    expect(host.querySelector("[data-tab-menu]")).toBeNull();
    const title = host.querySelector(".cm-widget-ws__title");
    expect(title!.textContent).toBe("전사 기본 배치");
    expect(host.querySelectorAll(".cm-widget").length).toBe(1);
    expect(host.querySelector('.cm-widget[data-inst-id="a"]')).not.toBeNull();
  });

  it("singleTab 에 저장한 홈이 없으면 homeDefault 를 보인다", async () => {
    await mount(makeStore([]), { singleTab: { title: "생산팀 기본 배치" } });
    expect(host.querySelectorAll(".cm-widget").length).toBe(1);
    expect(host.querySelector('.cm-widget[data-inst-id="d1"]')).not.toBeNull();
  });

  it("singleTab 편집 → 위젯 추가 → [완료] 는 saveTab(tabId:home) 을 한 번 부른다", async () => {
    const store = makeStore([]);
    await mount(store, { singleTab: { title: "전사 기본 배치" }, registry: REG2 });
    click('[data-action="start-edit"]');
    click('.cm-widget-picker [data-widget-id="t.b"]');
    click('[data-action="done-edit"]');
    await flush();
    expect(store.saveTab).toHaveBeenCalledTimes(1);
    expect((store.saveTab as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({ tabId: "home", seq: 0 });
    expect((store.saveTab as ReturnType<typeof vi.fn>).mock.calls[0][0].items).toHaveLength(2);
    expect(btn('[data-action="start-edit"]')).not.toBeNull();
  });

  it("singleTab [취소] 는 바뀐 것을 확인 후 되돌린다", async () => {
    const store = makeStore([]);
    const { confirm } = await mount(store, { singleTab: { title: "전사 기본 배치" }, registry: REG2 });
    click('[data-action="start-edit"]');
    click('.cm-widget-picker [data-widget-id="t.b"]');
    click('[data-action="cancel-edit"]');
    await flush();
    expect(confirm).toHaveBeenCalled();
    expect(host.querySelectorAll(".cm-widget").length).toBe(1);
    expect(store.saveTab).not.toHaveBeenCalled();
  });

  it("singleTab 은 마지막 탭을 기억하지 않는다(localStorage 를 읽지도 쓰지도 않는다)", async () => {
    // happy-dom 이 localStorage 를 노출하지 않을 수 있어 스텁을 window 에 잠깐 둔다(content-body-resizable 시험 방식).
    const getItem = vi.fn((_k: string) => "tab-1");
    const setItem = vi.fn((_k: string, _v: string) => {});
    const prev = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", { value: { getItem, setItem }, configurable: true });
    const lastTabCalls = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls.filter(([k]) => String(k).startsWith("dmes:widget:lastTab"));
    const twoTabStore = () =>
      makeStore([
        { tabId: "home", name: "홈", seq: 0, locked: false, items: [it_("a")] },
        { tabId: "tab-1", name: "내 생산", seq: 1, locked: false, items: [it_("c"), it_("d", 6, 0)] },
      ]);
    try {
      // 대조: 일반 모드는 마지막 탭(tab-1)을 읽어 연다.
      await mount(twoTabStore(), { userId: "u1" });
      expect(lastTabCalls(getItem)).toHaveLength(1);
      expect(host.querySelectorAll(".cm-widget").length).toBe(2);
      act(() => root.unmount());
      root = createRoot(host);
      getItem.mockClear();
      await mount(twoTabStore(), { singleTab: { title: "전사 기본 배치" }, userId: "u1" });
      expect(lastTabCalls(getItem)).toHaveLength(0);
      expect(lastTabCalls(setItem)).toHaveLength(0);
      expect(host.querySelectorAll(".cm-widget").length).toBe(1);
    } finally {
      if (prev) Object.defineProperty(window, "localStorage", prev);
      else delete (window as unknown as { localStorage?: unknown }).localStorage;
    }
  });

  it("singleTab 객체가 렌더마다 새로 만들어져도 저장소를 다시 부르지 않고 편집이 이어진다", async () => {
    const store = makeStore([]);
    const base = { registry: REG2, homeDefault: HOME_DEFAULT, store, confirm: vi.fn(async () => true), notify: vi.fn(), boardWidth: 1440 };
    act(() => root.render(h(WidgetWorkspace, { ...base, singleTab: { title: "전사 기본 배치" } })));
    await flush();
    click('[data-action="start-edit"]');
    act(() => root.render(h(WidgetWorkspace, { ...base, singleTab: { title: "전사 기본 배치" } })));
    await flush();
    expect(store.calls).toEqual(["load"]);
    expect(btn('[data-action="done-edit"]')).not.toBeNull();
  });

  it('singleTab + registryStatus="error" 면 띠가 제목 위에 보이고 [배치 편집]이 막힌다', async () => {
    await mount(makeStore([]), { singleTab: { title: "전사 기본 배치" }, registryStatus: "error", testId: "ws", onRetryRegistry: vi.fn() });
    const banner = host.querySelector('[data-testid="ws-registry-error"]');
    const title = host.querySelector(".cm-widget-ws__title")!;
    expect(banner!.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(btn('[data-action="start-edit"]').disabled).toBe(true);
  });
});
