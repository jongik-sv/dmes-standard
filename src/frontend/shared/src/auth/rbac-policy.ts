/**
 * BFF RBAC 정책 — 순수 함수 (Next/React 무관, 단위테스트 대상).
 *
 * URL 을 권한키 {@code "module/objId/action"} 으로 환산하고 {@code token.perms} 멤버십으로 판정한다.
 * 설계: `docs/framework/BFF-RBAC-상세설계-구현계획.md` §3 (평가순서 / 2패턴 파서 / 토글).
 *
 * 키 포맷 = {@code module/objId/action} (소문자 3-part). OASIS 의 가운데 `oasis` 세그먼트는
 * 키에서 드롭하여 OASIS(4-seg)·컨벤션(3-seg) 이 동일 키 공간으로 합쳐진다.
 * BE {@code UserPermCache.toKeyStrings} 직렬화와 1:1 정합.
 */

/** RBAC 2패턴 파싱 시 objId 자리에 올 수 없는 예약 2번째 세그먼트. */
export const RESERVED_SECOND_SEG: ReadonlySet<string> = new Set([
  "oasis",
  "rest",
  "query",
  "service",
  "lov",
  "auth",
  "internal",
]);

/** getToken 결과 중 정책에 필요한 부분만. */
export interface PolicyToken {
  sub?: unknown;
  roles?: unknown;
  perms?: unknown;
}

export type RbacVerdict = "pass" | "unauthorized" | "forbidden-perm" | "forbidden-unmatched";

export interface RbacPolicyConfig {
  /** 완전 공개 (인증·권한 모두 skip). 예: `/api/auth/`. */
  publicPrefixes: readonly string[];
  /** 인증만 필요 (RBAC skip). 예: 내 메뉴/즐겨찾기. */
  authOnlyPrefixes: readonly string[];
  /**
   * 인증만 필요한 경로 패턴 (선택, RBAC skip). 모듈 이름처럼 접두로 적을 수 없는 자리가 있을 때 쓴다.
   * 예: `/^\/api\/[^/]+\/mdmMeta\//` — 모든 업무 모듈의 MDM 메타 캐시 엔드포인트(2026-10-02).
   */
  authOnlyPatterns?: readonly RegExp[];
  /**
   * 인증만 필요한 **읽기 전용** 경로 (선택, RBAC skip). GET·HEAD 요청이고 쿼리 문자열을 뗀 경로가 패턴에 맞을 때만 pass,
   * 그 밖 메서드(또는 메서드를 모를 때)는 일반 RBAC 판정으로 넘어간다.
   * REST 신경로처럼 접두 뒤에 임의 backendPath 를 붙일 수 있는 경로에 쓴다 — 접두가 아니라 경로 전체를 `^…$` 로
   * 고정해야 `..`·`%2e%2e`·`%2f`·`//`·다른 backendPath 로 다른 BE 엔드포인트에 빠지지 않는다.
   * 예: `/^\/api\/mcm\/rest\/widgetMedia\/file\/api\/mcm\/widgetMedia\/file\/[0-9a-f]{32}$/` — 미디어 위젯 파일 내려받기(2026-10-03).
   */
  authOnlyReadPatterns?: readonly RegExp[];
  /** LoV 경로 (인증만). 예: `/^\/api\/[^/]+\/lov\//`. */
  lovPattern: RegExp;
  /** 미매칭(2패턴 외) 경로 차단 여부. 지금 false(통과) / 추후 true(전면차단). */
  unmatchedDeny: boolean;
  /** 예약 2번째 세그먼트 (기본 {@link RESERVED_SECOND_SEG}). */
  reservedSecondSeg?: ReadonlySet<string>;
}

function normalizeRoleName(role: string): string {
  return role
    .trim()
    .replace(/^ROLE_/i, "")
    .toUpperCase();
}

/**
 * 원본 역할 배열이 허용 역할 중 하나를 포함하는지 판정한다.
 * BFF와 UI가 같은 ROLE_ 접두사/대소문자 정규화를 공유하기 위한 순수 함수다.
 */
export function hasAnyRole(roles: unknown, allowedRoles: readonly string[]): boolean {
  if (!Array.isArray(roles)) return false;
  const allowed = new Set(allowedRoles.map(normalizeRoleName));
  return roles.some((role) => typeof role === "string" && allowed.has(normalizeRoleName(role)));
}

/** "module/objId/action" 소문자 키. */
function makeKey(m: string, o: string, a: string): string {
  return `${m}/${o}/${a}`.toLowerCase();
}

