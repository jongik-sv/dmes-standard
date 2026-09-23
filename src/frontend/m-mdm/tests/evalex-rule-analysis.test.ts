import { describe, expect, it } from "vitest";
import type { CellJson } from "../src/contract/engine-contract.generated";
import { analyzeRule, type HitPolicy, type RuleDef, type RuleIssue, type RuleVarDef } from "../src/evalex";
import { BASE_SPD_LKP, E, QLTY_GRD_JDG, row } from "./fixtures/evalex-rules";

/**
 * TSK-03-04 design.md §3.2 「evalex-rule-analysis.test.ts (21)」·§6.8.
 * 이슈 목록 전체를 {code, severity, rowIds, varId, lower, upper} 로 비교한다(message 제외, 부분 포함 검사 없음).
 */
type Issue = Omit<RuleIssue, "message">;

function project(issues: RuleIssue[]): Issue[] {
  return issues.map(({ code, severity, rowIds, varId, lower, upper }) => ({ code, severity, rowIds, varId, lower, upper }));
}

function col(varId: number, dataType: RuleVarDef["dataType"], dispType: RuleVarDef["dispType"] = "ONE", extra: Partial<RuleVarDef> = {}): RuleVarDef {
  return { varId, varKind: "COND", dispType, seq: varId, varName: dispType === "EXPRESSION" ? null : `V${varId}`, dataType, ...extra };
}

function rule(hitPolicy: HitPolicy, vars: RuleVarDef[], rows: CellJson[][]): RuleDef {
  return {
    ruleId: "T",
    ruleKind: "DECISION",
    hitPolicy,
    vars,
    rows: rows.map((cells, i) => row(i + 1, i + 1, Object.fromEntries(cells.map((c, j) => [vars[j].varId, c])))),
  };
}

const I = (code: RuleIssue["code"], severity: RuleIssue["severity"], rowIds: number[], varId?: number, lower?: string, upper?: string): Issue => ({
  code,
  severity,
  rowIds,
  varId,
  lower,
  upper,
});
const NULL_GAP = (varId: number) => I("NULL_GAP", "WARNING", [], varId);
const analyze = (r: RuleDef) => project(analyzeRule(r));

const THK2 = col(1, "NUMBER", "TWO", { scale: 2 });
const R = (op: string, left: string, right: string) => ({ op, left, right }) as CellJson;
const S = (op: string, left: string) => ({ op, left }) as CellJson;
const L = (op: "IN" | "NOT_IN", ...list: string[]) => ({ op, list }) as CellJson;

