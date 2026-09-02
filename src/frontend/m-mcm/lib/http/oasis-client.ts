/**
 * MCM OASIS 서비스를 호출하는 서버사이드 유틸리티 (BFF 자기참조).
 *
 * PR 2 big-bang 컨벤션:
 *  - 호출 path: `/api/mcm/oasis/{serviceId}/{action}` (BFF 경유)
 *  - BFF 가 ${MCM_WAS_URL}/oasis/{serviceId}/{action} 로 전달
 *
 * NEXTAUTH_URL 또는 같은 origin 으로 self-fetch 한다 (서버사이드 렌더링/Route 핸들러 환경).
 *
 * <p>인증 모델 — BFF↔BE 는 shared secret(X-Client-Key) 신뢰 채널이다.
 * caller 는 호출자 사용자 컨텍스트(userId, roles) 를 전달하고, 본 함수가
 * X-Authenticated-User / X-Authenticated-Role 헤더로 부착한다. self-fetch 시
 * NextAuth 쿠키가 동봉되지 않으므로 명시 전달이 필수.
 */

const SELF_BASE_URL =
  process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
const BACKEND_CLIENT_KEY = process.env.BACKEND_CLIENT_KEY ?? "";

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

/** OASIS 호출자 사용자 컨텍스트 — self-fetch 시 BE 인증 헤더로 forward 된다. */
export interface OasisAuthContext {
  userId: string;
  roles?: string[];
}

/**
 * MCM OASIS 서비스를 BFF 경유로 호출한다.
 * POST {SELF_BASE_URL}/api/mcm/oasis/{serviceId}/{action}
 *
 * @param serviceId   BPMN 서비스 ID (예: "secUser")
 * @param action      액션 (예: "search", "save")
 * @param request     CactusRequest body
 * @param authContext 호출자 사용자 컨텍스트 (userId 필수, roles 권장).
 *                    self-fetch 시 X-Authenticated-User / X-Authenticated-Role 헤더로 forward.
 */
export async function callOasisService(
  serviceId: string,
  action: string,
  request: CactusRequest,
  authContext?: OasisAuthContext
): Promise<CactusResponse> {
  const url = `${SELF_BASE_URL}/api/mcm/oasis/${serviceId}/${action}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    // BFF middleware (proxy.ts) 가 self-fetch 무한 루프를 회피하도록 internal 표식
    "X-Internal-Bff-Call": "1",
  };

  if (BACKEND_CLIENT_KEY) {
    headers["X-Client-Key"] = BACKEND_CLIENT_KEY;
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
