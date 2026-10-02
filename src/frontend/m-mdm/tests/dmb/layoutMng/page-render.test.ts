/** @vitest-environment happy-dom */

// TSK-05-02 design.md §3.4 — layoutMng 화면 렌더. M201 view(헤더 2·본문 4)를 받으면 총 길이 187·본문 첫 오프셋 130 이 보이고
// (수용 기준 6 화면 쪽), 값은 서버 TOTAL_LENGTH 가 아니라 화면 즉시 계산이다(불변 I11 — stub 은 일부러 999 를 준다).
// 상수 편집 모달에는 CONST 8행만 있고 AUTO·FILLER 는 없으며 헤더 기본값 칸은 입력이 아니다(수용 기준 3, 불변 I20).
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import LayoutMngPage from "../../../pages/dmb/layoutMng/page";
import { takeMdmPageParams } from "../../../src/shell";
import { pickDateTime } from "../../helpers/datetime-picker";

const RBAC_STORE_KEY = "__dkOasisButtonRbacStore__";
const originalFetch = globalThis.fetch;
let container: HTMLDivElement;
let root: Root | null = null;
let actions: string[] = [];
let searchParams: Record<string, unknown>[] = [];
/** layoutMng 로 간 모든 호출(시험 본문에서 검사한다 — stub 안의 expect 는 화면의 try/catch 에 삼켜진다). */
let calls: Array<{ url: string; action: string; params: Record<string, unknown> }> = [];
/** 목록 행의 레이아웃 ID(openLayout 이 바꾼다). */
let listId = 30;
/** 목록 행의 총 길이(null = 쌓인 헤더에 지금 확정 버전이 없음). */
let listTotal: number | null = 187;
/** view 응답에 덮어쓸 버전 칸(selected·versions·editable·플래그). */
let viewOverride: Record<string, unknown> = {};

/** 내 DRAFT(편집 가능) — 기본 view 응답. 현재 사용자는 /api/auth/me 의 tester 다. */
const MY_DRAFT = { VER: "1.000", VER_KIND: "MAJOR", STATUS: "DRAFT", STATE: "DRAFT", OWNER_ID: "tester", ROW_VERSION: 0, OWN_LENGTH: 57, LEGACY: "N" };

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

