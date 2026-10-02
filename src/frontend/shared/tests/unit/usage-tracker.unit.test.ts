/**
 * 화면 사용 구간 추적기(UsageTracker) — 설계 §3.1 구간 정의(2026-10-02, 탭 단위 누적).
 * 활성화된 탭마다 열린 구간 하나를 두고, 다른 탭·가림 동안은 일시정지했다가 같은 구간에 이어 누적한다.
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

/** 한 번 넘긴 묶음을 [pageId, startKind, 시작, 끝(BASE 기준 ms), 이용 시간] 으로 줄인다. */
function rows(batch: UsageSegment[]) {
  return batch.map((s) => [s.pageId, s.startKind, s.startedAt - BASE, s.endedAt - BASE, s.durationMs]);
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

describe("UsageTracker 탭 단위 누적", () => {
  it("다른 화면으로 가면 일시정지하고, 돌아오면 같은 구간에 이어 누적한다 — 전환마다 행이 생기지 않는다", () => {
    const t = create();
    t.activate("csa/a", "OPEN");
    advance(5000);
    t.activate("csa/b", "OPEN"); // a 일시정지
    advance(3000);
    t.activate("csa/a"); // a 재개 — 같은 구간
    expect(emitted).toEqual([]);
    advance(2000);
    t.release("csa/a"); // 탭 닫기 — a 를 내보낸다
    expect(emitted.map(rows)).toEqual([[["csa/a", "OPEN", 0, 10_000, 7000]]]);
    expect(emitted[0][0].clientSegId).toBe("seg-1");

    advance(1000);
    t.end(); // b 는 8초에 일시정지된 채 남아 있었다
    expect(emitted.map(rows)).toEqual([
      [["csa/a", "OPEN", 0, 10_000, 7000]],
      [["csa/b", "OPEN", 5000, 8000, 3000]],
    ]);
  });

  it("홈(null)에 있는 동안은 일시정지하고, 그동안 입력이 와도 기록하지 않는다", () => {
    const t = create();
    t.activate("csa/a", "OPEN");
    advance(4000);
    t.activate(null);
    input();
    advance(MIN);
    t.activate("csa/a");
    advance(2000);
    t.end();
    expect(emitted.map(rows)).toEqual([[["csa/a", "OPEN", 0, 66_000, 6000]]]);
  });

  it("이용 시간(durationMs)이 1초 미만이면 버린다", () => {
    const t = create();
    t.activate("csa/a", "OPEN");
    advance(999);
    t.activate("csa/b", "OPEN");
    advance(1000);
    t.activate(null);
    advance(10_000);
    t.end();
    expect(emitted.map(rows)).toEqual([[["csa/b", "OPEN", 999, 1999, 1000]]]);
  });

  it("같은 화면을 다시 활성화해도 구간을 쪼개지 않는다", () => {
    const t = create();
    t.activate("csa/a", "OPEN");
    advance(3000);
    t.activate("csa/a");
    advance(2000);
    t.end();
    expect(emitted.map(rows)).toEqual([[["csa/a", "OPEN", 0, 5000, 5000]]]);
  });

  it("release 는 그 탭만 내보내고 잊는다. 다시 활성화하면 새 구간이다", () => {
    const t = create();
    t.activate("csa/a", "OPEN");
    advance(2000);
    t.activate("csa/b", "OPEN");
    advance(3000);
    t.release("csa/a"); // 보이지 않는(일시정지) a 를 닫는다
    t.release("csa/x"); // 모르는 탭 — 아무 일 없음
    expect(emitted.map(rows)).toEqual([[["csa/a", "OPEN", 0, 2000, 2000]]]);
    advance(1000);
    t.activate("csa/a", "OPEN"); // 다시 연 a
    advance(2000);
    t.end();
    expect(emitted.map(rows)).toEqual([
      [["csa/a", "OPEN", 0, 2000, 2000]],
      [
        ["csa/b", "OPEN", 2000, 6000, 4000],
        ["csa/a", "OPEN", 6000, 8000, 2000],
      ],
    ]);
  });

  it("같은 pageId 라도 탭 키가 다르면 구간을 따로 둔다", () => {
    const t = create();
    t.activate({ key: "tab-1", pageId: "csa/a" }, "OPEN");
    advance(2000);
    t.activate({ key: "tab-2", pageId: "csa/a" }, "OPEN");
    advance(3000);
    t.release("tab-1");
    expect(emitted.map(rows)).toEqual([[["csa/a", "OPEN", 0, 2000, 2000]]]);
    t.release("tab-2");
    expect(emitted.map(rows)).toEqual([
      [["csa/a", "OPEN", 0, 2000, 2000]],
      [["csa/a", "OPEN", 2000, 5000, 3000]],
    ]);
  });

  it("end() 뒤에는 입력이나 주기 판정이 와도 구간을 다시 열지 않는다(로그아웃)", () => {
    const t = create();
    t.activate("csa/a", "OPEN");
    advance(3000);
    t.end();
    input();
    advance(20 * MIN);
    t.end();
    expect(emitted.map(rows)).toEqual([[["csa/a", "OPEN", 0, 3000, 3000]]]);
  });

  it("dispose() 는 열린 구간을 보낸 뒤 리스너와 타이머를 뗀다", () => {
    const t = create();
    t.activate("csa/a", "OPEN");
    advance(2000);
    t.dispose();
    expect(emitted.map(rows)).toEqual([[["csa/a", "OPEN", 0, 2000, 2000]]]);

    setVisibility("hidden");
    setVisibility("visible");
    input();
    win.dispatchEvent(new Event("pagehide"));
    t.activate("csa/b", "OPEN");
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
    t.release("csa/a");
    t.activate("csa/b", "OPEN");
    advance(2000);
    t.release("csa/b");
    expect(calls).toBe(2);
    expect(warn).toHaveBeenCalled();
  });
});

describe("UsageTracker 브라우저 탭 가림·pagehide", () => {
  it("가리면 일시정지하고, 다시 보이면 같은 구간에 이어 누적한다", () => {
    const t = create();
    t.activate("csa/a", "OPEN");
    advance(3000);
    setVisibility("hidden");
    advance(10_000);
    setVisibility("visible");
    advance(2000);
    t.release("csa/a");
    expect(emitted.map(rows)).toEqual([[["csa/a", "OPEN", 0, 15_000, 5000]]]);
  });

  it("가려진 동안 입력이 와도 누적하지 않는다", () => {
    const t = create();
    t.activate("csa/a", "OPEN");
    advance(2000);
    setVisibility("hidden");
    input();
    advance(5000);
    t.end();
    expect(emitted.map(rows)).toEqual([[["csa/a", "OPEN", 0, 2000, 2000]]]);
  });

  it("가려진 채 OPEN 으로 시작하면 보이게 될 때 OPEN 으로 연다", () => {
    doc.visibilityState = "hidden";
    const t = create();
    t.activate("csa/a", "OPEN");
    t.activate("csa/a"); // StrictMode 이중 호출 등 — 보류 중인 OPEN 을 잃지 않는다
    advance(5000);
    setVisibility("visible");
    advance(2000);
    t.end();
    expect(emitted.map(rows)).toEqual([[["csa/a", "OPEN", 5000, 7000, 2000]]]);
  });

  it("pagehide 는 일시정지 중인 구간까지 모두 내보내고, 돌아와 입력하면 RESUME 으로 연다", () => {
    const t = create();
    t.activate("csa/a", "OPEN");
    advance(2000);
    t.activate("csa/b", "OPEN");
    advance(3000);
    win.dispatchEvent(new Event("pagehide"));
    expect(emitted.map(rows)).toEqual([
      [
        ["csa/a", "OPEN", 0, 2000, 2000],
        ["csa/b", "OPEN", 2000, 5000, 3000],
      ],
    ]);
    advance(1000);
    input("keydown"); // 보던 b — RESUME
    advance(3000);
    t.activate("csa/a"); // a 는 구간이 없다 — RESUME
    advance(1000);
    t.end();
    expect(emitted.slice(1).map(rows)).toEqual([
      [
        ["csa/b", "RESUME", 6000, 9000, 3000],
        ["csa/a", "RESUME", 9000, 10_000, 1000],
      ],
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
    expect(emitted.map(rows)).toEqual([[["csa/a", "OPEN", 0, 5 * MIN, 5 * MIN]]]);

    advance(5 * MIN); // 40분
    input("wheel");
    advance(2 * MIN);
    t.release("csa/a");
    expect(emitted.map(rows)).toEqual([
      [["csa/a", "OPEN", 0, 5 * MIN, 5 * MIN]],
      [["csa/a", "RESUME", 40 * MIN, 42 * MIN, 2 * MIN]],
    ]);
  });

  it("무입력으로 닫힌 뒤 같은 화면을 다시 activate 하면 RESUME 이다", () => {
    const t = create({ maxSegmentMs: 3 * 60 * MIN });
    t.activate("csa/a", "OPEN");
    advance(5 * MIN);
    input();
    advance(31 * MIN); // 35분 판정 — 마지막 입력(5분)에서 닫힘
    t.activate(null);
    t.activate("csa/a");
    advance(2000);
    t.end();
    expect(emitted.map(rows)).toEqual([
      [["csa/a", "OPEN", 0, 5 * MIN, 5 * MIN]],
      [["csa/a", "RESUME", 36 * MIN, 36 * MIN + 2000, 2000]],
    ]);
  });

  it("입력 없이 20분 → 15분 판정은 마지막 입력 시각에서 자르고, 30분 무입력 뒤 추가 구간이 없다", () => {
    create().activate("csa/a", "OPEN");
    advance(5 * MIN);
    input();
    advance(15 * MIN); // 20분 — 15분 판정 때 마지막 입력(5분)에서 자른다
    expect(emitted.map(rows)).toEqual([[["csa/a", "OPEN", 0, 5 * MIN, 5 * MIN]]]);
    advance(20 * MIN); // 40분 — 마지막 입력 뒤 30분(35분 판정)이면 길이 0 이라 버린다
    expect(emitted).toHaveLength(1);
  });
});

describe("UsageTracker 무입력 — 판정 타이머가 멈춘 사이 다른 동작이 먼저 올 때(설계 §3.1)", () => {
  /** 0분 OPEN, 5분 입력 뒤 타이머 없이 시계만 40분으로 보낸다. advance 를 쓰면 60초 판정이 먼저 닫아 버린다. */
  function idleUntil40(): UsageTracker {
    const t = create();
    t.activate("csa/a", "OPEN");
    vi.setSystemTime(BASE + 5 * MIN);
    input();
    vi.setSystemTime(BASE + 40 * MIN);
    return t;
  }

  it("(a) 40분에 탭을 바꾸면 마지막 입력(5분)까지만 내고 새 탭 구간은 40분에 시작한다", () => {
    const t = idleUntil40();
    t.activate("csa/b", "OPEN");
    expect(emitted.map(rows)).toEqual([[["csa/a", "OPEN", 0, 5 * MIN, 5 * MIN]]]);
    vi.setSystemTime(BASE + 41 * MIN);
    t.end();
    expect(emitted.map(rows)).toEqual([
      [["csa/a", "OPEN", 0, 5 * MIN, 5 * MIN]],
      [["csa/b", "OPEN", 40 * MIN, 41 * MIN, MIN]],
    ]);
  });

  it("(b) 40분에 클릭하면 0–5분을 내고 40분부터 RESUME 으로 다시 연다", () => {
    const t = idleUntil40();
    input();
    expect(emitted.map(rows)).toEqual([[["csa/a", "OPEN", 0, 5 * MIN, 5 * MIN]]]);
    vi.setSystemTime(BASE + 42 * MIN);
    t.end();
    expect(emitted.map(rows)).toEqual([
      [["csa/a", "OPEN", 0, 5 * MIN, 5 * MIN]],
      [["csa/a", "RESUME", 40 * MIN, 42 * MIN, 2 * MIN]],
    ]);
  });

  it("(c-1) 40분에 가려지면 0–5분만 낸다", () => {
    const t = idleUntil40();
    setVisibility("hidden");
    expect(emitted.map(rows)).toEqual([[["csa/a", "OPEN", 0, 5 * MIN, 5 * MIN]]]);
    t.end();
    expect(emitted).toHaveLength(1);
  });

  it("(c-2) 40분에 pagehide 가 오면 0–5분만 낸다", () => {
    const t = idleUntil40();
    win.dispatchEvent(new Event("pagehide"));
    expect(emitted.map(rows)).toEqual([[["csa/a", "OPEN", 0, 5 * MIN, 5 * MIN]]]);
    t.end();
    expect(emitted).toHaveLength(1);
  });

  it("(d) 공백이 30분 미만(28분)이고 판정이 없었으면 닫을 때 한 행으로 낸다(15분 조각으로 나누지 않음)", () => {
    const t = create();
    t.activate("csa/a", "OPEN");
    vi.setSystemTime(BASE + 28 * MIN);
    t.release("csa/a");
    expect(emitted.map(rows)).toEqual([[["csa/a", "OPEN", 0, 28 * MIN, 28 * MIN]]]);
  });

  it("(e) 30분 이상 무입력 뒤 end() 는 마지막 입력 시각까지만 낸다", () => {
    const t = create();
    t.activate("csa/a", "OPEN");
    vi.setSystemTime(BASE + 20 * MIN);
    input(); // 20분 — 판정 타이머 없이 마지막 입력
    vi.setSystemTime(BASE + 55 * MIN);
    t.end();
    expect(emitted.map(rows)).toEqual([[["csa/a", "OPEN", 0, 20 * MIN, 20 * MIN]]]);
  });

  it("(f) 무입력 30분이 지나면 판정보다 입력이 먼저 와도 공백을 이용 시간으로 내지 않는다", () => {
    const t = create();
    t.activate("csa/a", "OPEN"); // 마지막 입력 = 0분
    vi.setSystemTime(BASE + 40 * MIN); // 시계만 가고 타이머는 돌지 않았다
    input(); // 0분에서 닫으면 이용 시간 0 이라 버리고, 40분에 RESUME 으로 다시 연다
    t.activate("csa/b", "OPEN");
    expect(emitted).toEqual([]);
    vi.setSystemTime(BASE + 41 * MIN);
    t.end();
    expect(emitted.map(rows)).toEqual([[["csa/b", "OPEN", 40 * MIN, 41 * MIN, MIN]]]);
  });
});

describe("UsageTracker 15분 경과", () => {
  it("보고 있는 구간은 15분 판정 때 마지막 입력 시각에서 자르고 그 시각부터 RESUME 으로 이어 간다", () => {
    const t = create();
    t.activate("csa/a", "OPEN");
    advance(14 * MIN);
    input();
    advance(MIN); // 15분 판정 — 마지막 입력(14분)에서 자른다
    expect(emitted.map(rows)).toEqual([[["csa/a", "OPEN", 0, 14 * MIN, 14 * MIN]]]);

    advance(14 * MIN); // 29분
    input();
    advance(MIN); // 30분 판정 — 14분부터 16분째, 마지막 입력(29분)에서 자른다
    advance(MIN); // 31분
    t.release("csa/a");
    expect(emitted.map(rows)).toEqual([
      [["csa/a", "OPEN", 0, 14 * MIN, 14 * MIN]],
      [["csa/a", "RESUME", 14 * MIN, 29 * MIN, 15 * MIN]],
      [["csa/a", "RESUME", 29 * MIN, 31 * MIN, 2 * MIN]],
    ]);
    expect(new Set(all().map((s) => s.clientSegId)).size).toBe(3);
  });

  it("일시정지 중인 구간도 시작 뒤 15분이 지나면 내보내고, 다시 보면 RESUME 이다", () => {
    const t = create();
    t.activate("csa/a", "OPEN");
    advance(2 * MIN);
    t.activate("csa/b", "OPEN"); // a 일시정지(2분 누적)
    advance(13 * MIN); // 15분 판정 — a 시작 뒤 15분
    expect(emitted.map(rows)).toEqual([[["csa/a", "OPEN", 0, 2 * MIN, 2 * MIN]]]);

    advance(MIN); // 16분
    t.activate("csa/a"); // a 는 구간이 없다 — RESUME, b 일시정지(14분 누적)
    advance(MIN); // 17분 판정 — b 시작 뒤 15분
    expect(emitted.slice(1).map(rows)).toEqual([[["csa/b", "OPEN", 2 * MIN, 16 * MIN, 14 * MIN]]]);
    t.end();
    expect(emitted.slice(2).map(rows)).toEqual([
      [["csa/a", "RESUME", 16 * MIN, 17 * MIN, MIN]],
    ]);
  });
});

describe("UsageTracker 15분 경과 — 판정 타이머가 멈춘 사이 다시 볼 때", () => {
  it("일시정지 뒤 15분이 지난 탭으로 돌아오면 옛 구간을 내보내고 RESUME 으로 새로 연다", () => {
    const t = create();
    t.activate("csa/a", "OPEN");
    vi.setSystemTime(BASE + 2 * MIN);
    t.activate("csa/b", "OPEN"); // a 일시정지(2분)
    vi.setSystemTime(BASE + 3 * MIN);
    t.activate(null); // b 일시정지(1분)
    vi.setSystemTime(BASE + 20 * MIN); // 타이머 없이 시계만 간다
    t.activate("csa/a");
    expect(emitted.map(rows)).toEqual([
      [
        ["csa/a", "OPEN", 0, 2 * MIN, 2 * MIN],
        ["csa/b", "OPEN", 2 * MIN, 3 * MIN, MIN],
      ],
    ]);
    vi.setSystemTime(BASE + 21 * MIN);
    t.end();
    expect(emitted.slice(1).map(rows)).toEqual([[["csa/a", "RESUME", 20 * MIN, 21 * MIN, MIN]]]);
  });

  it("가려진 채 15분이 지난 뒤(절전 등) 다시 보이면 옛 구간을 내보내고 RESUME 으로 새로 연다", () => {
    const t = create();
    t.activate("csa/a", "OPEN");
    vi.setSystemTime(BASE + 2 * MIN);
    setVisibility("hidden");
    vi.setSystemTime(BASE + 3 * 60 * MIN);
    setVisibility("visible");
    expect(emitted.map(rows)).toEqual([[["csa/a", "OPEN", 0, 2 * MIN, 2 * MIN]]]);
    vi.setSystemTime(BASE + 3 * 60 * MIN + 2000);
    t.end();
    expect(emitted.slice(1).map(rows)).toEqual([
      [["csa/a", "RESUME", 3 * 60 * MIN, 3 * 60 * MIN + 2000, 2000]],
    ]);
  });
});

describe("UsageTracker 1초 미만으로 버린 OPEN 조각", () => {
  it("(S2) OPEN 직후 0.8초 만에 다른 탭으로 가 16분 뒤 돌아오면, 이어지는 구간이 OPEN 을 물려받는다", () => {
    const t = create();
    t.activate("csa/a", "OPEN");
    advance(800);
    t.activate(null); // 활성화 안 된 다른 탭으로 감 — a 일시정지(0.8초)
    advance(16 * MIN - 800); // 15분 판정에서 a 의 0.8초 OPEN 조각은 버려진다
    expect(emitted).toEqual([]);
    t.activate("csa/a");
    advance(MIN);
    t.end();
    expect(emitted.map(rows)).toEqual([[["csa/a", "OPEN", 16 * MIN, 17 * MIN, MIN]]]);
  });

  it("(S1) OPEN 직후 0.5초에 입력하고 15분 넘게 읽으면, 15분 판정에서 잘려 이어지는 구간이 OPEN 을 물려받는다", () => {
    const t = create();
    t.activate("csa/a", "OPEN");
    advance(500);
    input(); // 0.5초
    advance(20 * MIN - 500); // 15분 판정 — 0.5초에서 잘려 0.5초 OPEN 조각은 버려진다
    input(); // 20분
    advance(MIN);
    t.end();
    expect(emitted.map(rows)).toEqual([
      [["csa/a", "OPEN", 500, 20 * MIN, 20 * MIN - 500]],
      [["csa/a", "RESUME", 20 * MIN, 21 * MIN, MIN]],
    ]);
  });

  it("가림으로 버려진 OPEN 도 다시 볼 때 물려받고, 한 번 물려준 뒤에는 RESUME 이다", () => {
    const t = create();
    t.activate("csa/a", "OPEN");
    advance(500);
    setVisibility("hidden");
    advance(16 * MIN); // 15분 판정 — 0.5초 OPEN 조각을 버린다
    setVisibility("visible");
    advance(MIN);
    win.dispatchEvent(new Event("pagehide"));
    advance(1000);
    input();
    advance(2000);
    t.end();
    expect(emitted.map(rows)).toEqual([
      [["csa/a", "OPEN", 16 * MIN + 500, 17 * MIN + 500, MIN]],
      [["csa/a", "RESUME", 17 * MIN + 1500, 17 * MIN + 3500, 2000]],
    ]);
  });

  it("release 는 OPEN 대기를 지운다(업무 호출 뒤 1초 안에 닫은 탭은 아무것도 남기지 않는다)", () => {
    const t = create();
    t.activate("csa/a", "OPEN");
    advance(500);
    t.release("csa/a");
    t.activate("csa/a"); // 같은 키를 다시 보더라도 OPEN 을 물려받지 않는다
    advance(2000);
    t.end();
    expect(emitted.map(rows)).toEqual([[["csa/a", "RESUME", 500, 2500, 2000]]]);
  });
});

describe("UsageTracker 빠른 전환", () => {
  it("짧은 간격으로 오가도 같은 clientSegId 가 두 번 나오지 않고, 이용 시간 합이 경과 시간을 넘지 않는다", () => {
    const t = create({ createId: createUsageSegmentId }); // 실제 ID 생성기
    const pages = ["csa/a", "csa/b", "csa/c", null, "csa/a", "csa/b", "csa/a"];
    const gaps = [1200, 300, 1500, 800, 2000, 50, 1000];
    pages.forEach((pageId, i) => {
      t.activate(pageId, "OPEN");
      advance(gaps[i]);
    });
    t.end();

    const segs = all();
    expect(new Set(segs.map((s) => s.clientSegId)).size).toBe(segs.length);
    for (const s of segs) {
      expect(s.durationMs).toBeGreaterThanOrEqual(1000);
      expect(s.durationMs).toBeLessThanOrEqual(s.endedAt - s.startedAt);
    }
    const elapsed = gaps.reduce((sum, g) => sum + g, 0);
    expect(segs.reduce((sum, s) => sum + s.durationMs, 0)).toBeLessThanOrEqual(elapsed);
    expect(segs.map((s) => [s.pageId, s.startKind, s.durationMs])).toEqual([
      ["csa/a", "OPEN", 1200 + 2000 + 1000],
      ["csa/c", "OPEN", 1500],
    ]);
  });

  it("시계가 뒤로 가도 이용 시간이 음수가 되거나 구간이 시작보다 일찍 끝나지 않는다", () => {
    let now = BASE + 10_000;
    const t = create({ now: () => now });
    t.activate("csa/a", "OPEN");
    now = BASE + 12_000;
    t.activate("csa/b", "OPEN"); // a 10→12
    now = BASE + 5_000; // 시계 역행
    t.activate("csa/c", "OPEN"); // b 는 12 에서 일시정지(0초), c 는 12 부터
    now = BASE + 14_000;
    t.end();
    expect(emitted.map(rows)).toEqual([
      [
        ["csa/a", "OPEN", 10_000, 12_000, 2000],
        ["csa/c", "OPEN", 12_000, 14_000, 2000],
      ],
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
