/**
 * BFF → BE 공통 프록시 헬퍼.
 *
 * Phase 7 신규 BFF 라우트(`/api/{module}/{query|service|lov}/...`) 6 종이 공유한다.
 * 기존 `/api/{module}/rest/[...path]/route.ts` 와 동일한 인증/환경변수 정책을 따른다.
 *
 * 정책 요약:
 *  - 환경변수 `${MODULE}_WAS_URL` 가 있으면 모듈 WAS 직접 호출 (개발).
 *    그 경우 path prefix 없음.
 *  - 없으면 `BACKEND_API_URL` (Nginx 게이트웨이) 로 fallback.
 *    Nginx 가 `/{moduleId}/...` prefix 로 모듈 라우팅하므로 prefix 를 붙인다.
 *  - 인증 헤더 4 종: `Authorization: Bearer ...`, `X-Client-Key`,
 *    `X-Authenticated-User`, `X-Authenticated-Role`.
 *  - 401 → JSON 에러 응답.
 *  - request/response body 는 Web Stream으로 전달하며 BFF가 payload 전체를 복제하지 않는다.
 *  - endpoint 종류별 timeout, client disconnect abort, 204 본문 없음.
 */
import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";
import { hasAnyRole } from "@dk-oasis/shared/auth-rbac-policy";

const BACKEND_API_URL = process.env.BACKEND_API_URL ?? "http://localhost:8080";
const BACKEND_CLIENT_KEY = process.env.BACKEND_CLIENT_KEY;

const AUTH_SECRET = process.env.AUTH_SECRET;
const AUTH_COOKIE_PREFIX = process.env.AUTH_COOKIE_PREFIX ?? "oasis-mcm-auth";
const SESSION_COOKIE_NAME = `${AUTH_COOKIE_PREFIX}.session-token`;

const BACKEND_UNAVAILABLE_MESSAGE =
  "백엔드 서버와 연결할 수 없습니다. 서버 실행 상태 또는 네트워크를 확인한 뒤 다시 시도해 주세요.";
const BACKEND_TIMEOUT_MESSAGE = "백엔드 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.";
const SCENARIO_FINALIZE_ROLES = ["ADMIN", "PLANNER"] as const;
const DEFAULT_TIMEOUT_MS = 2 * 60 * 1000;
const EXPORT_TIMEOUT_MS = 5 * 60 * 1000;
const LONG_RUNNING_TIMEOUT_MS = 30 * 60 * 1000;

export function backendTimeoutMs(method: string, backendPath: string): number {
  if (
    /(?:\/export(?:\/|$)|\/download(?:\/|$))/.test(backendPath)
  ) {
    return EXPORT_TIMEOUT_MS;
  }
  if (
    method !== "GET" &&
    /(?:\/planning-runs|\/scheduling-runs|\/simulations|\/recalculate-all|\/optimize)(?:\/|$)/.test(
      backendPath,
    )
  ) {
    return LONG_RUNNING_TIMEOUT_MS;
  }
  return DEFAULT_TIMEOUT_MS;
}

export interface BackendBase {
  baseUrl: string;
  modulePathPrefix: string;
}

/**
 * 모듈 ID → BFF→BE base URL 결정.
 * - 개발: `${MODULE.toUpperCase()}_WAS_URL` 가 있으면 직접 모듈 WAS 호출 (prefix 없음)
 * - 운영: `BACKEND_API_URL` 단일 fallback. path 에 `/{moduleId}` prefix 강제.
 */
export function resolveBackendBase(moduleId: string): BackendBase {
  const envKey = `${moduleId.toUpperCase()}_WAS_URL`;
  const wasUrl = process.env[envKey];
  if (wasUrl && wasUrl.trim()) {
    return { baseUrl: wasUrl.trim(), modulePathPrefix: "" };
  }
  return { baseUrl: BACKEND_API_URL, modulePathPrefix: `/${moduleId}` };
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error
    ? (error as { name?: unknown }).name === "AbortError"
    : false;
}

function backendConnectionErrorResponse(error: unknown): NextResponse {
  const timeout = isAbortError(error);
  const code = timeout ? "BACKEND_TIMEOUT" : "BACKEND_UNAVAILABLE";
  const message = timeout ? BACKEND_TIMEOUT_MESSAGE : BACKEND_UNAVAILABLE_MESSAGE;
  const detail = error instanceof Error ? error.message : String(error);

  console.error(`[BFF] ${code}: ${detail}`);
  return NextResponse.json(
    {
      success: false,
      error: { code, message },
    },
    { status: timeout ? 504 : 502 }
  );
}

/**
 * Upstream body를 한 chunk씩 전달한다. downstream 취소 시 reader와 fetch controller를 함께
 * 취소하고, 정상 종료/오류에서도 timeout/listener 정리를 정확히 한 번 수행한다.
 */
export function streamBackendResponse(
  upstream: ReadableStream<Uint8Array>,
  controller: AbortController,
  cleanup: () => void,
): ReadableStream<Uint8Array> {
  const reader = upstream.getReader();
  let closed = false;
  const closeOnce = () => {
    if (closed) return;
    closed = true;
    cleanup();
  };
  return new ReadableStream<Uint8Array>({
    async pull(target) {
      try {
        const result = await reader.read();
        if (result.done) {
          target.close();
          closeOnce();
          return;
        }
        target.enqueue(result.value);
      } catch (error) {
        target.error(error);
        closeOnce();
      }
    },
    async cancel(reason) {
      controller.abort(reason);
      try {
        await reader.cancel(reason);
      } finally {
        closeOnce();
      }
    },
  });
}

