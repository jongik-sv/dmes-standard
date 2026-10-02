/**
 * 화면 사용 구간 추적기(UsageTracker) — 설계 §3.1 구간 정의(2026-10-02).
 * node 환경. document·window 대신 EventTarget 을 주입하고, 가짜 타이머로 Date 와 60초 판정을 함께 움직인다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  USAGE_IDLE_MS,
  USAGE_MAX_SEGMENT_MS,
  USAGE_MIN_SEGMENT_MS,
  USAGE_TICK_MS,
  UsageTracker,
  createUsageSegmentId,
  toUsagePageId,
  type UsageSegment,
  type UsageTrackerOptions,
} from "../../src/portal-shell/usage-tracker";

const BASE = Date.UTC(2026, 9, 2, 0, 0, 0);
const MIN = 60_000;

class FakeDoc extends EventTarget {
  visibilityState: "visible" | "hidden" = "visible";
}

let doc: FakeDoc;
let win: EventTarget;
let emitted: UsageSegment[][];
let tracker: UsageTracker | null;
let seq: number;

function create(overrides: Partial<UsageTrackerOptions> = {}): UsageTracker {
  tracker = new UsageTracker({
    onSegments: (segments) => {
      emitted.push(segments);
    },
    now: () => Date.now(),
    doc,
    win,
    createId: () => `seg-${++seq}`,
    ...overrides,
  });
  return tracker;
}

/** 한 번 넘긴 묶음을 [pageId, startKind, 시작(BASE 기준 ms), 끝] 으로 줄인다. */
function rows(batch: UsageSegment[]) {
  return batch.map((s) => [s.pageId, s.startKind, s.startedAt - BASE, s.endedAt - BASE]);
}
const all = () => emitted.flat();
const advance = (ms: number) => vi.advanceTimersByTime(ms);
const input = (type = "pointerdown") => doc.dispatchEvent(new Event(type));
function setVisibility(state: "visible" | "hidden") {
  doc.visibilityState = state;
  doc.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(BASE);
  doc = new FakeDoc();
  win = new EventTarget();
  emitted = [];
  tracker = null;
  seq = 0;
});

