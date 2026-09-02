/**
 * 신규 컨벤션 catch-all 프록시 — RBAC-PATH-CONVENTION.
 *
 * URL: `/api/{module}/{objId}/{action}` (또는 그 하위)
 *  - 노출: `/api/mpn/plant/search`
 *  - 전달(WAS 직결): `${MPN_WAS_URL}/api/mpn/plant/search`  (full path 유지)
 *  - 전달(게이트웨이): `${BACKEND_API_URL}/mpn/api/mpn/plant/search`  (`/{module}` prefix 부착 → Nginx 라우팅)
 */
import { forwardToBackend } from "@/lib/http/be-proxy";
import { NextRequest } from "next/server";

async function proxyToBackend(
  req: NextRequest,
  context: { params: Promise<{ module: string; path: string[] }> }
) {
  const params = await context.params;
  return forwardToBackend(req, params.module, req.nextUrl.pathname);
}

export const GET = proxyToBackend;
export const POST = proxyToBackend;
export const PUT = proxyToBackend;
export const PATCH = proxyToBackend;
export const DELETE = proxyToBackend;
export const HEAD = proxyToBackend;
export const OPTIONS = proxyToBackend;
