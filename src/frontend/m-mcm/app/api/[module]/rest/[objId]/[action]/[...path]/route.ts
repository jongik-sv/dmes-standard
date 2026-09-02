/**
 * REST 신경로 프록시 — RBAC 규약 `/api/{module}/rest/{objId}/{action}/{backendPath}`.
 * (설계: docs/framework/BFF-RBAC-REST-신경로규약-상세설계.md, 2026-07-28)
 *
 *  - objId/action 은 RBAC permKey(`{module}/{objId}/{action}`) 재료 — 미들웨어(proxy.ts →
 *    evaluateApiPolicy → parseRbacKey)가 라우트 도달 전에 멤버십을 검사한다.
 *  - BE 전달 시 objId/action 을 제외하고 backendPath 만 전달한다 (BE 컨트롤러 무수정).
 *    예: `/api/mpn/rest/plannedOrderMng/search/api/planned-orders?page=0`
 *        → BE `${MPN_WAS_URL}/api/planned-orders?page=0`
 *  - 구 통과형 rest 라우트(`rest/[...path]`)는 삭제됨 — 구형 호출은 미들웨어 403(오인 permKey)
 *    또는 형제 catch-all 폴백 후 BE 404 로 실패한다(의도 — 미이행 호출부 즉시 노출).
 */
import { encodeSegments, forwardToBackend } from "@/lib/http/be-proxy";
import { NextRequest, NextResponse } from "next/server";

async function proxyToBackend(
  req: NextRequest,
  context: {
    params: Promise<{ module: string; objId: string; action: string; path: string[] }>;
  }
) {
  const { module, path } = await context.params;
  if (!path || path.length === 0) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "BAD_REQUEST", message: "backendPath(원 BE 경로)가 없습니다." },
      },
      { status: 400 }
    );
  }
  return forwardToBackend(req, module, `/${encodeSegments(path)}`);
}

export const GET = proxyToBackend;
export const POST = proxyToBackend;
export const PUT = proxyToBackend;
export const PATCH = proxyToBackend;
export const DELETE = proxyToBackend;
export const HEAD = proxyToBackend;
export const OPTIONS = proxyToBackend;
