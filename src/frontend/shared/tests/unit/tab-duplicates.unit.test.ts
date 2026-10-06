import { describe, expect, it } from "vitest";
import { numberDuplicateTitles, pickTabForPage } from "../../src/portal-shell/tab-duplicates";

const t = (id: string, pageId: string, title = pageId, isHome = false) => ({ id, pageId, title, isHome });

describe("numberDuplicateTitles", () => {
  it("중복이 없으면 같은 배열을 돌려준다", () => {
    const tabs = [t("h", "x:home", "홈", true), t("a", "x:a", "A")];
    expect(numberDuplicateTitles(tabs)).toBe(tabs);
  });
  it("같은 pageId 는 표시 순서대로 (2)(3) 이 붙고 첫 탭은 그대로다", () => {
    const out = numberDuplicateTitles([t("a1", "x:a", "A"), t("b", "x:b", "B"), t("a2", "x:a", "A"), t("a3", "x:a", "A")]);
    expect(out.map((x) => x.title)).toEqual(["A", "B", "A (2)", "A (3)"]);
  });
  it("가운데 탭이 닫히면 번호를 다시 매긴다", () => {
    const out = numberDuplicateTitles([t("a1", "x:a", "A"), t("a3", "x:a", "A")]);
    expect(out.map((x) => x.title)).toEqual(["A", "A (2)"]);
  });
  it("홈 탭은 세지 않는다", () => {
    const tabs = [t("h", "x:a", "홈", true), t("a1", "x:a", "A")];
    expect(numberDuplicateTitles(tabs)).toBe(tabs);
  });
});

describe("pickTabForPage", () => {
  const tabs = [t("a1", "x:a"), t("b", "x:b"), t("a2", "x:a")];
  it("활성 탭이 그 화면이면 활성 탭", () => expect(pickTabForPage(tabs, "x:a", "a2")?.id).toBe("a2"));
  it("아니면 순서상 첫 탭", () => expect(pickTabForPage(tabs, "x:a", "b")?.id).toBe("a1"));
  it("없으면 undefined", () => expect(pickTabForPage(tabs, "x:z", null)).toBeUndefined());
});
