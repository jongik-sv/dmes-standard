import { describe, expect, it } from "vitest";
import { resolveRowDrag } from "../../src/components/grid/AgDataGrid";

// TSK-05-02 D6·불변 I22 — onRowOrderChange 를 주지 않은 기존 그리드는 정렬 값과 AgGridReact prop 이 그대로다.
describe("AgDataGrid 행 드래그 설정", () => {
  const end = () => {};

  it("onRowOrderChange 가 없으면 sortable 을 그대로 두고 prop 을 더하지 않는다", () => {
    expect(resolveRowDrag(undefined, true, end)).toEqual({ sortable: true, gridProps: {} });
    expect(resolveRowDrag(undefined, false, end)).toEqual({ sortable: false, gridProps: {} });
  });

  it("onRowOrderChange 가 있으면 정렬을 끄고 managed row drag 를 켠다", () => {
    const out = resolveRowDrag(() => {}, true, end);
    expect(out.sortable).toBe(false);
    expect(out.gridProps).toEqual({ rowDragManaged: true, onRowDragEnd: end });
  });
});
