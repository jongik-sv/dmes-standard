// 경계값 테스트 케이스 후보 생성(카드 ⑥ [경계값 생성]) — 순수 생성기.
import { describe, expect, it } from "vitest";

import {
  BOUNDARY_CASE_DESCRIPTION,
  BOUNDARY_CASE_LIMIT,
  planBoundaryCases,
  type BoundaryPlan,
  type BoundaryPlanInput,
} from "../../../pages/dme/ruleEdit/value-test/boundary-cases";
import type { ResolvedVar, StoredRow } from "../../../pages/dme/ruleEdit/types";
import { SAMPLE_ROWS, SAMPLE_VARS } from "./fixtures";

const M = "−";

function cond(varId: number, varName: string, dataType: ResolvedVar["dataType"], extra: Partial<ResolvedVar> = {}): ResolvedVar {
  return {
    varId,
    varKind: "COND",
    dispType: "2",
    seq: varId,
    varName,
    exprVar: false,
    dataType,
    scale: null,
    dateString: false,
    typeSource: "COLUMN",
    ...extra,
  };
}

const RESULT: ResolvedVar = { ...cond(99, "OUT", "STRING"), varKind: "RESULT", dispType: "Value", seq: 1 };

function row(rowId: number, seq: number, cells: Record<number, object>, rowKind: StoredRow["rowKind"] = "NORMAL"): StoredRow {
  return { rowId, seq, rowKind, cells: JSON.stringify(cells), note: null };
}

function plan(input: Partial<BoundaryPlanInput> & Pick<BoundaryPlanInput, "vars" | "rows">): BoundaryPlan {
  return planBoundaryCases(input);
}

/** 열 하나짜리 표의 한 행 → [point, 그 열 값] 목록. */
function pointsOf(v: ResolvedVar, cell: object): Array<[string, unknown]> {
  const p = plan({ vars: [v, RESULT], rows: [row(1, 1, { [v.varId]: cell })] });
  expect(p.blocked).toBeNull();
  expect(p.skipped).toEqual([]);
  return p.candidates.map((c) => [c.point, (JSON.parse(c.inputJson) as Record<string, unknown>)[v.varName!]]);
}

describe("막기", () => {
  it("조건 열이 없으면 막는다(Expression 조건 열·결과 열만 있는 표)", () => {
    const expr = cond(1, "", "STRING", { dispType: "Expression", varName: null });
    const p = plan({ vars: [expr, RESULT], rows: [row(1, 1, { 1: { op: "NA" } })] });
    expect(p).toEqual({ candidates: [], skipped: [], truncated: 0, blocked: "조건 열이 없어 경계값을 만들 수 없습니다." });
  });

  it("식 변수 열(exprVar)은 조건 열로 치지 않는다", () => {
    const ev = cond(1, "A + B", "NUMBER", { exprVar: true });
    expect(plan({ vars: [ev, RESULT], rows: [row(1, 1, { 1: { op: "GT", left: "1" } })] }).blocked).toBe("조건 열이 없어 경계값을 만들 수 없습니다.");
  });

  it("저장 전 임시 행(rowId < 0)이 있으면 막는다 — 기본 행이어도", () => {
    const v = cond(1, "X", "NUMBER");
    const msg = "저장하지 않은 행이 있습니다. 표를 먼저 저장한 뒤 경계값을 만드세요.";
    expect(plan({ vars: [v], rows: [row(1, 1, { 1: { op: "NA" } }), row(-3, 2, { 1: { op: "NA" } })] })).toEqual({
      candidates: [],
      skipped: [],
      truncated: 0,
      blocked: msg,
    });
    expect(plan({ vars: [v], rows: [row(1, 1, { 1: { op: "NA" } }), row(-1, 0, {}, "DEFAULT")] }).blocked).toBe(msg);
  });
});

