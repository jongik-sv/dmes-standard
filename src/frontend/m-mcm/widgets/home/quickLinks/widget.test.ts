/** @vitest-environment happy-dom */
/**
 * 바로가기 위젯 — 자기 탭(홈)이 활성화될 때만 즐겨찾기를 다시 읽는다(Screen-Performance-Guide K5·R10).
 * 즐겨찾기 훅(usePortalFavorites)은 대역으로 바꾸고 refetch 호출 수만 센다. 탭 문맥(TabPageContext)은 실물을 쓴다(shared dist 필요).
 * JSX 없이 createElement 로 쓴다(vitest include 가 *.test.ts 만 잡는다).
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ refetch: vi.fn(async () => {}), hookMounts: 0 }));

vi.mock("@dk-oasis/shared/portal-shell", async (importOriginal) => {
  const react = await import("react");
  return {
    ...(await importOriginal<typeof import("@dk-oasis/shared/portal-shell")>()),
    // 실물 훅은 마운트 때 한 번 조회한다 — 대역은 그 「마운트 조회」를 hookMounts 로, 다시 읽기를 refetch 로 센다.
    usePortalFavorites: () => {
      react.useEffect(() => {
        h.hookMounts += 1;
      }, []);
      return { favorites: [], isLoading: false, errorMessage: null, refetch: h.refetch };
    },
  };
});

// 목록 단추는 Mantine 없이 그린다(MantineProvider 없이 렌더).
vi.mock("@dk-oasis/shared/form", async () => {
  const { createElement: el } = await import("react");
  return { Button: (p: { children?: unknown }) => el("button", { type: "button" }, p.children as never) };
});

import { TabPageContext } from "@dk-oasis/shared/portal-shell";
import { publishPortalFavorites } from "@/lib/portal-favorites-store";
import QuickLinksWidget from "./widget";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function activate(tabId: string) {
  return act(async () => {
    window.dispatchEvent(new CustomEvent("portal-tab-activated", { detail: { tabId } }));
  });
}

describe("QuickLinksWidget — 자기 탭 활성화 때만 다시 읽기(K5)", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    h.refetch.mockClear();
    h.hookMounts = 0;
    publishPortalFavorites(null);
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  async function render(tabId: string | undefined) {
    const widget = createElement(QuickLinksWidget, { refreshKey: 0 } as never);
    await act(async () => {
      root.render(
        tabId == null
          ? widget
          : createElement(TabPageContext.Provider, { value: { pageId: "mcm:home", serviceId: "", tabId } }, widget)
      );
    });
  }

  it("다른 탭이 활성화되면 다시 읽지 않고, 자기 탭이 활성화되면 1회 읽는다", async () => {
    await render("home:mcm:home");
    await activate("tab-other");
    expect(h.refetch).not.toHaveBeenCalled();
    await activate("home:mcm:home");
    expect(h.refetch).toHaveBeenCalledTimes(1);
  });

  it("포털 밖(tabId 없음)이면 예전처럼 어느 탭 활성화에도 다시 읽는다", async () => {
    await render(undefined);
    await activate("tab-other");
    expect(h.refetch).toHaveBeenCalledTimes(1);
  });

  it("포털이 받아 둔 즐겨찾기가 있으면 진입 때 조회하지 않고 그 목록을 보이며, 자기 탭 활성화 때 처음 직접 조회한다(W4)", async () => {
    publishPortalFavorites([
      {
        id: "1", userId: "u", name: "M1", displayText: "용어 관리", type: "page", parentId: null, expended: null,
        path: "/", moduleId: "mdm", pageName: "termMng", sortOrder: 0, componentPath: "G1/termMng",
      },
    ] as never);
    await render("home:mcm:home");
    expect(h.hookMounts).toBe(0);
    expect(host.querySelector('[data-testid="home-quick-links"]')?.textContent).toContain("용어 관리");
    await activate("tab-other");
    expect(h.hookMounts).toBe(0);
    await activate("home:mcm:home");
    // 첫 다시 읽기 = 직접 조회 훅 마운트(실물에서는 요청 1회), refetch 는 아직 부르지 않는다.
    expect(h.hookMounts).toBe(1);
    expect(h.refetch).not.toHaveBeenCalled();
    await activate("home:mcm:home");
    expect(h.hookMounts).toBe(1);
    expect(h.refetch).toHaveBeenCalledTimes(1);
  });

  it("포털이 받아 둔 목록이 없으면 예전처럼 마운트 때 직접 조회한다", async () => {
    await render("home:mcm:home");
    expect(h.hookMounts).toBe(1);
  });
});
