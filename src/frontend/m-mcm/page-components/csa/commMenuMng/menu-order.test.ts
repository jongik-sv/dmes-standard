import { describe, expect, it } from "vitest";
import { applyReorder, folderOrder, maxSeqIn, moveToFolder, sortMenuRows, type OrderRow } from "./menu-order";
import type { CommMenuMngTreeRow } from "./types";

const key = (r: OrderRow) => String(r.MENU_ID);
const row = (id: string, folder: string, seq: string, status: OrderRow["nativeeditor_status"] = ""): OrderRow => ({
  MENU_ID: id,
  PARENT_MENU_ID: folder,
  MENU_SEQ: seq,
  nativeeditor_status: status,
});
const summary = (rows: OrderRow[]) => rows.map((r) => `${r.MENU_ID}@${r.PARENT_MENU_ID}:${r.MENU_SEQ}${r.nativeeditor_status ? "*" : ""}`);

// 폴더 A(a1 a2 a3) 다음 폴더 B(b1 b2 b3).
const base = () => [
  row("a1", "A", "10"),
  row("a2", "A", "20"),
  row("a3", "A", "30"),
  row("b1", "B", "10"),
  row("b2", "B", "20"),
  row("b3", "B", "30"),
];

describe("folderOrder", () => {
  it("트리를 위에서 아래로 읽은 순번과 모듈 폴더를 준다", () => {
    const tree: CommMenuMngTreeRow[] = [
      { LEV: 0, MENU_ID: "m2", MENU_SEQ: "2", PARENT_MENU_ID: null },
      { LEV: 0, MENU_ID: "m1", MENU_SEQ: "1", PARENT_MENU_ID: null },
      { LEV: 1, MENU_ID: "g12", MENU_SEQ: "2", PARENT_MENU_ID: "m1" },
      { LEV: 1, MENU_ID: "g11", MENU_SEQ: "1", PARENT_MENU_ID: "m1" },
      { LEV: 1, MENU_ID: "g21", MENU_SEQ: "1", PARENT_MENU_ID: "m2" },
    ];
    const { index, roots } = folderOrder(tree);
    expect([...index.keys()]).toEqual(["m1", "g11", "g12", "m2", "g21"]);
    expect([...roots]).toEqual(["m1", "m2"]);
  });
});

describe("sortMenuRows", () => {
  it("폴더 순서 → 순서 번호 순으로 늘어놓고 삭제 표시 행은 맨 뒤에 둔다", () => {
    const index = new Map([["A", 0], ["B", 1]]);
    const out = sortMenuRows([row("b1", "B", "10"), row("x", "A", "5", "deleted"), row("a2", "A", "20"), row("a1", "A", "10")], index);
    expect(out.map(key)).toEqual(["a1", "a2", "b1", "x"]);
  });
});

