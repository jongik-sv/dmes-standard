/**
 * 공통 OASIS 프록시 — 모든 BFF 가 재사용하는 catch-all 라우트 핸들러.
 *
 * URL 컨벤션 (PR 2 big-bang 전환):
 *   - 노출(UI→BFF): `/api/{module}/oasis/{serviceId}/{action}`
 *   - 전달(BFF→BE): `${module_url}/oasis/{serviceId}/{action}` (그대로 유지)
 *
 * 특징:
 *  - 단일 catch-all 라우트로 모든 OASIS 호출 처리
 *  - 의존(인증 컨텍스트, 권한 캐시 무효화)은 factory 로 주입 → portal/aps/mes 앱이 동일 코드 재사용
 *  - Backend 응답 성공 시 권한 변경 자동 무효화 (P-A 훅)
 *  - 인증 헤더 3 종 전달: `X-Client-Key`, `X-Authenticated-User`, `X-Authenticated-Role`
 *  - module·serviceId·action 은 {@link OASIS_NAME_PATTERN}(영문·숫자·밑줄) 밖이면 400 — BE URL 경로 이동 차단(2026-10-03)
 *
 * <p><b>BFF↔BE 신뢰 채널 모델</b> — 사용자 JWT(Authorization Bearer)는 더 이상 forward 하지 않는다.
 * X-Client-Key 가 shared secret 으로 BFF 신뢰를 증명하고, 사용자 컨텍스트는 헤더 2종으로
 * 전달한다. BE 의 ClientKeyFilter 가 두 헤더로 SecurityContext 사전 인증을 set 한다.
 */
import { NextResponse } from "next/server";

export interface OasisProxyAuthContext {
  userId: string;
  /** 사용자의 단일 역할 (구 컨벤션 호환). roles 가 없을 때 fallback. */
  role?: string;
  /** 사용자의 역할 목록 (다중 역할 지원). 콤마 join 으로 `X-Authenticated-Role` 헤더에 전달. */
  roles?: string[];
  /** 사용자 표시명(한글) — X-Authenticated-User-Name 헤더로 전달(URL 인코딩). */
  userName?: string;
}

/**
 * @typeParam TReq - 각 앱의 NextRequest 타입.
 *   pnpm dedupe 이슈로 next 패키지가 여러 인스턴스로 설치될 수 있어
 *   shared 내부에서 next/server 의 NextRequest 를 직접 import 하면
 *   portal/app 측 NextRequest 와 nominal mismatch 가 발생한다.
 *   그래서 caller 가 자기 NextRequest 를 generic 으로 전달하도록 한다.
 *   Request 표준 메서드(text, headers 등)만 사용하므로 동작상 문제 없음.
 */
export interface OasisProxyDeps<TReq extends Request = Request> {
  /** NextAuth 세션에서 userId/backendAccessToken/role 을 추출. null 이면 401 응답. */
  getAuthContext: (req: TReq) => Promise<OasisProxyAuthContext | null>;
  /**
   * Backend 호출 base URL.
   *  - 운영: Nginx 게이트웨이 단일 URL (예: `http://internal-nginx`)
   *    Nginx 가 path prefix(`/portal/`, `/aps/`, ...)로 모듈별 WAS 로 라우팅한다.
   *    BFF 는 모듈 토폴로지에 무관심.
   *  - 개발 fallback: `backendApiUrlByModule` 에 매핑이 없는 모듈은 이 URL 로 보냄.
   */
  backendApiUrl: string;
  /**
   * 개발용 모듈 → WAS URL 매핑 (옵셔널).
   *  - 키가 있으면 우선 사용, 없으면 `backendApiUrl` fallback.
   *  - 운영에서는 비워두면 됨 → 모든 모듈이 backendApiUrl(=Nginx)로 감.
   *  - 로컬에서 mcm-was(:8080) + mpn-was(:8081) 를 같이 띄우는 시나리오 등.
   *
   * 예시 (.env.local):
   * ```env
   * MCM_WAS_URL=http://localhost:8080
   * MPN_WAS_URL=http://localhost:8081
   * MES_WAS_URL=http://localhost:8082
   * ```
   */
  backendApiUrlByModule?: Record<string, string>;
  /** ClientKeyFilter 검증 시크릿. 비어있으면 헤더 부착 안 함 (개발 편의). */
  backendClientKey?: string;
  /** 권한 캐시 무효화 (역할별). 옵셔널 — mcm 모듈에만 해당. */
  invalidateRole?: (roleId: string) => void;
  /** 권한 캐시 전체 무효화. 옵셔널 — mcm 모듈에만 해당. */
  invalidateAll?: () => void;
}

