import { describe, expect, it } from "vitest";

import { RUN_WATCH_DELAYS_MS, watchRunUntilDone } from "./run-watch";

function harness(states: Array<boolean | Error>, active: () => boolean = () => true) {
  const slept: number[] = [];
  let i = 0;
  return {
    slept,
    run: (delays?: readonly number[]) =>
      watchRunUntilDone({
        delaysMs: delays,
        sleep: async (ms) => {
          slept.push(ms);
        },
        poll: async () => {
          const s = states[Math.min(i++, states.length - 1)];
          if (s instanceof Error) throw s;
          return s;
        },
        isActive: active,
      }),
  };
}

describe("watchRunUntilDone", () => {
  it("끝났다고 확인하면 거기서 멈춘다", async () => {
    const h = harness([true, true, false]);
    expect(await h.run()).toBe(3);
    expect(h.slept).toEqual(RUN_WATCH_DELAYS_MS.slice(0, 3));
  });

  it("첫 조회에서 끝났으면 한 번만 조회한다", async () => {
    const h = harness([false]);
    expect(await h.run()).toBe(1);
    expect(h.slept).toEqual([RUN_WATCH_DELAYS_MS[0]]);
  });

  it("계속 실행 중이어도 상한 횟수에서 멈춘다", async () => {
    const h = harness([true]);
    expect(await h.run()).toBe(RUN_WATCH_DELAYS_MS.length);
    expect(h.slept.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(35000);
  });

  it("조회가 실패하면 조용히 멈춘다", async () => {
    const h = harness([true, new Error("boom"), true]);
    expect(await h.run()).toBe(2);
  });

  it("화면이 닫히면(isActive=false) 더 조회하지 않는다", async () => {
    let calls = 0;
    const h = harness([true], () => calls++ < 3); // 대기 전 확인·대기 후 확인이 각각 한 번씩 소비된다
    const polls = await h.run();
    expect(polls).toBeLessThan(RUN_WATCH_DELAYS_MS.length);
  });

  it("시작부터 비활성이면 대기도 조회도 하지 않는다", async () => {
    const h = harness([true], () => false);
    expect(await h.run()).toBe(0);
    expect(h.slept).toEqual([]);
  });
});
