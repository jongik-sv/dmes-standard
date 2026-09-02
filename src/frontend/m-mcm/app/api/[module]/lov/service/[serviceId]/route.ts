/**
 * LoV Service 프록시 진입점 — Phase 7 신규 컨벤션.
 *
 * URL: `/api/{module}/lov/service/{serviceId}` → BE `${module_url}/lov/service/{serviceId}`
 *  - 의미: LoV service 계층 호출 (가공/필터/권한 등이 필요한 LoV).
 *  - 인증/환경변수 정책은 `lib/http/be-proxy.ts` 참조.
 */
import type { NextRequest } from "next/server";
import { encodeSegment, forwardToBackend } from "@/lib/http/be-proxy";

async function handler(
  req: NextRequest,
  context: { params: Promise<{ module: string; serviceId: string }> },
) {
  const { module: moduleId, serviceId } = await context.params;
  const backendPath = `/lov/service/${encodeSegment(serviceId)}`;
  return forwardToBackend(req, moduleId, backendPath);
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
export const OPTIONS = handler;
