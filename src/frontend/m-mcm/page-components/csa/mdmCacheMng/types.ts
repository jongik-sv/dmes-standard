/** mdmCacheMng 타입·상수(spec docs/superpowers/specs/2026-10-02-mdm-meta-cache-design.md §5.5·§6). */

/** 캐시를 켠 업무 모듈. 응답하지 않는 모듈은 "연결 안 됨" 으로 보인다. */
export const MDM_CACHE_MODULES = ["mcm", "mls", "mqc", "mpp", "mpn"] as const;

export const MDM_TARGET_TYPES = ["COLUMN", "DOMAIN", "RULE", "RULE_SET", "CODE", "LAYOUT"] as const;
export type MdmTargetType = (typeof MDM_TARGET_TYPES)[number];

export const TARGET_TYPE_LABELS: Record<MdmTargetType, string> = {
  COLUMN: "컬럼",
  DOMAIN: "도메인",
  RULE: "룰",
  RULE_SET: "룰 세트",
  CODE: "마스터코드",
  LAYOUT: "전문",
};

export const TARGET_TYPE_OPTIONS = [
  { value: "", label: "전체" },
  ...MDM_TARGET_TYPES.map((value) => ({ value, label: TARGET_TYPE_LABELS[value] })),
];

/** 버전이 있는 대상(D-154) — 항목이 목차·본문으로 나뉜다. 본문 키는 `정의키@1.000`. */
export const VERSIONED_TARGET_TYPES: readonly MdmTargetType[] = ["RULE", "RULE_SET", "CODE", "LAYOUT"];

/** 항목 구분(D-154) — VALUE 값 하나(컬럼·도메인, versioned-feed off), TOC 목차, BODY 버전 본문. */
export type EntryPart = "VALUE" | "TOC" | "BODY";

export const REGISTER_TYPE_OPTIONS = MDM_TARGET_TYPES.map((value) => ({ value, label: TARGET_TYPE_LABELS[value] }));

/** 업무 모듈 GET /api/{module}/mdmMeta/status 응답. */
export interface ModuleStatus {
  module: string;
  instanceId: string;
  appliedSeq: number;
  latestSeq: number;
  lastSuccessAt: string | null;
  consecutiveFailures: number;
  lastError: string | null;
  counts: Record<string, number>;
  /** 종류별 추정 크기 합계(바이트, UTF-8 JSON 직렬화 기준 — 실제 힙 점유는 이보다 크다). 옛 모듈은 없다. */
  bytes?: Record<string, number>;
  /** 추정 크기 전체 합계(바이트). */
  totalBytes?: number;
  /** 이 인스턴스 JVM 힙 — Runtime.totalMemory()-freeMemory(), maxMemory(). */
  heap?: { usedBytes: number; maxBytes: number };
  maxEntries: number;
  /** 적재 뒤 절대 상한(초). 조회가 많아도 이 시간 뒤에는 다시 받는다. */
  maxAgeSeconds: number;
  /** 마지막 조회 뒤 유휴 수명(초). 조회될 때마다 연장된다. 옛 모듈은 없다. */
  maxIdleSeconds?: number;
  /** 버전 본문 수(D-154) — counts 는 목차 + 본문 합계다. 옛 모듈은 없다. */
  bodyCounts?: Record<string, number>;
  /** 옛·예약 버전 본문 유휴 수명(초). 옛 모듈은 없다. */
  oldVersionMaxIdleSeconds?: number;
  /** 버전별 피드를 쓰는가. 옛 모듈은 없다. */
  versionedFeed?: boolean;
}

/**
 * 모듈 상태. UNAUTHORIZED·FORBIDDEN·DOWN 은 status 를 받지 못한 행이다 — 401(모듈이 BFF 요청을 인증하지 못함)·403(권한 없음)·
 * 네트워크·5xx 등(연결 안 됨). 화면은 이 행들을 로그인 이동 없이 그리드에 보여 준다.
 */
export type ModuleState = "OK" | "LAGGING" | "FAILING" | "UNAUTHORIZED" | "FORBIDDEN" | "DOWN";

export const MODULE_STATE_LABELS: Record<ModuleState, string> = {
  OK: "정상",
  LAGGING: "최신 아님",
  FAILING: "확인 실패",
  UNAUTHORIZED: "인증 실패",
  FORBIDDEN: "권한 없음",
  DOWN: "연결 안 됨",
};

/** status 를 받은 모듈인가(항목 조회·등록을 할 수 있는가). */
export const isReachable = (state: ModuleState): boolean => state === "OK" || state === "LAGGING" || state === "FAILING";

