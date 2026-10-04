import { clearCurrentUserCache } from "../portal-shell/current-user";

export class HttpError extends Error {
  public readonly status: number;
  public readonly statusText: string;
  /**
   * ADR-0054 R4(P2) — BE 표준 에러 응답의 code(예: `error.code` = "BIZ-014")가 있으면 그대로 보존한다.
   * 호출부가 메시지 텍스트가 아니라 이 코드로 특정 비즈니스 오류를 판별할 수 있게 한다(코드가 없으면
   * `status` 로 대략적인 분류만 가능 — 4xx/5xx).
   */
  public readonly code?: string;
  /**
   * BE 오류 상세(OASIS CactusResponse `errors` — cactus-core `ErrorDetail`)를 그대로 보존한다. 저장 검증(MdmValidator) 오류를 그리드·폼 칸에
   * 표시할 때 {@link toFieldErrors} 로 읽는다. 상세가 없으면 undefined.
   */
  public readonly errors?: BackendErrorDetail[];

  constructor(status: number, statusText: string, message?: string, code?: string, errors?: BackendErrorDetail[]) {
    super(message ?? `Request failed with ${status} ${statusText}`);
    this.name = "HttpError";
    this.status = status;
    this.statusText = statusText;
    this.code = code;
    this.errors = errors;
  }
}

/** BE 오류 상세 한 건 — cactus-core `ErrorDetail(grid, rowKey, rowIndex, field, code, message)`. */
export interface BackendErrorDetail {
  grid?: string | null;
  rowKey?: string | number | null;
  rowIndex?: number | null;
  field?: string | null;
  code?: string | null;
  message: string;
}

/** 칸 하나의 서버 오류 — `AgDataGrid fieldErrors` 와 폼 칸 표시가 읽는 모양(spec §4, C9). */
export interface FieldErrorItem {
  /** 요청 행의 `rowKey` 값. */
  rowKey?: string;
  /** 요청 목록에서의 자리. */
  rowIndex?: number;
  /** 요청 행의 원래 키. */
  field: string;
  message: string;
}

function errorDetailsOf(source: unknown): unknown[] | null {
  if (Array.isArray(source)) return source;
  if (source && typeof source === "object") {
    const errors = (source as { errors?: unknown }).errors;
    if (Array.isArray(errors)) return errors;
  }
  return null;
}

/**
 * 서버 오류 → 칸 오류 목록. `field` 가 있는 상세만 남긴다(검증 불가 `MDM_UNAVAILABLE` 처럼 칸이 없는 것은 메시지로 보인다).
 *
 * OASIS 서비스는 `BusinessException` 을 HTTP 200 + `meta.success=false` 봉투로 돌려주므로 {@link apiRequest} 가 던지지 않는다 —
 * 화면이 봉투를 판정해 던지는 오류에 `errors` 를 실어 두거나 봉투를 그대로 넘긴다.
 *
 * @param source `errors` 배열을 가진 값(OASIS 응답 봉투 `{ meta, errors }`, `errors` 를 실은 오류 객체, HTTP 4xx·5xx 에서
 *   {@link apiRequest} 가 던진 {@link HttpError}) 또는 상세 배열
 * @param grid 주면 그 그리드의 상세와 grid 가 없는 상세(폼 하나)만
 */
export function toFieldErrors(source: unknown, grid?: string): FieldErrorItem[] {
  const details = errorDetailsOf(source);
  if (!details) return [];
  const out: FieldErrorItem[] = [];
  for (const d of details) {
    if (!d || typeof d !== "object") continue;
    const e = d as BackendErrorDetail;
    if (typeof e.field !== "string" || e.field.length === 0) continue;
    if (grid != null && e.grid != null && e.grid !== "" && e.grid !== grid) continue;
    const item: FieldErrorItem = { field: e.field, message: typeof e.message === "string" ? e.message : "" };
    if (e.rowKey != null && e.rowKey !== "") item.rowKey = String(e.rowKey);
    if (typeof e.rowIndex === "number" && Number.isInteger(e.rowIndex)) item.rowIndex = e.rowIndex;
    out.push(rowKeyFirst(item));
  }
  return out;
}

