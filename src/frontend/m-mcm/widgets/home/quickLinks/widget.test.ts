/** @vitest-environment happy-dom */
/**
 * 바로가기 위젯 — 자기 탭(홈)이 활성화될 때만 즐겨찾기를 다시 읽는다(Screen-Performance-Guide K5·R10).
 * 즐겨찾기 훅(usePortalFavorites)은 대역으로 바꾸고 refetch 호출 수만 센다. 탭 문맥(TabPageContext)은 실물을 쓴다(shared dist 필요).
 * JSX 없이 createElement 로 쓴다(vitest include 가 *.test.ts 만 잡는다).
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ refetch: vi.fn(async () => {}) }));

vi.mock("@dk-oasis/shared/portal-shell", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@dk-oasis/shared/portal-shell")>()),
  usePortalFavorites: () => ({ favorites: [], isLoading: false, errorMessage: null, refetch: h.refetch }),
}));

import { TabPageContext } from "@dk-oasis/shared/portal-shell";
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
});
