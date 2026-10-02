import { describe, expect, it } from "vitest";

import { lastUsedText, unusedTab } from "@/page-components/csa/screenUsageStat/tabs/unused-tab";

import { installFetchMock } from "./support/fetch-mock";
import { emptyData, query } from "./support/query";

const http = installFetchMock();

describe("미사용 화면 탭 조회", () => {
  it("unused 를 부르고 기준 일수가 비면 키를 빼 서버 기본 90 을 쓴다", async () => {
    http.reply({
      meta: { success: true },
      grids: { unused: { rows: [{ pageId: "a/b", lastUsedDt: null }] } },
    });
    const patch = await unusedTab.load(query({ unusedDays: "" }));
    const { url, body } = http.sent();
    expect(url).toBe("/api/mcm/oasis/screenUsageStat/unused");
    expect("unusedDays" in body.params).toBe(false); // 빈 값은 키를 뺀다(서버 기본 90)
    expect(patch.unused).toEqual([{ pageId: "a/b", lastUsedDt: null }]);
  });

  it("기준 일수 30 은 숫자 30 으로 보낸다", async () => {
    http.reply({ meta: { success: true }, grids: { unused: { rows: [] } } });
    await unusedTab.load(query({ unusedDays: "30" }));
    expect(http.sent().body.params.unusedDays).toBe(30);
  });
});

describe("마지막 이용일 표시", () => {
  it("기록이 없으면 '기록 없음', 있으면 yyyy-MM-dd", () => {
    expect(lastUsedText(null)).toBe("기록 없음");
    expect(lastUsedText("")).toBe("기록 없음");
    expect(lastUsedText("20260705")).toBe("2026-07-05");
  });
});

describe("미사용 화면 엑셀", () => {
  it("미사용 목록을 화면명·화면 ID·메뉴 경로·마지막 이용일 열로 내보낸다", () => {
    const rows = [{ pageId: "a/b", menuNm: "메뉴 관리", menuPath: "공통관리", lastUsedDt: null }];
    const target = unusedTab.toExport(emptyData({ unused: rows }));
    expect(target.rows).toEqual(rows);
    expect(target.columns.map((c) => c.header)).toEqual([
      "화면명",
      "화면 ID",
      "메뉴 경로",
      "마지막 이용일",
    ]);
  });
});

describe("미사용 화면 탭 조회 전 검사", () => {
  it("잘못된 기준 일수는 경고 문구로 막는다", () => {
    expect(unusedTab.check?.(query({ unusedDays: "abc" }))).toContain("미사용 기준 일수");
    expect(unusedTab.check?.(query({ unusedDays: "0" }))).toContain("미사용 기준 일수");
    expect(unusedTab.check?.(query({ unusedDays: "1.5" }))).toContain("미사용 기준 일수");
  });

  it("올바른 값이나 빈 값(기본 90)은 통과한다", () => {
    expect(unusedTab.check?.(query({ unusedDays: "" }))).toBeNull();
    expect(unusedTab.check?.(query({ unusedDays: "30" }))).toBeNull();
  });
});
