// TSK-06-03 design.md §4.8 — 코드 편집 그리드의 편집 상태(순수 함수). 셀 편집·추가·삭제 → 변경 목록(rowStatus), 트리 노드
// 거르기·경로, 버전 표시(소수 세 자리), 칸 잠김(불변 규칙 39·40).
import { describe, expect, it } from "vitest";
import {
  addRow, changesOf, editCell, filterByNode, fmtVer, isCellEditable, pathOf, removeRow, reorderRows, toEditRows,
  type ServerRow,
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

describe("드래그 재배열", () => {
  const abc = (seqs: number[] = [1, 2, 3]) =>
    toEditRows(["A", "B", "C"].map((c, i) => server(c, `${c} 이름`, { seq: seqs[i] })));

  it("순서만 바꾸면 저장이 안 된다 — seq 를 다시 매겨야 CHANGE 로 실린다", () => {
    // 원인이 이거였다: 재배열만으로는 __local 이 "none" 이라 changesOf 가 빈 목록을 낸다(저장해도 반영되지 않음).
    const base = abc();
    expect(changesOf(base)).toEqual([]);

    const moved = reorderRows(base, ["C", "A", "B"]);

    expect(moved.map((r) => r.code)).toEqual(["C", "A", "B"]);
    // 당긴 C(3)만 새로 매겨진다 — 맨 위가 되려면 1·2 보다 작아야 하니 1-10 = -9.
    expect(moved.map((r) => [r.code, r.seq])).toEqual([["C", -9], ["A", 1], ["B", 2]]);
    // A·B 는 상대 순서가 그대로여서 손대지 않는다 → 저장 payload 에 안 올라간다.
    expect(changesOf(moved)).toEqual([{ rowStatus: "CHANGED", code: "C", name: "C 이름", seq: -9 }]);
  });

  it("아래로 내린 행만 다시 매긴다", () => {
    const moved = reorderRows(abc(), ["B", "C", "A"]);

    // 당긴 A(1)만 맨 아래로 — 위 C(3) 보다 커야 하니 3+10 = 13.
    expect(moved.map((r) => [r.code, r.seq])).toEqual([["B", 2], ["C", 3], ["A", 13]]);
    expect(changesOf(moved).map((c) => c.code)).toEqual(["A"]);
  });

  it("사람이 칸에 직접 친 번호는 옮기지 않은 한 그대로 둔다", () => {
    const moved = reorderRows(abc([11, 12, 13]), ["C", "A", "B"]);

    // C 만 13 보다 작게(11-10=1) 들어간다. 사람이 친 11·12 는 그대로 — 10 단위로 덮어쓰지 않는다.
    expect(moved.map((r) => [r.code, r.seq])).toEqual([["C", 1], ["A", 11], ["B", 12]]);
    expect(changesOf(moved).map((c) => c.code)).toEqual(["C"]);
  });

  it("옮길 자리가 10 간격보다 좁으면 안쪽으로 나눠 끼운다(같은 번호가 되지 않게)", () => {
    // 10,20,30 에서 B·C 를 맞바꾸면 C 는 B(20) 와 같은 20 이 될 수 있다 → 15 로 나눠 넣는다.
    const moved = reorderRows(abc([10, 20, 30]), ["A", "C", "B"]);

    expect(moved.map((r) => [r.code, r.seq])).toEqual([["A", 10], ["C", 15], ["B", 20]]);
    const seqs = moved.map((r) => r.seq);
    expect(new Set(seqs).size).toBe(seqs.length); // 번호가 겹치지 않는다
  });

  it("전부 역순이면 정규화되어 10 단위로 다시 깔린다", () => {
    const moved = reorderRows(abc(), ["C", "B", "A"]);

    // 상대 순서를 유지하는 행이 하나뿐이라 나머지가 전부 다시 매겨진다. 오름차순이면 된다.
    const seqs = moved.map((r) => r.seq as number);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(moved.map((r) => r.code)).toEqual(["C", "B", "A"]);
  });

  it("제자리에 그대로인 행은 변경으로 잡지 않는다(빈 페이로드 방지)", () => {
    expect(changesOf(reorderRows(abc(), ["A", "B", "C"]))).toEqual([]);
  });

  it("새 행·삭제 표시 행의 순서 상태는 그대로 두고 seq 만 갱신한다", () => {
    const base = toEditRows([server("A", "에이", { seq: 1 }), server("B", "비", { seq: 2 })]);
    const withNew = addRow(base, {});
    const withDel = removeRow(withNew, "B");

    const moved = reorderRows(withDel, ["B", "__new_1", "A"]);

    // 삭제 표시(B)는 DELETED 로, 새 행은 ADDED 로 남는다 — 재배열이 순서 상태를 뒤집지 않는다.
    expect(moved.map((r) => r.__local)).toEqual(["deleted", "new", "none"]);
  });
});

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
