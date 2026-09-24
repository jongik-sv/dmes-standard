/** @vitest-environment happy-dom */

// TSK-05-02 design.md §3.4 — layoutMng 화면 렌더. M201 view(헤더 2·본문 4)를 받으면 총 길이 187·본문 첫 오프셋 130 이 보이고
// (수용 기준 6 화면 쪽), 값은 서버 TOTAL_LENGTH 가 아니라 화면 즉시 계산이다(불변 I11 — stub 은 일부러 999 를 준다).
// 상수 편집 모달에는 CONST 8행만 있고 AUTO·FILLER 는 없으며 헤더 기본값 칸은 입력이 아니다(수용 기준 3, 불변 I20).
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import LayoutMngPage from "../../../pages/dmb/layoutMng/page";

const RBAC_STORE_KEY = "__dkOasisButtonRbacStore__";
const originalFetch = globalThis.fetch;
let container: HTMLDivElement;
let root: Root | null = null;
let actions: string[] = [];

function item(seq: number, fill: string, phys: string | null, len: number, extra: Record<string, unknown> = {}) {
  return { SEQ: seq, FILL_KIND: fill, COLUMN_PHYS: phys, DISPLAY_NAME: phys ? `${phys} 이름` : null, DOMAIN_LENGTH: fill === "FILLER" ? null : len,
    FILLER_LENGTH: fill === "FILLER" ? len : null, DATA_TYPE: "STRING", OFFSET: 0, LENGTH: len, ...extra };
}

const L100 = [
  item(1, "AUTO", "TC_CD", 8, { DEFAULT_VALUE: "LAYOUT_ID" }), item(2, "CONST", "SND_FAC_TP", 4, { DEFAULT_VALUE: "B0", DISPLAY_NAME: "송신공장구분" }),
  item(3, "CONST", "SND_PROC_TP", 3, { DEFAULT_VALUE: "L2" }), item(4, "CONST", "RCV_FAC_TP", 4, { DEFAULT_VALUE: "B1" }),
  item(5, "CONST", "RCV_PROC_TP", 3, { DEFAULT_VALUE: "MES" }), item(6, "AUTO", "SNT_SND_HRP", 14, { DEFAULT_VALUE: "SEND_TIME" }),
  item(7, "CONST", "SND_PGM_ID", 14, { DEFAULT_VALUE: "L2IFSND" }), item(8, "CONST", "EAI_IF_ID", 12),
  item(9, "CONST", "SNT_TP", 1, { DEFAULT_VALUE: "S" }), item(10, "AUTO", "SNT_ORD", 5, { DEFAULT_VALUE: "SEQ" }),
  item(11, "CONST", "IF_DATA_NTR", 1, { DEFAULT_VALUE: "I" }), item(12, "AUTO", "SNT_LTH", 6, { DEFAULT_VALUE: "MSG_LENGTH" }),
  item(13, "FILLER", null, 25),
];
const L110 = [
  item(1, "CONST", "LINE_CODE", 2, { DEFAULT_VALUE: "B1" }), item(2, "AUTO", "SEQUENCE_NO", 4, { DEFAULT_VALUE: "SEQ" }),
  item(3, "AUTO", "LENGTH", 5, { DEFAULT_VALUE: "MSG_LENGTH" }), item(4, "AUTO", "DATE", 8, { DEFAULT_VALUE: "SEND_TIME" }),
  item(5, "AUTO", "TIME", 6, { DEFAULT_VALUE: "SEND_TIME" }), item(6, "FILLER", null, 5),
];
const BODY = [
  item(1, "DATA", "COIL_ID", 20), item(2, "DATA", "PROD_DT", 8),
  item(3, "DATA", "EXIT_COIL_THK", 3, { DATA_TYPE: "NUMBER", SCALE: 1, NUM_FORMAT: "SIGN=N;ZERO=Y;SCALE=1;WIDTH=4" }),
  item(4, "FILLER", null, 25),
];

function ok(result: unknown) {
  return new Response(JSON.stringify({ meta: { success: true }, data: { result } }), { status: 200 });
}

