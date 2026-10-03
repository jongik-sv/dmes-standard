/**
 * mdmCacheMng 표시용 순수 함수 — 추정 크기·수명 도움말·D-154 논리 키·구분 문구(spec docs/superpowers/specs/2026-10-02-mdm-meta-cache-design.md §6).
 *
 * shared 의 `formatBytes`(libFormat)는 "Bytes" 표기·소수 2자리·null 이면 빈 문자열·음수 미처리라 이 화면 표기("B"·소수 1자리·잴 수
 * 없음은 "-")와 다르다. shared 동작을 바꾸지 않고 화면 폴더에 둔다(업무 무관 함수 하나라 shared 컴포넌트 등록 대상이 아니다).
 */

import { VERSIONED_TARGET_TYPES } from "./types";
import type { CacheEntryRow, EntryPart, MdmTargetType } from "./types";

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
