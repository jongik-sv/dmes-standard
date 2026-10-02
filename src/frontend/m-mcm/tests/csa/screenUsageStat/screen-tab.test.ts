import { describe, expect, it } from "vitest";

import { toExportRows } from "@/page-components/csa/screenUsageStat/format";
import { SCREEN_COLUMNS } from "@/page-components/csa/screenUsageStat/tabs/columns";
import { screenTab } from "@/page-components/csa/screenUsageStat/tabs/screen-tab";
import type { ScreenUsageScreenRow } from "@/page-components/csa/screenUsageStat/types";

import { installFetchMock } from "./support/fetch-mock";
import { emptyData, query } from "./support/query";

const http = installFetchMock();

const row = (over: Partial<ScreenUsageScreenRow>): ScreenUsageScreenRow =>
  ({
    pageId: "csa/commUserMng",
    menuNm: "사용자 관리",
    menuPath: "공통관리 > 시스템관리",
    openCnt: 1,
    userCnt: 1,
    durationMs: 60_000,
    avgDurationMs: 60_000,
    lastUsedDt: "20261002",
    ...over,
  }) as ScreenUsageScreenRow;

describe("화면별 탭 조회", () => {
  it("byScreen 을 조회조건 그대로 부르고 grids.screens 를 screens 로 돌려준다", async () => {
    http.reply({ meta: { success: true }, grids: { screens: { rows: [{ pageId: "a/b" }] } } });
    const patch = await screenTab.load(query({ userId: " kim " }));
    const { url, body } = http.sent();
    expect(url).toBe("/api/mcm/oasis/screenUsageStat/byScreen");
    expect(body.params).toEqual({ fromDt: "20260901", toDt: "20260930", userId: "kim" });
    expect(patch).toEqual({ screens: [{ pageId: "a/b" }] });
  });
});

describe("화면별 표시·엑셀", () => {
  it("평균 이용 시간이 null(열람 0회)이면 그리드·엑셀 모두 빈 칸", () => {
    const avg = SCREEN_COLUMNS.find((c) => c.key === "avgDurationMs");
    expect(avg?.render?.(null, {})).toBe("");
    const out = toExportRows([row({ openCnt: 0, avgDurationMs: null as unknown as number })]);
    expect(out[0].avgDurationMs).toBe("");
  });

  it("메뉴 없는 화면은 서버 문구 '(메뉴 없음)' 을 그대로 내보낸다", () => {
    const target = screenTab.toExport(
      emptyData({ screens: [row({ menuNm: "(메뉴 없음)", menuPath: "" })] })
    );
    expect(toExportRows(target.rows)[0].menuNm).toBe("(메뉴 없음)");
  });

  it("엑셀 열은 화면별 그리드 열과 같다", () => {
    const target = screenTab.toExport(emptyData({ screens: [row({})] }));
    expect(target.rows).toHaveLength(1);
    expect(target.columns.map((c) => c.header)).toEqual([
      "화면명",
      "화면 ID",
      "메뉴 경로",
      "열람 횟수",
      "이용자 수",
      "총 이용 시간",
      "평균 이용 시간",
      "마지막 이용일",
    ]);
  });
});