/**
 * Catch-all OASIS 프록시 POST 핸들러를 생성한다.
 *
 * URL: `/api/{module}/oasis/{serviceId}/{action}`
 *  - module 세그먼트는 라우트 매처(`[module]`)를 통해 들어온다.
 *  - 전달 URL: `${module_url}/oasis/{serviceId}/{action}` (BFF 는 oasis segment 그대로 유지)
 *
 * 사용 예:
 * ```ts
 * // portal/app/api/[module]/oasis/[serviceId]/[action]/route.ts
 * import { createOasisProxyHandler } from "@dk-oasis/shared/oasis-proxy";
 * import { getBffAuthContext } from "@/lib/http/bff-auth";
 * import { invalidateRole, invalidateAll } from "@/lib/auth/api-permission-cache";
 *
 * export const POST = createOasisProxyHandler({
 *   getAuthContext: getBffAuthContext,
 *   backendApiUrl: process.env.BACKEND_API_URL ?? "http://localhost:8080",
 *   backendClientKey: process.env.BACKEND_CLIENT_KEY,
 *   invalidateRole,
 *   invalidateAll,
 * });
 * ```
 */
export function createOasisProxyHandler<TReq extends Request = Request>(
  deps: OasisProxyDeps<TReq>
) {
  return async function POST(
    req: TReq,
    context: {
      params: Promise<{ module: string; serviceId: string; action: string }>;
    }
  ): Promise<Response> {
    const params = await context.params;
    const moduleId = params.module;
    const { serviceId, action } = params;
    // 경로 조각 검사 — 라우트 매처가 넘기는 값은 디코드된 값이라 `search%2F..%2F..%2FnoticeMgmt%2Fsave` 가
    // action=`search/../../noticeMgmt/save` 로 들어온다. 그대로 BE URL 에 붙이면 fetch 가 `..` 를 정리해 proxy 의 권한 판정
    // (원래 경로 접두)과 다른 BE 서비스(`/oasis/noticeMgmt/save`)를 부른다(2026-10-03 보안 지적). 이름 규칙 밖이면 BE 를 부르지 않는다.
    if (!isOasisName(moduleId) || !isOasisName(serviceId) || !isOasisName(action)) {
      return NextResponse.json(
        { success: false, error: { code: "BAD_REQUEST", message: "잘못된 OASIS 경로입니다." } },
        { status: 400 }
      );
    }

    const auth = await deps.getAuthContext(req);
    if (!auth) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "인증이 필요합니다." } },
        { status: 401 }
      );
    }

    const body = await req.text();

    // 모듈별 URL 결정:
    //  - 개발: backendApiUrlByModule[moduleId] 가 명시된 경우 → 직접 모듈 WAS 호출
    //    (예: MPN_WAS_URL=http://localhost:8081 → http://localhost:8081/oasis/...)
    //  - 운영: 단일 게이트웨이(backendApiUrl=Nginx)로 폴백.
    //    Nginx 가 path prefix(`/portal/`, `/mpn/`, ...)로 모듈별 WAS 라우팅 하므로
    //    fallback 시 path 에 `/{moduleId}/` prefix 를 반드시 끼워야 함.
    //    (예: BACKEND_API_URL=http://internal-nginx →
    //         http://internal-nginx/mpn/oasis/{serviceId}/{action})
    // BFF→BE: oasis segment 는 그대로 유지 (PR 2 big-bang 전환 컨벤션)
    // 매핑은 자기 키만 본다 — `constructor` 같은 이름이 Object 원형의 값을 집지 않게 한다.
    // 이름은 위에서 검사했지만 붙일 때도 인코딩한다(검사 규칙이 넓어져도 경로 구분자가 새지 않게).
    const byModule = deps.backendApiUrlByModule;
    const explicitWasUrl =
      byModule && Object.prototype.hasOwnProperty.call(byModule, moduleId)
        ? byModule[moduleId]
        : undefined;
    const servicePath = `oasis/${encodeURIComponent(serviceId)}/${encodeURIComponent(action)}`;
    const url = explicitWasUrl
      ? `${explicitWasUrl}/${servicePath}`
      : `${deps.backendApiUrl}/${encodeURIComponent(moduleId)}/${servicePath}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (deps.backendClientKey) {
      headers["X-Client-Key"] = deps.backendClientKey;
    }
    if (auth.userId) {
      headers["X-Authenticated-User"] = auth.userId;
    }
    if (auth.userName) {
      // 한글 표시명은 HTTP 헤더 토큰 규칙 위반 → URL 인코딩 후 전달, BE 가 디코딩한다.
      headers["X-Authenticated-User-Name"] = encodeURIComponent(auth.userName);
    }
    const roleHeader =
      auth.roles && auth.roles.length > 0 ? auth.roles.join(",") : auth.role;
    if (roleHeader) {
      headers["X-Authenticated-Role"] = roleHeader;
    }

    const backendRes = await fetch(url, {
      method: "POST",
      headers,
      body,
    });

    const responseBuf = await backendRes.arrayBuffer();

    // 권한 변경 자동 무효화 (응답 성공 시에만)
    if (backendRes.ok) {
      try {
        const responseText = new TextDecoder("utf-8").decode(responseBuf);
        const parsed: unknown = JSON.parse(responseText);
        if (isSuccessResponse(parsed)) {
          handleCacheInvalidation(serviceId, action, body, deps);
        }
      } catch {
        // 응답 파싱 실패해도 원본 응답은 그대로 반환
      }
    }

    return new NextResponse(responseBuf, {
      status: backendRes.status,
      headers: {
        "Content-Type":
          backendRes.headers.get("Content-Type") ?? "application/json; charset=utf-8",
      },
    });
  };
}

/**
 * OASIS 경로 조각(module·serviceId·action) 이름 규칙 — 영문·숫자·밑줄만.
 * BE 서비스 이름(BPMN process id)·action·모듈 이름이 모두 이 규칙 안이다(2026-10-03 전수 확인).
 * `/`·`\`·`.`·`%`·`;` 가 들어갈 길이 없어 BE URL 에서 경로가 바뀌지 않는다.
 */
export const OASIS_NAME_PATTERN = /^[A-Za-z0-9_]+$/;

function isOasisName(value: unknown): value is string {
  return typeof value === "string" && OASIS_NAME_PATTERN.test(value);
}

/**
 * CactusResponse 의 meta.success 가 true 인지 확인.
 */
function isSuccessResponse(parsed: unknown): boolean {
  if (typeof parsed !== "object" || parsed === null) return false;
  const meta = (parsed as { meta?: { success?: unknown } }).meta;
  return meta?.success === true;
}

/**
 * 요청 body 에서 무효화 대상 roleId 를 추출해 캐시를 정리한다.
 *
 * - secRolePerm/save → 모든 행에서 roleId 수집 → 각각 invalidateRole
 * - secRole/save     → rowStatus=D 인 행만 invalidateRole
 * - secPerm/save     → permScript 변경은 여러 역할에 영향 → invalidateAll
 * - 그 외            → 캐시와 무관 (skip)
 */
interface CacheInvalidators {
  invalidateRole?: (roleId: string) => void;
  invalidateAll?: () => void;
}

function handleCacheInvalidation(
  serviceId: string,
  action: string,
  requestBody: string,
  deps: CacheInvalidators
): void {
  if (action !== "save") return;
  if (!deps.invalidateRole && !deps.invalidateAll) return;

  let req: unknown;
  try {
    req = JSON.parse(requestBody);
  } catch {
    return;
  }

  const masterRows = extractMasterRows(req);

  switch (serviceId) {
    case "secRolePerm": {
      if (!deps.invalidateRole) break;
      const roleIds = new Set<string>();
      for (const row of masterRows) {
        const roleId = getStringField(row, "roleId");
        if (roleId) roleIds.add(roleId);
      }
      for (const roleId of roleIds) {
        deps.invalidateRole(roleId);
        console.log(`[oasis-proxy] invalidateRole(${roleId}) — secRolePerm/save`);
      }
      break;
    }
    case "secRole": {
      if (!deps.invalidateRole) break;
      for (const row of masterRows) {
        const rowStatus = getStringField(row, "rowStatus");
        if (rowStatus !== "D") continue;
        const roleId = getStringField(row, "roleId");
        if (roleId) {
          deps.invalidateRole(roleId);
          console.log(`[oasis-proxy] invalidateRole(${roleId}) — secRole/save (delete)`);
        }
      }
      break;
    }
    case "secPerm": {
      if (deps.invalidateAll) {
        deps.invalidateAll();
        console.log("[oasis-proxy] invalidateAll() — secPerm/save");
      }
      break;
    }
    default:
      // secUserRole, secObj, secMenu, secFavorite 등은 권한 캐시와 무관
      break;
  }
}

/**
 * CactusRequest 의 grids.master.rows 배열 추출.
 */
function extractMasterRows(req: unknown): Array<Record<string, unknown>> {
  if (typeof req !== "object" || req === null) return [];
  const grids = (req as { grids?: unknown }).grids;
  if (typeof grids !== "object" || grids === null) return [];
  const master = (grids as { master?: unknown }).master;
  if (typeof master !== "object" || master === null) return [];
  const rows = (master as { rows?: unknown }).rows;
  if (!Array.isArray(rows)) return [];
  return rows.filter(
    (row): row is Record<string, unknown> => typeof row === "object" && row !== null
  );
}

function getStringField(obj: Record<string, unknown>, field: string): string | undefined {
  const value = obj[field];
  return typeof value === "string" ? value : undefined;
}
