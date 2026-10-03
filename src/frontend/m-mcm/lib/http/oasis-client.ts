/**
 * MCM OASIS 서비스를 서버 코드(Route Handler·server component·server action)에서 사용자 대신 부르는 유틸리티.
 *
 * <p>BFF 를 다시 부르지 않고 BE 를 바로 부른다(2026-10-03 보안 지적으로 바꿈). 옛 방식은 자기 BFF 를
 * `X-Internal-Bff-Call: 1` + `X-Authenticated-*` 로 다시 불렀는데, BFF 가 그 헤더를 믿으려면 브라우저가 붙인 같은 헤더도
 * 믿게 되어 로그인하지 않은 사용자도 아무 사용자로 BE 를 부를 수 있었다. 이제 BFF 는 요청 헤더의 사용자 정보를 믿지 않는다.
 *
 * <p>전달 규칙은 공통 OASIS 프록시(app/api/[module]/oasis/…/route.ts, shared oasis-proxy)와 같다.
 *  - `MCM_WAS_URL` 이 있으면 `${MCM_WAS_URL}/oasis/{serviceId}/{action}` (개발)
 *  - 없으면 `${BACKEND_API_URL}/mcm/oasis/{serviceId}/{action}` (운영 — 게이트웨이가 모듈 접두로 라우팅)
 *
 * <p>인증 모델 — BFF↔BE 는 shared secret(X-Client-Key) 신뢰 채널이다. caller 가 넘긴 사용자 컨텍스트(userId, roles)를
 * X-Authenticated-User / X-Authenticated-Role 헤더로 붙인다. 사용자 컨텍스트는 반드시 서버가 확인한 값(세션)이어야 한다.
 *
 * <p>BFF 라우트를 거치지 않으므로 shared oasis-proxy 의 저장 후 권한 캐시 무효화 훅(secRolePerm·secRole·secPerm save)도
 * 돌지 않는다. 권한을 바꾸는 저장은 화면이 BFF 라우트로 부르거나 BE RoleChangedEvent → /api/mcm/internal/cache/invalidate-role 에 맡긴다.
 */

function mcmOasisUrl(serviceId: string, action: string): string {
  const path = `/oasis/${encodeURIComponent(serviceId)}/${encodeURIComponent(action)}`;
  const wasUrl = process.env.MCM_WAS_URL?.trim();
  if (wasUrl) return `${wasUrl}${path}`;
  const backendApiUrl = process.env.BACKEND_API_URL?.trim() || "http://localhost:8080";
  return `${backendApiUrl}/mcm${path}`;
}

export interface CactusRequest {
  meta?: { userId?: string; menuId?: string };
  params?: Record<string, unknown>;
  grids?: Record<string, { rows: Record<string, unknown>[] }>;
}

interface CactusMeta {
  txId: string;
  success: boolean;
  code: string;
  message?: string;
}

export interface CactusResponse {
  meta: CactusMeta;
  data?: Record<string, unknown>;
  grids?: Record<string, { rows: Record<string, unknown>[] }>;
}

/** OASIS 호출자 사용자 컨텍스트 — BE 인증 헤더(X-Authenticated-*)로 전달된다. */
export interface OasisAuthContext {
  userId: string;
  roles?: string[];
}

/**
 * MCM OASIS 서비스를 BE 로 바로 호출한다.
 * POST {MCM_WAS_URL}/oasis/{serviceId}/{action} 또는 {BACKEND_API_URL}/mcm/oasis/{serviceId}/{action}
 *
 * @param serviceId   BPMN 서비스 ID (예: "secUser")
 * @param action      액션 (예: "search", "save")
 * @param request     CactusRequest body
 * @param authContext 호출자 사용자 컨텍스트 (userId 필수, roles 권장).
 *                    X-Authenticated-User / X-Authenticated-Role 헤더로 BE 에 전달.
 */
export async function callOasisService(
  serviceId: string,
  action: string,
  request: CactusRequest,
  authContext?: OasisAuthContext
): Promise<CactusResponse> {
  const url = mcmOasisUrl(serviceId, action);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const clientKey = process.env.BACKEND_CLIENT_KEY;
  if (clientKey) {
    headers["X-Client-Key"] = clientKey;
  }

  if (authContext?.userId) {
    headers["X-Authenticated-User"] = authContext.userId;
  }
  if (authContext?.roles && authContext.roles.length > 0) {
    headers["X-Authenticated-Role"] = authContext.roles.join(",");
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(request),
  });

  const rawText = await res.text();

  let body: CactusResponse;
  try {
    body = JSON.parse(rawText) as CactusResponse;
  } catch {
    throw new Error(`OASIS 응답 파싱 실패 (${serviceId}/${action}, status=${res.status}): ${rawText.slice(0, 200)}`);
  }

  if (!body.meta?.success) {
    throw new Error(
      body.meta?.message ?? `OASIS 호출 실패: ${serviceId}/${action} (status=${res.status})`
    );
  }

  return body;
}
