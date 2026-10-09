import { describe, expect, it } from "vitest";

import {
  formatCollectedAt,
  formatDiff,
  formatHumidity,
  formatPop,
  formatRange,
  formatRate,
  formatTemp,
  formatWind,
  kmhToMs,
  latestDateOf,
  normalizeDate,
  toExchangeRows,
  toNumber,
  unitLabel,
  unitOf,
  weekdayLabel,
} from "@/widget-types/_ext/format";
import type { ExchangeResult } from "@/widget-types/_ext/types";

describe("unitOf · unitLabel — 환율 표시 단위", () => {
  it("대부분의 통화는 1 단위다", () => {
    expect(unitOf("USD")).toBe(1);
    expect(unitOf("EUR")).toBe(1);
    expect(unitLabel("USD")).toBe("1 USD");
  });

  it("JPY 는 100 JPY 단위로 보인다", () => {
    expect(unitOf("JPY")).toBe(100);
    expect(unitLabel("JPY")).toBe("100 JPY");
  });

  it("VND 도 값이 너무 작아 100 단위로 보인다", () => {
    expect(unitOf("VND")).toBe(100);
    expect(unitLabel("VND")).toBe("100 VND");
  });

  it("소문자·공백이 섞여도 통화 코드로 읽는다", () => {
    expect(unitOf(" jpy ")).toBe(100);
    expect(unitLabel("jpy")).toBe("100 JPY");
  });
});

describe("formatRate — 천 단위 구분 소수 2자리", () => {
  it("천 단위 쉼표와 소수 2자리", () => {
    expect(formatRate(1380.123)).toBe("1,380.12");
    expect(formatRate(1234567.891)).toBe("1,234,567.89");
  });

  it("작은 값도 소수 2자리를 채운다", () => {
    expect(formatRate(9.2)).toBe("9.20");
    expect(formatRate(0)).toBe("0.00");
  });

  it("값이 없으면 대시", () => {
    expect(formatRate(null)).toBe("-");
    expect(formatRate(Number.NaN)).toBe("-");
  });
});

describe("formatDiff — 전일 대비 ▲▼", () => {
  it("올랐으면 ▲ 와 up", () => {
    expect(formatDiff(3.5)).toEqual({ dir: "up", text: "▲ 3.50" });
  });

  it("내렸으면 ▼ 와 down(부호 없이 절댓값)", () => {
    expect(formatDiff(-1.2)).toEqual({ dir: "down", text: "▼ 1.20" });
  });

  it("천 단위 쉼표를 쓴다", () => {
    expect(formatDiff(1234.5)).toEqual({ dir: "up", text: "▲ 1,234.50" });
  });

  it("소수 2자리로 반올림해 0 이면 flat 이다", () => {
    expect(formatDiff(0)).toEqual({ dir: "flat", text: "– 0.00" });
    expect(formatDiff(0.004)).toEqual({ dir: "flat", text: "– 0.00" });
    expect(formatDiff(-0.004)).toEqual({ dir: "flat", text: "– 0.00" });
  });

  it("값이 없으면 none 과 대시", () => {
    expect(formatDiff(null)).toEqual({ dir: "none", text: "–" });
    expect(formatDiff(Number.NaN)).toEqual({ dir: "none", text: "–" });
  });
});

describe("toNumber · normalizeDate", () => {
  it("숫자·숫자 문자열은 숫자로, 그 밖은 null", () => {
    expect(toNumber(12.5)).toBe(12.5);
    expect(toNumber("1380.5")).toBe(1380.5);
    expect(toNumber("")).toBeNull();
    expect(toNumber(null)).toBeNull();
    expect(toNumber(undefined)).toBeNull();
    expect(toNumber("abc")).toBeNull();
    expect(toNumber(Number.NaN)).toBeNull();
  });

  it("yyyyMMdd·yyyy-MM-dd 를 yyyy-MM-dd 로 맞춘다", () => {
    expect(normalizeDate("20260930")).toBe("2026-09-30");
    expect(normalizeDate("2026-09-30")).toBe("2026-09-30");
    expect(normalizeDate("2026-09-30T00:00:00")).toBe("2026-09-30");
  });

  it("날짜가 아니면 null", () => {
    expect(normalizeDate("")).toBeNull();
    expect(normalizeDate(null)).toBeNull();
    expect(normalizeDate("2026/09/30")).toBeNull();
    expect(normalizeDate("20261340")).toBeNull();
  });
});

const RESULT: ExchangeResult = {
  latest: [
    { cur: "USD", rate: 1380.5, diff: 3.5, date: "2026-09-30" },
    { cur: "JPY", rate: 9.2, diff: -0.05, date: "2026-09-30" },
    { cur: "EUR", rate: 1510, diff: 0, date: "2026-09-29" },
  ],
  history: [
    { date: "2026-09-30", cur: "USD", rate: 1380.5 },
    { date: "2026-09-29", cur: "USD", rate: 1377 },
    { date: "2026-09-28", cur: "USD", rate: 1370 },
    { date: "2026-09-30", cur: "JPY", rate: 9.2 },
    { date: "2026-09-29", cur: "JPY", rate: 9.25 },
  ],
  stale: false,
  disabled: false,
};

