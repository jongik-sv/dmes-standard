/**
 * 경계값 후보 팝업(카드 ⑥ [경계값 생성])의 실행·저장 도우미 — 화면 상태와 떨어진 순수 함수라 단위 테스트한다.
 *
 * - `runPool`: 후보를 동시 `limit` 건까지 실행한다. 다음 후보를 시작하기 직전마다 `signal` 을 보므로 [중단] 뒤에는 새 요청을 보내지 않는다
 *   (이미 보낸 요청은 끝까지 기다린다).
 * - `saveSequential`: 한 건씩 차례로 저장한다. 실패한 건은 사유만 알리고 나머지를 계속 저장한다(되돌리지 않음).
 * - `runOutcome`: 실행 결과 → 기대 JSON·결과 요약. 판정 오류(outcome ERROR)면 기대값 없이(null) 저장한다.
 */
import type { ResolvedVar, ValueTestResult, ValueTestValue } from "../types";
import { expectedFromResult, hitValue } from "./case-model";

/** 동시 실행 상한 — 서버에 한꺼번에 보내는 값 테스트 요청 수. */
export const BOUNDARY_RUN_CONCURRENCY = 4;

export interface PoolHooks<T, R> {
  onStart?: (item: T) => void;
  onDone?: (item: T, result: R) => void;
  onError?: (item: T, error: unknown) => void;
}

/**
 * items 를 동시 limit 건까지 worker 로 돌린다. 모든 시작한 작업이 끝나면 resolve 한다(작업의 실패는 onError 로만 알리고 던지지 않는다).
 * signal 이 중단되면 아직 시작하지 않은 항목은 시작하지 않는다.
 */
export async function runPool<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>,
  hooks: PoolHooks<T, R> = {},
  signal?: AbortSignal,
): Promise<void> {
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      if (signal?.aborted) return;
      const item = items[next++];
      hooks.onStart?.(item);
      try {
        const result = await worker(item);
        hooks.onDone?.(item, result);
      } catch (e) {
        hooks.onError?.(item, e);
      }
    }
  };
  const lanes = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, lane);
  await Promise.all(lanes);
}

/**
 * items 를 한 건씩 차례로 save 한다. 실패해도 다음 건을 계속 저장하고, 건마다 onResult(item, 오류 사유 또는 null)를 부른다.
 * signal 이 중단되면 다음 건부터 보내지 않는다. 저장에 성공한 건수를 돌려준다.
 */
export async function saveSequential<T>(
  items: readonly T[],
  save: (item: T) => Promise<unknown>,
  onResult: (item: T, error: string | null) => void,
  signal?: AbortSignal,
): Promise<number> {
  let saved = 0;
  for (const item of items) {
    if (signal?.aborted) break;
    try {
      await save(item);
      saved += 1;
      onResult(item, null);
    } catch (e) {
      onResult(item, errorMessage(e));
    }
  }
  return saved;
}

/**
 * 결과 계산에 쓰는데 비어 있는 입력 — 입력 계약 이름(카드 ④ 입력 줄) 중 조건 열이 아닌 이름의 기본 입력 값이 없거나 null·빈 글자이면 낸다.
 * 후보 생성기는 조건 열만 대표값으로 채우므로, 이 값이 비면 그 이름을 읽는 결과 식이 판정 오류가 된다.
 */
export function emptyResultInputs(
  fieldNames: readonly string[],
  vars: readonly ResolvedVar[],
  baseInput: Readonly<Record<string, unknown>>,
): string[] {
  const condCols = new Set(vars.filter((v) => v.varKind === "COND" && !v.exprVar && v.varName).map((v) => v.varName!.toUpperCase()));
  const values = new Map(Object.entries(baseInput).map(([k, v]) => [k.toUpperCase(), v] as const));
  return fieldNames.filter((name) => {
    if (condCols.has(name.toUpperCase())) return false;
    const v = values.get(name.toUpperCase());
    return v === undefined || v === null || v === "";
  });
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function valueText(v: ValueTestValue | undefined): string {
  if (Array.isArray(v)) return `[${v.map(valueText).join(", ")}]`;
  return v == null ? "null" : String(v);
}

/** 실행 결과 한 건 — 저장에 쓸 기대 JSON 과 표에 보일 결과 요약. */
export interface BoundaryRunOutcome {
  /** 판정 오류면 true — 기대값 없이(null) 저장한다. */
  error: boolean;
  expectedJson: string | null;
  /** "QLTY_GRD=A · PRC_FCT=1.05 · hit 1" 또는 판정 오류 사유. */
  summary: string;
}

/** 실행 결과 → 기대 JSON(`expectedFromResult`)과 요약. defaultRowId 는 대상 표의 DEFAULT 행 rowId(기본 행 적용이면 hit 이 된다). */
export function runOutcome(result: ValueTestResult, vars: readonly ResolvedVar[], defaultRowId: number | null): BoundaryRunOutcome {
  if (result.outcome !== "OK") {
    const reasons = (result.errors ?? []).map((e) => e.message || e.code).join(" · ");
    return { error: true, expectedJson: null, summary: reasons || "판정 오류" };
  }
  const values = Object.entries(result.results ?? {}).map(([k, v]) => `${k}=${valueText(v)}`);
  const hit = hitValue(result, defaultRowId);
  values.push(`hit ${hit == null ? "없음" : Array.isArray(hit) ? hit.join(",") : hit}`);
  return { error: false, expectedJson: expectedFromResult(result, vars, defaultRowId), summary: values.join(" · ") };
}
