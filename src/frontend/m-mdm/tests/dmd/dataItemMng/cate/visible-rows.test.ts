import { describe, expect, it } from "vitest";

import { visibleCateRows } from "../../../../pages/dmd/dataItemMng/cate/CategoryTab";

const rows = [
  { cateId: "BASE", open: true },
  { cateId: "MAJOR", open: false },
];

describe("visibleCateRows — 닫힌 카테고리 거르기", () => {
  it("조회 전용 마루 데이터는 닫힌 카테고리를 뺀다", () => {
    expect(visibleCateRows(rows, false, false).map((r) => r.cateId)).toEqual(["BASE"]);
  });

  it("조회 전용이어도 「닫힌 항목」을 보기로 두면 닫힌 카테고리가 보인다", () => {
    expect(visibleCateRows(rows, false, true)).toHaveLength(2);
  });

  it("편집 가능한 마루 데이터는 다시 열 수 있게 닫힌 카테고리도 늘 보인다", () => {
    expect(visibleCateRows(rows, true, false)).toHaveLength(2);
  });
});