afterEach(() => {
  tracker?.dispose();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("UsageTracker 기본값", () => {
  it("무입력 30분·구간 상한 15분·최소 1초·판정 주기 60초", () => {
    expect(USAGE_IDLE_MS).toBe(30 * MIN);
    expect(USAGE_MAX_SEGMENT_MS).toBe(15 * MIN);
    expect(USAGE_MIN_SEGMENT_MS).toBe(1000);
    expect(USAGE_TICK_MS).toBe(MIN);
  });
});

describe("UsageTracker 구간 전환", () => {
  it("OPEN 으로 연 구간은 다른 화면으로 넘어갈 때 닫히고, 다음 구간은 SWITCH 로 시작한다", () => {
    const t = create();
    t.activate("csa/a", "OPEN");
    advance(5000);
    t.activate("csa/b", "SWITCH");
    expect(emitted.map(rows)).toEqual([[["csa/a", "OPEN", 0, 5000]]]);
    expect(emitted[0][0].clientSegId).toBe("seg-1");

    advance(3000);
    t.activate("csa/a"); // 기본값 SWITCH
    expect(emitted.map(rows)).toEqual([
      [["csa/a", "OPEN", 0, 5000]],
      [["csa/b", "SWITCH", 5000, 8000]],
    ]);
  });

  it("홈(null)은 구간을 끝내기만 하고, 홈에 있는 동안 입력이 와도 기록하지 않는다", () => {
    const t = create();
    t.activate("csa/a", "OPEN");
    advance(4000);
    t.activate(null);
    input();
    advance(MIN);
    t.activate("csa/b", "SWITCH");
    advance(2000);
    t.end();
    expect(emitted.map(rows)).toEqual([
      [["csa/a", "OPEN", 0, 4000]],
      [["csa/b", "SWITCH", 64_000, 66_000]],
    ]);
  });

  it("1초 미만 구간은 버린다", () => {
    const t = create();
    t.activate("csa/a", "OPEN");
    advance(999);
    t.activate("csa/b");
    advance(1000);
    t.activate("csa/c");
    expect(emitted.map(rows)).toEqual([[["csa/b", "SWITCH", 999, 1999]]]);
  });

  it("같은 화면을 다시 활성화해도 열린 구간을 쪼개지 않는다", () => {
    const t = create();
    t.activate("csa/a", "OPEN");
    advance(3000);
    t.activate("csa/a");
    advance(2000);
    t.end();
    expect(emitted.map(rows)).toEqual([[["csa/a", "OPEN", 0, 5000]]]);
  });

  it("end() 뒤에는 입력이나 주기 판정이 와도 구간을 다시 열지 않는다(로그아웃)", () => {
    const t = create();
    t.activate("csa/a", "OPEN");
    advance(3000);
    t.end();
    input();
    advance(5 * MIN);
    t.end();
    expect(emitted.map(rows)).toEqual([[["csa/a", "OPEN", 0, 3000]]]);
  });

  it("dispose() 는 열린 구간을 보낸 뒤 리스너와 타이머를 뗀다", () => {
    const t = create();
    t.activate("csa/a", "OPEN");
    advance(2000);
    t.dispose();
    expect(emitted.map(rows)).toEqual([[["csa/a", "OPEN", 0, 2000]]]);

    setVisibility("hidden");
    setVisibility("visible");
    input();
    win.dispatchEvent(new Event("pagehide"));
    t.activate("csa/b");
    advance(20 * MIN);
    t.end();
    expect(emitted).toHaveLength(1);
  });

  it("onSegments 가 던져도 추적은 계속하고 console.warn 만 남긴다", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let calls = 0;
    const t = create({
      onSegments: () => {
        calls += 1;
        throw new Error("boom");
      },
    });
    t.activate("csa/a", "OPEN");
    advance(2000);
    t.activate("csa/b");
    advance(2000);
    t.activate("csa/c");
    expect(calls).toBe(2);
    expect(warn).toHaveBeenCalled();
  });
});

describe("UsageTracker 브라우저 탭 가림·pagehide", () => {
  it("가리면 닫고, 다시 보이면 RESUME 으로 잇는다", () => {
    const t = create();
    t.activate("csa/a", "OPEN");
    advance(3000);
    setVisibility("hidden");
    advance(10_000);
    setVisibility("visible");
    advance(2000);
    t.activate("csa/b");
    expect(emitted.map(rows)).toEqual([
      [["csa/a", "OPEN", 0, 3000]],
      [["csa/a", "RESUME", 13_000, 15_000]],
    ]);
  });

  it("가려진 동안 입력이 와도 구간을 열지 않는다", () => {
    const t = create();
    t.activate("csa/a", "OPEN");
    advance(2000);
    setVisibility("hidden");
    input();
    advance(5000);
    t.end();
    expect(emitted.map(rows)).toEqual([[["csa/a", "OPEN", 0, 2000]]]);
  });

  it("가려진 채 연 탭은 보이게 될 때 OPEN 으로 시작한다(열람 횟수 유지)", () => {
    doc.visibilityState = "hidden";
    const t = create();
    t.activate("csa/a", "OPEN");
    advance(5000);
    setVisibility("visible");
    advance(2000);
    t.end();
    expect(emitted.map(rows)).toEqual([[["csa/a", "OPEN", 5000, 7000]]]);
  });

  it("pagehide 에서 닫고, 돌아와 입력이 오면 RESUME 으로 연다", () => {
    const t = create();
    t.activate("csa/a", "OPEN");
    advance(4000);
    win.dispatchEvent(new Event("pagehide"));
    advance(1000);
    input("keydown");
    advance(3000);
    t.end();
    expect(emitted.map(rows)).toEqual([
      [["csa/a", "OPEN", 0, 4000]],
      [["csa/a", "RESUME", 5000, 8000]],
    ]);
  });
});

describe("UsageTracker 무입력", () => {
  it("30분 동안 입력이 없으면 마지막 입력 시각에서 끝내고, 입력이 돌아오면 RESUME 으로 연다", () => {
    const t = create({ maxSegmentMs: 3 * 60 * MIN }); // 자르기와 떼어 무입력 규칙만 본다
    t.activate("csa/a", "OPEN");
    advance(5 * MIN);
    input("keydown");
    advance(29 * MIN); // 34분 — 마지막 입력 뒤 29분
    expect(emitted).toEqual([]);
    advance(MIN); // 35분 판정
    expect(emitted.map(rows)).toEqual([[["csa/a", "OPEN", 0, 5 * MIN]]]);

    advance(5 * MIN); // 40분
    input("wheel");
    advance(2 * MIN);
    t.activate("csa/b");
    expect(emitted.map(rows)).toEqual([
      [["csa/a", "OPEN", 0, 5 * MIN]],
      [["csa/a", "RESUME", 40 * MIN, 42 * MIN]],
    ]);
  });

  it("입력 없이 20분 → 15분 조각은 마지막 입력 시각까지만 내고, 30분 무입력 뒤에도 추가 구간이 없다", () => {
    create().activate("csa/a", "OPEN");
    advance(5 * MIN);
    input();
    advance(15 * MIN); // 20분 — 15분 판정 때 마지막 입력(5분)에서 자른다
    expect(emitted.map(rows)).toEqual([[["csa/a", "OPEN", 0, 5 * MIN]]]);
    advance(20 * MIN); // 40분 — 마지막 입력 뒤 30분(35분 판정)이면 길이 0 이라 버린다
    expect(emitted.map(rows)).toEqual([[["csa/a", "OPEN", 0, 5 * MIN]]]);
  });
});

describe("UsageTracker 15분 자르기", () => {
  it("15분 판정 때 마지막 입력 시각에서 자르고 그 시각부터 RESUME 으로 이어 간다", () => {
    const t = create();
    t.activate("csa/a", "OPEN");
    advance(14 * MIN);
    input();
    advance(MIN); // 15분 판정 — 마지막 입력(14분)에서 자른다
    expect(emitted.map(rows)).toEqual([[["csa/a", "OPEN", 0, 14 * MIN]]]);

    advance(14 * MIN); // 29분
    input();
    advance(MIN); // 30분 판정 — 14분부터 16분째, 마지막 입력(29분)에서 자른다
    advance(MIN); // 31분
    t.activate("csa/b");
    expect(emitted.map(rows)).toEqual([
      [["csa/a", "OPEN", 0, 14 * MIN]],
      [["csa/a", "RESUME", 14 * MIN, 29 * MIN]],
      [["csa/a", "RESUME", 29 * MIN, 31 * MIN]],
    ]);
    expect(new Set(all().map((s) => s.clientSegId)).size).toBe(3);
  });

  it("타이머가 멈춰 있다가 닫혀도(절전·백그라운드 제한) 15분 넘는 구간을 내지 않는다", () => {
    const t = create();
    t.activate("csa/a", "OPEN");
    vi.setSystemTime(BASE + 40 * MIN); // 시계만 가고 타이머는 돌지 않았다
    input();
    t.activate("csa/b");
    expect(emitted.map(rows)).toEqual([
      [
        ["csa/a", "OPEN", 0, 15 * MIN],
        ["csa/a", "RESUME", 15 * MIN, 30 * MIN],
        ["csa/a", "RESUME", 30 * MIN, 40 * MIN],
      ],
    ]);
  });
});

describe("UsageTracker 빠른 전환", () => {
  it("짧은 간격으로 오가도 구간이 겹치거나 같은 clientSegId 가 두 번 나오지 않는다", () => {
    const t = create({ createId: createUsageSegmentId }); // 실제 ID 생성기
    const pages = ["csa/a", "csa/b", "csa/c", null, "csa/a", "csa/b", "csa/a"];
    const gaps = [1200, 300, 1500, 800, 2000, 50, 1000];
    pages.forEach((pageId, i) => {
      t.activate(pageId, i < 3 ? "OPEN" : "SWITCH");
      advance(gaps[i]);
    });
    t.end();

    const segs = all();
    expect(new Set(segs.map((s) => s.clientSegId)).size).toBe(segs.length);
    const sorted = [...segs].sort((x, y) => x.startedAt - y.startedAt);
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i].startedAt).toBeGreaterThanOrEqual(sorted[i - 1].endedAt);
    }
    for (const s of segs) expect(s.endedAt - s.startedAt).toBeGreaterThanOrEqual(1000);
    expect(segs.map((s) => [s.pageId, s.startKind])).toEqual([
      ["csa/a", "OPEN"],
      ["csa/c", "OPEN"],
      ["csa/a", "SWITCH"],
      ["csa/a", "SWITCH"],
    ]);
  });

  it("시계가 뒤로 가도 앞 구간 끝보다 이르게 시작하지 않는다", () => {
    let now = BASE + 10_000;
    const t = create({ now: () => now });
    t.activate("csa/a", "OPEN");
    now = BASE + 12_000;
    t.activate("csa/b"); // a 10→12
    now = BASE + 5_000; // 시계 역행
    t.activate("csa/c"); // b 는 12 에서 닫혀 0초라 버림, c 는 12 부터
    now = BASE + 14_000;
    t.end();
    expect(emitted.map(rows)).toEqual([
      [["csa/a", "OPEN", 10_000, 12_000]],
      [["csa/c", "SWITCH", 12_000, 14_000]],
    ]);
  });
});

describe("toUsagePageId", () => {
  it("탭 pageId 에서 모듈 접두를 떼어 componentPath(PARENT_MENU_ID/OBJECT_ID) 만 남긴다", () => {
    expect(toUsagePageId("mcm:csa/commUserMng")).toBe("csa/commUserMng");
    expect(toUsagePageId("mdm:mdm/ruleMng")).toBe("mdm/ruleMng");
    expect(toUsagePageId("csa/commUserMng")).toBe("csa/commUserMng");
  });
});

describe("createUsageSegmentId", () => {
  it("crypto.randomUUID 가 있으면 그대로 쓴다", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "11111111-2222-4333-8444-555555555555" });
    expect(createUsageSegmentId()).toBe("11111111-2222-4333-8444-555555555555");
  });

  it("http(보안 컨텍스트 아님)라 randomUUID 가 없으면 getRandomValues 로 36자 v4 UUID 를 만든다", () => {
    vi.stubGlobal("crypto", { getRandomValues: (bytes: Uint8Array) => bytes.fill(0xab) });
    const id = createUsageSegmentId();
    expect(id).toBe("abababab-abab-4bab-abab-abababababab");
    expect(id).toHaveLength(36);
  });
});
