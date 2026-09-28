// TSK-08-02 design §6.7.4·I19~I21 — 그리드 모델(저장 형태 ↔ 그리드 행, 셀 편집 규칙, 새 행·기본 행·순서).
import fs from "node:fs";
import { describe, expect, it } from "vitest";

import {
  applyCellEdit,
  gridRowsFromStored,
  newDefaultRow,
  newNormalRow,
  resequence,
  ruleDefFromStored,
  storedRowsFromGrid,
  writeCells,
  type CellObj,
} from "../../../pages/dme/ruleEdit/decision-table/grid-model";
import type { ResolvedVar, StoredRow } from "../../../pages/dme/ruleEdit/types";
import { ANALYSIS_CORPUS_PATH } from "../../helpers/engine-paths";
import { SAMPLE_ROWS, SAMPLE_VARS } from "./fixtures";

function cv(dispType: ResolvedVar["dispType"], dataType: ResolvedVar["dataType"] = "NUMBER", extra: Partial<ResolvedVar> = {}): ResolvedVar {
  return { varId: 1, varKind: "COND", dispType, seq: 1, varName: "V", exprVar: false, dataType, dateString: false, typeSource: "COLUMN", ...extra };
}
const TWO = cv("2");
const ONE = cv("1");
const EQUAL = cv("Equal", "STRING");
const RESULT = cv("Value", "STRING", { varKind: "RESULT", varId: 9 });

