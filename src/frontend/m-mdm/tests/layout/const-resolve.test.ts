// TSK-05-02 design.md §3.4·F9 — 3층 기본값 해석(불변 I10). Java LayoutConstResolverTest 와 같은 케이스.
import { describe, expect, it } from "vitest";
import { effectiveConst } from "../../src/layout/const-resolve";

describe("const-resolve", () => {
  it("CONST 는 재정의가 있으면 재정의 값이다", () => {
    expect(effectiveConst("CONST", "B0", "B1")).toBe("B1");
  });
  it("CONST 는 재정의가 비면 헤더 기본값이다", () => {
    expect(effectiveConst("CONST", "B0", null)).toBe("B0");
    expect(effectiveConst("CONST", "B0", "")).toBe("B0");
    expect(effectiveConst("CONST", "B0", "  ")).toBe("B0");
  });
  it("AUTO 는 재정의를 무시하고 송신 시 채움으로 보인다", () => {
    expect(effectiveConst("AUTO", "SEND_TIME", "X")).toBe("(송신 시 채움: SEND_TIME)");
  });
  it("DATA·FILLER 는 값이 없다", () => {
    expect(effectiveConst("DATA", "B0", "B1")).toBeNull();
    expect(effectiveConst("FILLER", null, "B1")).toBeNull();
  });
});
