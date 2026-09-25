/**
 * 샘플 룰 4종(06 원천) 서버·JS 행 고르기 동치(TSK-09-01 design.md §0.1·§3 B1, 수용 기준 "샘플 룰 4종 서버·JS 동치").
 *
 * 비교 대상은 행 선택(hitRows)·기본 행 적용 여부뿐이다 — `previewRule`은 결과 값(PRC_FCT·COIL_WGT·PROD_WGT 등)과 결과
 * 열 그룹(BASE_SPD) 선택을 계산하지 않는다(불변 규칙, design.md §5). `ruleDefFromStored`(grid-model.ts)도 `resGrp`·
 * `grpCondAst`를 옮기지 않으므로(같은 파일 `ruleDefFromStored`의 반환 객체 참고) 그룹 조건은 아예 평가되지 않는다 —
 * `BASE_SPD_LKP`의 TOP_RESIN_CD·COAT_SIDE 는 이 테스트 레코드에 필요 없다(`alwaysNames`가 조건 변수와 결과 변수
 * `grpCondAst`에서만 필수 키를 뽑는데, 그룹 조건이 없으므로 뽑히지 않는다).
 *
 * 변수·행(cells JSON)은 수기 전사가 아니라 `src/backend/mdm/sample/mdm-local-sample.sql`(TB_MDM_RULE_VAR·
 * TB_MDM_RULE_ROW, MARU_RULE_ID='QLTY_GRD_JDG'|'COIL_WGT_CALC'|'PROD_WGT_CALC'|'BASE_SPD_LKP', VER=1)의 INSERT 문에서
 * 그대로 옮겼다 — 이 시드의 op·left·right·list·val·expr 값이 `SampleRules.java`(06:1295-1329·H:440-461·465-497·
 * 520-531)의 리터럴과 같음을 Build 착수 시 육안으로 대조했다(자동 바이트 비교는 아니다, design.md D1 (b) — 뚜렷한
 * 실제 저장 표현이 있어 수기 전사 대신 이 경로를 썼다).
 * 기대 hitRows 는 `SampleRuleValueTest.java`(수용 기준 1)의 각 `@Test`가 `hitRows(r)`로 단언하는 값을 그대로 가져왔다
 * (새로 계산하지 않는다 — Java 테스트 결과가 정답). `QLTY_Q6`·`QLTY_Q7`·`PROD_P4`처럼 Java 가 결과 계약 오류를 던지거나
 * 조건 셀 타입 변환을 확인하는 케이스도 조용히 빼지 않고 아래에 명시적 경계 테스트로 옮겼다.
 */
import { describe, expect, it } from "vitest";

import { ruleDefFromStored, type StoredVar } from "../pages/dme/ruleEdit/decision-table/grid-model";
import type { StoredRow } from "../pages/dme/ruleEdit/types";
import { previewRule, type RulePreview } from "../src/evalex";

type Ok = Extract<RulePreview, { kind: "ok" }>;

function ok(p: RulePreview): Ok {
  expect(p.kind, JSON.stringify(p)).toBe("ok");
  return p as Ok;
}

function hitRowIds(p: RulePreview): number[] {
  return ok(p).hits.map((h) => h.rowId);
}

// ── QLTY_GRD_JDG v1 — FIRST(06:1295-1329·H:440-449) ────────────────────────────────────────────────

const QLTY_VARS: StoredVar[] = [
  { varId: 1, varKind: "COND", dispType: "2", seq: 1, varName: "COIL_THK", exprVar: false, dataType: "NUMBER" },
  { varId: 2, varKind: "COND", dispType: "1", seq: 2, varName: "COIL_WID", exprVar: false, dataType: "NUMBER" },
  { varId: 3, varKind: "COND", dispType: "1", seq: 3, varName: "SURF_GRD", exprVar: false, dataType: "STRING" },
  { varId: 4, varKind: "RESULT", dispType: "Value", seq: 1, varName: "QLTY_GRD", exprVar: false, dataType: "STRING" },
  { varId: 5, varKind: "RESULT", dispType: "Expression", seq: 2, varName: "PRC_FCT", exprVar: false, dataType: "NUMBER" },
];

