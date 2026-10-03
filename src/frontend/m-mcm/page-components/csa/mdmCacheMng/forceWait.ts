/**
 * mdmCacheMng — 강제 기록(삭제·재등록) 뒤 선택한 모듈이 반영하기를 기다렸다가 표를 다시 조회하는 루프.
 * 화면 의존이 없는 순수 비동기 함수라 읽기·다시 조회·취소 확인을 받아 가짜 타이머로 시험한다. 판단은 utils 의 decideForceWait.
 */
import type { ForceKind } from "./types";
import { FORCE_WAIT_INTERVAL_MS, FORCE_WAIT_LIMIT_MS, decideForceWait } from "./utils";

export interface ForceWaitParams {
  kind: ForceKind;
  toSeq: number;
  /** 강제 기록한 '종류:정의 키' 목록. */
  forcedKeys: readonly string[];
  /** 선택한 모듈의 appliedSeq 를 읽는다. 던지면 읽지 못한 것으로 보고 한도 안에서 계속 기다린다. */
  readAppliedSeq: () => Promise<number>;
  /** 표를 다시 조회하고 그 '종류:정의 키' 집합을 돌려준다(조회 실패면 null). */
  refetchEntries: () => Promise<ReadonlySet<string> | null>;
  /** 실행 번호가 바뀌었는지 — 취소됐으면 더 읽지도 다시 조회하지도 않는다. */
  isCancelled: () => boolean;
  limitMs?: number;
  intervalMs?: number;
}

export type ForceWaitResult = "DONE" | "TIMEOUT" | "CANCELLED";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function runForceWait(p: ForceWaitParams): Promise<ForceWaitResult> {
  const limitMs = p.limitMs ?? FORCE_WAIT_LIMIT_MS;
  const intervalMs = p.intervalMs ?? FORCE_WAIT_INTERVAL_MS;
  const startedAt = Date.now();
  let tableKeys: ReadonlySet<string> | null = null;
  const decide = (appliedSeq: number | null) =>
    decideForceWait({ kind: p.kind, toSeq: p.toSeq, appliedSeq, tableKeys, forcedKeys: p.forcedKeys, elapsedMs: Date.now() - startedAt, limitMs });

  for (;;) {
    if (p.isCancelled()) return "CANCELLED";
    let appliedSeq: number | null = null;
    try {
      appliedSeq = await p.readAppliedSeq();
    } catch {
      appliedSeq = null;
    }
    if (p.isCancelled()) return "CANCELLED";

    let decision = decide(appliedSeq);
    if (decision === "REFETCH") {
      tableKeys = await p.refetchEntries();
      if (p.isCancelled()) return "CANCELLED";
      // 삭제는 반영 뒤 한 번 다시 조회하면 끝이다. 재등록은 다시 조회한 표에 키가 보여야 끝이라 바로 다시 판단한다.
      decision = p.kind === "EVICT" ? "DONE" : decide(appliedSeq);
    }
    if (decision === "DONE" || decision === "TIMEOUT") return decision;
    await sleep(intervalMs);
  }
}