describe("대표 후보(fixture QLTY_GRD_JDG)", () => {
  const p = plan({ vars: SAMPLE_VARS, rows: SAMPLE_ROWS });

  it("NORMAL 행마다 대표 후보를 먼저 내고, 기본 행은 후보를 만들지 않는다", () => {
    const reps = p.candidates.filter((c) => c.point === "대표");
    expect(reps.map((c) => [c.rowId, c.seq, c.caseName, c.key, c.varId])).toEqual([
      [1, 1, "1행 대표", "1:-:대표", null],
      [2, 2, "2행 대표", "2:-:대표", null],
      [3, 3, "3행 대표", "3:-:대표", null],
    ]);
    expect(p.candidates.some((c) => c.rowId === 4)).toBe(false);
    expect(p.candidates.every((c) => c.description === BOUNDARY_CASE_DESCRIPTION)).toBe(true);
  });

  it("대표 입력은 그 행을 만족하는 값이다(닫힌 끝·안쪽 한 칸·IN 첫 항목·NOT_IN 밖 값·NA null)", () => {
    const rep = (rowId: number) => JSON.parse(p.candidates.find((c) => c.rowId === rowId && c.point === "대표")!.inputJson);
    expect(rep(1)).toEqual({ COIL_THK: "1.6", COIL_WID: "1001", SURF_GRD: "A" });
    expect(rep(2)).toEqual({ COIL_THK: "1.6", COIL_WID: "1001", SURF_GRD: "B" });
    const r3 = rep(3);
    expect(r3.COIL_THK).toBe("2.5");
    expect(r3.COIL_WID).toBeNull();
    expect(typeof r3.SURF_GRD).toBe("string");
    expect(r3.SURF_GRD).not.toBe("C");
  });

  it("값은 문자열이고, 이름은 `${seq}행 ${varName} ${point}`, key 는 rowId:varId:point 다", () => {
    const c = p.candidates.find((x) => x.rowId === 1 && x.varId === 1 && x.point === `아래끝${M}1`)!;
    expect(c.caseName).toBe(`1행 COIL_THK 아래끝${M}1`);
    expect(c.key).toBe(`1:1:아래끝${M}1`);
    expect(JSON.parse(c.inputJson)).toEqual({ COIL_THK: "1.59", COIL_WID: "1001", SURF_GRD: "A" });
  });

  it("행 2 는 행 1 과 같은 입력(구간 끝·NULL 점)을 다시 내지 않는다", () => {
    const inputs = p.candidates.map((c) => c.inputJson);
    expect(new Set(inputs.map((s) => JSON.stringify(Object.entries(JSON.parse(s)).sort()))).size).toBe(inputs.length);
    // 행 2 의 COIL_THK 점은 SURF_GRD 가 B 라 행 1 과 다르다 — 남는다.
    expect(p.candidates.some((c) => c.rowId === 2 && c.varId === 1 && c.point === "위끝")).toBe(true);
  });
});

describe("구간 넷의 열림·닫힘 (scale 2)", () => {
  const v = cond(1, "T", "NUMBER", { scale: 2 });

  it("<= 변수 <= : 대표 = 아래끝, 위끝 점 모두", () => {
    expect(pointsOf(v, { op: "<= 변수 <=", left: "1.00", right: "2.00" })).toEqual([
      ["대표", "1.00"],
      [`아래끝${M}1`, "0.99"],
      ["아래끝+1", "1.01"],
      ["위끝", "2.00"],
      [`위끝${M}1`, "1.99"],
      ["위끝+1", "2.01"],
      ["NULL", null],
    ]);
  });

  it("<= 변수 < : 대표 = 아래끝(닫힌 끝)", () => {
    expect(pointsOf(v, { op: "<= 변수 <", left: "1.00", right: "2.00" })).toEqual([
      ["대표", "1.00"],
      [`아래끝${M}1`, "0.99"],
      ["아래끝+1", "1.01"],
      ["위끝", "2.00"],
      [`위끝${M}1`, "1.99"],
      ["위끝+1", "2.01"],
      ["NULL", null],
    ]);
  });

  it("< 변수 <= : 대표 = 위끝(닫힌 끝)", () => {
    expect(pointsOf(v, { op: "< 변수 <=", left: "1.00", right: "2.00" })).toEqual([
      ["대표", "2.00"],
      ["아래끝", "1.00"],
      [`아래끝${M}1`, "0.99"],
      ["아래끝+1", "1.01"],
      [`위끝${M}1`, "1.99"],
      ["위끝+1", "2.01"],
      ["NULL", null],
    ]);
  });

  it("< 변수 < : 대표 = 아래끝 안쪽 한 칸", () => {
    expect(pointsOf(v, { op: "< 변수 <", left: "1.00", right: "2.00" })).toEqual([
      ["대표", "1.01"],
      ["아래끝", "1.00"],
      [`아래끝${M}1`, "0.99"],
      ["위끝", "2.00"],
      [`위끝${M}1`, "1.99"],
      ["위끝+1", "2.01"],
      ["NULL", null],
    ]);
  });
});