describe("applyReorder", () => {
  it("같은 폴더 안 순서를 바꾸면 그 폴더 번호만 다시 매긴다", () => {
    const out = applyReorder(base(), ["a3", "a1", "a2", "b1", "b2", "b3"], key);
    expect(summary(out)).toEqual(["a3@A:10*", "a1@A:20*", "a2@A:30*", "b1@B:10", "b2@B:20", "b3@B:30"]);
  });

  it("다른 폴더 화면 사이에 놓으면 그 폴더로 들어간다", () => {
    const out = applyReorder(base(), ["a1", "b1", "a2", "a3", "b2", "b3"], key);
    expect(summary(out)).toEqual(["a1@A:10", "b1@A:20*", "a2@A:30*", "a3@A:40*", "b2@B:10*", "b3@B:20*"]);
  });

  it("여러 행을 함께 끌어도 끈 행 모두 놓은 자리의 폴더로 들어간다", () => {
    const out = applyReorder(base(), ["a1", "b1", "b2", "a2", "a3", "b3"], key);
    expect(summary(out)).toEqual(["a1@A:10", "b1@A:20*", "b2@A:30*", "a2@A:40*", "a3@A:50*", "b3@B:10*"]);
  });

  it("폴더 경계에 놓았는데 아래 화면이 자기 폴더면 폴더를 지키고 그 폴더 맨 앞으로 간다", () => {
    const out = applyReorder(base(), ["a1", "a2", "a3", "b3", "b1", "b2"], key);
    expect(summary(out)).toEqual(["a1@A:10", "a2@A:20", "a3@A:30", "b3@B:10*", "b1@B:20*", "b2@B:30*"]);
  });

  it("폴더 경계에 놓았는데 위·아래 모두 다른 폴더면 바로 위 화면의 폴더로 들어간다", () => {
    const rows = [...base(), row("c1", "C", "10"), row("c2", "C", "20")];
    const out = applyReorder(rows, ["a1", "a2", "a3", "c2", "b1", "b2", "b3", "c1"], key);
    expect(summary(out).slice(0, 4)).toEqual(["a1@A:10", "a2@A:20", "a3@A:30", "c2@A:40*"]);
  });

  it("맨 위에 놓으면 바로 아래 화면의 폴더로 들어간다", () => {
    const out = applyReorder(base(), ["b2", "a1", "a2", "a3", "b1", "b3"], key);
    expect(summary(out)[0]).toBe("b2@A:10*");
  });

  it("끈 행과 상관없는 폴더는 번호가 고르지 않아도 건드리지 않는다", () => {
    const rows = [row("x1", "X", "1"), row("x2", "X", "1"), ...base()];
    const out = applyReorder(rows, ["x1", "x2", "a2", "a1", "a3", "b1", "b2", "b3"], key);
    expect(summary(out)).toEqual(["x1@X:1", "x2@X:1", "a2@A:10*", "a1@A:20*", "a3@A:30", "b1@B:10", "b2@B:20", "b3@B:30"]);
  });

  it("바뀐 것이 없으면 행 상태를 올리지 않는다", () => {
    const out = applyReorder(base(), base().map(key), key);
    expect(out.every((r) => !r.nativeeditor_status)).toBe(true);
  });

  it("신규 행은 inserted 를 지키고, 삭제 표시 행은 번호를 매기지 않고 뒤에 둔다", () => {
    const rows = [...base(), row("n1", "B", "", "inserted"), row("d1", "A", "15", "deleted")];
    const out = applyReorder(rows, ["n1", "a1", "a2", "a3", "b1", "b2", "b3", "d1"], key);
    expect(summary(out)).toEqual([
      "n1@A:10*",
      "a1@A:20*",
      "a2@A:30*",
      "a3@A:40*",
      "b1@B:10",
      "b2@B:20",
      "b3@B:30",
      "d1@A:15*",
    ]);
    expect(out[0].nativeeditor_status).toBe("inserted");
    expect(out[7].nativeeditor_status).toBe("deleted");
  });
});

describe("moveToFolder", () => {
  it("다른 폴더의 맨 뒤로 옮기고 원래 폴더는 남은 행끼리 번호를 다시 매긴다", () => {
    const out = moveToFolder(base(), new Set(["a1", "a2"]), "B", 30, key, true);
    expect(summary(out)).toEqual(["a1@B:40*", "a2@B:50*", "a3@A:10*", "b1@B:10", "b2@B:20", "b3@B:30"]);
  });

  it("원래 폴더가 목록에 다 없으면 원래 폴더 번호는 건드리지 않는다", () => {
    const out = moveToFolder(base(), new Set(["a1"]), "C", 0, key, false);
    expect(summary(out)).toEqual(["a1@C:10*", "a2@A:20", "a3@A:30", "b1@B:10", "b2@B:20", "b3@B:30"]);
  });

  it("이미 그 폴더에 있는 행은 그대로 둔다", () => {
    const out = moveToFolder(base(), new Set(["b1"]), "B", 30, key, true);
    expect(out.every((r) => !r.nativeeditor_status)).toBe(true);
  });
});

describe("maxSeqIn", () => {
  it("폴더 안 가장 큰 순서 번호(숫자가 아닌 값·삭제 표시 제외)", () => {
    const rows = [...base(), row("x", "B", "abc"), row("y", "B", "90", "deleted")];
    expect(maxSeqIn(rows, "B")).toBe(30);
    expect(maxSeqIn(rows, "Z")).toBe(0);
  });
});
