import { describe, expect, it } from "vitest";
import { D, EvalexError, NUMBER_TEXT, convertForType } from "../../../src/evalex";

/**
 * 선언 타입 변환의 숫자 글자 규칙(BE 리팩토링 2회차 F4) — 엔진 `rule.ValueConverter.toDeclared` 가 도메인 검증
 * (`expr.ValueConverter`)과 같은 규칙으로 바뀐 것과 짝이다. 레코드 값 글자는 부호·정수부·소수부만 받는다.
 */
describe("convertForType NUMBER 글자", () => {
  it.each([
    ["1.8", "1.8"],
    ["-2", "-2"],
    ["+2.50", "2.50"],
    ["007", "7"],
  ])("평문 십진 %s 는 받고 원문 스케일을 싣는다", (text, plain) => {
    const v = convertForType(text, "NUMBER");
    expect(v).toBeInstanceOf(D);
    expect(NUMBER_TEXT.get(v as never)).toBe(plain);
  });

  it.each(["1e3", "1E+3", "1.5e-2", ".5", "5.", "+.5", "١٢٣", "1,000", "0x10", " 1", "1 ", ""])(
    "도메인 검증이 거부하는 %j 는 TYPE_CONVERSION",
    (text) => {
      let err: unknown;
      try {
        convertForType(text, "NUMBER");
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(EvalexError);
      expect((err as EvalexError).code).toBe("TYPE_CONVERSION");
    },
  );

  it("JS 숫자(화면 그리드 입력)는 글자 규칙과 무관하게 받는다", () => {
    expect(convertForType(1e21, "NUMBER")).toBeInstanceOf(D);
    expect(convertForType(0.5, "NUMBER")).toBeInstanceOf(D);
  });
});
