/**
 * 화면 사용 구간 전송기(usage-sender) — 공유 계약 C2·C3, 설계 §3.3(2026-10-02).
 * node 환경. fetch 는 주입한 가짜이고, 응답은 Response 대신 단순 객체(ok·status·json)를 쓴다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bindUsageSender,
  createUsageSender,
  type UsageSender,
  type UsageSenderOptions,
} from "../../src/portal-shell/usage-sender";
import type { UsageSegment } from "../../src/portal-shell/usage-tracker";

const ENDPOINT = "/api/mcm/oasis/screenUsage/record";

type FakeResponse = { ok: boolean; status: number; json: () => Promise<unknown> };
const ok = (): FakeResponse => ({
  ok: true,
  status: 200,
  json: async () => ({ meta: { success: true }, data: { result: { saved: 1, skipped: 0 } } }),
});
const httpError = (status: number): FakeResponse => ({ ok: false, status, json: async () => ({}) });
const rejectedBody = (): FakeResponse => ({
  ok: true,
  status: 200,
  json: async () => ({ meta: { success: false, message: "검증 실패" } }),
});

function seg(n: number): UsageSegment {
  return {
    clientSegId: `seg-${n}`,
    pageId: "csa/a",
    startKind: "OPEN",
    startedAt: 1_000 * n,
    endedAt: 1_000 * n + 5_000,
  };
}
const segs = (from: number, count: number) => Array.from({ length: count }, (_, i) => seg(from + i));
const ids = (list: UsageSegment[]) => list.map((s) => s.clientSegId);

/** 응답을 차례로 돌려주는 가짜 fetch. Error 를 넣으면 그 차례에 reject 한다. 다 쓰면 ok. */
function mockFetch(...responses: Array<FakeResponse | Error>) {
  const pending = [...responses];
  return vi.fn(async (_url: string, _init: RequestInit): Promise<FakeResponse> => {
    const next = pending.shift() ?? ok();
    if (next instanceof Error) throw next;
    return next;
  });
}
type CallLog = { mock: { calls: unknown[][] } };
function sentBody(fetchImpl: CallLog, call: number) {
  const init = fetchImpl.mock.calls[call][1] as RequestInit;
  return JSON.parse(String(init.body));
}
const sentRows = (fetchImpl: CallLog, call: number): UsageSegment[] =>
  sentBody(fetchImpl, call).grids.segments.rows;

/** 묶음 크기 자동 전송은 마이크로태스크로 미뤄 돌므로 몇 차례 비운다. */
async function settle() {
  for (let i = 0; i < 50; i += 1) await Promise.resolve();
}