/** admin 이면 RBAC 를 전권으로 stub 한다(편집 가능). 아니면 [조회] 권한만 있어 화면은 읽기 전용이다. */
function stubFetch(admin = false) {
  actions = [];
  searchParams = [];
  calls = [];
  viewOverride = {};
  listTotal = 187;
  globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    // [조회] 버튼은 RBAC 로 켜진다 — admin 이 아니면 조회 권한만 준다(편집은 읽기 전용 그대로).
    if (u === "/api/auth/me") return new Response(JSON.stringify({ user: { id: "tester" } }), { status: 200 });
    if (u === "/api/mcm/oasis/secUser/myButtonEndpoints") {
      const row = admin ? { objId: "*", action: "*" } : { objId: "layoutMng", action: "search" };
      return new Response(JSON.stringify({ grids: { buttons: { rows: [row] } } }), { status: 200 });
    }
    if (u.startsWith("/api/mdm/oasis/layoutMng/")) {
      const action = u.split("/").pop() ?? "";
      actions.push(action);
      const params = JSON.parse(String(init?.body ?? "{}")).params ?? {};
      calls.push({ url: u, action, params });
      if (action === "search") {
        searchParams.push(params);
        return ok({
          // optionsOnly 진입 호출은 서버가 목록 없이 콤보만 준다
          layouts: params.optionsOnly ? [] : [{ LAYOUT_ID: listId, LAYOUT_NAME: "출측검사 실적 수신", EAI_CODE: "GLUE", SND_SYSTEM: "L2", RCV_SYSTEM: "MES",
            HEADER_SUMMARY: "GLUE 공통 헤더 (100) + L2 구간 헤더 (30)", ITEM_COUNT: 4, TOTAL_LENGTH: listTotal, STATUS: "INUSE", AUD_VER: 1,
            CURRENT_VER: "1.000", DRAFT_VER: "1.001", DRAFT_OWNER: "tester" }],
          systems: [{ SYSTEM_CODE: "L2", SYSTEM_NAME: "레벨2" }, { SYSTEM_CODE: "MES", SYSTEM_NAME: "MES" }],
          eais: [{ EAI_CODE: "GLUE", EAI_NAME: "GLUE", ENCODING: "EUC-KR", HEADER_LAYOUT_ID: 10 }],
          headers: [{ LAYOUT_ID: 10, LAYOUT_NAME: "GLUE 공통 헤더", TOTAL_LENGTH: 100 }, { LAYOUT_ID: 11, LAYOUT_NAME: "L2 구간 헤더", TOTAL_LENGTH: 30 }],
        });
      }
      if (action === "view") {
        const selected = (viewOverride.selected as Record<string, unknown> | undefined) ?? MY_DRAFT;
        return ok({
          // 서버가 준 합계가 틀려도(999) 화면은 항목에서 다시 계산한다
          layout: { LAYOUT_ID: params.layoutId, LAYOUT_NAME: "출측검사 실적 수신", EAI_CODE: "GLUE", SND_SYSTEM: "L2", RCV_SYSTEM: "MES",
            TOTAL_LENGTH: 999, HEADER_LENGTH: 999, AUD_VER: 1 },
          selected, versions: [selected], editable: true, canNewMajor: false, canNewMinor: false,
          headers: [
            { SEQ: 1, HEADER_LAYOUT_ID: 10, HEADER_NAME: "GLUE 공통 헤더", EAI_CODE: "GLUE", TOTAL_LENGTH: 100, OFFSET: 0, items: L100,
              HEADER_VER: "1.001", HEADER_STATE: "CURRENT" },
            { SEQ: 2, HEADER_LAYOUT_ID: 11, HEADER_NAME: "L2 구간 헤더", TOTAL_LENGTH: 30, OFFSET: 100, items: L110,
              HEADER_VER: "2.000", HEADER_STATE: "FUTURE" },
          ],
          items: BODY.map((b) => ({ ...b, OFFSET: 0, LENGTH: 999 })),
          units: [{ UNIT_CODE: "mm", DIMENSION: "LENGTH", BASE_UNIT: "mm" }],
          ...viewOverride,
        });
      }
      if (action === "save") {
        return ok({ layoutId: params.layoutId ?? listId, ver: params.ver ?? "1.000", rowVersion: Number(params.rowVersion ?? -1) + 1,
          ownLength: 57, headerLength: 130, totalLength: 187, asOf: "2026-10-02 10:00:00" });
      }
      if (["copy", "delete", "lock", "unlock", "handover"].includes(action)) {
        return ok({ layoutId: params.layoutId, ver: params.verKind === "MINOR" ? "1.001" : (params.ver ?? "2.000"), rowVersion: 0 });
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

/** 머리 [조회] — 첫 진입은 목록을 자동 조회하지 않으므로(cf4fbb05) 목록 행이 필요한 시험은 먼저 누른다. */
async function search() {
  const btn = Array.from(container.querySelectorAll(".page-layout__header-buttons button")).find((b) => b.textContent === "조회");
  expect(btn, "조회").toBeTruthy();
  await act(async () => {
    (btn as HTMLButtonElement).click();
  });
  await flush();
  await flush();
}

async function click(el: Element | null) {
  expect(el, "클릭 대상이 없다").not.toBeNull();
  await act(async () => {
    (el as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flush();
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

/** 마지막 호출(action 을 주면 그 action 의 마지막 호출). 새 버전·저장 뒤에는 view 로 다시 읽으므로 action 으로 고른다. */
function lastCall(action?: string) {
  const list = action ? calls.filter((c) => c.action === action) : calls;
  expect(list.length, `${action ?? "호출"} 이 없다`).toBeGreaterThan(0);
  return list[list.length - 1];
}

function mockView(over: Record<string, unknown>) {
  viewOverride = over;
}

/** 목록에 id 를 두고 [조회] → 첫 행을 눌러 연다. */
async function openLayout(id: number) {
  listId = id;
  await render();
  await search();
  await click(container.querySelector("[data-testid=layout-list] .ag-row .ag-cell"));
  await flush();
}

async function changeSelect(el: HTMLElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await flush();
  await flush();
}

/** 그리드 칸을 누른다(singleClickEdit 은 칸의 mousedown·click 으로 편집을 연다). */
async function clickCell(inCell: Element) {
  const cell = inCell.closest(".ag-cell") as HTMLElement;
  expect(cell, "그리드 칸이 없다").not.toBeNull();
  await act(async () => {
    cell.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    cell.dispatchEvent(new MouseEvent("click", { bubbles: true }));
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
    // 첫 진입은 목록을 조회하지 않고 콤보만 받는다(optionsOnly) — 목록은 비어 있다(cf4fbb05).
    expect(actions).toEqual(["search"]);
    expect(searchParams).toEqual([{ optionsOnly: true }]);
    expect(container.querySelector("[data-testid=layout-list]")?.textContent ?? "").not.toContain("출측검사 실적 수신");
    await search();
    expect(container.querySelector("[data-testid=layout-list]")?.textContent).toContain("출측검사 실적 수신");
    expect(actions).toEqual(["search", "search"]);
    expect(searchParams[1]).not.toHaveProperty("optionsOnly");
  });

  it("M201 을 열면 총 길이 187·본문 첫 오프셋 130 을 화면에서 계산해 보인다", async () => {
    await render();
    await search();
    await click(container.querySelector("[data-testid=layout-list] .ag-row .ag-cell"));
    expect(actions).toContain("view");
    // 처음 열 때는 버전·시각을 보내지 않는다(서버가 내 DRAFT 우선, 없으면 지금 시점 현재 버전을 고른다)
    expect(lastCall("view").params).toEqual({ layoutId: 30 });
    const total = container.querySelector("[data-testid=layout-total-length]")?.textContent ?? "";
    expect(total).toContain("187 바이트");
    expect(total).toBe("헤더 130 (100 + 30) + 본문 57 (20 + 8 + 4 + 25) = 187 바이트");
    expect(container.querySelector("[data-testid=layout-body-summary]")?.textContent).toContain("본문 첫 오프셋 130");
    expect(container.textContent).not.toContain("999");
  });

  it("상수 편집 모달에는 CONST 8행만 있고 헤더 기본값은 입력이 아니다", async () => {
    await render();
    await search();
    await click(container.querySelector("[data-testid=layout-list] .ag-row .ag-cell"));
    await settle(); // 새로 마운트된 헤더 구성 그리드가 행을 그릴 때까지
    await click(document.querySelector("[data-testid=const-edit-open-1]"));
    await settle(); // 모달 안 그리드가 행을 그릴 때까지
    const modal = document.querySelector("[data-testid=const-edit-modal]");
    expect(modal).not.toBeNull();
    // 이 전문의 값 칸은 CONST 항목마다 하나다(AUTO 는 없다)
    expect(modal!.querySelectorAll("[data-testid^=const-input-]").length).toBe(8);
    expect(modal!.querySelector("[data-testid=const-input-TC_CD]")).toBeNull();
    expect(modal!.querySelector("[data-testid=const-input-SNT_SND_HRP]")).toBeNull();
    const def = modal!.querySelector("[data-testid=const-default-SND_FAC_TP]");
    expect(def?.textContent).toBe("B0");
    expect(def?.tagName).not.toBe("INPUT");
    expect(def?.querySelector("input")).toBeNull();
    // 값이 비면 헤더 기본값을 흐리게 보인다(입력칸 placeholder 대신)
    expect(modal!.querySelector("[data-testid=const-input-SND_FAC_TP]")?.textContent).toBe("B0");
    // 헤더 기본값 칸은 눌러도 편집기가 열리지 않는다. 이 사례는 권한이 없어 값 칸도 읽기 전용이다
    await clickCell(def!);
    expect(def!.closest(".ag-cell")!.querySelector("input")).toBeNull();
    const value = modal!.querySelector("[data-testid=const-input-SND_FAC_TP]")!;
    await clickCell(value);
    expect(value.closest(".ag-cell")!.querySelector("input")).toBeNull();
    // 헤더 항목의 길이·순서를 바꾸는 입력은 화면 어디에도 없다
    expect(document.querySelectorAll("[data-testid=header-item-length]").length).toBe(0);
  });

  it("편집 권한이 있으면 값 칸을 눌러 재정의하고 재정의 배지가 붙는다", async () => {
    stubFetch(true);
    await render();
    await search();
    await click(container.querySelector("[data-testid=layout-list] .ag-row .ag-cell"));
    await settle();
    await click(document.querySelector("[data-testid=const-edit-open-1]"));
    await settle();
    const modal = document.querySelector("[data-testid=const-edit-modal]")!;
    const value = () => modal.querySelector("[data-testid=const-input-SND_FAC_TP]")!;
    const rowText = () => value().closest(".ag-row")!.textContent;
    expect(value().textContent).toBe("B0");
    expect(rowText()).not.toContain("재정의");
    // 헤더 기본값 칸은 권한이 있어도 편집기가 열리지 않는다
    const def = modal.querySelector("[data-testid=const-default-SND_FAC_TP]")!;
    await clickCell(def);
    expect(def.closest(".ag-cell")!.querySelector("input")).toBeNull();
    const cell = value().closest(".ag-cell")!; // 편집 중에는 칸 내용이 편집기로 바뀌므로 칸을 먼저 잡아 둔다
    await clickCell(cell);
    const input = cell.querySelector("input");
    expect(input, "값 칸 편집기가 열리지 않았다").not.toBeNull();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "B9");
      input!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => input!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    await flush();
    await flush();
    expect(value().textContent).toBe("B9");
    expect(rowText()).toContain("재정의");
  });

  it("목록에 현재 버전과 DRAFT(소유자) 열이 보이고 옛 버전 칸은 없다", async () => {
    await render();
    await search();
    const list = container.querySelector("[data-testid=layout-list]")?.textContent ?? "";
    expect(list).toContain("v1.000");
    expect(list).toContain("v1.001 (tester)");
  });

  it("released version opens read-only with major/minor buttons and confirm goes to layoutConfirm", async () => {
    stubFetch(true);
    mockView({ editable: false, canNewMajor: true, canNewMinor: true, nextMajor: "2.000", nextMinor: "1.001",
      selected: { VER: "1.000", VER_KIND: "MAJOR", STATUS: "RELEASED", STATE: "CURRENT", OWNER_ID: null, ROW_VERSION: 1, OWN_LENGTH: 57, LEGACY: "N" } });
    await openLayout(201);
    expect(saveButton().hasAttribute("disabled")).toBe(true);
    expect((byTestId("layout-form-name") as HTMLInputElement).disabled).toBe(true);
    expect(byTestId("layout-ver-new-minor").hasAttribute("disabled")).toBe(false);
    expect(byTestId("layout-ver-new-major").hasAttribute("disabled")).toBe(false);
    expect(byTestId("layout-ver-confirm").hasAttribute("disabled")).toBe(true);
    await click(byTestId("layout-ver-new-minor"));
    await flush();
    expect(lastCall("copy").url).toContain("/oasis/layoutMng/copy");
    expect(lastCall("copy").params).toEqual({ layoutId: 201, verKind: "MINOR" });
    // 새 버전을 만들면 그 버전으로 다시 읽는다
    expect(lastCall().action).toBe("view");
    expect(lastCall().params).toMatchObject({ layoutId: 201, ver: "1.001" });
  });

  it("my draft is editable, save sends ver and rowVersion, confirm hands off the minor version string", async () => {
    stubFetch(true);
    mockView({ editable: true, canNewMajor: false, canNewMinor: false,
      selected: { VER: "1.001", VER_KIND: "MINOR", STATUS: "DRAFT", STATE: "DRAFT", OWNER_ID: "tester", ROW_VERSION: 3, OWN_LENGTH: 57, LEGACY: "N" } });
    await openLayout(201);
    expect(saveButton().hasAttribute("disabled")).toBe(false);
    expect((byTestId("layout-form-name") as HTMLInputElement).disabled).toBe(false);
    await click(saveButton());
    await flush();
    expect(lastCall("save").params).toMatchObject({ layoutId: 201, ver: "1.001", rowVersion: 3 });
    const opened = vi.fn();
    window.addEventListener("portal-open-tab", opened);
    await click(byTestId("layout-ver-confirm"));
    window.removeEventListener("portal-open-tab", opened);
    expect(opened).toHaveBeenCalledTimes(1);
    expect(takeMdmPageParams("dmb/layoutConfirm")).toEqual({ layoutId: "201", ver: "1.001" });
  });

  it("changing T re-reads the layout with asOf", async () => {
    mockView({ editable: false, selected: { VER: "1.000", VER_KIND: "MAJOR", STATUS: "RELEASED", STATE: "CURRENT", ROW_VERSION: 1, OWN_LENGTH: 57, LEGACY: "N" } });
    await openLayout(201);
    await pickDateTime(() => byTestId("layout-asof"), "2026-07-01 00:00:00");
    await flush();
    expect(lastCall().url).toContain("/oasis/layoutMng/view");
    expect(lastCall().params).toMatchObject({ layoutId: 201, asOf: "2026-07-01 00:00:00" });
  });

  it("버전을 고르면 그 버전으로 다시 읽고, 이행 전 스냅샷은 읽기 전용 안내를 보인다", async () => {
    const legacy = { VER: "1.000", VER_KIND: "MAJOR", STATUS: "RELEASED", STATE: "PAST", OWNER_ID: null, ROW_VERSION: 1, OWN_LENGTH: 57, LEGACY: "Y" };
    mockView({ editable: true, versions: [{ ...MY_DRAFT, VER: "1.001" }, legacy], selected: { ...MY_DRAFT, VER: "1.001" } });
    await openLayout(201);
    const sel = byTestId("layout-ver-select") as HTMLSelectElement;
    expect(Array.from(sel.options).map((o) => o.textContent)).toContain("v1.000 지난 버전");
    mockView({ editable: false, versions: [legacy], selected: legacy });
    await changeSelect(sel, "1.000");
    expect(lastCall().params).toMatchObject({ layoutId: 201, ver: "1.000" });
    expect(container.textContent).toContain("이행 전 스냅샷(읽기 전용)");
  });

  it("헤더 구성 표에 판정 시각 T 의 헤더 버전·상태 열이 보인다", async () => {
    await openLayout(201);
    await flush();
    const rows = Array.from(document.querySelectorAll("[data-testid=layout-header-stack] .ag-center-cols-container .ag-row"))
      .sort((a, b) => Number(a.getAttribute("row-index")) - Number(b.getAttribute("row-index")));
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector("[col-id=HEADER_VER]")?.textContent).toBe("v1.001");
    expect(rows[0].querySelector("[col-id=HEADER_STATE]")?.textContent).toBe("현재");
    expect(rows[1].querySelector("[col-id=HEADER_VER]")?.textContent).toBe("v2.000");
    expect(rows[1].querySelector("[col-id=HEADER_STATE]")?.textContent).toBe("적용 대기");
    expect(document.querySelector("[data-testid=layout-header-missing]")).toBeNull();
  });

  it("판정 시각에 확정 헤더가 없으면(MISSING·길이 null) 길이·오프셋·총 길이를 - 로 보이고 안내한다", async () => {
    mockView({
      layout: { LAYOUT_ID: 201, LAYOUT_NAME: "출측검사 실적 수신", EAI_CODE: "GLUE", SND_SYSTEM: "L2", RCV_SYSTEM: "MES",
        TOTAL_LENGTH: null, HEADER_LENGTH: null, AUD_VER: 1 },
      headers: [
        { SEQ: 1, HEADER_LAYOUT_ID: 10, HEADER_NAME: "GLUE 공통 헤더", EAI_CODE: "GLUE", TOTAL_LENGTH: 100, OFFSET: 0, items: L100,
          HEADER_VER: "1.000", HEADER_STATE: "CURRENT" },
        { SEQ: 2, HEADER_LAYOUT_ID: 11, HEADER_NAME: "L2 구간 헤더", TOTAL_LENGTH: null, OFFSET: 100, items: [],
          HEADER_VER: null, HEADER_STATE: "MISSING" },
      ],
      items: BODY.map((b) => ({ ...b, OFFSET: null })),
    });
    listId = 201;
    await render();
    await search();
    await click(container.querySelector("[data-testid=layout-list] .ag-row .ag-cell"));
    await flush();
    const text = document.body.textContent ?? "";
    expect(text).not.toContain("NaN");
    expect(byTestId("layout-total-length").textContent).toBe("헤더 - (100 + -) + 본문 57 (20 + 8 + 4 + 25) = - 바이트");
    expect(byTestId("layout-body-summary").textContent).toBe("헤더 - — 본문 첫 오프셋 -");
    expect(byTestId("layout-header-missing").textContent).toContain("판정 시각에 확정 헤더가 없어");
    const stackRows = Array.from(document.querySelectorAll("[data-testid=layout-header-stack] .ag-center-cols-container .ag-row"))
      .sort((a, b) => Number(a.getAttribute("row-index")) - Number(b.getAttribute("row-index")));
    expect(stackRows[1].querySelector("[col-id=HEADER_STATE]")?.textContent).toBe("확정 헤더 없음");
    expect(stackRows[1].querySelector("[col-id=TOTAL_LENGTH]")?.textContent).toBe("-");
    expect(stackRows[1].querySelector("[col-id=POSITION]")?.textContent).toBe("-");
    expect(stackRows[0].querySelector("[col-id=POSITION]")?.textContent).toBe("1-100");
    const offsets = Array.from(document.querySelectorAll('[data-testid=layout-items] .ag-center-cols-container .ag-cell[col-id="OFFSET"]'))
      .map((c) => c.textContent);
    expect(offsets).toEqual(["-", "-", "-", "-"]);
    const positions = Array.from(document.querySelectorAll('[data-testid=layout-items] .ag-center-cols-container .ag-cell[col-id="POSITION"]'))
      .map((c) => c.textContent);
    expect(positions).toEqual(["-", "-", "-", "-"]);
  });

  it("목록 총 길이가 null 이면 - 로 보인다", async () => {
    listTotal = null;
    await render();
    await search();
    const cell = container.querySelector('[data-testid=layout-list] .ag-center-cols-container .ag-cell[col-id="TOTAL_LENGTH"]');
    expect(cell?.textContent).toBe("-");
  });
});