const QLTY_ROWS: StoredRow[] = [
  {
    rowId: 1,
    seq: 1,
    rowKind: "NORMAL",
    cells:
      '{"1":{"op":"<= 변수 <","left":"1.6","right":"2.5"},"2":{"op":"GT","left":"1000"},"3":{"op":"IN","list":["A"]},"4":{"val":"A"},"5":{"expr":"1.05","ast":{"type":"NUMBER_LITERAL","value":"1.05"}}}',
  },
  {
    rowId: 2,
    seq: 2,
    rowKind: "NORMAL",
    cells:
      '{"1":{"op":"<= 변수 <","left":"1.6","right":"2.5"},"2":{"op":"GT","left":"1000"},"3":{"op":"IN","list":["B"]},"4":{"val":"B"},"5":{"expr":"1.00","ast":{"type":"NUMBER_LITERAL","value":"1.00"}}}',
  },
  {
    rowId: 3,
    seq: 3,
    rowKind: "NORMAL",
    cells:
      '{"1":{"op":"GE","left":"2.5"},"2":{"op":"NA"},"3":{"op":"NOT_IN","list":["C"]},"4":{"val":"B"},"5":{"expr":"ROUND(BASE_FCT * 0.98, 2)","ast":{"type":"FUNCTION","value":"ROUND","params":[{"type":"INFIX_OPERATOR","value":"*","params":[{"type":"VARIABLE_OR_CONSTANT","value":"BASE_FCT"},{"type":"NUMBER_LITERAL","value":"0.98"}]},{"type":"NUMBER_LITERAL","value":"2"}]}}}',
  },
  {
    rowId: 4,
    seq: 0,
    rowKind: "DEFAULT",
    cells: '{"4":{"val":"C"},"5":{"expr":"0.90","ast":{"type":"NUMBER_LITERAL","value":"0.90"}}}',
  },
];

const qltyRule = ruleDefFromStored("QLTY_GRD_JDG", "DECISION", "FIRST", QLTY_VARS, QLTY_ROWS);

describe("QLTY_GRD_JDG — FIRST(SampleRuleValueTest.QLTY_*)", () => {
  it("Q1 두께 1.8·폭 1200·표면 A: 1행 적중", () => {
    const p = previewRule(qltyRule, { COIL_THK: 1.8, COIL_WID: 1200, SURF_GRD: "A" });
    expect(hitRowIds(p)).toEqual([1]);
    expect(ok(p).defaultApplied).toBe(false);
  });

  it("Q2 표면 B: 2행 적중", () => {
    const p = previewRule(qltyRule, { COIL_THK: 1.8, COIL_WID: 1200, SURF_GRD: "B" });
    expect(hitRowIds(p)).toEqual([2]);
    expect(ok(p).defaultApplied).toBe(false);
  });

  it("Q3 두께 2.5·표면 A: 3행 적중(BASE_FCT 식 행 — 식 값 자체는 비교 대상 아님)", () => {
    const p = previewRule(qltyRule, { COIL_THK: 2.5, COIL_WID: 900, SURF_GRD: "A" });
    expect(hitRowIds(p)).toEqual([3]);
    expect(ok(p).defaultApplied).toBe(false);
  });

  it("Q6 경계 — Java 는 BASE_FCT 없이 3행 적중 시 RESULT_CHECK 로 던지지만(SampleRuleValueTest.QLTY_Q6), " +
    "previewRule 은 결과 계약을 보지 않으므로(불변 규칙 1) 3행 적중만 내고 통과한다 — 설계대로이며 결함이 아니다", () => {
    const p = previewRule(qltyRule, { COIL_THK: 2.5, COIL_WID: 900, SURF_GRD: "A" });
    expect(hitRowIds(p)).toEqual([3]);
    expect(p.kind).toBe("ok");
  });

  it("Q7 조건 셀 입력이 문자열·정수로 섞여 와도 선언 타입으로 바꿔 1행 적중(SampleRuleValueTest.QLTY_Q7)", () => {
    const p = previewRule(qltyRule, { COIL_THK: "1.8", COIL_WID: 1200, SURF_GRD: "A" });
    expect(hitRowIds(p)).toEqual([1]);
    expect(ok(p).defaultApplied).toBe(false);
  });

  it("Q4 두께 2.0(구간 사이): 무적중 — 기본 행 적용", () => {
    const p = previewRule(qltyRule, { COIL_THK: 2.0, COIL_WID: 900, SURF_GRD: "A" });
    expect(hitRowIds(p)).toEqual([]);
    expect(ok(p).defaultApplied).toBe(true);
  });

  it("Q5 표면 NULL: 가드로 거짓 — 기본 행 적용", () => {
    const p = previewRule(qltyRule, { COIL_THK: 3.0, COIL_WID: 900, SURF_GRD: null });
    expect(hitRowIds(p)).toEqual([]);
    expect(ok(p).defaultApplied).toBe(true);
  });
});