describe("비교·EQ·NE 의 끝과 한 칸", () => {
  it("scale 0: GT 는 아래끝만, 대표는 안쪽 한 칸", () => {
    expect(pointsOf(cond(1, "W", "NUMBER", { scale: 0 }), { op: "GT", left: "1000" })).toEqual([
      ["대표", "1001"],
      ["아래끝", "1000"],
      [`아래끝${M}1`, "999"],
      ["NULL", null],
    ]);
  });

  it("LT·LE 는 위끝만", () => {
    expect(pointsOf(cond(1, "W", "NUMBER", { scale: 0 }), { op: "LT", left: "10" })).toEqual([
      ["대표", "9"],
      ["위끝", "10"],
      ["위끝+1", "11"],
      ["NULL", null],
    ]);
    expect(pointsOf(cond(1, "W", "NUMBER", { scale: 1 }), { op: "LE", left: "10" })).toEqual([
      ["대표", "10"],
      [`위끝${M}1`, "9.9"],
      ["위끝+1", "10.1"],
      ["NULL", null],
    ]);
  });

  it("GE 의 아래끝", () => {
    expect(pointsOf(cond(1, "W", "NUMBER", { scale: 0 }), { op: "GE", left: "5" })).toEqual([
      ["대표", "5"],
      [`아래끝${M}1`, "4"],
      ["아래끝+1", "6"],
      ["NULL", null],
    ]);
  });

  it("scale null 이면 열 셀들의 최대 소수 자릿수로 한 칸을 정한다", () => {
    expect(pointsOf(cond(1, "T", "NUMBER"), { op: "<= 변수 <", left: "1.5", right: "2.25" })).toEqual([
      ["대표", "1.5"],
      [`아래끝${M}1`, "1.49"],
      ["아래끝+1", "1.51"],
      ["위끝", "2.25"],
      [`위끝${M}1`, "2.24"],
      ["위끝+1", "2.26"],
      ["NULL", null],
    ]);
  });

  it("scale null 의 자릿수는 다른 행 셀(list 포함)까지 본다", () => {
    const v = cond(1, "T", "NUMBER");
    const p = plan({ vars: [v], rows: [row(1, 1, { 1: { op: "GE", left: "3" } }), row(2, 2, { 1: { op: "IN", list: ["0.125"] } })] });
    const r1 = p.candidates.filter((c) => c.rowId === 1).map((c) => [c.point, JSON.parse(c.inputJson).T]);
    expect(r1).toEqual([
      ["대표", "3"],
      [`아래끝${M}1`, "2.999"],
      ["아래끝+1", "3.001"],
      ["NULL", null],
    ]);
  });

  it("scale null 이고 셀이 모두 정수면 한 칸은 1 이다", () => {
    expect(pointsOf(cond(1, "W", "NUMBER"), { op: "LT", left: "10" })).toEqual([
      ["대표", "9"],
      ["위끝", "10"],
      ["위끝+1", "11"],
      ["NULL", null],
    ]);
  });

  it("작은 한 칸도 지수 표기 없이 평문으로 싣는다", () => {
    expect(pointsOf(cond(1, "W", "NUMBER", { scale: 8 }), { op: "GE", left: "0" })).toEqual([
      ["대표", "0"],
      [`아래끝${M}1`, "-0.00000001"],
      ["아래끝+1", "0.00000001"],
      ["NULL", null],
    ]);
  });

  it("NUMBER EQ 는 값·값−1·값+1(값은 대표와 같아 빠진다)", () => {
    expect(pointsOf(cond(1, "W", "NUMBER", { scale: 0 }), { op: "EQ", left: "5" })).toEqual([
      ["대표", "5"],
      [`값${M}1`, "4"],
      ["값+1", "6"],
      ["NULL", null],
    ]);
  });

  it("NUMBER NE 의 대표는 left+1 칸", () => {
    expect(pointsOf(cond(1, "W", "NUMBER", { scale: 0 }), { op: "NE", left: "5" })).toEqual([
      ["대표", "6"],
      ["값", "5"],
      [`값${M}1`, "4"],
      ["NULL", null],
    ]);
  });
});