describe("applyCellEdit — 셀 편집 규칙(§6.7.4, I19)", () => {
  it("Equal 무관 켬/끔", () => {
    expect(applyCellEdit(EQUAL, { op: "EQ", left: "ROLL" }, "na", true)).toEqual({ op: "NA" });
    expect(applyCellEdit(EQUAL, { op: "NA" }, "na", false)).toEqual({ op: "EQ", left: "" });
  });

  it("Equal 값은 EQ 로 쓴다", () => {
    expect(applyCellEdit(EQUAL, { op: "NA" }, "left", " ROLL ")).toEqual({ op: "EQ", left: "ROLL" });
  });

  it("구간 → 구간은 하한·상한을 유지한다", () => {
    expect(applyCellEdit(TWO, { op: "<= 변수 <", left: "1.6", right: "2.5" }, "op", "< 변수 <=")).toEqual({
      op: "< 변수 <=",
      left: "1.6",
      right: "2.5",
    });
  });

  it("구간 → 단일 op 는 left = left || right", () => {
    for (const op of ["EQ", "NE", "LT", "LE", "GT", "GE", "CONTAINS", "INSTR"]) {
      expect(applyCellEdit(TWO, { op: "<= 변수 <", left: "1.6", right: "2.5" }, "op", op)).toEqual({ op, left: "1.6" });
      expect(applyCellEdit(TWO, { op: "<= 변수 <", left: "", right: "2.5" }, "op", op)).toEqual({ op, left: "2.5" });
    }
    expect(applyCellEdit(TWO, { op: "<= 변수 <", left: "", right: "" }, "op", "GE")).toEqual({ op: "GE", left: "" });
  });

  it("단일 → 구간은 left 유지·right 빈 값", () => {
    expect(applyCellEdit(TWO, { op: "GE", left: "2.5" }, "op", "<= 변수 <=")).toEqual({ op: "<= 변수 <=", left: "2.5", right: "" });
  });

  it("IN ↔ NOT_IN 은 목록을 유지한다", () => {
    expect(applyCellEdit(ONE, { op: "IN", list: ["A", "B"] }, "op", "NOT_IN")).toEqual({ op: "NOT_IN", list: ["A", "B"] });
    expect(applyCellEdit(ONE, { op: "NOT_IN", list: ["C"] }, "op", "IN")).toEqual({ op: "IN", list: ["C"] });
  });

  it("단일 ↔ 단일은 left 를 유지한다", () => {
    expect(applyCellEdit(ONE, { op: "GT", left: "1000" }, "op", "GE")).toEqual({ op: "GE", left: "1000" });
  });

  it("그 밖에서 IN·NOT_IN 으로는 left 를 한 원소 목록으로", () => {
    expect(applyCellEdit(ONE, { op: "EQ", left: "A" }, "op", "IN")).toEqual({ op: "IN", list: ["A"] });
    expect(applyCellEdit(ONE, { op: "EQ", left: "" }, "op", "NOT_IN")).toEqual({ op: "NOT_IN", list: [] });
    expect(applyCellEdit(ONE, { op: "NA" }, "op", "IN")).toEqual({ op: "IN", list: [] });
  });

  it("CODE_IN 으로는 left 를 비운다", () => {
    expect(applyCellEdit(ONE, { op: "EQ", left: "A" }, "op", "CODE_IN")).toEqual({ op: "CODE_IN", left: "" });
  });

  it("NA·IS_NULL·NOT_NULL 은 op 만 남긴다", () => {
    for (const op of ["NA", "IS_NULL", "NOT_NULL"]) {
      expect(applyCellEdit(TWO, { op: "<= 변수 <", left: "1", right: "2" }, "op", op)).toEqual({ op });
      expect(applyCellEdit(ONE, { op: "IN", list: ["A"] }, "op", op)).toEqual({ op });
    }
  });

  it("IN·NOT_IN 의 값 칸은 콤마·줄바꿈으로 끊어 trim 하고 빈 원소를 뺀다", () => {
    expect(applyCellEdit(ONE, { op: "IN", list: ["A"] }, "left", " A , B,\nC,, ")).toEqual({ op: "IN", list: ["A", "B", "C"] });
    expect(applyCellEdit(ONE, { op: "NOT_IN", list: [] }, "left", "C")).toEqual({ op: "NOT_IN", list: ["C"] });
    expect(applyCellEdit(ONE, { op: "IN", list: [] }, "left", "A\nB")).toEqual({ op: "IN", list: ["A", "B"] });
  });

  it("그 밖의 left·right 는 trim 한다", () => {
    expect(applyCellEdit(TWO, { op: "<= 변수 <", left: "1", right: "2" }, "left", " 1.6 ")).toEqual({ op: "<= 변수 <", left: "1.6", right: "2" });
    expect(applyCellEdit(TWO, { op: "<= 변수 <", left: "1", right: "2" }, "right", " 2.5 ")).toEqual({ op: "<= 변수 <", left: "1", right: "2.5" });
    expect(applyCellEdit(ONE, { op: "GT", left: "1" }, "left", " 1000 ")).toEqual({ op: "GT", left: "1000" });
  });

  it("결과 값은 {val} 하나로 trim 해 쓴다", () => {
    expect(applyCellEdit(RESULT, undefined, "val", " D ")).toEqual({ val: "D" });
    expect(applyCellEdit(RESULT, { val: "A" }, "val", "B")).toEqual({ val: "B" });
  });

  it("값을 잠근 칸(NA·IS_NULL·NOT_NULL, 셀 없음)과 구간이 아닌 상한은 바꾸지 않는다", () => {
    expect(applyCellEdit(ONE, { op: "NA" }, "left", "1")).toEqual({ op: "NA" });
    expect(applyCellEdit(ONE, { op: "IS_NULL" }, "left", "1")).toEqual({ op: "IS_NULL" });
    expect(applyCellEdit(ONE, undefined, "left", "1")).toBeUndefined();
    expect(applyCellEdit(TWO, { op: "GE", left: "1" }, "right", "9")).toEqual({ op: "GE", left: "1" });
  });

  it("조건 식 칸: 넣으면 {expr}(op·ast 없음, trim), 비우면 무관 {op:NA}, 무관은 켜기만 한다(D7 번복)", () => {
    const expr = cv("Expression", "STRING", { varName: null });
    const cell: CellObj = { expr: "A > 1", ast: { type: "X" } };
    expect(applyCellEdit(expr, cell, "expr", "  B > 2 ")).toEqual({ expr: "B > 2" });
    expect(applyCellEdit(expr, { op: "NA" }, "expr", "B > 2")).toEqual({ expr: "B > 2" });
    expect(applyCellEdit(expr, undefined, "expr", "B > 2")).toEqual({ expr: "B > 2" });
    expect(applyCellEdit(expr, cell, "expr", "")).toEqual({ op: "NA" });
    expect(applyCellEdit(expr, cell, "expr", "   ")).toEqual({ op: "NA" });
    expect(applyCellEdit(expr, cell, "na", true)).toEqual({ op: "NA" });
    expect(applyCellEdit(expr, undefined, "na", true)).toEqual({ op: "NA" }); // 나중에 더한 열 — 셀이 없던 행
    expect(applyCellEdit(expr, cell, "na", false)).toBe(cell);
    const na: CellObj = { op: "NA" };
    expect(applyCellEdit(expr, na, "na", false)).toBe(na);
    expect(applyCellEdit(expr, na, "na", true)).toBe(na);
  });

  it("결과 식 칸: 넣으면 {expr}(ast 없음, trim), 비우면 칸을 없앤다", () => {
    const rExpr = cv("Expression", "NUMBER", { varKind: "RESULT" });
    expect(applyCellEdit(rExpr, { expr: "1.05", ast: {} }, "expr", " 2 ")).toEqual({ expr: "2" });
    expect(applyCellEdit(rExpr, undefined, "expr", "A * 2")).toEqual({ expr: "A * 2" });
    expect(applyCellEdit(rExpr, { expr: "1.05", ast: {} }, "expr", "")).toBeUndefined();
    expect(applyCellEdit(rExpr, { expr: "1.05", ast: {} }, "val", "3")).toEqual({ expr: "1.05", ast: {} });
    expect(applyCellEdit(rExpr, { expr: "1.05", ast: {} }, "na", true)).toEqual({ expr: "1.05", ast: {} });
  });

  it("식 칸이 바뀌지 않으면 받은 셀 객체(와 서버 ast)를 그대로 돌려준다", () => {
    const expr = cv("Expression", "STRING", { varName: null });
    const cell: CellObj = { expr: "A > 1", ast: { type: "X" } };
    expect(applyCellEdit(expr, cell, "expr", " A > 1 ")).toBe(cell);
    const na: CellObj = { op: "NA" };
    expect(applyCellEdit(expr, na, "expr", "")).toBe(na);
    const rExpr = cv("Expression", "NUMBER", { varKind: "RESULT" });
    const rCell: CellObj = { expr: "1.05", ast: {} };
    expect(applyCellEdit(rExpr, rCell, "expr", "1.05")).toBe(rCell);
    expect(applyCellEdit(rExpr, undefined, "expr", "")).toBeUndefined();
  });

  it("편집한 식 칸의 저장 형태에는 ast 가 없다", () => {
    const expr = cv("Expression", "STRING", { varId: 6, varName: null });
    const next = applyCellEdit(expr, { expr: "A > 1", ast: { type: "X" } }, "expr", "B > 2")!;
    const json = writeCells({ 1: { op: "GE", left: "1" }, 6: next });
    expect(json).toBe('{"1":{"op":"GE","left":"1"},"6":{"expr":"B > 2"}}');
    expect(json).not.toContain('"ast"');
  });

  it("결과 칸 키 순서는 06 순서(op,left,right,list,expr,ast,val)다", () => {
    expect(Object.keys(applyCellEdit(TWO, { right: "2", left: "1", op: "<= 변수 <" } as CellObj, "left", "3")!)).toEqual(["op", "left", "right"]);
  });
});

