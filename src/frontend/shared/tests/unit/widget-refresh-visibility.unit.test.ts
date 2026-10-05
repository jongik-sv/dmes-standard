/** @vitest-environment happy-dom */
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WidgetFrame } from "../../src/widget";
import type { WidgetItem, WidgetRegistryEntry } from "../../src/widget";

// R14 — refreshSec 자동 새로 고침은 위젯이 안 보이면(숨은 탭·폭 0·화면 밖·document hidden) 멈추고,
// 다시 보이면 밀린 1회만 새로 고친다.

let host: HTMLDivElement;
let root: Root;
const observers: FakeIO[] = [];
class FakeIO {
  targets: Element[] = [];
  constructor(readonly cb: IntersectionObserverCallback) {
    observers.push(this);
  }
  observe(el: Element) {
    this.targets.push(el);
  }
  unobserve() {}
  disconnect() {
    this.targets = [];
  }
  takeRecords() {
    return [];
  }
}
const setIntersecting = (v: boolean) =>
  act(() => {
    for (const o of observers) {
      if (o.targets.length) o.cb([{ isIntersecting: v, target: o.targets[0] } as unknown as IntersectionObserverEntry], o as unknown as IntersectionObserver);
    }
  });
const setDocVisible = (v: boolean) =>
  act(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (v ? "visible" : "hidden") });
    document.dispatchEvent(new Event("visibilitychange"));
  });

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  observers.length = 0;
  vi.stubGlobal("IntersectionObserver", FakeIO);
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  setDocVisible(true);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const item: WidgetItem = { instId: "i1", widgetId: "t.a", x: 0, y: 0, w: 6, h: 6, locked: false, config: null };
const Body = ({ refreshKey }: { refreshKey: number }) => h("p", { "data-testid": "key" }, String(refreshKey));
const entry: WidgetRegistryEntry = {
  meta: { id: "t.a", title: "샘플", defaultSize: { w: 6, h: 6 }, refreshSec: 600 },
  load: async () => ({ default: Body }),
};
async function mount() {
  act(() => root.render(h(WidgetFrame, { item, entry, editing: false, onToggleLock: () => {}, onRemove: () => {} })));
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
}
const key = () => host.querySelector('[data-testid="key"]')!.textContent;
const tick = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

describe("WidgetFrame refreshSec 가시성 연동 (R14)", () => {
  it("보이는 동안은 주기마다 새로 고친다", async () => {
    await mount();
    tick(600_000);
    expect(key()).toBe("1");
    tick(600_000);
    expect(key()).toBe("2");
  });

  it("meta 에 600 미만이 저장돼 있어도 600초(MIN_REFRESH_SEC)마다 새로 고친다", async () => {
    entry.meta.refreshSec = 30;
    try {
      await mount();
      tick(30_000);
      expect(key()).toBe("0");
      tick(570_000);
      expect(key()).toBe("1");
    } finally {
      entry.meta.refreshSec = 600;
    }
  });

  it("화면 밖·숨은 탭이면 멈추고, 다시 보이면 밀린 1회만 새로 고친다", async () => {
    await mount();
    setIntersecting(false);
    tick(3_000_000);
    expect(key()).toBe("0");
    setIntersecting(true);
    expect(key()).toBe("1");
    tick(600_000);
    expect(key()).toBe("2");
  });

  it("주기가 차기 전에 다시 보이면 곧바로 새로 고치지 않는다", async () => {
    await mount();
    setIntersecting(false);
    tick(100_000);
    setIntersecting(true);
    expect(key()).toBe("0");
  });

  it("document 가 hidden 이면 멈추고 visible 로 돌아오면 1회 새로 고친다", async () => {
    await mount();
    setDocVisible(false);
    tick(1_200_000);
    expect(key()).toBe("0");
    setDocVisible(true);
    expect(key()).toBe("1");
  });
});
