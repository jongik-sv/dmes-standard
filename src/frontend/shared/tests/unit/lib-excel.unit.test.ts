// libExcel — 파일 이름(excelFileName)·엑셀 컬럼(toExcelColumns) 순수 함수와, exportToExcel 이 만드는 시트의 열 순서.
// exportToExcel 은 실제 xlsx 로 시트를 만들되, 파일로 쓰는 writeFile 만 대역으로 바꿔 만들어진 통합 문서를 받아 본다.
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

const h = vi.hoisted(() => ({ writeFile: vi.fn() }));

vi.mock("xlsx", async (importOriginal) => {
  const actual = await importOriginal<typeof import("xlsx")>();
  return { ...actual, writeFile: h.writeFile };
});

import { EXCEL_DEFAULT_NAME, excelFileName, exportToExcel, toExcelColumns } from "../../src/utils/libExcel";

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

describe("exportToExcel — 시트의 열 순서", () => {
  beforeEach(() => h.writeFile.mockReset());

  /** writeFile 대역이 받은 통합 문서의 첫 시트를 줄 단위 배열(첫 줄 = 제목)로 읽는다. */
  function writtenRows(): unknown[][] {
    expect(h.writeFile).toHaveBeenCalledTimes(1);
    const [workbook] = h.writeFile.mock.calls[0] as [XLSX.WorkBook];
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
  }

  it("columns 가 있으면 제목이 정수 모양(「2026」「1」)이어도 컬럼 정의 순서 그대로 첫 줄에 나온다", async () => {
    const columns = toExcelColumns(
      [
        { key: "item", header: "품목" },
        { key: "y2026", header: "2026" },
        { key: "m1", header: "1" },
      ],
      []
    );
    await exportToExcel([{ item: "철근", y2026: 10, m1: 3 }], "a.xlsx", "Sheet1", columns);
    expect(writtenRows()).toEqual([
      ["품목", "2026", "1"],
      ["철근", 10, 3],
    ]);
  });

  it("columns 가 없으면 행 객체 그대로(필드 이름이 제목, 객체 키 순서)", async () => {
    await exportToExcel([{ a: 1, b: 2 }], "a.xlsx");
    expect(writtenRows()).toEqual([
      ["a", "b"],
      [1, 2],
    ]);
  });

  it("행이 없으면 파일을 만들지 않는다", async () => {
    await exportToExcel([], "a.xlsx", "Sheet1", [{ key: "a", header: "A" }]);
    expect(h.writeFile).not.toHaveBeenCalled();
  });

  it("hidden 컬럼은 값은 그대로 넣고 시트 열 설정(!cols)에서 숨긴 열로 둔다", async () => {
    const columns = toExcelColumns(
      [
        { key: "a", header: "A" },
        { key: "b", header: "B", hidden: true },
        { key: "c", header: "C", hidden: false },
      ],
      [{ a: 1, b: 2, c: 3 }]
    );
    expect(columns.map((c) => c.hidden)).toEqual([undefined, true, undefined]);
    await exportToExcel([{ a: 1, b: 2, c: 3 }], "a.xlsx", "Sheet1", columns);
    expect(writtenRows()).toEqual([
      ["A", "B", "C"],
      [1, 2, 3],
    ]);
    const [workbook] = h.writeFile.mock.calls[0] as [XLSX.WorkBook];
    const cols = workbook.Sheets[workbook.SheetNames[0]]["!cols"]!;
    expect(cols.map((c) => !!c.hidden)).toEqual([false, true, false]);
  });

  it("겹치는 제목은 보이는 컬럼이 먼저 원래 제목을 갖고, 숨긴 컬럼이 번호를 받는다", () => {
    const cols = toExcelColumns(
      [
        { key: "a", header: "값", hidden: true },
        { key: "b", header: "값" },
        { key: "c", header: "값" },
      ],
      []
    );
    expect(cols.map((c) => [c.key, c.header])).toEqual([
      ["a", "값(3)"],
      ["b", "값"],
      ["c", "값(2)"],
    ]);
  });

  it("실제 xlsx 파일로 써서 다시 읽어도 숨긴 열이 남는다(xlsx 0.18.5 커뮤니티판)", async () => {
    const actual = await vi.importActual<typeof import("xlsx")>("xlsx");
    const ws = actual.utils.json_to_sheet([{ A: 1, B: 2 }], { header: ["A", "B"] });
    ws["!cols"] = [{ wch: 10 }, { wch: 10, hidden: true }];
    const wb = actual.utils.book_new();
    actual.utils.book_append_sheet(wb, ws, "Sheet1");
    const buf = actual.write(wb, { type: "buffer", bookType: "xlsx" }) as Uint8Array;
    const back = actual.read(buf, { type: "buffer", cellStyles: true });
    expect(back.Sheets.Sheet1["!cols"]!.map((c) => !!c.hidden)).toEqual([false, true]);
  });
});
