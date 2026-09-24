// TSK-06-04 design.md §3 — 카테고리 목록 편집 상태(순수 함수, codeItemEdit grid-state.test.ts 상당).
import { describe, expect, it } from "vitest";
import {
  addCategoryRow, categoryChangesOf, editCategoryRow, removeCategoryRow, toCategoryRows, undoCategoryLocal,
  type CategoryDef,
} from "../../../pages/dmc/codeCateEdit/categories";

function def(over: Partial<CategoryDef> = {}): CategoryDef {
  return { cateId: "T1", cateName: "표1", defKind: "TABLE", defExpr: null, defTarget: null, description: null, ...over };
}

describe("toCategoryRows", () => {
  it("서버 정의를 __local none 행으로 옮긴다", () => {
    const rows = toCategoryRows([def()]);
    expect(rows).toEqual([{ ...def(), __local: "none", __server: def() }]);
  });
});

describe("addCategoryRow", () => {
  it("새 행은 __local new, __server null", () => {
    const rows = addCategoryRow([], def({ cateId: "R1", defKind: "REGEX", defExpr: ".*", defTarget: "CODE" }));
    expect(rows).toHaveLength(1);
    expect(rows[0].__local).toBe("new");
    expect(rows[0].__server).toBeNull();
  });
});

describe("editCategoryRow", () => {
  it("서버 값과 같아지면 none 으로, 다르면 edited 로 돌아간다", () => {
    let rows = toCategoryRows([def({ cateName: "표1" })]);
    rows = editCategoryRow(rows, "T1", { cateName: "새 표1" });
    expect(rows[0].__local).toBe("edited");
    rows = editCategoryRow(rows, "T1", { cateName: "표1" });
    expect(rows[0].__local).toBe("none");
  });

  it("new 행은 __local 을 유지한다", () => {
    let rows = addCategoryRow([], def({ cateId: "T2" }));
    rows = editCategoryRow(rows, "T2", { cateName: "고친 이름" });
    expect(rows[0].__local).toBe("new");
    expect(rows[0].cateName).toBe("고친 이름");
  });
});

describe("removeCategoryRow", () => {
  it("new 행은 목록에서 빠지고, 서버 행은 deleted 로 남는다", () => {
    const added = removeCategoryRow(addCategoryRow([], def({ cateId: "T2" })), "T2");
    expect(added).toEqual([]);
    const removed = removeCategoryRow(toCategoryRows([def()]), "T1");
    expect(removed[0].__local).toBe("deleted");
  });
});

describe("undoCategoryLocal", () => {
  it("new 는 지우고, edited·deleted 는 서버 값으로 되돌린다", () => {
    expect(undoCategoryLocal(addCategoryRow([], def({ cateId: "T2" })), "T2")).toEqual([]);
    const edited = editCategoryRow(toCategoryRows([def()]), "T1", { cateName: "고친" });
    const undone = undoCategoryLocal(edited, "T1");
    expect(undone[0].cateName).toBe("표1");
    expect(undone[0].__local).toBe("none");
  });
});

describe("categoryChangesOf", () => {
  it("ADDED·CHANGED·DELETED 행만 뽑고 none 은 뺀다", () => {
    let rows = toCategoryRows([def({ cateId: "A" }), def({ cateId: "B" }), def({ cateId: "C" })]);
    rows = editCategoryRow(rows, "A", { cateName: "고친 A" });
    rows = removeCategoryRow(rows, "B");
    rows = addCategoryRow(rows, def({ cateId: "D" }));
    const changes = categoryChangesOf(rows);
    expect(changes.map((c) => [c.rowStatus, c.cateId])).toEqual([
      ["CHANGED", "A"], ["DELETED", "B"], ["ADDED", "D"],
    ]);
  });
});