/** 키 순서를 rowKey → rowIndex → field → message 로(로그·시험에서 읽기 쉽게). */
function rowKeyFirst(item: FieldErrorItem): FieldErrorItem {
  const { rowKey, rowIndex, field, message } = item;
  return {
    ...(rowKey !== undefined ? { rowKey } : {}),
    ...(rowIndex !== undefined ? { rowIndex } : {}),
    field,
    message,
  };
}

const NETWORK_ERROR_MESSAGE =
  "서버와 연결할 수 없습니다. 네트워크 또는 서버 상태를 확인한 뒤 다시 시도해 주세요.";
const GENERIC_REQUEST_ERROR_MESSAGE =
  "요청 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";

function getHttpFallbackMessage(status: number): string {
  if (status === 400) return "요청 값이 올바르지 않습니다. 입력값을 확인해 주세요. (HTTP 400)";
  if (status === 403) return "요청 권한이 없습니다. 권한을 확인해 주세요. (HTTP 403)";
  if (status === 404)
    return "요청한 API를 찾을 수 없습니다. 화면을 새로고침한 뒤 다시 시도해 주세요. (HTTP 404)";
  if (status >= 500)
    return `서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요. (HTTP ${status})`;
  return `요청 처리에 실패했습니다. (HTTP ${status})`;
}

function getErrorName(err: unknown): string {
  return typeof err === "object" && err !== null && "name" in err
    ? String((err as { name?: unknown }).name ?? "")
    : "";
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "";
}

function isAbortError(err: unknown): boolean {
  return getErrorName(err) === "AbortError";
}

function normalizeFetchError(err: unknown): Error {
  if (isAbortError(err)) {
    // AbortSignal은 화면 교체/언마운트의 의도적 취소에도 쓰인다. 이를 timeout 문구로
    // 덮으면 최신 요청 가드가 취소를 오류 toast로 오인하므로 AbortError identity를 보존한다.
    if (err instanceof Error) return err;
    const abort = new Error(getErrorMessage(err) || "요청이 취소되었습니다.");
    abort.name = "AbortError";
    return abort;
  }

  const message = getErrorMessage(err);
  const lowerMessage = message.toLowerCase();
  if (
    err instanceof TypeError ||
    lowerMessage.includes("failed to fetch") ||
    lowerMessage.includes("fetch failed") ||
    lowerMessage.includes("load failed") ||
    lowerMessage.includes("networkerror") ||
    lowerMessage.includes("network request failed")
  ) {
    return new Error(NETWORK_ERROR_MESSAGE);
  }

  return new Error(message.trim() || GENERIC_REQUEST_ERROR_MESSAGE);
}

export async function getJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(input, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch (err) {
    throw normalizeFetchError(err);
  }

  if (!response.ok) {
    throw new HttpError(
      response.status,
      response.statusText,
      getHttpFallbackMessage(response.status)
    );
  }

  return (await response.json()) as T;
}

/**
 * 401 에도 로그인 화면으로 보내지 않는 JSON POST — 부가 정보(MDM 화면 메타 등)처럼 실패해도 화면을 그대로 두어야 하는 호출용.
 *
 * - 인증은 {@link apiRequest} 와 같다: 저장된 `oasis_access_token` 을 Bearer 로 싣고, 쿠키는 fetch 기본(same-origin)을 따른다.
 * - `!res.ok` 면 상태를 담은 {@link HttpError}(401 포함 — 리다이렉트·force-logout 없음), 연결 실패는 일반 Error(AbortError 는 보존).
 */
