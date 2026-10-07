/**
 * Next.js Proxy — 포탈 인증 보호 + API 권한 검증 (BFF RBAC 방식 C — 서버 캐시).
 *
 * 판정 로직은 순수 모듈 `@dk-oasis/shared/auth-rbac-policy` 의 {@link evaluateApiPolicy} 에 위임
 * (단위테스트 대상). 본 파일은 미들웨어 plumbing(self-fetch 가드 / 세션 토큰 조회 / 응답 매핑)만 담당.
 * 권한키는 토큰이 아니라 BFF 서버 캐시(`getUserPerms`, BE `/api/sec/perm-keys` lazy load)에서 가져온다.
 *
 * 경로 분류 (평가순서):
 *   0) /api/* 경로 모양 → 인코딩된 `/`·`\`·`.`·`;`·점 조각이면 400 (lib/http/path-guard.ts, 아래 판정보다 먼저)
 *   1) /portal/*        → 인증 보호 (미인증 시 /login)
 *   2) PUBLIC           → 완전 공개 (로그인 등)
 *   3) 세션 없음        → 401
 *   4) AUTH_ONLY        → 인증만 (내 메뉴/즐겨찾기)
 *   4-0) 직접 실행 경로  → 늘 403 (/api/{m}/service·query·lov/query·lov/service — 권한키를 만들 수 없는 BPMN·매퍼 실행, 2026-10-07)
 *   5) LoV              → 인증만 (마스터 코드 콤보 /api/{m}/lov/master/* 만)
 *   6) RBAC 3패턴       → 서버캐시 권한키 멤버십 검증 (미보유 403) — SYSADMIN 프리패스 제거
 *                         (2026-07-30, 롤 무관 멤버십. BE 브레이크글라스 시 perm-keys=["*"] 로 전면 통과)
 *   7) 미매칭           → RBAC_DEFAULT_DENY=true 면 403, 아니면 통과 (aps/mpn/kmc rest 등)
 *   (예외) /api/mcm/internal/cache/invalidate-role → 서버 간 호출 전용. 세션·RBAC 대신 BE → BFF 전용 비밀(X-Bff-Internal-Secret =
 *         BFF_INTERNAL_SECRET)만 본다(lib/http/internal-call.ts). BFF → BE 마스터 비밀(BACKEND_CLIENT_KEY·X-Client-Key)은 여기서 받지
 *         않는다. /api/mcm/internal/ 아래 다른 경로는 404.
 *   그 밖 경로는 어떤 요청 헤더로도 위 검사를 건너뛰지 않는다 — 옛 `x-internal-bff-call: 1` 통과는 브라우저도 붙일 수 있어 없앴다
 *   (2026-10-03 보안 지적: 세션 없이 그 헤더와 X-Authenticated-* 를 붙이면 /api/{module}/oasis/* 를 아무 사용자로 BE 에 보낼 수 있었다).
 *
 * 본문 상한(lib/http/body-limit.ts): 이 proxy 가 도는 요청은 Next 가 본문을 proxyClientMaxBodySize(10MB)까지 메모리에
 * 복제한다. 미디어 올리기(100MB) 한 경로만 matcher 에서 빼고, 그 전용 라우트가 {@link guardApiRequest} 로 같은 검사를 한다.
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
import { authCookiePrefix, sessionCookieName } from "@/lib/auth/session-cookie";
import { API_BODY_MAX_BYTES, declaredBodyExceeds } from "@/lib/http/body-limit";
import {
  INTERNAL_API_PREFIX,
  INTERNAL_INVALIDATE_ROLE_PATH,
  isTrustedInternalCall,
} from "@/lib/http/internal-call";
import { isUnsafeApiPath } from "@/lib/http/path-guard";

const AUTH_SECRET = process.env.AUTH_SECRET;

/**
 * mcm BFF RBAC 정책.
 *  - PUBLIC: NextAuth/로그인 진입점.
 *  - AUTH_ONLY: 내 메뉴/권한/버튼엔드포인트/즐겨찾기/기본 화면 — 로그인만 되면 누구나(서비스 레이어가 본인 데이터 필터).
 *  - denyPatterns: cactus 직접 실행 경로 `/api/{m}/service/*`·`/query/*`(query/service 포함)·`/lov/query/*`·`/lov/service/*` — 늘 403.
 *    요청이 고른 BPMN 을 고정 action(execute·query·lov)으로, 또는 매퍼 statement 를 그대로 실행하는데 권한키를 만들 수 없어
 *    로그인만 한 사용자에게 열려 있었다(2026-10-07 보안 지적 — POST /api/mdm/service/codeEdit 로 마루 코드 폐기). 화면 사용처 0건.
 *    BE 는 cactus.inbound.service-routes·query-routes(기본 꺼짐)와 mcm EndpointPermissionFilter.isDirectRoute 가 같은 경로를 막는다.
 *    경로를 켜는 회차에서 이 자리를 권한키 판정으로 바꾼다(query-route 설계 §4 S2: /query/{objId}.{action} → module/objId/action).
 *  - LoV: 모듈 무관 `/lov/master/*` — cross-domain 마스터 코드 콤보 옵션(인증만).
 *  - unmatchedDeny: 지금 false(rest 는 신경로 규약 `/rest/{objId}/{action}/**` 로 RBAC 편입, 2026-07-28). 마이그레이션 후 `RBAC_DEFAULT_DENY=true` 로 전면차단.
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
    "/api/mcm/oasis/secStartPgm/search", // 포털 기본 화면 조회 (BE EndpointPermissionFilter 와 동기화)
    "/api/mcm/oasis/secStartPgm/toggle", // 탭 우클릭 기본 화면 등록/해제
    // 화면 사용 구간 기록(포털 PortalShell) — 로그인한 모든 사용자. 서버가 인증 정보로 사용자·부서를 채운다.
    // BE EndpointPermissionFilter.AUTH_ONLY_OBJ_ACTION_PREFIXES 의 "screenusage/record" 와 동기화.
    "/api/mcm/oasis/screenUsage/record",
    "/api/mcm/oasis/secWidget/", // 포털 홈 위젯 탭·배치(본인 데이터, 5 action 전부) — BE EndpointPermissionFilter 와 동기화
    // 조회 칸 사용자 기본값(본인 데이터, search·savePage·resetPage, 설계 2026-10-07-search-defaults §5.3) — BE EndpointPermissionFilter 와 동기화.
    "/api/mcm/oasis/secSrchDflt/",
    // 위젯 B·C·D 사용자용(스펙 2026-10-02-widget-admin-generic §5.1) — BE EndpointPermissionFilter 와 동기화.
    // 관리자용 commWidgetMng(정의 저장·SQL 미리보기·기본 배치·미디어 올리기)은 메뉴 RBAC 이라 여기 넣지 않는다.
    "/api/mcm/oasis/widgetDef/list", // 위젯 정의 목록 + 부서 기준 「홈」 기본 배치
    "/api/mcm/oasis/widgetData/run", // 쿼리 위젯 실행 — defId 만 받는다
    "/api/mcm/oasis/widgetExt/", // 환율·날씨
    "/api/mcm/oasis/widgetChat/", // AI 챗봇(본인 대화)
    "/api/mcm/oasis/widgetMemo/", // 메모장 위젯 개인 메모(본인 메모, load·save)
    // 미디어 파일 내려받기는 접두가 아니라 아래 authOnlyReadPatterns 로 연다(REST 신경로라 접두 뒤에 임의 BE 경로를 붙일 수 있다).
    // 포털 홈 공지 목록(noticeBoard, 10-07 mls→mcm 이전) — 로그인한 모든 사용자. 서비스가 현재 사용자 역할로 게시 대상을 거른다
    // (본인 기준 데이터). 조회 action 하나만 연다 — noticeBoard 에는 쓰기 action 이 없다. BE EndpointPermissionFilter 와 동기화.
    "/api/mcm/oasis/noticeBoard/search",
    // 조업 계산기 위젯(MDM ruleCalc, 2026-10-06) — 로그인한 모든 사용자. 세 action(view·execute·search)만 연다. BE EndpointPermissionFilter 와 동기화.
    "/api/mdm/oasis/ruleCalc/view",
    "/api/mdm/oasis/ruleCalc/execute",
    "/api/mdm/oasis/ruleCalc/search", // 룰·세트 ID 찾기(편집기용)
    // 포털 알림(STOMP push) 스택 도입 시 아래 2건을 추가한다 — BE 의 AUTH_ONLY 접두 목록과 동기화할 것.
    //   "/api/mcm/oasis/ntfNotification/"  알림 조회/읽음 처리
    //   "/api/mcm/notify/ws-ticket"        WS 단명 티켓 발급 (본인 티켓)
  ],
  // MDM 메타 캐시(2026-10-02) — 모든 업무 모듈의 cactus 엔드포인트 /api/{module}/mdmMeta/*. 모듈 이름과 무관한 한 규칙이라 새 모듈이
  // 캐시를 켜도 여기를 고치지 않는다. 화면 메타(columns·domains)는 로그인한 모든 사용자, 관리(status·entries·entry·load)는 각 모듈
  // MdmMetaController 가 SYSADMIN 을 다시 본다. mcm BE EndpointPermissionFilter 의 AUTH_ONLY(/api/mcm/mdmMeta/)와 동기화.
  authOnlyPatterns: [/^\/api\/[^/]+\/mdmMeta\//],
  // 미디어 위젯 파일 내려받기(스펙 2026-10-02-widget-admin-generic §5.1) → BE GET /api/mcm/widgetMedia/file/{fileId}.
  // GET·HEAD 이고 경로 전체가 이 모양일 때만 인증만 본다(fileId = 서버가 만든 32자 소문자 16진수, widget-types/media/media.ts).
  // 접두로 열면 로그인만 한 사용자가 `…/widgetMedia/file/<다른 BE 경로>` 로 메뉴 RBAC 를 건너뛴다(2026-10-03 보안 지적).
  // 그 밖 메서드·모양은 RBAC(권한키 mcm/widgetmedia/file — 아무에게도 없다)로 403. BE EndpointPermissionFilter 와 동기화.
  authOnlyReadPatterns: [/^\/api\/mcm\/rest\/widgetMedia\/file\/api\/mcm\/widgetMedia\/file\/[0-9a-f]{32}$/],
  denyPatterns: [/^\/api\/[^/]+\/(?:service|query|lov\/(?:query|service))(?:\/|$)/],
  lovPattern: /^\/api\/[^/]+\/lov\/master\//,
  unmatchedDeny: process.env.RBAC_DEFAULT_DENY === "true",
};

// 포탈 페이지 인증 보호 (shared 제공)
const portalAuthProxy = createPortalAuthProxy({
  authCookiePrefix: authCookiePrefix(),
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

  // 2-0) 경로 모양 — 인코딩된 `/`·`\`·`.`·`;`(이중 인코딩 포함)·날 `\`·`;`·점 조각은 권한 판정보다 먼저 400.
  //      아래 판정은 원래 경로의 접두를 보는데 라우트는 디코드한 조각으로 BE URL 을 만들어, 섞이면 둘이 보는 경로가 갈라진다
  //      (`…/noticeBoard/search%2F..%2F..%2FnoticeMgmt%2Fsave` → BE /oasis/noticeMgmt/save, 2026-10-03 보안 지적. lib/http/path-guard.ts).
  if (isUnsafeApiPath(path)) {
    return jsonError("BAD_REQUEST", "허용되지 않는 경로 형식입니다.", 400);
  }

  // 2-1) 본문 상한 — Next 는 상한을 넘는 본문을 잘라서 라우트로 넘기므로(body-streams.js), Content-Length 로 미리 413 을 준다.
  //       메모리 상한은 이 검사가 아니라 next.config 의 proxyClientMaxBodySize 가 지킨다(복제는 proxy 실행 전에 시작된다).
  if (declaredBodyExceeds(req.headers, API_BODY_MAX_BYTES)) {
    return jsonError("PAYLOAD_TOO_LARGE", "요청 본문이 너무 큽니다(최대 10MB).", 413);
  }

  // 2-2) 서버 간 내부 경로(BE RoleChangedEventListener → 권한 캐시 무효화) — 세션 없는 서버 호출이라 사용자 RBAC 대신
  //       BE → BFF 전용 비밀(X-Bff-Internal-Secret = BFF_INTERNAL_SECRET)을 본다. 틀리거나 없으면 로그인한 사용자여도 403.
  //       마스터 비밀 X-Client-Key 로는 열리지 않는다. 라우트가 한 번 더 본다.
  //       여는 경로는 무효화 정확 경로 하나뿐 — internal 아래 다른 경로는 비밀이 맞아도 404(catch-all 로 BE 까지 가지 않게).
  if (path.startsWith(INTERNAL_API_PREFIX)) {
    if (path !== INTERNAL_INVALIDATE_ROLE_PATH) {
      return jsonError("NOT_FOUND", "없는 경로입니다.", 404);
    }
    return isTrustedInternalCall(req.headers)
      ? NextResponse.next()
      : jsonError("FORBIDDEN", "내부 호출 전용 경로입니다.", 403);
  }

  return (await guardApiRequest(req)) ?? NextResponse.next();
}

/**
 * /api/* 인증·권한 판정(위 2~7단계). 막을 때는 401·403 응답, 통과면 null.
 * proxy 와 matcher 에서 뺀 미디어 올리기 라우트가 함께 쓴다 — 정책이 한 곳에만 있게 한다.
 * 내부 경로(/api/mcm/internal/*) 판정은 proxy 에만 있다. 요청 헤더로 이 검사를 건너뛰는 길은 없다.
 */
