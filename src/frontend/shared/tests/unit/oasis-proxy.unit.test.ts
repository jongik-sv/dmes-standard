/**
 * 공통 OASIS 프록시 — 경로 조각으로 BE 경로를 바꿀 수 없다(2026-10-03 보안 지적).
 *
 * Next 라우트 매처는 `[serviceId]`·`[action]` 을 디코드해서 넘긴다. 그래서
 * `POST /api/mls/oasis/noticeBoard/search%2F..%2F..%2FnoticeMgmt%2Fsave` 는 action=`search/../../noticeMgmt/save` 로 들어오고,
 * 옛 코드는 이 값을 그대로 BE URL 에 붙여 fetch 가 `..` 를 정리한 `/oasis/noticeMgmt/save`(게이트웨이면 `/mls/oasis/...`)를 불렀다.
 * proxy 의 권한 판정은 원래 경로 접두(`/api/mls/oasis/noticeBoard/search`, 로그인만)로 했으므로 권한 없는 사용자가 다른 서비스를 실행했다.
 * 아래 params 는 next dev(5199)에서 위 요청을 보냈을 때 라우트가 받은 값과 같다.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createOasisProxyHandler, OASIS_NAME_PATTERN } from "../../src/oasis-proxy";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

afterEach(() => {
  fetchMock.mockReset();
});

const getAuthContext = vi.fn(async () => ({ userId: "user1", roles: ["USER"] }));

/** WAS 직결(개발) — 모듈별 매핑이 있으면 `${WAS}/oasis/...`. */
const direct = createOasisProxyHandler({
  getAuthContext,
  backendApiUrl: "http://gw.test",
  backendApiUrlByModule: { mcm: "http://mcm.test", mls: "http://mls.test" },
  backendClientKey: "k",
});
/** 게이트웨이(운영) — 매핑이 없으면 `${BACKEND_API_URL}/{module}/oasis/...`. */
const gateway = createOasisProxyHandler({
  getAuthContext,
  backendApiUrl: "http://gw.test",
  backendClientKey: "k",
});

type Handler = typeof direct;

function call(handler: Handler, module: string, serviceId: string, action: string) {
  return handler(
    new Request("http://bff.test/api/x", { method: "POST", body: "{}" }),
    { params: Promise.resolve({ module, serviceId, action }) }
  );
}

function beOk(): void {
  fetchMock.mockImplementation(
    async () =>
      new Response(JSON.stringify({ meta: { success: true } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
  );
}

describe("createOasisProxyHandler — 경로 조각 검사", () => {
  // 리뷰어 재현 경로(디코드된 값). [module, serviceId, action, 원래 요청]
  const REVIEWER_CASES: Array<[string, string, string, string]> = [
    ["mls", "noticeBoard", "search/../../noticeMgmt/save", "/api/mls/oasis/noticeBoard/search%2F..%2F..%2FnoticeMgmt%2Fsave"],
    ["mcm", "widgetMemo", "../../oasis/secUser/delete", "/api/mcm/oasis/widgetMemo/..%2F..%2Foasis%2FsecUser%2Fdelete"],
  ];

  for (const [mode, handler] of [
    ["WAS 직결", direct],
    ["게이트웨이", gateway],
  ] as const) {
    it(`리뷰어 재현 경로는 400 이고 BE 를 부르지 않는다 — ${mode}`, async () => {
      for (const [module, serviceId, action, original] of REVIEWER_CASES) {
        const res = await call(handler, module, serviceId, action);
        expect(res.status, original).toBe(400);
        expect(await res.json()).toMatchObject({ success: false, error: { code: "BAD_REQUEST" } });
      }
      expect(fetchMock).not.toHaveBeenCalled();
    });
  }

  it("역슬래시·점 조각·인코딩 흔적·세미콜론·빈 값이 든 serviceId·action·module 은 400 — 인증도 보지 않는다", async () => {
    getAuthContext.mockClear();
    const bad: Array<[string, string, string]> = [
      // fetch 는 http(s) URL 의 `\` 를 `/` 로 바꾼다 — `search%5C..%5C..%5CnoticeMgmt%5Csave` 도 같은 결과였다(next dev 확인).
      ["mls", "noticeBoard", "search\\..\\..\\noticeMgmt\\save"],
      ["mls", "noticeBoard", ".."],
      ["mls", "..", "save"],
      ["mls", ".", "save"],
      ["mls", "noticeBoard", "search;x"],
      ["mls", "noticeBoard", "search%2F..%2Fx"], // 이중 인코딩(%252F)을 한 번 디코드한 값
      ["mls", "noticeBoard", "search.json"],
      ["mls", "notice-board", "search"],
      ["mls", "noticeBoard", ""],
      ["mls/../mcm", "secUser", "delete"],
      ["", "secUser", "delete"],
      ["mls", "noticeBoard", "search\n"],
    ];
    for (const [module, serviceId, action] of bad) {
      for (const handler of [direct, gateway]) {
        const res = await call(handler, module, serviceId, action);
        expect(res.status, JSON.stringify([module, serviceId, action])).toBe(400);
      }
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getAuthContext).not.toHaveBeenCalled();
  });

  it("정상 이름은 그대로 통과하고 인코딩해 붙인다 — WAS 직결·게이트웨이", async () => {
    beOk();
    expect((await call(direct, "mls", "noticeBoard", "search")).status).toBe(200);
    expect((await call(direct, "mcm", "sec_User2", "myMenus")).status).toBe(200);
    expect((await call(gateway, "mls", "noticeBoard", "search")).status).toBe(200);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      "http://mls.test/oasis/noticeBoard/search",
      "http://mcm.test/oasis/sec_User2/myMenus",
      "http://gw.test/mls/oasis/noticeBoard/search",
    ]);
  });

  it("모듈 매핑은 자기 키만 본다 — Object 원형 이름(constructor)은 게이트웨이로 간다", async () => {
    beOk();
    expect((await call(direct, "constructor", "secUser", "search")).status).toBe(200);
    expect(fetchMock.mock.calls[0][0]).toBe("http://gw.test/constructor/oasis/secUser/search");
  });

  it("이름 규칙은 영문·숫자·밑줄만", () => {
    for (const ok of ["noticeBoard", "secUser", "myMenus", "sec_obj", "V2"]) {
      expect(OASIS_NAME_PATTERN.test(ok), ok).toBe(true);
    }
    for (const bad of ["a/b", "a\\b", "a.b", "a-b", "a b", "a%2Fb", "a;b", "", "한글"]) {
      expect(OASIS_NAME_PATTERN.test(bad), bad).toBe(false);
    }
  });
});
