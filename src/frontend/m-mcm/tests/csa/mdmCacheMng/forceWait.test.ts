import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runForceWait } from "../../../page-components/csa/mdmCacheMng/forceWait";
import {
  FORCE_WAIT_INTERVAL_MS,
  FORCE_WAIT_LIMIT_MS,
  FORCE_WAIT_KEYS_NOTICE,
  FORCE_WAIT_TIMEOUT_NOTICE,
  decideForceWait,
  entryKeySet,
} from "../../../page-components/csa/mdmCacheMng/utils";
import type { CacheEntryRow } from "../../../page-components/csa/mdmCacheMng/types";

const keys = (...k: string[]) => new Set(k);

describe("decideForceWait — 기다리기 판단", () => {
  const base = { toSeq: 10, forcedKeys: ["RULE:R1"], elapsedMs: 0, limitMs: 25_000 };

  it("삭제 — 반영 전이면 계속 기다리고, 반영되면 다시 조회한다", () => {
    expect(decideForceWait({ ...base, kind: "EVICT", appliedSeq: 9, tableKeys: null })).toBe("WAIT");
    expect(decideForceWait({ ...base, kind: "EVICT", appliedSeq: null, tableKeys: null })).toBe("WAIT");
    expect(decideForceWait({ ...base, kind: "EVICT", appliedSeq: 10, tableKeys: null })).toBe("REFETCH");
    expect(decideForceWait({ ...base, kind: "EVICT", appliedSeq: 11, tableKeys: null })).toBe("REFETCH");
  });

  it("재등록 — 반영 전이면 기다린다(표에 옛 행이 남아 있어도 끝내지 않는다)", () => {
    expect(decideForceWait({ ...base, kind: "RELOAD", appliedSeq: 9, tableKeys: keys("RULE:R1") })).toBe("WAIT");
  });

  it("재등록 — 반영됐지만 아직 다시 조회하지 않았거나 키가 없으면 다시 조회한다", () => {
    expect(decideForceWait({ ...base, kind: "RELOAD", appliedSeq: 10, tableKeys: null })).toBe("REFETCH");
    expect(decideForceWait({ ...base, kind: "RELOAD", appliedSeq: 10, tableKeys: keys("RULE:OTHER") })).toBe("REFETCH");
    expect(decideForceWait({ ...base, kind: "RELOAD", appliedSeq: 10, tableKeys: keys("RULE:R1"), forcedKeys: ["RULE:R1", "CODE:C1"] })).toBe(
      "REFETCH",
    );
  });

  it("재등록 — 반영됐고 강제한 키가 모두 표에 있으면 끝난다", () => {
    expect(decideForceWait({ ...base, kind: "RELOAD", appliedSeq: 10, tableKeys: keys("RULE:R1", "X:Y") })).toBe("DONE");
    expect(
      decideForceWait({ ...base, kind: "RELOAD", appliedSeq: 12, tableKeys: keys("RULE:R1", "CODE:C1"), forcedKeys: ["RULE:R1", "CODE:C1"] }),
    ).toBe("DONE");
  });

  it("한도 — 반영 전이면 한도에서 멈추고 안내한다(한도 직전까지는 기다린다)", () => {
    expect(decideForceWait({ ...base, kind: "EVICT", appliedSeq: 9, tableKeys: null, elapsedMs: 24_999 })).toBe("WAIT");
    expect(decideForceWait({ ...base, kind: "EVICT", appliedSeq: 9, tableKeys: null, elapsedMs: 25_000 })).toBe("TIMEOUT");
    expect(decideForceWait({ ...base, kind: "RELOAD", appliedSeq: null, tableKeys: null, elapsedMs: 40_000 })).toBe("TIMEOUT");
  });

  it("한도 — 재등록 키가 끝내 없으면 한도에서 안내한다. 삭제는 반영됐으면 한도가 지나도 한 번 다시 조회한다", () => {
    expect(decideForceWait({ ...base, kind: "RELOAD", appliedSeq: 10, tableKeys: keys("RULE:OTHER"), elapsedMs: 24_999 })).toBe("REFETCH");
    expect(decideForceWait({ ...base, kind: "RELOAD", appliedSeq: 10, tableKeys: keys("RULE:OTHER"), elapsedMs: 25_000 })).toBe("TIMEOUT_KEYS");
    // 다시 조회가 실패해 빈 집합이 넘어와도 한도에서 끝난다(끝없이 다시 조회하지 않는다)
    expect(decideForceWait({ ...base, kind: "RELOAD", appliedSeq: 10, tableKeys: keys(), elapsedMs: 25_000 })).toBe("TIMEOUT_KEYS");
    expect(decideForceWait({ ...base, kind: "EVICT", appliedSeq: 10, tableKeys: null, elapsedMs: 30_000 })).toBe("REFETCH");
    expect(decideForceWait({ ...base, kind: "RELOAD", appliedSeq: 10, tableKeys: null, elapsedMs: 30_000 })).toBe("REFETCH");
    // 한 번 다시 조회한 뒤(tableKeys 가 집합)에는 한도가 지나면 더 조회하지 않는다
    expect(decideForceWait({ ...base, kind: "EVICT", appliedSeq: 10, tableKeys: keys(), elapsedMs: 30_000 })).toBe("DONE");
  });

  it("한도 25초·간격 2~3초·안내 문구", () => {
    expect(FORCE_WAIT_LIMIT_MS).toBe(25_000);
    expect(FORCE_WAIT_INTERVAL_MS).toBeGreaterThanOrEqual(2000);
    expect(FORCE_WAIT_INTERVAL_MS).toBeLessThanOrEqual(3000);
    expect(FORCE_WAIT_TIMEOUT_NOTICE).toContain("[조회]");
    expect(FORCE_WAIT_KEYS_NOTICE).toContain("[조회]");
  });

  it("entryKeySet — 버전 대상의 본문 행도 정의 키로 접어 '종류:키' 집합을 만든다", () => {
    const row = (type: CacheEntryRow["type"], key: string) => ({ type, key }) as CacheEntryRow;
    expect(entryKeySet([row("RULE", "R1@1.000"), row("RULE", "R1"), row("COLUMN", "C@1.000"), row("CODE", "K")])).toEqual(
      new Set(["RULE:R1", "COLUMN:C@1.000", "CODE:K"]),
    );
  });
});

