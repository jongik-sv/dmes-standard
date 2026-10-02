// TSK-05-02 design.md §3.4 — 화면 즉시 재계산(불변 I1·I2·I11). Java LayoutOffsetCalculatorTest 와 같은 M201 벡터(F7).
import { describe, expect, it } from "vitest";
import {
  itemLength, moveRow, placeHeader, placeMessage, positionLabel, reorder, summaryText,
} from "../../src/layout/layout-calc";
import type { LayoutItemRow } from "../../src/layout/types";

const W4 = "SIGN=N;ZERO=Y;SCALE=1;WIDTH=4";

function row(key: string, fill: LayoutItemRow["FILL_KIND"], extra: Partial<LayoutItemRow> = {}): LayoutItemRow {
  return { KEY: key, SEQ: 0, FILL_KIND: fill, COLUMN_PHYS: fill === "FILLER" ? null : key, ...extra };
}

const L100 = [8, 4, 3, 4, 3, 14, 14, 12, 1, 5, 1, 6].map((n, i) => row(`H${i}`, "CONST", { DOMAIN_LENGTH: n }))
  .concat([row("F", "FILLER", { FILLER_LENGTH: 25 })]);

function m201Body(): LayoutItemRow[] {
  return [
    row("COIL_ID", "DATA", { DOMAIN_LENGTH: 20 }),
    row("PROD_DT", "DATA", { DOMAIN_LENGTH: 8 }),
    row("COIL_THK", "DATA", { DOMAIN_LENGTH: 3, SCALE: 1, DATA_TYPE: "NUMBER", NUM_FORMAT: W4 }),
    row("FILLER", "FILLER", { FILLER_LENGTH: 25 }),
  ];
}

describe("layout-calc", () => {
  it("M201 은 헤더 130 본문 첫 오프셋 130 총 187", () => {
    const out = placeMessage([100, 30], m201Body());
    expect(out.headerOffsets).toEqual([0, 100]);
    expect(out.headerLength).toBe(130);
    expect(out.rows.map((r) => r.OFFSET)).toEqual([130, 150, 158, 162]);
    expect(out.rows.map((r) => r.LENGTH)).toEqual([20, 8, 4, 25]);
    expect(out.total).toBe(187);
    expect(summaryText([100, 30], out.rows)).toBe("헤더 130 (100 + 30) + 본문 57 (20 + 8 + 4 + 25) = 187 바이트");
  });

  it("L100 헤더 내부 오프셋", () => {
    const out = placeHeader(L100);
    expect(out.rows.map((r) => r.OFFSET)).toEqual([0, 8, 12, 15, 19, 22, 36, 50, 62, 63, 68, 69, 75]);
    expect(out.total).toBe(100);
  });

  it("헤더가 없으면 본문은 0부터, 본문이 없으면 총 길이는 헤더 합", () => {
    expect(placeMessage([], m201Body()).rows[0].OFFSET).toBe(0);
    expect(placeMessage([100, 30], []).total).toBe(130);
  });

  it("항목 길이는 FILLER 길이 / 숫자 표현 자리수 / 도메인 길이 순이다", () => {
    expect(itemLength(row("F", "FILLER", { FILLER_LENGTH: 25 }))).toBe(25);
    expect(itemLength(row("T", "DATA", { DOMAIN_LENGTH: 3, NUM_FORMAT: W4 }))).toBe(4);
    expect(itemLength(row("C", "DATA", { DOMAIN_LENGTH: 20 }))).toBe(20);
    expect(itemLength(row("N", "DATA", {}))).toBe(0);
    expect(itemLength(row("B", "DATA", { DOMAIN_LENGTH: 3, NUM_FORMAT: "깨진값" }))).toBe(3);
  });

  it("moveRow 로 FILLER 를 COIL_THK 앞으로 옮기면 FILLER 158·COIL_THK 183 으로 다시 계산된다", () => {
    const moved = moveRow(m201Body(), 3, 2);
    expect(moved.map((r) => r.KEY)).toEqual(["COIL_ID", "PROD_DT", "FILLER", "COIL_THK"]);
    expect(moved.map((r) => r.SEQ)).toEqual([1, 2, 3, 4]);
    const out = placeMessage([100, 30], moved);
    expect(out.rows.map((r) => r.OFFSET)).toEqual([130, 150, 158, 183]);
    expect(out.total).toBe(187);
  });

  it("드래그 결과 키 순서로 다시 줄 세운다", () => {
    const re = reorder(m201Body(), ["COIL_ID", "PROD_DT", "FILLER", "COIL_THK"]);
    expect(re.map((r) => r.KEY)).toEqual(["COIL_ID", "PROD_DT", "FILLER", "COIL_THK"]);
    expect(re.map((r) => r.SEQ)).toEqual([1, 2, 3, 4]);
  });

  it("숫자 표현 자리수를 4→5 로 바꾸면 뒤 항목 오프셋과 총 길이가 1 늘어난다", () => {
    const body = m201Body();
    body[2] = { ...body[2], NUM_FORMAT: "SIGN=N;ZERO=Y;SCALE=1;WIDTH=5" };
    const out = placeMessage([100, 30], body);
    expect(out.rows.map((r) => r.OFFSET)).toEqual([130, 150, 158, 163]);
    expect(out.total).toBe(188);
  });

  it("positionLabel 은 1부터 센 위치다", () => {
    expect(positionLabel(130, 20)).toBe("131-150");
    expect(positionLabel(62, 1)).toBe("63");
    expect(positionLabel(0, 100)).toBe("1-100");
  });

  it("헤더 길이 하나라도 null 이면 그 뒤 헤더 오프셋·본문 오프셋·총 길이는 null 이고 요약은 - 다(0 으로 더하지 않는다)", () => {
    const out = placeMessage([100, null], m201Body());
    expect(out.headerOffsets).toEqual([0, 100]);
    expect(out.headerLength).toBeNull();
    expect(out.total).toBeNull();
    expect(out.rows.map((r) => r.OFFSET)).toEqual([null, null, null, null]);
    expect(out.rows.map((r) => r.LENGTH)).toEqual([20, 8, 4, 25]);
    expect(placeMessage([null, 30], []).headerOffsets).toEqual([0, null]);
    expect(summaryText([100, null], out.rows)).toBe("헤더 - (100 + -) + 본문 57 (20 + 8 + 4 + 25) = - 바이트");
    expect(positionLabel(null, 20)).toBe("-");
  });
});
