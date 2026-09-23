import { describe, expect, it } from "vitest";
import { previewRule, type HitPolicy, type RuleDef, type RulePreview } from "../src/evalex";
import { BASE_SPD_LKP, E, PROD_WGT_CALC, QLTY_GRD_JDG, cond, result, row } from "./fixtures/evalex-rules";
import { ast } from "./helpers/parse-expr";

/** TSK-03-04 design.md §3.2 「evalex-rule-preview.test.ts (13)」·§6.9. */
type Ok = Extract<RulePreview, { kind: "ok" }>;

function ok(p: RulePreview): Ok {
  expect(p.kind, JSON.stringify(p)).toBe("ok");
  return p as Ok;
}

const QREC = (thk: string | null, wid: string, surf: string | null) => ({ COIL_THK: thk, COIL_WID: wid, SURF_GRD: surf });

/** 두께 열 하나짜리 룰 — 행 1 `>= 1`, 행 2 `>= 2`. */
function twoBands(hitPolicy: HitPolicy): RuleDef {
  return {
    ruleId: "BANDS",
    ruleKind: "DECISION",
    hitPolicy,
    vars: [cond(1, "ONE", "COIL_THK", 1), result(2, "VALUE", "QLTY_GRD", 1)],
    rows: [row(1, 1, { 1: { op: "GE", left: "1" }, 2: { val: "A" } }), row(2, 2, { 1: { op: "GE", left: "2" }, 2: { val: "B" } })],
  };
}

