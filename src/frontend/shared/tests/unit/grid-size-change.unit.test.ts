import { describe, expect, it } from "vitest";
import {
  GRID_SIZE_CHANGE_SETTLE_MS,
  resolveGridSizeChangeAction,
} from "../../src/components/grid/grid-size-change";

describe("resolveGridSizeChangeAction", () => {
  it("skips work when the next width is not layouted yet", () => {
    expect(resolveGridSizeChangeAction(0, 0)).toBe("none");
    expect(resolveGridSizeChangeAction(800, 0)).toBe("none");
  });

  it("remeasures content when the grid becomes visible from zero width", () => {
    expect(resolveGridSizeChangeAction(0, 960)).toBe("autosize");
    expect(resolveGridSizeChangeAction(-1, 640)).toBe("autosize");
  });

  it("only fills leftover space on ordinary viewport resizes", () => {
    expect(resolveGridSizeChangeAction(800, 1000)).toBe("fill");
    expect(resolveGridSizeChangeAction(1200, 900)).toBe("fill");
  });

  it("skips work when width is unchanged", () => {
    expect(resolveGridSizeChangeAction(1024, 1024)).toBe("none");
  });

  it("uses a settle window long enough to absorb continuous window drag events", () => {
    expect(GRID_SIZE_CHANGE_SETTLE_MS).toBeGreaterThanOrEqual(100);
  });
});
