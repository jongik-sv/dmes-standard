/**
 * Query 프록시 진입점 — Phase 7 신규 컨벤션.
 *
 * URL: `/api/{module}/query/{queryId}` → BE `${module_url}/query/{queryId}`
 *  - 의미: MyBatis 등 BE-side 미리 정의된 query 호출.
 *  - 인증/환경변수 정책은 `lib/http/be-proxy.ts` 참조 (rest 프록시와 동일).
 */
import type { NextRequest } from "next/server";
import { encodeSegment, forwardToBackend } from "@/lib/http/be-proxy";

async function handler(
  req: NextRequest,
  context: { params: Promise<{ module: string; queryId: string }> },
) {
  const { module: moduleId, queryId } = await context.params;
  const backendPath = `/query/${encodeSegment(queryId)}`;
  return forwardToBackend(req, moduleId, backendPath);
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
export const OPTIONS = handler;
