import { describe, expect, it } from "vitest";

import { meta as chartMeta } from "../query-chart/type.meta";
import { meta as numberMeta } from "../query-number/type.meta";
import { meta as tableMeta } from "../query-table/type.meta";
import { chartConfigOf, numberConfigOf, tableConfigOf } from "./format";

describe("쿼리 유형 메타(스펙 §3 표·계획 Task 7)", () => {
  it("id·이름·기본 크기·최소 크기", () => {
    expect([tableMeta, chartMeta, numberMeta].map((m) => [m.id, m.title, m.defaultSize, m.minSize])).toEqual([
      ["query-table", "쿼리 표", { w: 12, h: 12 }, { w: 4, h: 4 }],
      ["query-chart", "쿼리 차트", { w: 12, h: 12 }, { w: 4, h: 4 }],
      ["query-number", "쿼리 숫자", { w: 12, h: 6 }, { w: 4, h: 4 }],
    ]);
  });

  it("표만 본문 여백 없이 칸을 채운다", () => {
    expect(tableMeta.bodyPadding).toBe(false);
    expect(chartMeta.bodyPadding).toBeUndefined();
    expect(numberMeta.bodyPadding).toBeUndefined();
  });

  it("설명 한 줄이 있다", () => {
    for (const m of [tableMeta, chartMeta, numberMeta]) expect(m.description?.length).toBeGreaterThan(0);
  });

  it("초기 설정은 계획 값이고, 읽기 함수가 그대로 읽는다", () => {
    expect(tableMeta.initialConfig).toEqual({ sql: "", columns: [] });
    expect(chartMeta.initialConfig).toEqual({ sql: "", chartType: "bar", xField: "", series: [] });
    expect(numberMeta.initialConfig).toEqual({ sql: "", labelField: "", valueField: "", format: "number" });
    expect(tableConfigOf(tableMeta.initialConfig)).toEqual(tableMeta.initialConfig);
    expect(chartConfigOf(chartMeta.initialConfig)).toEqual(chartMeta.initialConfig);
    expect(numberConfigOf(numberMeta.initialConfig)).toEqual(numberMeta.initialConfig);
  });
});