// ── COIL_WGT_CALC v1 — DERIVE(H:456-461) ───────────────────────────────────────────────────────────

const COIL_WGT_VARS: StoredVar[] = [
  { varId: 1, varKind: "RESULT", dispType: "Expression", seq: 1, varName: "COIL_WGT", exprVar: false, dataType: "NUMBER" },
];

const COIL_WGT_ROWS: StoredRow[] = [
  {
    rowId: 1,
    seq: 1,
    rowKind: "NORMAL",
    cells:
      '{"1":{"expr":"ROUND(COIL_THK * COIL_WID * COIL_LEN * SPEC_GRAV / 1000, 1)","ast":{"type":"FUNCTION","value":"ROUND","params":[{"type":"INFIX_OPERATOR","value":"/","params":[{"type":"INFIX_OPERATOR","value":"*","params":[{"type":"INFIX_OPERATOR","value":"*","params":[{"type":"INFIX_OPERATOR","value":"*","params":[{"type":"VARIABLE_OR_CONSTANT","value":"COIL_THK"},{"type":"VARIABLE_OR_CONSTANT","value":"COIL_WID"}]},{"type":"VARIABLE_OR_CONSTANT","value":"COIL_LEN"}]},{"type":"VARIABLE_OR_CONSTANT","value":"SPEC_GRAV"}]},{"type":"NUMBER_LITERAL","value":"1000"}]},{"type":"NUMBER_LITERAL","value":"1"}]}}}',
  },
];

const coilWgtRule = ruleDefFromStored("COIL_WGT_CALC", "DERIVE", null, COIL_WGT_VARS, COIL_WGT_ROWS);

describe("COIL_WGT_CALC — DERIVE(SampleRuleValueTest.COIL_원천_H_521_코일_중량)", () => {
  it("조건 변수가 없어 입력과 무관하게 1행만 고른다(구조만 확인, 값은 비교 대상 아님)", () => {
    const p = previewRule(coilWgtRule, {});
    expect(hitRowIds(p)).toEqual([1]);
    expect(ok(p).defaultApplied).toBe(false);
  });
});

// ── PROD_WGT_CALC v1 — DECISION/UNIQUE(H:465-474·06:207·226-229) ──────────────────────────────────
// CALC_BASIS 는 var 3 이지만 열 seq 는 2 다(SampleRules.java 주석 그대로).

const PROD_VARS: StoredVar[] = [
  { varId: 1, varKind: "COND", dispType: "Equal", seq: 1, varName: "PROD_TYPE", exprVar: false, dataType: "STRING" },
  { varId: 3, varKind: "COND", dispType: "Equal", seq: 2, varName: "CALC_BASIS", exprVar: false, dataType: "STRING" },
  { varId: 2, varKind: "RESULT", dispType: "Expression", seq: 1, varName: "PROD_WGT", exprVar: false, dataType: "NUMBER" },
];