describe("일자", () => {
  const dt = cond(1, "D", "DATE");

  it("8자리는 달력 기준 ±1일 — 윤년 2/29", () => {
    expect(pointsOf(dt, { op: "GE", left: "20240228" })).toEqual([
      ["대표", "20240228"],
      [`아래끝${M}1`, "20240227"],
      ["아래끝+1", "20240229"],
      ["NULL", null],
    ]);
  });

  it("평년 2월 말은 3/1 로 넘어간다", () => {
    expect(pointsOf(dt, { op: "GT", left: "20230228" })[0]).toEqual(["대표", "20230301"]);
  });

  it("연말은 다음 해 1/1 로 넘어간다", () => {
    expect(pointsOf(dt, { op: "LE", left: "20241231" })).toEqual([
      ["대표", "20241231"],
      [`위끝${M}1`, "20241230"],
      ["위끝+1", "20250101"],
      ["NULL", null],
    ]);
  });

  it("연초 −1일은 전 해 12/31", () => {
    expect(pointsOf(dt, { op: "LT", left: "20250101" })[0]).toEqual(["대표", "20241231"]);
  });

  it("14자리는 ±1초", () => {
    expect(pointsOf(dt, { op: "GT", left: "20241231235959" })).toEqual([
      ["대표", "20250101000000"],
      ["아래끝", "20241231235959"],
      [`아래끝${M}1`, "20241231235958"],
      ["NULL", null],
    ]);
  });

  it("일자 문자열 열(dateString)의 EQ 도 값·값−1·값+1", () => {
    expect(pointsOf(cond(1, "D", "STRING", { dateString: true }), { op: "EQ", left: "20240301" })).toEqual([
      ["대표", "20240301"],
      [`값${M}1`, "20240229"],
      ["값+1", "20240302"],
      ["NULL", null],
    ]);
  });

  it("8·14자리가 아닌 일자는 처리 불가", () => {
    const p = plan({ vars: [dt], rows: [row(7, 1, { 1: { op: "GE", left: "2024-01-01" } })] });
    expect(p.candidates).toEqual([]);
    expect(p.skipped).toHaveLength(1);
    expect(p.skipped[0]).toMatchObject({ rowId: 7, seq: 1 });
    expect(p.skipped[0].reason).toContain("D");
  });

  it("NOT_NULL 일자의 대표는 고정값 20000101", () => {
    expect(pointsOf(dt, { op: "NOT_NULL" })).toEqual([
      ["대표", "20000101"],
      ["NULL", null],
    ]);
  });
});

describe("대표값과 NULL 점", () => {
  it("NA·셀 없음은 null 이고 NULL 점이 없다", () => {
    const a = cond(1, "A", "NUMBER");
    const b = cond(2, "B", "STRING");
    const p = plan({ vars: [a, b], rows: [row(1, 1, { 1: { op: "NA" } })] });
    expect(p.candidates.map((c) => [c.point, JSON.parse(c.inputJson)])).toEqual([["대표", { A: null, B: null }]]);
  });

  it("IS_NULL 은 null 이고 NULL 점이 없다", () => {
    expect(pointsOf(cond(1, "S", "STRING"), { op: "IS_NULL" })).toEqual([["대표", null]]);
  });

  it("NOT_NULL 은 타입별 아무 값", () => {
    expect(pointsOf(cond(1, "N", "NUMBER"), { op: "NOT_NULL" })).toEqual([
      ["대표", "0"],
      ["NULL", null],
    ]);
    expect(pointsOf(cond(1, "S", "STRING"), { op: "NOT_NULL" })).toEqual([
      ["대표", "A"],
      ["NULL", null],
    ]);
  });

  it("STRING 은 끝 계열 점 없이 대표·NULL 만", () => {
    expect(pointsOf(cond(1, "S", "STRING"), { op: "EQ", left: "AB" })).toEqual([
      ["대표", "AB"],
      ["NULL", null],
    ]);
    expect(pointsOf(cond(1, "S", "STRING"), { op: "EQ", left: "\\%A" })).toEqual([
      ["대표", "%A"],
      ["NULL", null],
    ]);
    expect(pointsOf(cond(1, "S", "STRING"), { op: "NE", left: "A" })).toEqual([
      ["대표", "AX"],
      ["NULL", null],
    ]);
    expect(pointsOf(cond(1, "S", "STRING"), { op: "IN", list: ["K", "L"] })).toEqual([
      ["대표", "K"],
      ["NULL", null],
    ]);
  });

  it("NOT_IN 은 목록에 없는 값", () => {
    const [[, s]] = pointsOf(cond(1, "S", "STRING"), { op: "NOT_IN", list: ["A", "AX", "B"] });
    expect(typeof s).toBe("string");
    expect(["A", "AX", "B"]).not.toContain(s);
    expect(pointsOf(cond(1, "N", "NUMBER", { scale: 0 }), { op: "NOT_IN", list: ["3", "1"] })[0]).toEqual(["대표", "4"]);
  });

  it("NUMBER IN 은 첫 항목 원문", () => {
    expect(pointsOf(cond(1, "N", "NUMBER"), { op: "IN", list: ["1.50", "2"] })).toEqual([
      ["대표", "1.50"],
      ["NULL", null],
    ]);
  });
});

