import { describe, expect, it } from "vitest";

import {
  HISTORY_MAX_DAYS,
  HISTORY_ROW_LIMIT,
  HISTORY_TRUNCATED_NOTICE,
  checkFilters,
  checkHistoryPeriod,
  formatDuration,
  formatMonthDay,
  formatYmd,
  isHistoryTruncated,
  parseUnusedDays,
  periodDays,
  startKindLabel,
  toDailyPoints,
  toExportRows,
  toTopBars,
  toYmd,
} from "@/page-components/csa/screenUsageStat/format";
import type {
  ScreenUsageDailyRow,
  ScreenUsageTopScreen,
  StatFilters,
} from "@/page-components/csa/screenUsageStat/types";

const MIN = 60_000;
const HOUR = 60 * MIN;

const VALID: StatFilters = {
  fromDt: "2026-09-01",
  toDt: "2026-09-30",
  deptCd: "",
  userId: "",
  pageId: "",
  unusedDays: "90",
};

const daily = (usageDt: string, openCnt: number): ScreenUsageDailyRow => ({
  usageDt,
  openCnt,
  userCnt: 1,
  durationMs: 0,
});

const top = (pageId: string, menuNm: string, openCnt: number): ScreenUsageTopScreen => ({
  pageId,
  menuNm,
  openCnt,
  durationMs: 0,
});

describe("formatDuration", () => {
  it("시간·분으로 적는다", () => {
    expect(formatDuration(HOUR + 2 * MIN)).toBe("1시간 2분");
    expect(formatDuration(2 * HOUR)).toBe("2시간");
    expect(formatDuration(5 * MIN + 59_000)).toBe("5분");
  });

  it("0 은 0분, 1분 미만은 '1분 미만'", () => {
    expect(formatDuration(0)).toBe("0분");
    expect(formatDuration(59_999)).toBe("1분 미만");
    expect(formatDuration(MIN)).toBe("1분");
  });

  it("큰 시간은 천 단위 구분", () => {
    expect(formatDuration(1234 * HOUR + 5 * MIN)).toBe("1,234시간 5분");
  });

  it("숫자 문자열도 받고, 값 없음·음수·NaN 은 빈 문자열", () => {
    expect(formatDuration("3720000")).toBe("1시간 2분");
    expect(formatDuration(null)).toBe("");
    expect(formatDuration(undefined)).toBe("");
    expect(formatDuration(-1)).toBe("");
    expect(formatDuration(Number.NaN)).toBe("");
  });
});

describe("날짜 표기", () => {
  it("yyyyMMdd → yyyy-MM-dd, 비면 빈 문자열, 형식이 다르면 그대로", () => {
    expect(formatYmd("20261002")).toBe("2026-10-02");
    expect(formatYmd(null)).toBe("");
    expect(formatYmd("")).toBe("");
    expect(formatYmd("2026-10-02")).toBe("2026-10-02");
  });

  it("차트 라벨은 MM/dd", () => {
    expect(formatMonthDay("20261002")).toBe("10/02");
  });

  it("DatePicker 값 yyyy-MM-dd → 서버 yyyyMMdd", () => {
    expect(toYmd("2026-10-02")).toBe("20261002");
  });

  it("기간 일수 = 종료 - 시작(두 형식 모두), 형식이 틀리면 NaN", () => {
    expect(periodDays("2026-10-01", "2026-11-01")).toBe(31);
    expect(periodDays("20261001", "20261001")).toBe(0);
    expect(periodDays("2026-10-02", "2026-10-01")).toBe(-1);
    expect(periodDays("", "2026-10-01")).toBeNaN();
  });
});

describe("이용 이력 기간 경계 (메인 결정 5: 시작·종료일 포함 31일, 날짜 차 ≤ 30)", () => {
  it("31일 포함(날짜 차 30)은 통과", () => {
    expect(HISTORY_MAX_DAYS).toBe(31);
    expect(checkHistoryPeriod("2026-10-01", "2026-10-31")).toBeNull();
    // 월을 넘겨도 포함 31일이면 통과 (10/02 ~ 11/01)
    expect(checkHistoryPeriod("2026-10-02", "2026-11-01")).toBeNull();
  });

  it("32일 포함(날짜 차 31)은 안내 문구로 막는다", () => {
    expect(checkHistoryPeriod("2026-10-01", "2026-11-01")).toBe(
      "이용 이력 조회 기간은 31일 이하여야 합니다."
    );
  });

  it("하루짜리 기간은 통과", () => {
    expect(checkHistoryPeriod("2026-10-01", "2026-10-01")).toBeNull();
  });
});

describe("이용 이력 10,000행 안내 (메인 결정 6)", () => {
  it("정확히 10,000행이면 잘린 것으로 보고 안내한다", () => {
    expect(HISTORY_ROW_LIMIT).toBe(10_000);
    expect(isHistoryTruncated(10_000)).toBe(true);
    expect(isHistoryTruncated(9_999)).toBe(false);
    expect(HISTORY_TRUNCATED_NOTICE).toBe("최근 10,000건만 표시됩니다. 기간을 줄여 조회하세요.");
  });
});