const PROD_ROWS: StoredRow[] = [
  {
    rowId: 1,
    seq: 1,
    rowKind: "NORMAL",
    cells:
      '{"1":{"op":"EQ","left":"COIL"},"3":{"op":"EQ","left":"LEN"},"2":{"expr":"ROUND(COIL_THK * COIL_WID * COIL_LEN * SPEC_GRAV / 1000, 1)","ast":{"type":"FUNCTION","value":"ROUND","params":[{"type":"INFIX_OPERATOR","value":"/","params":[{"type":"INFIX_OPERATOR","value":"*","params":[{"type":"INFIX_OPERATOR","value":"*","params":[{"type":"INFIX_OPERATOR","value":"*","params":[{"type":"VARIABLE_OR_CONSTANT","value":"COIL_THK"},{"type":"VARIABLE_OR_CONSTANT","value":"COIL_WID"}]},{"type":"VARIABLE_OR_CONSTANT","value":"COIL_LEN"}]},{"type":"VARIABLE_OR_CONSTANT","value":"SPEC_GRAV"}]},{"type":"NUMBER_LITERAL","value":"1000"}]},{"type":"NUMBER_LITERAL","value":"1"}]}}}',
  },
  {
    rowId: 3,
    seq: 2,
    rowKind: "NORMAL",
    cells:
      '{"1":{"op":"EQ","left":"COIL"},"3":{"op":"EQ","left":"DIA"},"2":{"expr":"ROUND(PI / 4 * (COIL_OUT_DIA ^ 2 - COIL_IN_DIA ^ 2) * COIL_WID * (1 - COIL_VOID_RT / 100) * SPEC_GRAV / 1000000, 1)","ast":{"type":"FUNCTION","value":"ROUND","params":[{"type":"INFIX_OPERATOR","value":"/","params":[{"type":"INFIX_OPERATOR","value":"*","params":[{"type":"INFIX_OPERATOR","value":"*","params":[{"type":"INFIX_OPERATOR","value":"*","params":[{"type":"INFIX_OPERATOR","value":"*","params":[{"type":"INFIX_OPERATOR","value":"/","params":[{"type":"VARIABLE_OR_CONSTANT","value":"PI"},{"type":"NUMBER_LITERAL","value":"4"}]},{"type":"INFIX_OPERATOR","value":"-","params":[{"type":"INFIX_OPERATOR","value":"^","params":[{"type":"VARIABLE_OR_CONSTANT","value":"COIL_OUT_DIA"},{"type":"NUMBER_LITERAL","value":"2"}]},{"type":"INFIX_OPERATOR","value":"^","params":[{"type":"VARIABLE_OR_CONSTANT","value":"COIL_IN_DIA"},{"type":"NUMBER_LITERAL","value":"2"}]}]}]},{"type":"VARIABLE_OR_CONSTANT","value":"COIL_WID"}]},{"type":"INFIX_OPERATOR","value":"-","params":[{"type":"NUMBER_LITERAL","value":"1"},{"type":"INFIX_OPERATOR","value":"/","params":[{"type":"VARIABLE_OR_CONSTANT","value":"COIL_VOID_RT"},{"type":"NUMBER_LITERAL","value":"100"}]}]}]},{"type":"VARIABLE_OR_CONSTANT","value":"SPEC_GRAV"}]},{"type":"NUMBER_LITERAL","value":"1000000"}]},{"type":"NUMBER_LITERAL","value":"1"}]}}}',
  },
  {
    rowId: 2,
    seq: 3,
    rowKind: "NORMAL",
    cells:
      '{"1":{"op":"EQ","left":"SHEET"},"3":{"op":"NA"},"2":{"expr":"ROUND(COIL_THK * COIL_WID * SHEET_LEN * SHEET_CNT * SPEC_GRAV / 1000000, 1)","ast":{"type":"FUNCTION","value":"ROUND","params":[{"type":"INFIX_OPERATOR","value":"/","params":[{"type":"INFIX_OPERATOR","value":"*","params":[{"type":"INFIX_OPERATOR","value":"*","params":[{"type":"INFIX_OPERATOR","value":"*","params":[{"type":"INFIX_OPERATOR","value":"*","params":[{"type":"VARIABLE_OR_CONSTANT","value":"COIL_THK"},{"type":"VARIABLE_OR_CONSTANT","value":"COIL_WID"}]},{"type":"VARIABLE_OR_CONSTANT","value":"SHEET_LEN"}]},{"type":"VARIABLE_OR_CONSTANT","value":"SHEET_CNT"}]},{"type":"VARIABLE_OR_CONSTANT","value":"SPEC_GRAV"}]},{"type":"NUMBER_LITERAL","value":"1000000"}]},{"type":"NUMBER_LITERAL","value":"1"}]}}}',
  },
];

