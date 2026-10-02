/**
 * MDM 화면 메타 store(spec B4·B5) — 화면이 등록한 물리명을 한 틱(16ms) 동안 모아 모듈마다 POST 한 번으로 받는다.
 *
 * - `POST /api/{module}/mdmMeta/columns` 본문 `{"names":[...]}`, `POST /api/{module}/mdmMeta/domains` 본문 `{"domainIds":[...]}`.
 *   응답 `{items:{키:메타}, missing:[], unavailable:[]}`.
 * - 받은 것(items)과 없는 것(missing → null)은 모듈+키 단위로 5분 둔다. unavailable(업무 BE 가 MDM 에서 받지 못함)은 두지 않는다 — 다음 요청 때 다시.
 * - 같은 키의 진행 중 요청은 공유한다.
 * - 404(모듈에 엔드포인트 없음 — analog·mdm)·401·403·연결 실패면 그 모듈을 세션 동안 끄고 다시 부르지 않는다. 401 에도 로그인 화면으로 보내지
 *   않는다(`apiRequest` 를 쓰지 않는다 — A 에서 401 리다이렉트가 관리자를 로그아웃시킨 일이 있었다).
 * - 모든 상태는 `globalThis.__dkOasisMdmMetaStore__` 하나에 둔다. tsup 이 진입점마다 이 파일을 따로 묶어도(splitting: false) 포털 공급자와
 *   그리드·폼이 같은 store 를 본다.
 *
 * 결과 Map 의 값: 메타 = 있음, null = MDM 에 없음. 키가 없으면 알 수 없음(unavailable·모듈 꺼짐·오류).
 */
import { HttpError, postJsonNoRedirect } from "../http";
import type { MdmDomainMeta, MdmScreenColumn } from "./types";

type Kind = "columns" | "domains";

/** 받은 메타·없음(null)을 두는 시간 — 5분. */
export const MDM_META_TTL_MS = 5 * 60_000;
/** 이름을 모으는 시간 — 같은 화면의 그리드·폼이 마운트되며 등록한 이름을 한 요청으로 묶는다. */
export const MDM_META_BATCH_MS = 16;

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

interface Batch {
  kind: Kind;
  module: string;
  keys: Set<string>;
  /** 묶음을 만든 때의 generation — 그 사이 리셋되면 부르지 않는다. */
  generation: number;
  promise: Promise<Map<string, unknown>>;
  resolve: (m: Map<string, unknown>) => void;
}

interface StoreState {
  cache: Map<string, CacheEntry>;
  inflight: Map<string, Promise<unknown>>;
  pending: Map<string, Batch>;
  disabled: Set<string>;
  /** resetMdmMetaStore 마다 늘린다 — 리셋 전에 나간 요청의 응답이 리셋 뒤 상태를 쓰지 않게. */
  generation: number;
}

const GLOBAL_KEY = "__dkOasisMdmMetaStore__";

function state(): StoreState {
  const g = globalThis as unknown as Record<string, StoreState | undefined>;
  let s = g[GLOBAL_KEY];
  if (!s) {
    s = { cache: new Map(), inflight: new Map(), pending: new Map(), disabled: new Set(), generation: 0 };
    g[GLOBAL_KEY] = s;
  }
  return s;
}

const UNKNOWN = undefined;
const keyOf = (kind: Kind, module: string, key: string) => `${kind}\u0000${module}\u0000${key}`;

interface MetaResponse {
  items?: Record<string, unknown>;
  missing?: string[];
  unavailable?: string[];
}

function unwrap(body: unknown): MetaResponse {
  if (!body || typeof body !== "object") return {};
  const b = body as MetaResponse & { data?: MetaResponse };
  if (b.items || b.missing || b.unavailable) return b;
  return b.data && typeof b.data === "object" ? b.data : {};
}

/** 그 모듈을 세션 동안 끄는 실패인가 — 404·401·403·연결 실패. 요청 취소(AbortError)와 그 밖의 HTTP 오류(5xx 등)는 끄지 않는다. */
function disablesModule(err: unknown): boolean {
  if (err instanceof HttpError) return err.status === 404 || err.status === 401 || err.status === 403;
  return !(err instanceof Error && err.name === "AbortError");
}

