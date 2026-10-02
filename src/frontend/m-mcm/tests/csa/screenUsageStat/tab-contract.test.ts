import { describe, expect, it } from "vitest";

import {
  exportFileName,
  toExportColumns,
} from "@/page-components/csa/screenUsageStat/tabs/tab-contract";
import { TAB_MODULES } from "@/page-components/csa/screenUsageStat/tabs/tab-modules";

import { emptyData } from "./support/query";

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
