/** @vitest-environment happy-dom */
/**
 * MDM 화면 메타 store(spec B4·B5) — 한 틱 묶음 요청, 5분 보관, 진행 중 공유, unavailable 미보관,
 * 404·401·403·연결 실패 시 모듈 끄기(로그인 화면으로 보내지 않는다).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isModuleDisabled, requestColumns, requestDomains, resetMdmMetaStore } from "../../src/mdm-meta";
import { TEXT_DOMAIN, TITLE, column, fakeMetaFetch } from "./mdm-meta-fixtures";

const CATEGORY = column("CATEGORY", { labelShort: "분류" });

// happy-dom 환경에서 전역 localStorage 가 노출되지 않는 경우를 대비한다(portal-shell 시험과 같은 방식).
if (typeof globalThis.localStorage === "undefined" || typeof globalThis.localStorage?.setItem !== "function") {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, String(value)),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
      key: (index: number) => [...store.keys()][index] ?? null,
      get length() {
        return store.size;
      },
    },
  });
}

beforeEach(() => {
  resetMdmMetaStore();
  try {
    localStorage.removeItem("oasis_access_token");
  } catch {
    /* 무시 */
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("requestColumns", () => {
  it("한 틱 동안 모은 이름을 모듈마다 POST 한 번으로 받는다(중복 제거)", async () => {
    const f = fakeMetaFetch({ columns: { TITLE, CATEGORY } });
    vi.stubGlobal("fetch", f.fn);

    const [a, b] = await Promise.all([
      requestColumns("mls", ["TITLE", "CATEGORY"]),
      requestColumns("mls", ["TITLE", "USE_YN"]),
    ]);

    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].url).toBe("/api/mls/mdmMeta/columns");
    expect(f.calls[0].body).toEqual({ names: ["TITLE", "CATEGORY", "USE_YN"] });
    expect(a.get("TITLE")).toEqual(TITLE);
    expect(a.get("CATEGORY")).toEqual(CATEGORY);
    expect(b.get("TITLE")).toEqual(TITLE);
    expect(b.has("USE_YN")).toBe(true);
    expect(b.get("USE_YN")).toBeNull(); // MDM 에 없음
  });

  it("모듈이 다르면 따로 부른다", async () => {
    const f = fakeMetaFetch({ columns: { TITLE } });
    vi.stubGlobal("fetch", f.fn);
    await Promise.all([requestColumns("mls", ["TITLE"]), requestColumns("mqc", ["TITLE"])]);
    expect(f.calls.map((c) => c.url).sort()).toEqual(["/api/mls/mdmMeta/columns", "/api/mqc/mdmMeta/columns"]);
  });

  it("받은 것과 없는 것은 5분 동안 다시 부르지 않고, 5분이 지나면 다시 받는다", async () => {
    const f = fakeMetaFetch({ columns: { TITLE } });
    vi.stubGlobal("fetch", f.fn);
    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(1_000_000);

    await requestColumns("mls", ["TITLE", "NOPE"]);
    expect(f.calls).toHaveLength(1);

    now.mockReturnValue(1_000_000 + 4 * 60_000);
    const again = await requestColumns("mls", ["TITLE", "NOPE"]);
    expect(f.calls).toHaveLength(1);
    expect(again.get("TITLE")).toEqual(TITLE);
    expect(again.get("NOPE")).toBeNull();

    now.mockReturnValue(1_000_000 + 5 * 60_000 + 1);
    await requestColumns("mls", ["TITLE"]);
    expect(f.calls).toHaveLength(2);
    expect(f.calls[1].body).toEqual({ names: ["TITLE"] });
  });

  it("unavailable 은 보관하지 않고 결과에서 뺀다 — 다음 요청 때 다시 부른다", async () => {
    const f = fakeMetaFetch({ columns: { TITLE }, unavailable: ["CATEGORY"] });
    vi.stubGlobal("fetch", f.fn);

    const first = await requestColumns("mls", ["TITLE", "CATEGORY"]);
    expect(first.has("CATEGORY")).toBe(false);
    await requestColumns("mls", ["TITLE", "CATEGORY"]);
    expect(f.calls).toHaveLength(2);
    expect(f.calls[1].body).toEqual({ names: ["CATEGORY"] });
  });

  it("진행 중인 같은 키 요청은 공유한다", async () => {
    let release: (r: Response) => void = () => {};
    const fn = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        })
    );
    vi.stubGlobal("fetch", fn);

    const first = requestColumns("mls", ["TITLE"]);
    await new Promise((r) => setTimeout(r, 40)); // 묶음이 나가 fetch 가 걸린 상태
    expect(fn).toHaveBeenCalledTimes(1);
    const second = requestColumns("mls", ["TITLE"]);
    await new Promise((r) => setTimeout(r, 40));
    expect(fn).toHaveBeenCalledTimes(1);

    release(new Response(JSON.stringify({ items: { TITLE }, missing: [], unavailable: [] }), { status: 200 }));
    const [a, b] = await Promise.all([first, second]);
    expect(a.get("TITLE")).toEqual(TITLE);
    expect(b.get("TITLE")).toEqual(TITLE);
  });

  it("빈 목록이면 부르지 않는다", async () => {
    const f = fakeMetaFetch({});
    vi.stubGlobal("fetch", f.fn);
    const r = await requestColumns("mls", []);
    expect(r.size).toBe(0);
    expect(f.calls).toHaveLength(0);
  });

  it("저장된 접근 토큰을 Authorization 헤더로 싣는다(apiRequest 와 같게)", async () => {
    localStorage.setItem("oasis_access_token", "tok-1");
    const f = fakeMetaFetch({ columns: { TITLE } });
    vi.stubGlobal("fetch", f.fn);
    await requestColumns("mls", ["TITLE"]);
    expect(f.calls[0].headers.Authorization).toBe("Bearer tok-1");
    expect(f.calls[0].headers["Content-Type"]).toBe("application/json");
  });

  it.each([401, 403, 404, 502, 503, 504])("%s 이면 그 모듈을 끄고 로그인 화면으로 보내지 않으며 다시 부르지 않는다", async (status) => {
    const f = fakeMetaFetch({ status });
    vi.stubGlobal("fetch", f.fn);
    const before = window.location.href;

    const r = await requestColumns("analog", ["TITLE"]);
    expect(r.size).toBe(0);
    expect(isModuleDisabled("analog")).toBe(true);
    expect(f.calls.map((c) => c.url)).toEqual(["/api/analog/mdmMeta/columns"]); // force-logout 없음
    expect(window.location.href).toBe(before);

    const again = await requestColumns("analog", ["TITLE", "OTHER"]);
    expect(again.size).toBe(0);
    await requestDomains("analog", ["D_TEXT"]);
    expect(f.calls).toHaveLength(1);
    expect(isModuleDisabled("mls")).toBe(false);
  });

  it("연결 실패도 그 모듈을 끈다", async () => {
    const fn = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fn);
    const r = await requestColumns("mpn", ["TITLE"]);
    expect(r.size).toBe(0);
    expect(isModuleDisabled("mpn")).toBe(true);
  });

  it("메타 응답이 아닌 본문(items 없음·JSON 아님)이면 그 모듈을 끈다", async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response("<html>login</html>", { status: 200 }));
    vi.stubGlobal("fetch", fn);
    expect((await requestColumns("m1", ["TITLE"])).size).toBe(0);
    expect(isModuleDisabled("m1")).toBe(true);
    expect((await requestColumns("m2", ["TITLE"])).size).toBe(0);
    expect(isModuleDisabled("m2")).toBe(true);
  });

  it("{data:{items}} 로 감싼 응답도 읽는다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ data: { items: { TITLE }, missing: [], unavailable: [] } }), { status: 200 }))
    );
    expect((await requestColumns("mls", ["TITLE"])).get("TITLE")).toEqual(TITLE);
  });

  it("500 은 끄지 않고 보관하지도 않는다", async () => {
    const f = fakeMetaFetch({ status: 500 });
    vi.stubGlobal("fetch", f.fn);
    const r = await requestColumns("mls", ["TITLE"]);
    expect(r.size).toBe(0);
    expect(isModuleDisabled("mls")).toBe(false);
    await requestColumns("mls", ["TITLE"]);
    expect(f.calls).toHaveLength(2);
  });

  it("resetMdmMetaStore 는 보관·끈 모듈을 모두 비운다", async () => {
    const f = fakeMetaFetch({ status: 404 });
    vi.stubGlobal("fetch", f.fn);
    await requestColumns("analog", ["TITLE"]);
    expect(isModuleDisabled("analog")).toBe(true);
    resetMdmMetaStore();
    expect(isModuleDisabled("analog")).toBe(false);
  });

  it("상태는 globalThis 키 하나에 둔다(분리 빌드에서 중복 방지)", async () => {
    const f = fakeMetaFetch({ columns: { TITLE } });
    vi.stubGlobal("fetch", f.fn);
    await requestColumns("mls", ["TITLE"]);
    expect((globalThis as Record<string, unknown>).__dkOasisMdmMetaStore__).toBeTruthy();
  });
});

describe("requestDomains", () => {
  it("도메인 ID 를 /domains 로 묶어 받는다", async () => {
    const f = fakeMetaFetch({ domains: { D_TEXT: TEXT_DOMAIN } });
    vi.stubGlobal("fetch", f.fn);
    const [a, b] = await Promise.all([requestDomains("mls", ["D_TEXT"]), requestDomains("mls", ["D_NONE"])]);
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].url).toBe("/api/mls/mdmMeta/domains");
    expect(f.calls[0].body).toEqual({ domainIds: ["D_TEXT", "D_NONE"] });
    expect(a.get("D_TEXT")).toEqual(TEXT_DOMAIN);
    expect(b.get("D_NONE")).toBeNull();
    await requestDomains("mls", ["D_TEXT"]);
    expect(f.calls).toHaveLength(1);
  });
});