describe("저장 형태 ↔ 그리드 행", () => {
  it("샘플의 모든 행이 stored → grid → stored 로 바이트 단위 같게 돌아온다", () => {
    const grid = gridRowsFromStored(SAMPLE_VARS, SAMPLE_ROWS);
    const back = storedRowsFromGrid(SAMPLE_VARS, grid);
    const bySeq = [...SAMPLE_ROWS].sort((a, b) => (a.rowKind === b.rowKind ? a.seq - b.seq : a.rowKind === "DEFAULT" ? 1 : -1));
    expect(back).toEqual(bySeq.map((r) => ({ rowId: r.rowId, seq: r.seq, rowKind: r.rowKind, cells: r.cells, note: r.note ?? null })));
  });

  it("코퍼스의 모든 행이 바이트 단위로 왕복한다", () => {
    const corpus = JSON.parse(fs.readFileSync(ANALYSIS_CORPUS_PATH, "utf8")) as {
      cases: Array<{ id: string; rule: { vars: ResolvedVar[]; rows: StoredRow[] } }>;
    };
    let n = 0;
    for (const c of corpus.cases) {
      const back = storedRowsFromGrid(c.rule.vars, gridRowsFromStored(c.rule.vars, c.rule.rows));
      const byId = new Map(back.map((r) => [r.rowId, r]));
      for (const r of c.rule.rows) {
        expect(byId.get(r.rowId)?.cells, `${c.id} row ${r.rowId}`).toBe(r.cells);
        n++;
      }
    }
    expect(n).toBeGreaterThanOrEqual(100);
  });

  it("그리드 행은 NORMAL 을 seq→rowId 순, 기본 행을 끝에 둔다", () => {
    const rows: StoredRow[] = [
      { rowId: 9, seq: 0, rowKind: "DEFAULT", cells: "{}" },
      { rowId: 5, seq: 2, rowKind: "NORMAL", cells: "{}" },
      { rowId: 3, seq: 1, rowKind: "NORMAL", cells: "{}" },
    ];
    expect(gridRowsFromStored([], rows).map((r) => r.rowId)).toEqual([3, 5, 9]);
  });

  it("그리드 → 저장 형태의 seq 는 보낸 순서대로 NORMAL 1..n, 기본 행 0 이다", () => {
    const grid = gridRowsFromStored(SAMPLE_VARS, SAMPLE_ROWS);
    const swapped = [grid[2], grid[0], grid[1], grid[3]];
    expect(storedRowsFromGrid(SAMPLE_VARS, swapped).map((r) => [r.rowId, r.seq])).toEqual([
      [3, 1],
      [1, 2],
      [2, 3],
      [4, 0],
    ]);
  });
});