describe("runForceWait — 기다리기 루프(가짜 타이머)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const tick = (ms = FORCE_WAIT_INTERVAL_MS) => vi.advanceTimersByTimeAsync(ms);

  type Row = Pick<CacheEntryRow, "type" | "key">;
  const rowsOf = (...k: string[]): Row[] =>
    k.map((x) => {
      const [type, key] = x.split(":");
      return { type, key } as Row;
    });

  function setup(opts: { kind: "EVICT" | "RELOAD"; applied: Array<number | null>; tables?: Array<Row[] | null>; forcedKeys?: string[] }) {
    let cancelled = false;
    let ai = 0;
    let ti = 0;
    const readAppliedSeq = vi.fn(async () => {
      const v = opts.applied[Math.min(ai++, opts.applied.length - 1)];
      if (v === null) throw new Error("down");
      return v;
    });
    const tables = opts.tables ?? [[]];
    const fetchEntries = vi.fn(async () => {
      const t = tables[Math.min(ti++, tables.length - 1)];
      if (t === null) throw new Error("entries 500");
      return t;
    });
    const applyEntries = vi.fn();
    const onRefetchError = vi.fn();
    const result = runForceWait<Row>({
      kind: opts.kind,
      toSeq: 10,
      forcedKeys: opts.forcedKeys ?? ["RULE:R1"],
      readAppliedSeq,
      fetchEntries,
      applyEntries,
      onRefetchError,
      isCancelled: () => cancelled,
    });
    let settled: string | null = null;
    void result.then((r) => (settled = r));
    return { readAppliedSeq, refetchEntries: fetchEntries, applyEntries, onRefetchError, cancel: () => (cancelled = true), settled: () => settled, result };
  }

  it("삭제 — 반영 전 tick 에는 표를 다시 조회하지 않고, 반영된 뒤 한 번 다시 조회하고 끝난다", async () => {
    const s = setup({ kind: "EVICT", applied: [8, 9, 10] });
    await tick(0);
    expect(s.readAppliedSeq).toHaveBeenCalledTimes(1);
    expect(s.refetchEntries).not.toHaveBeenCalled();
    await tick();
    expect(s.readAppliedSeq).toHaveBeenCalledTimes(2);
    expect(s.refetchEntries).not.toHaveBeenCalled();
    await tick();
    expect(s.readAppliedSeq).toHaveBeenCalledTimes(3);
    expect(s.refetchEntries).toHaveBeenCalledTimes(1);
    expect(s.settled()).toBe("DONE");
    await tick(60_000);
    expect(s.readAppliedSeq).toHaveBeenCalledTimes(3);
    expect(s.refetchEntries).toHaveBeenCalledTimes(1);
  });

  it("재등록 — 반영됐어도 키가 아직 없으면 다음 주기에 표를 다시 조회하고, 키가 보이면 끝난다", async () => {
    const s = setup({ kind: "RELOAD", applied: [10], tables: [[], [], rowsOf("RULE:R1")] });
    await tick(0);
    expect(s.refetchEntries).toHaveBeenCalledTimes(1);
    expect(s.settled()).toBeNull();
    await tick();
    expect(s.refetchEntries).toHaveBeenCalledTimes(2);
    expect(s.settled()).toBeNull();
    await tick();
    expect(s.refetchEntries).toHaveBeenCalledTimes(3);
    expect(s.settled()).toBe("DONE");
  });

  it("재등록 — 반영 전에는 표를 다시 조회하지 않는다(옛 행이 남아 있는 표로 끝내지 않는다)", async () => {
    const s = setup({ kind: "RELOAD", applied: [9, 9, 10], tables: [rowsOf("RULE:R1")] });
    await tick(0);
    await tick();
    expect(s.refetchEntries).not.toHaveBeenCalled();
    await tick();
    expect(s.refetchEntries).toHaveBeenCalledTimes(1);
    expect(s.settled()).toBe("DONE");
  });

  it("한도 — 25초 뒤에는 status 읽기를 멈추고 한도 초과로 끝낸다", async () => {
    const s = setup({ kind: "EVICT", applied: [9] });
    await tick(FORCE_WAIT_LIMIT_MS + FORCE_WAIT_INTERVAL_MS);
    expect(s.settled()).toBe("TIMEOUT");
    const reads = s.readAppliedSeq.mock.calls.length;
    expect(reads).toBeGreaterThan(1);
    expect(reads).toBeLessThanOrEqual(Math.ceil(FORCE_WAIT_LIMIT_MS / FORCE_WAIT_INTERVAL_MS) + 1);
    await tick(120_000);
    expect(s.readAppliedSeq).toHaveBeenCalledTimes(reads);
    expect(s.refetchEntries).not.toHaveBeenCalled();
  });

  it("status 읽기가 실패해도 한도 안에서는 계속 기다린다", async () => {
    const s = setup({ kind: "EVICT", applied: [null, null, 10] });
    await tick(0);
    await tick();
    expect(s.settled()).toBeNull();
    await tick();
    expect(s.refetchEntries).toHaveBeenCalledTimes(1);
    expect(s.settled()).toBe("DONE");
  });

  it("취소 — 취소한 뒤에는 status 읽기도 표 다시 조회도 하지 않는다", async () => {
    const s = setup({ kind: "EVICT", applied: [8, 8, 10] });
    await tick(0);
    expect(s.readAppliedSeq).toHaveBeenCalledTimes(1);
    s.cancel();
    await tick(60_000);
    expect(s.readAppliedSeq).toHaveBeenCalledTimes(1);
    expect(s.refetchEntries).not.toHaveBeenCalled();
    expect(s.settled()).toBe("CANCELLED");
  });

  it("취소 — status 응답을 기다리는 중 취소하면 반영돼 있어도 표를 다시 조회하지 않는다", async () => {
    let cancelled = false;
    let release: (n: number) => void = () => {};
    const readAppliedSeq = vi.fn(() => new Promise<number>((r) => (release = r)));
    const refetchEntries = vi.fn(async () => [] as CacheEntryRow[]);
    const result = runForceWait({ kind: "EVICT", toSeq: 10, forcedKeys: [], readAppliedSeq, fetchEntries: refetchEntries, applyEntries: vi.fn(), isCancelled: () => cancelled });
    await tick(0);
    cancelled = true;
    release(10);
    await expect(result).resolves.toBe("CANCELLED");
    expect(refetchEntries).not.toHaveBeenCalled();
  });

  it("재등록 — 반영 뒤 표 다시 조회가 늘 실패해도 한도에서 끝나고 다시 조회 횟수가 유한하다(오류 알림은 한 번)", async () => {
    const s = setup({ kind: "RELOAD", applied: [10], tables: [null] });
    await tick(FORCE_WAIT_LIMIT_MS + 2 * FORCE_WAIT_INTERVAL_MS);
    expect(s.settled()).toBe("TIMEOUT_KEYS");
    const fetches = s.refetchEntries.mock.calls.length;
    expect(fetches).toBeLessThanOrEqual(Math.ceil(FORCE_WAIT_LIMIT_MS / FORCE_WAIT_INTERVAL_MS) + 1);
    expect(s.onRefetchError).toHaveBeenCalledTimes(1);
    expect(s.applyEntries).not.toHaveBeenCalled();
    await tick(120_000);
    expect(s.refetchEntries).toHaveBeenCalledTimes(fetches);
  });

  it("한도 뒤에야 반영을 확인해도 다시 조회는 딱 한 번이다", async () => {
    // 한도 안에는 늘 읽기 실패, 한도 뒤 첫 읽기에서 반영 확인
    const applied: Array<number | null> = Array(Math.ceil(FORCE_WAIT_LIMIT_MS / FORCE_WAIT_INTERVAL_MS)).fill(null);
    applied.push(10);
    const s = setup({ kind: "RELOAD", applied, tables: [rowsOf("RULE:OTHER")] });
    await tick(FORCE_WAIT_LIMIT_MS + 4 * FORCE_WAIT_INTERVAL_MS);
    expect(s.refetchEntries).toHaveBeenCalledTimes(1);
    expect(s.settled()).toBe("TIMEOUT_KEYS");
  });

  it("재등록 — 반영은 확인됐는데 키가 끝내 표에 없으면 키 미확인으로 끝난다", async () => {
    const s = setup({ kind: "RELOAD", applied: [10], tables: [rowsOf("RULE:OTHER")] });
    await tick(FORCE_WAIT_LIMIT_MS + FORCE_WAIT_INTERVAL_MS);
    expect(s.settled()).toBe("TIMEOUT_KEYS");
  });

  it("반영을 한 번 확인한 뒤 status 읽기가 실패해도 반영 전으로 되돌리지 않는다", async () => {
    const s = setup({ kind: "RELOAD", applied: [10, null], tables: [[], rowsOf("RULE:R1")] });
    await tick(0);
    await tick();
    expect(s.refetchEntries).toHaveBeenCalledTimes(2);
    expect(s.settled()).toBe("DONE");
  });

  it("다시 조회 결과는 반영 콜백으로 넘기고, 반영은 받은 행으로 한다", async () => {
    const s = setup({ kind: "EVICT", applied: [10], tables: [rowsOf("RULE:R2")] });
    await tick(0);
    expect(s.applyEntries).toHaveBeenCalledTimes(1);
    expect(s.applyEntries).toHaveBeenCalledWith(rowsOf("RULE:R2"));
    expect(s.settled()).toBe("DONE");
  });

  it("취소 — 표 응답을 기다리는 중 취소하면 응답이 와도 반영 콜백을 부르지 않는다(늦은 응답이 표를 덮지 않는다)", async () => {
    let cancelled = false;
    let release: (rows: Row[]) => void = () => {};
    const fetchEntries = vi.fn(() => new Promise<Row[]>((r) => (release = r)));
    const applyEntries = vi.fn();
    const result = runForceWait<Row>({
      kind: "EVICT",
      toSeq: 10,
      forcedKeys: [],
      readAppliedSeq: async () => 10,
      fetchEntries,
      applyEntries,
      isCancelled: () => cancelled,
    });
    await tick(0);
    expect(fetchEntries).toHaveBeenCalledTimes(1);
    cancelled = true;
    release(rowsOf("RULE:OLD"));
    await expect(result).resolves.toBe("CANCELLED");
    expect(applyEntries).not.toHaveBeenCalled();
  });

  it("취소 — 표 요청이 실패로 끝나도 취소됐으면 오류를 알리지 않는다", async () => {
    let cancelled = false;
    let fail: (e: Error) => void = () => {};
    const onRefetchError = vi.fn();
    const result = runForceWait<Row>({
      kind: "EVICT",
      toSeq: 10,
      forcedKeys: [],
      readAppliedSeq: async () => 10,
      fetchEntries: () => new Promise<Row[]>((_, rej) => (fail = rej)),
      applyEntries: vi.fn(),
      onRefetchError,
      isCancelled: () => cancelled,
    });
    await tick(0);
    cancelled = true;
    fail(new Error("late"));
    await expect(result).resolves.toBe("CANCELLED");
    expect(onRefetchError).not.toHaveBeenCalled();
  });
});
