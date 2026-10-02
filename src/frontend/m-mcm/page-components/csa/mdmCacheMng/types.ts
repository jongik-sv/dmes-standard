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
  maxEntries: number;
  maxAgeSeconds: number;
}

export type ModuleState = "OK" | "LAGGING" | "FAILING" | "DOWN";

export const MODULE_STATE_LABELS: Record<ModuleState, string> = {
  OK: "정상",
  LAGGING: "최신 아님",
  FAILING: "확인 실패",
  DOWN: "연결 안 됨",
};

export interface ModuleStatusRow extends Record<string, unknown> {
  module: string;
  state: ModuleState;
  instanceId: string;
  appliedSeq: number | null;
  latestSeq: number | null;
  lastSuccessAt: string;
  consecutiveFailures: number | null;
  total: number | null;
}

export interface CacheEntryRow extends Record<string, unknown> {
  rowId: string;
  type: MdmTargetType;
  key: string;
  absent: boolean;
  loadedAt: string;
  hits: number;
  remainingSeconds: number;
}

export interface CacheEntryPage {
  total: number;
  page: number;
  size: number;
  items: CacheEntryRow[];
}

export interface EntryFilters {
  type: "" | MdmTargetType;
  q: string;
}

export const emptyFilters = (): EntryFilters => ({ type: "", q: "" });

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