export async function guardApiRequest(req: NextRequest): Promise<NextResponse | null> {
  const path = req.nextUrl.pathname;

  // PUBLIC 은 세션 조회 없이 통과 (login 등). 그 외엔 세션 토큰 필요.
  // 쿠키 이름은 NextAuth 와 같은 함수로 정한다 — https 면 `__Secure-` 쿠키만 읽는다(lib/auth/session-cookie.ts).
  const isPublic = RBAC_POLICY.publicPrefixes.some((p) => path.startsWith(p));
  const token = isPublic
    ? null
    : await getToken({ req, secret: AUTH_SECRET, cookieName: sessionCookieName() });

  // 방식 C — RBAC 멤버십 단계에서만 BFF 서버 캐시(getUserPerms)로 사용자 권한키를 lazy load.
  // req.method 는 authOnlyReadPatterns(읽기 전용 AUTH_ONLY) 판정에 쓴다 — 빠뜨리면 그 경로가 RBAC 403 이 된다.
  const verdict = await evaluateApiPolicy(
    path,
    token,
    RBAC_POLICY,
    (uid) =>
      getUserPerms(uid, {
        roles: Array.isArray(token?.roles) ? (token.roles as string[]) : [],
      }),
    req.method,
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
    case "forbidden-route":
      console.warn(`[RBAC] 403 막힌 경로 — user=${userId} ${req.method} ${path}`);
      return jsonError("FORBIDDEN", "허용되지 않는 경로입니다.", 403);
    case "pass":
      return null;
    default:
      // 모르는 판정은 막는다(fail-closed) — 판정 종류를 더하고 여기를 빠뜨려도 통과하지 않게.
      console.warn(`[RBAC] 403 알 수 없는 판정(${String(verdict)}) — user=${userId} ${req.method} ${path}`);
      return jsonError("FORBIDDEN", "접근 권한이 없습니다.", 403);
  }
}

/**
 * /api/* 중 미디어 올리기 한 경로(widget-types/media/upload.ts MEDIA_UPLOAD_URL)만 뺀다 — 그 경로는 본문을 복제·절단하지 않고
 * 전용 라우트(app/api/mcm/rest/commWidgetMng/upload/api/mcm/commWidgetMng/upload/route.ts)가 guardApiRequest 뒤 BE 로 흘려보낸다.
 * 반드시 경로 전체를 `$` 로 고정한다 — 접두만 빼면 `…/upload/api/<다른 BE 경로>` 가 일반 rest 라우트로 가서 RBAC 를 건너뛴다.
 * Next 는 원 경로·디코드한 경로 중 하나라도 맞으면 proxy 를 돌리고 대소문자를 가린다(resolve-routes.js, middleware-route-matcher.js)
 * — 빠지는 것은 이 문자열과 글자까지 같은 경로 하나뿐이다. tests/http/proxy-body-limit.test.ts 가 Next 의 matcher 해석기로 확인한다.
 */
export const config = {
  matcher: [
    "/portal/:path*",
    "/login",
    "/api/((?!mcm/rest/commWidgetMng/upload/api/mcm/commWidgetMng/upload$).*)",
  ],
};
