// TSK-06-04 design.md §3·§5 불변 규칙 17(FE 이동 쪽) — transfer-list 순수 함수. 검색·필터·Shift 범위·전체선택·이동
// 각각, 그리고 1,000건 배열에서 이동 함수가 200ms 이내인지(서버 왕복 없는 클라이언트 전용 예산).
import { describe, expect, it } from "vitest";
import {
  diffMembers, lvl1Options, matchesLvl1, matchesQuery, moveAllVisible, moveSelected, rangeSelect, removeAllVisible,
  removeSelected, selectAllVisible, toggleSelect, visibleList, type TransferItem,
} from "../../../../pages/dmc/codeItemEdit/cate/transfer";

function items(n: number): TransferItem[] {
  return Array.from({ length: n }, (_, i) => ({ code: `C${i}`, name: `이름${i}`, lvl1: i % 2 === 0 ? "G" : "H" }));
}

describe("matchesQuery·matchesLvl1", () => {
  it("코드·이름 부분 일치(대소문자 무시), 빈 문자열은 전체 통과", () => {
    const it1: TransferItem = { code: "AB-01", name: "에이비", lvl1: "G" };
    expect(matchesQuery(it1, "")).toBe(true);
    expect(matchesQuery(it1, "ab-0")).toBe(true);
    expect(matchesQuery(it1, "에이비")).toBe(true);
    expect(matchesQuery(it1, "zz")).toBe(false);
  });

  it("lvl1 필터 — null 이면 전체 통과", () => {
    const it1: TransferItem = { code: "A", name: null, lvl1: "G" };
    expect(matchesLvl1(it1, null)).toBe(true);
    expect(matchesLvl1(it1, "G")).toBe(true);
    expect(matchesLvl1(it1, "H")).toBe(false);
  });
});

describe("visibleList", () => {
  it("available·member 는 서로 배타적이고 검색·필터를 함께 본다", () => {
    const list = items(4); // C0/G, C1/H, C2/G, C3/H
    const members = new Set(["C0", "C1"]);
    expect(visibleList(list, members, "available", "", null).map((i) => i.code)).toEqual(["C2", "C3"]);
    expect(visibleList(list, members, "member", "", null).map((i) => i.code)).toEqual(["C0", "C1"]);
    expect(visibleList(list, members, "available", "", "H").map((i) => i.code)).toEqual(["C3"]);
    expect(visibleList(list, members, "member", "C1", null).map((i) => i.code)).toEqual(["C1"]);
  });
});

describe("lvl1Options", () => {
  it("중복 없이 정렬한다", () => {
    expect(lvl1Options(items(4))).toEqual(["G", "H"]);
  });
});

describe("rangeSelect", () => {
  it("anchor 부터 target 까지(양방향) 담는다", () => {
    const visible = items(5); // C0..C4
    expect(Array.from(rangeSelect(visible, "C1", "C3")).sort()).toEqual(["C1", "C2", "C3"]);
    expect(Array.from(rangeSelect(visible, "C3", "C1")).sort()).toEqual(["C1", "C2", "C3"]);
  });

  it("anchor 가 없으면 target 하나만", () => {
    expect(Array.from(rangeSelect(items(3), null, "C1"))).toEqual(["C1"]);
  });
});

describe("toggleSelect·selectAllVisible", () => {
  it("토글은 있으면 빼고 없으면 더한다", () => {
    let sel = new Set<string>();
    sel = toggleSelect(sel, "A");
    expect(sel.has("A")).toBe(true);
    sel = toggleSelect(sel, "A");
    expect(sel.has("A")).toBe(false);
  });

  it("전체선택은 보이는 목록 전부다", () => {
    expect(Array.from(selectAllVisible(items(3))).sort()).toEqual(["C0", "C1", "C2"]);
  });
});

describe("이동 — >/>>/</<<", () => {
  it("moveSelected·removeSelected 는 선택 원소만 옮긴다", () => {
    const members = new Set(["C0"]);
    const moved = moveSelected(members, new Set(["C1", "C2"]));
    expect(Array.from(moved).sort()).toEqual(["C0", "C1", "C2"]);
    const removed = removeSelected(moved, new Set(["C0"]));
    expect(Array.from(removed).sort()).toEqual(["C1", "C2"]);
  });

  it("moveAllVisible·removeAllVisible 은 필터 통과분 전부", () => {
    const list = items(4);
    const avail = visibleList(list, new Set(), "available", "", "G"); // C0, C2
    const moved = moveAllVisible(new Set(), avail);
    expect(Array.from(moved).sort()).toEqual(["C0", "C2"]);
    const removed = removeAllVisible(moved, visibleList(list, moved, "member", "", null));
    expect(removed.size).toBe(0);
  });
});

describe("diffMembers", () => {
  it("ADDED·DELETED 만 내고 코드 순 정렬", () => {
    const original = new Set(["A", "B"]);
    const now = new Set(["B", "C"]);
    expect(diffMembers("T1", original, now)).toEqual([
      { rowStatus: "DELETED", cateId: "T1", code: "A" },
      { rowStatus: "ADDED", cateId: "T1", code: "C" },
    ]);
  });

  it("변화가 없으면 빈 배열", () => {
    const s = new Set(["A"]);
    expect(diffMembers("T1", s, new Set(s))).toEqual([]);
  });
});

describe("성능 — 1,000건 배열", () => {
  it("moveSelected 는 선택 개수에만 비례해 200ms 이내다", () => {
    const list = items(1000);
    const members = new Set<string>();
    const selected = new Set(list.slice(0, 500).map((i) => i.code));
    const start = performance.now();
    const next = moveSelected(members, selected);
    const elapsed = performance.now() - start;
    expect(next.size).toBe(500);
    expect(elapsed).toBeLessThan(200);
  });

  it("moveAllVisible 은 1,000건 전체 이동도 200ms 이내다", () => {
    const list = items(1000);
    const members = new Set<string>();
    const visible = visibleList(list, members, "available", "", null);
    const start = performance.now();
    const next = moveAllVisible(members, visible);
    const elapsed = performance.now() - start;
    expect(next.size).toBe(1000);
    expect(elapsed).toBeLessThan(200);
  });
});
