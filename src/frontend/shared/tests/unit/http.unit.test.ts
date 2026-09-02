/**
 * `apiRequest()` 의 BE 에러 응답 어댑터 단위 테스트.
 *
 * 검증 대상:
 *  - REST `ApiResponse` (top-level message) 추출
 *  - OASIS `CactusResponse` (meta.message / errors[].message) 추출
 *  - 레거시 `body.error.message` 호환 유지
 *  - fieldErrors / errors[].field 매핑
 *  - JSON 파싱 실패 시 사용자용 HTTP fallback
 *  - fetch 네트워크 실패 / timeout 사용자 메시지 변환
 *  - 401 처리 (인증 만료 throw + redirect 트리거)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface FakeResponseInit {
  status: number;
  ok?: boolean;
  /** JSON 으로 직렬화될 본문. `text` 와 동시에 지정 시 `text` 가 우선되며 JSON 파싱은 실패한다. */
  json?: unknown;
  /** 비정상(JSON 아님) 본문 시뮬레이션용. */
  text?: string;
  headers?: Record<string, string>;
}

function makeFakeResponse(init: FakeResponseInit): Response {
  const status = init.status;
  const ok = init.ok ?? (status >= 200 && status < 300);
  const headersMap = new Map<string, string>(
    Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v])
  );
  return {
    status,
    ok,
    statusText: "",
    headers: {
      get: (name: string) => headersMap.get(name.toLowerCase()) ?? null,
    },
    json: async () => {
      if (init.text !== undefined) {
        // 텍스트 응답에서 .json() 호출 시 실제 fetch 와 동일하게 throw
        throw new SyntaxError("Unexpected token in JSON");
      }
      return init.json;
    },
    text: async () => init.text ?? JSON.stringify(init.json ?? null),
  } as unknown as Response;
}

describe("apiRequest BE 에러 응답 어댑터", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    // SSR-safe: 기본은 window 없는 환경 (token 주입 / redirect 모두 skip)
    vi.unstubAllGlobals();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("[케이스 1] 레거시 body.error.message 형 응답을 throw 메시지로 노출한다", async () => {
    const { apiRequest } = await import("../../src/http/index");
    fetchSpy.mockResolvedValueOnce(
      makeFakeResponse({
        status: 400,
        json: { error: { message: "검증 실패" } },
      })
    );

    await expect(apiRequest("/api/x")).rejects.toThrow("검증 실패");
  });

  it("[케이스 2] REST ApiResponse top-level message 를 throw 메시지로 노출한다", async () => {
    const { apiRequest } = await import("../../src/http/index");
    fetchSpy.mockResolvedValueOnce(
      makeFakeResponse({
        status: 423,
        json: { success: false, message: "잠긴 계정", errorCode: "ACCOUNT_LOCKED" },
      })
    );

    await expect(apiRequest("/api/x")).rejects.toThrow("잠긴 계정");
  });

  it("[케이스 3] OASIS CactusResponse 에서 meta.message 를 우선 노출한다", async () => {
    const { apiRequest } = await import("../../src/http/index");
    fetchSpy.mockResolvedValueOnce(
      makeFakeResponse({
        status: 400,
        json: {
          meta: { code: "9999", message: "비즈니스 오류", success: false },
          errors: [{ code: "9999", message: "errors 쪽 메시지" }],
        },
      })
    );

    await expect(apiRequest("/api/x")).rejects.toThrow("비즈니스 오류");
  });

  it("[케이스 4] meta.message 가 없으면 errors[0].message 를 노출한다", async () => {
    const { apiRequest } = await import("../../src/http/index");
    fetchSpy.mockResolvedValueOnce(
      makeFakeResponse({
        status: 400,
        json: { errors: [{ code: "E001", message: "필드 오류" }] },
      })
    );

    await expect(apiRequest("/api/x")).rejects.toThrow("필드 오류");
  });

  it("[케이스 5] errors[].field 를 fieldErrors 로 매핑하여 throw 메시지에 합친다", async () => {
    const { apiRequest } = await import("../../src/http/index");
    fetchSpy.mockResolvedValueOnce(
      makeFakeResponse({
        status: 400,
        json: {
          errors: [
            { field: "name", message: "필수" },
            { field: "age", message: "숫자" },
          ],
        },
      })
    );

    let caught: unknown;
    try {
      await apiRequest("/api/x");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    const msg = (caught as Error).message;
    // baseMsg 는 첫 errors[0].message → "필수", detail 은 두 항목 합침
    expect(msg).toContain("name: 필수");
    expect(msg).toContain("age: 숫자");
  });

  it("[케이스 6] JSON 파싱이 실패하면 사용자용 HTTP fallback 메시지를 throw 한다", async () => {
    const { apiRequest } = await import("../../src/http/index");
    fetchSpy.mockResolvedValueOnce(
      makeFakeResponse({
        status: 500,
        text: "<html>500 Internal Server Error</html>",
      })
    );

    await expect(apiRequest("/api/x")).rejects.toThrow(
      "서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요. (HTTP 500)"
    );
  });

  it("[케이스 7] fetch 네트워크 실패는 브라우저 원문 대신 사용자용 메시지로 throw 한다", async () => {
    const { apiRequest } = await import("../../src/http/index");
    fetchSpy.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(apiRequest("/api/x")).rejects.toThrow(
      "서버와 연결할 수 없습니다. 네트워크 또는 서버 상태를 확인한 뒤 다시 시도해 주세요."
    );
  });

  it("[케이스 8] 외부 AbortSignal 취소는 AbortError identity를 보존한다", async () => {
    const { apiRequest } = await import("../../src/http/index");
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";
    fetchSpy.mockRejectedValueOnce(abortError);

    await expect(apiRequest("/api/x")).rejects.toMatchObject({
      name: "AbortError",
      message: "The operation was aborted",
    });
  });

  it("[케이스 9] 401 응답은 인증 만료 메시지로 throw 하고 redirectToLoginOn401 부수효과를 트리거한다", async () => {
    // window / localStorage 를 mock 하여 redirectToLoginOn401 의 진입 분기를 통과시킨다
    const removeItem = vi.fn();
    const getItem = vi.fn().mockReturnValue(null);
    vi.stubGlobal("window", {
      location: {
        pathname: "/portal/aps",
        search: "",
        // assignment 가 동작하도록 setter 가능한 객체로 둔다
        href: "",
      },
    });
    vi.stubGlobal("localStorage", {
      getItem,
      removeItem,
      setItem: vi.fn(),
    });
    // 모듈 상태(redirectingToLogin) 격리
    vi.resetModules();
    const { apiRequest } = await import("../../src/http/index");

    // 첫 호출: 401 응답
    // 두 번째 호출(force-logout) 도 발생하므로 mock 해 둔다
    fetchSpy.mockImplementation(async (input: RequestInfo) => {
      if (typeof input === "string" && input.includes("/api/auth/force-logout")) {
        return makeFakeResponse({ status: 200, json: {} });
      }
      return makeFakeResponse({ status: 401, json: {} });
    });

    await expect(apiRequest("/api/x")).rejects.toThrow("인증이 만료되었습니다");

    // redirect 부수효과: force-logout fetch 가 비동기로 호출됨
    // 마이크로태스크 한 번 flush
    await Promise.resolve();
    await Promise.resolve();

    const calledForceLogout = fetchSpy.mock.calls.some(
      ([input]) => typeof input === "string" && input.includes("/api/auth/force-logout")
    );
    expect(calledForceLogout).toBe(true);
  });
});