/**
 * URL → 권한키. 3패턴만 키 반환, 그 외 null.
 *  - REST 신경로 4-seg+: `/api/{module}/rest/{objId}/{action}/{backendPath...}` → `module/objId/action`
 *    (2026-07-28 규약 — BFF 라우트가 objId/action 을 제외하고 backendPath 만 BE 로 전달.
 *     구 통과형 rest 는 라우트 삭제로 폐기 — 구형 4-seg+ 호출은 오인 키로 파싱돼 권한검사에서 차단된다.)
 *  - OASIS 4-seg: `/api/{module}/oasis/{serviceId}/{action}` → `module/serviceId/action`
 *  - 컨벤션 3-seg: `/api/{module}/{serviceId}/{action}`      → `module/serviceId/action` (예약어 제외)
 */
export function parseRbacKey(
  rawPath: string,
  reserved: ReadonlySet<string> = RESERVED_SECOND_SEG,
): string | null {
  const path = (rawPath ?? "").split("?")[0];
  if (!path.startsWith("/api/")) return null;
  const seg = path
    .slice(5)
    .split("/")
    .filter(Boolean)
    .map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    });

  // REST 신경로: 'rest' 는 RESERVED 목록에 남지만 본 분기가 먼저 소비 — 3-seg 검사에는 계속 예약어로 작동.
  if (seg.length >= 4 && seg[1] === "rest") return makeKey(seg[0], seg[2], seg[3]);
  if (seg.length === 4 && seg[1] === "oasis") return makeKey(seg[0], seg[2], seg[3]);
  if (seg.length === 3 && !reserved.has(seg[1])) return makeKey(seg[0], seg[1], seg[2]);
  return null;
}

/**
 * 사용자 권한키 로더 — 방식 C(BFF 서버 캐시). RBAC 멤버십 검사 직전에만 호출(lazy)되며,
 * PUBLIC/AUTH_ONLY/LoV 경로에서는 호출되지 않아 불필요한 BE 조회를 피한다.
 */
export type PermsLoader = (userId: string) => Promise<readonly string[]> | readonly string[];

/** {@link RbacPolicyConfig.authOnlyReadPatterns} 가 여는 메서드. */
const READ_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD"]);

/**
 * `/api/*` 경로 RBAC 판정. (self-fetch 헤더 처리는 호출측 미들웨어에서 선행.)
 *
 * 평가 순서: PUBLIC → 세션(401) → AUTH_ONLY(접두·패턴·읽기 전용 패턴) → LoV → RBAC 3패턴 → 미매칭(토글).
 * RBAC 단계에서만 {@link PermsLoader} 로 사용자 권한키를 lazy load 하여 멤버십 검사.
 * SYSADMIN 프리패스 제거 (2026-07-30) — 롤 무관 멤버십 판정. BE 브레이크글라스
 * (mcm.security.sysadmin-freepass=true) 시 로더가 ["*"] 를 반환해 전면 통과로 복원된다.
 *
 * @param method HTTP 메서드. {@link RbacPolicyConfig.authOnlyReadPatterns} 판정에만 쓴다 — 없으면 읽기로 보지 않는다(fail-closed).
 */
export async function evaluateApiPolicy(
  path: string,
  token: PolicyToken | null | undefined,
  config: RbacPolicyConfig,
  loadPerms: PermsLoader,
  method?: string,
): Promise<RbacVerdict> {
  if (config.publicPrefixes.some((p) => path.startsWith(p))) return "pass";

  if (!token || typeof token.sub !== "string" || token.sub.length === 0) return "unauthorized";

  if (config.authOnlyPrefixes.some((p) => path.startsWith(p))) return "pass";
  if (config.authOnlyPatterns?.some((re) => re.test(path))) return "pass";
  if (config.authOnlyReadPatterns && method && READ_METHODS.has(method.toUpperCase())) {
    const pathOnly = path.split("?")[0];
    if (config.authOnlyReadPatterns.some((re) => re.test(pathOnly))) return "pass";
  }
  if (config.lovPattern.test(path)) return "pass";

  const rbacKey = parseRbacKey(path, config.reservedSecondSeg);
  if (rbacKey !== null) {
    const perms = await loadPerms(token.sub);
    // "*" = BE 브레이크글라스(sysadmin-freepass=true) 전용 와일드카드 통로 — 평시 실키 멤버십만.
    return perms.includes("*") || perms.includes(rbacKey) ? "pass" : "forbidden-perm";
  }

  return config.unmatchedDeny ? "forbidden-unmatched" : "pass";
}
