import { describe, expect, it } from "vitest";

import {
  checkSearch,
  exportFileName,
  toExportColumns,
} from "@/page-components/csa/screenUsageStat/tabs/tab-contract";
import { TAB_MODULES } from "@/page-components/csa/screenUsageStat/tabs/tab-modules";

import { emptyData, query } from "./support/query";

describe("탭 등록표 (슬라이스 병합 뒤에도 성립)", () => {
  it("탭 6개가 모두 load·toExport 를 가진다", () => {
    expect(Object.keys(TAB_MODULES).sort()).toEqual([
      "dept",
      "history",
      "overview",
      "screen",
      "unused",
      "user",
    ]);
    for (const m of Object.values(TAB_MODULES)) {
      expect(typeof m.load).toBe("function");
      expect(typeof m.toExport).toBe("function");
      if (m.check !== undefined) expect(typeof m.check).toBe("function");
    }
  });

  it("조회 전(빈 데이터)에는 어느 탭도 엑셀 행이 없다", () => {
    for (const m of Object.values(TAB_MODULES)) {
      expect(m.toExport(emptyData()).rows).toEqual([]);
    }
  });
});

describe("엑셀 보조", () => {
  it("그리드 열에서 key·header 만 남긴다", () => {
    expect(
      toExportColumns([
        { key: "menuNm", header: "화면명", width: 180, align: "left" },
        { key: "openCnt", header: "열람 횟수", width: 100, align: "right", type: "number" },
      ])
    ).toEqual([
      { key: "menuNm", header: "화면명" },
      { key: "openCnt", header: "열람 횟수" },
    ]);
  });

  it("파일 이름은 화면사용통계_탭이름_일자.xlsx", () => {
    expect(exportFileName("화면별", "20261002")).toBe("화면사용통계_화면별_20261002.xlsx");
  });
});

describe("조회 전 검사 (탭별 미사용 기준 일수)", () => {
  const bad = query({ unusedDays: "abc" });
  const msg = "미사용 기준 일수는 1~3650 사이의 정수여야 합니다.";

  it("화면별 탭에서는 잘못된 unusedDays 도 통과", () => {
    for (const t of ["screen", "dept", "user", "history"] as const) {
      expect(checkSearch(t, bad)).toBeNull();
    }
  });

  it("개요·미사용 탭에서는 경고", () => {
    expect(checkSearch("overview", bad)).toBe(msg);
    expect(checkSearch("unused", bad)).toBe(msg);
  });

  it("기간 검사는 모든 탭에서 한다", () => {
    expect(checkSearch("screen", query({ fromDt: "" }))).toBe("조회 시작일을 입력하세요.");
  });
});
