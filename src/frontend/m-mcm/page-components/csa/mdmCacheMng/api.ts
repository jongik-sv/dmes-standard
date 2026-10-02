/**
 * mdmCacheMng 호출 — 업무 모듈 cactus 엔드포인트 /api/{module}/mdmMeta/*(GET status·entries, POST load)와 MDM OASIS metaFeed/save(강제 기록).
 * spec docs/superpowers/specs/2026-10-02-mdm-meta-cache-design.md §5.5·§6. 강제 기록 봉투의 키 목록은 grids.keys.rows 다(params 배열 금지).
 */
import { apiRequest } from "@dk-oasis/shared/http";

import type {
  CacheEntryPage,
  CacheEntryRow,
  EntryFilters,
  ForceKind,
  ForceResult,
  LoadResult,
  MdmTargetType,
  ModuleState,
  ModuleStatus,
  ModuleStatusRow,
} from "./types";

const SCREEN_ID = "mdmCacheMng";
const FEED_BASE = "/api/mdm/oasis/metaFeed";
const metaBase = (module: string) => `/api/${module}/mdmMeta`;

interface CactusEnvelope<T> {
  meta?: { success?: boolean; message?: string };
  data?: { result?: T };
}

interface EntryPayload {
  total: number;
  page: number;
  size: number;
  items: Array<{ type: MdmTargetType; key: string; absent: boolean; loadedAt: string; hits: number; remainingSeconds: number }>;
}

/** ISO 시각을 로컬 "yyyy-MM-dd HH:mm:ss" 로. 비면 빈 문자열. */
export function formatInstant(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 키 입력(쉼표·공백·줄바꿈 구분)을 중복 없는 목록으로. */
export function parseKeys(text: string): string[] {
  return Array.from(new Set(text.split(/[\s,]+/).map((k) => k.trim()).filter(Boolean)));
}

export async function fetchStatus(module: string): Promise<ModuleStatus> {
  return apiRequest<ModuleStatus>(`${metaBase(module)}/status`, { method: "GET" });
}

function stateOf(s: ModuleStatus, latestSeq: number): ModuleState {
  if (s.consecutiveFailures > 0) return "FAILING";
  if (s.appliedSeq < latestSeq) return "LAGGING";
  return "OK";
}

/**
 * 모듈을 함께 부른다. 응답하지 않는 모듈은 "연결 안 됨" 행이다. MDM 최신 순번은 응답한 모듈들의 latestSeq(마지막 폴링 값) 최댓값이고,
 * appliedSeq 가 그보다 뒤처진 모듈은 LAGGING 이다 — 화면이 MDM 을 따로 부르지 않는다(spec §6).
 */
export async function fetchAllStatus(modules: readonly string[]): Promise<{ rows: ModuleStatusRow[]; latestSeq: number }> {
  const settled = await Promise.allSettled(modules.map((m) => fetchStatus(m)));
  const latestSeq = settled.reduce((max, s) => (s.status === "fulfilled" ? Math.max(max, s.value.latestSeq) : max), -1);
  const rows = settled.map((s, i): ModuleStatusRow => {
    if (s.status === "rejected") {
      return {
        module: modules[i],
        state: "DOWN",
        instanceId: "",
        appliedSeq: null,
        latestSeq: null,
        lastSuccessAt: "",
        consecutiveFailures: null,
        total: null,
      };
    }
    const v = s.value;
    return {
      module: modules[i],
      state: stateOf(v, latestSeq),
      instanceId: v.instanceId,
      appliedSeq: v.appliedSeq,
      latestSeq: v.latestSeq,
      lastSuccessAt: formatInstant(v.lastSuccessAt),
      consecutiveFailures: v.consecutiveFailures,
      total: Object.values(v.counts ?? {}).reduce((a, b) => a + b, 0),
    };
  });
  return { rows, latestSeq };
}

export async function fetchEntries(module: string, filters: EntryFilters, page = 0, size = 200): Promise<CacheEntryPage> {
  const q = new URLSearchParams();
  if (filters.type) q.set("type", filters.type);
  if (filters.q.trim()) q.set("q", filters.q.trim());
  q.set("page", String(page));
  q.set("size", String(size));
  const res = await apiRequest<EntryPayload>(`${metaBase(module)}/entries?${q.toString()}`, { method: "GET" });
  const items: CacheEntryRow[] = res.items.map((e) => ({
    rowId: `${e.type}:${e.key}`,
    type: e.type,
    key: e.key,
    absent: e.absent,
    loadedAt: formatInstant(e.loadedAt),
    hits: e.hits,
    remainingSeconds: e.remainingSeconds,
  }));
  return { total: res.total, page: res.page, size: res.size, items };
}

/** 고른 모듈 인스턴스에 미리 적재(신규 = 등록). */
export async function loadKeys(module: string, type: MdmTargetType, keys: string[]): Promise<LoadResult> {
  return apiRequest<LoadResult>(`${metaBase(module)}/load`, { method: "POST", body: JSON.stringify({ type, keys }) });
}

/** MDM 변경 기록에 강제 기록(삭제 EVICT·재등록 RELOAD) — 모든 모듈·인스턴스가 다음 확인 때 반영한다(D6). */
export async function forceKeys(type: MdmTargetType, keys: string[], kind: ForceKind): Promise<ForceResult> {
  const env = await apiRequest<CactusEnvelope<ForceResult>>(`${FEED_BASE}/save`, {
    method: "POST",
    body: JSON.stringify({
      meta: { menuId: SCREEN_ID },
      params: { type, kind },
      grids: { keys: { rows: keys.map((key) => ({ key })) } },
    }),
  });
  if (env?.meta?.success === false) throw new Error(env.meta.message || "요청이 거부되었습니다.");
  return env?.data?.result ?? { fromSeq: 0, toSeq: 0, count: 0 };
}

/** 선택한 항목을 대상 종류별로 묶는다(강제 기록은 종류 하나씩 부른다). */
export function groupByType(rows: CacheEntryRow[]): Array<[MdmTargetType, string[]]> {
  const map = new Map<MdmTargetType, string[]>();
  for (const r of rows) {
    const list = map.get(r.type) ?? [];
    list.push(r.key);
    map.set(r.type, list);
  }
  return Array.from(map.entries());
}
