import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type { AstNode, TypedValue } from "../../../src/contract/engine-contract.generated";
import { declaredTypes, evalExpr } from "../../../pages/dme/ruleSetEdit/debugger/expr-eval";
import { toEditFlow } from "../../../pages/dme/ruleSetEdit/flow-edit";
import type { ExprParse, RuleIo } from "../../../pages/dme/ruleSetEdit/types";

const v = (name: string): AstNode => ({ type: "VARIABLE_OR_CONSTANT", value: name }) satisfies AstNode;
const num = (n: string): AstNode => ({ type: "NUMBER_LITERAL", value: n }) satisfies AstNode;
const str = (s: string): AstNode => ({ type: "STRING_LITERAL", value: s }) satisfies AstNode;
const infix = (op: string, a: AstNode, b: AstNode): AstNode => ({ type: "INFIX_OPERATOR", value: op, params: [a, b] }) as AstNode;
const parse = (ast: AstNode, refVars: string[], over: Partial<ExprParse> = {}): ExprParse => ({ ast, refVars, supported: true, problems: [], ...over });
const N = (value: string): TypedValue => ({ type: "NUMBER", value });
const S = (value: string): TypedValue => ({ type: "STRING", value });
const types = { GT_THK: "NUMBER" } as const;

const GT = parse(infix(">", v("GT_THK"), num("10")), ["GT_THK"]);

describe("evalExpr", () => {
  it("조건식 참·거짓", () => {
    expect(evalExpr(GT, { GT_THK: N("12") }, types)).toEqual({ kind: "true" });
    expect(evalExpr(GT, { GT_THK: N("8") }, types)).toEqual({ kind: "false" });
  });
  it("선언 타입으로 변환하고 실패하면 변수 이름이 든 오류", () => {
    expect(evalExpr(GT, { GT_THK: S("12") }, types)).toEqual({ kind: "true" });
    const r = evalExpr(GT, { GT_THK: S("abc") }, types);
    expect(r.kind).toBe("error");
    expect((r as { text: string }).text).toContain("GT_THK");
  });
  it("문자열 비교·산술·NULL", () => {
    expect(evalExpr(parse(infix("=", v("GT_G"), str("A")), ["GT_G"]), { GT_G: S("A") }, {})).toEqual({ kind: "true" });
    expect(evalExpr(parse(infix("+", v("GT_THK"), num("1")), ["GT_THK"]), { GT_THK: N("12") }, types)).toEqual({ kind: "value", text: "13" });
    expect(evalExpr(parse(v("GT_X"), ["GT_X"]), { GT_X: { type: "NULL" } }, {})).toEqual({ kind: "null" });
  });
  it("폴백: 미지원·평가기 폴백·LIST 읽기", () => {
    expect(evalExpr({ ...GT, supported: false }, { GT_THK: N("12") }, types)).toEqual({ kind: "fallback" });
    const fn = { type: "FUNCTION", value: "MASTER_AT", params: [str("G")] } as unknown as AstNode;
    expect(evalExpr(parse(fn, []), {}, {})).toEqual({ kind: "fallback" });
    const list: TypedValue = { type: "LIST", items: [S("A")] };
    expect(evalExpr(parse(v("GT_L"), ["GT_L"]), { GT_L: list }, {})).toEqual({ kind: "fallback" });
    expect(evalExpr(GT, { GT_THK: N("12"), GT_L: list }, types)).toEqual({ kind: "true" });
  });
  it("식이 쓰지 않는 변수는 변환하지 않는다", () => {
    expect(evalExpr(GT, { GT_THK: N("12"), GT_OTHER: S("abc") }, { ...types, GT_OTHER: "NUMBER" })).toEqual({ kind: "true" });
  });
  it("problems 는 detail 을 ' / ' 로 잇는다", () => {
    const r = evalExpr({ ...GT, problems: [{ kind: "A", detail: "가" }, { kind: "B", detail: "나" }] }, {}, {});
    expect(r).toEqual({ kind: "error", text: "가 / 나" });
  });
});

describe("declaredTypes", () => {
  const io = (ruleId: string, cond: string, dt: string | null, res: string): RuleIo => ({
    ruleId, ruleName: ruleId, ruleKind: "DECISION", status: "INUSE", exists: true, releasedVer: "1.000", hitPolicy: "FIRST",
    conds: [{ name: cond, source: null, label: null, dataType: dt, scale: null, dateString: false, maruCodeId: null }],
    results: [{ name: res, source: null, label: null, dataType: "STRING", scale: null, dateString: false, maruCodeId: null }],
  }) as RuleIo;
  it("입력·결과 이름을 대문자 키로, 모르는 타입·null 은 뺀다", () => {
    const flow = toEditFlow(null, ["R_A", "R_B"]);
    const t = declaredTypes(flow, { R_A: io("R_A", "gt_thk", "NUMBER", "s_a"), R_B: io("R_B", "gt_bad", "WEIRD", "s_b") });
    expect(t.GT_THK).toBe("NUMBER");
    expect(t.S_A).toBe("STRING");
    expect("GT_BAD" in t).toBe(false);
    const t2 = declaredTypes(flow, { R_A: io("R_A", "gt_n", null, "s_a"), R_B: io("R_B", "x", "DATE", "s_b") });
    expect("GT_N" in t2).toBe(false);
    expect(t2.X).toBe("DATE");
  });
});

describe("declaredTypes 순서", () => {
  const mk = (ruleId: string, name: string, dt: string | null): RuleIo => ({
    ruleId, ruleName: ruleId, ruleKind: "DECISION", status: "INUSE", exists: true, releasedVer: "1.000", hitPolicy: "FIRST",
    conds: [{ name, source: null, label: null, dataType: dt, scale: null, dateString: false, maruCodeId: null }], results: [],
  }) as RuleIo;
  const flow = toEditFlow(null, ["R_A", "R_B"]);
  it("첫 non-null 타입이 이긴다", () => {
    expect(declaredTypes(flow, { R_A: mk("R_A", "x", null), R_B: mk("R_B", "x", "NUMBER") }).X).toBe("NUMBER");
    expect(declaredTypes(flow, { R_A: mk("R_A", "x", "STRING"), R_B: mk("R_B", "x", "NUMBER") }).X).toBe("STRING");
  });
});

describe("불변 9 — debugger 폴더 화면 JS 파서 금지", () => {
  it("evalex import 에 compile·usedVariables·prepare·validate·checkRecordKeys 가 없다", () => {
    const dir = path.resolve(__dirname, "../../../pages/dme/ruleSetEdit/debugger");
    const files = readdirSync(dir).filter((f) => /\.(ts|tsx)$/.test(f));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const source = readFileSync(path.join(dir, f), "utf8");
      const imports = [...source.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*"@\/evalex[^"]*"/g)].flatMap((m) => m[1].split(",").map((s) => s.trim()));
      for (const banned of ["compile", "usedVariables", "prepare", "validate", "checkRecordKeys"]) {
        expect(imports, `${f} 가 ${banned} 를 import`).not.toContain(banned);
      }
    }
  });
});
