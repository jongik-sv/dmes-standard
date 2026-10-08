// src/frontend/shared/tests/unit/variable-table.unit.test.ts
import { describe, expect, it } from "vitest";

import { newVariableRow, normalizeVariableCell, RUNTIME_VARIABLES, VARIABLE_TYPE_LABEL } from "../../src/components/variable-table/variables";

describe("variable-table 순수 부분", () => {
  it("새 행은 빈 문자 변수", () => {
    expect(newVariableRow()).toEqual({ name: "", type: "STRING", value: "", desc: "" });
  });

  it("셀 정규화 — 이름은 앞뒤 공백을 지우고 나머지는 글자 그대로", () => {
    expect(normalizeVariableCell("name", "  baseDt ")).toBe("baseDt");
    expect(normalizeVariableCell("value", "  :today ")).toBe("  :today ");
    expect(normalizeVariableCell("value", null)).toBe("");
  });

  it("실행 변수 안내는 서버가 확정하는 이름과 같다(설계 §5.0)", () => {
    expect(RUNTIME_VARIABLES.map((r) => r.name)).toEqual([
      ":schedAt", ":now", ":today", ":yesterday", ":monthStart", ":prevMonthStart", ":prevRunAt", ":jobId", ":moduleCd",
    ]);
    expect(Object.keys(VARIABLE_TYPE_LABEL)).toEqual(["STRING", "NUMBER", "DATE", "JSON"]);
  });
});
