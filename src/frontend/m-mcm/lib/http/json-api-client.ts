export interface JsonApiRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: HeadersInit;
  signal?: AbortSignal;
}

export interface JsonApiClient {
  request<T>(path: string, options?: JsonApiRequestOptions): Promise<T>;
}

interface JsonApiErrorPayload {
  message?: string;
  error?: { code?: string; message?: string };
}

/** HTTP status code → 사용자 친화적 기본 메시지 */
const STATUS_FALLBACK_MESSAGES: Record<number, string> = {
  400: "잘못된 요청입니다.",
  401: "로그인이 필요합니다.",
  403: "권한이 없습니다.",
  404: "요청한 데이터를 찾을 수 없습니다.",
  409: "이미 존재하는 데이터입니다.",
  500: "서버 오류가 발생했습니다.",
  503: "서비스를 일시적으로 사용할 수 없습니다.",
};

function extractErrorMessage(payload: JsonApiErrorPayload | null, status: number): string {
  // 1) 서버가 명시한 메시지가 있으면 그대로 사용 (최우선)
  if (payload?.error?.message) return payload.error.message;
  if (payload?.message) return payload.message;
  // 2) status 기반 친화적 기본 메시지
  return STATUS_FALLBACK_MESSAGES[status] ?? `요청을 처리하지 못했습니다. (${status})`;
}

export interface CreateJsonApiClientOptions {
  basePath?: string;
  credentials?: RequestCredentials;
}

function joinBasePath(basePath: string, path: string): string {
  const normalizedBasePath = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  return `${normalizedBasePath}${normalizedPath}`;
}

export function createJsonApiClient(options: CreateJsonApiClientOptions = {}): JsonApiClient {
  const basePath = options.basePath?.trim() ?? "";
  const credentials = options.credentials ?? "same-origin";

  return {
    async request<T>(path: string, requestOptions: JsonApiRequestOptions = {}): Promise<T> {
      const response = await fetch(joinBasePath(basePath, path), {
        method: requestOptions.method ?? "GET",
        body: requestOptions.body === undefined ? undefined : JSON.stringify(requestOptions.body),
        headers: {
          "Content-Type": "application/json",
          ...(requestOptions.headers ?? {}),
        },
        credentials,
        signal: requestOptions.signal,
      });

      const payload = (await response.json().catch(() => null)) as JsonApiErrorPayload | null;

      if (!response.ok) {
        throw new Error(extractErrorMessage(payload, response.status));
      }

      return payload as T;
    },
  };
}
