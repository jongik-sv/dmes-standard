/**
 * OASIS 프록시 진입점 — PR 2 big-bang 컨벤션.
 *
 * URL: `/api/{module}/oasis/{serviceId}/{action}`
 *  - 운영: BFF 가 BACKEND_API_URL(=Nginx 게이트웨이)로 보내고 Nginx 가 모듈별 라우팅
 *  - 개발: MCM_WAS_URL/MPN_WAS_URL/MES_WAS_URL/MPP_WAS_URL/MQC_WAS_URL 가 있으면 BFF 가 직접 모듈별로 라우팅
 *  - 매핑이 없는 모듈은 BACKEND_API_URL 로 fallback
 *
 * BFF→BE: `${module_url}/oasis/{serviceId}/{action}` (oasis segment 그대로 유지)
 *
 * 환경변수 예시:
 *  운영 (.env.production):
 *    BACKEND_API_URL=http://internal-nginx
 *
 *  개발 (.env.local):
 *    MCM_WAS_URL=http://localhost:8080
 *    MPN_WAS_URL=http://localhost:8081
 *    MES_WAS_URL=http://localhost:8082
 *    MPP_WAS_URL=http://localhost:8083
 *    MQC_WAS_URL=http://localhost:8084
 */
import type { NextRequest } from "next/server";
import { createOasisProxyHandler } from "@dk-oasis/shared/oasis-proxy";
import { getBffAuthContext } from "@/lib/http/bff-auth";
import { invalidateRole, invalidateAll } from "@/lib/auth/api-permission-cache";

/** 빈 문자열/undefined 키를 제거해 매핑이 모두 비어있으면 undefined 반환 */
function pickEnv(obj: Record<string, string | undefined>): Record<string, string> | undefined {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value && value.trim()) result[key] = value.trim();
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export const POST = createOasisProxyHandler<NextRequest>({
  getAuthContext: getBffAuthContext,
  backendApiUrl: process.env.BACKEND_API_URL ?? "http://localhost:8080",
  backendApiUrlByModule: pickEnv({
    mcm: process.env.MCM_WAS_URL,
    mpn: process.env.MPN_WAS_URL,
    mes: process.env.MES_WAS_URL,
    mpp: process.env.MPP_WAS_URL,
    mqc: process.env.MQC_WAS_URL,
    mls: process.env.MLS_WAS_URL,
  }),
  backendClientKey: process.env.BACKEND_CLIENT_KEY,
  invalidateRole,
  invalidateAll,
});
