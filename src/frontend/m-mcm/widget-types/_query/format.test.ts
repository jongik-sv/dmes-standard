import { describe, expect, it } from "vitest";

import {
  barChartHeight,
  chartColor,
  chartConfigOf,
  configText,
  fieldOptions,
  formatCell,
  formatDate,
  formatNumber,
  formatPercent,
  lineChartHeight,
  MAX_NUMBER_TILES,
  moveItem,
  normalizeQueryResult,
  numberConfigOf,
  patchConfig,
  pieChartSize,
  previewOf,
  QUERY_EMPTY,
  QUERY_LOAD_ERROR,
  removeAt,
  summarizeResult,
  SYSTEM_VARIABLES,
  TABLE_ROW_KEY,
  tableConfigOf,
  textCell,
  intCell,
  appendMissingFields,
  truncatedNote,
  toChartData,
  toColumnDefs,
  toGridRows,
  toLinePoints,
  toNumber,
  toNumberTiles,
  toPieSlices,
  updateAt,
  validateQueryConfig,
} from "./format";

describe("문구 상수", () => {
  it("스펙·계획 문구를 그대로 쓴다", () => {
    expect(QUERY_LOAD_ERROR).toBe("위젯 데이터를 불러오지 못했습니다");
    expect(QUERY_EMPTY).toBe("표시할 데이터가 없습니다");
    expect(truncatedNote(500)).toBe("상위 500행만 표시합니다");
  });

  it("잘림 안내는 받은 행 수를 쓴다(관리 화면 미리보기는 50행)", () => {
    expect(truncatedNote(50)).toBe("상위 50행만 표시합니다");
  });

  it("시스템 변수 안내는 §7.2 의 여섯 개다", () => {
    expect(SYSTEM_VARIABLES.map((v) => v.name)).toEqual([
      ":userId",
      ":deptCd",
      ":today",
      ":yesterday",
      ":monthStart",
      ":now",
    ]);
  });
});

describe("toNumber", () => {
  it("숫자와 숫자 문자열만 숫자로 바꾼다", () => {
    expect(toNumber(12)).toBe(12);
    expect(toNumber(" 3.5 ")).toBe(3.5);
    expect(toNumber("-7")).toBe(-7);
    expect(toNumber("1,234")).toBe(1234);
  });

  it("빈 값·글자·불리언·무한대는 null", () => {
    expect(toNumber(null)).toBeNull();
    expect(toNumber(undefined)).toBeNull();
    expect(toNumber("")).toBeNull();
    expect(toNumber("  ")).toBeNull();
    expect(toNumber("abc")).toBeNull();
    expect(toNumber(true)).toBeNull();
    expect(toNumber(Number.POSITIVE_INFINITY)).toBeNull();
    expect(toNumber(Number.NaN)).toBeNull();
  });
});

describe("formatNumber", () => {
  it("천 단위로 구분한다", () => {
    expect(formatNumber(1234567)).toBe("1,234,567");
    expect(formatNumber("9876.5")).toBe("9,876.5");
    expect(formatNumber(-1200)).toBe("-1,200");
    expect(formatNumber(0)).toBe("0");
  });

  it("숫자가 아니면 글자 그대로, 빈 값은 빈 글자", () => {
    expect(formatNumber("N/A")).toBe("N/A");
    expect(formatNumber(null)).toBe("");
    expect(formatNumber(undefined)).toBe("");
  });
});

describe("formatPercent", () => {
  it("값을 백분율 수치로 보고 소수 1자리 + % 로 쓴다", () => {
    expect(formatPercent(12.345)).toBe("12.3%");
    expect(formatPercent("98")).toBe("98.0%");
    expect(formatPercent(1234.56)).toBe("1,234.6%");
    expect(formatPercent(0)).toBe("0.0%");
  });

  it("숫자가 아니면 글자 그대로, 빈 값은 빈 글자", () => {
    expect(formatPercent("없음")).toBe("없음");
    expect(formatPercent(null)).toBe("");
  });
});

