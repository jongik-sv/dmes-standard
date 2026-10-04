/** @vitest-environment happy-dom */
/**
 * useCurrentUserState — 사용자 ID 만 필요한 곳이 RBAC 를 구독하지 않는다(Screen-Performance-Guide §8 F3).
 *  - 확인된 사용자 ID 와 isLoading 을 그대로 돌려준다(실패·enabled=false 는 "").
 *  - RBAC 상태가 바뀌어도(notify) 이 훅을 쓰는 컴포넌트는 다시 그려지지 않는다.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCurrentUserCache } from "../../src/portal-shell/current-user";
import { useCurrentUserState, type CurrentUserState } from "../../src/portal-shell/use-current-user-id";
import { useUserButtonRbac } from "../../src/portal-shell/use-user-button-rbac";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function json(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function stubServer(user: string | null) {
  const calls = { me: 0, rbac: 0 };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url === "/api/auth/me") {
        calls.me += 1;
        return user ? json({ authenticated: true, user: { id: user, name: "n" } }) : json({ authenticated: false, user: null }, 401);
      }
      calls.rbac += 1;
      return json({ grids: { buttons: { rows: [] } } });
    })
  );
  return calls;
}

async function flush() {
  for (let i = 0; i < 5; i += 1) await act(async () => void (await new Promise((r) => setTimeout(r, 0))));
}

describe("useCurrentUserState", () => {
  let host: HTMLDivElement;
  let root: Root;
  let renders = 0;
  let latest: CurrentUserState;

  function Probe({ enabled = true }: { enabled?: boolean }) {
    renders += 1;
    latest = useCurrentUserState(enabled);
    return null;
  }

  beforeEach(() => {
    clearCurrentUserCache();
    renders = 0;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  it("처음엔 확인 중이고, 확인되면 사용자 ID 를 돌려준다(RBAC 조회 없음)", async () => {
    const calls = stubServer("u1");
    await act(async () => root.render(createElement(Probe)));
    await flush();
    expect(latest).toEqual({ userId: "u1", isLoading: false });
    expect(calls.rbac).toBe(0);
  });

  it("확인 실패면 userId 는 빈 문자열이고 isLoading 은 끝난다", async () => {
    stubServer(null);
    await act(async () => root.render(createElement(Probe)));
    await flush();
    expect(latest).toEqual({ userId: "", isLoading: false });
  });

  it("enabled=false 면 사용자 확인을 요청하지 않는다", async () => {
    const calls = stubServer("u1");
    await act(async () => root.render(createElement(Probe, { enabled: false })));
    await flush();
    expect(latest).toEqual({ userId: "", isLoading: false });
    expect(calls.me).toBe(0);
  });

  it("RBAC 상태가 바뀌어도 이 컴포넌트는 다시 그려지지 않는다", async () => {
    stubServer("u1");
    function Rbac() {
      useUserButtonRbac();
      return null;
    }
    await act(async () => root.render(createElement("div", null, createElement(Probe), createElement(Rbac))));
    await flush();
    const settled = renders;
    expect(latest.userId).toBe("u1");
    // RBAC 저장소를 다시 알린다(권한 상태 변화) — Probe 는 구독하지 않으므로 그대로여야 한다.
    const store = (globalThis as unknown as Record<string, { subscribers: Set<(s: unknown) => void> }>).__dkOasisButtonRbacStore__;
    await act(async () => {
      store.subscribers.forEach((cb) => cb({ rows: [], isLoading: false, isSysadmin: true, errorMessage: null, userId: "u1" }));
    });
    expect(renders).toBe(settled);
  });
});
