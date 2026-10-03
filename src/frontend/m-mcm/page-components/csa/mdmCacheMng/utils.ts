/**
 * mdmCacheMng 표시용 순수 함수 — 추정 크기·수명 도움말·D-154 논리 키·구분 문구(spec docs/superpowers/specs/2026-10-02-mdm-meta-cache-design.md §6).
 *
 * shared 의 `formatBytes`(libFormat)는 "Bytes" 표기·소수 2자리·null 이면 빈 문자열·음수 미처리라 이 화면 표기("B"·소수 1자리·잴 수
 * 없음은 "-")와 다르다. shared 동작을 바꾸지 않고 화면 폴더에 둔다(업무 무관 함수 하나라 shared 컴포넌트 등록 대상이 아니다).
 */

import { VERSIONED_TARGET_TYPES } from "./types";
import type { CacheEntryRow, EntryPart, ForceKind, MdmTargetType } from "./types";

const UNITS = ["KB", "MB", "GB"] as const;

/**
 * 바이트 수를 1024 단위 B/KB/MB/GB 로. B 는 정수, KB 부터 소수 1자리(1.0 KB). GB 가 가장 큰 단위다.
 * 음수(서버가 잴 수 없을 때 -1)·null·undefined·NaN 은 "-".
 */
export function formatBytes(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n < 0) return "-";
  if (n < 1024) return `${Math.round(n)} B`;
  let value = n / 1024;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(1)} ${UNITS[unit]}`;
}

/** 정수면 그대로, 아니면 소수 1자리. */
const trimNumber = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/**
 * "남은 수명" 도움말 — 유휴 수명(분)과 절대 상한(시간). 둘 중 하나라도 모르면(옛 모듈 응답) 빈 문자열.
 * 옛 버전 본문 수명을 알면 덧붙인다(D-154).
 * 예: "마지막 조회 뒤 60분 동안 조회 없으면 만료, 조회될 때마다 연장(적재 뒤 최대 24시간). 옛 버전 본문은 10분"
 */
export function describeLifetime(
  maxIdleSeconds: number | null | undefined,
  maxAgeSeconds: number | null | undefined,
  oldVersionMaxIdleSeconds?: number | null,
): string {
  if (maxIdleSeconds == null || maxAgeSeconds == null) return "";
  const base = `마지막 조회 뒤 ${trimNumber(maxIdleSeconds / 60)}분 동안 조회 없으면 만료, 조회될 때마다 연장(적재 뒤 최대 ${trimNumber(maxAgeSeconds / 3600)}시간)`;
  return oldVersionMaxIdleSeconds == null ? base : `${base}. 옛 버전 본문은 ${trimNumber(oldVersionMaxIdleSeconds / 60)}분`;
}

/** 서버 MdmVersions.parse 와 같은 규칙 — 마지막 `@` 뒤가 소수 셋째 자리 숫자일 때만 본문 키다. */
const LOGICAL_KEY = /^(.+)@(\d{1,4}\.\d{3})$/;

/** 논리 키 → 정의 키. 버전 대상의 본문 키(`X@1.000`)면 `X`, 그 밖은 그대로. 변경 기록·강제 기록은 정의 키 단위다(D-154 결정 P5). */
export function definitionKey(type: MdmTargetType, key: string): string {
  if (!VERSIONED_TARGET_TYPES.includes(type)) return key;
  const m = LOGICAL_KEY.exec(key);
  return m ? m[1] : key;
}

/** "구분" 열 문구. */
export function entryKindLabel(part: EntryPart | null, current: boolean | null): string {
  if (part === "VALUE") return "값";
  if (part === "TOC") return "목차";
  if (part === "BODY") return current ? "본문(최종)" : "본문(옛)";
  return "";
}

/**
 * 그리드 행에 "구분" 문구(`kind`)를 미리 담는다. 그리드는 행 키가 같으면 그 칸의 필드 값이 바뀐 셀만 다시 그리므로, `part` 칸이 `current`
 * 를 함께 읽어 그리면 적용 시작이 지나 `current` 만 바뀐 행이 [조회] 뒤에도 옛 문구로 남는다.
 */
export function withEntryKind(rows: CacheEntryRow[]): (CacheEntryRow & { kind: string })[] {
  return rows.map((r) => ({ ...r, kind: entryKindLabel(r.part, r.current) }));
}

/** 추정 크기 열·요약의 도움말. */
export const ESTIMATED_SIZE_HELP = "JSON 직렬화 크기 기준, 실제 힙 점유는 이보다 큼";


/** 강제 기록(삭제·재등록) 뒤 모듈이 반영하기를 기다리는 한도 — 모듈 확인 주기(기본 10초)의 2.5 배쯤. */
export const FORCE_WAIT_LIMIT_MS = 25_000;
/** 반영 순번을 다시 읽는 간격. */
export const FORCE_WAIT_INTERVAL_MS = 2_500;
export const FORCE_WAIT_TIMEOUT_NOTICE = "아직 반영 전입니다. 잠시 뒤 [조회]로 다시 확인하세요.";
/** 모듈은 반영했는데 강제한 키가 끝내 표에 안 보일 때(MDM 에서 정의가 사라졌거나 표 조회 범위 밖). */
export const FORCE_WAIT_KEYS_NOTICE = "반영됐지만 일부 항목이 아직 목록에 없습니다. [조회]로 확인하세요.";

/**
 * 강제 기록 결과로 기다리기를 시작할지 정한다. 시작하면 기다릴 변경 기록 순번(toSeq)을, 아니면 null 을 돌려준다.
 * 일부 종류가 실패했거나(failedType) 반영한 종류가 없거나 순번이 없으면(null·0 이하) 기다리지 않는다.
 */
export function shouldWaitAfterForce(o: { applied: readonly unknown[]; failedType: unknown; toSeq: number | null }): number | null {
  if (o.failedType || o.applied.length === 0) return null;
  return o.toSeq !== null && o.toSeq > 0 ? o.toSeq : null;
}

/** 표의 행 모음을 '종류:정의 키' 집합으로 — 본문 행(`X@1.000`)도 정의 키 `X` 로 접어, 강제 기록 키(`groupByType` 의 정의 키)와 견준다. */
export function entryKeySet(rows: Pick<CacheEntryRow, "type" | "key">[]): Set<string> {
  return new Set(rows.map((r) => `${r.type}:${definitionKey(r.type, r.key)}`));
}

/** 기다리기 판단 결과 — 계속 기다림 | 표를 다시 조회 | 끝(완료) | 끝(한도 초과 안내). */
export type ForceWaitDecision = "WAIT" | "REFETCH" | "DONE" | "TIMEOUT" | "TIMEOUT_KEYS";

export interface ForceWaitInput {
  kind: ForceKind;
  /** 강제 기록이 닿은 변경 기록 순번(최댓값). */
  toSeq: number;
  /** 고른 모듈의 지금 적용 순번. 읽지 못했으면 null. */
  appliedSeq: number | null;
  /**
   * 반영 뒤에 다시 조회한 표의 '종류:정의 키' 집합. 반영 뒤 아직 다시 조회를 시도하지 않았을 때만 null(반영 전에 조회한 표는 넘기지 않는다).
   * 다시 조회가 실패했으면 null 이 아니라 빈 집합을 넘긴다 — 시도했음을 남겨 한도 판정이 걸리게 한다.
   */
  tableKeys: ReadonlySet<string> | null;
  /** 강제 기록한 '종류:정의 키' 목록. */
  forcedKeys: readonly string[];
  elapsedMs: number;
  limitMs: number;
}

/**
 * 강제 기록 뒤 기다리기 판단. 모듈 폴러는 지우기 → 적용 순번 올리기 → 다시 받기 순서라 appliedSeq >= toSeq 가 된 순간에는 [재등록] 키가
 * 아직 표에 없을 수 있다. 그래서 삭제는 반영되면 한 번 다시 조회하고 끝, 재등록은 다시 조회한 표에 강제한 키가 모두 보일 때 끝낸다.
 * 한도를 넘으면 안내하고 멈춘다(반영 전 TIMEOUT, 반영됐지만 키가 안 보임 TIMEOUT_KEYS). 다만 반영 뒤 아직 표를 다시 조회하지 않았으면(tableKeys null)
 * 한도가 지나도 한 번은 다시 조회한다.
 */
export function decideForceWait(i: ForceWaitInput): ForceWaitDecision {
  const applied = i.appliedSeq !== null && i.appliedSeq >= i.toSeq;
  if (!applied) return i.elapsedMs >= i.limitMs ? "TIMEOUT" : "WAIT";
  // 반영 뒤 아직 다시 조회하지 않았으면 한도와 무관하게 조회한다. 조회하면 tableKeys 가 null 이 아니게 되므로(실패는 빈 집합) 이 분기는 한 번만 탄다.
  if (i.tableKeys === null) return "REFETCH";
  if (i.kind === "EVICT") return "DONE";
  const keys = i.tableKeys;
  if (i.forcedKeys.every((k) => keys.has(k))) return "DONE";
  return i.elapsedMs >= i.limitMs ? "TIMEOUT_KEYS" : "REFETCH";
}
