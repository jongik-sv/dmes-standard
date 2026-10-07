import { describe, expect, it } from "vitest";

import {
  LINKS_EMPTY_MESSAGE,
  addLinkItem,
  changeLinkKind,
  flattenMenuPages,
  linkTarget,
  moveLinkItem,
  removeLinkItem,
  updateLinkItem,
  validateLinkItems,
  type LinkItem,
  type MenuNodeLike,
} from "./links";

const page = (label: string, pageId = "mcm:csa/commMenuMng"): LinkItem => ({ label, kind: "page", pageId });
const url = (label: string, u = "https://www.example.org/"): LinkItem => ({ label, kind: "url", url: u });

describe("validateLinkItems — 링크 모음 편집기 검사(스펙 §6)", () => {
  it("올바른 항목이면 오류가 없다", () => {
    expect(validateLinkItems([page("메뉴 관리"), url("사내 게시판")])).toEqual([]);
  });

  it("항목이 하나도 없으면 오류", () => {
    expect(validateLinkItems([])).toEqual([LINKS_EMPTY_MESSAGE]);
  });

  it("이름이 비면 몇 번째인지 알려 준다(공백만 있어도 빈 이름)", () => {
    expect(validateLinkItems([page("가"), page("  ")])).toEqual(["2번째 링크의 이름을 입력하세요"]);
  });

  it("화면 링크는 pageId 가 있어야 한다", () => {
    expect(validateLinkItems([{ label: "가", kind: "page" }])).toEqual(["1번째 링크의 화면을 고르세요"]);
    expect(validateLinkItems([{ label: "가", kind: "page", pageId: " " }])).toEqual([
      "1번째 링크의 화면을 고르세요",
    ]);
  });

  it("웹 링크는 http(s) 절대 주소만", () => {
    const msg = "1번째 링크의 주소는 http:// 또는 https:// 로 시작해야 합니다";
    expect(validateLinkItems([url("가", "javascript:alert(1)")])).toEqual([msg]);
    expect(validateLinkItems([url("가", "/mcm/home")])).toEqual([msg]);
    expect(validateLinkItems([url("가", "")])).toEqual([msg]);
    expect(validateLinkItems([{ label: "가", kind: "url" }])).toEqual([msg]);
  });

  it("한 항목에 오류가 둘이면 둘 다 알려 준다", () => {
    expect(validateLinkItems([url("", "data:text/html,x")])).toEqual([
      "1번째 링크의 이름을 입력하세요",
      "1번째 링크의 주소는 http:// 또는 https:// 로 시작해야 합니다",
    ]);
  });
});

describe("항목 편집 순수 함수", () => {
  const items = [page("A"), page("B"), page("C")];
  const labels = (xs: LinkItem[]) => xs.map((x) => x.label);

  it("moveLinkItem — 위·아래로 한 칸, 끝에서는 그대로, 원본은 바꾸지 않는다", () => {
    expect(labels(moveLinkItem(items, 1, -1))).toEqual(["B", "A", "C"]);
    expect(labels(moveLinkItem(items, 1, 1))).toEqual(["A", "C", "B"]);
    expect(labels(moveLinkItem(items, 0, -1))).toEqual(["A", "B", "C"]);
    expect(labels(moveLinkItem(items, 2, 1))).toEqual(["A", "B", "C"]);
    expect(labels(moveLinkItem(items, 5, -1))).toEqual(["A", "B", "C"]);
    expect(labels(items)).toEqual(["A", "B", "C"]);
  });

  it("removeLinkItem — 그 자리만 빠진다, 범위 밖이면 그대로", () => {
    expect(labels(removeLinkItem(items, 1))).toEqual(["A", "C"]);
    expect(labels(removeLinkItem(items, 9))).toEqual(["A", "B", "C"]);
    expect(items).toHaveLength(3);
  });

  it("addLinkItem — 끝에 빈 화면 링크를 더한다", () => {
    const next = addLinkItem(items);
    expect(next).toHaveLength(4);
    expect(next[3]).toEqual({ label: "", kind: "page", pageId: "" });
    expect(items).toHaveLength(3);
  });

  it("updateLinkItem — 그 항목만 바꾼다", () => {
    const next = updateLinkItem(items, 2, { label: "다" });
    expect(labels(next)).toEqual(["A", "B", "다"]);
    expect(next[2].pageId).toBe("mcm:csa/commMenuMng");
    expect(labels(items)).toEqual(["A", "B", "C"]);
  });

  it("changeLinkKind — 종류를 바꾸면 다른 종류의 값은 버리고 이름은 남긴다", () => {
    expect(changeLinkKind(page("A"), "url")).toEqual({ label: "A", kind: "url", url: "" });
    expect(changeLinkKind(url("B"), "page")).toEqual({ label: "B", kind: "page", pageId: "" });
    const same = page("A");
    expect(changeLinkKind(same, "page")).toBe(same);
  });
});

describe("linkTarget — 렌더러가 누를 때 할 일", () => {
  it("화면 링크 → page, 웹 링크 → 정리된 url", () => {
    expect(linkTarget(page("A", " mcm:lsh/noticeMgmt "))).toEqual({ kind: "page", pageId: "mcm:lsh/noticeMgmt" });
    expect(linkTarget(url("B", " https://www.example.org/x "))).toEqual({
      kind: "url",
      url: "https://www.example.org/x",
    });
  });

  it("열 수 없는 항목은 null(누름 막기)", () => {
    expect(linkTarget({ label: "A", kind: "page", pageId: "" })).toBeNull();
    expect(linkTarget(url("B", "javascript:alert(1)"))).toBeNull();
    expect(linkTarget({ label: "C", kind: "url" })).toBeNull();
  });
});

describe("메뉴 고르기 목록", () => {
  interface Node extends MenuNodeLike {
    pageId: string | null;
    items: Node[];
  }
  const tree: Node[] = [
    {
      name: "공통",
      pageId: null,
      items: [
        { name: "메뉴 관리", pageId: "mcm:csa/commMenuMng", items: [] },
        { name: "숨은 폴더", pageId: null, items: [{ name: "코드 관리", pageId: "mcm:csa/codeMng", items: [] }] },
      ],
    },
    { name: "공지", pageId: "mcm:lsh/noticeMgmt", items: [] },
    { name: "중복", pageId: "mcm:csa/commMenuMng", items: [] },
  ];

  it("flattenMenuPages — 화면만 모아 「상위 > 이름」 라벨을 붙이고 pageId 중복은 첫 것만", () => {
    expect(flattenMenuPages(tree, (n) => n.pageId)).toEqual([
      { value: "mcm:csa/commMenuMng", label: "공통 > 메뉴 관리" },
      { value: "mcm:csa/codeMng", label: "공통 > 숨은 폴더 > 코드 관리" },
      { value: "mcm:lsh/noticeMgmt", label: "공지" },
    ]);
  });
});
