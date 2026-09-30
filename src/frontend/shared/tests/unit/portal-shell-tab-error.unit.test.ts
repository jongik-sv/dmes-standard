/** @vitest-environment happy-dom */
/**
 * 탭 화면 하나의 오류가 포털 전체를 내리지 않는지 확인한다.
 *   - 렌더 중 예외 → 그 탭에만 ErrorBoundary 안내가 뜨고 사이드바는 남는다.
 *   - 화면 import 실패(reject) → 탭이 로딩 상태로 멈추지 않고 오류 문구를 보인다.
 */
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PortalShell } from "../../src/portal-shell/portal-shell";
import type { PortalShellPageComponent } from "../../src/portal-shell/types";
import { renderWithMantine, type Rendered } from "./mantine-test-utils";

// happy-dom 환경에서 전역 localStorage·sessionStorage 가 노출되지 않는 경우를 대비한다.
for (const name of ["localStorage", "sessionStorage"] as const) {
  if (typeof globalThis[name] !== "undefined") continue;
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, name, {
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

vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));

const PAGE_ID = "mdm:dmd/broken";

function renderShell(resolvePage: (pageId: string) => Promise<PortalShellPageComponent | null>) {
  return renderWithMantine(
    createElement(PortalShell, {
      appName: "TEST",
      menu: { items: [] },
      resolvePage,
      homePageId: PAGE_ID,
      storageKey: `portal-shell-tab-error-${Math.random()}`,
    })
  );
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
}

describe("PortalShell 탭 오류 격리", () => {
  let rendered: Rendered | null = null;

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ authenticated: false, user: null }), { status: 200 }))
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    rendered?.unmount();
    rendered = null;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("화면이 렌더 중 예외를 던져도 그 탭에만 오류 안내가 뜨고 포털 셸은 남는다", async () => {
    const BrokenPage: PortalShellPageComponent = () => {
      throw new ReferenceError("ContentBody is not defined");
    };
    rendered = renderShell(async () => BrokenPage);
    await flush();

    const text = document.body.textContent ?? "";
    expect(text).toContain("오류가 발생했습니다");
    expect(document.querySelector(".portal-shell__content-area")).not.toBeNull();
    expect(document.querySelector('input[placeholder="메뉴명 검색"]')).not.toBeNull();
  });

  it("화면 import 가 실패하면 탭이 로딩에 멈추지 않고 오류 문구를 보인다", async () => {
    rendered = renderShell(async () => {
      throw new Error("Failed to load chunk");
    });
    await flush();

    expect(document.querySelector(".portal-shell__loading")).toBeNull();
    expect(document.querySelector(".portal-shell__error")?.textContent).toContain(
      `화면을 불러오지 못했습니다: ${PAGE_ID}`
    );
  });
});
