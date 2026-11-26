// TSK-04-03 design.md §4.5 — 저장된 유효 표준 AST 로 화면 즉시 판정(§3.5 첫 행, 불변 I14).
import { describe, expect, it } from "vitest";
import { lengthViolation, previewStandard } from "../../../pages/dma/domainMng/preview";

// 02 코일 두께 예시 — (value > 0) && (value % 0.1 == 0). 서버 AstExporter 모양 그대로.
const COIL_THK = JSON.stringify({
  type: "INFIX_OPERATOR", value: "&&", params: [
    { type: "INFIX_OPERATOR", value: ">", params: [{ type: "VARIABLE_OR_CONSTANT", value: "value" }, { type: "NUMBER_LITERAL", value: "0" }] },
    { type: "INFIX_OPERATOR", value: "==", params: [
      { type: "INFIX_OPERATOR", value: "%", params: [{ type: "VARIABLE_OR_CONSTANT", value: "value" }, { type: "NUMBER_LITERAL", value: "0.1" }] },
      { type: "NUMBER_LITERAL", value: "0" }] },
  ],
});
const MASTER = JSON.stringify({
  type: "FUNCTION", value: "MASTER", params: [
    { type: "STRING_LITERAL", value: "PROC_CD" }, { type: "STRING_LITERAL", value: "BASE" }, { type: "VARIABLE_OR_CONSTANT", value: "value" }],
});
const NOT_BOOL = JSON.stringify({ type: "INFIX_OPERATOR", value: "+", params: [{ type: "VARIABLE_OR_CONSTANT", value: "value" }, { type: "NUMBER_LITERAL", value: "1" }] });

describe("previewStandard", () => {
  it("통과·실패를 화면에서 판정한다", () => {
    expect(previewStandard(COIL_THK, "1.6", "NUMBER").status).toBe("pass");
    expect(previewStandard(COIL_THK, "1.55", "NUMBER").status).toBe("fail");
    expect(previewStandard(COIL_THK, "-1", "NUMBER").label).toBe("표준 실패");
  });

  it("소수는 이진 부동소수 오차 없이 판정한다", () => {
    expect(previewStandard(COIL_THK, "0.3", "NUMBER").status).toBe("pass");
  });

  it("MASTER 는 화면이 판정하지 않고 서버 확인으로 넘긴다", () => {
    const r = previewStandard(MASTER, "C1", "STRING");
    expect(r.status).toBe("server");
    expect(r.label).toBe("서버 확인");
  });

  it("불린이 아니거나 변환할 수 없으면 판정 오류다", () => {
    expect(previewStandard(NOT_BOOL, "1", "NUMBER").status).toBe("error");
    expect(previewStandard(COIL_THK, "abc", "NUMBER").status).toBe("error");
  });

  it("식이 없거나 입력이 비면 판정하지 않는다", () => {
    expect(previewStandard(null, "1", "NUMBER").status).toBe("none");
    expect(previewStandard(COIL_THK, "", "NUMBER").status).toBe("none");
  });

  it("길이를 넘으면 식이 없어도 표준 실패 — 사원ID 11자 > 10", () => {
    const r = previewStandard(null, "12345678901", "STRING", { length: 10 });
    expect(r.status).toBe("fail");
    expect(r.label).toBe("길이 초과: 11자 > 10자");
    expect(previewStandard(null, "1234567890", "STRING", { length: 10 }).status).toBe("none");
    expect(previewStandard(COIL_THK, "123.4", "NUMBER", { length: 4, scale: 2 }).label).toBe("정수 자리수 초과: 3자리 > 2자리");
  });

  it("lengthViolation 은 서버 DomainLengthCheck 와 같은 규칙이다", () => {
    expect(lengthViolation("가나다", "STRING", { length: 3 })).toBeNull();
    expect(lengthViolation("-12.30", "NUMBER", { length: 4, scale: 2 })).toBeNull();
    expect(lengthViolation("1.234", "NUMBER", { length: 4, scale: 2 })).toBe("소수 자리수 초과: 3자리 > 2자리");
    expect(lengthViolation("1.2345", "NUMBER", { length: 3, scale: null })).toBeNull();
    expect(lengthViolation("1000", "NUMBER", { length: 3 })).toBe("정수 자리수 초과: 4자리 > 3자리");
    expect(lengthViolation("abc", "NUMBER", { length: 1 })).toBeNull();
    expect(lengthViolation("아주 긴 값", "STRING", { length: null })).toBeNull();
  });
});
