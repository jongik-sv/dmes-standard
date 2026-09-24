// TSK-08-02 design I18 — op 코드·표기와 `opsFor`(06:310 목록 순서 그대로, 최근 쓴 op 를 올리지 않는다).
import { describe, expect, it } from "vitest";

import { OP_LABELS, RANGE_OPS, opsFor } from "../../../pages/dme/ruleEdit/decision-table/ops";
import type { ResolvedVar } from "../../../pages/dme/ruleEdit/types";

function v(dispType: ResolvedVar["dispType"], dataType: ResolvedVar["dataType"], extra: Partial<ResolvedVar> = {}): ResolvedVar {
  return {
    varId: 1,
    varKind: "COND",
    dispType,
    seq: 1,
    varName: "V",
    exprVar: false,
    dataType,
    dateString: false,
    typeSource: "COLUMN",
    ...extra,
  };
}

describe("op 코드·표기(I18)", () => {
  it("코드 → 표기", () => {
    expect(OP_LABELS).toEqual({
      NA: "-",
      EQ: "=",
      NE: "<>",
      LT: "<",
      LE: "<=",
      GT: ">",
      GE: ">=",
      IN: "IN",
      NOT_IN: "NOT IN",
      CODE_IN: "IN 카테고리",
      CONTAINS: "CONTAINS",
      INSTR: "INSTR",
      IS_NULL: "IS NULL",
      NOT_NULL: "IS NOT NULL",
      "<= 변수 <=": "<= 변수 <=",
      "<= 변수 <": "<= 변수 <",
      "< 변수 <=": "< 변수 <=",
      "< 변수 <": "< 변수 <",
    });
    expect(RANGE_OPS).toEqual(["<= 변수 <=", "<= 변수 <", "< 변수 <=", "< 변수 <"]);
  });
});

describe("opsFor(06:310)", () => {
  it("1 타입 String 9줄", () => {
    expect(opsFor(v("1", "STRING"))).toEqual(["NA", "EQ", "NE", "IN", "NOT_IN", "CONTAINS", "INSTR", "IS_NULL", "NOT_NULL"]);
  });

  it("1 타입 Number 11줄", () => {
    expect(opsFor(v("1", "NUMBER"))).toEqual(["NA", "EQ", "NE", "LT", "LE", "GT", "GE", "IN", "NOT_IN", "IS_NULL", "NOT_NULL"]);
  });

  it("1 타입 일자 String 은 Number 와 같은 11줄(패턴·CONTAINS·INSTR 없음)", () => {
    expect(opsFor(v("1", "STRING", { dateString: true }))).toEqual(opsFor(v("1", "NUMBER")));
    expect(opsFor(v("1", "DATE"))).toEqual(opsFor(v("1", "NUMBER")));
  });

  it("1 타입 코드 도메인 String 은 10줄(IN 카테고리 추가)", () => {
    const ops = opsFor(v("1", "STRING", { maruCodeId: "PLATING" }));
    expect(ops).toHaveLength(10);
    expect(ops).toEqual(["NA", "EQ", "NE", "IN", "NOT_IN", "CODE_IN", "CONTAINS", "INSTR", "IS_NULL", "NOT_NULL"]);
  });

  it("1 타입 Boolean 4줄", () => {
    expect(opsFor(v("1", "BOOLEAN"))).toEqual(["NA", "EQ", "IS_NULL", "NOT_NULL"]);
  });

  it("2 타입은 1 타입 목록 끝에 구간 넷을 더한다(Number 15줄)", () => {
    expect(opsFor(v("2", "NUMBER"))).toEqual([...opsFor(v("1", "NUMBER")), ...RANGE_OPS]);
    expect(opsFor(v("2", "NUMBER"))).toHaveLength(15);
    expect(opsFor(v("2", "STRING", { dateString: true }))).toHaveLength(15);
    expect(opsFor(v("2", "STRING"))).toHaveLength(13);
  });

  it("Equal·Expression 조건 열과 결과 열은 목록이 없다", () => {
    expect(opsFor(v("Equal", "STRING"))).toEqual([]);
    expect(opsFor(v("Expression", "STRING"))).toEqual([]);
    expect(opsFor(v("Value", "STRING", { varKind: "RESULT" }))).toEqual([]);
  });

  it("DISP_TYPE 이 비면 조건 열은 1 타입으로 본다(서버 변환기와 같다)", () => {
    expect(opsFor(v(null, "NUMBER"))).toEqual(opsFor(v("1", "NUMBER")));
  });
});
