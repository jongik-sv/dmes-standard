import { describe, expect, it } from "vitest";
import type { AstNode } from "../../../src/evalex";
import {
  EvalexError,
  compile,
  convertForType,
  evaluate,
  isSupported,
  prepare,
  toTypedValue,
  usedVariables,
  validate,
} from "../../../src/evalex";
import { ast } from "./helpers/parse-expr";

/** TSK-03-04 design.md §3.2 「evalex-interpreter.test.ts (16)」·§6.3·§6.4. */
const CS = { "PROC_CD|PLATING": ["82", "84"] };

/** 레코드 숫자 값 — 화면 그리드가 주는 십진 문자열을 선언 타입(NUMBER)으로 바꾼 것(원문 스케일을 싣는다). */
const num = (text: string) => convertForType(text, "NUMBER");

function value(expr: string, vars: Record<string, ReturnType<typeof num>> = {}) {
  const out = evaluate(ast(expr), vars);
  expect(out.kind, JSON.stringify(out)).toBe("value");
  return out.kind === "value" ? toTypedValue(out.value) : undefined;
}

describe("evalex 인터프리터", () => {
  it("isSupported: 6종 노드와 BASE 함수만 쓴 AST 는 참이다", () => {
    expect(isSupported(ast("IF(A > 1, ROUND(A, 2), STR_LEFT(B, 2))"))).toBe(true);
  });

  it("isSupported: MASTER_AT 은 거짓이다", () => {
    expect(isSupported(ast('MASTER_AT("PROC_CD", "PLATING", P, "20260901")'), { codeSets: CS })).toBe(false);
  });

  it("isSupported: MASTER 는 codeSets 에 id|cate 집합이 있을 때만 참이다", () => {
    const m = ast('MASTER("PROC_CD", "PLATING", P)');
    expect(isSupported(m)).toBe(false);
    expect(isSupported(m, { codeSets: CS })).toBe(true);
    expect(isSupported(ast('MASTER("PROC_CD", "PAINT", P)'), { codeSets: CS })).toBe(false);
    expect(isSupported(ast('MASTER(ID, "PLATING", P)'), { codeSets: CS })).toBe(false);
  });

  it("isSupported: MASTER 의 attr 형태는 거짓이다", () => {
    expect(isSupported(ast('MASTER("PROC_CD", "PLATING", P, "NAME")'), { codeSets: CS })).toBe(false);
  });

  it("isSupported: 허용 밖 함수와 인자 수가 틀린 INSTR 은 거짓이다", () => {
    expect(isSupported(ast("LOG(A)"))).toBe(false);
    expect(isSupported(ast('INSTR(A, "B", "C")'))).toBe(false);
    expect(isSupported(ast('INSTR(A, "B")'))).toBe(true);
  });

  it("isSupported: 알 수 없는 노드 종류는 거짓이다", () => {
    const unknown = { type: "ARRAY_INDEX", value: "[", params: [ast("A"), ast("1")] } as unknown as AstNode;
    expect(isSupported(unknown)).toBe(false);
    expect(isSupported({ type: "INFIX_OPERATOR", value: "+", params: [ast("A"), unknown] } as AstNode)).toBe(false);
  });

  it("usedVariables 는 대문자·첫 등장 순서이고 상수를 뺀다", () => {
    expect(usedVariables(ast("b + A * PI + B"))).toEqual(["B", "A"]);
    expect(usedVariables(ast("x != NULL && true"))).toEqual(["X"]);
  });

  it("예약 키는 평가 전에 거부된다", () => {
    const code = (vars: Record<string, string>) => {
      const out = evaluate(ast("1 == 1"), vars);
      return out.kind === "error" ? out.code : out.kind;
    };
    expect(code({ true: "1" })).toBe("CONSTANT_KEY");
    expect(code({ eval_ts: "1" })).toBe("EVAL_TS_KEY");
    expect(code({ _X: "1" })).toBe("RESERVED_KEY");
    expect(code({ A: "1", a: "2" })).toBe("RESERVED_KEY");
    expect(code({ A: "1" })).toBe("value");
  });

  it("같은 AST 객체는 compile 결과를 재사용한다", () => {
    const a = ast("A + 1");
    expect(compile(a)).toBe(compile(a));
    expect(compile(ast("A + 1"))).not.toBe(compile(a));
  });

  it("리터럴과 레코드 숫자는 원문 스케일로 문자열이 된다", () => {
    expect(value("STR_UPPER(1.50)")).toEqual({ type: "STRING", value: "1.50" });
    const x = evaluate(ast('"" + X'), { X: num("1.10") });
    expect(x.kind === "value" && x.value).toBe("1.10");
    const r = evaluate(ast('"" + ROUND(X, 2)'), { X: num("2.5") });
    expect(r.kind === "value" && r.value).toBe("2.50");
  });

  it("계산한 숫자를 문자열로 바꾸는 자리는 폴백한다", () => {
    expect(evaluate(ast('"" + (0.1 * 10)'), {}).kind).toBe("fallback");
  });

  it("혼합 타입 대소 비교는 폴백한다", () => {
    expect(evaluate(ast('1 < "2"'), {}).kind).toBe("fallback");
  });

  it("STR_TRIM 은 U+0020 이하만 자른다", () => {
    expect(value('STR_TRIM(" a ")')).toEqual({ type: "STRING", value: "a " });
    expect(value('STR_TRIM("\t a ")')).toEqual({ type: "STRING", value: "a" });
  });

  it("숫자 결과는 평문 십진 TypedValue 가 된다", () => {
    expect(value("SWITCH(X, 1, 10, 20)", { X: null })).toEqual({ type: "NUMBER", value: "20" });
    expect(value("1 / 3").value).toMatch(/^0\.3{68}$/);
    expect(value("10 ^ 30")).toEqual({ type: "NUMBER", value: "1" + "0".repeat(30) });
  });

  it("validate 는 결과가 boolean 이 아니면 EVALUATION_ERROR 다", () => {
    const ok = validate(ast("value >= 0.1"), { value: num("0.5") });
    expect(ok).toEqual({ kind: "value", value: true });
    const bad = validate(ast("value + 1"), { value: num("1") });
    expect(bad.kind === "error" && bad.code).toBe("EVALUATION_ERROR");
  });

  it("prepare 한 scope 를 여러 식에 다시 써도 결과가 같다", () => {
    const vars = { A: num("1.10"), B: num("2") };
    const s = prepare(vars);
    const e1 = ast("A + B == 3.1");
    const e2 = ast('STR_UPPER("" + A)');
    expect(evaluate(e1, s)).toEqual(evaluate(e1, vars));
    expect(evaluate(e2, s)).toEqual(evaluate(e2, vars));
    expect(evaluate(e1, s)).toEqual({ kind: "value", value: true });
    expect(evaluate(e2, s)).toEqual({ kind: "value", value: "1.10" });
    expect(() => prepare({ Pi: "1" })).toThrow(EvalexError);
    expect(() => prepare({ Pi: "1" })).toThrow(expect.objectContaining({ code: "CONSTANT_KEY" }));
  });
});
