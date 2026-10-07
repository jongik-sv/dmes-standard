/**
 * 조회 칸 사용자 기본값 저장소 (설계 2026-10-07-search-defaults-design §5.4).
 *
 * - 정본은 서버(OASIS `secSrchDflt`, mcm)이고, 브라우저에는 사본(거울)을 둔다: localStorage `dmes:search-dflt:v1:{userId}`
 *   = `{ [pageId]: { [fieldKey]: rule } }`. 거울이 있으면 화면 첫 렌더 때 동기로 읽어 바로 넣을 수 있다.
 * - 상태: idle → (거울 있음) ready(mirror) → ready(server) / (거울 없음) loading → ready(server|empty).
 *   서버 실패는 ready 로 끝내고 콘솔에만 남긴다(기본값이 안 들어갈 뿐 화면은 동작한다).
 * - 서버 응답이 거울과 달라도 이미 마운트된 화면에는 다시 넣지 않는다 — 다음에 여는 화면부터 쓴다(값이 갑자기 바뀌지 않게).
 * - shared 는 tsup entry 별로 나뉘어 빌드되므로(splitting:false) 모듈 상태를 globalThis 에 둬 한 인스턴스를 공유한다.
 * - 모든 저장소 접근은 try/catch — 저장 실패가 조회 기능을 깨지 않게 한다.
 */
import { parseSearchDefaultRule, type SearchDefaultRule } from "./rule";

export type PageRules = Record<string, SearchDefaultRule>;
type UserRules = Record<string, PageRules>;

export type SearchDefaultsStatus = "idle" | "loading" | "ready";
export type SearchDefaultsSource = "none" | "mirror" | "server" | "empty";

export const SEARCH_DEFAULTS_MIRROR_PREFIX = "dmes:search-dflt:v1:";
export const SEARCH_DEFAULTS_ENDPOINT = "/api/mcm/oasis/secSrchDflt";

/** 저장할 때 행 하나(설계 §5.3 savePage). */
export interface SearchDefaultSaveRow {
  fieldKey: string;
  rule: SearchDefaultRule;
  fieldMeta?: string | null;
  fieldLabel?: string | null;
}

/** 서버 호출 — 시험에서 바꿔 끼운다. 응답 봉투를 그대로 돌려준다. */
export type SearchDefaultsTransport = (action: "search" | "savePage" | "resetPage", body: unknown) => Promise<unknown>;

interface UserEntry {
  status: SearchDefaultsStatus;
  source: SearchDefaultsSource;
  rules: UserRules;
  promise: Promise<void> | null;
}

interface StoreState {
  users: Map<string, UserEntry>;
  listeners: Set<() => void>;
  transport: SearchDefaultsTransport;
}

const GLOBAL_KEY = "__dkOasisSearchDefaultsStore__";
interface GlobalCache {
  [GLOBAL_KEY]?: StoreState;
}
const cache = globalThis as unknown as GlobalCache;

const defaultTransport: SearchDefaultsTransport = async (action, body) => {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  try {
    const token = typeof window !== "undefined" ? window.localStorage.getItem("oasis_access_token") : null;
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    /* 토큰 없이 쿠키 세션으로 보낸다 */
  }
  const res = await fetch(`${SEARCH_DEFAULTS_ENDPOINT}/${action}`, {
    method: "POST",
    credentials: "same-origin",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`조회 기본값 ${action} 실패 (${res.status})`);
  return res.json();
};

function getState(): StoreState {
  return (cache[GLOBAL_KEY] ??= { users: new Map(), listeners: new Set(), transport: defaultTransport });
}

function notify(): void {
  getState().listeners.forEach((l) => {
    try {
      l();
    } catch {
      /* no-op */
    }
  });
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function mirrorKey(userId: string): string {
  return `${SEARCH_DEFAULTS_MIRROR_PREFIX}${userId}`;
}

/** 거울·서버 값 정리 — 모르는 규칙은 버린다. */
function sanitizeUserRules(raw: unknown): UserRules {
  const out: UserRules = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [pageId, page] of Object.entries(raw as Record<string, unknown>)) {
    if (!page || typeof page !== "object" || Array.isArray(page)) continue;
    const rules: PageRules = {};
    for (const [fieldKey, rule] of Object.entries(page as Record<string, unknown>)) {
      const parsed = parseSearchDefaultRule(rule);
      if (parsed) rules[fieldKey] = parsed;
    }
    if (Object.keys(rules).length > 0) out[pageId] = rules;
  }
  return out;
}

function readMirror(userId: string): UserRules | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(mirrorKey(userId));
    return raw == null ? null : sanitizeUserRules(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeMirror(userId: string, rules: UserRules): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(mirrorKey(userId), JSON.stringify(rules));
  } catch {
    /* 용량 초과 등 — 거울이 없을 뿐 서버 값은 메모리에 있다 */
  }
}

/** 응답 봉투에서 행 목록을 꺼낸다 — data.result.rows · data.rows · grids.rows.rows 순서. */
function extractRows(body: unknown): Record<string, unknown>[] {
  const env = (body ?? {}) as {
    meta?: { success?: boolean; message?: string };
    data?: Record<string, unknown>;
    grids?: Record<string, { rows?: unknown }>;
  };
  if (env.meta && env.meta.success === false) throw new Error(env.meta.message?.trim() || "요청이 거부되었습니다.");
  const result = env.data?.result as Record<string, unknown> | undefined;
  const candidates = [result?.rows, env.data?.rows, env.grids?.rows?.rows];
  const rows = candidates.find((c) => Array.isArray(c)) as unknown[] | undefined;
  return (rows ?? []).filter((r): r is Record<string, unknown> => !!r && typeof r === "object" && !Array.isArray(r));
}

