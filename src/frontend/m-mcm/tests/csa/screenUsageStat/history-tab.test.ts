import { describe, expect, it } from "vitest";

import { toExportRows } from "@/page-components/csa/screenUsageStat/format";
import {
  HISTORY_ROW_LIMIT,
  historyLimitNotice,
  historyTab,
} from "@/page-components/csa/screenUsageStat/tabs/history-tab";

import { installFetchMock } from "./support/fetch-mock";
import { emptyData, query } from "./support/query";

const http = installFetchMock();

describe("이용 이력 기간 검사 (시작·종료일 포함 31일)", () => {
  it("31일은 통과, 32일은 조회 전에 막는다", () => {
    expect(historyTab.check?.(query({ fromDt: "2026-10-01", toDt: "2026-10-31" }))).toBeNull();
    expect(historyTab.check?.(query({ fromDt: "2026-10-03", toDt: "2026-10-03" }))).toBeNull();
    expect(historyTab.check?.(query({ fromDt: "2026-10-01", toDt: "2026-11-01" }))).toEqual(
      expect.any(String)
    );
  });
});

describe("이용 이력 조회", () => {
  it("history 를 부르고 grids.history 를 history 로 돌려준다", async () => {
    http.reply({ meta: { success: true }, grids: { history: { rows: [{ usageId: "u1" }] } } });
    const patch = await historyTab.load(query());
    expect(http.sent().url).toBe("/api/mcm/oasis/screenUsageStat/history");
    expect(patch).toEqual({ history: [{ usageId: "u1" }] });
  });

  it("서버 거절(meta.success=false)은 서버 문구 그대로 던진다", async () => {
    http.reply({
      meta: {
        success: false,
        message: "이용 이력은 시작·종료일 포함 31일까지 조회할 수 있습니다.",
      },
    });
    await expect(historyTab.load(query())).rejects.toThrow(
      "이용 이력은 시작·종료일 포함 31일까지 조회할 수 있습니다."
    );
  });
});

describe("10,000행 안내", () => {
  it("10,000행을 받으면 안내, 그보다 적으면 없음", () => {
    expect(HISTORY_ROW_LIMIT).toBe(10_000);
    expect(historyLimitNotice(10_000)).toBe("최근 10,000건만 표시됩니다. 기간을 줄여 조회하세요.");
    expect(historyLimitNotice(9_999)).toBeNull();
    expect(historyLimitNotice(0)).toBeNull();
  });
});

describe("이용 이력 엑셀", () => {
  it("시작 사유는 글자로, 이용 시간은 읽는 글자로, 부서 없음·메뉴 없음은 그대로", () => {
    const row = {
      usageId: "u1",
      startedAt: "2026-10-02 09:00:05",
      endedAt: "2026-10-02 09:01:06",
      durationMs: 61_000,
      startKind: "SWITCH",
      userId: "kim",
      userNm: "김철수",
      deptCd: "-",
      deptNm: "(부서 없음)",
      menuNm: "(메뉴 없음)",
      pageId: "old/x",
      clientIp: null,
    };
    const target = historyTab.toExport(emptyData({ history: [row as never] }));
    const out = toExportRows(target.rows)[0];
    expect(out.startKind).toBe("전환");
    expect(out.durationMs).toBe("1분");
    expect(out.deptNm).toBe("(부서 없음)");
    expect(out.menuNm).toBe("(메뉴 없음)");
    expect(target.columns.map((c) => c.header)).toEqual([
      "시작",
      "종료",
      "이용 시간",
      "시작 사유",
      "사용자 ID",
      "사용자명",
      "부서",
      "화면명",
      "화면 ID",
      "IP",
    ]);
  });
});