describe("formatDate", () => {
  it("yyyy-MM-dd 로 쓴다", () => {
    expect(formatDate("2026-10-02T09:30:00")).toBe("2026-10-02");
    expect(formatDate("2026-10-02")).toBe("2026-10-02");
    expect(formatDate("20261002")).toBe("2026-10-02");
    expect(formatDate("20261002093000")).toBe("2026-10-02");
    expect(formatDate("2026/1/5")).toBe("2026-01-05");
    expect(formatDate("2026.10.02 12:00")).toBe("2026-10-02");
  });

  it("숫자는 epoch 밀리초로 보고 그 지역 날짜를 쓴다", () => {
    expect(formatDate(new Date(2026, 9, 2, 23, 59).getTime())).toBe("2026-10-02");
  });

  it("날짜가 아니면 글자 그대로, 빈 값은 빈 글자", () => {
    expect(formatDate("어제")).toBe("어제");
    expect(formatDate(null)).toBe("");
    expect(formatDate("")).toBe("");
  });
});

describe("formatCell", () => {
  it("형식별로 쓴다", () => {
    expect(formatCell(1234, "number")).toBe("1,234");
    expect(formatCell("20261002", "date")).toBe("2026-10-02");
    expect(formatCell(1234, "text")).toBe("1234");
    expect(formatCell(1234)).toBe("1234");
    expect(formatCell(null, "text")).toBe("");
    expect(formatCell(true)).toBe("true");
  });
});

describe("normalizeQueryResult", () => {
  it("컬럼은 문자열 목록, {name} 목록 둘 다 받는다", () => {
    expect(normalizeQueryResult({ columns: ["A", "B"], rows: [{ A: 1, B: 2 }], truncated: false })).toEqual({
      columns: ["A", "B"],
      rows: [{ A: 1, B: 2 }],
      truncated: false,
    });
    expect(normalizeQueryResult({ columns: [{ name: "A" }, { name: "B" }], rows: [], truncated: true })).toEqual({
      columns: ["A", "B"],
      rows: [],
      truncated: true,
    });
  });

  it("컬럼이 없으면 첫 행의 키로 채우고, 깨진 값은 빈 결과로 둔다", () => {
    expect(normalizeQueryResult({ rows: [{ X: 1, Y: "a" }] }).columns).toEqual(["X", "Y"]);
    expect(normalizeQueryResult(null)).toEqual({ columns: [], rows: [], truncated: false });
    expect(normalizeQueryResult({ columns: "A", rows: "x", truncated: "Y" })).toEqual({
      columns: [],
      rows: [],
      truncated: false,
    });
  });

  it("객체가 아닌 행은 버린다", () => {
    expect(normalizeQueryResult({ columns: ["A"], rows: [{ A: 1 }, null, 3, [1]] }).rows).toEqual([{ A: 1 }]);
  });
});

describe("previewOf", () => {
  it("definition.__preview 가 있으면 그 결과를 쓴다(서버를 부르지 않는 경로)", () => {
    const def = { sql: "", columns: [], __preview: { columns: ["A"], rows: [{ A: 1 }], truncated: true } };
    expect(previewOf(def)).toEqual({ columns: ["A"], rows: [{ A: 1 }], truncated: true });
  });

  it("__preview 가 없거나 객체가 아니면 null", () => {
    expect(previewOf({ sql: "SELECT 1" })).toBeNull();
    expect(previewOf({ __preview: null })).toBeNull();
    expect(previewOf({ __preview: "x" })).toBeNull();
    expect(previewOf(null)).toBeNull();
    expect(previewOf("x")).toBeNull();
  });
});

describe("summarizeResult", () => {
  it("행 수와 컬럼 목록을 쓴다", () => {
    expect(summarizeResult({ columns: ["A", "B"], rows: [{}, {}, {}], truncated: false })).toBe("3행 · 컬럼: A, B");
  });

  it("잘렸으면 앞 n행만 받았다고 쓴다", () => {
    const rows = Array.from({ length: 50 }, () => ({}));
    expect(summarizeResult({ columns: ["A"], rows, truncated: true })).toBe("50행 넘음(앞 50행만 받음) · 컬럼: A");
  });

  it("컬럼이 없으면 없다고 쓴다", () => {
    expect(summarizeResult({ columns: [], rows: [], truncated: false })).toBe("0행 · 컬럼 없음");
  });
});

