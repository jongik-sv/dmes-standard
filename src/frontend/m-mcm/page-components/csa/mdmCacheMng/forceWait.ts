/**
 * mdmCacheMng — 강제 기록(삭제·재등록) 뒤 선택한 모듈이 반영하기를 기다렸다가 표를 다시 조회하는 루프.
 * 화면 의존이 없는 순수 비동기 함수라 읽기·다시 조회·취소 확인을 받아 가짜 타이머로 시험한다. 판단은 utils 의 decideForceWait.
 */
import type { CacheEntryRow, ForceKind } from "./types";
import { FORCE_WAIT_INTERVAL_MS, FORCE_WAIT_LIMIT_MS, decideForceWait, entryKeySet } from "./utils";

export interface ForceWaitParams<TRow extends Pick<CacheEntryRow, "type" | "key"> = CacheEntryRow> {
  kind: ForceKind;
  toSeq: number;
  /** 강제 기록한 '종류:정의 키' 목록. */
  forcedKeys: readonly string[];
  /** 선택한 모듈의 appliedSeq 를 읽는다. 던지면 읽지 못한 것으로 보고 한도 안에서 계속 기다린다. */
  readAppliedSeq: () => Promise<number>;
  /**
   * 표를 다시 조회해 받은 행을 돌려준다. 화면 상태는 건드리지 않는다(응답이 늦게 와도 표를 덮지 않게, 반영은 applyEntries 가 한다). 실패하면 던진다.
   */
  fetchEntries: () => Promise<TRow[]>;
  /** 받은 행을 표에 반영한다. 응답을 받은 뒤 취소되지 않았을 때만 부른다. */
  applyEntries: (rows: TRow[]) => void;
  /** 다시 조회가 실패했을 때 — 한 번 기다리는 동안 처음 실패에만 부른다(오류창이 쌓이지 않게). */
  onRefetchError?: (e: unknown) => void;
  /** 실행 번호가 바뀌었는지 — 취소됐으면 더 읽지도 다시 조회하지도 표를 바꾸지도 않는다. */
  isCancelled: () => boolean;
  limitMs?: number;
  intervalMs?: number;
}

/** TIMEOUT = 한도까지 반영 전, TIMEOUT_KEYS = 반영됐지만 강제한 키가 끝내 표에 안 보임. */
export type ForceWaitResult = "DONE" | "TIMEOUT" | "TIMEOUT_KEYS" | "CANCELLED";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function runForceWait<TRow extends Pick<CacheEntryRow, "type" | "key"> = CacheEntryRow>(p: ForceWaitParams<TRow>): Promise<ForceWaitResult> {
  const limitMs = p.limitMs ?? FORCE_WAIT_LIMIT_MS;
  const intervalMs = p.intervalMs ?? FORCE_WAIT_INTERVAL_MS;
  const startedAt = Date.now();
  let tableKeys: ReadonlySet<string> | null = null;
  let appliedSeen = false;
  let errorReported = false;
  const decide = (appliedSeq: number | null) =>
    decideForceWait({
      kind: p.kind,
      toSeq: p.toSeq,
      // 한 번 반영을 확인했으면 이후 status 읽기가 실패해도 반영 전으로 되돌리지 않는다(적용 순번은 줄지 않는다).
      appliedSeq: appliedSeen ? p.toSeq : appliedSeq,
      tableKeys,
      forcedKeys: p.forcedKeys,
      elapsedMs: Date.now() - startedAt,
      limitMs,
    });

  for (;;) {
    if (p.isCancelled()) return "CANCELLED";
    let appliedSeq: number | null = null;
    try {
      appliedSeq = await p.readAppliedSeq();
    } catch {
      appliedSeq = null;
    }
    if (p.isCancelled()) return "CANCELLED";
    if (appliedSeq !== null && appliedSeq >= p.toSeq) appliedSeen = true;

    let decision = decide(appliedSeq);
    if (decision === "REFETCH") {
      let rows: TRow[] | null = null;
      try {
        rows = await p.fetchEntries();
      } catch (e) {
        if (p.isCancelled()) return "CANCELLED";
        if (!errorReported) {
          errorReported = true;
          p.onRefetchError?.(e);
        }
      }
      if (p.isCancelled()) return "CANCELLED"; // 응답이 늦게 왔으면 표에 반영하지 않는다
      if (rows) p.applyEntries(rows);
      // 실패도 '시도했음'으로 남긴다(빈 집합) — 그래야 한도 판정이 걸려 다시 조회가 끝없이 이어지지 않는다.
      tableKeys = rows ? entryKeySet(rows) : new Set<string>();
      // 삭제는 반영 뒤 한 번 다시 조회하면 끝이다. 재등록은 다시 조회한 표에 키가 보여야 끝이라 바로 다시 판단한다.
      decision = decide(appliedSeq);
    }
    if (decision === "DONE" || decision === "TIMEOUT" || decision === "TIMEOUT_KEYS") return decision;
    await sleep(intervalMs);
  }
}
