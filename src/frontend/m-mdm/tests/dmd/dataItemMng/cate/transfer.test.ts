// TSK-07-02 design.md §3.2 — TABLE 소속 transfer-list 순수 함수(dataCateEdit). 검색 필터·가능/소속 배타성·diff.
import { describe, expect, it } from "vitest";
import {
  availableOf, diffMembers, matchesQuery, memberOf, moveToMembers, removeFromMembers, type TransferItem,
} from "../../../../pages/dmd/dataItemMng/cate/transfer";

const items: TransferItem[] = [
  { code: "A", name: "Alpha", lvl1: "KR" },
  { code: "B", name: "Bravo", lvl1: "KR" },
  { code: "C", name: "Charlie", lvl1: "CN" },
];

describe("matchesQuery", () => {
  it("코드·이름 부분 일치(대소문자 무시), 빈 문자열은 전체 통과", () => {
    expect(matchesQuery(items[0], "")).toBe(true);
    expect(matchesQuery(items[0], "al")).toBe(true);
    expect(matchesQuery(items[0], "zz")).toBe(false);
  });
});

describe("availableOf·memberOf", () => {
  it("가능·소속은 서로 배타적이고 검색을 함께 본다", () => {
    const members = new Set(["A"]);
    expect(availableOf(items, members).map((i) => i.code)).toEqual(["B", "C"]);
    expect(memberOf(items, members).map((i) => i.code)).toEqual(["A"]);
    expect(availableOf(items, members, "char").map((i) => i.code)).toEqual(["C"]);
  });
});

describe("moveToMembers·removeFromMembers", () => {
  it("옮기고 되돌리는 것 모두 원본 Set 을 바꾸지 않는다(불변)", () => {
    const original = new Set(["A"]);
    const moved = moveToMembers(original, new Set(["B", "C"]));
    expect([...moved].sort()).toEqual(["A", "B", "C"]);
    expect([...original]).toEqual(["A"]); // 원본 불변

    const removed = removeFromMembers(moved, new Set(["B"]));
    expect([...removed].sort()).toEqual(["A", "C"]);
  });
});

describe("diffMembers", () => {
  it("추가·해제 목록을 정렬해 돌려준다", () => {
    const original = new Set(["A", "B"]);
    const now = new Set(["B", "C"]);
    expect(diffMembers(original, now)).toEqual({ addCodes: ["C"], removeCodes: ["A"] });
  });

  it("변화가 없으면 둘 다 빈 배열이다", () => {
    const same = new Set(["A", "B"]);
    expect(diffMembers(same, new Set(same))).toEqual({ addCodes: [], removeCodes: [] });
  });
});
