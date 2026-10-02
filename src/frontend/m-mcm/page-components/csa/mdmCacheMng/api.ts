/**
 * mdmCacheMng 호출 — 업무 모듈 cactus 엔드포인트 /api/{module}/mdmMeta/*(GET status·entries, POST load)와 MDM OASIS metaFeed/save(강제 기록).
 * spec docs/superpowers/specs/2026-10-02-mdm-meta-cache-design.md §5.5·§6. 강제 기록 봉투의 키 목록은 grids.keys.rows 다(params 배열 금지).
 *
 * 모듈별 status·entries 는 apiRequest 가 아니라 getJson 으로 부른다 — apiRequest 는 401 이면 로그인 화면으로 보내므로, 모듈 하나가 BFF 요청을
 * 인증하지 못해도(예: cactus 보안 설정이 빠진 모듈) 관리자가 로그아웃된다. getJson 은 상태 코드를 가진 HttpError 를 던지고 이동하지 않는다.
 */
import { apiRequest, getJson } from "@dk-oasis/shared/http";

import { TARGET_TYPE_LABELS, MODULE_STATE_LABELS } from "./types";
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

/** apiRequest 와 같은 토큰 헤더(있으면)를 붙인다. */
function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? window.localStorage.getItem("oasis_access_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** 로그인 이동 없이 GET — 실패는 getJson 의 HttpError(status) 또는 네트워크 오류다. */
function getWithoutRedirect<T>(path: string): Promise<T> {
  return getJson<T>(path, { method: "GET", headers: authHeaders() });
}

/** status 를 받지 못한 이유 — 401 인증 실패, 403 권한 없음, 그 밖(네트워크·5xx·404 등)은 연결 안 됨. */
export function failureState(e: unknown): ModuleState {
  const status = typeof e === "object" && e !== null && "status" in e ? Number((e as { status: unknown }).status) : NaN;
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  return "DOWN";
}

export async function fetchStatus(module: string): Promise<ModuleStatus> {
  return getWithoutRedirect<ModuleStatus>(`${metaBase(module)}/status`);
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
        state: failureState(s.reason),
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
  let res: EntryPayload;
  try {
    res = await getWithoutRedirect<EntryPayload>(`${metaBase(module)}/entries?${q.toString()}`);
  } catch (e) {
    const label = MODULE_STATE_LABELS[failureState(e)];
    throw new Error(`${label}: ${e instanceof Error ? e.message : String(e)}`);
  }
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
  const result = env?.data?.result;
  // 결과 없는 응답을 성공(0건)으로 넘기면 아무것도 기록되지 않았는데 "삭제되었습니다"가 뜬다 — 오류로 다룬다.
  if (!result) throw new Error("MDM 응답에 결과가 없습니다(metaFeed/save).");
  return result;
}

/** 여러 종류 강제 기록 결과. 실패하면 거기서 멈춘다 — failedType 과 그 뒤 종류(pending)는 반영되지 않았다. */
export interface ForceOutcome {
  applied: MdmTargetType[];
  failedType: MdmTargetType | null;
  /** 반영하지 못한 종류(실패한 종류 포함). */
  pending: MdmTargetType[];
  error: string | null;
}

/** 대상 종류마다 차례로 강제 기록한다. 하나가 실패하면 멈추고 어디까지 반영했는지 돌려준다. */
export async function forceByType(groups: Array<[MdmTargetType, string[]]>, kind: ForceKind): Promise<ForceOutcome> {
  const applied: MdmTargetType[] = [];
  for (let i = 0; i < groups.length; i++) {
    const [type, keys] = groups[i];
    try {
      await forceKeys(type, keys, kind);
      applied.push(type);
    } catch (e) {
      return {
        applied,
        failedType: type,
        pending: groups.slice(i).map(([t]) => t),
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }
  return { applied, failedType: null, pending: [], error: null };
}

/** 부분 실패 문구 — 반영한 종류와 반영하지 못한 종류를 함께 알린다. */
export function describeForceFailure(o: ForceOutcome): string {
  const names = (types: MdmTargetType[]) => types.map((t) => TARGET_TYPE_LABELS[t]).join(", ");
  const failed = o.failedType ? TARGET_TYPE_LABELS[o.failedType] : "";
  const head =
    o.applied.length > 0
      ? `${names(o.applied)}은(는) 반영했고, ${failed}부터 반영하지 못했습니다(남은 종류: ${names(o.pending)}).`
      : `반영하지 못했습니다(남은 종류: ${names(o.pending)}).`;
  return o.error ? `${head} ${o.error}` : head;
}

/** 등록(load) 결과 문구. 목록이 비면 괄호를 붙이지 않는다. */
export function describeLoadResult(r: LoadResult): string {
  const part = (label: string, keys: string[]) => `${label} ${keys.length}건${keys.length > 0 ? `(${keys.join(", ")})` : ""}`;
  return `적재 ${r.loaded.length}건, ${part("MDM 에 없음", r.missing)}, ${part("받을 수 없음", r.unavailable)}`;
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