describe("BOOLEAN", () => {
  const b = cond(1, "F", "BOOLEAN", { dispType: "1" });

  it("EQ true: 대표 true, TRUE 는 중복으로 빠지고 FALSE·NULL", () => {
    expect(pointsOf(b, { op: "EQ", left: "TRUE" })).toEqual([
      ["대표", "true"],
      ["FALSE", "false"],
      ["NULL", null],
    ]);
  });

  it("NA: 대표 null, TRUE·FALSE, NULL 점 없음", () => {
    const p = plan({ vars: [b], rows: [row(1, 1, { 1: { op: "NA" } })] });
    expect(p.candidates.map((c) => [c.point, c.varId, JSON.parse(c.inputJson).F])).toEqual([
      ["대표", null, null],
      ["TRUE", 1, "true"],
      ["FALSE", 1, "false"],
    ]);
  });

  it("NOT_NULL 의 대표는 true", () => {
    expect(pointsOf(b, { op: "NOT_NULL" })).toEqual([
      ["대표", "true"],
      ["FALSE", "false"],
      ["NULL", null],
    ]);
  });
});

describe("처리 불가 행", () => {
  const thk = cond(1, "COIL_THK", "NUMBER", { scale: 2 });
  const grd = cond(2, "SURF_GRD", "STRING", { dispType: "1" });

  it("CONTAINS 칸이 든 행은 후보 없이 skipped 에 사유와 함께 들어가고 다른 행은 그대로 만든다", () => {
    const p = plan({
      vars: [thk, grd],
      rows: [row(1, 1, { 1: { op: "CONTAINS", left: "1" }, 2: { op: "NA" } }), row(2, 2, { 1: { op: "GE", left: "1" }, 2: { op: "NA" } })],
    });
    expect(p.skipped).toEqual([{ rowId: 1, seq: 1, reason: "COIL_THK 칸이 CONTAINS 라 대표값을 정하지 못합니다" }]);
    expect(p.candidates.every((c) => c.rowId === 2)).toBe(true);
    expect(p.candidates.length).toBeGreaterThan(0);
  });

  it.each([
    ["INSTR", { op: "INSTR", left: "A" }],
    ["CODE_IN", { op: "CODE_IN", left: "CAT" }],
    ["접두 EQ", { op: "EQ", left: "A%" }],
    ["정규식 EQ", { op: "EQ", left: "A_B" }],
    ["거부 패턴 EQ", { op: "EQ", left: "%" }],
  ])("STRING %s 는 처리 불가", (_n, cell) => {
    const p = plan({ vars: [grd], rows: [row(5, 3, { 2: cell })] });
    expect(p.candidates).toEqual([]);
    expect(p.skipped).toHaveLength(1);
    expect(p.skipped[0]).toMatchObject({ rowId: 5, seq: 3 });
    expect(p.skipped[0].reason).toContain("SURF_GRD");
  });

  it("숫자로 읽히지 않는 숫자 셀은 처리 불가", () => {
    const p = plan({ vars: [thk], rows: [row(1, 1, { 1: { op: "GT", left: "abc" } })] });
    expect(p.candidates).toEqual([]);
    expect(p.skipped[0].reason).toContain("COIL_THK");
  });

  it("Expression 조건 열의 NA 아닌 셀은 처리 불가, NA·셀 없음은 괜찮다", () => {
    const expr = cond(3, "", "STRING", { dispType: "Expression", varName: null, label: "식 조건" });
    const p = plan({
      vars: [thk, expr],
      rows: [
        row(1, 1, { 1: { op: "GE", left: "1" }, 3: { expr: "COIL_THK > 1" } }),
        row(2, 2, { 1: { op: "GE", left: "2" }, 3: { op: "NA" } }),
        row(3, 3, { 1: { op: "GE", left: "3" } }),
      ],
    });
    expect(p.skipped.map((s) => s.rowId)).toEqual([1]);
    expect(p.skipped[0].reason).toContain("식 조건");
    expect([...new Set(p.candidates.map((c) => c.rowId))]).toEqual([2, 3]);
    expect(Object.keys(JSON.parse(p.candidates[0].inputJson))).toEqual(["COIL_THK"]);
  });
});

