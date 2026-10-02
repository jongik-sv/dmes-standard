/** @vitest-environment happy-dom */
/**
 * usePortalFavorites — 즐겨찾기 등록·해제 뒤 재조회(refetch) 중에 로딩 상태로 돌아가지 않는다.
 * 포털 페이지가 isLoading 으로 로딩 화면을 그리면 PortalShell 이 언마운트되어 열린 탭 화면 내용이 모두 사라진다.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  usePortalFavorites,
  type PortalFavoritePagesState,
} from "../../src/portal-shell/use-portal-favorites";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function favoritesResponse(rows: Array<Record<string, unknown>>) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ meta: { success: true }, grids: { favorites: { rows } } }),
  };
}

const ROW = { id: "FVT000/M1", userId: "u1", menuId: "M1", fvtFoldId: "FVT000", sysCd: "mcm", objId: "a" };

describe("usePortalFavorites", () => {
  let host: HTMLDivElement;
  let root: Root;
  let latest: PortalFavoritePagesState;
  const loadingHistory: boolean[] = [];

  function Probe() {
    latest = usePortalFavorites({ endpoint: "/api/fav/search" });
    loadingHistory.push(latest.isLoading);
    return null;
  }

  beforeEach(() => {
    loadingHistory.length = 0;
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/auth/me") return { ok: true, status: 200, json: async () => ({ user: { id: "u1" } }) };
        call += 1;
        return favoritesResponse(call === 1 ? [] : [ROW]);
      })
    );
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  it("첫 조회만 로딩이고, refetch 중에는 로딩으로 돌아가지 않으며 목록을 새로 받는다", async () => {
    await act(async () => {
      root.render(createElement(Probe));
    });
    await vi.waitFor(() => expect(latest.isLoading).toBe(false));
    expect(latest.favorites).toHaveLength(0);

    const firstLoadEnd = loadingHistory.length;
    await act(async () => {
      await latest.refetch();
    });
    await vi.waitFor(() => expect(latest.favorites).toHaveLength(1));

    expect(loadingHistory.slice(firstLoadEnd)).not.toContain(true);
  });
});