async function flush(batch: Batch): Promise<void> {
  const s = state();
  const gen = batch.generation;
  const pendingKey = `${batch.kind}\u0000${batch.module}`;
  if (s.pending.get(pendingKey) === batch) s.pending.delete(pendingKey);
  const keys = [...batch.keys];
  const result = new Map<string, unknown>();
  try {
    if (gen === s.generation && !s.disabled.has(batch.module)) {
      const path = `/api/${encodeURIComponent(batch.module)}/mdmMeta/${batch.kind}`;
      const body = batch.kind === "columns" ? { names: keys } : { domainIds: keys };
      const res = unwrap(await postJsonNoRedirect<unknown>(path, body));
      if (gen === s.generation) {
        const expiresAt = Date.now() + MDM_META_TTL_MS;
        const items = res.items ?? {};
        const unavailable = new Set(res.unavailable ?? []);
        const missing = new Set(res.missing ?? []);
        for (const k of keys) {
          let value: unknown = UNKNOWN;
          if (Object.prototype.hasOwnProperty.call(items, k) && items[k] != null) value = items[k];
          else if (missing.has(k)) value = null;
          else if (unavailable.has(k)) value = UNKNOWN;
          if (value !== UNKNOWN) {
            s.cache.set(keyOf(batch.kind, batch.module, k), { value, expiresAt });
            result.set(k, value);
          }
        }
      }
    }
  } catch (err) {
    if (gen === s.generation && disablesModule(err)) s.disabled.add(batch.module);
  } finally {
    batch.resolve(result);
    for (const k of keys) {
      const ik = keyOf(batch.kind, batch.module, k);
      // 이 묶음이 건 진행 중 표시만 지운다(그 사이 리셋 뒤 새 요청이 건 것은 둔다).
      if (gen === s.generation) s.inflight.delete(ik);
    }
  }
}

function enqueue(kind: Kind, module: string, key: string): Promise<unknown> {
  const s = state();
  const pendingKey = `${kind}\u0000${module}`;
  let batch = s.pending.get(pendingKey);
  if (!batch) {
    let resolve: (m: Map<string, unknown>) => void = () => {};
    const promise = new Promise<Map<string, unknown>>((r) => {
      resolve = r;
    });
    const created: Batch = { kind, module, keys: new Set(), generation: s.generation, promise, resolve };
    s.pending.set(pendingKey, created);
    setTimeout(() => void flush(created), MDM_META_BATCH_MS);
    batch = created;
  }
  batch.keys.add(key);
  const p = batch.promise.then((m) => m.get(key));
  s.inflight.set(keyOf(kind, module, key), p);
  return p;
}

function peek(kind: Kind, module: string, key: string): unknown {
  const s = state();
  const ck = keyOf(kind, module, key);
  const e = s.cache.get(ck);
  if (!e) return UNKNOWN;
  if (e.expiresAt <= Date.now()) {
    s.cache.delete(ck);
    return UNKNOWN;
  }
  return e.value;
}

async function request<T>(kind: Kind, module: string, keys: string[]): Promise<Map<string, T | null>> {
  const out = new Map<string, T | null>();
  const m = module?.trim();
  if (!m) return out;
  const s = state();
  if (s.disabled.has(m)) return out;
  const uniq = [...new Set(keys.map((k) => (typeof k === "string" ? k.trim() : "")).filter(Boolean))];
  const waits: Promise<void>[] = [];
  for (const k of uniq) {
    const cached = peek(kind, m, k);
    if (cached !== UNKNOWN) {
      out.set(k, cached as T | null);
      continue;
    }
    const p = s.inflight.get(keyOf(kind, m, k)) ?? enqueue(kind, m, k);
    waits.push(
      p.then((v) => {
        if (v !== UNKNOWN) out.set(k, v as T | null);
      })
    );
  }
  if (waits.length > 0) await Promise.all(waits);
  // 응답 순서와 무관하게 요청 순서대로 돌려준다.
  const ordered = new Map<string, T | null>();
  for (const k of uniq) if (out.has(k)) ordered.set(k, out.get(k)!);
  return ordered;
}

/** 컬럼 메타를 물리명으로 받는다. 키 = 물리명, null = MDM 에 없음, 키 없음 = 알 수 없음. */
export function requestColumns(module: string, physNames: string[]): Promise<Map<string, MdmScreenColumn | null>> {
  return request<MdmScreenColumn>("columns", module, physNames);
}

/** 도메인 메타를 도메인 ID 로 받는다. 키 = 도메인 ID, null = MDM 에 없음. */
export function requestDomains(module: string, domainIds: string[]): Promise<Map<string, MdmDomainMeta | null>> {
  return request<MdmDomainMeta>("domains", module, domainIds);
}

/** 보관 중인 컬럼 메타(동기). undefined = 아직 모름(안 받았거나 만료·unavailable). */
export function peekColumn(module: string, physName: string): MdmScreenColumn | null | undefined {
  return peek("columns", module, physName) as MdmScreenColumn | null | undefined;
}

/** 보관 중인 도메인 메타(동기). undefined = 아직 모름. */
export function peekDomain(module: string, domainId: string): MdmDomainMeta | null | undefined {
  return peek("domains", module, domainId) as MdmDomainMeta | null | undefined;
}

/** 404·401·403·연결 실패로 세션 동안 끈 모듈인가. */
export function isModuleDisabled(module: string): boolean {
  return state().disabled.has(module);
}

/** 시험용 — 보관·진행 중·끈 모듈을 모두 비운다. */
export function resetMdmMetaStore(): void {
  const s = state();
  s.generation += 1;
  s.cache.clear();
  s.inflight.clear();
  s.pending.clear();
  s.disabled.clear();
}
