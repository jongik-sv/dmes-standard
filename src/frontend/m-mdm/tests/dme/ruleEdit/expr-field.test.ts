// TSK-08-03 design §3.2 — ExprField 의 로직(디바운스 서버 파싱·화이트리스트 표시·자동완성 소스). 파싱은 서버 호출만 쓰고
// 화면 JS 파서를 만들지 않는다(불변 9) — 마지막 테스트가 expr 소스가 evalex 컴파일·변수 추출 함수를 import 하지 않음을 지킨다.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PARSE_DEBOUNCE_MS,
  canParseOnServer,
  createDebouncedParser,
  datalistOptions,
  describeParse,
  previewValue,
  programVariables,
} from "../../../pages/dme/ruleEdit/expr/parse-expr";
import { convertForType } from "../../../src/evalex";
import type { ParseExprResult, VarCandidate } from "../../../pages/dme/ruleEdit/types";

const CANDIDATES: VarCandidate[] = [
  { name: "COIL_THK", label: "두께", kind: "COLUMN" },
  { name: "PREV_GRADE", label: "앞 룰 결과", kind: "RULE_RESULT" },
  { name: "COIL_WID", label: null, kind: "COLUMN" },
];

const ok = (over: Partial<ParseExprResult> = {}): ParseExprResult => ({
  ast: { type: "VARIABLE_OR_CONSTANT", value: "COIL_THK" },
  refVars: ["COIL_THK"],
  supported: true,
  problems: [],
  ...over,
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("디바운스 서버 파싱", () => {
  it("입력이 이어지는 동안 호출하지 않고 멈춘 지 500ms 뒤 마지막 식으로 한 번만 서버를 부른다", async () => {
    const parse = vi.fn().mockResolvedValue(ok());
    const seen: unknown[] = [];
    const parser = createDebouncedParser(parse, (r) => seen.push(r));
    expect(PARSE_DEBOUNCE_MS).toBe(500);

    parser.request("COIL", "RULE_RESULT_EXPR");
    await vi.advanceTimersByTimeAsync(300);
    parser.request("COIL_THK", "RULE_RESULT_EXPR");
    await vi.advanceTimersByTimeAsync(300);
    expect(parse).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);

    expect(parse).toHaveBeenCalledTimes(1);
    expect(parse).toHaveBeenCalledWith("COIL_THK", "RULE_RESULT_EXPR");
    expect(seen).toEqual([{ text: "COIL_THK", slot: "RULE_RESULT_EXPR", result: ok() }]);
  });

  it("늦게 도착한 옛 응답은 버린다", async () => {
    let resolveFirst: (v: ParseExprResult) => void = () => {};
    const parse = vi
      .fn()
      .mockImplementationOnce(() => new Promise<ParseExprResult>((r) => (resolveFirst = r)))
      .mockResolvedValueOnce(ok({ refVars: ["B"] }));
    const seen: Array<{ text: string }> = [];
    const parser = createDebouncedParser(parse, (r) => seen.push(r));
    parser.request("A", "RULE_COND_EXPR");
    await vi.advanceTimersByTimeAsync(500);
    parser.request("B", "RULE_COND_EXPR");
    await vi.advanceTimersByTimeAsync(500);
    resolveFirst(ok({ refVars: ["A"] }));
    await vi.advanceTimersByTimeAsync(0);
    expect(seen.map((s) => s.text)).toEqual(["B"]);
  });

  it("빈 식은 서버를 부르지 않고 대기 중인 호출도 취소한다", async () => {
    const parse = vi.fn().mockResolvedValue(ok());
    const seen: Array<{ text: string; result: unknown }> = [];
    const parser = createDebouncedParser(parse, (r) => seen.push(r));
    parser.request("A", "RULE_COND_EXPR");
    parser.request("   ", "RULE_COND_EXPR");
    await vi.advanceTimersByTimeAsync(1000);
    expect(parse).not.toHaveBeenCalled();
    expect(seen).toEqual([{ text: "", slot: "RULE_COND_EXPR", result: null }]);
  });

  it("서버 오류(파싱 실패)는 오류 문구로 알린다", async () => {
    const parse = vi.fn().mockRejectedValue(new Error("식을 파싱할 수 없습니다: COIL_THK +"));
    const seen: Array<{ error?: string }> = [];
    const parser = createDebouncedParser(parse, (r) => seen.push(r as { error?: string }));
    parser.request("COIL_THK +", "RULE_RESULT_EXPR");
    await vi.advanceTimersByTimeAsync(500);
    expect(seen[0].error).toBe("식을 파싱할 수 없습니다: COIL_THK +");
  });

  it("cancel 하면 대기 중인 호출이 나가지 않는다", async () => {
    const parse = vi.fn().mockResolvedValue(ok());
    const parser = createDebouncedParser(parse, () => {});
    parser.request("A", "RULE_COND_EXPR");
    parser.cancel();
    await vi.advanceTimersByTimeAsync(1000);
    expect(parse).not.toHaveBeenCalled();
  });
});

describe("화이트리스트 밖·오류 표시", () => {
  it("화면이 평가하지 못하는 함수(supported=false)는 '서버 평가로 넘긴다' 로 표시한다", () => {
    const s = describeParse({ text: "MASTER(\"G\",\"C\",\"attr01\")", slot: "RULE_RESULT_EXPR", result: ok({ supported: false, refVars: [] }) }, CANDIDATES);
    expect(s.kind).toBe("unsupported");
    expect(s.message).toContain("서버 평가로 넘긴다");
  });

  it("지원되는 식은 참조 변수를 보이고 사전 밖 이름은 프로그램 변수로 구분한다", () => {
    const s = describeParse({ text: "COIL_THK + MY_VAR", slot: "RULE_RESULT_EXPR", result: ok({ refVars: ["COIL_THK", "MY_VAR", "PREV_GRADE"] }) }, CANDIDATES);
    expect(s.kind).toBe("ok");
    expect(s.refVars).toEqual(["COIL_THK", "MY_VAR", "PREV_GRADE"]);
    expect(s.programVars).toEqual(["MY_VAR"]);
  });

  it("서버 오류·서버 problems 는 오류로 표시한다", () => {
    expect(describeParse({ text: "x", slot: "RULE_COND_EXPR", error: "식을 파싱할 수 없습니다" }, CANDIDATES)).toMatchObject({ kind: "error", message: "식을 파싱할 수 없습니다" });
    const withProblem = describeParse({ text: "x", slot: "RULE_COND_EXPR", result: ok({ problems: [{ kind: "FUNCTION", detail: "허용되지 않는 함수: FOO" }] }) }, CANDIDATES);
    expect(withProblem.kind).toBe("error");
    expect(withProblem.message).toContain("허용되지 않는 함수: FOO");
  });

  it("결과가 없으면 대기(idle)다", () => {
    expect(describeParse(null, CANDIDATES).kind).toBe("idle");
  });
});

describe("자동완성 소스와 프로그램 변수", () => {
  it("datalist 는 컬럼 사전 물리명·앞 룰 결과 변수를 이름+표시명 값으로 준다", () => {
    expect(datalistOptions(CANDIDATES)).toEqual([
      { value: "COIL_THK", label: "두께 · 컬럼 사전" },
      { value: "PREV_GRADE", label: "앞 룰 결과 · 앞 룰 결과" },
      { value: "COIL_WID", label: "컬럼 사전" },
    ]);
  });

  it("programVariables 는 후보에 없는 이름만 돌려준다", () => {
    expect(programVariables(["COIL_THK", "X", "PREV_GRADE", "Y"], CANDIDATES)).toEqual(["X", "Y"]);
  });
});

describe("호출 권한", () => {
  it("parseExpr 는 EDIT 세트 action(validate)이라 편집 가능하고 validate 권한이 있을 때만 서버를 부른다", () => {
    expect(canParseOnServer({ editable: true, canValidate: true })).toBe(true);
    expect(canParseOnServer({ editable: true, canValidate: false })).toBe(false);
    expect(canParseOnServer({ editable: false, canValidate: true })).toBe(false);
  });
});

describe("평가 미리보기", () => {
  it("서버가 준 AST 를 화면 evalex 로 평가한다(식 텍스트를 화면에서 파싱하지 않는다)", () => {
    const ast = {
      type: "INFIX_OPERATOR",
      value: "*",
      params: [
        { type: "VARIABLE_OR_CONSTANT", value: "COIL_THK" },
        { type: "NUMBER_LITERAL", value: "2" },
      ],
    };
    expect(previewValue(ok({ ast }), { COIL_THK: convertForType("1.8", "NUMBER") })).toEqual({ kind: "value", text: "3.6" });
    expect(previewValue(ok({ ast, supported: false }), { COIL_THK: convertForType("1.8", "NUMBER") }).kind).toBe("fallback");
    expect(previewValue(ok({ ast }), {}).kind).toBe("error");
  });
});

describe("불변 9 — 화면 JS 파서 금지", () => {
  it("expr 폴더의 어떤 파일도 evalex 의 compile·usedVariables·prepare·validate 를 import 하지 않는다", () => {
    const dir = path.resolve(__dirname, "../../../pages/dme/ruleEdit/expr");
    const files = readdirSync(dir).filter((f) => /\.(ts|tsx)$/.test(f));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const source = readFileSync(path.join(dir, f), "utf8");
      const imports = [...source.matchAll(/import\s*\{([^}]*)\}\s*from\s*"@\/evalex[^"]*"/g)].flatMap((m) => m[1].split(",").map((s) => s.trim()));
      for (const banned of ["compile", "usedVariables", "prepare", "validate", "checkRecordKeys"]) {
        expect(imports, `${f} 가 ${banned} 를 import`).not.toContain(banned);
      }
    }
  });
});