describe("설정 읽기", () => {
  it("표 설정 — 기본값과 컬럼 정리(필드 공백 제거, 폭은 양의 정수, 정렬·형식은 허용 값만)", () => {
    expect(tableConfigOf(null)).toEqual({ sql: "", columns: [] });
    expect(
      tableConfigOf({
        sql: "SELECT 1",
        columns: [
          { field: " A ", header: "에이", width: 120.4, align: "right", format: "number" },
          { field: "B", width: -3, align: "middle", format: "money" },
          { field: "C", width: "80" },
          "x",
          null,
        ],
      })
    ).toEqual({
      sql: "SELECT 1",
      columns: [
        { field: "A", header: "에이", width: 120, align: "right", format: "number" },
        { field: "B" },
        { field: "C", width: 80 },
      ],
    });
  });

  it("차트 설정 — 모르는 종류는 bar, 계열은 필드·라벨만", () => {
    expect(chartConfigOf(undefined)).toEqual({ sql: "", chartType: "bar", xField: "", series: [] });
    expect(
      chartConfigOf({
        sql: "S",
        chartType: "pie",
        xField: "MON",
        series: [{ field: "QTY", label: "수량" }, { field: "AMT" }, 3],
      })
    ).toEqual({
      sql: "S",
      chartType: "pie",
      xField: "MON",
      series: [{ field: "QTY", label: "수량" }, { field: "AMT" }],
    });
    expect(chartConfigOf({ chartType: "radar" }).chartType).toBe("bar");
  });

  it("숫자 설정 — 형식은 number·percent, 빈 단위는 빼고 둔다", () => {
    expect(numberConfigOf({})).toEqual({ sql: "", labelField: "", valueField: "", format: "number" });
    expect(
      numberConfigOf({ sql: "S", labelField: "L", valueField: "V", unitField: "U", unit: "t", format: "percent" })
    ).toEqual({ sql: "S", labelField: "L", valueField: "V", unitField: "U", unit: "t", format: "percent" });
    expect(numberConfigOf({ unitField: "", unit: "", format: "money" })).toEqual({
      sql: "",
      labelField: "",
      valueField: "",
      format: "number",
    });
  });

  it("configText — 입력 칸용 원래 글자(공백을 지우지 않아 「생산 실적」 같은 이름을 칠 수 있다)", () => {
    expect(configText({ unit: "천 " }, "unit")).toBe("천 ");
    expect(configText({ unit: 3 }, "unit")).toBe("");
    expect(configText(null, "unit")).toBe("");
  });

  it("patchConfig 는 다른 키(__preview 포함)를 지키며 덮는다", () => {
    const prev = { sql: "A", columns: [], __preview: { columns: [], rows: [], truncated: false } };
    expect(patchConfig(prev, { sql: "B" })).toEqual({ ...prev, sql: "B" });
    expect(patchConfig(null, { sql: "B" })).toEqual({ sql: "B" });
    expect(patchConfig(["x"], { sql: "B" })).toEqual({ sql: "B" });
  });
});

describe("toColumnDefs", () => {
  const rows = [{ A: 1500, B: "x", C: "20261002" }];

  it("columns 설정이 없으면 결과 컬럼 전부(숫자 컬럼은 오른쪽 정렬)", () => {
    const defs = toColumnDefs(["A", "B", "C"], { sql: "", columns: [] }, rows);
    expect(defs.map((d) => [d.key, d.header, d.align])).toEqual([
      ["A", "A", "right"],
      ["B", "B", undefined],
      ["C", "C", undefined],
    ]);
    expect(defs.every((d) => d.width === 100 && d.minWidth === 60)).toBe(true);
    expect(defs[0].render).toBeUndefined();
  });

  it("columns 설정이 있으면 그 순서·머리글·폭·정렬·형식을 쓴다", () => {
    const defs = toColumnDefs(
      ["A", "B", "C"],
      {
        sql: "",
        columns: [
          { field: "C", header: "일자", format: "date", align: "center" },
          { field: "A", header: "수량", width: 140, format: "number" },
        ],
      },
      rows
    );
    expect(defs.map((d) => [d.key, d.header, d.width, d.align])).toEqual([
      ["C", "일자", 100, "center"],
      ["A", "수량", 140, "right"],
    ]);
    expect(defs[0].render?.("20261002", {})).toBe("2026-10-02");
    expect(defs[1].render?.(1500, {})).toBe("1,500");
    expect(defs[1].minWidth).toBeUndefined();
  });

  it("머리글이 비면 필드 이름을 쓴다", () => {
    expect(toColumnDefs([], { sql: "", columns: [{ field: "Z" }] })[0].header).toBe("Z");
  });
});