export async function postJsonNoRedirect<T>(path: string, body: unknown, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init.headers as Record<string, string>) ?? {}),
  };
  let token: string | null = null;
  try {
    token = typeof window !== "undefined" ? localStorage.getItem("oasis_access_token") : null;
  } catch {
    token = null;
  }
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(path, { ...init, method: "POST", headers, body: JSON.stringify(body ?? {}) });
  } catch (err) {
    throw normalizeFetchError(err);
  }
  if (!res.ok) {
    // 실패 본문은 쓰지 않지만 버려야 한다 — 읽지도 취소하지도 않으면 브라우저가 요청을 끝난 것으로 치지 않아 연결을 잡고
    // 페이지의 networkidle 이 오지 않는다(엔드포인트 없는 모듈의 404 를 받는 MDM 화면 메타 공급자).
    try {
      await res.body?.cancel();
    } catch {
      // 이미 잠긴·닫힌 본문 — 던질 오류는 아래 HttpError 하나다.
    }
    throw new HttpError(res.status, res.statusText, getHttpFallbackMessage(res.status));
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as T;
  }
  return (await res.json()) as T;
}

/**
 * BE 표준 에러 응답 형식.
 *
 * BE 가 두 가지 응답 포맷을 사용하므로 union 으로 모두 수용한다:
 * - REST `ApiResponse` (cactus-core ApiResponse.java): top-level `success/data/message/errorCode/timestamp`
 * - OASIS `CactusResponse` (cactus-core CactusResponse.java + ResponseMeta.java + ErrorDetail):
 *   `{ meta: { txId, success, code, message }, data, grids, errors: [{ grid?, rowKey?, field?, code?, message }] }`
 * - 레거시 / 예약: `{ error: { code?, message?, fieldErrors? } }`
 */
interface ApiErrorBody {
  // 레거시/예약
  error?: {
    code?: string;
    message?: string;
    fieldErrors?: Array<{ field: string; message: string }>;
  };
  // REST ApiResponse
  success?: boolean;
  message?: string;
  errorCode?: string;
  // OASIS CactusResponse
  meta?: { code?: string; message?: string; success?: boolean };
  errors?: Array<{
    grid?: string;
    rowKey?: string;
    rowIndex?: number;
    field?: string;
    code?: string;
    message: string;
  }>;
}

/**
 * BE 응답 본문에서 사용자에게 보여줄 에러 메시지를 추출한다.
 *
 * 우선순위: `body.error.message` (레거시) → `body.message` (REST ApiResponse) →
 * `body.meta.message` (OASIS CactusResponse) → `body.errors[0].message` → `HTTP {status}` fallback.
 */
function firstNonBlankMessage(...messages: Array<string | undefined>): string | undefined {
  return messages
    .find((message) => typeof message === "string" && message.trim().length > 0)
    ?.trim();
}

function extractBackendErrorMessage(body: ApiErrorBody, status: number): string {
  return (
    firstNonBlankMessage(
      body.error?.message,
      body.message,
      body.meta?.message,
      body.errors?.[0]?.message
    ) ?? getHttpFallbackMessage(status)
  );
}

/**
 * BE 응답 본문에서 fieldErrors 를 추출한다.
 *
 * - `body.error.fieldErrors` 가 있으면 그대로 사용 (레거시)
 * - 아니면 OASIS `body.errors` 중 `field` 가 있는 항목을 매핑
 * - 둘 다 없으면 `undefined`
 */
function extractBackendFieldErrors(
  body: ApiErrorBody
): Array<{ field: string; message: string }> | undefined {
  if (body.error?.fieldErrors && body.error.fieldErrors.length > 0) {
    return body.error.fieldErrors;
  }
  if (body.errors && body.errors.length > 0) {
    const fieldOnly = body.errors
      .filter((e) => typeof e.field === "string" && e.field.length > 0)
      .map((e) => ({ field: e.field as string, message: e.message }));
    return fieldOnly.length > 0 ? fieldOnly : undefined;
  }
  return undefined;
}

