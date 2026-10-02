/**
 * 화면 사용 통계 시험 공용 fetch 대역. describe 밖(파일 최상단)에서 한 번 부른다.
 * 시험 파일이 아니라(.test.ts 아님) vitest 가 직접 돌리지 않는다.
 */
import { afterEach, beforeEach, vi } from "vitest";

export interface SentRequest {
  url: string;
  body: { meta: Record<string, unknown>; params: Record<string, unknown> };
}

export function installFetchMock() {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  return {
    reply(body: unknown, status = 200) {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify(body), {
          status,
          headers: { "Content-Type": "application/json" },
        })
      );
    },
    sent(i = 0): SentRequest {
      const [url, init] = fetchMock.mock.calls[i] as [string, RequestInit];
      return { url, body: JSON.parse(String(init.body)) };
    },
  };
}
