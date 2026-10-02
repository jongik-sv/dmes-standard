import { describe, expect, it } from "vitest";

import { weatherCodeInfo } from "@/widget-types/_ext/weather-codes";

describe("weatherCodeInfo — WMO 날씨 코드표", () => {
  it("대표 코드를 이름·아이콘으로 바꾼다", () => {
    expect(weatherCodeInfo(0)).toEqual({ name: "맑음", icon: "sun" });
    expect(weatherCodeInfo(2)).toEqual({ name: "구름", icon: "cloud" });
    expect(weatherCodeInfo(45)).toEqual({ name: "안개", icon: "fog" });
    expect(weatherCodeInfo(53)).toEqual({ name: "이슬비", icon: "rain" });
    expect(weatherCodeInfo(63)).toEqual({ name: "비", icon: "rain" });
    expect(weatherCodeInfo(73)).toEqual({ name: "눈", icon: "snow" });
    expect(weatherCodeInfo(81)).toEqual({ name: "소나기", icon: "rain" });
    expect(weatherCodeInfo(85)).toEqual({ name: "소낙눈", icon: "snow" });
    expect(weatherCodeInfo(95)).toEqual({ name: "뇌우", icon: "storm" });
  });

  it("구간 경계: 1~3 구름, 45·48 안개, 51~57 이슬비, 61~67 비, 71~77 눈, 80~82 소나기, 85·86 소낙눈, 95~99 뇌우", () => {
    const names = (codes: number[]) => codes.map((c) => weatherCodeInfo(c).name);
    expect(names([1, 2, 3])).toEqual(["구름", "구름", "구름"]);
    expect(names([45, 48])).toEqual(["안개", "안개"]);
    expect(names([51, 57])).toEqual(["이슬비", "이슬비"]);
    expect(names([61, 67])).toEqual(["비", "비"]);
    expect(names([71, 77])).toEqual(["눈", "눈"]);
    expect(names([80, 82])).toEqual(["소나기", "소나기"]);
    expect(names([85, 86])).toEqual(["소낙눈", "소낙눈"]);
    expect(names([95, 99])).toEqual(["뇌우", "뇌우"]);
  });

  it("구간 바로 밖 코드는 알 수 없음", () => {
    for (const c of [4, 44, 46, 47, 49, 50, 58, 60, 68, 70, 78, 79, 83, 84, 87, 94, 100]) {
      expect(weatherCodeInfo(c)).toEqual({ name: "알 수 없음", icon: "unknown" });
    }
  });

  it("숫자가 아니거나 없으면 알 수 없음", () => {
    expect(weatherCodeInfo(null)).toEqual({ name: "알 수 없음", icon: "unknown" });
    expect(weatherCodeInfo(undefined)).toEqual({ name: "알 수 없음", icon: "unknown" });
    expect(weatherCodeInfo("x")).toEqual({ name: "알 수 없음", icon: "unknown" });
    expect(weatherCodeInfo(Number.NaN)).toEqual({ name: "알 수 없음", icon: "unknown" });
    expect(weatherCodeInfo(2.5)).toEqual({ name: "알 수 없음", icon: "unknown" });
  });

  it("숫자 문자열도 코드로 읽는다", () => {
    expect(weatherCodeInfo("61")).toEqual({ name: "비", icon: "rain" });
  });
});