const prodRule = ruleDefFromStored("PROD_WGT_CALC", "DECISION", "UNIQUE", PROD_VARS, PROD_ROWS);

describe("PROD_WGT_CALC — UNIQUE(SampleRuleValueTest.PROD_P1~P3)", () => {
  it("P1 코일·길이 기준: 1행 적중", () => {
    const p = previewRule(prodRule, { PROD_TYPE: "COIL", CALC_BASIS: "LEN" });
    expect(hitRowIds(p)).toEqual([1]);
  });

  it("P2 코일·외경 기준: 3행 적중", () => {
    const p = previewRule(prodRule, { PROD_TYPE: "COIL", CALC_BASIS: "DIA" });
    expect(hitRowIds(p)).toEqual([3]);
  });

  it("P3 시트(CALC_BASIS 무관): 2행 적중", () => {
    const p = previewRule(prodRule, { PROD_TYPE: "SHEET", CALC_BASIS: null });
    expect(hitRowIds(p)).toEqual([2]);
  });

  it("P4 경계 — Java 는 SHEET_CNT 없음·SPEC_GRAV NULL 로 2행 적중 시 RESULT_CHECK 를 두 건 던지지만" +
    "(SampleRuleValueTest.PROD_P4), previewRule 은 결과 계약을 보지 않으므로(불변 규칙 1) 2행 적중만 내고 통과한다" +
    " — 설계대로이며 결함이 아니다", () => {
    const p = previewRule(prodRule, { PROD_TYPE: "SHEET", CALC_BASIS: null });
    expect(hitRowIds(p)).toEqual([2]);
    expect(p.kind).toBe("ok");
  });
});

// ── BASE_SPD_LKP v1 — DECISION/UNIQUE + 결과 열 그룹 BASE_SPD(06:71-79·H:476-497) ──────────────────
// 결과 열 그룹(RES_GRP·GRP_COND)은 `ruleDefFromStored`가 옮기지 않으므로(grid-model.ts, 이 파일 헤더 주석 참고) 이
// 테스트는 조건 변수 COIL_THK 하나로만 정해지는 "행 선택"만 확인한다 — 그룹에서 어떤 열이 선택되는지(TOP_RESIN_CD·
// COAT_SIDE 로 정해짐)는 서버 값 테스트 몫이라 여기서 다루지 않는다.

const BASE_SPD_VARS: StoredVar[] = [
  { varId: 1, varKind: "COND", dispType: "2", seq: 1, varName: "COIL_THK", exprVar: false, dataType: "NUMBER" },
  { varId: 2, varKind: "RESULT", dispType: "Value", seq: 1, varName: "TEXTURE", exprVar: false, dataType: "NUMBER" },
  { varId: 3, varKind: "RESULT", dispType: "Value", seq: 2, varName: "AKZO", exprVar: false, dataType: "NUMBER" },
  { varId: 4, varKind: "RESULT", dispType: "Value", seq: 3, varName: "FLUORO", exprVar: false, dataType: "NUMBER" },
  { varId: 5, varKind: "RESULT", dispType: "Value", seq: 4, varName: "WXL1", exprVar: false, dataType: "NUMBER" },
  { varId: 6, varKind: "RESULT", dispType: "Value", seq: 5, varName: "WXL2", exprVar: false, dataType: "NUMBER" },
  { varId: 7, varKind: "RESULT", dispType: "Value", seq: 6, varName: "BACK1", exprVar: false, dataType: "NUMBER" },
  { varId: 8, varKind: "RESULT", dispType: "Value", seq: 7, varName: "BACK2", exprVar: false, dataType: "NUMBER" },
  { varId: 9, varKind: "RESULT", dispType: "Value", seq: 8, varName: "GENERAL", exprVar: false, dataType: "NUMBER" },
];

