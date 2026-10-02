import { describe, expect, it } from "vitest";

import { toExportRows } from "@/page-components/csa/screenUsageStat/format";
import { userTab } from "@/page-components/csa/screenUsageStat/tabs/user-tab";
import type { ScreenUsageUserGridRow } from "@/page-components/csa/screenUsageStat/types";

import { installFetchMock } from "./support/fetch-mock";
import { emptyData, query } from "./support/query";

const http = installFetchMock();

const user = (over: Partial<ScreenUsageUserGridRow>): ScreenUsageUserGridRow => ({
  userId: "kim",
  userNm: "김철수",
  deptCd: "D100",
  deptNm: "생산관리팀",
  openCnt: 2,
  durationMs: 90_000,
  lastUsedDt: "20261003",
  rowKey: "kim|D100",
  ...over,
});

describe("사용자별 탭 조회", () => {
  it("byUser 를 부르고 행 키를 붙인 users 를 돌려준다", async () => {
    http.reply({
      meta: { success: true },
      grids: { users: { rows: [{ userId: "kim", deptCd: "-" }] } },
    });
    const patch = await userTab.load(query({ deptCd: "-" }));
    const { url, body } = http.sent();
    expect(url).toBe("/api/mcm/oasis/screenUsageStat/byUser");
    expect(body.params.deptCd).toBe("-");
    expect(patch.users?.map((r) => r.rowKey)).toEqual(["kim|-"]);
  });
});

describe("사용자별 엑셀", () => {
  it("부서 없음 사용자는 '(부서 없음)' 그대로, 마지막 이용일은 yyyy-MM-dd, 이용 시간은 읽는 글자", () => {
    const target = userTab.toExport(
      emptyData({ users: [user({ deptCd: "-", deptNm: "(부서 없음)" })] })
    );
    const out = toExportRows(target.rows)[0];
    expect(out.deptNm).toBe("(부서 없음)");
    expect(out.lastUsedDt).toBe("2026-10-03");
    expect(out.durationMs).toBe("1분");
    expect(target.columns.map((c) => c.key)).toEqual([
      "userId",
      "userNm",
      "deptNm",
      "openCnt",
      "durationMs",
      "lastUsedDt",
    ]);
  });
});
