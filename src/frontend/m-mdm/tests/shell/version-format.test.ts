// D-144 — 룰 버전 문자열("1.001") 공통 처리. 표시·비교·정규화가 소수부를 잃지 않아야 한다(Review Focus 4).
import { describe, expect, it } from "vitest";
import { fmtVer, normVer, sameVer } from "@/shell";

describe("version-format", () => {
  it("formats three decimals", () => {
    expect(fmtVer("1.001")).toBe("v1.001");
    expect(fmtVer("2")).toBe("v2.000");
    expect(fmtVer(null)).toBe("");
    expect(fmtVer(undefined)).toBe("");
    expect(fmtVer("")).toBe("");
  });
  it("normalizes handoff values", () => {
    expect(normVer("1.001")).toBe("1.001");
    expect(normVer(" 1.01 ")).toBe("1.010");
    expect(normVer(2)).toBe("2.000");
    expect(normVer(1.001)).toBe("1.001");
    expect(normVer("1.0001")).toBeNull();
    expect(normVer("abc")).toBeNull();
    expect(normVer("")).toBeNull();
    expect(normVer(null)).toBeNull();
  });
  it("compares by value", () => {
    expect(sameVer("1", "1.000")).toBe(true);
    expect(sameVer("1.001", "1.000")).toBe(false);
    expect(sameVer("1.001", "1.001")).toBe(true);
    expect(sameVer(null, null)).toBe(true);
    expect(sameVer(undefined, null)).toBe(true);
    expect(sameVer("1.000", null)).toBe(false);
    expect(sameVer("abc", "abc")).toBe(false);
  });
});
