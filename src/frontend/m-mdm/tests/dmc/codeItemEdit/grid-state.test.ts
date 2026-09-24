// TSK-06-03 design.md §4.8 — 코드 편집 그리드의 편집 상태(순수 함수). 셀 편집·추가·삭제 → 변경 목록(rowStatus), 트리 노드
// 거르기·경로, 버전 표시(소수 세 자리), 칸 잠김(불변 규칙 39·40).
import { describe, expect, it } from "vitest";
import {
  addRow, changesOf, editCell, filterByNode, fmtVer, isCellEditable, pathOf, removeRow, toEditRows, type ServerRow,
} from "../../../pages/dmc/codeItemEdit/grid-state";
import { STEEL_STD } from "./sim-fixtures";

function server(code: string, name: string, extra: Partial<ServerRow> = {}): ServerRow {
  return {
    code, name, alterName: null, seq: 1, description: null, fromVer: "1.000", toVer: "9999.000",
    lvl1: null, lvl2: null, lvl3: null, lvl4: null, lvl5: null,
    attr01: null, attr02: null, attr03: null, attr04: null, attr05: null,
    attr06: null, attr07: null, attr08: null, attr09: null, attr10: null,
    change: "NONE", prev: null, tableCategories: [], patchBlocked: false, ...extra,
  };
}

const BASE = [server("A", "에이"), server("B", "비", { tableCategories: ["T1"] })];

describe("변경 목록", () => {
  it("셀 편집은 CHANGED 한 건이고 행 전체 값을 보낸다", () => {
    const rows = editCell(toEditRows(BASE), "A", "name", "새 에이");
    expect(changesOf(rows)).toEqual([{ rowStatus: "CHANGED", code: "A", name: "새 에이", seq: 1 }]);
  });

  it("값을 원래대로 되돌리면 변경이 아니다", () => {
    const rows = editCell(editCell(toEditRows(BASE), "A", "name", "x"), "A", "name", "에이");
    expect(changesOf(rows)).toEqual([]);
  });

  it("새 행은 ADDED 이고 빈 문자열 칸은 페이로드에서 빠진다", () => {
    const added = addRow(toEditRows(BASE), { lvl1: "KS" });
    const key = added[0].__key;
    const rows = editCell(editCell(added, key, "code", "N1"), key, "name", "");
    expect(changesOf(rows)).toEqual([{ rowStatus: "ADDED", code: "N1", lvl1: "KS" }]);
  });

  it("기존 행 삭제는 DELETED(code 만), 새 행 삭제는 목록에서 사라진다", () => {
    const withNew = addRow(toEditRows(BASE), {});
    const newKey = withNew[0].__key;
    const rows = removeRow(removeRow(editCell(withNew, newKey, "code", "N1"), newKey), "B");
    expect(changesOf(rows)).toEqual([{ rowStatus: "DELETED", code: "B" }]);
    expect(rows.find((r) => r.__key === newKey)).toBeUndefined();
    expect(rows.find((r) => r.__key === "B")?.__local).toBe("deleted");
  });
});

describe("칸 잠김(불변 규칙 39)", () => {
  it("DRAFT 편집 가능이면 기존 행의 코드 칸만 잠기고 새 행의 코드 칸은 열린다", () => {
    const rows = addRow(toEditRows(BASE), {});
    expect(isCellEditable(true, rows[1], "code")).toBe(false);
    expect(isCellEditable(true, rows[1], "name")).toBe(true);
    expect(isCellEditable(true, rows[1], "lvl1")).toBe(true);
    expect(isCellEditable(true, rows[0], "code")).toBe(true);
  });

  it("편집 불가(RELEASED·CANCELLED·남의 DRAFT)면 모든 칸이 잠긴다", () => {
    const rows = addRow(toEditRows(BASE), {});
    for (const field of ["code", "name", "alterName", "seq", "lvl1", "attr01", "description"]) {
      expect(isCellEditable(false, rows[1], field), field).toBe(false);
      expect(isCellEditable(false, rows[0], field), field).toBe(false);
    }
  });

  it("삭제 표시한 행은 편집하지 않는다", () => {
    expect(isCellEditable(true, removeRow(toEditRows(BASE), "A").find((r) => r.__key === "A")!, "name")).toBe(false);
  });
});

describe("트리 노드 거르기·경로", () => {
  const rows = STEEL_STD.map((r) => ({ ...r }));

  it("그룹 노드 KS-3 은 5행, 코드이자 그룹인 KS-3-CGCH 는 3행", () => {
    expect(filterByNode(rows, "KS-3").map((r) => r.code)).toEqual(
      ["KS-3-CGCC", "KS-3-CGCD", "KS-3-CGCH", "KS-3-CGCH-Z12", "KS-3-CGCH-Z27"]);
    expect(filterByNode(rows, "KS-3-CGCH").map((r) => r.code)).toEqual(["KS-3-CGCH", "KS-3-CGCH-Z12", "KS-3-CGCH-Z27"]);
    expect(filterByNode(rows, null)).toHaveLength(8);
  });

  it("노드 경로 — 그룹은 앞 칸 + 자기 값, 코드는 자기 경로 + 자기 값", () => {
    expect(pathOf("KS-3", rows)).toEqual(["KS", "KS-3"]);
    expect(pathOf("KS-9", rows)).toEqual(["KS", "KS-9"]);
    expect(pathOf("KS", rows)).toEqual(["KS"]);
    expect(pathOf("KS-3-CGCH", rows)).toEqual(["KS", "KS-3", "KS-3-CGCH"]);
  });
});

describe("버전 표시(불변 규칙 40)", () => {
  it("소수 세 자리 v 표시", () => {
    expect(fmtVer("1.008")).toBe("v1.008");
    expect(fmtVer("2")).toBe("v2.000");
    expect(fmtVer("2.000")).toBe("v2.000");
    expect(fmtVer("1.1")).toBe("v1.100");
  });
});
