import { describe, expect, it } from "vitest";
import { movedOrder } from "../../../pages/dme/ruleSetEdit/panels/PropertyPanel";

describe("movedOrder", () => {
  it("끌어 놓은 자리로 옮긴다", () => {
    expect(movedOrder(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
    expect(movedOrder(["a", "b", "c"], "a", "c")).toEqual(["b", "c", "a"]);
    expect(movedOrder(["a", "b", "c"], "b", "b")).toEqual(["a", "b", "c"]);
  });
});
