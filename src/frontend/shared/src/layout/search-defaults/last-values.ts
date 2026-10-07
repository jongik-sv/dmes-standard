/**
 * 조회 칸 「마지막 조회값」 저장소 (설계 2026-10-07-search-defaults-design §4.5).
 *
 * - localStorage `dmes:search-last:v1:{userId}:{pageId}` = `{ [fieldKey]: value }`. 한 화면에 키 하나.
 * - 사용자가 실제로 조회한 순간(search-history-bus 의 emitSearch)의 값을 적는다. 규칙이 「마지막 조회값」 이 아닌 칸도 적어 두어
 *   나중에 규칙을 바꾸면 바로 값이 있게 한다.
 * - PC 별 저장이다(서버에 두지 않는다 — 조회마다 서버에 쓰지 않으려고).
 */
export const SEARCH_LAST_KEY_PREFIX = "dmes:search-last:v1:";
/** 저장 값 최대 길이(넘으면 그 칸은 적지 않는다). */
export const SEARCH_LAST_MAX_VALUE_LENGTH = 200;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function key(userId: string, pageId: string): string {
  return `${SEARCH_LAST_KEY_PREFIX}${userId}:${pageId}`;
}

export function readSearchLastValues(userId: string, pageId: string): Record<string, string> {
  const s = storage();
  if (!s || !userId || !pageId) return {};
  try {
    const raw = s.getItem(key(userId, pageId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) if (typeof v === "string") out[k] = v;
    return out;
  } catch {
    return {};
  }
}

/** 지금 값들을 기존 값 위에 덮어 적는다(이번 조회에 없는 칸의 값은 남긴다). */
export function writeSearchLastValues(userId: string, pageId: string, values: Record<string, string>): void {
  const s = storage();
  if (!s || !userId || !pageId) return;
  const next = { ...readSearchLastValues(userId, pageId) };
  for (const [k, v] of Object.entries(values)) {
    if (v.length <= SEARCH_LAST_MAX_VALUE_LENGTH) next[k] = v;
  }
  try {
    s.setItem(key(userId, pageId), JSON.stringify(next));
  } catch {
    /* 용량 초과 등 — 무시 */
  }
}
