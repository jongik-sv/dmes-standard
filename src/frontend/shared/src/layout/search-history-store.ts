/**
 * 검색칸 "최근 입력값" localStorage 저장소 (순수 유틸).
 *
 * - 키: `dmes:search-history:{pageId}:{fieldKey}`
 *   pageId 는 이미 모듈 prefix(`mpn:` 등)를 포함하므로 모듈/화면 단위로 자연 분리된다.
 * - 실제 "조회한 값" 만 누적한다(저장 트리거는 search-history-bus + SearchHistoryInput 가 담당).
 * - 모든 접근은 try/catch + SSR(typeof window) 가드로 감싸 저장 실패가 검색 기능을 깨지 않게 한다.
 * - 화면 표시 텍스트(라벨)가 아닌 호출부가 정한 fieldKey 로 분리 저장한다.
 */

/** 한 필드에 보관하는 최근값 최대 개수 */
export const SEARCH_HISTORY_MAX_ENTRIES = 8;

/** 저장 허용 값 최대 길이(초과 시 저장하지 않음 — 비정상 대량 텍스트 방지) */
export const SEARCH_HISTORY_MAX_VALUE_LENGTH = 100;

/** localStorage 키 prefix */
export const SEARCH_HISTORY_KEY_PREFIX = "dmes:search-history:";

/**
 * 최근 입력값 기능을 활성화할 화면(pageId) prefix.
 * 현재는 APS(m-mpn) 화면(`mpn:...`)에서만 동작한다. 다른 모듈로 확장하려면 여기에 추가한다.
 */
export const SEARCH_HISTORY_PAGE_PREFIXES = ["mpn:"] as const;

/** 해당 pageId 화면에서 최근 입력값 기능을 켤지 여부 */
export function isSearchHistoryPage(pageId: string | undefined | null): boolean {
  if (!pageId) return false;
  return SEARCH_HISTORY_PAGE_PREFIXES.some((p) => pageId.startsWith(p));
}

/** `dmes:search-history:{pageId}:{fieldKey}` 키 생성. 인자가 비면 빈 문자열(=비활성). */
export function buildSearchHistoryKey(pageId: string, fieldKey: string): string {
  if (!pageId || !fieldKey) return "";
  return `${SEARCH_HISTORY_KEY_PREFIX}${pageId}:${fieldKey}`;
}

/** 현재 환경에서 localStorage 사용 가능 여부 (SSR/프라이빗 모드 가드) */
function getStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/** 저장된 최근값 목록을 읽는다. 실패/없음/형식오류 시 빈 배열. */
export function readSearchHistory(pageId: string, fieldKey: string): string[] {
  const key = buildSearchHistoryKey(pageId, fieldKey);
  if (!key) return [];
  const storage = getStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}

function writeSearchHistory(key: string, values: string[]): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    if (values.length === 0) {
      storage.removeItem(key);
    } else {
      storage.setItem(key, JSON.stringify(values));
    }
  } catch {
    /* quota 초과/프라이빗 모드 등 — 저장 실패는 무시(no-op) */
  }
}

/**
 * 값을 최근목록 맨 앞에 추가한다(중복 제거 후 move-to-front, 상한 적용).
 * - 트림 후 빈 값이거나 최대 길이 초과면 변경 없이 기존 목록을 반환.
 * @returns 갱신된 목록(또는 변경 없으면 기존 목록)
 */
export function addSearchHistory(pageId: string, fieldKey: string, value: string): string[] {
  const key = buildSearchHistoryKey(pageId, fieldKey);
  if (!key) return [];
  const trimmed = (value ?? "").trim();
  const current = readSearchHistory(pageId, fieldKey);
  if (!trimmed || trimmed.length > SEARCH_HISTORY_MAX_VALUE_LENGTH) return current;

  const next = [trimmed, ...current.filter((v) => v !== trimmed)].slice(
    0,
    SEARCH_HISTORY_MAX_ENTRIES
  );
  writeSearchHistory(key, next);
  return next;
}

/** 특정 값 1건을 최근목록에서 제거한다. @returns 갱신된 목록 */
export function removeSearchHistory(pageId: string, fieldKey: string, value: string): string[] {
  const key = buildSearchHistoryKey(pageId, fieldKey);
  if (!key) return [];
  const next = readSearchHistory(pageId, fieldKey).filter((v) => v !== value);
  writeSearchHistory(key, next);
  return next;
}

/** 한 필드의 최근목록 전체 삭제 */
export function clearSearchHistory(pageId: string, fieldKey: string): void {
  const key = buildSearchHistoryKey(pageId, fieldKey);
  if (!key) return;
  writeSearchHistory(key, []);
}

/**
 * 모든 검색 최근값(`dmes:search-history:*`) 삭제 — 로그아웃 등에서 일괄 정리용.
 * 현재 화면 코드에 자동 배선돼 있지는 않으며 필요 시 호출한다.
 */
export function clearAllSearchHistory(): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && k.startsWith(SEARCH_HISTORY_KEY_PREFIX)) keys.push(k);
    }
    keys.forEach((k) => storage.removeItem(k));
  } catch {
    /* no-op */
  }
}