function stubFetch() {
  actions = [];
  globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.startsWith("/api/mdm/oasis/layoutMng/")) {
      const action = u.split("/").pop() ?? "";
      actions.push(action);
      if (action === "search") {
        return ok({
          layouts: [{ LAYOUT_ID: 30, LAYOUT_NAME: "출측검사 실적 수신", EAI_CODE: "GLUE", SND_SYSTEM: "L2", RCV_SYSTEM: "MES",
            HEADER_SUMMARY: "GLUE 공통 헤더 (100) + L2 구간 헤더 (30)", ITEM_COUNT: 4, TOTAL_LENGTH: 187, LAYOUT_VERSION: 0, VER: 1 }],
          systems: [{ SYSTEM_CODE: "L2", SYSTEM_NAME: "레벨2" }, { SYSTEM_CODE: "MES", SYSTEM_NAME: "MES" }],
          eais: [{ EAI_CODE: "GLUE", EAI_NAME: "GLUE", ENCODING: "EUC-KR", HEADER_LAYOUT_ID: 10 }],
          headers: [{ LAYOUT_ID: 10, LAYOUT_NAME: "GLUE 공통 헤더", TOTAL_LENGTH: 100 }, { LAYOUT_ID: 11, LAYOUT_NAME: "L2 구간 헤더", TOTAL_LENGTH: 30 }],
        });
      }
      if (action === "view") {
        expect(JSON.parse(String(init?.body)).params).toEqual({ layoutId: 30 });
        return ok({
          // 서버가 준 합계가 틀려도(999) 화면은 항목에서 다시 계산한다
          layout: { LAYOUT_ID: 30, LAYOUT_NAME: "출측검사 실적 수신", EAI_CODE: "GLUE", SND_SYSTEM: "L2", RCV_SYSTEM: "MES",
            TOTAL_LENGTH: 999, HEADER_LENGTH: 999, LAYOUT_VERSION: 0, VER: 1 },
          headers: [
            { SEQ: 1, HEADER_LAYOUT_ID: 10, HEADER_NAME: "GLUE 공통 헤더", EAI_CODE: "GLUE", TOTAL_LENGTH: 100, OFFSET: 0, items: L100 },
            { SEQ: 2, HEADER_LAYOUT_ID: 11, HEADER_NAME: "L2 구간 헤더", TOTAL_LENGTH: 30, OFFSET: 100, items: L110 },
          ],
          items: BODY.map((b) => ({ ...b, OFFSET: 0, LENGTH: 999 })),
          units: [{ UNIT_CODE: "mm", DIMENSION: "LENGTH", BASE_UNIT: "mm" }],
        });
      }
    }
    return new Response("{}", { status: 401 });
  }) as typeof fetch;
}

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
}

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 300));
  });
}

async function render() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(DmesUiProvider, null, createElement(LayoutMngPage)));
  });
  await flush();
}

async function click(el: Element | null) {
  expect(el, "클릭 대상이 없다").not.toBeNull();
  await act(async () => {
    (el as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flush();
}

describe("layoutMng page", () => {
  beforeEach(() => {
    delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} });
    stubFetch();
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

  it("목록을 서버 데이터로 채우고 screen-id 는 layoutMng 이다", async () => {
    await render();
    expect(container.querySelector(".page-layout__footer-screen-id")?.textContent).toBe("layoutMng");
    expect(container.querySelector("[data-testid=layout-list]")?.textContent).toContain("출측검사 실적 수신");
    expect(actions).toEqual(["search"]);
  });

  it("M201 을 열면 총 길이 187·본문 첫 오프셋 130 을 화면에서 계산해 보인다", async () => {
    await render();
    await click(container.querySelector("[data-testid=layout-list] .ag-row .ag-cell"));
    expect(actions).toContain("view");
    const total = container.querySelector("[data-testid=layout-total-length]")?.textContent ?? "";
    expect(total).toContain("187 바이트");
    expect(total).toBe("헤더 130 (100 + 30) + 본문 57 (20 + 8 + 4 + 25) = 187 바이트");
    expect(container.querySelector("[data-testid=layout-body-summary]")?.textContent).toContain("본문 첫 오프셋 130");
    expect(container.textContent).not.toContain("999");
  });

  it("상수 편집 모달에는 CONST 8행만 있고 헤더 기본값은 입력이 아니다", async () => {
    await render();
    await click(container.querySelector("[data-testid=layout-list] .ag-row .ag-cell"));
    await settle(); // 새로 마운트된 헤더 구성 그리드가 행을 그릴 때까지
    await click(document.querySelector("[data-testid=const-edit-open-1]"));
    const modal = document.querySelector("[data-testid=const-edit-modal]");
    expect(modal).not.toBeNull();
    const inputs = modal!.querySelectorAll("[data-testid^=const-input-]");
    expect(inputs.length).toBe(8);
    expect(modal!.querySelector("[data-testid=const-input-TC_CD]")).toBeNull();
    expect(modal!.querySelector("[data-testid=const-input-SNT_SND_HRP]")).toBeNull();
    const def = modal!.querySelector("[data-testid=const-default-SND_FAC_TP]");
    expect(def?.textContent).toBe("B0");
    expect(def?.tagName).not.toBe("INPUT");
    expect(def?.querySelector("input")).toBeNull();
    expect((modal!.querySelector("[data-testid=const-input-SND_FAC_TP]") as HTMLInputElement).placeholder).toBe("B0");
    // 헤더 항목의 길이·순서를 바꾸는 입력은 화면 어디에도 없다
    expect(document.querySelectorAll("[data-testid=header-item-length]").length).toBe(0);
  });
});
