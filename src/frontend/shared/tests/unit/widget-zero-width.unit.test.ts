/** @vitest-environment happy-dom */
/**
 * 숨은 홈 위젯 보드는 폭 0 통지로 다시 그리지 않는다(Screen-Performance-Guide K6).
 * 포털 탭을 떠나 display:none 이 되면 ResizeObserver 가 폭 0 을 알린다 — 마지막 0보다 큰 폭을 그대로 둔다.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVisibleContainerWidth } from "../../src/widget/use-visible-container-width";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type RoCallback = (entries: Array<{ contentRect: { width: number; height: number } }>) => void;

describe("useVisibleContainerWidth — 폭 0 통지 무시(K6)", () => {
  let host: HTMLDivElement;
  let root: Root;
  let observers: RoCallback[];
  let width = 0;
  let renders = 0;

  function Probe() {
    const m = useVisibleContainerWidth({ initialWidth: 1280 });
    width = m.width;
    renders += 1;
    return createElement("div", { ref: m.containerRef });
  }

  function notify(w: number) {
    return act(async () => {
      observers.forEach((cb) => cb([{ contentRect: { width: w, height: 100 } }]));
      await new Promise((r) => setTimeout(r, 30)); // requestAnimationFrame
    });
  }

  beforeEach(async () => {
    observers = [];
    renders = 0;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(cb: RoCallback) {
          observers.push(cb);
        }
        observe() {}
        disconnect() {}
      }
    );
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root.render(createElement(Probe)));
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  it("0보다 큰 폭은 반영하고, 폭 0 통지는 상태를 바꾸지 않아 다시 그리지 않는다", async () => {
    await notify(960);
    expect(width).toBe(960);
    const before = renders;

    await notify(0);
    expect(width).toBe(960);
    expect(renders).toBe(before);

    await notify(1200);
    expect(width).toBe(1200);
  });
});
