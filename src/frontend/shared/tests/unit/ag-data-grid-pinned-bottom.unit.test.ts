import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// AgDataGrid 전체 렌더는 ag-grid 환경이 무거워, 선택형 prop 이 AG Grid 로 그대로 넘어가는 배선만 고정한다.
const dir = path.join(__dirname, "../../src/components/grid");

describe("AgDataGrid pinnedBottomRows", () => {
  it("prop 타입이 있고 AgGridReact pinnedBottomRowData 로 그대로 전달한다", () => {
    expect(readFileSync(path.join(dir, "grid-types.ts"), "utf8")).toMatch(/pinnedBottomRows\?: Record<string, unknown>\[\]/);
    expect(readFileSync(path.join(dir, "AgDataGrid.tsx"), "utf8")).toMatch(/pinnedBottomRowData=\{pinnedBottomRows\}/);
  });
});
