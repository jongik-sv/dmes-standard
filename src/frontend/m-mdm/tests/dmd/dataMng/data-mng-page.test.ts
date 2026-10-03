/** @vitest-environment happy-dom */

// TSK-07-02 design.md §3.2·§4 — dataMng 통합 화면(D-104, dataMng+dataEdit) 렌더 스모크: 목록 행 클릭으로 상세 교체,
// [데이터 등록] 팝업·등록 뒤 상세 선택, handoff·snapshot 진입, 헤더 저장, MDM001 오류 모달, 항목 편집 이동 파라미터.
// codeMng/code-mng-page.test.ts 선례.
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearToasts } from "../../helpers/toasts";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import { openMdmPage, takeMdmPageParams } from "@/shell";
import DataMngPage from "../../../pages/dmd/dataMng/page";

const RBAC_STORE_KEY = "__dkOasisButtonRbacStore__";

let container: HTMLDivElement;
let root: Root | null = null;
const originalFetch = globalThis.fetch;
const calls: { service: string; action: string; params: Record<string, unknown> }[] = [];
let saveResponse: unknown;
let viewName = "항구";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function viewResult(overrides: Record<string, unknown> = {}) {
  return {
    maruDataId: "PORT",
    maruDataName: viewName,
    description: null,
    codePattern: "^[0-9A-Z]{1,20}$",
    status: "INUSE",
    sourceKind: "MDM",
    lvlCnt: 1,
    attr01Name: "국가",
    attr02Name: null, attr03Name: null, attr04Name: null, attr05Name: null,
    attr06Name: null, attr07Name: null, attr08Name: null, attr09Name: null, attr10Name: null,
    auditVer: 0,
    editable: true,
    categories: [{ cateId: "BASE", cateName: "전체", defKind: "REGEX", open: true, matchCount: 2 }],
    itemCount: 7,
    ...overrides,
  };
}

let nextView: (id: string) => unknown = (id) => viewResult({ maruDataId: id });
let searchList: unknown[] = [];
let regResponse: unknown = null;
let rbacRows: Array<Record<string, string>> = [{ objId: "*", action: "*", endpoint: "*", httpMethod: "*" }];
const ALL_RBAC = rbacRows;
const LIST = [
  { maruDataId: "PORT", maruDataName: "항구", sourceKind: "MDM", status: "INUSE" },
  { maruDataId: "SHIP", maruDataName: "선박", sourceKind: "MDM", status: "INUSE" },
];

function visibleText(el: Element): string {
  let out = "";
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) out += node.textContent ?? "";
    else if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = (node as Element).tagName;
      if (tag === "STYLE" || tag === "SCRIPT") continue;
      out += visibleText(node as Element);
    }
  }
  return out;
}

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function render(props: Record<string, unknown> = {}) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      createElement(DmesUiProvider, null,
        createElement(DataMngPage, { tabId: "t1", snapshot: null, onSnapshotChange: () => {}, ...props })),
    );
  });
  await flush();
  await flush();
}

function byTestId(id: string): HTMLElement | null {
  return document.body.querySelector(`[data-testid="${id}"]`);
}

async function click(el: Element | null | undefined) {
  expect(el).toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
  await flush();
}

async function typeInto(testId: string, value: string) {
  const el = byTestId(testId) as HTMLInputElement;
  expect(el, testId).toBeTruthy();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}


/** 목록 헤더 [데이터 등록] 버튼 — GridPanel 머리 안(container)에서 라벨로 찾는다. */
function regButton(): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "데이터 등록") as HTMLButtonElement | undefined;
}

