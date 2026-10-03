/**
 * postJson - 서버 API 호출 유틸리티
 * 원본: libTran.js의 gfn_transaction을 fetch 기반으로 재구현
 */

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export interface PostJsonOptions {
  timeout?: number;
  credentials?: RequestCredentials;
  headers?: Record<string, string>;
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export interface PostJsonResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  status?: number;
}

const DEFAULT_TIMEOUT = 300000; // 5분

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export async function postJson<T = unknown>(
  url: string,
  body: unknown = {},
  params?: Record<string, string>,
  options: PostJsonOptions = {},
): Promise<PostJsonResult<T>> {
  const { timeout = DEFAULT_TIMEOUT, credentials = "include", headers = {} } = options;

  // 쿼리 파라미터 추가
  let fullUrl = url;
  if (params && Object.keys(params).length > 0) {
    const searchParams = new URLSearchParams(params);
    fullUrl += (url.includes("?") ? "&" : "?") + searchParams.toString();
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(fullUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
      credentials,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        ok: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
        status: response.status,
      };
    }

    const data = (await response.json()) as T;
    return { ok: true, data, status: response.status };
  } catch (err) {
    clearTimeout(timeoutId);

    if (err instanceof DOMException && err.name === "AbortError") {
      return { ok: false, error: "요청 시간이 초과되었습니다." };
    }

    return {
      ok: false,
      error: err instanceof Error ? err.message : "올바르지 않은 URL 이거나, 통신상태가 원활하지 않습니다.",
    };
  }
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_postJson = postJson;
