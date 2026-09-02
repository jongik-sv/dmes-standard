/**
 * BFF 서버 권한 캐시 (방식 C) — userId → 권한키 집합.
 *
 * <p>토큰(쿠키)에 perms 를 싣지 않고(쿠키 크기 회피), BFF 가 사용자별 권한키를 메모리에 캐시한다.
 * `proxy.ts` 가 RBAC 멤버십 검사 직전에 {@link getUserPerms} 를 호출 → 캐시 미스/만료 시
 * BE `/api/sec/perm-keys` 를 신뢰채널(X-Client-Key + X-Authenticated-User)로 lazy load.
 *
 * <p><b>신선도 모델 (정정 2026-06-12):</b>
 * <ul>
 *   <li><b>TTL {@link #TTL_MS}(60초)</b> — 본 게이팅 캐시(미들웨어 런타임)의 유일한 갱신 수단.</li>
 *   <li><b>BE 백스톱</b> — 권한을 UI(secPerm/secRole/... save)로 바꾸면 BE 가 {@code RoleChangedEvent} 로
 *       자기 UserPermCache 를 즉시 비운다. 따라서 <b>회수(revocation)는 BE 가 즉시 차단</b>(BFF 가 stale 로
 *       통과시켜도 BE 가 403). 부여(grant)는 BFF TTL(≤60초) 후 반영.</li>
 * </ul>
 *
 * <p><b>왜 즉시 무효화가 안 되나:</b> Next.js 에서 미들웨어(`proxy.ts`, Edge 번들)와 라우트 핸들러
 * (oasis-proxy/internal route, Node 번들)는 <b>서로 다른 런타임/모듈 인스턴스</b>다. 따라서 라우트에서
 * {@link invalidateRole}/{@link invalidateAll} 를 호출해도 <b>미들웨어의 cache Map 은 비워지지 않는다</b>
 * (각 인스턴스의 로컬 Map 만 clear). 즉 게이팅 캐시는 TTL + BE 백스톱으로만 신선도를 보장한다.
 * 인스턴스 간 즉시 무효화가 필요하면 Redis Pub/Sub 등 외부 공유 저장소가 필요(미구현).
 *
 * <p>로드 실패/타임아웃 시: 만료된 캐시가 있으면 그 값으로 graceful degrade(BE 백스톱이 안전망),
 * 없으면 빈 배열 → fail-closed(403) + 다음 요청 재시도.
 */

const BACKEND_CLIENT_KEY = process.env.BACKEND_CLIENT_KEY;
/** 캐시 TTL — 게이팅 캐시의 유일한 갱신 수단이므로 짧게(60초). 부여 반영 지연 상한 = TTL. */
const TTL_MS = 60 * 1000;
/** BE perm-keys 조회 타임아웃 — BE 지연/행 시 미들웨어가 무한 대기하지 않도록. */
const LOAD_TIMEOUT_MS = 4000;

interface CacheEntry {
  perms: string[];
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<string[]>>();

export interface PermAuthContext {
  /** X-Authenticated-Role 헤더용 (BE ClientKeyFilter 사전인증). */
  roles?: string[];
}

/** mcm BE base URL — 개발 MCM_WAS_URL 직결 / 운영 BACKEND_API_URL + `/mcm` prefix (be-proxy 와 동일 규약). */
function backendUrl(path: string): string {
  const wasUrl = process.env.MCM_WAS_URL?.trim();
  if (wasUrl) return `${wasUrl}${path}`;
  const base = (process.env.BACKEND_API_URL ?? "http://localhost:8080").trim();
  return `${base}/mcm${path}`;
}

/**
 * userId 의 허용 권한키 배열을 반환. 캐시 히트(유효) 시 즉시, 미스/만료 시 BE lazy load.
 * 같은 userId 동시 요청은 in-flight Promise 공유로 BE 1회만 호출.
 */
export async function getUserPerms(userId: string, ctx: PermAuthContext = {}): Promise<string[]> {
  if (!userId) return [];
  const hit = cache.get(userId);
  if (hit && hit.expiresAt > Date.now()) return hit.perms;

  let pending = inflight.get(userId);
  if (!pending) {
    // 만료된 hit 은 로드 실패 시 graceful degrade 폴백으로 전달.
    pending = loadOne(userId, ctx, hit).finally(() => inflight.delete(userId));
    inflight.set(userId, pending);
  }
  return pending;
}

async function loadOne(
  userId: string,
  ctx: PermAuthContext,
  stale: CacheEntry | undefined,
): Promise<string[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOAD_TIMEOUT_MS);
  try {
    const res = await fetch(backendUrl("/api/sec/perm-keys"), {
      method: "GET",
      headers: {
        "X-Client-Key": BACKEND_CLIENT_KEY ?? "",
        "X-Authenticated-User": userId,
        "X-Authenticated-Role": (ctx.roles ?? []).join(","),
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      return degrade(userId, stale, `status=${res.status}`);
    }
    const body: unknown = await res.json();
    const data = (body as { data?: { permKeys?: unknown } } | null)?.data;
    const perms = Array.isArray(data?.permKeys)
      ? (data.permKeys as unknown[]).filter((k): k is string => typeof k === "string")
      : [];
    cache.set(userId, { perms, expiresAt: Date.now() + TTL_MS });
    return perms;
  } catch (e) {
    // AbortError(타임아웃) 포함.
    return degrade(userId, stale, e instanceof Error ? e.message : String(e));
  } finally {
    clearTimeout(timer);
  }
}

/** 로드 실패 — 만료 캐시가 있으면 그 값(graceful degrade, BE 백스톱이 안전망), 없으면 빈 배열(fail-closed). */
function degrade(userId: string, stale: CacheEntry | undefined, reason: string): string[] {
  console.warn(
    `[RBAC] perm-keys 로드 실패 user=${userId} (${reason}) → ${stale ? "만료캐시 폴백" : "fail-closed []"}`,
  );
  return stale ? stale.perms : [];
}

/**
 * [주의] 본 함수는 <b>호출된 런타임(라우트 핸들러)의 로컬 cache 인스턴스만</b> 비운다.
 * 미들웨어(`proxy.ts`)의 게이팅 캐시는 별도 런타임이라 비워지지 않는다(모듈 doc 참조).
 * 게이팅 신선도는 TTL + BE 백스톱이 담당한다. oasis-proxy/internal route 의 기존 호출부 호환을 위해 유지.
 */
export function invalidateRole(_roleId: string): void {
  cache.clear();
}

/** [주의] 호출 런타임 로컬 인스턴스만 clear (위 invalidateRole 주석 참조). */
export function invalidateAll(): void {
  cache.clear();
}