/**
 * 401 응답을 받으면 NextAuth 세션을 강제 클리어한 뒤 /login 으로 리다이렉트한다.
 *
 * 무한 redirect 루프 방지가 핵심:
 *  - 백엔드 재시작 시 BFF 토큰은 무효화되지만 NextAuth JWT 쿠키는 살아있을 수 있다
 *  - 그 상태로 /login 으로 보내면 login 페이지가 "이미 인증됨" 으로 판단해 /portal 로 되돌려보내고
 *    /portal 은 다시 401 → /login → ... 무한 루프
 *  - 따라서 redirect 전에 force-logout 으로 NextAuth 쿠키와 localStorage 토큰을 모두 명시적으로 제거
 *
 * - 현재 위치를 callbackUrl 로 보존하여 로그인 후 복귀
 * - 다중 호출 시 중복 redirect 방지(이미 진행 중이면 skip)
 * - 서버 사이드(window 없음)에서는 no-op
 * - 로그인 페이지 자체에서는 무한루프 방지
 */
let redirectingToLogin = false;
export function redirectToLoginOn401(): void {
  if (typeof window === "undefined") return;
  if (redirectingToLogin) return;
  if (window.location.pathname === "/login") return;
  redirectingToLogin = true;
  // 세션이 끝났다 — 공유 사용자·RBAC 캐시를 비워 다시 로그인한 사용자에게 남지 않게 한다(K3).
  clearCurrentUserCache();

  void (async () => {
    // 1) 서버 사이드 NextAuth 쿠키 강제 삭제
    try {
      await fetch("/api/auth/force-logout", {
        method: "POST",
        credentials: "same-origin",
      });
    } catch {
      // 네트워크 실패해도 redirect는 진행
    }
    // 2) 클라이언트 사이드 access token 제거
    try {
      localStorage.removeItem("oasis_access_token");
    } catch {
      // localStorage 사용 불가 환경 무시
    }
    // 3) /login 으로 navigate (현재 경로를 callbackUrl 로 보존)
    const current = window.location.pathname + window.location.search;
    const callback = encodeURIComponent(current);
    window.location.href = `/login?callbackUrl=${callback}`;
  })();
}

/**
 * APS 백엔드 호출용 공통 fetch 래퍼.
 *
 * - oasis_access_token 자동 주입
 * - 401 → 인증 만료 메시지로 throw
 * - !res.ok → BE 표준 응답의 error.message 를 추출하여 Error throw
 *   (FE 화면은 catch한 Error.message 를 그대로 gfn_message에 넘기면 된다)
 *
 * 호출자는 응답 본문 타입을 제네릭으로 지정한다.
 *   const res = await apiRequest<ApiResponse<PlantItem>>("/api/mpn/rest/api/plants/P01");
 */
export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init.headers as Record<string, string>) ?? {}),
  };
  const token = typeof window !== "undefined" ? localStorage.getItem("oasis_access_token") : null;
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(path, { ...init, headers });
  } catch (err) {
    throw normalizeFetchError(err);
  }

  if (res.status === 401) {
    redirectToLoginOn401();
    throw new Error("인증이 만료되었습니다. 다시 로그인하세요.");
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}) as ApiErrorBody)) as ApiErrorBody;
    const baseMsg = extractBackendErrorMessage(body, res.status);
    const fieldErrors = extractBackendFieldErrors(body);
    // ADR-0054 R4(P2) — 코드 판별이 필요한 호출부(예: version-compare-page 의 restore-preview)를 위해
    // BE 표준 에러 응답의 code 를 HttpError 에 보존한다. body.error.code 가 aps-core ApiResponse(현재
    // 실제 응답 형태) 의 위치이고, 나머지는 다른 백엔드 형태(§ApiErrorBody 주석) 호환.
    const code = body.error?.code ?? body.errorCode ?? body.meta?.code;
    // OASIS 오류 상세(grid·rowKey·rowIndex·field)는 칸 표시용으로 그대로 싣는다(toFieldErrors).
    const details = Array.isArray(body.errors) && body.errors.length > 0 ? (body.errors as BackendErrorDetail[]) : undefined;
    if (fieldErrors && fieldErrors.length > 0) {
      const detail = fieldErrors.map((fe) => `${fe.field}: ${fe.message}`).join(", ");
      throw new HttpError(res.status, res.statusText, `${baseMsg} — ${detail}`, code, details);
    }
    throw new HttpError(res.status, res.statusText, baseMsg, code, details);
  }

  // 204 No Content 등 body 가 없는 응답 처리
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 7 — 모듈/엔드포인트 명시적 호출 헬퍼
//
// UI 화면이 BFF 컨벤션 path 를 직접 문자열로 조립하지 않도록 6 종 헬퍼를 제공한다.
// 모두 내부적으로 `apiRequest` 를 호출하여 BFF 경로(`/api/{module}/...`)를 구성한다.
//
// path 매핑 (UI → BFF):
//   apiQuery        → `/api/{module}/query/{queryId}`
//   apiQueryService → `/api/{module}/query/service/{serviceId}`
//   apiService      → `/api/{module}/service/{serviceId}`
//   apiLovMaster    → `/api/{module}/lov/master/{code}` 또는 `/{code}/{group}`
//   apiLovQuery     → `/api/{module}/lov/query/{queryId}`
//   apiLovService   → `/api/{module}/lov/service/{serviceId}`
//
// HTTP method:
//   - apiLovMaster 만 GET (마스터 코드 조회)
//   - 나머지는 POST + JSON body (params/payload 모두 body 로 직렬화)
// ─────────────────────────────────────────────────────────────────────────────

