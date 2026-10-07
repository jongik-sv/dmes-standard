/**
 * secWidget 저장소 — 고정 탭(fixedYn·origin) 응답 칸 매핑, 기본 탭 호환, resetTab 없음, shareTab·searchUsers 호출 모양
 * (위젯 고정 탭 2026-10-07 §6, widget-tabs 2026-10-05).
 * apiRequest 는 대역으로 바꾸고 보낸 본문·응답 해제만 본다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock("@dk-oasis/shared/http", () => ({ apiRequest: h.apiRequest }));
vi.mock("@dk-oasis/shared/portal-shell", () => ({ getCurrentUser: vi.fn() }));

const { secWidgetStore } = await import("./widget-store");

const reply = (result: Record<string, unknown>) => h.apiRequest.mockResolvedValueOnce({ meta: { success: true }, data: { result } });
const sent = (i = 0) => {
  const [url, init] = h.apiRequest.mock.calls[i] as [string, { body: string }];
  return { url, body: JSON.parse(init.body) as { meta: unknown; params: Record<string, unknown>; grids?: Record<string, { rows: unknown[] }> } };
};

beforeEach(() => h.apiRequest.mockReset());

describe("secWidgetStore.load — 고정 탭 칸", () => {
  it("fixedYn=Y 줄은 fixed·origin 만 싣고(lockYn 은 사용자 잠금이 아니라 locked 로 싣지 않는다), 개인 탭은 기존 모양 그대로다", async () => {
    reply({
      tabs: [
        { tabId: "def-3", tabNm: "생산 현황", tabSeq: 101, lockYn: "Y", fixedYn: "Y", defaultYn: "Y", origin: "전사 기본 탭", customYn: "N" },
        { tabId: "dept-D100", tabNm: "정보기술팀", tabSeq: 200, lockYn: "Y", fixedYn: "Y", defaultYn: "Y", origin: "정보기술팀 부서 탭", customYn: "N" },
        { tabId: "def-5", tabNm: "출처 없음", tabSeq: 102, lockYn: "Y", fixedYn: true },
        { tabId: "tab-1", tabNm: "내 탭", tabSeq: 1, lockYn: "N", fixedYn: "N", origin: "무시" },
        { tabId: "tab-2", tabNm: "잠근 탭", tabSeq: 2, lockYn: "Y" },
      ],
      widgets: [{ tabId: "dept-D100", instId: "a", widgetId: "home.kpi", posX: 0, posY: 0, sizeW: 24, sizeH: 7, lockYn: "N", configJson: null }],
    });
    const tabs = await secWidgetStore.load();
    expect(tabs.map((t) => [t.tabId, t.fixed, t.origin, t.defaultTab, t.customized, t.locked, t.items.length])).toEqual([
      ["def-3", true, "전사 기본 탭", undefined, undefined, false, 0],
      ["dept-D100", true, "정보기술팀 부서 탭", undefined, undefined, false, 1],
      ["def-5", true, undefined, undefined, undefined, false, 0],
      ["tab-1", undefined, undefined, undefined, undefined, false, 0],
      ["tab-2", undefined, undefined, undefined, undefined, true, 0],
    ]);
    expect(Object.keys(tabs[3])).toEqual(["tabId", "name", "seq", "locked", "items"]);
    expect(Object.keys(tabs[0])).toEqual(["tabId", "name", "seq", "locked", "fixed", "origin", "items"]);
  });

  it("resetTab 메서드가 없다(메뉴가 사라진다)", () => {
    expect(secWidgetStore.resetTab).toBeUndefined();
    expect(typeof secWidgetStore.resetHome).toBe("function");
  });
});

describe("secWidgetStore.load — 옛 기본 탭 칸(fixedYn 없는 응답)", () => {
  it("defaultYn=Y 줄은 defaultTab·customized(customYn) 를 싣고, 일반 줄은 기존 모양 그대로다", async () => {
    reply({
      tabs: [
        { tabId: "home", tabNm: "홈", tabSeq: 0, lockYn: "N", defaultYn: "N", customYn: "N" },
        { tabId: "def-3", tabNm: "생산 현황", tabSeq: 101, lockYn: "Y", defaultYn: "Y", customYn: "Y" },
        { tabId: "def-4", tabNm: "품질", tabSeq: 102, lockYn: "N", defaultYn: "Y", customYn: "N" },
        { tabId: "tab-1", tabNm: "내 탭", tabSeq: 1, lockYn: "N" },
      ],
      widgets: [{ tabId: "def-3", instId: "a", widgetId: "home.kpi", posX: 0, posY: 0, sizeW: 24, sizeH: 7, lockYn: "N", configJson: null }],
    });
    const tabs = await secWidgetStore.load();
    expect(tabs.map((t) => [t.tabId, t.defaultTab, t.customized, t.locked, t.items.length])).toEqual([
      ["home", undefined, undefined, false, 0],
      ["def-3", true, true, true, 1],
      ["def-4", true, false, false, 0],
      ["tab-1", undefined, undefined, false, 0],
    ]);
    expect(Object.keys(tabs[3])).toEqual(["tabId", "name", "seq", "locked", "items"]);
  });
});

describe("secWidgetStore.saveTab — 새 탭(newYn)", () => {
  const TAB = { tabId: "tab-3", name: "새 탭", seq: 2, locked: false, items: [] };

  it("fresh 탭이면 newYn=Y 를 보내고 서버가 옮긴 tabId 를 돌려준다", async () => {
    reply({ tabId: "tab-4", count: 0 });
    expect(await secWidgetStore.saveTab({ ...TAB, fresh: true })).toEqual({ tabId: "tab-4" });
    expect(sent().body.params).toEqual({ tabId: "tab-3", tabNm: "새 탭", tabSeq: 2, lockYn: "N", newYn: "Y" });
  });

  it("fresh 가 아니면 newYn 을 보내지 않고, 응답에 tabId 가 없으면 요청 ID 를 돌려준다", async () => {
    reply({ count: 0 });
    expect(await secWidgetStore.saveTab({ ...TAB, fresh: false })).toEqual({ tabId: "tab-3" });
    expect(sent().body.params).toEqual({ tabId: "tab-3", tabNm: "새 탭", tabSeq: 2, lockYn: "N" });
    reply({ tabId: "tab-3" });
    await secWidgetStore.saveTab(TAB);
    expect(sent(1).body.params).not.toHaveProperty("newYn");
  });
});

describe("secWidgetStore 새 동작", () => {
  it("shareTab 은 tabId 와 grids.targets.rows=[{userId}] 를 보내고 results 를 푼다(ok 는 boolean·Y 모두)", async () => {
    reply({
      results: [
        { userId: "u1", ok: true, tabNm: "(공유) 생산", message: "" },
        { userId: "u2", ok: "N", tabNm: null, message: "탭 수 한도를 넘습니다." },
        { userId: "u3", ok: "Y", tabNm: "(공유) 생산", message: null },
      ],
    });
    const out = await secWidgetStore.shareTab!("tab-1", ["u1", "u2", "u3"]);
    expect(sent().url).toBe("/api/mcm/oasis/secWidget/shareTab");
    expect(sent().body.params).toEqual({ tabId: "tab-1" });
    expect(sent().body.grids).toEqual({ targets: { rows: [{ userId: "u1" }, { userId: "u2" }, { userId: "u3" }] } });
    expect(out).toEqual([
      { userId: "u1", ok: true, tabNm: "(공유) 생산", message: "" },
      { userId: "u2", ok: false, tabNm: "", message: "탭 수 한도를 넘습니다." },
      { userId: "u3", ok: true, tabNm: "(공유) 생산", message: "" },
    ]);
  });

  it("searchUsers 는 keyword(앞뒤 공백 제거)를 보내고 users 를 푼다(userId 없는 줄은 뺀다)", async () => {
    reply({ users: [{ userId: "u1", userNm: "김철수", deptNm: "생산팀" }, { userNm: "이름만" }, { userId: "u2", userNm: "이영희", deptNm: null }] });
    const out = await secWidgetStore.searchUsers!("  김철 ");
    expect(sent().body.params).toEqual({ keyword: "김철" });
    expect(out).toEqual([
      { userId: "u1", userNm: "김철수", deptNm: "생산팀" },
      { userId: "u2", userNm: "이영희", deptNm: "" },
    ]);
  });

  it("업무 거절(meta.success=false)은 메시지로 던진다", async () => {
    h.apiRequest.mockResolvedValueOnce({ meta: { success: false, message: "관리자가 정한 탭은 바꿀 수 없습니다." } });
    await expect(secWidgetStore.deleteTab("def-9")).rejects.toThrow("관리자가 정한 탭은 바꿀 수 없습니다.");
  });
});
