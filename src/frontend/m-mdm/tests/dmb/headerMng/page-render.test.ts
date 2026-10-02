/** @vitest-environment happy-dom */

// TSK-05-02 design.md §3.4 추가 — headerMng 화면 렌더. 목록·빈 상태, 헤더 길이는 서버 TOTAL_LENGTH 가 아니라 항목에서 즉시
// 계산하고(불변 I11 — stub 은 일부러 999), 사용 전문 영향도가 보인다.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import HeaderMngPage from "../../../pages/dmb/headerMng/page";
import { takeMdmPageParams } from "../../../src/shell";

const RBAC_STORE_KEY = "__dkOasisButtonRbacStore__";
const originalFetch = globalThis.fetch;
let container: HTMLDivElement;
let root: Root | null = null;
let calls: Record<string, unknown>[] = [];
const searchParams = () => calls;
/** headerMng 로 간 모든 호출(시험 본문에서 검사한다). */
let allCalls: Array<{ url: string; action: string; params: Record<string, unknown> }> = [];
let viewOverride: Record<string, unknown> = {};
let saveResult: Record<string, unknown> | null = null;

/** 내 DRAFT(편집 가능) — 기본 view 응답. 현재 사용자는 /api/auth/me 의 tester 다. */
const MY_DRAFT = { VER: "1.000", VER_KIND: "MAJOR", STATUS: "DRAFT", STATE: "DRAFT", OWNER_ID: "tester", ROW_VERSION: 0, OWN_LENGTH: 30, LEGACY: "N" };

function ok(result: unknown) {
  return new Response(JSON.stringify({ meta: { success: true }, data: { result } }), { status: 200 });
}

