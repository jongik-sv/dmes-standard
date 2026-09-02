import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  createTrailingResizeScheduler,
  getTabVisibilityScrollLeft,
} from "../../src/portal-shell/tabs-bar/tab-visibility";

const tabsBarSource = readFileSync(
  new URL("../../src/portal-shell/tabs-bar/TabsBar.tsx", import.meta.url),
  "utf8"
);

describe("portal tabs visibility", () => {
  it("moves right when the end tab is clipped by controls", () => {
    expect(
      getTabVisibilityScrollLeft({
        currentScrollLeft: 30,
        viewportLeft: 0,
        viewportRight: 120,
        tabLeft: 80,
        tabRight: 180,
      })
    ).toBe(90);
  });

  it("moves left when the active tab is clipped at the start", () => {
    expect(
      getTabVisibilityScrollLeft({
        currentScrollLeft: 150,
        viewportLeft: 0,
        viewportRight: 200,
        tabLeft: -50,
        tabRight: 50,
      })
    ).toBe(100);
  });

  it("keeps the current position when the active tab is fully visible", () => {
    expect(
      getTabVisibilityScrollLeft({
        currentScrollLeft: 40,
        viewportLeft: 0,
        viewportRight: 200,
        tabLeft: 50,
        tabRight: 150,
      })
    ).toBe(40);
  });

  it("rechecks the active tab after scroll controls change the viewport width", () => {
    expect(tabsBarSource).toMatch(
      /\[tabs\.length, showScrollButtons, checkScrollButtons, scrollActiveTabIntoView\]/
    );
    expect(tabsBarSource).toContain("const handleResize = () => resizeScheduler.schedule();");
    expect(tabsBarSource).not.toContain(".scrollIntoView(");
  });

  it("runs tab measurements once after a burst of viewport resize events", () => {
    let nextTimeoutId = 0;
    const pendingCallbacks = new Map<number, () => void>();
    const callback = vi.fn();
    const scheduler = createTrailingResizeScheduler(
      (scheduledCallback) => {
        nextTimeoutId += 1;
        pendingCallbacks.set(nextTimeoutId, scheduledCallback);
        return nextTimeoutId;
      },
      (timeoutId) => pendingCallbacks.delete(timeoutId),
      callback,
      120
    );

    scheduler.schedule();
    scheduler.schedule();
    scheduler.schedule();

    expect(pendingCallbacks.size).toBe(1);
    expect(callback).not.toHaveBeenCalled();

    [...pendingCallbacks.values()][0]?.();

    expect(callback).toHaveBeenCalledOnce();
  });
});
