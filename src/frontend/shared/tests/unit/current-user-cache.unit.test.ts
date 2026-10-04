/** @vitest-environment happy-dom */
/**
 * 공유 사용자 확인(current-user.ts)과 RBAC 훅 — `/api/auth/me` 를 세션에 한 번만 부른다(Screen-Performance-Guide K3·K4).
 *  - 동시 N개 호출 → fetch 1회, 캐시 뒤 호출은 fetch 0회.
 *  - 로그아웃·401·로그인(clearCurrentUserCache) 뒤에는 다시 1회, RBAC 캐시도 함께 비운다.
 *  - 실패(401·빈 사용자·연결 오류)는 캐시하지 않는다.
 *  - RBAC 훅 N개 인스턴스 → auth/me 1건·myButtonEndpoints 1건.
 *  - 화면이 다시 보일 때 다른 사용자로 바뀌었으면 RBAC 를 다시 받는다(다른 탭 재로그인 감지).
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearCurrentUserCache,
  getCurrentUser,
  peekCurrentUser,
  revalidateCurrentUser,
} from "../../src/portal-shell/current-user";
import { useUserButtonRbac, type ButtonRbacState } from "../../src/portal-shell/use-user-button-rbac";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function json(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

/** /api/auth/me 는 currentUser 로, RBAC 는 사용자별 행으로 답한다. 호출 수를 URL 별로 센다. */
function stubServer(initialUser: string | null) {
  const state = { user: initialUser };
  const calls = { me: 0, rbac: 0 };
  const fetchMock = vi.fn(async (url: string, init?: { body?: string }) => {
    if (url === "/api/auth/me") {
      calls.me += 1;
      if (!state.user) return json({ authenticated: false, user: null }, 401);
      return json({ authenticated: true, user: { id: state.user, name: `이름-${state.user}` } });
    }
    if (url === "/api/mcm/oasis/secUser/myButtonEndpoints") {
      calls.rbac += 1;
      const userId = JSON.parse(init?.body ?? "{}").params?.userId;
      const rows = userId === "admin" ? [{ objId: "*", action: "*", endpoint: "*", httpMethod: "*" }] : [];
      return json({ grids: { buttons: { rows } } });
    }
    throw new Error(`unexpected ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { state, calls };
}

async function flush() {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getCurrentUser — 진행 중 요청 공유·세션 캐시", () => {
  it("동시 N개 호출은 fetch 1회, 그 뒤 호출은 fetch 0회", async () => {
    const { calls } = stubServer("u1");
    const results = await Promise.all(Array.from({ length: 6 }, () => getCurrentUser()));
    expect(calls.me).toBe(1);
    expect(results.every((r) => r.ok && r.user.id === "u1")).toBe(true);
    expect(peekCurrentUser()).toEqual({ id: "u1", name: "이름-u1" });

    await getCurrentUser();
    expect(calls.me).toBe(1);
  });

  it("로그아웃(clearCurrentUserCache) 뒤에는 다시 1회 부르고, 새 사용자를 받는다", async () => {
    const server = stubServer("u1");
    await Promise.all([getCurrentUser(), getCurrentUser()]);
    expect(server.calls.me).toBe(1);

    clearCurrentUserCache();
    expect(peekCurrentUser()).toBeNull();
    server.state.user = "u2";
    const results = await Promise.all([getCurrentUser(), getCurrentUser(), getCurrentUser()]);
    expect(server.calls.me).toBe(2);
    expect(results.every((r) => r.ok && r.user.id === "u2")).toBe(true);
  });

  it("비우기 전에 떠난 요청은 끝나도 캐시를 채우지 않는다", async () => {
    stubServer("u1");
    const pending = getCurrentUser();
    clearCurrentUserCache();
    await pending;
    expect(peekCurrentUser()).toBeNull();
  });

  it("실패(401)는 캐시하지 않는다 — 로그인 뒤 다시 물으면 성공한다", async () => {
    const server = stubServer(null);
    const first = await getCurrentUser();
    expect(first).toEqual({ ok: false, status: 401 });
    expect(peekCurrentUser()).toBeNull();

    server.state.user = "u1";
    const second = await getCurrentUser();
    expect(second.ok).toBe(true);
    expect(server.calls.me).toBe(2);
  });

  it("연결 오류는 reject 하고 캐시하지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("offline");
    }));
    await expect(getCurrentUser()).rejects.toThrow("offline");
    expect(peekCurrentUser()).toBeNull();
  });

  it("clearCurrentUserCache 는 RBAC 캐시도 비운다", async () => {
    const g = globalThis as unknown as Record<string, { cachedState: unknown } | undefined>;
    g.__dkOasisButtonRbacStore__ = { cachedState: { userId: "u1" }, inflight: null, subscribers: new Set() } as never;
    clearCurrentUserCache();
    expect(g.__dkOasisButtonRbacStore__?.cachedState).toBeNull();
  });
});

describe("useUserButtonRbac — 인스턴스가 여럿이어도 사용자 확인 1건", () => {
  let host: HTMLDivElement;
  let root: Root;
  const latest: ButtonRbacState[] = [];

  function Probe({ index }: { index: number }) {
    latest[index] = useUserButtonRbac();
    return null;
  }

  function renderProbes(n: number) {
    return act(async () => {
      root.render(Array.from({ length: n }, (_, i) => createElement(Probe, { key: i, index: i })));
    });
  }

  beforeEach(() => {
    latest.length = 0;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("N개 인스턴스 → auth/me 1건·myButtonEndpoints 1건, 다시 마운트해도 0건", async () => {
    const { calls } = stubServer("admin");
    await renderProbes(5);
    await flush();
    expect(calls.me).toBe(1);
    expect(calls.rbac).toBe(1);
    expect(latest.every((s) => !s.isLoading && s.isSysadmin && s.userId === "admin")).toBe(true);

    // 탭 전환 등으로 다시 마운트 — 같은 사용자면 서버에 묻지 않는다.
    await act(async () => root.render(null));
    await renderProbes(3);
    await flush();
    expect(calls.me).toBe(1);
    expect(calls.rbac).toBe(1);
    expect(latest.slice(0, 3).every((s) => !s.isLoading && s.isSysadmin)).toBe(true);
  });

  it("로그아웃 뒤 다른 사용자로 로그인하면 RBAC 를 새 사용자로 다시 받는다(이전 권한이 남지 않는다)", async () => {
    const server = stubServer("admin");
    await renderProbes(2);
    await flush();
    expect(latest[0].isSysadmin).toBe(true);

    await act(async () => root.render(null));
    clearCurrentUserCache();
    server.state.user = "u2";
    await renderProbes(2);
    await flush();
    expect(server.calls.me).toBe(2);
    expect(server.calls.rbac).toBe(2);
    expect(latest.slice(0, 2).every((s) => !s.isLoading && !s.isSysadmin && s.userId === "u2")).toBe(true);
  });

  it("다른 탭에서 다른 사용자로 재로그인 → 화면이 다시 보일 때 재확인해 RBAC 를 다시 받는다", async () => {
    const server = stubServer("admin");
    await renderProbes(2);
    await flush();
    expect(latest[0].isSysadmin).toBe(true);

    server.state.user = "u2";
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await flush();
    expect(server.calls.me).toBe(2);
    expect(server.calls.rbac).toBe(2);
    expect(latest.slice(0, 2).every((s) => !s.isLoading && !s.isSysadmin && s.userId === "u2")).toBe(true);
  });

  it("재확인 결과가 같은 사용자면 RBAC 를 다시 받지 않는다", async () => {
    const server = stubServer("admin");
    await renderProbes(2);
    await flush();
    await act(async () => {
      await revalidateCurrentUser();
    });
    await flush();
    expect(server.calls.me).toBe(2);
    expect(server.calls.rbac).toBe(1);
    expect(latest[0].isSysadmin).toBe(true);
  });
});
