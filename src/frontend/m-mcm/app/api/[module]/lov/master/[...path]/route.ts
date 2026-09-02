/**
 * LoV Master Code 프록시 진입점 — Phase 7 신규 컨벤션.
 *
 * URL:
 *  - `/api/{module}/lov/master/{code}` → BE `${module_url}/lov/master/{code}`
 *  - `/api/{module}/lov/master/{code}/{group}` → BE `${module_url}/lov/master/{code}/{group}`
 *  - 의미: 시스템 마스터 코드(LoV) 조회. catch-all 로 1~2 segment 모두 수용.
 *  - 인증/환경변수 정책은 `lib/http/be-proxy.ts` 참조.
 */
import type { NextRequest } from "next/server";
import { encodeSegments, forwardToBackend } from "@/lib/http/be-proxy";

async function handler(
  req: NextRequest,
  context: { params: Promise<{ module: string; path: string[] }> },
) {
  const { module: moduleId, path } = await context.params;
  const suffix = encodeSegments(path);
  const backendPath = suffix ? `/lov/master/${suffix}` : `/lov/master`;
  return forwardToBackend(req, moduleId, backendPath);
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
export const OPTIONS = handler;
