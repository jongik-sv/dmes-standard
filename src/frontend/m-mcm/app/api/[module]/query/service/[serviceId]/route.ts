/**
 * Query-via-Service 프록시 진입점 — Phase 7 신규 컨벤션.
 *
 * URL: `/api/{module}/query/service/{serviceId}` → BE `${module_url}/query/service/{serviceId}`
 *  - 의미: 조회용이지만 service 계층(권한·캐시·후처리)을 거쳐야 하는 호출.
 *  - 인증/환경변수 정책은 `lib/http/be-proxy.ts` 참조.
 */
import type { NextRequest } from "next/server";
import { encodeSegment, forwardToBackend } from "@/lib/http/be-proxy";

async function handler(
  req: NextRequest,
  context: { params: Promise<{ module: string; serviceId: string }> },
) {
  const { module: moduleId, serviceId } = await context.params;
  const backendPath = `/query/service/${encodeSegment(serviceId)}`;
  return forwardToBackend(req, moduleId, backendPath);
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
export const OPTIONS = handler;