/** module / serviceId 등 path segment 를 안전하게 인코딩 */
function encodeSeg(seg: string): string {
  return encodeURIComponent(seg);
}

/**
 * 모듈 query (mybatis) 호출.
 * `/api/{module}/query/{queryId}` 로 POST + JSON body.
 */
export async function apiQuery<T>(
  module: string,
  queryId: string,
  params?: Record<string, unknown>
): Promise<T> {
  const path = `/api/${encodeSeg(module)}/query/${encodeSeg(queryId)}`;
  return apiRequest<T>(path, {
    method: "POST",
    body: JSON.stringify(params ?? {}),
  });
}

/**
 * 모듈 query-via-service 호출.
 * `/api/{module}/query/service/{serviceId}` 로 POST + JSON body.
 */
export async function apiQueryService<T>(
  module: string,
  serviceId: string,
  body: unknown
): Promise<T> {
  const path = `/api/${encodeSeg(module)}/query/service/${encodeSeg(serviceId)}`;
  return apiRequest<T>(path, {
    method: "POST",
    body: JSON.stringify(body ?? {}),
  });
}

/**
 * 모듈 트랜잭션 service 호출.
 * `/api/{module}/service/{serviceId}` 로 POST + JSON body.
 */
export async function apiService<T>(module: string, serviceId: string, body: unknown): Promise<T> {
  const path = `/api/${encodeSeg(module)}/service/${encodeSeg(serviceId)}`;
  return apiRequest<T>(path, {
    method: "POST",
    body: JSON.stringify(body ?? {}),
  });
}

/**
 * LoV master code 조회 (GET).
 * `/api/{module}/lov/master/{code}` 또는 `/{code}/{group}`.
 */
export async function apiLovMaster<T>(module: string, code: string, group?: string): Promise<T> {
  const tail = group ? `${encodeSeg(code)}/${encodeSeg(group)}` : encodeSeg(code);
  const path = `/api/${encodeSeg(module)}/lov/master/${tail}`;
  return apiRequest<T>(path, { method: "GET" });
}

/**
 * LoV query (mybatis) 호출.
 * `/api/{module}/lov/query/{queryId}` 로 POST + JSON body.
 */
export async function apiLovQuery<T>(
  module: string,
  queryId: string,
  params?: Record<string, unknown>
): Promise<T> {
  const path = `/api/${encodeSeg(module)}/lov/query/${encodeSeg(queryId)}`;
  return apiRequest<T>(path, {
    method: "POST",
    body: JSON.stringify(params ?? {}),
  });
}

/**
 * LoV service 호출.
 * `/api/{module}/lov/service/{serviceId}` 로 POST + JSON body.
 */
export async function apiLovService<T>(
  module: string,
  serviceId: string,
  body: unknown
): Promise<T> {
  const path = `/api/${encodeSeg(module)}/lov/service/${encodeSeg(serviceId)}`;
  return apiRequest<T>(path, {
    method: "POST",
    body: JSON.stringify(body ?? {}),
  });
}
