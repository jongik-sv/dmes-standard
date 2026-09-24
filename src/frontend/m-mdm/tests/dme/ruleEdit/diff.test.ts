// TSK-08-02 design I22 — base 버전 대비 강조: row_id 로 맞대고, 셀은 ast 를 뺀 JSON 으로 견준다.
import { describe, expect, it } from "vitest";

import { diffTable } from "../../../pages/dme/ruleEdit/decision-table/diff";
import { gridRowsFromStored } from "../../../pages/dme/ruleEdit/decision-table/grid-model";
import type { StoredRow } from "../../../pages/dme/ruleEdit/types";

const base: StoredRow[] = [
  { rowId: 1, seq: 1, rowKind: "NORMAL", cells: '{"1":{"op":"GE","left":"1"},"2":{"expr":"A","ast":{"t":1}}}', note: "첫 행" },
  { rowId: 2, seq: 2, rowKind: "NORMAL", cells: '{"1":{"op":"LT","left":"1"}}', note: null },
  { rowId: 3, seq: 0, rowKind: "DEFAULT", cells: '{"9":{"val":"C"}}', note: null },
];

describe("diffTable(I22)", () => {
  it("같으면 SAME, 바뀐 칸만 CHANGED 로 표시한다", () => {
    const cur = gridRowsFromStored([], base);
    cur[1] = { ...cur[1], cells: { 1: { op: "LT", left: "2" } } };
    const d = diffTable(base, cur);
    expect(d.rows.get(1)?.status).toBe("SAME");
    expect(d.rows.get(2)?.status).toBe("CHANGED");
    expect([...d.rows.get(2)!.changedVarIds]).toEqual([1]);
    expect(d.deleted).toEqual([]);
  });

  it("ast 만 다르면 같은 셀이다", () => {
    const cur = gridRowsFromStored([], base);
    cur[0] = { ...cur[0], cells: { ...cur[0].cells, 2: { expr: "A", ast: { t: 2, other: true } } } };
    expect(diffTable(base, cur).rows.get(1)?.status).toBe("SAME");
  });

  it("행 설명만 바뀌어도 CHANGED 다", () => {
    const cur = gridRowsFromStored([], base);
    cur[0] = { ...cur[0], note: "고친 설명" };
    const d = diffTable(base, cur).rows.get(1)!;
    expect(d.status).toBe("CHANGED");
    expect(d.noteChanged).toBe(true);
    expect(d.changedVarIds.size).toBe(0);
  });

  it("base 에 없으면 ADDED, base 에만 있으면 지운 행 목록", () => {
    const cur = gridRowsFromStored([], base).filter((r) => r.rowId !== 2);
    cur.push({ rowId: -1, seq: 3, rowKind: "NORMAL", note: "", cells: { 1: { op: "NA" } } });
    const d = diffTable(base, cur);
    expect(d.rows.get(-1)?.status).toBe("ADDED");
    expect(d.deleted.map((r) => r.rowId)).toEqual([2]);
  });

  it("셀이 새로 생기거나 사라져도 그 열이 바뀐 칸이다", () => {
    const cur = gridRowsFromStored([], base);
    cur[2] = { ...cur[2], cells: { 9: { val: "C" }, 10: { val: "X" } } };
    expect([...diffTable(base, cur).rows.get(3)!.changedVarIds]).toEqual([10]);
  });

  it("base 가 없으면(null) 강조하지 않는다", () => {
    const cur = gridRowsFromStored([], base);
    cur.push({ rowId: -1, seq: 3, rowKind: "NORMAL", note: "", cells: {} });
    const d = diffTable(null, cur);
    expect([...d.rows.values()].every((r) => r.status === "SAME")).toBe(true);
    expect(d.deleted).toEqual([]);
  });
});
