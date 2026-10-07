/**
 * 조회 칸 기본값 규칙 계산(설계 2026-10-07-search-defaults-design §4) — 월 경계·윤년·해 넘김·자정 직전.
 */
import { describe, expect, it } from "vitest";
import {
  RANGE_PRESETS,
  isValidIsoDate,
  parseSearchDefaultRule,
  resolveRelativeDate,
  resolveSearchDefault,
} from "../../src/layout/search-defaults/rule";

/** 지역 시각 기준 날짜(월은 1부터). */
const at = (y: number, m: number, d: number, h = 12, mi = 0) => new Date(y, m - 1, d, h, mi);

describe("resolveRelativeDate", () => {
  it("당일·전일·익일", () => {
    expect(resolveRelativeDate({ base: "today" }, at(2026, 10, 7))).toBe("2026-10-07");
    expect(resolveRelativeDate({ base: "today", days: -1 }, at(2026, 10, 7))).toBe("2026-10-06");
    expect(resolveRelativeDate({ base: "today", days: 1 }, at(2026, 12, 31))).toBe("2027-01-01");
  });

  it("1월의 전월 1일·전월 말일은 전년 12월", () => {
    expect(resolveRelativeDate({ base: "monthStart", months: -1 }, at(2026, 1, 15))).toBe("2025-12-01");
    expect(resolveRelativeDate({ base: "monthEnd", months: -1 }, at(2026, 1, 15))).toBe("2025-12-31");
  });

  it("3월 31일의 1개월 전은 2월 말일(평년 28일·윤년 29일)", () => {
    expect(resolveRelativeDate({ base: "today", months: -1 }, at(2026, 3, 31))).toBe("2026-02-28");
    expect(resolveRelativeDate({ base: "today", months: -1 }, at(2028, 3, 31))).toBe("2028-02-29");
  });

  it("당월 말일 — 윤년 2월", () => {
    expect(resolveRelativeDate({ base: "monthEnd" }, at(2028, 2, 3))).toBe("2028-02-29");
    expect(resolveRelativeDate({ base: "monthEnd" }, at(2026, 2, 3))).toBe("2026-02-28");
  });

  it("days 로 해를 넘는다", () => {
    expect(resolveRelativeDate({ base: "today", days: -10 }, at(2026, 1, 5))).toBe("2025-12-26");
    expect(resolveRelativeDate({ base: "monthStart", days: -1 }, at(2026, 3, 10))).toBe("2026-02-28");
  });

  it("자정 직전·직후도 지역 날짜를 쓴다", () => {
    expect(resolveRelativeDate({ base: "today" }, at(2026, 10, 7, 23, 59))).toBe("2026-10-07");
    expect(resolveRelativeDate({ base: "today" }, at(2026, 10, 8, 0, 0))).toBe("2026-10-08");
  });
});

describe("RANGE_PRESETS", () => {
  it("전월 전체·최근 7일", () => {
    const now = at(2026, 1, 20);
    const prev = RANGE_PRESETS.find((p) => p.id === "prevMonth")!;
    expect([resolveRelativeDate(prev.from, now), resolveRelativeDate(prev.to, now)]).toEqual(["2025-12-01", "2025-12-31"]);
    const last7 = RANGE_PRESETS.find((p) => p.id === "last7")!;
    expect([resolveRelativeDate(last7.from, now), resolveRelativeDate(last7.to, now)]).toEqual(["2026-01-14", "2026-01-20"]);
  });
});

describe("parseSearchDefaultRule", () => {
  it("세 가지 꼴을 읽고 0 은 생략한다", () => {
    expect(parseSearchDefaultRule('{"kind":"fixed","value":"A"}')).toEqual({ kind: "fixed", value: "A" });
    expect(parseSearchDefaultRule({ kind: "last" })).toEqual({ kind: "last" });
    expect(parseSearchDefaultRule({ kind: "relative", base: "today", months: 0, days: -3 })).toEqual({
      kind: "relative",
      base: "today",
      days: -3,
    });
  });

  it("모르는 꼴·범위 밖·정수 아님은 null", () => {
    expect(parseSearchDefaultRule("{bad")).toBeNull();
    expect(parseSearchDefaultRule({ kind: "weekly" })).toBeNull();
    expect(parseSearchDefaultRule({ kind: "fixed", value: 3 })).toBeNull();
    expect(parseSearchDefaultRule({ kind: "relative", base: "yearStart" })).toBeNull();
    expect(parseSearchDefaultRule({ kind: "relative", base: "today", days: 1.5 })).toBeNull();
    expect(parseSearchDefaultRule({ kind: "relative", base: "today", months: 121 })).toBeNull();
    expect(parseSearchDefaultRule({ kind: "relative", base: "today", days: -3661 })).toBeNull();
    expect(parseSearchDefaultRule(null)).toBeNull();
  });
});

describe("resolveSearchDefault", () => {
  const now = at(2026, 10, 7);

  it("고정 값 — 선택지에 없으면 넣지 않고, 빈 값(전체)은 넣는다", () => {
    const ctx = { valueType: "select" as const, optionValues: ["", "Y", "N"], now };
    expect(resolveSearchDefault({ kind: "fixed", value: "Y" }, ctx)).toBe("Y");
    expect(resolveSearchDefault({ kind: "fixed", value: "" }, ctx)).toBe("");
    expect(resolveSearchDefault({ kind: "fixed", value: "Z" }, ctx)).toBeUndefined();
  });

  it("상대 날짜는 날짜 칸에서만", () => {
    const rule = { kind: "relative" as const, base: "today" as const };
    expect(resolveSearchDefault(rule, { valueType: "date", now })).toBe("2026-10-07");
    expect(resolveSearchDefault(rule, { valueType: "text", now })).toBeUndefined();
  });

  it("마지막 조회값 — 없으면 넣지 않는다", () => {
    expect(resolveSearchDefault({ kind: "last" }, { valueType: "text", lastValue: "P-1", now })).toBe("P-1");
    expect(resolveSearchDefault({ kind: "last" }, { valueType: "text", now })).toBeUndefined();
  });

  it("날짜 칸의 고정 값은 실제 있는 날짜만(빈 값은 허용)", () => {
    expect(resolveSearchDefault({ kind: "fixed", value: "2026-02-30" }, { valueType: "date", now })).toBeUndefined();
    expect(resolveSearchDefault({ kind: "fixed", value: "2026-02-28" }, { valueType: "date", now })).toBe("2026-02-28");
    expect(resolveSearchDefault({ kind: "fixed", value: "" }, { valueType: "date", now })).toBe("");
  });

  it("isValidIsoDate", () => {
    expect(isValidIsoDate("2028-02-29")).toBe(true);
    expect(isValidIsoDate("2026-02-29")).toBe(false);
    expect(isValidIsoDate("20261007")).toBe(false);
  });
});
