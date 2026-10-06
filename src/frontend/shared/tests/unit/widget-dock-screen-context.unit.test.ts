/** @vitest-environment happy-dom */
/**
 * 화면 문맥 D4: 도크 창 층이 활성 탭의 문맥을 위젯 본체 screenContext 로 넘긴다. 보드(WidgetFrame 직접 사용)는 null.
 */
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WidgetFrame } from "../../src/widget";
import type { WidgetProps, WidgetRegistry, WidgetRegistryEntry } from "../../src/widget";
import { screenApplyStore, screenContextStore, findScreenContextValue } from "../../src/screen-context";
import { WidgetDockLayer, type DockWindow } from "../../src/widget-dock";

let host: HTMLDivElement;
let root: Root;
const seen: Array<WidgetProps["screenContext"]> = [];
const seenApply: Array<WidgetProps["screenApply"]> = [];

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  seen.length = 0;
  seenApply.length = 0;
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  screenContextStore.clearTab("t1");
  screenContextStore.clearTab("t2");
  vi.useRealTimers();
});

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
}

const entry: WidgetRegistryEntry = {
  meta: { id: "def.calc", title: "계산기", defaultSize: { w: 6, h: 8 }, floatable: true },
  load: async () => ({
    default: (p: WidgetProps) => {
      seen.push(p.screenContext);
      seenApply.push(p.screenApply);
      return h("p", { "data-testid": "body" }, String(findScreenContextValue(p.screenContext?.values, "coilWidth") ?? "-"));
    },
  }),
};
const registry: WidgetRegistry = { "def.calc": entry };
const windows: DockWindow[] = [{ id: "a", widgetId: "def.calc", x: 10, y: 20, w: 300, h: 240, collapsed: false, z: 1 }];
const handlers = { onMove: vi.fn(), onResize: vi.fn(), onToggleCollapse: vi.fn(), onClose: vi.fn(), onFocus: vi.fn() };
const body = () => host.querySelector('[data-testid="body"]')!.textContent;

function layer(activeTabId: string | null | undefined) {
  return h(WidgetDockLayer, { windows, registry, frame: WidgetFrame, viewport: { width: 1200, height: 800 }, activeTabId, ...handlers });
}

describe("WidgetDockLayer 화면 문맥 전달", () => {
  it("활성 탭이 게시한 문맥을 위젯 본체에 넘긴다(키는 정규화해 찾는다)", async () => {
    screenContextStore.publish("t1", "o", { source: "grid", tabId: "t1", pageId: "p1", values: { COIL_WIDTH: 1250 } });
    act(() => root.render(layer("t1")));
    await flush();
    expect(body()).toBe("1250");
  });

  it("탭을 바꾸면 그 탭의 문맥으로 바뀌고, 게시가 없으면 null", async () => {
    screenContextStore.publish("t1", "o", { source: "grid", tabId: "t1", pageId: "p1", values: { COIL_WIDTH: 1250 } });
    act(() => root.render(layer("t1")));
    await flush();
    act(() => root.render(layer("t2")));
    await flush();
    expect(body()).toBe("-");
    expect(seen[seen.length - 1]).toBeNull();
    await act(async () => {
      screenContextStore.publish("t2", "o", { source: "grid", tabId: "t2", pageId: "p2", values: { coilWidth: 900 } });
    });
    await flush();
    expect(body()).toBe("900");
  });

  it("활성 탭이 없으면(홈·탭 없음) null 을 넘긴다", async () => {
    screenContextStore.publish("t1", "o", { source: "grid", tabId: "t1", pageId: "p1", values: { COIL_WIDTH: 1 } });
    act(() => root.render(layer(null)));
    await flush();
    expect(body()).toBe("-");
  });

  it("게시가 바뀌면 열려 있는 위젯이 새 값을 받는다", async () => {
    act(() => root.render(layer("t1")));
    await flush();
    expect(body()).toBe("-");
    await act(async () => {
      screenContextStore.publish("t1", "o", { source: "grid", tabId: "t1", pageId: "p1", values: { COIL_WIDTH: 777 } });
    });
    await flush();
    expect(body()).toBe("777");
  });

  it("보드처럼 틀을 직접 쓰면 screenContext 는 null", async () => {
    act(() =>
      root.render(
        h(WidgetFrame, {
          item: { instId: "i", widgetId: "def.calc", x: 0, y: 0, w: 6, h: 8, locked: false, config: null },
          entry,
          editing: false,
          onToggleLock: () => {},
          onRemove: () => {},
        })
      )
    );
    await flush();
    expect(seen[seen.length - 1]).toBeNull();
  });

  it("활성 탭의 받기 처리기를 screenApply 로 넘긴다(없으면 available=false, 보드는 null)", async () => {
    act(() => root.render(layer("t1")));
    await flush();
    expect(seenApply[seenApply.length - 1]?.available).toBe(false);
    const handler = vi.fn(() => ({ applied: ["x"], skipped: [] }));
    let off = () => {};
    await act(async () => {
      off = screenApplyStore.register("t1", "o", handler);
    });
    await flush();
    const apply = seenApply[seenApply.length - 1]!;
    expect(apply.available).toBe(true);
    expect(await apply.apply({ x: 1 })).toEqual({ applied: ["x"], skipped: [] });
    // 다른 탭이 활성이면 그 탭에는 받는 쪽이 없다.
    act(() => root.render(layer("t2")));
    await flush();
    expect(seenApply[seenApply.length - 1]?.available).toBe(false);
    off();
    seenApply.length = 0;
    act(() =>
      root.render(
        h(WidgetFrame, {
          item: { instId: "i", widgetId: "def.calc", x: 0, y: 0, w: 6, h: 8, locked: false, config: null },
          entry,
          editing: false,
          onToggleLock: () => {},
          onRemove: () => {},
        })
      )
    );
    await flush();
    expect(seenApply[seenApply.length - 1]).toBeNull();
  });
});