describe("중복 제거", () => {
  const v = cond(1, "X", "NUMBER", { scale: 1 });

  it("같은 입력을 내는 두 행은 뒤 행 후보가 빠진다", () => {
    const p = plan({ vars: [v], rows: [row(1, 1, { 1: { op: "EQ", left: "1.5" } }), row(2, 2, { 1: { op: "EQ", left: "1.5" } })] });
    expect(p.candidates.every((c) => c.rowId === 1)).toBe(true);
  });

  it("기존 케이스와 같은 입력(키 대소문자·JSON 숫자 1.5 대 \"1.5\")은 뺀다", () => {
    const p = plan({ vars: [v], rows: [row(1, 1, { 1: { op: "EQ", left: "1.5" } })], existingInputs: ['{"x":1.5}', "{깨진", "[1]", "null"] });
    expect(p.candidates.map((c) => c.point)).toEqual([`값${M}1`, "값+1", "NULL"]);
  });

  it("기존 입력에 키가 더 있으면 다른 입력이다", () => {
    const p = plan({ vars: [v], rows: [row(1, 1, { 1: { op: "EQ", left: "1.5" } })], existingInputs: ['{"X":"1.5","Y":"1"}'] });
    expect(p.candidates[0].point).toBe("대표");
  });

  it("저장될 모양으로 견준다 — baseInput 의 undefined 키는 없는 키와 같다", () => {
    const p = plan({
      vars: [v],
      rows: [row(1, 1, { 1: { op: "EQ", left: "1.5" } })],
      baseInput: { A: undefined },
      existingInputs: ['{"X":"1.5"}'],
    });
    expect(p.candidates[0].point).toBe(`값${M}1`);
    expect(JSON.parse(p.candidates[0].inputJson)).toEqual({ X: "1.4" });
  });

  it("기존 입력의 null 은 null 끼리만 같다", () => {
    const p = plan({ vars: [v], rows: [row(1, 1, { 1: { op: "EQ", left: "1.5" } })], existingInputs: ['{"X":null}'] });
    expect(p.candidates.map((c) => c.point)).toEqual(["대표", `값${M}1`, "값+1"]);
  });
});

describe("상한", () => {
  const v = cond(1, "X", "NUMBER", { scale: 0 });
  const rows = Array.from({ length: 30 }, (_, i) => row(i + 1, i + 1, { 1: { op: "<= 변수 <=", left: String(i * 100), right: String(i * 100 + 50) } }));

  it("limit 을 넘는 후보는 잘라 내고 수를 truncated 에 넣는다", () => {
    const all = plan({ vars: [v], rows, limit: 10_000 });
    expect(all.truncated).toBe(0);
    const p = plan({ vars: [v], rows, limit: 5 });
    expect(p.candidates).toEqual(all.candidates.slice(0, 5));
    expect(p.truncated).toBe(all.candidates.length - 5);
  });

  it("limit 이 없으면 BOUNDARY_CASE_LIMIT", () => {
    const all = plan({ vars: [v], rows, limit: 10_000 });
    expect(all.candidates.length).toBeGreaterThan(BOUNDARY_CASE_LIMIT);
    const p = plan({ vars: [v], rows });
    expect(p.candidates).toHaveLength(BOUNDARY_CASE_LIMIT);
    expect(p.truncated).toBe(all.candidates.length - BOUNDARY_CASE_LIMIT);
  });
});

