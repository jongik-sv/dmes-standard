import { describe, expect, it } from "vitest";
import { evaluateCell, type CellVariable } from "../../../src/evalex";

/** TSK-03-04 design.md §3.2 「evalex-cell-compare.test.ts (3)」·§6.5. */
const STL: CellVariable = { name: "STL_GRD", dataType: "STRING" };
const THK: CellVariable = { name: "COIL_THK", dataType: "NUMBER" };

describe("op-code 셀 직접 비교", () => {
  it("정규식형 패턴에 patternRegex 가 없으면 폴백한다", () => {
    expect(evaluateCell(STL, { op: "EQ", left: "A%B" }, "AxB").kind).toBe("fallback");
    expect(evaluateCell(STL, { op: "EQ", left: "A%B" }, "AxB", { patternRegex: "A.*B" })).toEqual({ kind: "value", value: true });
  });

  it("셀 리터럴이 변수 타입으로 바뀌지 않으면 EVALUATION_ERROR 다", () => {
    const out = evaluateCell(THK, { op: "GE", left: "abc" }, "2.5");
    expect(out.kind === "error" && out.code).toBe("EVALUATION_ERROR");
  });

  it("= A 와 IN (A) 는 같은 값에 같은 결과다", () => {
    const surf: CellVariable = { name: "SURF_GRD", dataType: "STRING" };
    for (const v of ["A", "B", null]) {
      expect(evaluateCell(surf, { op: "EQ", left: "A" }, v)).toEqual(evaluateCell(surf, { op: "IN", list: ["A"] }, v));
    }
  });
});
