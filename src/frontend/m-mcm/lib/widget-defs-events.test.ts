/** @vitest-environment happy-dom */
import { describe, expect, it, vi } from "vitest";

import { notifyWidgetDefsChanged, onWidgetDefsChanged } from "./widget-defs-events";

describe("widget-defs-events", () => {
  it("알리면 구독자가 불리고, 해지하면 더 불리지 않는다", () => {
    const listener = vi.fn();
    const off = onWidgetDefsChanged(listener);
    notifyWidgetDefsChanged();
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    notifyWidgetDefsChanged();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
