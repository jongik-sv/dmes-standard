/**
 * 룰 세트 디버깅 값으로 값 테스트 칸 채우기 — 룰 화면(page)이 handoff 대상에서 받은 읽은 값을 값 테스트 카드(④)에 넘기는 작은 저장소.
 *
 * page 는 대상을 받을 때마다 올린다(값 없는 이동은 null 로 지운다). 카드는 마운트보다 대상이 먼저 와도 받도록 구독한다(`useSyncExternalStore`).
 * `seq` 가 바뀌면 새 채우기다 — 카드는 한 `seq` 에서 한 이름을 한 번만 채운다. 한 채우기는 카드 하나만 가져간다(`claimDebugPrefill`):
 * 탭을 닫았다 다시 열어 카드가 새로 생겨도 지난 디버깅 값을 다시 채우지 않는다.
 */
import { useSyncExternalStore } from "react";

import type { TypedValue } from "@/contract/engine-contract.generated";

export interface DebugPrefill {
  seq: number;
  ruleId: string;
  inputs: Readonly<Record<string, TypedValue>>;
}

let current: DebugPrefill | null = null;
let seq = 0;
let claimed = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

/** 룰 화면이 받은 대상의 읽은 값을 올린다. `inputs` 가 없으면 남은 채우기를 지운다. */
export function offerDebugPrefill(ruleId: string, inputs: Readonly<Record<string, TypedValue>> | null | undefined): void {
  const next = inputs ? { seq: ++seq, ruleId, inputs } : null;
  if (next == null && current == null) return;
  current = next;
  emit();
}

/** 카드가 그 채우기를 가져간다. 이미 다른 카드(또는 지난 카드)가 가져갔으면 false. */
export function claimDebugPrefill(prefillSeq: number): boolean {
  if (claimed >= prefillSeq) return false;
  claimed = prefillSeq;
  return true;
}

export function clearDebugPrefill(): void {
  offerDebugPrefill("", null);
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

const snapshot = () => current;

export function useDebugPrefill(): DebugPrefill | null {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
