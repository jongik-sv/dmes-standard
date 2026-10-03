// libExcel 순수 함수 — 파일 이름(excelFileName)과 엑셀 컬럼(toExcelColumns). 실제 쓰기(exportToExcel)는 xlsx 가 한다.
import { describe, expect, it } from "vitest";

import { EXCEL_DEFAULT_NAME, excelFileName, toExcelColumns } from "../../src/utils/libExcel";

describe("excelFileName", () => {
  it("제목과 날짜로 만든다", () => {
    expect(excelFileName("내 최근 화면 사용", "20261003")).toBe("내 최근 화면 사용_20261003.xlsx");
  });

  it("파일 이름에 못 쓰는 글자는 _ 로 바꾼다", () => {
    expect(excelFileName('a/b:c*d?"e<f>g|h\\i', "20261003")).toBe("a_b_c_d__e_f_g_h_i_20261003.xlsx");
  });

  it("제목이 없거나 공백뿐이면 기본 이름 「목록」", () => {
    expect(EXCEL_DEFAULT_NAME).toBe("목록");
    expect(excelFileName(undefined, "20261003")).toBe("목록_20261003.xlsx");
    expect(excelFileName("   ", "20261003")).toBe("목록_20261003.xlsx");
  });

  it("기본 이름 인자를 주면 제목이 없을 때 그 이름을 쓰고, 제목이 있으면 제목이 먼저다", () => {
    expect(excelFileName(undefined, "20261003", "쿼리표")).toBe("쿼리표_20261003.xlsx");
    expect(excelFileName(undefined, "20261003", "작업지시")).toBe("작업지시_20261003.xlsx");
    expect(excelFileName("   ", "20261003", "출하")).toBe("출하_20261003.xlsx");
    expect(excelFileName("금일 작업지시 현황", "20261003", "작업지시")).toBe("금일 작업지시 현황_20261003.xlsx");
  });

  it("80자로 자른다", () => {
    expect(excelFileName("가".repeat(100), "20261003")).toBe(`${"가".repeat(80)}_20261003.xlsx`);
  });
});

describe("toExcelColumns", () => {
  it("그리드 컬럼 순서·제목을 따른다", () => {
    const cols = toExcelColumns(
      [
        { key: "SCREEN_NM", header: "화면" },
        { key: "SEC", header: "사용(초)" },
      ],
      [{ SCREEN_NM: "화면 사용 통계", SEC: 58 }]
    );
    expect(cols.map((c) => [c.key, c.header])).toEqual([
      ["SCREEN_NM", "화면"],
      ["SEC", "사용(초)"],
    ]);
  });

  it("뺄 키 목록(선택)에 든 컬럼은 뺀다. 주지 않으면 모두 남긴다", () => {
    const columns = [
      { key: "__rowKey", header: "" },
      { key: "SCREEN_NM", header: "화면" },
      { key: "SEC", header: "사용(초)" },
    ];
    const rows = [{ SCREEN_NM: "화면 사용 통계", SEC: 58 }];
    expect(toExcelColumns(columns, rows, ["__rowKey"]).map((c) => c.key)).toEqual(["SCREEN_NM", "SEC"]);
    expect(toExcelColumns(columns, rows, ["__rowKey", "SEC"]).map((c) => c.key)).toEqual(["SCREEN_NM"]);
    expect(toExcelColumns(columns, rows).map((c) => c.key)).toEqual(["__rowKey", "SCREEN_NM", "SEC"]);
  });

  it("폭은 제목·값 중 넓은 쪽(한글 2칸) + 2, 8~50 사이", () => {
    const cols = toExcelColumns(
      [
        { key: "A", header: "A" },
        { key: "B", header: "화면" },
        { key: "C", header: "C" },
      ],
      [{ A: 1, B: "화면 사용 통계", C: "x".repeat(200) }]
    );
    expect(cols.map((c) => c.width)).toEqual([8, 16, 50]);
  });

  it("겹치는 제목은 뒤 컬럼에 번호를 붙인다(빈 제목이 키로 바뀌어 겹치는 경우 포함)", () => {
    const cols = toExcelColumns(
      [
        { key: "A", header: "값" },
        { key: "B", header: "값" },
        { key: "C", header: "값" },
        { key: "D", header: "E" },
        { key: "E", header: "" },
      ],
      []
    );
    expect(cols.map((c) => c.header)).toEqual(["값", "값(2)", "값(3)", "E", "E(2)"]);
  });

  it("제목이 비면 키를 제목으로 쓴다", () => {
    expect(toExcelColumns([{ key: "VAL", header: "" }], [])[0].header).toBe("VAL");
  });
});