/**
 * 공통 BE 프록시 실행 함수.
 *
 * @param req       원본 NextRequest
 * @param moduleId  URL path 의 `{module}` 부분
 * @param backendPath  BE 엔드포인트 path (선행 `/` 포함). 예: `/query/{queryId}`,
 *                     `/lov/master/{code}/{group}`
 */
export async function forwardToBackend(
  req: NextRequest,
  moduleId: string,
  backendPath: string
): Promise<NextResponse> {
  if (!BACKEND_CLIENT_KEY) {
    console.error("[BFF] BACKEND_CLIENT_KEY 환경변수가 설정되지 않았습니다.");
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "서버 설정 오류입니다." } },
      { status: 500 }
    );
  }

  const token = await getToken({ req, secret: AUTH_SECRET, cookieName: SESSION_COOKIE_NAME });
  if (!token) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "인증이 필요합니다." } },
      { status: 401 }
    );
  }

  const tokenRoles = Array.isArray(token.roles) ? token.roles : [];
  const isScenarioFinalize =
    req.method === "POST" &&
    moduleId.toLowerCase() === "mpn" &&
    /^\/api\/scenarios\/[^/]+\/finalize$/.test(backendPath);
  if (isScenarioFinalize && !hasAnyRole(tokenRoles, SCENARIO_FINALIZE_ROLES)) {
    return NextResponse.json(
      { success: false, error: { code: "FORBIDDEN", message: "시나리오 확정 권한이 없습니다." } },
      { status: 403 }
    );
  }

  const { baseUrl, modulePathPrefix } = resolveBackendBase(moduleId);
  const search = req.nextUrl.search ?? "";
  const url = `${baseUrl}${modulePathPrefix}${backendPath}${search}`;

  // BFF↔BE 는 shared secret(X-Client-Key) 신뢰 채널 — 사용자 JWT 는 더 이상 forward 하지 않는다.
  // 사용자 컨텍스트는 X-Authenticated-User / X-Authenticated-Role 헤더로만 전달.
  // BE 의 ClientKeyFilter 가 두 헤더를 받아 SecurityContext 에 사전 인증을 set 한다.
  const roles = tokenRoles
    .filter((role): role is string => typeof role === "string")
    .map((role) => role.trim().replace(/^ROLE_/i, "").toUpperCase())
    .filter(Boolean);
  const fallbackRole =
    typeof token.role === "string"
      ? token.role.trim().replace(/^ROLE_/i, "").toUpperCase()
      : "";
  const roleHeader = roles.length > 0 ? roles.join(",") : fallbackRole;
  const headers: Record<string, string> = {
    "X-Client-Key": BACKEND_CLIENT_KEY,
    "X-Authenticated-User": (token.sub as string) ?? "",
    "X-Authenticated-Role": roleHeader,
  };
  const contentType = req.headers.get("content-type");
  if (contentType) {
    headers["Content-Type"] = contentType;
  }

  const body =
    req.method !== "GET" && req.method !== "HEAD" ? req.body : undefined;

  // 일반 JSON은 2분, export/download는 5분, 실제 장기 실행 mutation만 30분을 허용한다.
  // 원 요청이 끊기면 같은 controller를 abort해 backend fetch에도 취소를 전파한다.
  const controller = new AbortController();
  const abortForClientDisconnect = () => controller.abort();
  req.signal.addEventListener("abort", abortForClientDisconnect, {
    once: true,
  });
  const timeout = setTimeout(
    () => controller.abort(),
    backendTimeoutMs(req.method, backendPath),
  );
  let responseStreamOwnsCleanup = false;
  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    clearTimeout(timeout);
    req.signal.removeEventListener("abort", abortForClientDisconnect);
  };
  try {
    const fetchInit: RequestInit & { duplex?: "half" } = {
      method: req.method,
      headers,
      body,
      signal: controller.signal,
    };
    if (body) {
      // Node.js fetch가 ReadableStream request body를 받을 때 필요한 명시 옵션.
      fetchInit.duplex = "half";
    }
    const res = await fetch(url, fetchInit);

    if (res.status === 204) {
      cleanup();
      return new NextResponse(null, { status: 204 });
    }

    const responseHeaders = new Headers();
    for (const name of [
      "content-type",
      "content-disposition",
      "cache-control",
      "etag",
      "last-modified",
      "content-language",
    ]) {
      const value = res.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    if (!responseHeaders.has("content-type")) {
      responseHeaders.set(
        "content-type",
        "application/json; charset=utf-8",
      );
    }

    const responseBody = res.body
      ? streamBackendResponse(res.body, controller, cleanup)
      : null;
    responseStreamOwnsCleanup = responseBody !== null;
    if (!responseBody) cleanup();
    return new NextResponse(responseBody, {
      status: res.status,
      headers: responseHeaders,
    });
  } catch (error) {
    cleanup();
    return backendConnectionErrorResponse(error);
  } finally {
    if (!responseStreamOwnsCleanup) cleanup();
  }
}

/**
 * URL path 의 1 개 segment 를 안전하게 인코딩한다.
 * 빈 문자열 / undefined 는 빈 문자열로 처리한다.
 */
export function encodeSegment(seg: string | undefined): string {
  if (!seg) return "";
  return encodeURIComponent(seg);
}

/**
 * catch-all path segment 배열을 인코딩하여 `/`-join 한다.
 * 빈 배열 / undefined 는 빈 문자열을 반환한다.
 */
export function encodeSegments(segs: string[] | undefined): string {
  if (!segs || segs.length === 0) return "";
  return segs.map((s) => encodeURIComponent(s)).join("/");
}
