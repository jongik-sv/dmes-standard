/** @vitest-environment happy-dom */

// TSK-04-02 design.md §2 — unitMng 렌더 스모크(mdm-page-layout.test.ts 패턴). 폼 필수값 검증(클라이언트
// 사이드 필수 입력 표시)만 다루고 환산 계산은 다루지 않는다(e2e 가 서버 계산까지 확인한다).
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import UnitMngPage from "../../../pages/dma/unitMng/page";

const RBAC_STORE_KEY = "__dkOasisButtonRbacStore__";

let container: HTMLDivElement;
let root: Root | null = null;
const originalFetch = globalThis.fetch;

async function render() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(DmesUiProvider, null, createElement(UnitMngPage)));
  });
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Mantine 이 렌더 트리 안에 주입하는 <style> 태그의 원문 CSS 는 텍스트 검증에서 제외한다. */
function visibleText(el: Element): string {
  let out = "";
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? "";
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = (node as Element).tagName;
      if (tag === "STYLE" || tag === "SCRIPT") continue;
      out += visibleText(node as Element);
    }
  }
  return out;
}

describe("UnitMngPage", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/oasis/unitMng/search")) {
        return jsonResponse({
          data: { result: { list: [], dimensionOptions: [] } },
          meta: { success: true },
        });
      }
      if (url.includes("/api/auth/me")) {
        // PageLayout 버튼 RBAC 훅이 사용자 확인 뒤 버튼 활성 여부를 판정한다 — 클릭 상호작용을
        // 테스트하려면 SYSADMIN 와일드카드로 응답해 버튼이 disabled 로 막히지 않게 한다.
        return jsonResponse({ user: { id: "tester" } });
      }
      if (url.includes("/api/mcm/oasis/secUser/myButtonEndpoints")) {
        return jsonResponse({
          grids: { buttons: { rows: [{ objId: "*", action: "*", endpoint: "*", httpMethod: "*" }] } },
        });
      }
      return jsonResponse({}, 404);
    }) as typeof fetch;
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

  it("제목과 빈 상태(0건)를 그린다", async () => {
    await render();
    expect(visibleText(container)).toContain("단위 마스터");
    // AgDataGrid 의 빈 상태 오버레이 문구는 ag-grid 내부 렌더에 의존해 happy-dom 에서 안정적으로
    // 검증하기 어렵다 — GridPanel 헤더의 건수 표시(0건)로 "서버 데이터 없음"을 확인한다.
    expect(visibleText(container)).toContain("0건");
  });

  it("[단위 등록] 을 누르면 상세 폼이 빈 값으로 열린다", async () => {
    await render();
    const newButton = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "단위 등록");
    expect(newButton).toBeTruthy();
    await act(async () => {
      newButton!.click();
    });
    expect(visibleText(container)).not.toContain("목록에서 행을 선택하거나");
  });

  it("필수값 없이 저장하면 클라이언트 검증 오류가 표시된다", async () => {
    await render();
    const newButton = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "단위 등록");
    await act(async () => {
      newButton!.click();
    });
    const saveButton = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "저장");
    expect(saveButton).toBeTruthy();
    await act(async () => {
      saveButton!.click();
    });
    // ErrorModal 은 Mantine Portal 로 document.body 에 렌더된다(container 의 자손이 아니다).
    expect(visibleText(document.body)).toContain("단위 코드는 영문·숫자·밑줄 20자 이내여야 합니다.");
  });
});