const BASE_SPD_ROWS: StoredRow[] = [
  {
    rowId: 1,
    seq: 1,
    rowKind: "NORMAL",
    cells:
      '{"1":{"op":"< 변수 <=","left":"0","right":"0.5"},"2":{"val":"100"},"3":{"val":"100"},"4":{"val":"90"},"5":{"val":"110"},"6":{"val":"110"},"7":{"val":"110"},"8":{"val":"110"},"9":{"val":"120"}}',
  },
  {
    rowId: 2,
    seq: 2,
    rowKind: "NORMAL",
    cells:
      '{"1":{"op":"< 변수 <","left":"0.5","right":"0.6"},"2":{"val":"100"},"3":{"val":"100"},"4":{"val":"90"},"5":{"val":"110"},"6":{"val":"110"},"7":{"val":"110"},"8":{"val":"110"},"9":{"val":"110"}}',
  },
  {
    rowId: 3,
    seq: 3,
    rowKind: "NORMAL",
    cells:
      '{"1":{"op":"<= 변수 <","left":"0.6","right":"0.7"},"2":{"val":"90"},"3":{"val":"90"},"4":{"val":"80"},"5":{"val":"100"},"6":{"val":"100"},"7":{"val":"100"},"8":{"val":"100"},"9":{"val":"100"}}',
  },
  {
    rowId: 4,
    seq: 4,
    rowKind: "NORMAL",
    cells:
      '{"1":{"op":"<= 변수 <","left":"0.7","right":"0.8"},"2":{"val":"80"},"3":{"val":"80"},"4":{"val":"70"},"5":{"val":"90"},"6":{"val":"90"},"7":{"val":"90"},"8":{"val":"90"},"9":{"val":"90"}}',
  },
  {
    rowId: 5,
    seq: 5,
    rowKind: "NORMAL",
    cells:
      '{"1":{"op":"<= 변수 <","left":"0.8","right":"0.9"},"2":{"val":"70"},"3":{"val":"70"},"4":{"val":"60"},"5":{"val":"80"},"6":{"val":"80"},"7":{"val":"80"},"8":{"val":"80"},"9":{"val":"80"}}',
  },
  {
    rowId: 6,
    seq: 6,
    rowKind: "NORMAL",
    cells:
      '{"1":{"op":"<= 변수 <","left":"0.9","right":"1"},"2":{"val":"60"},"3":{"val":"60"},"4":{"val":"50"},"5":{"val":"70"},"6":{"val":"70"},"7":{"val":"70"},"8":{"val":"70"},"9":{"val":"70"}}',
  },
  {
    rowId: 7,
    seq: 7,
    rowKind: "NORMAL",
    cells:
      '{"1":{"op":"<= 변수 <=","left":"1","right":"1.2"},"2":{"val":"50"},"3":{"val":"50"},"4":{"val":"50"},"5":{"val":"70"},"6":{"val":"70"},"7":{"val":"60"},"8":{"val":"60"},"9":{"val":"60"}}',
  },
];

const baseSpdRule = ruleDefFromStored("BASE_SPD_LKP", "DECISION", "UNIQUE", BASE_SPD_VARS, BASE_SPD_ROWS);

describe("BASE_SPD_LKP — UNIQUE(SampleRuleValueTest.BASE_SPD_B1~B3, 행 선택만)", () => {
  it("B1 두께 0.65: 3행 적중(0.6<=두께<0.7)", () => {
    const p = previewRule(baseSpdRule, { COIL_THK: 0.65 });
    expect(hitRowIds(p)).toEqual([3]);
  });

  it("B2 두께 1.1: 7행 적중(1<=두께<=1.2)", () => {
    const p = previewRule(baseSpdRule, { COIL_THK: 1.1 });
    expect(hitRowIds(p)).toEqual([7]);
  });

  it("B3 두께 0.3: 1행 적중(0<두께<=0.5)", () => {
    const p = previewRule(baseSpdRule, { COIL_THK: 0.3 });
    expect(hitRowIds(p)).toEqual([1]);
  });
});