describe("조회조건 검사", () => {
  it("문제가 없으면 null", () => {
    expect(checkFilters(VALID)).toBeNull();
    expect(checkFilters({ ...VALID, unusedDays: "" })).toBeNull();
  });

  it("기간 누락·역전", () => {
    expect(checkFilters({ ...VALID, fromDt: "" })).toBe("조회 시작일을 입력하세요.");
    expect(checkFilters({ ...VALID, toDt: "" })).toBe("조회 종료일을 입력하세요.");
    expect(checkFilters({ ...VALID, fromDt: "2026-10-02", toDt: "2026-10-01" })).toBe(
      "시작일이 종료일보다 늦을 수 없습니다."
    );
  });

  it("미사용 기준 일수는 1~3650 정수", () => {
    const msg = "미사용 기준 일수는 1~3650 사이의 정수여야 합니다.";
    expect(checkFilters({ ...VALID, unusedDays: "0" })).toBe(msg);
    expect(checkFilters({ ...VALID, unusedDays: "abc" })).toBe(msg);
  });

  it("parseUnusedDays: 비면 90, 범위·정수 밖이면 null", () => {
    expect(parseUnusedDays("")).toBe(90);
    expect(parseUnusedDays(" 30 ")).toBe(30);
    expect(parseUnusedDays("3650")).toBe(3650);
    expect(parseUnusedDays("3651")).toBeNull();
    expect(parseUnusedDays("1.5")).toBeNull();
    expect(parseUnusedDays("-1")).toBeNull();
  });
});

describe("차트 변환", () => {
  it("이용이 없는 날은 0 으로 채운다", () => {
    const points = toDailyPoints(
      [daily("20261001", 3), daily("20261003", 5)],
      "2026-10-01",
      "2026-10-03",
      "20991231"
    );
    expect(points).toEqual([
      { label: "10/01", value: 3 },
      { label: "10/02", value: 0 },
      { label: "10/03", value: 5 },
    ]);
  });

  it("월 경계를 넘어 이어진다", () => {
    const points = toDailyPoints([], "2026-09-30", "2026-10-01", "20991231");
    expect(points.map((p) => p.label)).toEqual(["09/30", "10/01"]);
  });

  it("기간이 틀리면 받은 행을 일자 순으로만 그린다", () => {
    const points = toDailyPoints(
      [daily("20261003", 5), daily("20261001", 3)],
      "",
      "2026-10-03",
      "20991231"
    );
    expect(points).toEqual([
      { label: "10/01", value: 3 },
      { label: "10/03", value: 5 },
    ]);
  });

  it("종료일이 미래면 오늘까지만 채운다(서버처럼 — 선 끝에 0 꼬리가 붙어 급락처럼 보이지 않게)", () => {
    const points = toDailyPoints([daily("20261001", 3)], "2026-09-30", "2026-10-05", "20261002");
    expect(points).toEqual([
      { label: "09/30", value: 0 },
      { label: "10/01", value: 3 },
      { label: "10/02", value: 0 },
    ]);
  });

  it("오늘이 종료일보다 뒤면 종료일까지 그대로 채운다", () => {
    const points = toDailyPoints([], "2026-09-30", "2026-10-01", "20261015");
    expect(points.map((p) => p.label)).toEqual(["09/30", "10/01"]);
  });

  it("시작일도 미래면 그릴 날이 없다", () => {
    expect(toDailyPoints([], "2026-10-05", "2026-10-07", "20261002")).toEqual([]);
  });

  it("메뉴 없는 화면·같은 이름 화면이 겹쳐도 막대 라벨은 유일하고 '(메뉴 없음)' 은 그대로 보인다", () => {
    const bars = toTopBars(
      [
        top("a/x", "(메뉴 없음)", 5),
        top("b/y", "(메뉴 없음)", 3),
        top("c/z", "사용자 관리", 2),
        top("d/w", "사용자 관리", 1),
        top("e/v", "메뉴 관리", 1),
        top("f/u", "", 1),
      ],
      "var(--color-chart-1)"
    );
    expect(bars.map((b) => b.label)).toEqual([
      "(메뉴 없음) (a/x)",
      "(메뉴 없음) (b/y)",
      "사용자 관리 (c/z)",
      "사용자 관리 (d/w)",
      "메뉴 관리",
      "f/u",
    ]);
    expect(new Set(bars.map((b) => b.label)).size).toBe(bars.length);
    expect(bars[0]).toEqual({
      label: "(메뉴 없음) (a/x)",
      value: 5,
      color: "var(--color-chart-1)",
    });
  });

  it("메뉴 없는 화면이 하나뿐이면 '(메뉴 없음)' 그대로", () => {
    const bars = toTopBars(
      [top("a/x", "(메뉴 없음)", 5), top("c/z", "사용자 관리", 2)],
      "var(--color-chart-1)"
    );
    expect(bars.map((b) => b.label)).toEqual(["(메뉴 없음)", "사용자 관리"]);
  });
});

describe("엑셀 변환", () => {
  it("이용 시간·일자·구분을 읽는 글자로 바꾸고 원본은 그대로 둔다", () => {
    const row = {
      menuNm: "사용자 관리",
      durationMs: HOUR + 2 * MIN,
      avgDurationMs: MIN,
      lastUsedDt: "20261002",
      usageDt: "20261001",
      startKind: "OPEN",
    };
    expect(toExportRows([row])).toEqual([
      {
        menuNm: "사용자 관리",
        durationMs: "1시간 2분",
        avgDurationMs: "1분",
        lastUsedDt: "2026-10-02",
        usageDt: "2026-10-01",
        startKind: "열람",
      },
    ]);
    expect(row.durationMs).toBe(HOUR + 2 * MIN);
  });

  it("구분 라벨, 모르는 값은 그대로", () => {
    expect(startKindLabel("SWITCH")).toBe("계속");
    expect(startKindLabel("RESUME")).toBe("계속");
    expect(startKindLabel("X")).toBe("X");
  });
});
