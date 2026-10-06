/**
 * 화면 문맥 계약(screen-context) D1: 키 정규화·값 찾기·같은 문맥 판정.
 */
import { describe, expect, it } from "vitest";
import {
  findScreenContextValue,
  normalizeScreenContextValues,
  normalizeScreenKey,
  screenContextEqual,
  screenKeysMatch,
  type ScreenContext,
} from "../../src/screen-context";

function ctx(values: ScreenContext["values"], over: Partial<ScreenContext> = {}): ScreenContext {
  return { source: "grid", tabId: "t1", pageId: "p1", values, at: 1, ...over };
}

describe("normalizeScreenKey", () => {
  it("대소문자 차이를 지운다", () => {
    expect(normalizeScreenKey("THK")).toBe("thk");
    expect(normalizeScreenKey("Thk")).toBe("thk");
    expect(screenKeysMatch("THK", "thk")).toBe(true);
    expect(screenKeysMatch("Thk", "tHK")).toBe(true);
  });

  it("밑줄·하이픈·공백·camelCase 차이를 지운다", () => {
    expect(normalizeScreenKey("COIL_WIDTH")).toBe("coilwidth");
    expect(normalizeScreenKey("coilWidth")).toBe("coilwidth");
    expect(normalizeScreenKey("coil-width")).toBe("coilwidth");
    expect(normalizeScreenKey("Coil Width")).toBe("coilwidth");
    expect(screenKeysMatch("COIL_WIDTH", "coilWidth")).toBe(true);
  });

  it("다른 이름은 구분한다", () => {
    expect(screenKeysMatch("THK", "WIDTH")).toBe(false);
    expect(screenKeysMatch("coilWidth", "coilWidth2")).toBe(false);
  });

  it("빈 문자열도 다룬다", () => {
    expect(normalizeScreenKey("")).toBe("");
    expect(normalizeScreenKey("_ -")).toBe("");
  });
});

describe("findScreenContextValue", () => {
  const values = { COIL_WIDTH: 1250, thk: "2.3", note: null };

  it("정규화 비교로 값을 찾는다", () => {
    expect(findScreenContextValue(values, "coilWidth")).toBe(1250);
    expect(findScreenContextValue(values, "THK")).toBe("2.3");
  });

  it("값이 비어 있으면 null, 키가 없으면 undefined 를 돌려준다", () => {
    expect(findScreenContextValue(values, "NOTE")).toBeNull();
    expect(findScreenContextValue(values, "missing")).toBeUndefined();
  });

  it("값 사전이 없으면 undefined 를 돌려준다", () => {
    expect(findScreenContextValue(null, "thk")).toBeUndefined();
    expect(findScreenContextValue(undefined, "thk")).toBeUndefined();
  });

  it("정규형이 같은 키가 여럿이면 표기가 정확히 같은 키를 먼저 쓴다", () => {
    expect(findScreenContextValue({ coilWidth: 1, COIL_WIDTH: 2 }, "COIL_WIDTH")).toBe(2);
    expect(findScreenContextValue({ coilWidth: 1, COIL_WIDTH: 2 }, "Coil_Width")).toBe(1);
  });

  it("0 과 빈 문자열을 비어 있음으로 취급하지 않는다", () => {
    expect(findScreenContextValue({ a: 0, b: "" }, "A")).toBe(0);
    expect(findScreenContextValue({ a: 0, b: "" }, "B")).toBe("");
  });
});

describe("normalizeScreenContextValues", () => {
  it("키를 정규형으로 바꾸고 먼저 나온 키가 이긴다", () => {
    expect(normalizeScreenContextValues({ COIL_WIDTH: 1, coilWidth: 2, THK: 3 })).toEqual({ coilwidth: 1, thk: 3 });
  });

  it("없으면 빈 사전", () => {
    expect(normalizeScreenContextValues(null)).toEqual({});
  });
});

describe("screenContextEqual", () => {
  it("값이 같으면 시각이 달라도 같다", () => {
    expect(screenContextEqual(ctx({ a: 1, b: null }), ctx({ a: 1, b: null }, { at: 99 }))).toBe(true);
  });

  it("값·출처·탭·화면이 다르면 다르다", () => {
    expect(screenContextEqual(ctx({ a: 1 }), ctx({ a: 2 }))).toBe(false);
    expect(screenContextEqual(ctx({ a: 1 }), ctx({ a: 1, b: 1 }))).toBe(false);
    expect(screenContextEqual(ctx({ a: 1 }), ctx({ a: 1 }, { source: "form" }))).toBe(false);
    expect(screenContextEqual(ctx({ a: 1 }), ctx({ a: 1 }, { pageId: "p2" }))).toBe(false);
    expect(screenContextEqual(ctx({ a: 1 }), ctx({ a: 1 }, { tabId: "t2" }))).toBe(false);
  });

  it("null 은 null 과만 같다", () => {
    expect(screenContextEqual(null, null)).toBe(true);
    expect(screenContextEqual(null, ctx({}))).toBe(false);
    expect(screenContextEqual(ctx({}), undefined)).toBe(false);
  });
});