describe("새 행·기본 행·순서(I21)", () => {
  it("새 행은 조건 셀 모두 {op:NA}, 결과 셀 없음(Expression 조건 열도 NA)", () => {
    const vars = [...SAMPLE_VARS, { ...cv("Expression", "STRING"), varId: 6, seq: 4, varName: null }];
    const row = newNormalRow(vars, -1);
    expect(row.rowId).toBe(-1);
    expect(row.rowKind).toBe("NORMAL");
    expect(row.cells).toEqual({ 1: { op: "NA" }, 2: { op: "NA" }, 3: { op: "NA" }, 6: { op: "NA" } });
  });

  it("기본 행은 조건 셀이 없다", () => {
    const row = newDefaultRow(-2);
    expect(row).toMatchObject({ rowId: -2, rowKind: "DEFAULT", seq: 0 });
    expect(row.cells).toEqual({});
  });

  it("resequence 는 NORMAL 만 1..n 이고 기본 행은 늘 마지막(seq 0)", () => {
    const grid = gridRowsFromStored(SAMPLE_VARS, SAMPLE_ROWS);
    const moved = resequence([grid[3], grid[2], grid[0], grid[1]]);
    expect(moved.map((r) => [r.rowId, r.seq])).toEqual([
      [3, 1],
      [1, 2],
      [2, 3],
      [4, 0],
    ]);
  });
});

describe("ruleDefFromStored — 서버 RuleAnalysisInputMapper 와 같은 규칙(§6.5)", () => {
  it("06 표기 DISP_TYPE 을 분석기 표기로 바꾼다", () => {
    const vars: ResolvedVar[] = [
      cv("Equal", "STRING", { varId: 1 }),
      cv("1", "NUMBER", { varId: 2 }),
      cv("2", "NUMBER", { varId: 3 }),
      cv("Expression", "STRING", { varId: 4, varName: "A > 1" }),
      cv("Value", "STRING", { varId: 5, varKind: "RESULT", varName: "R" }),
      cv(null, "STRING", { varId: 6 }),
      cv(null, "STRING", { varId: 7, varKind: "RESULT", varName: "R2" }),
    ];
    const def = ruleDefFromStored("T", "DECISION", "FIRST", vars, []);
    expect(def.vars.map((v) => v.dispType)).toEqual(["EQUAL", "ONE", "TWO", "EXPRESSION", "VALUE", "ONE", "VALUE"]);
  });

  it("식 변수와 Expression 조건 열은 이름이 없다(varName null)", () => {
    const def = ruleDefFromStored(
      "T",
      "DECISION",
      null,
      [cv("1", "NUMBER", { varId: 1, exprVar: true, varName: "A + B" }), cv("Expression", "STRING", { varId: 2, varName: "A > 1" }), cv("1", "NUMBER", { varId: 3, varName: "C" })],
      [],
    );
    expect(def.vars.map((v) => v.varName)).toEqual([null, null, "C"]);
    expect(def.hitPolicy).toBeNull();
  });

  it("셀 JSON 을 그대로 읽고 행 칸을 옮긴다", () => {
    const def = ruleDefFromStored("QLTY_GRD_JDG", "DECISION", "UNIQUE", SAMPLE_VARS, SAMPLE_ROWS);
    expect(def.ruleId).toBe("QLTY_GRD_JDG");
    expect(def.hitPolicy).toBe("UNIQUE");
    expect(def.rows[0]).toEqual({ rowId: 1, seq: 1, rowKind: "NORMAL", cells: JSON.parse(SAMPLE_ROWS[0].cells) });
    expect(def.vars[0]).toMatchObject({ varId: 1, varKind: "COND", dataType: "NUMBER", scale: 2, dateString: false });
  });
});