describe("겹침·빈틈·도달 불가 분석", () => {
  it("06 저장 시 검사 예: 2.50 이 빈틈이고 NULL 빈틈은 따로 보인다", () => {
    const r = rule("UNIQUE", [THK2], [[R("<= 변수 <", "1.6", "2.5")], [R("< 변수 <=", "2.5", "3.0")]]);
    expect(analyze(r)).toEqual([I("VALUE_GAP", "WARNING", [1, 2], 1, "2.50", "2.50"), NULL_GAP(1)]);
  });

  it("이어진 구간이면 값 빈틈이 없다", () => {
    const r = rule("UNIQUE", [THK2], [[R("<= 변수 <", "1.6", "2.5")], [R("<= 변수 <=", "2.5", "3.0")]]);
    expect(analyze(r)).toEqual([NULL_GAP(1)]);
  });

  it("빈틈은 소수 자리수 격자로 판정한다", () => {
    const rows = [[R("<= 변수 <=", "1.6", "2.5")], [R("<= 변수 <=", "2.6", "3.0")]];
    expect(analyze(rule("UNIQUE", [col(1, "NUMBER", "TWO", { scale: 1 })], rows))).toEqual([NULL_GAP(1)]);
    expect(analyze(rule("UNIQUE", [col(1, "NUMBER", "TWO", { scale: 2 })], rows))).toEqual([
      I("VALUE_GAP", "WARNING", [1, 2], 1, "2.51", "2.59"),
      NULL_GAP(1),
    ]);
  });

  it("바깥 반직선은 빈틈으로 보고하지 않는다", () => {
    expect(analyze(rule("UNIQUE", [THK2], [[S("GE", "1.6")]]))).toEqual([NULL_GAP(1)]);
  });

  it("IS NULL 행이 있으면 NULL 빈틈이 없다", () => {
    expect(analyze(rule("UNIQUE", [THK2], [[S("GE", "0")], [{ op: "IS_NULL" }]]))).toEqual([]);
  });

  it("scale 이 없으면 그 열 리터럴의 최대 소수 자리수를 쓴다", () => {
    const r = rule("UNIQUE", [col(1, "NUMBER", "TWO", { scale: null })], [[R("<= 변수 <", "1.6", "2.5")], [R("< 변수 <=", "2.5", "3.05")]]);
    expect(analyze(r)).toEqual([I("VALUE_GAP", "WARNING", [1, 2], 1, "2.50", "2.50"), NULL_GAP(1)]);
  });

  it("다축은 나머지 조건 셀이 같은 행끼리 묶어 빈틈을 본다", () => {
    const r = rule("FIRST", [THK2, col(2, "NUMBER", "ONE", { scale: 0 })], [
      [R("<= 변수 <", "1.6", "2.5"), S("LT", "1000")],
      [R("<= 변수 <=", "2.5", "3.0"), S("LT", "1000")],
      [R("<= 변수 <", "1.6", "2.5"), S("GE", "1000")],
      [R("< 변수 <=", "2.5", "3.0"), S("GE", "1000")],
    ]);
    expect(analyze(r)).toEqual([I("VALUE_GAP", "WARNING", [3, 4], 1, "2.50", "2.50"), NULL_GAP(1), NULL_GAP(2)]);
  });

  it("UNIQUE 표의 겹침은 OVERLAP ERROR 다", () => {
    const r = rule("UNIQUE", [col(1, "STRING")], [[L("IN", "A")], [L("IN", "A", "B")]]);
    expect(analyze(r)).toEqual([I("OVERLAP", "ERROR", [1, 2]), NULL_GAP(1)]);
  });

  it("FIRST 표의 겹침은 OVERLAP WARNING 이고 뒤 행이 덮이면 UNREACHABLE 도 낸다", () => {
    const r = rule("FIRST", [col(1, "STRING")], [[L("IN", "A")], [L("IN", "A", "B")]]);
    expect(analyze(r)).toEqual([I("OVERLAP", "WARNING", [1, 2]), NULL_GAP(1)]);
  });

  it("= A 와 IN (A) 는 같은 집합이라 겹친다", () => {
    const r = rule("UNIQUE", [col(1, "STRING")], [[S("EQ", "A")], [L("IN", "A")]]);
    expect(analyze(r)).toEqual([I("OVERLAP", "ERROR", [1, 2]), NULL_GAP(1)]);
  });

  it("<> A 와 IS NULL 은 겹치지 않는다", () => {
    expect(analyze(rule("UNIQUE", [col(1, "STRING")], [[S("NE", "A")], [{ op: "IS_NULL" }]]))).toEqual([]);
  });

  it("한 열이라도 서로소면 두 행은 겹치지 않는다", () => {
    const r = rule("UNIQUE", [col(1, "STRING"), col(2, "STRING")], [
      [L("IN", "X"), L("IN", "A")],
      [L("IN", "X"), L("IN", "B")],
    ]);
    expect(analyze(r)).toEqual([NULL_GAP(1), NULL_GAP(2)]);
  });

  it("접두 패턴은 반개구간이다", () => {
    expect(analyze(rule("UNIQUE", [col(1, "STRING")], [[S("EQ", "SGC%")], [S("EQ", "SGCC")]]))).toEqual([
      I("OVERLAP", "ERROR", [1, 2]),
      NULL_GAP(1),
    ]);
    expect(analyze(rule("UNIQUE", [col(1, "STRING")], [[S("EQ", "SGC%")], [S("EQ", "SGD")]]))).toEqual([NULL_GAP(1)]);
  });

  it("정적으로 못 푸는 셀은 UNRESOLVED_CELL 이고 그 짝은 OVERLAP_UNRESOLVED 다", () => {
    const r = rule("UNIQUE", [col(1, "STRING")], [[S("EQ", "A%B")], [S("CONTAINS", "X")], [L("IN", "C")]]);
    expect(analyze(r)).toEqual([
      I("UNRESOLVED_CELL", "WARNING", [1], 1),
      I("UNRESOLVED_CELL", "WARNING", [2], 1),
      I("OVERLAP_UNRESOLVED", "WARNING", [1, 2]),
      I("OVERLAP_UNRESOLVED", "WARNING", [1, 3]),
      I("OVERLAP_UNRESOLVED", "WARNING", [2, 3]),
      NULL_GAP(1),
    ]);
  });

  it("Expression 셀이 낀 짝은 OVERLAP_UNRESOLVED 이고 Expression 열은 NULL 빈틈 대상이 아니다", () => {
    const r = rule("UNIQUE", [col(1, "NUMBER"), col(2, "BOOLEAN", "EXPRESSION")], [
      [S("GE", "1"), E("A > 1")],
      [S("GE", "2"), E("A > 2")],
    ]);
    expect(analyze(r)).toEqual([
      I("UNRESOLVED_CELL", "WARNING", [1], 2),
      I("UNRESOLVED_CELL", "WARNING", [2], 2),
      I("OVERLAP_UNRESOLVED", "WARNING", [1, 2]),
      NULL_GAP(1),
    ]);
  });

  it("조건 셀이 전부 - 인 NORMAL 행은 ALL_NA_ROW ERROR 다", () => {
    const r = rule("UNIQUE", [THK2, col(2, "STRING")], [
      [S("GE", "1.6"), L("IN", "A")],
      [{ op: "NA" }, { op: "NA" }],
    ]);
    expect(analyze(r)).toEqual([I("ALL_NA_ROW", "ERROR", [2]), NULL_GAP(1), NULL_GAP(2)]);
  });

  it("FIRST: 앞 행 하나가 뒤 행을 덮으면 UNREACHABLE 이다", () => {
    const r = rule("FIRST", [THK2], [[S("GE", "1.6")], [R("<= 변수 <", "1.6", "2.5")]]);
    expect(analyze(r)).toEqual([I("OVERLAP", "WARNING", [1, 2]), I("UNREACHABLE", "WARNING", [2, 1]), NULL_GAP(1)]);
  });

  it("FIRST: 앞 행 여럿의 합집합이 덮어도 UNREACHABLE 이고 한 칸이라도 비면 아니다", () => {
    const vars = [col(1, "NUMBER", "TWO", { scale: 1 }), col(2, "STRING")];
    const covered = rule("FIRST", vars, [
      [S("LT", "2"), L("IN", "A")],
      [S("GE", "2"), L("IN", "A")],
      [R("<= 변수 <=", "1", "3"), S("EQ", "A")],
    ]);
    expect(analyze(covered)).toEqual([
      I("OVERLAP", "WARNING", [1, 3]),
      I("OVERLAP", "WARNING", [2, 3]),
      I("UNREACHABLE", "WARNING", [3, 1, 2]),
      NULL_GAP(1),
      NULL_GAP(2),
    ]);
    const hole = rule("FIRST", vars, [
      [S("LT", "2"), L("IN", "A")],
      [S("GT", "2"), L("IN", "A")],
      [R("<= 변수 <=", "1", "3"), S("EQ", "A")],
    ]);
    expect(analyze(hole)).toEqual([I("OVERLAP", "WARNING", [1, 3]), I("OVERLAP", "WARNING", [2, 3]), NULL_GAP(1), NULL_GAP(2)]);
  });

  it("UNIQUE 표에는 UNREACHABLE 을 내지 않는다", () => {
    const r = rule("UNIQUE", [THK2], [[S("GE", "1.6")], [R("<= 변수 <", "1.6", "2.5")]]);
    expect(analyze(r)).toEqual([I("OVERLAP", "ERROR", [1, 2]), NULL_GAP(1)]);
  });

  it("06 샘플 두 표", () => {
    expect(analyze(QLTY_GRD_JDG)).toEqual([NULL_GAP(1), NULL_GAP(3)]);
    expect(analyze(BASE_SPD_LKP)).toEqual([NULL_GAP(1)]);
  });

  it("Boolean 과 일자 String 은 이산 값으로 본다", () => {
    expect(analyze(rule("UNIQUE", [col(1, "BOOLEAN")], [[S("EQ", "TRUE")], [S("EQ", "FALSE")]]))).toEqual([NULL_GAP(1)]);
    const dt = col(1, "STRING", "ONE", { dateString: true });
    expect(analyze(rule("UNIQUE", [dt], [[S("LT", "20260902")], [S("GT", "20260901")]]))).toEqual([NULL_GAP(1)]);
    expect(analyze(rule("UNIQUE", [col(1, "STRING")], [[S("LT", "20260902")], [S("GT", "20260901")]]))).toEqual([
      I("OVERLAP", "ERROR", [1, 2]),
      NULL_GAP(1),
    ]);
  });
});
