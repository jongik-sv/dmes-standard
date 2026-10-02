import { describe, expect, it } from "vitest";

import {
  deptTab,
  detailAfterFailure,
  loadDeptScreens,
  nextDeptSelection,
} from "@/page-components/csa/screenUsageStat/tabs/dept-tab";
import type { ScreenUsageDeptRow } from "@/page-components/csa/screenUsageStat/types";

import { installFetchMock } from "./support/fetch-mock";
import { emptyData, query } from "./support/query";

const http = installFetchMock();

const dept = (deptCd: string, deptNm: string): ScreenUsageDeptRow => ({
  deptCd,
  deptNm,
  userCnt: 1,
  openCnt: 1,
  durationMs: 60_000,
  topPageId: "old/removedScreen",
  topMenuNm: "(메뉴 없음)",
});

describe("부서별 탭 조회", () => {
  it("byDept 를 부르고 grids.depts 를 depts 로 돌려준다", async () => {
    http.reply({
      meta: { success: true },
      grids: { depts: { rows: [dept("D100", "생산관리팀")] } },
    });
    const patch = await deptTab.load(query());
    expect(http.sent().url).toBe("/api/mcm/oasis/screenUsageStat/byDept");
    expect(patch.depts).toEqual([dept("D100", "생산관리팀")]);
  });

  it("선택 부서의 화면별은 byScreen 에 그 부서코드를 싣는다 — 부서 없음 '-' 도 그대로", async () => {
    http.reply({ meta: { success: true }, grids: { screens: { rows: [{ pageId: "a/b" }] } } });
    const rows = await loadDeptScreens(query({ deptCd: "D100" }), "-");
    const { url, body } = http.sent();
    expect(url).toBe("/api/mcm/oasis/screenUsageStat/byScreen");
    expect(body.params.deptCd).toBe("-");
    expect(rows).toEqual([{ pageId: "a/b" }]);
  });

  it("부서마다 따로 부른다 — 부서를 바꾸면 그 부서코드로 다시 요청한다", async () => {
    http.reply({ meta: { success: true }, grids: { screens: { rows: [] } } });
    http.reply({ meta: { success: true }, grids: { screens: { rows: [] } } });
    await loadDeptScreens(query(), "D100");
    await loadDeptScreens(query(), "D200");
    expect(http.sent(0).body.params.deptCd).toBe("D100");
    expect(http.sent(1).body.params.deptCd).toBe("D200");
  });
});

describe("부서 행 선택", () => {
  it("다른 부서를 고르면 그 부서코드, 같은 부서·빈 코드면 null(다시 부르지 않음)", () => {
    expect(nextDeptSelection({ deptCd: "D100" }, null)).toBe("D100");
    expect(nextDeptSelection({ deptCd: "-" }, "D100")).toBe("-");
    expect(nextDeptSelection({ deptCd: "D100" }, "D100")).toBeNull();
    expect(nextDeptSelection({ deptCd: "" }, null)).toBeNull();
    expect(nextDeptSelection({}, null)).toBeNull();
  });

  it("부서 없음('-', (부서 없음)) 행도 선택할 수 있고 같은 행을 다시 누르면 부르지 않는다", () => {
    const noDept = dept("-", "(부서 없음)");
    expect(nextDeptSelection(noDept as unknown as Record<string, unknown>, null)).toBe("-");
    expect(nextDeptSelection(noDept as unknown as Record<string, unknown>, "-")).toBeNull();
    expect(nextDeptSelection(noDept as unknown as Record<string, unknown>, "D100")).toBe("-");
  });
});

describe("부서 상세 조회 실패", () => {
  it("실패하면 그 부서 선택을 풀어 같은 행 재선택이 요청을 다시 보낸다", () => {
    const detail = { deptCd: "D100", rows: [] };
    expect(nextDeptSelection({ deptCd: "D100" }, detail.deptCd)).toBeNull();
    const after = detailAfterFailure(detail, "D100");
    expect(after).toBeNull();
    expect(nextDeptSelection({ deptCd: "D100" }, after?.deptCd ?? null)).toBe("D100");
  });

  it("다른 부서 선택으로 넘어간 뒤 늦게 실패한 이전 부서는 현재 선택을 건드리지 않는다", () => {
    const detail = { deptCd: "D200", rows: [] };
    expect(detailAfterFailure(detail, "D100")).toBe(detail);
  });
});

describe("부서별 엑셀", () => {
  it("부서 목록을 내보내고 부서 없음·메뉴 없음 문구를 그대로 둔다", () => {
    const target = deptTab.toExport(emptyData({ depts: [dept("-", "(부서 없음)")] }));
    expect(target.rows[0]).toMatchObject({
      deptCd: "-",
      deptNm: "(부서 없음)",
      topMenuNm: "(메뉴 없음)",
    });
    expect(target.columns.map((c) => c.header)).toEqual([
      "부서코드",
      "부서명",
      "이용자 수",
      "열람 횟수",
      "이용 시간",
      "최다 이용 화면",
    ]);
  });
});