describe("toGridRows", () => {
  it("행마다 순번 키를 붙인다(결과에 id 컬럼이 없어도 그리드 행이 겹치지 않게)", () => {
    expect(toGridRows([{ A: 1 }, { A: 2 }])).toEqual([
      { A: 1, [TABLE_ROW_KEY]: "0" },
      { A: 2, [TABLE_ROW_KEY]: "1" },
    ]);
  });
});

describe("차트 변환", () => {
  const rows = [
    { MON: "1월", QTY: 10, AMT: "1,000" },
    { MON: "2월", QTY: "20", AMT: null },
    { MON: null, QTY: "x", AMT: 5 },
  ];

  it("toChartData — xField 가 가로축, 계열 값은 숫자(숫자가 아니면 0)", () => {
    expect(toChartData(rows, "MON", [{ field: "QTY", label: "수량" }, { field: "AMT" }])).toEqual({
      categories: ["1월", "2월", ""],
      series: [
        { key: "QTY", label: "수량", values: [10, 20, 0] },
        { key: "AMT", label: "AMT", values: [1000, 0, 5] },
      ],
    });
  });

  it("필드가 빈 계열은 뺀다", () => {
    expect(toChartData(rows, "MON", [{ field: "" }]).series).toEqual([]);
  });

  it("색은 --color-chart-1 … 5 를 돌려 쓴다", () => {
    expect(chartColor(0)).toBe("var(--color-chart-1)");
    expect(chartColor(4)).toBe("var(--color-chart-5)");
    expect(chartColor(5)).toBe("var(--color-chart-1)");
  });

  it("toLinePoints — 계열 하나를 {label, value} 로", () => {
    const data = toChartData(rows, "MON", [{ field: "QTY" }, { field: "AMT" }]);
    expect(toLinePoints(data, 1)).toEqual([
      { label: "1월", value: 1000 },
      { label: "2월", value: 0 },
      { label: "", value: 5 },
    ]);
    expect(toLinePoints(data, 9)).toEqual([]);
  });

  it("toPieSlices — 첫 계열만, 항목마다 색", () => {
    const data = toChartData(rows, "MON", [{ field: "QTY" }, { field: "AMT" }]);
    expect(toPieSlices(data)).toEqual([
      { label: "1월", value: 10, color: "var(--color-chart-1)" },
      { label: "2월", value: 20, color: "var(--color-chart-2)" },
      { label: "", value: 0, color: "var(--color-chart-3)" },
    ]);
    expect(toPieSlices({ categories: [], series: [] })).toEqual([]);
  });

  it("크기 — 본문 높이에 맞추고, 높이를 모르면 기본값", () => {
    expect(barChartHeight(null)).toBe(230);
    expect(barChartHeight(300)).toBe(274);
    expect(barChartHeight(100)).toBe(120);
    expect(lineChartHeight(null, 1)).toBe(250);
    expect(lineChartHeight(300, 1)).toBe(300);
    expect(lineChartHeight(300, 3)).toBe(140);
    expect(pieChartSize({ width: 0, height: null })).toBe(180);
    expect(pieChartSize({ width: 400, height: 200 })).toBe(192);
    expect(pieChartSize({ width: 200, height: 400 })).toBe(100);
    expect(pieChartSize({ width: 2000, height: 2000 })).toBe(320);
  });
});

describe("toNumberTiles", () => {
  const rows = [
    { NM: "생산", V: 1234.5, U: "t" },
    { NM: "가동률", V: "97.25", U: "" },
    { NM: null, V: null, U: null },
  ];

  it("행마다 타일 — 라벨·값(천 단위)·단위(unitField 값, 없으면 unit)", () => {
    expect(toNumberTiles(rows, { sql: "", labelField: "NM", valueField: "V", unitField: "U", unit: "개", format: "number" })).toEqual([
      { key: "0", label: "생산", value: "1,234.5", unit: "t" },
      { key: "1", label: "가동률", value: "97.25", unit: "개" },
      { key: "2", label: "", value: "-", unit: "개" },
    ]);
  });

  it("percent 는 소수 1자리 + %", () => {
    expect(toNumberTiles(rows.slice(1, 2), { sql: "", labelField: "NM", valueField: "V", format: "percent" })).toEqual([
      { key: "0", label: "가동률", value: "97.3%" },
    ]);
  });

  it("타일은 최대 8개", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ NM: `n${i}`, V: i }));
    expect(MAX_NUMBER_TILES).toBe(8);
    expect(toNumberTiles(many, { sql: "", labelField: "NM", valueField: "V", format: "number" })).toHaveLength(8);
  });
});