async function openRegister() {
  const btn = regButton();
  expect(btn, "데이터 등록").toBeTruthy();
  await act(async () => {
    btn!.click();
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

/** data-mng-list 안에서 텍스트를 담은 ag-grid 행을 찾아 첫 셀을 클릭한다(codeMng 선례). */
async function clickListRow(matchText: string) {
  const rows = Array.from(document.body.querySelectorAll('[data-testid="data-mng-list"] .ag-row'));
  const row = rows.find((r) => r.textContent?.includes(matchText));
  expect(row, `row containing "${matchText}"`).toBeTruthy();
  await act(async () => {
    row!.querySelector(".ag-cell")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flush();
  await flush();
}

const actions = (service: string, name: string) => calls.filter((c) => c.service === service && c.action === name);
const nameValue = () => (byTestId("data-edit-name") as HTMLInputElement | null)?.value;

describe("DataMngPage(dataEdit 통합)", () => {
  beforeEach(() => {
    calls.length = 0;
    viewName = "항구";
    searchList = LIST;
    rbacRows = ALL_RBAC;
    nextView = (id) => viewResult({ maruDataId: id, maruDataName: id === "PORT" ? viewName : "선박" });
    saveResponse = { meta: { success: true }, data: { result: viewResult() } };
    regResponse = { meta: { success: true }, data: { result: { maruDataId: "NEWID" } } };
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (url.includes("/api/auth/me")) return jsonResponse({ user: { id: "tester" } });
      if (url.includes("/api/mcm/oasis/secUser/myButtonEndpoints")) {
        return jsonResponse({ grids: { buttons: { rows: rbacRows } } });
      }
      const m = url.match(/\/oasis\/(\w+)\/(\w+)/);
      if (m) {
        const [, service, action] = m;
        calls.push({ service, action, params: body.params ?? {} });
        if (service === "dataMng" && action === "search") {
          return jsonResponse({ meta: { success: true }, data: { result: { list: searchList } } });
        }
        if (service === "dataMng" && action === "reg") return jsonResponse(regResponse);
        if (service === "dataEdit" && action === "view") {
          return jsonResponse({ meta: { success: true }, data: { result: nextView(String(body.params?.maruDataId)) } });
        }
        if (service === "dataEdit" && action === "save") return jsonResponse(saveResponse);
        return jsonResponse({ meta: { success: true }, data: { result: nextView(String(body.params?.maruDataId)) } });
      }
      return jsonResponse({}, 404);
    }) as typeof fetch;
    delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} });
    takeMdmPageParams("dmd/dataMng");
    takeMdmPageParams("dmd/dataItemMng");
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    container?.remove();
    globalThis.fetch = originalFetch;
    vi.unstubAllGlobals();
    delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
    document.body.innerHTML = "";
    // 성공 알림이 전역 알림 저장소(limit 3)에 쌓여 뒤 시험의 알림을 밀어내지 않게 한다.
    clearToasts();
  });

  it("마루 데이터를 고르기 전에는 목록과 안내만 보인다", async () => {
    await render();
    expect(byTestId("data-mng-empty")).toBeTruthy();
    // 첫 진입은 목록을 자동 조회하지 않는다 — [조회] 를 눌러야 불러온다(cf4fbb05).
    expect(actions("dataMng", "search")).toHaveLength(0);
    expect(visibleText(document.body)).toContain("0건");
    await search();
    expect(visibleText(document.body)).toContain("2건");
    expect(byTestId("data-edit-name")).toBeNull();
    expect(actions("dataEdit", "view")).toHaveLength(0);
  });

  it("행을 클릭하면 같은 탭 오른쪽에 그 데이터의 상세를 보인다(항목 수·카테고리 요약 포함, 탭을 열지 않는다)", async () => {
    const opened: unknown[] = [];
    const listener = (e: Event) => opened.push((e as CustomEvent).detail);
    window.addEventListener("portal-open-tab", listener);
    try {
      const snapshots: unknown[] = [];
      await render({ onSnapshotChange: (s: unknown) => snapshots.push(s) });
      await search();
      await clickListRow("PORT");

      expect(actions("dataEdit", "view").map((c) => c.params.maruDataId)).toEqual(["PORT"]);
      expect(nameValue()).toBe("항구");
      expect(byTestId("data-edit-status")?.textContent).toBe("INUSE");
      expect(byTestId("data-edit-item-count")?.textContent).toBe("7");
      expect(byTestId("data-edit-categories")?.textContent).toContain("BASE");
      expect(byTestId("data-edit-attr01Name")).toBeTruthy();
      expect(snapshots).toContainEqual({ maruDataId: "PORT" });
      expect(opened).toHaveLength(0);
    } finally {
      window.removeEventListener("portal-open-tab", listener);
    }
  });

  it("다른 행을 클릭하면 상세가 그 데이터로 바뀐다", async () => {
    await render();
    await search();
    await clickListRow("PORT");
    expect(nameValue()).toBe("항구");

    await clickListRow("SHIP");
    expect(actions("dataEdit", "view").map((c) => c.params.maruDataId)).toEqual(["PORT", "SHIP"]);
    expect(nameValue()).toBe("선박");
  });

  it("팝업을 열기 전에는 등록 폼이 DOM 에 없다", async () => {
    await render();
    expect(byTestId("data-mng-register-form")).toBeNull();
    expect(byTestId("data-mng-reg-id")).toBeNull();
  });

  it("[데이터 등록] 을 누르면 팝업에 등록 폼이 뜨고, [취소] 는 팝업만 닫으며 선택·상세는 그대로다", async () => {
    await render();
    await search();
    await clickListRow("PORT");
    expect(nameValue()).toBe("항구");

    await openRegister();
    expect(byTestId("data-mng-register-form")).toBeTruthy();
    expect(byTestId("data-mng-reg-id")).toBeTruthy();
    expect(byTestId("data-mng-reg-source")?.textContent).toBe("MDM");
    expect(byTestId("data-edit-name") ? nameValue() : null).toBe("항구");

    await click(byTestId("data-mng-reg-cancel"));
    expect(byTestId("data-mng-register-form")).toBeNull();
    expect(nameValue()).toBe("항구");
    expect(actions("dataEdit", "view").map((c) => c.params.maruDataId)).toEqual(["PORT"]);
  });

  it("팝업은 열 때마다 빈 칸으로 시작한다", async () => {
    await render();
    await openRegister();
    await typeInto("data-mng-reg-id", "KEEP");
    await click(byTestId("data-mng-reg-cancel"));
    await openRegister();
    expect((byTestId("data-mng-reg-id") as HTMLInputElement).value).toBe("");
  });

  it("권한이 없으면 [데이터 등록] 은 보이되 비활성이다", async () => {
    rbacRows = ["search", "view"].map((action) => ({ objId: "dataMng", action, endpoint: "*", httpMethod: "*" }));
    await render();
    expect(regButton()).toBeTruthy();
    expect(regButton()!.disabled).toBe(true);
  });

  it("등록하면 같은 화면에서 새 데이터를 고른 채 상세를 보인다(dataEdit 탭을 열지 않는다)", async () => {
    const opened: unknown[] = [];
    const listener = (e: Event) => opened.push((e as CustomEvent).detail);
    window.addEventListener("portal-open-tab", listener);
    try {
      nextView = (id) => viewResult({ maruDataId: id, maruDataName: "새 이름" });
      await render();
      await openRegister();
      await typeInto("data-mng-reg-id", "NEWID");
      await typeInto("data-mng-reg-name", "새 이름");
      await typeInto("data-mng-reg-pattern", "^[A-Z]+$");
      await click(byTestId("data-mng-reg-save"));

      expect(actions("dataMng", "reg")[0].params).toEqual({
        maruDataId: "NEWID", maruDataName: "새 이름", codePattern: "^[A-Z]+$", lvlCnt: 0,
      });
      expect(actions("dataEdit", "view").map((c) => c.params.maruDataId)).toEqual(["NEWID"]);
      expect(nameValue()).toBe("새 이름");
      expect(byTestId("data-mng-register-form")).toBeNull();
      expect(actions("dataMng", "search")).toHaveLength(1); // 진입 자동 조회 없음 + 등록 뒤 재조회 1건
      expect(opened).toHaveLength(0);
    } finally {
      window.removeEventListener("portal-open-tab", listener);
    }
  });

  it("등록 필수값이 비면 서버를 부르지 않고 오류 모달을 보인다", async () => {
    await render();
    await openRegister();
    await click(byTestId("data-mng-reg-save"));
    expect(actions("dataMng", "reg")).toHaveLength(0);
    expect(visibleText(document.body)).toContain("마루 데이터 ID·이름·키 패턴을 입력하세요.");
    expect(byTestId("data-mng-register-form")).toBeTruthy(); // 팝업은 열린 채 오류창이 위에 뜬다
  });

  it("등록이 실패하면 팝업이 입력값을 유지한 채 열려 있다", async () => {
    regResponse = { meta: { success: false, message: "같은 ID 가 이미 있습니다" } };
    await render();
    await openRegister();
    await typeInto("data-mng-reg-id", "PORT");
    await typeInto("data-mng-reg-name", "중복");
    await typeInto("data-mng-reg-pattern", "^[A-Z]+$");
    await click(byTestId("data-mng-reg-save"));
    expect(visibleText(document.body)).toContain("같은 ID 가 이미 있습니다");
    expect((byTestId("data-mng-reg-id") as HTMLInputElement).value).toBe("PORT");
    expect(actions("dataEdit", "view")).toHaveLength(0);
  });

  it("handoff 로 받은 ID 의 상세를 목록 조회와 함께 골라 둔다", async () => {
    const snapshots: unknown[] = [];
    openMdmPage("dmd/dataMng", { maruDataId: "PORT" });
    await render({ snapshot: { maruDataId: "OTHER" }, onSnapshotChange: (s: unknown) => snapshots.push(s) });

    expect(actions("dataEdit", "view").map((c) => c.params.maruDataId)).toEqual(["PORT"]);
    expect(actions("dataMng", "search")).toHaveLength(1);
    expect(nameValue()).toBe("항구");
    expect(snapshots).toContainEqual({ maruDataId: "PORT" });
  });

  it("handoff 가 없으면 snapshot 의 ID 를 불러온다", async () => {
    await render({ snapshot: { maruDataId: "PORT" } });
    expect(actions("dataEdit", "view").map((c) => c.params.maruDataId)).toEqual(["PORT"]);
    expect(nameValue()).toBe("항구");
  });

  it("헤더 저장 1건 → 갱신된 값이 보이고 목록을 다시 조회한다", async () => {
    saveResponse = { meta: { success: true }, data: { result: viewResult({ maruDataName: "항구(개정)", auditVer: 1 }) } };
    await render({ snapshot: { maruDataId: "PORT" } });

    await typeInto("data-edit-name", "항구(개정)");
    await click(byTestId("data-edit-save"));

    expect(actions("dataEdit", "save")[0].params).toMatchObject({ maruDataId: "PORT", auditVer: 0, maruDataName: "항구(개정)" });
    expect(nameValue()).toBe("항구(개정)");
    expect(actions("dataMng", "search")).toHaveLength(1); // 진입 자동 조회 없음 + 저장 뒤 재조회 1건
  });

  it("편집 불가(폐기됨) 데이터는 입력·[헤더 저장]·[폐기] 가 꺼지지만 [항목 편집 →] 은 켜져 있다", async () => {
    nextView = (id) => viewResult({ maruDataId: id, status: "DEPRECATED", editable: false });
    await render({ snapshot: { maruDataId: "PORT" } });

    expect((byTestId("data-edit-name") as HTMLInputElement).disabled).toBe(true);
    expect((byTestId("data-edit-save") as HTMLButtonElement).disabled).toBe(true);
    expect((byTestId("data-edit-deprecate") as HTMLButtonElement).disabled).toBe(true);
    expect((byTestId("data-edit-item-edit") as HTMLButtonElement).disabled).toBe(false);
  });

  it("이름·키 패턴이 비면 저장하지 않고 오류 모달을 보인다", async () => {
    await render({ snapshot: { maruDataId: "PORT" } });
    await typeInto("data-edit-name", "");
    await click(byTestId("data-edit-save"));
    expect(actions("dataEdit", "save")).toHaveLength(0);
    expect(visibleText(document.body)).toContain("이름·키 패턴을 입력하세요.");
  });

  it("[폐기] 는 확인 뒤에만 delete 를 auditVer 와 함께 부른다", async () => {
    await render({ snapshot: { maruDataId: "PORT" } });
    await click(byTestId("data-edit-deprecate"));
    expect(actions("dataEdit", "delete")).toHaveLength(0);
    expect(visibleText(document.body)).toContain("폐기할까요?");

    const confirm = Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent === "확인");
    await click(confirm);
    expect(actions("dataEdit", "delete")[0].params).toEqual({ maruDataId: "PORT", auditVer: 0 });
  });

  it("MDM001 오류 모달을 닫으면 view 를 다시 부른다", async () => {
    saveResponse = { meta: { success: false, message: "다른 사용자가 수정했습니다. 다시 불러오세요" } };
    await render({ snapshot: { maruDataId: "PORT" } });

    await typeInto("data-edit-name", "새 이름");
    await click(byTestId("data-edit-save"));
    expect(visibleText(document.body)).toContain("다른 사용자가 수정했습니다");

    viewName = "동시 수정됨";
    const confirm = Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent === "확인");
    await click(confirm);

    expect(actions("dataEdit", "view")).toHaveLength(2);
    expect(nameValue()).toBe("동시 수정됨");
  });

  it("[항목 편집 →] 은 dataItemMng 탭을 { maruDataId } 와 함께 연다", async () => {
    const opened: unknown[] = [];
    const listener = (e: Event) => opened.push((e as CustomEvent).detail);
    window.addEventListener("portal-open-tab", listener);
    try {
      await render();
      await search();
      await clickListRow("SHIP");
      await click(byTestId("data-edit-item-edit"));

      expect(opened).toHaveLength(1);
      expect(takeMdmPageParams("dmd/dataItemMng")).toEqual({ maruDataId: "SHIP" });
    } finally {
      window.removeEventListener("portal-open-tab", listener);
    }
  });

  it("같은 데이터를 다시 불러오는 사이 고친 폼은 늦게 온 view 응답이 덮지 않는다", async () => {
    await render({ snapshot: { maruDataId: "PORT" } });
    await search();
    expect(nameValue()).toBe("항구");

    let release: (v: unknown) => void = () => {};
    const gate = new Promise((r) => { release = r; });
    const baseFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/oasis/dataEdit/view")) await gate;
      return baseFetch(input, init);
    }) as typeof fetch;

    await clickListRow("PORT"); // 이미 고른 행을 다시 눌러 view 를 다시 부른다(응답은 붙잡아 둔다)
    await typeInto("data-edit-name", "고친 이름");
    release(null);
    await flush();
    await flush();

    expect(nameValue()).toBe("고친 이름");
    expect(actions("dataEdit", "view")).toHaveLength(2);
  });

  // 2026-10-03 팀장 결정 — ruleMng 과 같은 규칙: 같은 행을 다시 눌러 다시 읽어도 저장하지 않은 입력은 남기고, 저장은 입력을
  // 시작할 때의 auditVer 로 보낸다(다른 창 변경은 충돌 알림으로 드러난다). 고친 칸이 없으면 서버 값으로 바꾼다.
  it("누르기 전에 고친 입력은 같은 행을 다시 눌러 다시 읽어도 남고, 저장은 입력을 시작할 때의 auditVer 로 보낸다", async () => {
    await render({ snapshot: { maruDataId: "PORT" } });
    await search();
    await typeInto("data-edit-name", "고치는 중");
    nextView = (id) => viewResult({ maruDataId: id, maruDataName: "다른 창 이름", auditVer: 1 });
    await clickListRow("PORT");
    await flush();
    expect(actions("dataEdit", "view")).toHaveLength(2);
    expect(nameValue()).toBe("고치는 중");
    await click(byTestId("data-edit-save"));
    expect(actions("dataEdit", "save")[0].params).toMatchObject({ maruDataName: "고치는 중", auditVer: 0 });
  });

  it("고친 칸이 없으면 같은 행을 다시 눌러 다시 읽은 서버 값과 auditVer 로 바뀐다", async () => {
    await render({ snapshot: { maruDataId: "PORT" } });
    await search();
    nextView = (id) => viewResult({ maruDataId: id, maruDataName: "다른 창 이름", auditVer: 1 });
    await clickListRow("PORT");
    await flush();
    expect(nameValue()).toBe("다른 창 이름");
    await typeInto("data-edit-name", "새 이름");
    await click(byTestId("data-edit-save"));
    expect(actions("dataEdit", "save")[0].params).toMatchObject({ maruDataName: "새 이름", auditVer: 1 });
  });

  it("다른 데이터로 옮길 때는 응답이 폼을 새 값으로 바꾼다(이전 입력 폐기)", async () => {
    await render({ snapshot: { maruDataId: "PORT" } });
    await search();
    await typeInto("data-edit-name", "고친 이름");
    await clickListRow("SHIP");
    expect(nameValue()).toBe("선박");
  });

  // 2026-10-03 — 흐림 덮개가 transition 단축 속성과 transitionDelay 를 섞어 써, 잠금이 풀릴 때 React 가 경고(console.error)를 냈다.
  it("다른 데이터를 고르는 동안 이전 상세를 잠갔다가 풀어도 스타일 경고가 나지 않는다", async () => {
    let release: (v: unknown) => void = () => {};
    const gate = new Promise((r) => { release = r; });
    const baseFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/oasis/dataEdit/view") && String(init?.body ?? "").includes("SHIP")) {
        await gate;
      }
      return baseFetch(input, init);
    }) as typeof fetch;
    const errors = vi.spyOn(console, "error");
    try {
      await render({ snapshot: { maruDataId: "PORT" } });
      await search();
      await clickListRow("SHIP");
      expect(byTestId("detail-stale")).toBeTruthy();
      release(null);
      await flush();
      await flush();
      expect(byTestId("detail-stale")).toBeNull();
      expect(errors.mock.calls.filter((c) => String(c[0]).includes("a style property during rerender"))).toEqual([]);
    } finally {
      errors.mockRestore();
    }
  });

  it("쓰기 진행 중에는 목록 행 클릭을 받지 않는다", async () => {
    let release: (v: unknown) => void = () => {};
    const gate = new Promise((r) => { release = r; });
    const baseFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/oasis/dataEdit/save")) {
        await gate;
      }
      return baseFetch(input, init);
    }) as typeof fetch;
    await render({ snapshot: { maruDataId: "PORT" } });
    await search();

    await typeInto("data-edit-name", "항구(개정)");
    await click(byTestId("data-edit-save"));
    await clickListRow("SHIP");
    expect(actions("dataEdit", "view").map((c) => c.params.maruDataId)).toEqual(["PORT"]);

    release(null);
    await flush();
    await flush();
    await clickListRow("SHIP");
    expect(actions("dataEdit", "view").map((c) => c.params.maruDataId)).toEqual(["PORT", "SHIP"]);
  });
});
