import { describe, expect, it } from "vitest";

import { normalizeWidgetPlacement, resolveWidgetPlacement } from "../../src/widget";

describe("resolveWidgetPlacement", () => {
  it("없으면 보드는 늘 허용하고 도구 창은 floatable 을 따른다(기존 동작)", () => {
    expect(resolveWidgetPlacement({})).toEqual({ board: true, dock: false });
    expect(resolveWidgetPlacement({ floatable: false })).toEqual({ board: true, dock: false });
    expect(resolveWidgetPlacement({ floatable: true })).toEqual({ board: true, dock: true });
  });

  it("W 는 보드만, floatable 이어도 도구 창에서 뺀다", () => {
    expect(resolveWidgetPlacement({ placement: "W" })).toEqual({ board: true, dock: false });
    expect(resolveWidgetPlacement({ placement: "W", floatable: true })).toEqual({ board: true, dock: false });
  });

  it("B 는 도구 창만, floatable 과 상관없이 띄운다", () => {
    expect(resolveWidgetPlacement({ placement: "B" })).toEqual({ board: false, dock: true });
    expect(resolveWidgetPlacement({ placement: "B", floatable: false })).toEqual({ board: false, dock: true });
  });

  it("A 는 둘 다, floatable 과 상관없이 도구 창에 띄운다", () => {
    expect(resolveWidgetPlacement({ placement: "A" })).toEqual({ board: true, dock: true });
    expect(resolveWidgetPlacement({ placement: "A", floatable: false })).toEqual({ board: true, dock: true });
  });

  it("알 수 없는 값은 없는 값으로 본다", () => {
    expect(normalizeWidgetPlacement("X")).toBeUndefined();
    expect(normalizeWidgetPlacement(null)).toBeUndefined();
    expect(normalizeWidgetPlacement("B")).toBe("B");
    expect(resolveWidgetPlacement({ placement: "X" as never, floatable: true })).toEqual({ board: true, dock: true });
  });
});