let sender: UsageSender | null = null;
function create(fetchImpl: unknown, overrides: Partial<UsageSenderOptions> = {}): UsageSender {
  sender = createUsageSender({
    endpoint: ENDPOINT,
    fetchImpl: fetchImpl as typeof fetch,
    ...overrides,
  });
  return sender;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  sender?.dispose();
  sender = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("createUsageSender", () => {
  it("20건이 차면 바로 한 묶음으로 보내고, 본문은 C3 형식이다", async () => {
    const fetchImpl = mockFetch();
    const s = create(fetchImpl, {
      buildMeta: async () => ({ userId: "u1", menuId: "PORTAL_SHELL" }),
    });
    s.enqueue(segs(0, 19));
    await settle();
    expect(fetchImpl).not.toHaveBeenCalled();

    s.enqueue([seg(19)]);
    await settle();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(ENDPOINT);
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("same-origin");
    expect(init.keepalive).toBe(false);
    expect(JSON.parse(String(init.body))).toEqual({
      meta: { userId: "u1", menuId: "PORTAL_SHELL" },
      params: {},
      grids: { segments: { rows: segs(0, 20) } },
    });
  });

  it("20건이 안 돼도 60초마다 보내고, buildMeta 가 없으면 meta 는 { menuId: PORTAL_SHELL } 이다", async () => {
    const fetchImpl = mockFetch();
    const s = create(fetchImpl);
    s.enqueue(segs(0, 3));
    await vi.advanceTimersByTimeAsync(59_999);
    await settle();
    expect(fetchImpl).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await settle();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sentBody(fetchImpl, 0).meta).toEqual({ menuId: "PORTAL_SHELL" });
    expect(ids(sentRows(fetchImpl, 0))).toEqual(["seg-0", "seg-1", "seg-2"]);
  });

  it("실패하면 큐에 되돌리고, 다음 주기 전에는 묶음 크기가 차도 다시 보내지 않는다(재시도 폭주 방지)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchImpl = mockFetch(new Error("network down"));
    const s = create(fetchImpl);
    s.enqueue(segs(0, 20));
    await settle();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);

    s.enqueue([seg(20)]);
    await settle();
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000);
    await settle();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(ids(sentRows(fetchImpl, 1))).toEqual(ids(segs(0, 21))); // 원래 구간이 앞, 같은 clientSegId

    s.enqueue(segs(21, 20)); // 성공 뒤에는 묶음 크기 자동 전송이 다시 돈다
    await settle();
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("HTTP 오류와 meta.success=false 도 실패로 보고 같은 구간을 다시 보낸다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchImpl = mockFetch(httpError(403), rejectedBody(), ok());
    const s = create(fetchImpl, { batchSize: 1000 });
    s.enqueue(segs(0, 2));
    await s.flush();
    await s.flush();
    await s.flush();
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    for (const call of [0, 1, 2]) expect(ids(sentRows(fetchImpl, call))).toEqual(["seg-0", "seg-1"]);

    await s.flush();
    expect(fetchImpl).toHaveBeenCalledTimes(3); // 다 보냈으면 더 보내지 않는다
  });

  it("buildMeta 가 실패해도 던지지 않고 구간을 남겨 다음에 보낸다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    let first = true;
    const buildMeta = vi.fn(async () => {
      if (first) {
        first = false;
        throw new Error("me 실패");
      }
      return { userId: "u1", menuId: "PORTAL_SHELL" };
    });
    const fetchImpl = mockFetch();
    const s = create(fetchImpl, { batchSize: 1000, buildMeta });
    s.enqueue([seg(0)]);
    await expect(s.flush()).resolves.toBeUndefined();
    expect(fetchImpl).not.toHaveBeenCalled();

    await s.flush();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sentBody(fetchImpl, 0).meta).toEqual({ userId: "u1", menuId: "PORTAL_SHELL" });
  });

  it("큐는 200건까지만 두고 넘치면 오래된 것부터 버리며, 한 요청에는 100건까지 싣는다", async () => {
    const fetchImpl = mockFetch();
    const s = create(fetchImpl, { batchSize: 1000 });
    s.enqueue(segs(0, 250));
    await s.flush();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(ids(sentRows(fetchImpl, 0))).toEqual(ids(segs(50, 100)));
    expect(ids(sentRows(fetchImpl, 1))).toEqual(ids(segs(150, 100)));
  });

  it("실패해 되돌린 구간과 새 구간을 합쳐도 상한 200을 지킨다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchImpl = mockFetch(new Error("down"), new Error("down"));
    const s = create(fetchImpl, { batchSize: 1000 });
    s.enqueue(segs(0, 150));
    await s.flush(); // 100 + 50 두 요청 모두 실패 → 150건 되돌림
    s.enqueue(segs(150, 100)); // 250건 → 오래된 50건 버림
    await s.flush();
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(ids(sentRows(fetchImpl, 2))).toEqual(ids(segs(50, 100)));
    expect(ids(sentRows(fetchImpl, 3))).toEqual(ids(segs(150, 100)));
  });

  it("keepalive flush 는 keepalive:true 로 남은 것을 모두 보낸다", async () => {
    const fetchImpl = mockFetch();
    const s = create(fetchImpl, { batchSize: 1000 });
    s.enqueue(segs(0, 120));
    await s.flush({ keepalive: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    for (const call of fetchImpl.mock.calls) expect(call[1].keepalive).toBe(true);
    expect(sentRows(fetchImpl, 0).length + sentRows(fetchImpl, 1).length).toBe(120);
  });

  it("보내는 중에 다시 flush 해도 같은 구간을 두 번 보내지 않는다", async () => {
    let release: (response: FakeResponse) => void = () => {};
    let n = 0;
    const fetchImpl = vi.fn((_url: string, _init: RequestInit): Promise<FakeResponse> => {
      n += 1;
      if (n === 1) {
        return new Promise<FakeResponse>((resolve) => {
          release = resolve;
        });
      }
      return Promise.resolve(ok());
    });
    const s = create(fetchImpl, { batchSize: 1000 });
    s.enqueue(segs(0, 5));
    const first = s.flush();
    await settle();
    s.enqueue(segs(5, 3));
    const second = s.flush();
    await settle();
    release(ok());
    await Promise.all([first, second]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(ids(sentRows(fetchImpl, 0))).toEqual(ids(segs(0, 5)));
    expect(ids(sentRows(fetchImpl, 1))).toEqual(ids(segs(5, 3)));
  });

  it("dispose 뒤에는 주기 전송을 멈추지만 명시적 flush 는 보낸다", async () => {
    const fetchImpl = mockFetch();
    const s = create(fetchImpl);
    s.enqueue(segs(0, 2));
    s.dispose();
    await vi.advanceTimersByTimeAsync(120_000);
    await settle();
    expect(fetchImpl).not.toHaveBeenCalled();

    await s.flush({ keepalive: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("bindUsageSender", () => {
  class FakeDoc extends EventTarget {
    visibilityState: "visible" | "hidden" = "visible";
  }
  function fakeSender() {
    return {
      enqueue: vi.fn((_segments: UsageSegment[]) => {}),
      flush: vi.fn(async (_opts?: { keepalive?: boolean }) => {}),
      dispose: vi.fn(() => {}),
    };
  }
  let doc: FakeDoc;
  let win: EventTarget;

  beforeEach(() => {
    doc = new FakeDoc();
    win = new EventTarget();
  });

  it("보이는 동안 받은 구간은 큐에만 넣는다", () => {
    const s = fakeSender();
    const b = bindUsageSender(s, { doc, win });
    b.onSegments([seg(1)]);
    expect(s.enqueue).toHaveBeenCalledWith([seg(1)]);
    expect(s.flush).not.toHaveBeenCalled();
    b.dispose();
  });

  it("가려진 상태에서 받은 구간은 넣자마자 keepalive 로 보낸다", () => {
    const s = fakeSender();
    const b = bindUsageSender(s, { doc, win });
    doc.visibilityState = "hidden";
    b.onSegments([seg(1)]);
    expect(s.enqueue).toHaveBeenCalledWith([seg(1)]);
    expect(s.flush).toHaveBeenCalledWith({ keepalive: true });
    b.dispose();
  });

  it("가려지면 남은 큐를 keepalive 로 비우고, 다시 보일 때는 보내지 않는다", () => {
    const s = fakeSender();
    const b = bindUsageSender(s, { doc, win });
    doc.visibilityState = "hidden";
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(s.flush).toHaveBeenCalledTimes(1);
    expect(s.flush).toHaveBeenCalledWith({ keepalive: true });
    doc.visibilityState = "visible";
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(s.flush).toHaveBeenCalledTimes(1);
    b.dispose();
  });

  it("pagehide 뒤에는 아직 visible 이어도 받은 구간을 바로 keepalive 로 보낸다(새로고침·창 닫기, 리스너 순서 무관)", () => {
    const s = fakeSender();
    const b = bindUsageSender(s, { doc, win });
    win.dispatchEvent(new Event("pagehide"));
    expect(s.flush).toHaveBeenCalledWith({ keepalive: true });
    s.flush.mockClear();

    b.onSegments([seg(1)]); // 추적기의 pagehide 리스너가 나중에 돌아 마지막 구간을 넘긴 경우
    expect(s.enqueue).toHaveBeenCalledWith([seg(1)]);
    expect(s.flush).toHaveBeenCalledWith({ keepalive: true });
    b.dispose();
  });

  it("bfcache 로 돌아오면(pageshow persisted) 닫는 중 표시를 푼다", () => {
    const s = fakeSender();
    const b = bindUsageSender(s, { doc, win });
    win.dispatchEvent(new Event("pagehide"));
    win.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
    s.flush.mockClear();
    b.onSegments([seg(1)]);
    expect(s.flush).not.toHaveBeenCalled();
    b.dispose();
  });

  it("closeAndFlush 는 바로 keepalive 로 보내고, 그 뒤 받은 구간도 바로 보낸다(로그아웃·언마운트)", () => {
    const s = fakeSender();
    const b = bindUsageSender(s, { doc, win });
    b.closeAndFlush();
    expect(s.flush).toHaveBeenCalledWith({ keepalive: true });
    s.flush.mockClear();
    b.onSegments([seg(1)]);
    expect(s.flush).toHaveBeenCalledWith({ keepalive: true });
    b.dispose();
  });

  it("dispose 는 리스너만 떼고 sender 를 멈추지 않는다", () => {
    const s = fakeSender();
    const b = bindUsageSender(s, { doc, win });
    b.dispose();
    win.dispatchEvent(new Event("pagehide"));
    doc.visibilityState = "hidden";
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(s.flush).not.toHaveBeenCalled();
    expect(s.dispose).not.toHaveBeenCalled();
  });
});
