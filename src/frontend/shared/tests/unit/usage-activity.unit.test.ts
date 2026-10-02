/**
 * 화면 업무 호출 감지(usage-activity) — 설계 §3.1 "첫 업무 호출부터"(2026-10-02).
 * node 환경. fetch 대상·document 대신 가짜 객체·EventTarget 을 주입한다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  USAGE_INPUT_WINDOW_MS,
  installUsageActivity,
  isUsageBusinessRequest,
  isWithinUsageInputWindow,
  type UsageFetchTarget,
} from "../../src/portal-shell/usage-activity";

const ORIGIN = "http://portal.local:5100";

describe("isUsageBusinessRequest — 업무 호출 분류", () => {
  it.each([
    "/api/mcm/oasis/commUserMng/search",
    "/api/mls/oasis/noticeBoard/save",
    "/api/mpn/rest/api/plants/P",
    "/api/analog/rest/logViewer/search?x=1",
    `${ORIGIN}/api/mqc/oasis/inspMng/search`,
  ])("업무 경로 %s 는 true", (url) => {
    expect(isUsageBusinessRequest(url, ORIGIN)).toBe(true);
  });

  it.each([
    "/api/mcm/lov/userLov",
    "/api/auth/me",
    "/api/auth/session",
    "/api/mcm/auth/login",
    "/api/mcm/oasis/secUser/myMenus",
    "/api/mcm/oasis/secUser/myMenusTree",
    "/api/mcm/oasis/secUser/myPermissions",
    "/api/mcm/oasis/secUser/myButtonEndpoints",
    "/api/mcm/oasis/secFavorite/toggle",
    "/api/mcm/oasis/secStartPgm/search",
    "/api/mcm/oasis/secWidget/save",
    "/api/mls/oasis/noticeBoard/search",
    "/api/mcm/oasis/ntfNotification/read",
    "/api/mcm/oasis/screenUsage/record",
    "/api/mcm/oasis/screenusage/record", // 대소문자만 다른 포털 경로
    "/portal",
    "/api/mcm/oasisX/foo",
    "https://other.example.com/api/mcm/oasis/commUserMng/search", // 외부 출처
    "http://portal.local:5200/api/mcm/oasis/commUserMng/search", // 같은 호스트 다른 포트
    "//other.example.com/api/mcm/oasis/commUserMng/search",
  ])("업무 아님 %s 는 false", (url) => {
    expect(isUsageBusinessRequest(url, ORIGIN)).toBe(false);
  });

  it("URL 객체와 Request 객체도 판정한다", () => {
    expect(isUsageBusinessRequest(new URL(`${ORIGIN}/api/mcm/oasis/a/search`), ORIGIN)).toBe(true);
    expect(isUsageBusinessRequest(new URL(`${ORIGIN}/api/mcm/lov/a`), ORIGIN)).toBe(false);
    expect(isUsageBusinessRequest(new Request(`${ORIGIN}/api/mcm/oasis/a/save`), ORIGIN)).toBe(true);
    expect(
      isUsageBusinessRequest(new Request("https://other.example.com/api/mcm/oasis/a/save"), ORIGIN)
    ).toBe(false);
  });

  it("해석할 수 없는 입력은 false", () => {
    expect(isUsageBusinessRequest("http://[bad", ORIGIN)).toBe(false);
    expect(isUsageBusinessRequest({} as unknown as string, ORIGIN)).toBe(false);
    expect(isUsageBusinessRequest("/api/mcm/oasis/a/search", "null")).toBe(false); // about:blank 출처
  });
});

describe("isWithinUsageInputWindow — 입력 뒤 5초 창", () => {
  it("입력 직후·5초 경계까지는 인정하고, 입력이 없거나 5초를 넘으면 인정하지 않는다", () => {
    expect(USAGE_INPUT_WINDOW_MS).toBe(5000);
    expect(isWithinUsageInputWindow(1_000, 1_000)).toBe(true);
    expect(isWithinUsageInputWindow(6_000, 1_000)).toBe(true);
    expect(isWithinUsageInputWindow(6_001, 1_000)).toBe(false);
    expect(isWithinUsageInputWindow(1_000, null)).toBe(false);
    expect(isWithinUsageInputWindow(500, 1_000)).toBe(false); // 입력보다 앞선 요청
  });
});

describe("installUsageActivity — fetch 감싸기", () => {
  let doc: EventTarget;
  let target: UsageFetchTarget;
  let original: ReturnType<typeof vi.fn>;
  let now: number;
  let scope: string | null;
  let calls: Array<string | null>;

  const install = () =>
    installUsageActivity({
      target,
      doc,
      origin: ORIGIN,
      now: () => now,
      getScope: () => scope,
      onBusinessCall: (s) => {
        calls.push(s);
      },
    });

  const input = (type = "pointerdown") => doc.dispatchEvent(new Event(type));

  beforeEach(() => {
    doc = new EventTarget();
    original = vi.fn(async () => new Response("{}"));
    target = { fetch: original as unknown as typeof fetch };
    now = 0;
    scope = "tab-1";
    calls = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("입력 뒤 5초 안의 업무 호출만 알리고, 원래 fetch 를 같은 인자로 부른다", async () => {
    const uninstall = install();
    expect(target.fetch).not.toBe(original);

    await target.fetch("/api/mcm/oasis/a/search"); // 입력 없음 — 자동 호출
    expect(calls).toEqual([]);

    now = 10_000;
    input("keydown");
    now = 14_000;
    const init = { method: "POST", body: "{}" };
    await target.fetch("/api/mcm/oasis/a/save", init);
    expect(calls).toEqual(["tab-1"]);
    expect(original).toHaveBeenLastCalledWith("/api/mcm/oasis/a/save", init);

    await target.fetch("/api/mcm/lov/a"); // 업무 아님
    now = 15_001;
    await target.fetch("/api/mcm/oasis/a/search"); // 5초 넘음
    expect(calls).toEqual(["tab-1"]);
    expect(original).toHaveBeenCalledTimes(4);
    uninstall();
  });

  it("입력 때의 범위(활성 탭)와 요청 때의 범위가 다르면 알리지 않는다", async () => {
    const uninstall = install();
    input(); // 사이드바에서 메뉴를 누름 — 그때 활성 탭은 tab-1
    scope = "tab-2"; // 새 탭이 열려 활성
    await target.fetch("/api/mcm/oasis/b/search"); // 새 화면의 자동 조회
    expect(calls).toEqual([]);

    input(); // 새 탭 안에서 입력
    await target.fetch("/api/mcm/oasis/b/search");
    expect(calls).toEqual(["tab-2"]);

    scope = null;
    input();
    await target.fetch("/api/mcm/oasis/b/search"); // 범위 없음(홈 등)
    expect(calls).toEqual(["tab-2"]);
    uninstall();
  });

  it("알림 처리가 던져도 fetch 결과는 그대로 돌려준다", async () => {
    const response = new Response("ok");
    original.mockResolvedValueOnce(response);
    const uninstall = installUsageActivity({
      target,
      doc,
      origin: ORIGIN,
      now: () => now,
      getScope: () => scope,
      onBusinessCall: () => {
        throw new Error("boom");
      },
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    input();
    await expect(target.fetch("/api/mcm/oasis/a/search")).resolves.toBe(response);
    uninstall();
  });

  it("해제하면 원래 fetch 로 되돌리고 입력 리스너를 뗀다. 두 번 해제해도 된다", async () => {
    const remove = vi.spyOn(doc, "removeEventListener");
    const uninstall = install();
    uninstall();
    expect(target.fetch).toBe(original);
    expect(remove.mock.calls.map(([type]) => type).sort()).toEqual(["keydown", "pointerdown"]);
    uninstall();
    expect(target.fetch).toBe(original);
  });

  it("설치·해제·설치(StrictMode 이중 effect)에도 한 겹만 감싸고, 해제하면 원래 fetch 다", async () => {
    install()();
    const uninstall = install();
    input();
    await target.fetch("/api/mcm/oasis/a/search");
    expect(calls).toEqual(["tab-1"]); // 두 겹이면 두 번 알린다
    expect(original).toHaveBeenCalledTimes(1);
    uninstall();
    expect(target.fetch).toBe(original);
  });

  it("다른 코드가 위에 또 감쌌으면 그 감싸기를 지우지 않고 알림만 끈다", async () => {
    const uninstall = install();
    const ours = target.fetch;
    const outer = vi.fn((...args: Parameters<typeof fetch>) => ours(...args));
    target.fetch = outer as unknown as typeof fetch;
    uninstall();
    expect(target.fetch).toBe(outer);
    input();
    await target.fetch("/api/mcm/oasis/a/search");
    expect(calls).toEqual([]);
    expect(original).toHaveBeenCalledTimes(1);
  });

  it("원래 fetch 를 대상 객체를 this 로 부른다(브라우저 Illegal invocation 방지)", async () => {
    let receiver: unknown;
    target.fetch = function (this: unknown) {
      receiver = this;
      return Promise.resolve(new Response("{}"));
    } as unknown as typeof fetch;
    const uninstall = install();
    await target.fetch("/api/mcm/oasis/a/search");
    expect(receiver).toBe(target);
    uninstall();
  });
});
