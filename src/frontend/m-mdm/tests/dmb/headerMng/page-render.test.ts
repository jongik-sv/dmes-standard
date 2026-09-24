/** @vitest-environment happy-dom */

// TSK-05-02 design.md §3.4 추가 — headerMng 화면 렌더. 목록·빈 상태, 헤더 길이는 서버 TOTAL_LENGTH 가 아니라 항목에서 즉시
// 계산하고(불변 I11 — stub 은 일부러 999), 사용 전문 영향도가 보인다.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import HeaderMngPage from "../../../pages/dmb/headerMng/page";

const RBAC_STORE_KEY = "__dkOasisButtonRbacStore__";
const originalFetch = globalThis.fetch;
let container: HTMLDivElement;
let root: Root | null = null;

function ok(result: unknown) {
  return new Response(JSON.stringify({ meta: { success: true }, data: { result } }), { status: 200 });
}

function stubFetch(headers: unknown[]) {
  globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
    const u = String(url);
    if (u.startsWith("/api/mdm/oasis/headerMng/search")) return ok({ headers, eais: [] });
    if (u.startsWith("/api/mdm/oasis/headerMng/view")) {
      return ok({
        header: { LAYOUT_ID: 11, LAYOUT_NAME: "L2 구간 헤더", TOTAL_LENGTH: 999, VER: 0 },
        items: [
          { SEQ: 1, FILL_KIND: "CONST", COLUMN_PHYS: "LINE_CODE", DISPLAY_NAME: "라인코드", DOMAIN_LENGTH: 2, DEFAULT_VALUE: "B1", OFFSET: 0, LENGTH: 999 },
          { SEQ: 2, FILL_KIND: "AUTO", COLUMN_PHYS: "SEQUENCE_NO", DOMAIN_LENGTH: 4, DEFAULT_VALUE: "SEQ", OFFSET: 0, LENGTH: 999 },
          { SEQ: 3, FILL_KIND: "AUTO", COLUMN_PHYS: "LENGTH", DOMAIN_LENGTH: 5, DEFAULT_VALUE: "MSG_LENGTH", OFFSET: 0, LENGTH: 999 },
          { SEQ: 4, FILL_KIND: "AUTO", COLUMN_PHYS: "DATE", DOMAIN_LENGTH: 8, DEFAULT_VALUE: "SEND_TIME", OFFSET: 0, LENGTH: 999 },
          { SEQ: 5, FILL_KIND: "AUTO", COLUMN_PHYS: "TIME", DOMAIN_LENGTH: 6, DEFAULT_VALUE: "SEND_TIME", OFFSET: 0, LENGTH: 999 },
          { SEQ: 6, FILL_KIND: "FILLER", FILLER_LENGTH: 5, OFFSET: 0, LENGTH: 999 },
        ],
        usedBy: [{ LAYOUT_ID: 30, LAYOUT_NAME: "출측검사 실적 수신", SND_SYSTEM: "L2", RCV_SYSTEM: "MES", HEADER_SEQ: 2, TOTAL_LENGTH: 187 }],
        units: [],
      });
    }
    return new Response("{}", { status: 401 });
  }) as typeof fetch;
}

async function settle(ms = 300) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

async function render() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(DmesUiProvider, null, createElement(HeaderMngPage)));
  });
  await settle(50);
}

describe("headerMng page", () => {
  beforeEach(() => {
    delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} });
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    container?.remove();
    document.body.innerHTML = "";
    globalThis.fetch = originalFetch;
    vi.unstubAllGlobals();
    delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
  });

  it("조회 결과가 없으면 빈 상태 문구가 보인다", async () => {
    stubFetch([]);
    await render();
    expect(container.querySelector(".page-layout__footer-screen-id")?.textContent).toBe("headerMng");
    expect(container.querySelector("[data-testid=header-list-empty]")?.textContent).toBe("조회된 헤더가 없습니다");
  });

  it("헤더를 열면 헤더 길이를 항목에서 계산하고 사용 전문 영향도를 보인다", async () => {
    stubFetch([{ LAYOUT_ID: 11, LAYOUT_NAME: "L2 구간 헤더", ITEM_COUNT: 6, TOTAL_LENGTH: 30, USED_BY_COUNT: 1, VER: 0 }]);
    await render();
    expect(container.querySelector("[data-testid=header-list]")?.textContent).toContain("L2 구간 헤더");
    const cell = container.querySelector("[data-testid=header-list] .ag-row .ag-cell");
    expect(cell).not.toBeNull();
    await act(async () => {
      cell!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await settle();
    await settle(); // 새로 마운트된 그리드 둘(영향도·항목)이 행을 그릴 때까지
    expect(container.querySelector("[data-testid=header-length]")?.textContent).toBe("30 바이트 (6항목)");
    const usage = container.querySelector("[data-testid=header-usage]")?.textContent ?? "";
    expect(usage).toContain("출측검사 실적 수신");
    expect(usage).toContain("187");
    const offsets = [...container.querySelectorAll('[data-testid=header-items] .ag-cell[col-id="OFFSET"]')].map((c) => c.textContent);
    expect(offsets).toEqual(["0", "2", "6", "11", "19", "25"]);
    expect(container.textContent).not.toContain("999");
  });
});
