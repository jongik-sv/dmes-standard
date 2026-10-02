import { describe, expect, it } from "vitest";

import { statQueryKey } from "@/page-components/csa/screenUsageStat/api";
import {
  DAILY_EXPORT_COLUMNS,
  overviewTab,
  unusedKpiCaption,
} from "@/page-components/csa/screenUsageStat/tabs/overview-tab";

import { installFetchMock } from "./support/fetch-mock";
import { emptyData, query } from "./support/query";

const http = installFetchMock();

describe("개요 탭 조회", () => {
  it("overview 를 부르고 미사용 기준 일수를 숫자로 싣고, 추이 기간을 함께 돌려준다", async () => {
    http.reply({
      meta: { success: true },
      data: { result: { totalOpenCnt: 3, unusedScreenCnt: 2 } },
    });
    const patch = await overviewTab.load(query({ unusedDays: "30" }));
    const { url, body } = http.sent();
    expect(url).toBe("/api/mcm/oasis/screenUsageStat/overview");
    expect(body.params.unusedDays).toBe(30);
    expect(patch.overview?.totalOpenCnt).toBe(3);
    expect(patch.overview?.unusedScreenCnt).toBe(2);
    expect(patch.overview?.daily).toEqual([]);
    expect(patch.overviewRange).toEqual(["2026-09-01", "2026-09-30"]);
  });

  it("미사용 기준 일수를 바꾸면 조건 키가 달라져 개요를 다시 부른다", () => {
    expect(statQueryKey("overview", query({ unusedDays: "30" }))).not.toBe(
      statQueryKey("overview", query({ unusedDays: "60" }))
    );
  });

  it("조회 전 검사로 잘못된 미사용 기준 일수를 막는다(다른 탭에서 입력한 값 포함)", () => {
    expect(overviewTab.check?.(query({ unusedDays: "abc" }))).toMatch(/미사용 기준 일수/);
    expect(overviewTab.check?.(query({ unusedDays: "0" }))).toMatch(/미사용 기준 일수/);
    expect(overviewTab.check?.(query({ unusedDays: "" }))).toBeNull();
    expect(overviewTab.check?.(query({ unusedDays: "30" }))).toBeNull();
  });
});

describe("미사용 KPI 문구", () => {
  it("조회 조건의 기준 일수를 쓰고, 조회 전·빈 값·잘못된 값이면 90", () => {
    expect(unusedKpiCaption(query({ unusedDays: "30" }))).toBe("최근 30일 이용 없음");
    expect(unusedKpiCaption(query({ unusedDays: "" }))).toBe("최근 90일 이용 없음");
    expect(unusedKpiCaption(query({ unusedDays: "abc" }))).toBe("최근 90일 이용 없음");
    expect(unusedKpiCaption(null)).toBe("최근 90일 이용 없음");
  });
});

describe("개요 엑셀", () => {
  it("일별 추이를 내보내고, 조회 전이면 행이 없다", () => {
    const daily = [{ usageDt: "20261001", openCnt: 2, userCnt: 1, durationMs: 60_000 }];
    const overview = {
      totalOpenCnt: 2,
      userCnt: 1,
      totalDurationMs: 60_000,
      unusedScreenCnt: 0,
      daily,
      topScreens: [],
    };
    expect(overviewTab.toExport(emptyData({ overview })).rows).toEqual(daily);
    expect(overviewTab.toExport(emptyData()).rows).toEqual([]);
    expect(DAILY_EXPORT_COLUMNS.map((c) => c.header)).toEqual([
      "일자",
      "열람 횟수",
      "이용자 수",
      "이용 시간",
    ]);
  });
});
