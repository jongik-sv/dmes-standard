/** @vitest-environment happy-dom */

// TSK-01-03 design.md §3.4 V1 — MdmPageLayout 이 shared PageLayout 에 제목·breadcrumb·screenId 를 넘기는지
// 실제 렌더로 본다(불변 규칙 I22). PageLayout 은 objId 가 있으면 /api/auth/me 를 부르고 globalThis 저장소에
// 캐시하므로(F43) 테스트마다 fetch 를 스텁하고 저장소를 지운다.
import { createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import { MdmPageLayout } from "@/shell";
import type { MdmGroupCode } from "@/shell";

const RBAC_STORE_KEY = "__dkOasisButtonRbacStore__";

let container: HTMLDivElement;
let root: Root | null = null;
const originalFetch = globalThis.fetch;

// PageLayout 의 RBAC 훅이 fetch 결과로 상태를 바꾸므로 비동기 act 안에서 렌더해 그 갱신까지 끝낸다.
async function render(element: ReactElement) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(DmesUiProvider, null, element));
  });
}

function layout(group: MdmGroupCode) {
  return createElement(
    MdmPageLayout,
    { group, screenId: "mdmSample", title: "MDM 샘플" },
    createElement("p", { className: "probe-body" }, "본문"),
  );
}

describe("MdmPageLayout", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async () => new Response("{}", { status: 401 })) as typeof fetch;
    delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    globalThis.fetch = originalFetch;
    delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
  });

  it("제목·breadcrumb·screenId·본문을 PageLayout 골격에 그린다", async () => {
    await render(layout("dma"));

    expect(container.querySelector(".page-layout__header")?.textContent).toContain("MDM 샘플");
    expect(container.querySelector(".page-layout__footer-breadcrumb")?.textContent).toBe(
      "마루 MDM > 용어·도메인 > MDM 샘플",
    );
    expect(container.querySelector(".page-layout__footer-screen-id")?.textContent).toBe("mdmSample");
    expect(container.querySelector(".probe-body")?.textContent).toBe("본문");
    // objId = screenId 면 PageLayout 이 버튼 RBAC 판정용으로 /api/auth/me 를 부른다(objId 가 없으면 부르지 않는다).
    const calledUrls = vi.mocked(globalThis.fetch).mock.calls.map((call) => String(call[0]));
    expect(calledUrls).toContain("/api/auth/me");
  });

  it("그룹이 바뀌면 breadcrumb 가운데 폴더 이름이 바뀐다", async () => {
    await render(layout("dme"));

    expect(container.querySelector(".page-layout__footer-breadcrumb")?.textContent).toBe(
      "마루 MDM > 업무기준 > MDM 샘플",
    );
  });
});