describe("toExchangeRows — 표 행 만들기", () => {
  const rows = toExchangeRows(RESULT, ["USD", "JPY", "EUR", "CNY"]);

  it("설정한 통화 순서대로 한 줄씩 만든다(데이터가 없는 통화도 줄은 남긴다)", () => {
    expect(rows.map((r) => r.cur)).toEqual(["USD", "JPY", "EUR", "CNY"]);
  });

  it("라벨·값 서식은 통화 단위를 따른다", () => {
    expect(rows[0].label).toBe("1 USD");
    expect(rows[0].rateText).toBe("1,380.50");
    expect(rows[0].diffText).toBe("▲ 3.50");
    expect(rows[0].dir).toBe("up");
  });

  it("JPY 는 값·전일 대비·추이 점이 모두 100 배로 보인다", () => {
    expect(rows[1].label).toBe("100 JPY");
    expect(rows[1].rateText).toBe("920.00");
    expect(rows[1].diffText).toBe("▼ 5.00");
    expect(rows[1].dir).toBe("down");
    expect(rows[1].spark).toEqual([925, 920]);
  });

  it("추이 점은 날짜 오름차순이다(서버가 거꾸로 줘도)", () => {
    expect(rows[0].spark).toEqual([1370, 1377, 1380.5]);
  });

  it("전일 대비가 0 이면 flat", () => {
    expect(rows[2].dir).toBe("flat");
    expect(rows[2].diffText).toBe("– 0.00");
    expect(rows[2].spark).toEqual([]);
  });

  it("값이 전혀 없는 통화는 대시로 보인다", () => {
    expect(rows[3]).toMatchObject({ cur: "CNY", label: "1 CNY", rateText: "-", diffText: "–", dir: "none", spark: [], date: null });
  });

  it("기준일은 통화별 최근 날짜", () => {
    expect(rows[0].date).toBe("2026-09-30");
    expect(rows[2].date).toBe("2026-09-29");
  });

  it("latest 에 없고 history 만 있는 통화는 history 마지막 두 값으로 채운다", () => {
    const only: ExchangeResult = {
      latest: [],
      history: [
        { date: "2026-09-29", cur: "GBP", rate: 1800 },
        { date: "2026-09-30", cur: "GBP", rate: 1810 },
      ],
      stale: true,
      disabled: false,
    };
    const [gbp] = toExchangeRows(only, ["GBP"]);
    expect(gbp.rateText).toBe("1,810.00");
    expect(gbp.diffText).toBe("▲ 10.00");
    expect(gbp.date).toBe("2026-09-30");
  });

  it("같은 통화를 두 번 적어도 한 줄이다", () => {
    expect(toExchangeRows(RESULT, ["USD", "usd"]).map((r) => r.cur)).toEqual(["USD"]);
  });
});

describe("latestDateOf", () => {
  it("행들의 기준일 중 가장 늦은 날짜", () => {
    expect(latestDateOf(toExchangeRows(RESULT, ["USD", "EUR"]))).toBe("2026-09-30");
  });

  it("날짜가 하나도 없으면 null", () => {
    expect(latestDateOf(toExchangeRows({ ...RESULT, latest: [], history: [] }, ["USD"]))).toBeNull();
  });
});

describe("날씨 서식", () => {
  it("km/h 를 m/s 로 바꾼다(÷3.6)", () => {
    expect(kmhToMs(18)).toBe(5);
    expect(kmhToMs(10.8)).toBeCloseTo(3, 10);
    expect(kmhToMs(0)).toBe(0);
  });

  it("바람은 m/s 소수 1자리", () => {
    expect(formatWind(18)).toBe("5.0 m/s");
    expect(formatWind(10)).toBe("2.8 m/s");
    expect(formatWind(null)).toBe("-");
  });

  it("기온은 소수 1자리 ℃", () => {
    expect(formatTemp(21.46)).toBe("21.5℃");
    expect(formatTemp(-3)).toBe("-3.0℃");
    expect(formatTemp(null)).toBe("-");
  });

  it("-0.0 은 0.0 으로 보인다", () => {
    expect(formatTemp(-0.04)).toBe("0.0℃");
  });

  it("습도·강수확률은 정수 %", () => {
    expect(formatHumidity(55.4)).toBe("55%");
    expect(formatHumidity(null)).toBe("-");
    expect(formatPop(30)).toBe("30%");
    expect(formatPop(null)).toBe("-");
  });

  it("최저/최고는 정수 도(°)로 줄여 보인다", () => {
    expect(formatRange(12.2, 21.6)).toBe("12° / 22°");
    expect(formatRange(null, 21.6)).toBe("- / 22°");
    expect(formatRange(null, null)).toBe("- / -");
  });

  it("요일은 날짜 문자열로 계산한다(시간대에 흔들리지 않는다)", () => {
    expect(weekdayLabel("2026-10-03")).toBe("토");
    expect(weekdayLabel("2026-10-04")).toBe("일");
    expect(weekdayLabel("2026-10-05")).toBe("월");
    expect(weekdayLabel("2026-10-06")).toBe("화");
    expect(weekdayLabel("2026-10-07")).toBe("수");
    expect(weekdayLabel("2026-10-08")).toBe("목");
    expect(weekdayLabel("2026-10-09")).toBe("금");
  });

  it("날짜가 아니면 빈 문자열", () => {
    expect(weekdayLabel("")).toBe("");
    expect(weekdayLabel("x")).toBe("");
  });
});

describe("formatCollectedAt — 날씨 수집 시각", () => {
  const today = new Date(2026, 9, 9, 13, 0); // 2026-10-09

  it("오늘이면 시각만", () => {
    expect(formatCollectedAt("2026-10-09T12:30", today)).toBe("기준 12:30");
  });

  it("오늘이 아니면 월/일을 붙인다", () => {
    expect(formatCollectedAt("2026-10-08T23:30", today)).toBe("기준 10/8 23:30");
  });

  it("모양이 틀리면 빈 글자", () => {
    expect(formatCollectedAt("", today)).toBe("");
    expect(formatCollectedAt("2026-10-09 12:30", today)).toBe("");
  });
});