export interface ModuleStatusRow extends Record<string, unknown> {
  module: string;
  state: ModuleState;
  instanceId: string;
  appliedSeq: number | null;
  latestSeq: number | null;
  lastSuccessAt: string;
  consecutiveFailures: number | null;
  total: number | null;
  /** 캐시 추정 크기(바이트). 숫자로 두고 표시는 formatBytes — 열 정렬이 글자 순이 되지 않게. 모르면 null. */
  totalBytes: number | null;
  heapUsed: number | null;
  heapMax: number | null;
  /** "남은 수명" 도움말용. 모르면 null. */
  maxIdleSeconds: number | null;
  maxAgeSeconds: number | null;
  /** 옛·예약 버전 본문 유휴 수명(초). 옛 모듈은 null. */
  oldVersionMaxIdleSeconds: number | null;
}

export interface CacheEntryRow extends Record<string, unknown> {
  rowId: string;
  type: MdmTargetType;
  key: string;
  absent: boolean;
  loadedAt: string;
  /** 마지막 조회(get 히트) 로컬 "yyyy-MM-dd HH:mm:ss". 적재 뒤 조회가 없으면 적재 시각과 같다. 옛 모듈은 빈 문자열. */
  lastAccessAt: string;
  hits: number;
  /** 두 기한(마지막 조회 + 유휴 수명, 적재 + 절대 상한) 중 이른 쪽까지. */
  remainingSeconds: number;
  /** 추정 크기(바이트). -1 = 잴 수 없음, null = 옛 모듈. */
  bytes: number | null;
  /** 구분(D-154). 옛 모듈은 null. */
  part: EntryPart | null;
  /** 본문의 버전(scale 3 문자열). 목차·값은 null. */
  ver: string | null;
  /** 본문이 최종 버전인가. 목차·값·옛 모듈은 null. */
  current: boolean | null;
}

/**
 * 업무 모듈 GET /api/{module}/mdmMeta/entry 의 항목 하나(SYSADMIN 상세 보기). `value` 는 캐시 값 전체다 — 컬럼은 bizExpr.text 까지,
 * 룰은 정의 전체(spec §4.2 의 예외, 2026-10-02 사용자 결정). "없음" 항목이면 absent=true, value=null.
 */
export interface CacheEntryDetail {
  type: MdmTargetType;
  key: string;
  absent: boolean;
  /** 로컬 "yyyy-MM-dd HH:mm:ss". */
  loadedAt: string;
  /** 로컬 "yyyy-MM-dd HH:mm:ss". 옛 모듈은 빈 문자열. */
  lastAccessAt: string;
  hits: number;
  remainingSeconds: number;
  loadSeq: number;
  /** 추정 크기(바이트). -1 = 잴 수 없음, null = 옛 모듈. */
  bytes: number | null;
  /** 구분(D-154). 옛 모듈은 null. */
  part: EntryPart | null;
  /** 본문의 버전(scale 3 문자열). 목차·값은 null. */
  ver: string | null;
  /** 본문이 최종 버전인가. 목차·값·옛 모듈은 null. */
  current: boolean | null;
  value: unknown;
}

/** 항목 상세 조회 결과 — 캐시에 없으면(만료·삭제됨, 404) found=false. */
export type CacheEntryLookup = { found: true; detail: CacheEntryDetail } | { found: false; message: string };

export const ENTRY_NOT_CACHED_MESSAGE = "캐시에 없음(만료·삭제됨)";

/** 서버(MdmMetaController.entry)가 "캐시에 없음" 404 본문에 싣는 code. 다른 404(모듈 불일치·없는 경로)와 가른다. */
export const ENTRY_NOT_CACHED_CODE = "MDM_ENTRY_NOT_CACHED";

/** "캐시에 없음"이 아닌 404 — 모듈 이름이 다르거나 경로가 없다(모듈이 entry 를 모르는 옛 버전 등). */
export const ENTRY_NOT_FOUND_MESSAGE = "조회할 수 없음(404)";

export interface CacheEntryPage {
  total: number;
  page: number;
  size: number;
  items: CacheEntryRow[];
}

/** 항목 정렬 — key(종류·키 순, 서버 기본)·bytes(추정 크기 큰 순)·hits(조회 수 많은 순). 서버가 쪽을 자르기 전에 정렬한다. */
export type EntrySort = "key" | "bytes" | "hits";

export const ENTRY_SORT_OPTIONS: Array<{ value: EntrySort; label: string }> = [
  { value: "key", label: "키" },
  { value: "bytes", label: "크기" },
  { value: "hits", label: "조회 수" },
];

export interface EntryFilters {
  type: "" | MdmTargetType;
  q: string;
  sort: EntrySort;
}

export const emptyFilters = (): EntryFilters => ({ type: "", q: "", sort: "key" });

export interface LoadResult {
  loaded: string[];
  missing: string[];
  unavailable: string[];
}

export type ForceKind = "EVICT" | "RELOAD";

export interface ForceResult {
  fromSeq: number;
  toSeq: number;
  count: number;
}