describe("validateQueryConfig", () => {
  it("SQL 이 비면 「SQL 을 입력하세요」", () => {
    expect(validateQueryConfig("query-table", { sql: "  ", columns: [] })).toEqual(["SQL 을 입력하세요"]);
    expect(validateQueryConfig("query-table", null)).toEqual(["SQL 을 입력하세요"]);
  });

  it("표 — SQL 만 있으면 통과, 필드가 빈 컬럼은 거절", () => {
    expect(validateQueryConfig("query-table", { sql: "SELECT 1", columns: [] })).toEqual([]);
    expect(validateQueryConfig("query-table", { sql: "SELECT 1", columns: [{ field: " " }] })).toEqual([
      "필드가 빈 컬럼이 있습니다",
    ]);
  });

  it("차트 — 가로축 필드와 계열 1개 이상", () => {
    expect(validateQueryConfig("query-chart", { sql: "S", chartType: "bar", xField: "", series: [] })).toEqual([
      "가로축 필드를 고르세요",
      "값 계열을 하나 이상 넣으세요",
    ]);
    expect(
      validateQueryConfig("query-chart", { sql: "S", chartType: "line", xField: "X", series: [{ field: "" }] })
    ).toEqual(["필드가 빈 값 계열이 있습니다"]);
    expect(
      validateQueryConfig("query-chart", { sql: "S", chartType: "pie", xField: "X", series: [{ field: "V" }] })
    ).toEqual([]);
  });

  it("숫자 — 라벨 필드·값 필드", () => {
    expect(validateQueryConfig("query-number", { sql: "", labelField: "", valueField: "" })).toEqual([
      "SQL 을 입력하세요",
      "라벨 필드를 고르세요",
      "값 필드를 고르세요",
    ]);
    expect(validateQueryConfig("query-number", { sql: "S", labelField: "L", valueField: "V" })).toEqual([]);
  });
});

describe("편집기 도우미", () => {
  it("fieldOptions — 미리보기 컬럼, 지금 값이 목록에 없으면 앞에 둔다", () => {
    expect(fieldOptions(["A", "B"], "A")).toEqual(["A", "B"]);
    expect(fieldOptions(["A", "B"], "OLD")).toEqual(["OLD", "A", "B"]);
    expect(fieldOptions(["A", "B"], "")).toEqual(["A", "B"]);
  });

  it("moveItem — 위아래로 옮기고, 끝을 넘으면 그대로", () => {
    expect(moveItem(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveItem(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
    expect(moveItem(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
    expect(moveItem(["a", "b", "c"], 2, 1)).toEqual(["a", "b", "c"]);
  });

  it("textCell — 앞뒤 공백을 지우고 빈 글자는 undefined(설정에서 키가 빠진다)", () => {
    expect(textCell(" 수량 ")).toBe("수량");
    expect(textCell("  ")).toBeUndefined();
    expect(textCell(null)).toBeUndefined();
    expect(textCell(12)).toBe("12");
  });

  it("intCell — 양의 정수만, 그 밖은 undefined", () => {
    expect(intCell(120)).toBe(120);
    expect(intCell("80")).toBe(80);
    expect(intCell(99.6)).toBe(100);
    expect(intCell(0)).toBeUndefined();
    expect(intCell(-5)).toBeUndefined();
    expect(intCell("넓게")).toBeUndefined();
    expect(intCell(null)).toBeUndefined();
  });

  it("appendMissingFields — 아직 없는 결과 컬럼만 뒤에 붙인다", () => {
    expect(appendMissingFields([{ field: "B", header: "비" }], ["A", "B", "C"])).toEqual([
      { field: "B", header: "비" },
      { field: "A" },
      { field: "C" },
    ]);
    expect(appendMissingFields([], [])).toEqual([]);
  });

  it("removeAt·updateAt — 새 배열을 돌려준다", () => {
    const list = [{ f: "a" }, { f: "b" }];
    expect(removeAt(list, 0)).toEqual([{ f: "b" }]);
    expect(removeAt(list, 5)).toEqual(list);
    const next = updateAt(list, 1, { f: "z" });
    expect(next).toEqual([{ f: "a" }, { f: "z" }]);
    expect(list[1]).toEqual({ f: "b" });
  });
});
