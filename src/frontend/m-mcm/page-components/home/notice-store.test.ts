/**
 * 홈 공지 저장소 — 목록은 본문 없이 오고, 고른 공지의 본문은 선택할 때 한 번만 상세 조회로 받는다(화면 성능 가이드 R1).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  search: vi.fn(),
  detail: vi.fn(),
}));

vi.mock("./api", () => ({ searchNoticeBoard: h.search, fetchNoticeDetail: h.detail }));

type Store = typeof import("./notice-store");

async function fresh(): Promise<Store> {
  vi.resetModules();
  return import("./notice-store");
}

const rows = [
  { NOTICE_ID: "N1", TITLE: "긴급", NOTICE_CATEGORY: "URGENT", CONTENT_FORMAT: "TEXT" },
  { NOTICE_ID: "N2", TITLE: "일반", NOTICE_CATEGORY: "NORMAL", CONTENT_FORMAT: "TEXT" },
];

const flush = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

beforeEach(() => {
  h.search.mockReset().mockResolvedValue(rows);
  h.detail.mockReset().mockImplementation(async (id: string) => ({ NOTICE_ID: id, CONTENT: `본문 ${id}` }));
});

describe("공지 저장소 본문 조회", () => {
  it("목록을 받으면 자동 선택된 첫 공지의 본문만 상세 조회로 받는다", async () => {
    const s = await fresh();
    await s.reloadNotices();
    await flush();
    expect(h.detail).toHaveBeenCalledTimes(1);
    expect(h.detail).toHaveBeenCalledWith("N1");
    s.selectNotice("N1");
    expect(h.detail).toHaveBeenCalledTimes(1);
  });

  it("다른 공지를 고르면 그 본문을 받고, 다시 고르면 요청하지 않는다", async () => {
    const s = await fresh();
    await s.reloadNotices();
    await flush();
    s.selectNotice("N2");
    await flush();
    s.selectNotice("N1");
    s.selectNotice("N2");
    await flush();
    expect(h.detail.mock.calls.map((c) => c[0])).toEqual(["N1", "N2"]);
  });

  it("긴급 공지 띠의 내용 보기는 긴급 공지 본문을 받는다", async () => {
    const s = await fresh();
    await s.reloadNotices();
    await flush();
    s.selectNotice("N2");
    await flush();
    s.selectUrgentOrFirst();
    await flush();
    expect(h.detail.mock.calls.map((c) => c[0])).toEqual(["N1", "N2"]);
  });

  it("조회가 실패하면 다시 호출했을 때 재시도한다", async () => {
    h.detail.mockRejectedValueOnce(new Error("x"));
    const s = await fresh();
    await s.reloadNotices();
    await flush();
    s.loadDetail("N1");
    await flush();
    expect(h.detail).toHaveBeenCalledTimes(2);
  });

  it("목록을 다시 받으면 본문 캐시를 비워 다시 조회한다", async () => {
    const s = await fresh();
    await s.reloadNotices();
    await flush();
    await s.reloadNotices();
    await flush();
    expect(h.detail).toHaveBeenCalledTimes(2);
  });
});
