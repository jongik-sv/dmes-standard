import { describe, expect, it } from "vitest";
import { computeInputContract, nullSafety, type RuleDef } from "../src/evalex";
import { E, PROD_WGT_CALC, PROD_WGT_CALC_PV2, cond, resolveType, result, row } from "./fixtures/evalex-rules";
import { ast } from "./helpers/parse-expr";

/** TSK-03-04 design.md §3.2 「evalex-input-contract.test.ts (14)」·§6.7. 기대값은 06:226-229 와 시안 PV2. */
const sorted = (xs: string[]) => [...xs].sort();
const names = (xs: { name: string }[]) => xs.map((x) => x.name);

describe("입력 계약", () => {
  const c1 = computeInputContract(PROD_WGT_CALC, resolveType);

  it("PROD_WGT_CALC: always 는 조건 열 순서의 PROD_TYPE, CALC_BASIS 다", () => {
    expect(names(c1.always)).toEqual(["PROD_TYPE", "CALC_BASIS"]);
  });

  it("PROD_WGT_CALC: 행은 seq 순서이고 cond 는 06 문자열이다", () => {
    expect(c1.rows.map((r) => r.rowId)).toEqual([1, 3, 2]);
    expect(c1.rows.map((r) => r.cond)).toEqual([
      "PROD_TYPE = COIL · CALC_BASIS = LEN",
      "PROD_TYPE = COIL · CALC_BASIS = DIA",
      "PROD_TYPE = SHEET",
    ]);
  });

  it("PROD_WGT_CALC: 행별 required 집합이 06 과 같고 optional 은 비었다", () => {
    const [r1, r3, r2] = c1.rows;
    expect(sorted(names(r1.required))).toEqual(sorted(["COIL_THK", "COIL_WID", "COIL_LEN", "SPEC_GRAV"]));
    expect(sorted(names(r3.required))).toEqual(sorted(["COIL_WID", "COIL_OUT_DIA", "COIL_IN_DIA", "COIL_VOID_RT", "SPEC_GRAV"]));
    expect(sorted(names(r2.required))).toEqual(sorted(["COIL_THK", "COIL_WID", "SHEET_LEN", "SHEET_CNT", "SPEC_GRAV"]));
    for (const r of c1.rows) expect(r.optional).toEqual([]);
  });

  it("VarType 은 타입 해석기가 준 값을 싣는다", () => {
    expect(c1.rows[0].required.find((v) => v.name === "COIL_THK")).toEqual({
      name: "COIL_THK",
      dataType: "NUMBER",
      scale: 2,
      domainId: "THK_MM",
    });
  });

  it("PV2: COALESCE(SPEC_GRAV, 7.85) 의 SPEC_GRAV 는 모든 행에서 optional 이다", () => {
    const c2 = computeInputContract(PROD_WGT_CALC_PV2, resolveType);
    for (const r of c2.rows) {
      expect(names(r.optional)).toEqual(["SPEC_GRAV"]);
      expect(names(r.required)).not.toContain("SPEC_GRAV");
    }
  });

  it("사칙연산·대소 비교·ROUND 인자 자리는 필수다", () => {
    expect(nullSafety(ast("ROUND(A * B, 1) > C"))).toEqual({ required: ["A", "B", "C"], optional: [] });
  });

  it("== 과 != 피연산자로만 쓰인 변수는 선택이다", () => {
    expect(nullSafety(ast('IF(A == "X", 1, 2)'))).toEqual({ required: [], optional: ["A"] });
    expect(nullSafety(ast("A != 1"))).toEqual({ required: [], optional: ["A"] });
  });

  it("COALESCE 의 마지막이 아닌 인자는 선택이고 마지막 인자는 바깥 문맥을 따른다", () => {
    expect(nullSafety(ast("COALESCE(A, B) * 2"))).toEqual({ required: ["B"], optional: ["A"] });
    expect(nullSafety(ast("COALESCE(A, B) == 1"))).toEqual({ required: [], optional: ["A", "B"] });
  });

  it("IF 의 NULL 검사로 막은 가지 안의 변수는 선택이다", () => {
    expect(nullSafety(ast("IF(X != NULL, X * 2, 0)"))).toEqual({ required: [], optional: ["X"] });
    expect(nullSafety(ast("IF(X == NULL, 0, X * 2)"))).toEqual({ required: [], optional: ["X"] });
    expect(nullSafety(ast("IF(X != NULL, 1, X * 2)"))).toEqual({ required: ["X"], optional: [] });
  });

  it("&& 왼쪽의 != NULL 검사도 오른쪽을 막는다", () => {
    expect(nullSafety(ast("X != NULL && X > 1"))).toEqual({ required: [], optional: ["X"] });
    expect(nullSafety(ast("X == NULL || X > 1"))).toEqual({ required: [], optional: ["X"] });
    expect(nullSafety(ast("X == NULL && X > 1"))).toEqual({ required: ["X"], optional: [] });
  });

  it("STR_CONTAINS 인자와 MASTER key 는 선택이고 INSTR 인자는 바깥 문맥을 따른다", () => {
    expect(nullSafety(ast('STR_CONTAINS(A, "u")'))).toEqual({ required: [], optional: ["A"] });
    expect(nullSafety(ast('MASTER("C", "BASE", K)'))).toEqual({ required: [], optional: ["K"] });
    expect(nullSafety(ast('INSTR(S, "C") > 0'))).toEqual({ required: ["S"], optional: [] });
    expect(nullSafety(ast('INSTR(S, "C") == 1'))).toEqual({ required: [], optional: ["S"] });
  });

  it("MIN 인자와 식 뿌리의 맨 변수는 필수다", () => {
    expect(nullSafety(ast("MIN(A, 1)"))).toEqual({ required: ["A"], optional: [] });
    expect(nullSafety(ast("a"))).toEqual({ required: ["A"], optional: [] });
  });

  it("Expression 조건 셀과 열 조건의 변수는 always 이고 룰 결과 변수는 빠진다", () => {
    const rule: RuleDef = {
      ruleId: "R13",
      ruleKind: "DECISION",
      hitPolicy: "FIRST",
      vars: [
        cond(1, "ONE", "SURF_GRD", 1),
        cond(2, "EXPRESSION", null, 2, { dataType: "BOOLEAN" }),
        result(3, "VALUE", "QLTY_GRD", 1),
        result(4, "EXPRESSION", "BASE_FCT", 2, { resGrp: "FCT_GRP", grpCondAst: ast('STR_STARTS_WITH(TOP_RESIN_CD, "2")') }),
      ],
      rows: [
        row(1, 1, { 1: { op: "IN", list: ["A"] }, 2: E("COIL_THK * COIL_WID > 3000"), 3: { val: "A" }, 4: E("QLTY_GRD + SURF_GRD") }),
        row(2, 2, { 1: { op: "NA" }, 2: { op: "NA" }, 3: { val: "B" }, 4: E("COIL_WID * 2") }),
      ],
    };
    const c = computeInputContract(rule, resolveType);
    expect(names(c.always)).toEqual(["SURF_GRD", "COIL_THK", "COIL_WID", "TOP_RESIN_CD"]);
    expect(names(c.rows[0].required)).toEqual(["SURF_GRD"]);
    expect(c.rows.flatMap((r) => [...names(r.required), ...names(r.optional)])).not.toContain("QLTY_GRD");
    expect(c.rows[0].cond).toBe("SURF_GRD IN (A) · COIL_THK * COIL_WID > 3000");
    expect(c.rows[1].cond).toBe("-");
  });

  it("기본 행은 마지막에 싣고, 식 변수 열은 참조 변수를 always 에 넣는다", () => {
    const rule: RuleDef = {
      ruleId: "R14",
      ruleKind: "DECISION",
      hitPolicy: "FIRST",
      vars: [
        cond(7, "EQUAL", null, 1, { label: "품명", exprAst: ast("STR_SUBSTRING(MAT_CD, 1, 2)"), dataType: "STRING" }),
        result(8, "VALUE", "QLTY_GRD", 1),
      ],
      rows: [
        row(9, 0, { 8: { val: "C" } }, "DEFAULT"),
        row(1, 1, { 7: { op: "EQ", left: "A" }, 8: { val: "A" } }),
      ],
    };
    const c = computeInputContract(rule, resolveType);
    expect(names(c.always)).toEqual(["MAT_CD"]);
    expect(c.rows.map((r) => [r.rowId, r.cond])).toEqual([
      [1, "품명 = A"],
      [9, "기본 행"],
    ]);
  });
});
