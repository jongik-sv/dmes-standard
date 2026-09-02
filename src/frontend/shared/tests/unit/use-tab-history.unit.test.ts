import { describe, expect, it } from "vitest";
import { resolveTargetTabId, type TabHistoryTabLike } from "../../src/portal-shell/use-tab-history";

const tab = (id: string, pageId: string, isHome = false): TabHistoryTabLike => ({
  id,
  pageId,
  isHome,
});

describe("resolveTargetTabId — popstate pageId → 유효 탭 id", () => {
  const tabs: TabHistoryTabLike[] = [
    tab("home:mcm:home", "mcm:home", true),
    tab("mcm:csa/commUserMng-1-a", "mcm:csa/commUserMng"),
    tab("mpn:scheduling/operation-list-2-b", "mpn:scheduling/operation-list"),
  ];

  it("열려 있는 탭이면 해당 탭 id 를 반환한다", () => {
    expect(resolveTargetTabId(tabs, "mcm:csa/commUserMng")).toBe("mcm:csa/commUserMng-1-a");
    expect(resolveTargetTabId(tabs, "mpn:scheduling/operation-list")).toBe(
      "mpn:scheduling/operation-list-2-b"
    );
  });

  it("홈 탭도 pageId 로 찾는다", () => {
    expect(resolveTargetTabId(tabs, "mcm:home")).toBe("home:mcm:home");
  });

  it("닫힌 탭(목록에 없는 pageId)이면 null 을 반환한다 — 호출부가 건너뛰기로 처리", () => {
    expect(resolveTargetTabId(tabs, "mcm:csa/commMenuMng")).toBeNull();
  });

  it("빈 탭 목록(홈 미설정 등)이면 null 을 반환한다", () => {
    expect(resolveTargetTabId([], "mcm:home")).toBeNull();
  });

  it("같은 pageId 가 여러 개여도 첫 번째를 반환한다(불변식상 발생하지 않지만 결정적 동작 보장)", () => {
    const dup: TabHistoryTabLike[] = [
      tab("first", "mcm:dup"),
      tab("second", "mcm:dup"),
    ];
    expect(resolveTargetTabId(dup, "mcm:dup")).toBe("first");
  });
});
