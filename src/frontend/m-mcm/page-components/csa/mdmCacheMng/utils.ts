/**
 * mdmCacheMng 표시용 순수 함수 — 추정 크기·수명 도움말(spec docs/superpowers/specs/2026-10-02-mdm-meta-cache-design.md §6).
 *
 * shared 의 `formatBytes`(libFormat)는 "Bytes" 표기·소수 2자리·null 이면 빈 문자열·음수 미처리라 이 화면 표기("B"·소수 1자리·잴 수
 * 없음은 "-")와 다르다. shared 동작을 바꾸지 않고 화면 폴더에 둔다(업무 무관 함수 하나라 shared 컴포넌트 등록 대상이 아니다).
 */

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
 * 예: "마지막 조회 뒤 60분 동안 조회 없으면 만료, 조회될 때마다 연장(적재 뒤 최대 24시간)"
 */
export function describeLifetime(maxIdleSeconds: number | null | undefined, maxAgeSeconds: number | null | undefined): string {
  if (maxIdleSeconds == null || maxAgeSeconds == null) return "";
  return `마지막 조회 뒤 ${trimNumber(maxIdleSeconds / 60)}분 동안 조회 없으면 만료, 조회될 때마다 연장(적재 뒤 최대 ${trimNumber(maxAgeSeconds / 3600)}시간)`;
}

/** 추정 크기 열·요약의 도움말. */
export const ESTIMATED_SIZE_HELP = "JSON 직렬화 크기 기준, 실제 힙 점유는 이보다 큼";
