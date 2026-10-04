/** @vitest-environment happy-dom */
/**
 * 진입 불러오기 한 번(widget-render-findings W1·W3) — 사용자 확인·위젯 정의가 늦게 도착해도 store.load 를 다시 부르지 않고,
 * 이미 보이는 보드를 스켈레톤으로 되돌리지 않으며, 같은 배치면 위젯 틀을 다시 마운트하지 않는다.
 */
import { act, createElement as h, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WidgetWorkspace } from "../../src/widget";
import type { WidgetItem, WidgetRegistry, WidgetStore, WidgetTab } from "../../src/widget";

let host: HTMLDivElement;
let root: Root;
// happy-dom 이 localStorage 를 노출하지 않을 수 있어 메모리 스텁을 둔다(widget-workspace 시험 방식).
const mem = new Map<string, string>();
const prevLs = Object.getOwnPropertyDescriptor(window, "localStorage");
beforeEach(() => {
  mem.clear();
  Object.defineProperty(window, "localStorage", {
    value: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), clear: () => mem.clear() },
    configurable: true,
  });
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  if (prevLs) Object.defineProperty(window, "localStorage", prevLs);
  else delete (window as unknown as { localStorage?: unknown }).localStorage;
});

const bodyMounts = vi.fn();
const Body = () => {
  useEffect(() => {
    bodyMounts();
  }, []);
  return h("p", null, "가");
};
const loadA = async () => ({ default: Body });
const REG: WidgetRegistry = { "t.a": { meta: { id: "t.a", title: "가", defaultSize: { w: 6, h: 6 } }, load: loadA } };
const it_ = (instId: string, x = 0, y = 0, widgetId = "t.a"): WidgetItem => ({ instId, widgetId, x, y, w: 6, h: 6, locked: false, config: null });
const HOME_DEFAULT = [it_("d1")];

function makeStore(tabs: WidgetTab[]): WidgetStore & { load: ReturnType<typeof vi.fn> } {
  return {
    load: vi.fn(async () => tabs),
    saveTab: vi.fn(async () => {}),
    deleteTab: vi.fn(async () => {}),
    reorderTabs: vi.fn(async () => {}),
    resetHome: vi.fn(async () => {}),
  };
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });
}
const base = (store: WidgetStore) => ({ registry: REG, homeDefault: HOME_DEFAULT, store, confirm: vi.fn(async () => true), notify: vi.fn(), boardWidth: 1440 });
const render = async (props: Record<string, unknown>) => {
  act(() => root.render(h(WidgetWorkspace, props as never)));
  await flush();
};

describe("WidgetWorkspace — 진입 불러오기 한 번(W1)", () => {
  beforeEach(() => bodyMounts.mockClear());

  it("사용자 확인(null→id)·위젯 정의(registry·homeDefault 교체)가 늦게 와도 store.load 는 한 번이고, 보드는 스켈레톤으로 돌아가지 않으며 틀·본체가 다시 마운트되지 않는다", async () => {
    const store = makeStore([{ tabId: "home", name: "홈", seq: 0, locked: false, items: [it_("a")] }]);
    const props = { ...base(store), userId: null };
    await render(props);
    const frame = host.querySelector('.cm-widget[data-inst-id="a"]');
    expect(frame).not.toBeNull();
    expect(bodyMounts).toHaveBeenCalledTimes(1);

    await render({ ...props, userId: "u1" });
    // 정의 응답 — 같은 코드 위젯 + 정의 위젯 하나가 붙은 새 등록부, 새 기본 배치 배열.
    const REG2: WidgetRegistry = {
      ...REG,
      "def.x": { meta: { id: "def.x", title: "정의", defaultSize: { w: 6, h: 6 }, kind: "def" }, load: async () => ({ default: () => h("p", null, "정의") }) },
    };
    act(() => root.render(h(WidgetWorkspace, { ...props, userId: "u1", registry: REG2, homeDefault: [...HOME_DEFAULT] } as never)));
    // 같은 렌더에서 스켈레톤이 아니어야 한다.
    expect(host.querySelector('[aria-busy="true"]')).toBeNull();
    await flush();

    expect(store.load).toHaveBeenCalledTimes(1);
    expect(host.querySelector('.cm-widget[data-inst-id="a"]')).toBe(frame);
    expect(bodyMounts).toHaveBeenCalledTimes(1);
  });

  it("사용자 확인이 늦게 끝나면 다시 불러오지 않고 기억한 탭(lastTab)만 고른다", async () => {
    window.localStorage.setItem("dmes:widget:lastTab:u1", "tab-1");
    const store = makeStore([
      { tabId: "home", name: "홈", seq: 0, locked: false, items: [] },
      { tabId: "tab-1", name: "내 생산", seq: 1, locked: false, items: [it_("b")] },
    ]);
    const props = { ...base(store), userId: null };
    await render(props);
    expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain("홈");
    await render({ ...props, userId: "u1" });
    expect(store.load).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain("내 생산");
  });

  it("사용자가 다른 사람으로 바뀌면(id→다른 id) 예전처럼 다시 불러온다", async () => {
    const store = makeStore([]);
    const props = { ...base(store), userId: "u1" };
    await render(props);
    await render({ ...props, userId: "u2" });
    expect(store.load).toHaveBeenCalledTimes(2);
  });

  it("저장한 홈이 없으면 기본 배치 응답(homeDefault 교체)이 다시 조회 없이 「홈」에 반영된다", async () => {
    const store = makeStore([]);
    const props = base(store);
    await render(props);
    expect(host.querySelector('.cm-widget[data-inst-id="d1"]')).not.toBeNull();
    await render({ ...props, homeDefault: [it_("dept1"), it_("dept2", 6, 0)] });
    expect(store.load).toHaveBeenCalledTimes(1);
    expect(host.querySelector('.cm-widget[data-inst-id="d1"]')).toBeNull();
    expect(host.querySelectorAll(".cm-widget")).toHaveLength(2);
  });

  it("저장한 홈이 있으면 기본 배치가 바뀌어도 사용자 배치를 그대로 둔다", async () => {
    const store = makeStore([{ tabId: "home", name: "홈", seq: 0, locked: false, items: [it_("mine")] }]);
    const props = base(store);
    await render(props);
    await render({ ...props, homeDefault: [it_("dept1")] });
    expect(host.querySelector('.cm-widget[data-inst-id="mine"]')).not.toBeNull();
    expect(host.querySelector('.cm-widget[data-inst-id="dept1"]')).toBeNull();
  });

  it("보기 모드에서 바로 저장한 탭 잠금은 등록부가 바뀐 뒤에도 남는다(서버 원본으로 되돌리지 않는다)", async () => {
    const store = makeStore([
      { tabId: "home", name: "홈", seq: 0, locked: false, items: [] },
      { tabId: "tab-1", name: "내 생산", seq: 1, locked: false, items: [] },
    ]);
    const props = base(store);
    await render(props);
    act(() => (host.querySelector('[data-tab-menu="tab-1"]') as HTMLButtonElement).click());
    const lock = [...document.querySelectorAll(".cm-widget-menu button")].find((b) => b.textContent?.includes("탭 잠그기")) as HTMLButtonElement;
    act(() => lock.click());
    await flush();
    expect(host.querySelector('[data-tab-id="tab-1"] .cm-widget-tab__lock')).not.toBeNull();
    await render({ ...props, registry: { ...REG } });
    expect(store.load).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[data-tab-id="tab-1"] .cm-widget-tab__lock')).not.toBeNull();
  });
});
