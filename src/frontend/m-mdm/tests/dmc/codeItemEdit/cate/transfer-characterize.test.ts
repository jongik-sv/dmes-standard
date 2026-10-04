// 특성 시험 — cate 두 사본(dmc 코드 편집·dmd 데이터 항목)의 transfer 순수 함수가 지금 내는 결과를 고정한다.
// 같은 입력에서 공통 연산(검색·이동·diff 집합)이 같은 답을 내는지, 그리고 diff 정렬 규칙이 다른 점
// (dmc 는 행 단위 localeCompare, dmd 는 문자열 배열 기본 .sort() — 코드포인트 순)을 그대로 적어 둔다.
// 공통 골격으로 옮긴 뒤에도 이 시험은 고치지 않고 통과해야 한다. 1,000건 성능 시험이 아니므로 PERF 목록에 넣지 않는다.
import { describe, expect, it } from "vitest";
import * as C from "../../../../pages/dmc/codeItemEdit/cate/transfer";
import * as D from "../../../../pages/dmd/dataItemMng/cate/transfer";

const items = [
  { code: "AB-01", name: "에이비", lvl1: "G" },
  { code: "b", name: "Bravo", lvl1: "H" },
  { code: "B", name: null, lvl1: null },
  { code: "가", name: "가나", lvl1: "G" },
  { code: "a", name: "alpha", lvl1: "H" },
];
const codes = (list: { code: string }[]) => list.map((i) => i.code);

describe("검색 — 두 사본이 같은 답을 낸다", () => {
  it.each(["", "  ", "ab", "AB-0", "에이", "bravo", "zz", " A "])("질의 %j", (q) => {
    for (const it1 of items) expect(C.matchesQuery(it1, q)).toBe(D.matchesQuery(it1, q));
  });

  it("코드·이름 부분 일치, 앞뒤 공백·대소문자 무시, 이름 null 은 빈 글자", () => {
    expect(items.filter((i) => C.matchesQuery(i, " A ")).map((i) => i.code)).toEqual(["AB-01", "b", "a"]);
    expect(C.matchesQuery(items[2], "x")).toBe(false);
    expect(C.matchesQuery(items[2], "b")).toBe(true);
  });
});

describe("가능·소속 분리 — dmc visibleList 와 dmd availableOf·memberOf", () => {
  it("질의만 쓰면 같은 목록을 같은 순서로 낸다", () => {
    const members = new Set(["b", "가"]);
    for (const q of ["", "a", "가"]) {
      expect(codes(C.visibleList(items, members, "available", q, null))).toEqual(codes(D.availableOf(items, members, q)));
      expect(codes(C.visibleList(items, members, "member", q, null))).toEqual(codes(D.memberOf(items, members, q)));
    }
    expect(codes(D.availableOf(items, members))).toEqual(["AB-01", "B", "a"]);
  });

  it("dmc 만 — lvl1 필터, 삭제 표시(deleted) 코드는 가능 쪽에서 빠지고 소속 쪽에는 남는다", () => {
    const marked: C.TransferItem[] = [
      { code: "X", name: null, lvl1: "G", mark: "deleted" },
      { code: "Y", name: null, lvl1: "G", mark: "unsaved" },
      { code: "Z", name: null, lvl1: "H" },
    ];
    expect(codes(C.visibleList(marked, new Set(), "available", "", null))).toEqual(["Y", "Z"]);
    expect(codes(C.visibleList(marked, new Set(["X"]), "member", "", null))).toEqual(["X"]);
    expect(codes(C.visibleList(marked, new Set(), "available", "", "G"))).toEqual(["Y"]);
    expect(codes(C.visibleList(items, new Set(), "available", "", "G"))).toEqual(["AB-01", "가"]);
  });
});

