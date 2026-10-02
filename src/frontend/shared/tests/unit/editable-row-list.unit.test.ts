import { describe, expect, it } from "vitest";
import { moveItem, removeAt, updateAt } from "../../src/components/grid/row-list-ops";

describe("EditableRowList 목록 조작", () => {
  it("moveItem — 위아래로 옮기고, 끝을 넘으면 그대로", () => {
    expect(moveItem(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveItem(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
    expect(moveItem(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
    expect(moveItem(["a", "b", "c"], 2, 1)).toEqual(["a", "b", "c"]);
    expect(moveItem(["a", "b", "c"], 9, 1)).toEqual(["a", "b", "c"]);
    expect(moveItem(["a", "b", "c"], -1, 1)).toEqual(["a", "b", "c"]);
  });

  it("moveItem — 원본을 바꾸지 않고 새 배열을 돌려준다", () => {
    const list = ["a", "b"];
    const next = moveItem(list, 0, 1);
    expect(list).toEqual(["a", "b"]);
    expect(next).not.toBe(list);
    expect(moveItem(list, 5, 1)).not.toBe(list);
  });

  it("removeAt — 그 칸만 빼고, 범위 밖이면 그대로", () => {
    const list = [{ f: "a" }, { f: "b" }];
    expect(removeAt(list, 0)).toEqual([{ f: "b" }]);
    expect(removeAt(list, 1)).toEqual([{ f: "a" }]);
    expect(removeAt(list, 5)).toEqual(list);
    expect(removeAt(list, 5)).not.toBe(list);
  });

  it("updateAt — 그 칸에만 덧씌우고 나머지는 같은 객체를 쓴다", () => {
    const list = [{ f: "a", w: 1 }, { f: "b", w: 2 }];
    const next = updateAt(list, 1, { f: "z" });
    expect(next).toEqual([{ f: "a", w: 1 }, { f: "z", w: 2 }]);
    expect(next[0]).toBe(list[0]);
    expect(list[1]).toEqual({ f: "b", w: 2 });
    expect(updateAt(list, 9, { f: "x" })).toEqual(list);
  });

  it("updateAt — undefined 로 덧씌우면 키는 남고 값이 undefined 가 된다", () => {
    const next = updateAt([{ f: "a", w: 1 as number | undefined }], 0, { w: undefined });
    expect(next[0].w).toBeUndefined();
    expect(next[0].f).toBe("a");
  });
});