describe("기본 입력·이름·순서", () => {
  it("baseInput 의 조건 열이 아닌 키는 그대로 두고, 대소문자만 다른 조건 열 키는 조건 열 이름으로 바꿔 쓴다", () => {
    const v = cond(1, "COIL_THK", "NUMBER", { scale: 0 });
    const p = plan({ vars: [v], rows: [row(1, 1, { 1: { op: "EQ", left: "3" } })], baseInput: { OTHER: "k", coil_thk: "9", NUM: 5 } });
    for (const c of p.candidates) {
      const o = JSON.parse(c.inputJson);
      expect(o.OTHER).toBe("k");
      expect(o.NUM).toBe(5);
      expect("coil_thk" in o).toBe(false);
      expect("COIL_THK" in o).toBe(true);
    }
    expect(JSON.parse(p.candidates[0].inputJson).COIL_THK).toBe("3");
  });

  it("이름이 100자를 넘으면 자른다", () => {
    const long = "V".repeat(120);
    const p = plan({ vars: [cond(1, long, "NUMBER", { scale: 0 })], rows: [row(1, 1, { 1: { op: "EQ", left: "3" } })] });
    const c = p.candidates.find((x) => x.point === "NULL")!;
    expect(c.caseName).toHaveLength(100);
    expect(c.caseName.startsWith(`1행 ${"V".repeat(50)}`)).toBe(true);
  });

  it("행은 seq 순, 조건 열은 열 seq 순으로 처리한다", () => {
    const a = cond(1, "A", "NUMBER", { scale: 0, seq: 2 });
    const b = cond(2, "B", "NUMBER", { scale: 0, seq: 1 });
    const p = plan({
      vars: [a, b],
      rows: [row(20, 2, { 1: { op: "EQ", left: "7" }, 2: { op: "NA" } }), row(10, 1, { 1: { op: "NA" }, 2: { op: "EQ", left: "1" } })],
    });
    expect(p.candidates.map((c) => c.key)).toEqual([
      "10:-:대표",
      `10:2:값${M}1`,
      "10:2:값+1",
      "10:2:NULL",
      "20:-:대표",
      `20:1:값${M}1`,
      "20:1:값+1",
      // 20:1:NULL 은 {B:null, A:null} 로 10:2:NULL 과 같아 빠진다.
    ]);
    expect(Object.keys(JSON.parse(p.candidates[0].inputJson))).toEqual(["B", "A"]);
  });
});

describe("리뷰 반영 — 빈 구간", () => {
  const n = cond(1, "COIL_THK", "NUMBER", { scale: 2 });
  const dt = cond(1, "D", "DATE");
  const skipOf = (v: ResolvedVar, cell: object) => plan({ vars: [v], rows: [row(9, 4, { 1: cell })] });

  it.each([
    ["열린 구간 안에 한 칸 값이 없음", { op: "< 변수 <", left: "1", right: "1.01" }],
    ["lo > hi", { op: "<= 변수 <=", left: "5", right: "3" }],
    ["반열림 lo == hi", { op: "<= 변수 <", left: "2", right: "2" }],
    ["반열림 lo == hi (왼쪽 열림)", { op: "< 변수 <=", left: "2", right: "2" }],
  ])("숫자 %s → 그 행을 skipped", (_n, cell) => {
    const p = skipOf(n, cell);
    expect(p.candidates).toEqual([]);
    expect(p.skipped).toEqual([{ rowId: 9, seq: 4, reason: "COIL_THK 칸의 구간이 비어 있어 대표값을 정하지 못합니다" }]);
  });

  it("닫힌 구간 lo == hi 는 대표값이 있다", () => {
    expect(pointsOf(n, { op: "<= 변수 <=", left: "2", right: "2.00" })[0]).toEqual(["대표", "2"]);
  });

  it("값 비교는 Decimal 로 한다(문자열 비교가 아니다)", () => {
    expect(pointsOf(n, { op: "<= 변수 <", left: "9", right: "10" })[0]).toEqual(["대표", "9"]);
  });

  it.each([
    ["lo > hi", { op: "<= 변수 <=", left: "20240301", right: "20240229" }],
    ["열린 하루 구간", { op: "< 변수 <", left: "20240228", right: "20240229" }],
  ])("일자 %s → skipped", (_n, cell) => {
    const p = skipOf(dt, cell);
    expect(p.candidates).toEqual([]);
    expect(p.skipped[0].reason).toBe("D 칸의 구간이 비어 있어 대표값을 정하지 못합니다");
  });

  it("일자 열린 이틀 구간은 가운데 날이 대표", () => {
    expect(pointsOf(dt, { op: "< 변수 <", left: "20240228", right: "20240301" })[0]).toEqual(["대표", "20240229"]);
  });
});