describe("이동 — 두 사본이 같은 집합을 내고 원본을 바꾸지 않는다", () => {
  it("> 와 <", () => {
    const original = new Set(["a"]);
    const picked = new Set(["b", "가"]);
    expect([...C.moveSelected(original, picked)]).toEqual([...D.moveToMembers(original, picked)]);
    expect([...C.moveSelected(original, picked)]).toEqual(["a", "b", "가"]);
    expect([...C.removeSelected(new Set(["a", "b"]), new Set(["a"]))])
      .toEqual([...D.removeFromMembers(new Set(["a", "b"]), new Set(["a"]))]);
    expect([...original]).toEqual(["a"]);
  });

  it("dmc 만 — >> 와 << 는 보이는 목록 전부", () => {
    const visible = items.slice(0, 2);
    expect([...C.moveAllVisible(new Set(["z"]), visible)]).toEqual(["z", "AB-01", "b"]);
    expect([...C.removeAllVisible(new Set(["AB-01", "z"]), visible)]).toEqual(["z"]);
  });
});

describe("diff — 집합은 같고 정렬 규칙과 모양이 다르다", () => {
  const original = new Set(["가", "keep", "B"]);
  const now = new Set(["b", "keep", "a", "Z"]);

  it("dmd 는 추가·해제를 따로 기본 .sort()(코드포인트 순)로 정렬한다", () => {
    expect(D.diffMembers(original, now)).toEqual({ addCodes: ["Z", "a", "b"], removeCodes: ["B", "가"] });
  });

  it("dmc 는 추가·해제 행을 한데 모아 localeCompare 로 정렬한다", () => {
    expect(C.diffMembers("T1", original, now)).toEqual([
      { rowStatus: "ADDED", cateId: "T1", code: "a" },
      { rowStatus: "ADDED", cateId: "T1", code: "b" },
      { rowStatus: "DELETED", cateId: "T1", code: "B" },
      { rowStatus: "ADDED", cateId: "T1", code: "Z" },
      { rowStatus: "DELETED", cateId: "T1", code: "가" },
    ]);
  });

  it("두 사본의 추가·해제 집합은 같다", () => {
    const d = D.diffMembers(original, now);
    const c = C.diffMembers("T1", original, now);
    expect(c.filter((r) => r.rowStatus === "ADDED").map((r) => r.code).sort()).toEqual(d.addCodes);
    expect(c.filter((r) => r.rowStatus === "DELETED").map((r) => r.code).sort()).toEqual(d.removeCodes);
  });

  it("같은 문자열 배열이라도 두 정렬 규칙의 순서가 다르다", () => {
    const set = new Set(["b", "B", "가", "a"]);
    expect(D.diffMembers(new Set(), set).addCodes).toEqual(["B", "a", "b", "가"]);
    expect(C.diffMembers("T", new Set(), set).map((r) => r.code)).toEqual(["a", "b", "B", "가"]);
  });

  it("변화가 없으면 비어 있다", () => {
    expect(D.diffMembers(original, new Set(original))).toEqual({ addCodes: [], removeCodes: [] });
    expect(C.diffMembers("T1", original, new Set(original))).toEqual([]);
  });
});

describe("dmc 만 — 선택 보조 함수", () => {
  it("lvl1Options 는 null 을 빼고 중복 없이 기본 .sort()", () => {
    expect(C.lvl1Options([...items, { code: "q", name: null, lvl1: "A" }, { code: "r", name: null, lvl1: "g" }]))
      .toEqual(["A", "G", "H", "g"]);
  });

  it("rangeSelect — anchor 가 보이는 목록에 없으면 target 하나만", () => {
    expect([...C.rangeSelect(items, "zz", "b")]).toEqual(["b"]);
    expect([...C.rangeSelect(items, "a", "b")]).toEqual(["b", "B", "가", "a"]);
  });

  it("toggleSelect·selectAllVisible 은 새 Set 을 낸다", () => {
    const s = new Set(["a"]);
    expect([...C.toggleSelect(s, "b")]).toEqual(["a", "b"]);
    expect([...C.toggleSelect(s, "a")]).toEqual([]);
    expect([...s]).toEqual(["a"]);
    expect([...C.selectAllVisible(items.slice(0, 2))]).toEqual(["AB-01", "b"]);
  });
});