describe("적중 정책 미리보기", () => {
  it("QLTY FIRST: 1행에 적중하고 뒤 행은 평가하지 않는다", () => {
    const p = ok(previewRule(QLTY_GRD_JDG, QREC("2.0", "1200", "A")));
    expect(p.hits).toEqual([{ rowId: 1, seq: 1 }]);
    expect(p.defaultApplied).toBe(false);
    expect(p.trace.map((t) => [t.rowId, t.evaluated, t.hit])).toEqual([
      [1, true, true],
      [2, false, false],
      [3, false, false],
    ]);
  });

  it("QLTY: 어느 행도 참이 아니면 기본 행이다", () => {
    const p = ok(previewRule(QLTY_GRD_JDG, QREC("3.0", "1200", "C")));
    expect(p.hits).toEqual([]);
    expect(p.defaultApplied).toBe(true);
    expect(p.trace.map((t) => [t.rowId, t.hit, t.firstFalseVarId])).toEqual([
      [1, false, 1],
      [2, false, 1],
      [3, false, 3],
    ]);
  });

  it("QLTY: 두께가 NULL 이면 두께 셀은 모두 거짓이다", () => {
    const p = ok(previewRule(QLTY_GRD_JDG, QREC(null, "1200", "A")));
    expect(p.trace.map((t) => [t.rowId, t.evaluated, t.hit, t.firstFalseVarId])).toEqual([
      [1, true, false, 1],
      [2, true, false, 1],
      [3, true, false, 1],
    ]);
    expect(p.defaultApplied).toBe(true);
  });

  it("UNIQUE 에서 두 행이 적중하면 UNIQUE_MULTIPLE_HITS 다", () => {
    const p = previewRule(twoBands("UNIQUE"), { COIL_THK: "2.5" });
    expect(p.kind === "error" && [p.code, p.rowIds]).toEqual(["UNIQUE_MULTIPLE_HITS", [1, 2]]);
  });

  it("PRIORITY·COLLECT·ANY 는 적중 행을 모두 돌려준다", () => {
    for (const policy of ["PRIORITY", "COLLECT", "ANY"] as const) {
      expect(ok(previewRule(twoBands(policy), { COIL_THK: "2.5" })).hits, policy).toEqual([
        { rowId: 1, seq: 1 },
        { rowId: 2, seq: 2 },
      ]);
    }
    expect(ok(previewRule(twoBands("FIRST"), { COIL_THK: "2.5" })).hits).toEqual([{ rowId: 1, seq: 1 }]);
  });

  it("PROD_WGT_CALC 값 테스트 세 사례의 적중 행", () => {
    const hit = (rec: Record<string, string | null>) => ok(previewRule(PROD_WGT_CALC, rec)).hits.map((h) => h.rowId);
    expect(hit({ PROD_TYPE: "COIL", CALC_BASIS: "LEN", COIL_THK: "1.8", COIL_WID: "1200", COIL_LEN: "1500", SPEC_GRAV: "7.85" })).toEqual([1]);
    expect(
      hit({ PROD_TYPE: "COIL", CALC_BASIS: "DIA", COIL_WID: "1200", COIL_OUT_DIA: "1800", COIL_IN_DIA: "610", COIL_VOID_RT: "1.5", SPEC_GRAV: "7.85" }),
    ).toEqual([3]);
    expect(
      hit({ PROD_TYPE: "SHEET", CALC_BASIS: null, COIL_THK: "0.8", COIL_WID: "1219", SHEET_LEN: "2438", SHEET_CNT: "120", SPEC_GRAV: "7.85" }),
    ).toEqual([2]);
  });

  it("BASE_SPD_LKP 0.65 는 3행이다", () => {
    const p = ok(previewRule(BASE_SPD_LKP, { COIL_THK: "0.65", TOP_RESIN_CD: "2A", COAT_SIDE: "1" }));
    expect(p.hits).toEqual([{ rowId: 3, seq: 3 }]);
  });

  it("조건 변수 키가 없으면 MISSING_KEY 이고 CALC_BASIS 는 시트 요청에도 필요하다", () => {
    const p = previewRule(PROD_WGT_CALC, { PROD_TYPE: "SHEET", COIL_THK: "0.8" });
    expect(p.kind === "error" && p.code).toBe("MISSING_KEY");
    expect(p.kind === "error" && p.message).toContain("CALC_BASIS");
    const lower = previewRule(PROD_WGT_CALC, { PROD_TYPE: "SHEET", calc_basis: null });
    expect(lower.kind === "error" && lower.code).toBe("MISSING_KEY");
  });

  it("조건 변수 값이 선언 타입으로 바뀌지 않으면 TYPE_CONVERSION 이다", () => {
    const p = previewRule(QLTY_GRD_JDG, QREC("abc", "1200", "A"));
    expect(p.kind === "error" && p.code).toBe("TYPE_CONVERSION");
  });

  it("레코드 키가 상수 이름이면 CONSTANT_KEY 다", () => {
    const p = previewRule(QLTY_GRD_JDG, { ...QREC("2.0", "1200", "A"), Pi: "3" });
    expect(p.kind === "error" && p.code).toBe("CONSTANT_KEY");
  });

  it("Expression 조건 셀이 지원 밖이면 폴백하되 다른 셀이 거짓인 행은 확정 거짓이다", () => {
    const r: RuleDef = {
      ruleId: "FB",
      ruleKind: "DECISION",
      hitPolicy: "FIRST",
      vars: [cond(1, "ONE", "SURF_GRD", 1), cond(2, "EXPRESSION", null, 2, { dataType: "BOOLEAN" }), result(3, "VALUE", "QLTY_GRD", 1)],
      rows: [
        row(1, 1, { 1: { op: "IN", list: ["X"] }, 2: E('MASTER_AT("PROC_CD", "PLATING", SURF_GRD, "20260901")'), 3: { val: "A" } }),
        row(2, 2, { 1: { op: "IN", list: ["A"] }, 2: E('MASTER_AT("PROC_CD", "PLATING", SURF_GRD, "20260901")'), 3: { val: "B" } }),
      ],
    };
    const p = previewRule(r, { SURF_GRD: "A" });
    expect(p.kind).toBe("fallback");
    if (p.kind !== "fallback") return;
    expect(p.trace.map((t) => [t.rowId, t.hit, t.firstFalseVarId])).toEqual([
      [1, false, 1],
      [2, null, null],
    ]);
    expect(p.trace[1].fallbackVarIds).toEqual([2]);
  });

  it("Expression 조건 셀 결과가 NULL 이면 그 셀만 거짓이고 EXPR_CELL_NULL 경고를 남긴다", () => {
    const r: RuleDef = {
      ruleId: "NULLCELL",
      ruleKind: "DECISION",
      hitPolicy: "FIRST",
      vars: [cond(1, "EXPRESSION", null, 1, { dataType: "BOOLEAN" }), result(2, "VALUE", "QLTY_GRD", 1)],
      rows: [row(1, 1, { 1: E("IF(A > 1, TRUE, NULL)"), 2: { val: "A" } })],
    };
    const p = ok(previewRule(r, { A: 0 }));
    expect(p.hits).toEqual([]);
    expect(p.trace[0]).toMatchObject({ rowId: 1, hit: false, firstFalseVarId: 1 });
    expect(p.warnings.map((w) => [w.code, w.ruleId, w.rowId, w.varId])).toEqual([["EXPR_CELL_NULL", "NULLCELL", 1, 1]]);
  });

  it("식 변수는 참조 변수가 NULL 이면 NULL 이고 IS NULL 셀만 참이다", () => {
    const r: RuleDef = {
      ruleId: "EXPRVAR",
      ruleKind: "DECISION",
      hitPolicy: "FIRST",
      vars: [
        cond(7, "ONE", null, 1, { label: "품명", exprAst: ast("STR_SUBSTRING(MAT_CD, 1, 2)"), dataType: "STRING" }),
        result(8, "VALUE", "QLTY_GRD", 1),
      ],
      rows: [row(1, 1, { 7: { op: "EQ", left: "A" }, 8: { val: "A" } }), row(2, 2, { 7: { op: "IS_NULL" }, 8: { val: "B" } })],
    };
    expect(ok(previewRule(r, { MAT_CD: null })).hits).toEqual([{ rowId: 2, seq: 2 }]);
    expect(ok(previewRule(r, { MAT_CD: "XAB" })).hits).toEqual([{ rowId: 1, seq: 1 }]);
  });
});