/** admin 이면 RBAC 를 전권으로 stub 한다(편집 가능). 아니면 [조회] 권한만 있어 화면은 읽기 전용이다. */
function stubFetch(headers: unknown[], admin = false) {
  calls = [];
  allCalls = [];
  viewOverride = {};
  saveResult = null;
  globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    // [조회] 버튼은 RBAC 로 켜진다 — admin 이 아니면 조회 권한만 준다(저장 등은 그대로 읽기 전용).
    if (u === "/api/auth/me") return new Response(JSON.stringify({ user: { id: "tester" } }), { status: 200 });
    if (u === "/api/mcm/oasis/secUser/myButtonEndpoints") {
      const row = admin ? { objId: "*", action: "*" } : { objId: "headerMng", action: "search" };
      return new Response(JSON.stringify({ grids: { buttons: { rows: [row] } } }), { status: 200 });
    }
    const params = JSON.parse(String(init?.body ?? "{}")).params ?? {};
    if (u.startsWith("/api/mdm/oasis/headerMng/")) allCalls.push({ url: u, action: u.split("/").pop() ?? "", params });
    if (u.startsWith("/api/mdm/oasis/headerMng/search")) {
      calls.push(params);
      // optionsOnly 진입 호출은 서버가 목록 없이 콤보만 준다
      return ok({ headers: params.optionsOnly ? [] : headers, eais: [] });
    }
    if (u.startsWith("/api/mdm/oasis/headerMng/view")) {
      const selected = (viewOverride.selected as Record<string, unknown> | undefined) ?? MY_DRAFT;
      return ok({
        header: { LAYOUT_ID: params.layoutId ?? 11, LAYOUT_NAME: "L2 구간 헤더", TOTAL_LENGTH: 999, AUD_VER: 1 },
        selected, versions: [selected], editable: true, canNewMajor: false, canNewMinor: false,
        items: [
          { SEQ: 1, FILL_KIND: "CONST", COLUMN_PHYS: "LINE_CODE", DISPLAY_NAME: "라인코드", DOMAIN_LENGTH: 2, DEFAULT_VALUE: "B1", OFFSET: 0, LENGTH: 999 },
          { SEQ: 2, FILL_KIND: "AUTO", COLUMN_PHYS: "SEQUENCE_NO", DOMAIN_LENGTH: 4, DEFAULT_VALUE: "SEQ", OFFSET: 0, LENGTH: 999 },
          { SEQ: 3, FILL_KIND: "AUTO", COLUMN_PHYS: "LENGTH", DOMAIN_LENGTH: 5, DEFAULT_VALUE: "MSG_LENGTH", OFFSET: 0, LENGTH: 999 },
          { SEQ: 4, FILL_KIND: "AUTO", COLUMN_PHYS: "DATE", DOMAIN_LENGTH: 8, DEFAULT_VALUE: "SEND_TIME", OFFSET: 0, LENGTH: 999 },
          { SEQ: 5, FILL_KIND: "AUTO", COLUMN_PHYS: "TIME", DOMAIN_LENGTH: 6, DEFAULT_VALUE: "SEND_TIME", OFFSET: 0, LENGTH: 999 },
          { SEQ: 6, FILL_KIND: "FILLER", FILLER_LENGTH: 5, OFFSET: 0, LENGTH: 999 },
        ],
        usedBy: [
          { LAYOUT_ID: 30, LAYOUT_NAME: "출측검사 실적 수신", SND_SYSTEM: "L2", RCV_SYSTEM: "MES", HEADER_SEQ: 2, TOTAL_LENGTH: 187, VER: "1.000", STATE: "CURRENT" },
          { LAYOUT_ID: 30, LAYOUT_NAME: "출측검사 실적 수신", SND_SYSTEM: "L2", RCV_SYSTEM: "MES", HEADER_SEQ: 2, TOTAL_LENGTH: 187, VER: "1.001", STATE: "DRAFT" },
        ],
        units: [],
        ...viewOverride,
      });
    }
    if (u.startsWith("/api/mdm/oasis/headerMng/save")) {
      return ok(saveResult ?? { layoutId: params.layoutId ?? 11, ver: params.ver ?? "1.000", rowVersion: Number(params.rowVersion ?? -1) + 1,
        ownLength: 30, totalLength: 30 });
    }
    const action = u.split("/").pop() ?? "";
    if (u.startsWith("/api/mdm/oasis/headerMng/") && ["copy", "delete", "lock", "unlock", "handover"].includes(action)) {
      return ok({ layoutId: params.layoutId, ver: params.verKind === "MINOR" ? "1.001" : (params.ver ?? "2.000"), rowVersion: 0 });
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

/** 머리 [조회] — 첫 진입은 목록을 자동 조회하지 않으므로(cf4fbb05) 목록 행이 필요한 시험은 먼저 누른다. */
async function search() {
  const btn = Array.from(container.querySelectorAll(".page-layout__header-buttons button")).find((b) => b.textContent === "조회");
  expect(btn, "조회").toBeTruthy();
  await act(async () => {
    (btn as HTMLButtonElement).click();
  });
  await settle(50);
  await settle(50);
}

function byTestId(id: string): HTMLElement {
  const el = document.querySelector(`[data-testid="${id}"]`);
  expect(el, `testid ${id} 가 없다`).not.toBeNull();
  return el as HTMLElement;
}

/** 머리 [저장] — PageButton 은 testid 가 없어 글자로 찾는다. */
function saveButton(): HTMLButtonElement {
  const btn = Array.from(container.querySelectorAll(".page-layout__header-buttons button")).find((b) => b.textContent === "저장");
  expect(btn, "저장").toBeTruthy();
  return btn as HTMLButtonElement;
}

function lastCall(action?: string) {
  const list = action ? allCalls.filter((c) => c.action === action) : allCalls;
  expect(list.length, `${action ?? "호출"} 이 없다`).toBeGreaterThan(0);
  return list[list.length - 1];
}

function mockView(over: Record<string, unknown>) {
  viewOverride = over;
}

async function click(el: Element | null) {
  expect(el, "클릭 대상이 없다").not.toBeNull();
  await act(async () => {
    (el as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await settle(50);
  await settle(50);
}

/** [조회] → 첫 행(헤더 id)을 눌러 연다. stubFetch 를 먼저 불러 둔다. */
async function openHeader() {
  await render();
  await search();
  await click(container.querySelector("[data-testid=header-list] .ag-row .ag-cell"));
  await settle();
}

const HEADER_ROW = { LAYOUT_ID: 11, LAYOUT_NAME: "L2 구간 헤더", ITEM_COUNT: 6, TOTAL_LENGTH: 30, USED_BY_COUNT: 1, AUD_VER: 1,
  HEADER_VER: "1.001", HEADER_STATE: "DRAFT" };

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
    stubFetch([HEADER_ROW]);
    await render();
    // 첫 진입은 콤보만 받고(optionsOnly) 목록은 비어 있다 — [조회] 를 눌러야 목록이 찬다(cf4fbb05).
    expect(searchParams()).toEqual([{ optionsOnly: true }]);
    expect(container.querySelector("[data-testid=header-list]")?.textContent ?? "").not.toContain("L2 구간 헤더");
    await search();
    expect(searchParams()).toHaveLength(2);
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
    // 사용 전문은 전문 버전마다 한 행이다(같은 전문의 현재·DRAFT 가 둘 다 보인다)
    expect(usage).toContain("v1.000");
    expect(usage).toContain("v1.001");
    expect(usage).toContain("헤더 변경은 확정 apply_from 부터 사용 전문에 반영됩니다(전문 버전은 생기지 않음)");
    expect(container.querySelector("[data-testid=header-list]")?.textContent).toContain("v1.001");
    // 헤더는 시각 합성 대상이 아니다 — T 입력이 없다
    expect(document.querySelector("[data-testid=header-asof]")).toBeNull();
    const offsets = [...container.querySelectorAll('[data-testid=header-items] .ag-cell[col-id="OFFSET"]')].map((c) => c.textContent);
    expect(offsets).toEqual(["0", "2", "6", "11", "19", "25"]);
    expect(container.textContent).not.toContain("999");
  });

  it("released version opens read-only with major/minor buttons and confirm goes to layoutConfirm", async () => {
    stubFetch([HEADER_ROW], true);
    mockView({ editable: false, canNewMajor: true, canNewMinor: true, nextMajor: "2.000", nextMinor: "1.001",
      selected: { VER: "1.000", VER_KIND: "MAJOR", STATUS: "RELEASED", STATE: "CURRENT", OWNER_ID: null, ROW_VERSION: 1, OWN_LENGTH: 30, LEGACY: "N" } });
    await openHeader();
    expect(saveButton().hasAttribute("disabled")).toBe(true);
    expect((byTestId("header-form-name") as HTMLInputElement).disabled).toBe(true);
    expect(byTestId("header-ver-new-minor").hasAttribute("disabled")).toBe(false);
    expect(byTestId("header-ver-new-major").hasAttribute("disabled")).toBe(false);
    expect(byTestId("header-ver-confirm").hasAttribute("disabled")).toBe(true);
    await click(byTestId("header-ver-new-minor"));
    expect(lastCall("copy").url).toContain("/oasis/headerMng/copy");
    expect(lastCall("copy").params).toEqual({ layoutId: 11, verKind: "MINOR" });
    expect(lastCall().action).toBe("view");
    expect(lastCall().params).toMatchObject({ layoutId: 11, ver: "1.001" });
  });

  it("my draft is editable, save sends ver and rowVersion, confirm hands off the minor version string", async () => {
    stubFetch([HEADER_ROW], true);
    mockView({ editable: true,
      selected: { VER: "1.001", VER_KIND: "MINOR", STATUS: "DRAFT", STATE: "DRAFT", OWNER_ID: "tester", ROW_VERSION: 3, OWN_LENGTH: 30, LEGACY: "N" } });
    await openHeader();
    expect(saveButton().hasAttribute("disabled")).toBe(false);
    await click(saveButton());
    expect(lastCall("save").params).toMatchObject({ layoutId: 11, ver: "1.001", rowVersion: 3 });
    const opened = vi.fn();
    window.addEventListener("portal-open-tab", opened);
    await click(byTestId("header-ver-confirm"));
    window.removeEventListener("portal-open-tab", opened);
    expect(opened).toHaveBeenCalledTimes(1);
    expect(takeMdmPageParams("dmb/layoutConfirm")).toEqual({ layoutId: "11", ver: "1.001" });
  });

  it("버전을 고르면 그 버전으로 다시 읽는다", async () => {
    stubFetch([HEADER_ROW]);
    const released = { VER: "1.000", VER_KIND: "MAJOR", STATUS: "RELEASED", STATE: "CURRENT", OWNER_ID: null, ROW_VERSION: 1, OWN_LENGTH: 30, LEGACY: "N" };
    mockView({ versions: [{ ...MY_DRAFT, VER: "1.001" }, released], selected: { ...MY_DRAFT, VER: "1.001" } });
    await openHeader();
    const sel = byTestId("header-ver-select") as HTMLSelectElement;
    expect(Array.from(sel.options).map((o) => o.textContent)).toEqual(["v1.001 작성 중", "v1.000 현재"]);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(sel, "1.000");
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle(50);
    expect(lastCall().action).toBe("view");
    expect(lastCall().params).toMatchObject({ layoutId: 11, ver: "1.000" });
  });

  it("저장 응답에 recalculated 가 없어도 오류 없이 저장했습니다 를 보인다", async () => {
    stubFetch([HEADER_ROW], true);
    mockView({ editable: true });
    await openHeader();
    saveResult = { layoutId: 11, ver: "1.000", rowVersion: 1, ownLength: 30, totalLength: 30 };
    // 사용 전문이 있어도 저장 전에 재계산 확인을 묻지 않는다(DRAFT 저장은 사용 전문을 바꾸지 않는다)
    await click(saveButton());
    expect(lastCall("save").params).toMatchObject({ layoutId: 11, ver: "1.000", rowVersion: 0 });
    expect(document.body.textContent).toContain("저장했습니다.");
    expect(document.body.textContent).not.toContain("다시 계산했습니다");
    expect(document.querySelector(".error-modal__body")).toBeNull();
  });
});
