/**
 * Next.js Proxy — 포탈 인증 보호 + API 권한 검증 (BFF RBAC 방식 C — 서버 캐시).
 *
 * 판정 로직은 순수 모듈 `@dk-oasis/shared/auth-rbac-policy` 의 {@link evaluateApiPolicy} 에 위임
 * (단위테스트 대상). 본 파일은 미들웨어 plumbing(self-fetch 가드 / 세션 토큰 조회 / 응답 매핑)만 담당.
 * 권한키는 토큰이 아니라 BFF 서버 캐시(`getUserPerms`, BE `/api/sec/perm-keys` lazy load)에서 가져온다.
 *
 * 경로 분류 (평가순서):
 *   1) /portal/*        → 인증 보호 (미인증 시 /login)
 *   2) PUBLIC           → 완전 공개 (로그인 등)
 *   3) 세션 없음        → 401
 *   4) AUTH_ONLY        → 인증만 (내 메뉴/즐겨찾기)
 *   5) LoV              → 인증만 (콤보/필터)
 *   6) RBAC 3패턴       → 서버캐시 권한키 멤버십 검증 (미보유 403) — SYSADMIN 프리패스 제거
 *                         (2026-07-30, 롤 무관 멤버십. BE 브레이크글라스 시 perm-keys=["*"] 로 전면 통과)
 *   7) 미매칭           → RBAC_DEFAULT_DENY=true 면 403, 아니면 통과 (aps/mpn/kmc rest 등)
 */
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { createPortalAuthProxy } from "@dk-oasis/shared/auth-proxy";
import {
  evaluateApiPolicy,
  parseRbacKey,
  type RbacPolicyConfig,
} from "@dk-oasis/shared/auth-rbac-policy";
import { getUserPerms } from "@/lib/auth/api-permission-cache";

const AUTH_SECRET = process.env.AUTH_SECRET;
const AUTH_COOKIE_PREFIX = process.env.AUTH_COOKIE_PREFIX ?? "oasis-mcm-auth";
const SESSION_COOKIE_NAME = `${AUTH_COOKIE_PREFIX}.session-token`;

/**
 * mcm BFF RBAC 정책.
 *  - PUBLIC: NextAuth/로그인 진입점.
 *  - AUTH_ONLY: 내 메뉴/권한/버튼엔드포인트/즐겨찾기 — 로그인만 되면 누구나(서비스 레이어가 본인 데이터 필터).
 *  - LoV: 모듈 무관 `/lov/*` (master/query/service) — cross-domain 콤보/필터 옵션.
 *  - unmatchedDeny: 지금 false(query·service 통과 — rest 는 신경로 규약 `/rest/{objId}/{action}/**` 로 RBAC 편입, 2026-07-28). 마이그레이션 후 `RBAC_DEFAULT_DENY=true` 로 전면차단.
 */
const RBAC_POLICY: RbacPolicyConfig = {
  publicPrefixes: ["/api/auth/", "/api/mcm/auth/"],
  authOnlyPrefixes: [
    "/api/mcm/oasis/secUser/myMenus", // myMenus, myMenusTree
    "/api/mcm/oasis/secUser/myPermissions",
    "/api/mcm/oasis/secUser/myButtonEndpoints",
    "/api/mcm/oasis/secFavorite/search",
    "/api/mcm/oasis/secFavorite/toggle",
    "/api/mcm/oasis/secFavorite/addFolder", // 사이드바 즐겨찾기 그룹 추가
    "/api/mcm/oasis/secFavorite/deleteFolder", // 사이드바 즐겨찾기 그룹 삭제
    // 포털 알림(STOMP push) 스택 도입 시 아래 2건을 추가한다 — BE 의 AUTH_ONLY 접두 목록과 동기화할 것.
    //   "/api/mcm/oasis/ntfNotification/"  알림 조회/읽음 처리
    //   "/api/mcm/notify/ws-ticket"        WS 단명 티켓 발급 (본인 티켓)
  ],
  lovPattern: /^\/api\/[^/]+\/lov\//,
  unmatchedDeny: process.env.RBAC_DEFAULT_DENY === "true",
};

// 포탈 페이지 인증 보호 (shared 제공)
const portalAuthProxy = createPortalAuthProxy({
  authCookiePrefix: AUTH_COOKIE_PREFIX,
  authSecret: process.env.AUTH_SECRET,
  nextAuthUrl: process.env.NEXTAUTH_URL,
});

function jsonError(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // 1) /portal/* → 인증 보호, /login → 만료·복호화불가 세션 쿠키 정리
  //    (AUTH_SECRET 이 바뀌면 남은 세션 쿠키를 못 풀어 next-auth 가 요청마다
  //     JWT_SESSION_ERROR "decryption operation failed" 를 콘솔에 찍는다.
  //     portalAuthProxy 가 그 쿠키를 즉시 만료시켜 스스로 회복하게 한다.)
  if (path.startsWith("/portal") || path === "/login") {
    return portalAuthProxy(req);
  }

  if (!path.startsWith("/api/")) {
    return NextResponse.next();
  }

  // 2-0) BFF 자기참조(oasis-client.ts → BFF) 무한루프 방지.
  //       서버 내부 self-fetch 만 X-Internal-Bff-Call 헤더를 부착하므로 안전.
  if (req.headers.get("x-internal-bff-call") === "1") {
    return NextResponse.next();
  }

  // PUBLIC 은 세션 조회 없이 통과 (login 등). 그 외엔 세션 토큰 필요.
  const isPublic = RBAC_POLICY.publicPrefixes.some((p) => path.startsWith(p));
  const token = isPublic
    ? null
    : await getToken({ req, secret: AUTH_SECRET, cookieName: SESSION_COOKIE_NAME });

  // 방식 C — RBAC 멤버십 단계에서만 BFF 서버 캐시(getUserPerms)로 사용자 권한키를 lazy load.
  const verdict = await evaluateApiPolicy(path, token, RBAC_POLICY, (uid) =>
    getUserPerms(uid, {
      roles: Array.isArray(token?.roles) ? (token.roles as string[]) : [],
    }),
  );
  const userId = typeof token?.sub === "string" ? token.sub : "anonymous";
  switch (verdict) {
    case "unauthorized":
      return jsonError("UNAUTHORIZED", "인증이 필요합니다.", 401);
    case "forbidden-perm": {
      // 권한 없어 차단된 요청 — 어떤 사용자가 어떤 권한키(=module/objId/action)를 못 가졌는지 콘솔 기록.
      const permKey = parseRbacKey(path);
      console.warn(
        `[RBAC] 403 권한없음 — user=${userId} ${req.method} ${path} permKey=${permKey ?? "?"} (action=${permKey?.split("/").pop() ?? "?"})`,
      );
      return jsonError("FORBIDDEN", "접근 권한이 없습니다.", 403);
    }
    case "forbidden-unmatched":
      console.warn(`[RBAC] 403 미등록경로 — user=${userId} ${req.method} ${path}`);
      return jsonError("FORBIDDEN", "등록되지 않은 경로입니다.", 403);
    case "pass":
    default:
      return NextResponse.next();
  }
}

export const config = {
  matcher: ["/portal/:path*", "/login", "/api/:path*"],
};
