// TSK-04-03 design.md §4.5 — 저장된 유효 표준 AST 로 화면 즉시 판정(§3.5 첫 행, 불변 I14).
import { describe, expect, it } from "vitest";
import { previewStandard } from "../../../pages/dma/domainMng/preview";

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
});