describe("리뷰 반영 — 중복 제거 키", () => {
  const x = cond(1, "X", "NUMBER", { scale: 1 });
  const one = (cell: object, existing: string[], baseInput?: Record<string, unknown>) =>
    plan({ vars: [x], rows: [row(1, 1, { 1: cell })], existingInputs: existing, baseInput }).candidates.map((c) => c.point);

  it("NUMBER 열은 Decimal 정규형으로 견준다 — \"1.0\"·\"1\"·1 은 같다", () => {
    expect(one({ op: "EQ", left: "1.0" }, ['{"X":1}'])[0]).toBe(`값${M}1`);
    expect(one({ op: "EQ", left: "1.0" }, ['{"X":"1"}'])[0]).toBe(`값${M}1`);
    expect(one({ op: "EQ", left: "1.5" }, ['{"X":"1.50"}'])[0]).toBe(`값${M}1`);
  });

  it("NUMBER 열의 \"+5\" 와 \"5\" 는 같다", () => {
    expect(one({ op: "EQ", left: "5" }, ['{"X":"+5"}'])[0]).toBe(`값${M}1`);
  });

  it("NUMBER 열이 아닌 키는 정규화하지 않는다", () => {
    const s = cond(1, "S", "STRING");
    const p = plan({ vars: [s], rows: [row(1, 1, { 1: { op: "EQ", left: "1.0" } })], existingInputs: ['{"S":"1"}'] });
    expect(p.candidates[0].point).toBe("대표");
  });

  it("객체·배열 값은 JSON 으로 견주어 String(v) 로 뭉개지지 않는다", () => {
    expect(one({ op: "EQ", left: "1.5" }, ['{"X":"1.5","O":"[object Object]"}'], { O: { a: 1 } })[0]).toBe("대표");
    expect(one({ op: "EQ", left: "1.5" }, ['{"X":"1.5","L":"1,2"}'], { L: [1, 2] })[0]).toBe("대표");
    expect(one({ op: "EQ", left: "1.5" }, ['{"X":"1.5","O":{"a":1}}'], { O: { a: 1 } })[0]).toBe(`값${M}1`);
  });
});

describe("리뷰 반영 — 식 변수·이름 없는 조건 열", () => {
  const x = cond(1, "X", "NUMBER", { scale: 0 });

  it("식 변수 조건 열에 NA 가 아닌 셀이 있으면 그 행을 건너뛴다(사유는 label)", () => {
    const ev = cond(2, "A + B", "NUMBER", { exprVar: true, label: "합계" });
    const p = plan({
      vars: [x, ev],
      rows: [row(1, 1, { 1: { op: "EQ", left: "1" }, 2: { op: "GT", left: "3" } }), row(2, 2, { 1: { op: "EQ", left: "5" }, 2: { op: "NA" } })],
    });
    expect(p.skipped).toHaveLength(1);
    expect(p.skipped[0]).toMatchObject({ rowId: 1, seq: 1 });
    expect(p.skipped[0].reason).toContain("합계");
    expect(p.skipped[0].reason).not.toContain("A + B");
    expect([...new Set(p.candidates.map((c) => c.rowId))]).toEqual([2]);
    expect(Object.keys(JSON.parse(p.candidates[0].inputJson))).toEqual(["X"]);
  });

  it("label 없는 식 변수·이름 없는 조건 열은 \"조건 열 N\" 으로 알린다", () => {
    const ev = cond(2, "A + B", "NUMBER", { exprVar: true, seq: 7 });
    const nameless = cond(3, "", "STRING", { varName: null, dispType: "1", seq: 8 });
    const p = plan({
      vars: [x, ev, nameless],
      rows: [row(1, 1, { 1: { op: "NA" }, 2: { op: "LE", left: "3" } }), row(2, 2, { 1: { op: "NA" }, 3: { op: "EQ", left: "K" } }), row(3, 3, { 1: { op: "EQ", left: "4" } })],
    });
    expect(p.skipped.map((s) => s.rowId)).toEqual([1, 2]);
    expect(p.skipped[0].reason).toContain("조건 열 7");
    expect(p.skipped[1].reason).toContain("조건 열 8");
    expect([...new Set(p.candidates.map((c) => c.rowId))]).toEqual([3]);
  });
});
