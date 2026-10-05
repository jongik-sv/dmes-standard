/**
 * secWidget 저장소 — 기본 탭 응답 칸 매핑과 resetTab·shareTab·searchUsers 호출 모양(widget-tabs 2026-10-05, 설계 design-widget-tabs §3.1).
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

describe("secWidgetStore.load — 기본 탭 칸", () => {
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

describe("secWidgetStore 새 동작", () => {
  it("resetTab 은 secWidget/resetTab 에 tabId 를 보낸다", async () => {
    reply({ deleted: 3 });
    await secWidgetStore.resetTab!("def-3");
    expect(sent().url).toBe("/api/mcm/oasis/secWidget/resetTab");
    expect(sent().body.params).toEqual({ tabId: "def-3" });
  });

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
    h.apiRequest.mockResolvedValueOnce({ meta: { success: false, message: "기본 탭은 지울 수 없습니다." } });
    await expect(secWidgetStore.resetTab!("def-9")).rejects.toThrow("기본 탭은 지울 수 없습니다.");
  });
});