function assertSuccess(body: unknown): void {
  const meta = (body as { meta?: { success?: boolean; message?: string } } | null)?.meta;
  if (meta && meta.success === false) throw new Error(meta.message?.trim() || "요청이 거부되었습니다.");
}

function rowsToUserRules(rows: Record<string, unknown>[]): UserRules {
  const out: UserRules = {};
  for (const row of rows) {
    const pageId = typeof row.pageId === "string" ? row.pageId : "";
    const fieldKey = typeof row.fieldKey === "string" ? row.fieldKey : "";
    const rule = parseSearchDefaultRule(row.ruleJson);
    if (!pageId || !fieldKey || !rule) continue;
    (out[pageId] ??= {})[fieldKey] = rule;
  }
  return out;
}

function entryFor(userId: string): UserEntry {
  const st = getState();
  let e = st.users.get(userId);
  if (!e) {
    e = { status: "idle", source: "none", rules: {}, promise: null };
    st.users.set(userId, e);
  }
  return e;
}

/**
 * 사용자 기본값을 준비한다(한 번만 서버에 묻는다). 거울이 있으면 즉시 ready(mirror) 가 되고 서버 응답으로 갱신된다.
 * 포털 셸이 사용자 확인 직후 부르고, SearchArea 도 처음 마운트 때 부른다(분리 창).
 */
export function preloadSearchDefaults(userId: string): void {
  if (!userId) return;
  const e = entryFor(userId);
  if (e.promise || e.source === "server") return;
  const mirror = readMirror(userId);
  if (mirror) {
    e.rules = mirror;
    e.status = "ready";
    e.source = "mirror";
  } else {
    e.status = "loading";
  }
  e.promise = (async () => {
    try {
      const body = await getState().transport("search", { meta: { menuId: "HOME" }, params: {} });
      e.rules = rowsToUserRules(extractRows(body));
      e.source = "server";
      writeMirror(userId, e.rules);
    } catch (err) {
      console.warn("[search-defaults] 서버에서 조회 기본값을 받지 못했다 — 거울 값(있으면)으로 동작한다", err);
      if (e.source !== "mirror") e.source = "empty";
    } finally {
      e.status = "ready";
      e.promise = null;
      notify();
    }
  })();
  notify();
}

export function getSearchDefaultsStatus(userId: string): SearchDefaultsStatus {
  return getState().users.get(userId)?.status ?? "idle";
}

export function getSearchDefaultsSource(userId: string): SearchDefaultsSource {
  return getState().users.get(userId)?.source ?? "none";
}

/** 그 화면의 규칙(없으면 빈 객체). */
export function getPageSearchDefaults(userId: string, pageId: string): PageRules {
  return getState().users.get(userId)?.rules[pageId] ?? {};
}

/** 상태가 바뀌면 불린다. 해제 함수를 돌려준다. */
export function subscribeSearchDefaults(listener: () => void): () => void {
  const st = getState();
  st.listeners.add(listener);
  return () => {
    st.listeners.delete(listener);
  };
}

function setPageLocal(userId: string, pageId: string, rules: PageRules): void {
  const e = entryFor(userId);
  const next = { ...e.rules };
  if (Object.keys(rules).length === 0) delete next[pageId];
  else next[pageId] = rules;
  e.rules = next;
  if (e.status === "idle") {
    e.status = "ready";
    e.source = "mirror";
  }
  writeMirror(userId, next);
  notify();
}

/** 한 화면의 규칙을 서버에 통째로 저장하고(설계 §5.3 savePage) 성공하면 메모리·거울을 바꾼다. 실패하면 던진다. */
export async function saveSearchDefaults(userId: string, pageId: string, rows: SearchDefaultSaveRow[]): Promise<void> {
  const body = await getState().transport("savePage", {
    meta: { menuId: "HOME" },
    params: { pageId },
    grids: {
      rows: {
        rows: rows.map((r) => ({
          fieldKey: r.fieldKey,
          ruleJson: JSON.stringify(r.rule),
          fieldMeta: r.fieldMeta ?? null,
          fieldLabel: r.fieldLabel ?? null,
        })),
      },
    },
  });
  assertSuccess(body);
  setPageLocal(userId, pageId, Object.fromEntries(rows.map((r) => [r.fieldKey, r.rule])));
}

/** 한 화면의 규칙을 서버에서 지우고(resetPage) 메모리·거울에서도 지운다. 실패하면 던진다. */
export async function resetSearchDefaults(userId: string, pageId: string): Promise<void> {
  const body = await getState().transport("resetPage", { meta: { menuId: "HOME" }, params: { pageId } });
  assertSuccess(body);
  setPageLocal(userId, pageId, {});
}

/**
 * 서버를 거치지 않고 메모리·거울만 바꾼다 — 확인용 샘플 화면과 시험 전용. 화면 코드에서 쓰지 않는다
 * (다음 서버 응답이 덮어쓴다).
 */
export function setSearchDefaultsLocalForDev(userId: string, pageId: string, rules: PageRules): void {
  setPageLocal(userId, pageId, rules);
}

/** 시험 전용 — 서버 호출을 바꾼다. 인자를 비우면 기본 fetch 로 돌아간다. */
export function setSearchDefaultsTransportForTest(transport?: SearchDefaultsTransport): void {
  getState().transport = transport ?? defaultTransport;
}

/** 시험·사용자 전환용 — 메모리 상태를 비운다(거울은 그대로). */
export function resetSearchDefaultsStore(): void {
  const st = getState();
  st.users.clear();
  notify();
}
