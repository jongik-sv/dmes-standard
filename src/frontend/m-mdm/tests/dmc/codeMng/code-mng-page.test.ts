/** @vitest-environment happy-dom */

// TSK-06-02 design.md §3.3·§3.4 — codeMng(조회·등록·목록 선택) 렌더 스모크. 2026-09-28 통합(D-101·D-102) 이후
// 상세(옛 codeEdit) 워크플로는 code-mng-detail.test.ts 가 맡는다.
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import { openMdmPage, takeMdmPageParams } from "@/shell";
import CodeMngPage from "../../../pages/dmc/codeMng/page";

const RBAC_STORE_KEY = "__dkOasisButtonRbacStore__";

let container: HTMLDivElement;
let root: Root | null = null;
const originalFetch = globalThis.fetch;
let searchRows: unknown[] = [];
let regResponse: unknown = null;
const calls: { url: string; body: Record<string, unknown> }[] = [];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function viewResult(overrides: Record<string, unknown> = {}) {
  return {
    header: {
      maruCodeId: "PROC_CD", maruCodeName: "공정 코드", description: null, lvlCnt: 0, sourceKind: "MDM",
      status: "CREATED", storedStatus: "CREATED", auditVer: 0, currentVerLabel: "미확정", unappliedLabel: "v1.000 DRAFT",
    },
    versions: [
      { ver: "1.000", verLabel: "v1.000", verKind: "MAJOR", status: "DRAFT", ownerId: "tester", applyFrom: null,
        applyTo: null, releasedAt: null, restoredFrom: null, restoredLabel: null, rowVersion: 0, unapplied: true,
        description: null },
    ],
    flags: { unappliedCount: 1, canNewMajor: false, canNewMinor: false, nextMajor: "2.000", nextMinor: "1.001",
      minorLimit: false, canDeprecate: false, editable: true },
    restoreSources: [],
    me: "tester",
    steward: true,
    ...overrides,
  };
}

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

async function render(props: Record<string, unknown> = {}) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(DmesUiProvider, null, createElement(CodeMngPage, props)));
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function typeInto(testId: string, value: string) {
  const el = container.querySelector(`[data-testid="${testId}"]`) as HTMLInputElement | HTMLSelectElement;
  expect(el, testId).toBeTruthy();
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}

async function click(testId: string) {
  const el = container.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement;
  expect(el, testId).toBeTruthy();
  await act(async () => {
    el.click();
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

/** PageLayout 상단 버튼은 testid 가 없다(btn.id 는 DOM 에 안 나간다) — 라벨로 찾는다. */
async function clickPageButton(label: string) {
  const btn = Array.from(container.querySelectorAll(".page-layout__header-buttons button")).find(
    (b) => b.textContent === label,
  ) as HTMLButtonElement | undefined;
  expect(btn, label).toBeTruthy();
  await act(async () => {
    btn!.click();
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

/** code-list 안에서 텍스트를 담은 ag-grid 행을 찾아 첫 셀을 클릭한다(HeaderList 선례). */
async function clickListRow(matchText: string) {
  const rows = Array.from(container.querySelectorAll('[data-testid="code-list"] .ag-row'));
  const row = rows.find((r) => r.textContent?.includes(matchText));
  expect(row, `row containing "${matchText}"`).toBeTruthy();
  const cell = row!.querySelector(".ag-cell");
  await act(async () => {
    cell!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe("CodeMngPage", () => {
  beforeEach(() => {
    searchRows = [];
    regResponse = { meta: { success: true }, data: { result: { maruCodeId: "PROC_CD", ver: "1.000", rowVersion: 0, ownerId: "tester" } } };
    calls.length = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (url.includes("/oasis/codeMng/") || url.includes("/oasis/codeEdit/")) calls.push({ url, body });
      if (url.includes("/oasis/codeMng/search")) {
        return jsonResponse({ meta: { success: true }, data: { result: { rows: searchRows, totalCount: searchRows.length } } });
      }
      if (url.includes("/oasis/codeMng/reg")) return jsonResponse(regResponse);
      if (url.includes("/oasis/codeEdit/view")) return jsonResponse({ meta: { success: true }, data: { result: viewResult() } });
      if (url.includes("/api/auth/me")) return jsonResponse({ user: { id: "tester" } });
      if (url.includes("/api/mcm/oasis/secUser/myButtonEndpoints")) {
        return jsonResponse({ grids: { buttons: { rows: [{ objId: "*", action: "*", endpoint: "*", httpMethod: "*" }] } } });
      }
      return jsonResponse({}, 404);
    }) as typeof fetch;
    delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
    // apiRequest 가 토큰을 localStorage 에서 읽는다 — 이 happy-dom 환경에는 저장소가 없어 스텁한다(domainMng 선례).
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} });
    takeMdmPageParams("dmc/codeMng");
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    container?.remove();
    globalThis.fetch = originalFetch;
    vi.unstubAllGlobals();
    delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
    document.body.innerHTML = "";
  });

  it("서버 목록을 조회해 건수를 보이고, 아무것도 고르지 않으면 안내만 보인다", async () => {
    searchRows = [
      { maruCodeId: "PROC_CD", maruCodeName: "공정", sourceKind: "MDM", status: "INUSE", storedStatus: "CREATED",
        currentVer: "1.001", currentVerLabel: "v1.001", pending: false, unappliedLabel: "없음", unappliedCount: 0 },
    ];
    await render();
    expect(calls.some((c) => c.url.includes("/api/mdm/oasis/codeMng/search"))).toBe(true);
    expect(visibleText(container)).toContain("마루 코드");
    expect(visibleText(container)).toContain("1건");
    expect(container.querySelector('[data-testid="code-list-empty"]')).toBeNull();
    expect(visibleText(container)).toContain("목록에서 마루 코드를 고르거나");
    expect(container.querySelector('[data-testid="header-name"]')).toBeNull();
  });

  it("0건이면 빈 상태 문구를 보인다", async () => {
    await render();
    await vi.waitFor(() =>
      expect(container.querySelector('[data-testid="code-list-empty"]')?.textContent).toContain("조회된 마루 코드가 없습니다"));
  });

  it("목록 행을 클릭하면 그 코드의 상세를 오른쪽에 보인다(탭을 새로 열지 않는다)", async () => {
    searchRows = [
      { maruCodeId: "PROC_CD", maruCodeName: "공정 코드", sourceKind: "MDM", status: "CREATED", storedStatus: "CREATED",
        currentVer: null, currentVerLabel: "미확정", pending: true, unappliedLabel: "v1.000 DRAFT", unappliedCount: 1 },
    ];
    const opened: unknown[] = [];
    const listener = (e: Event) => opened.push((e as CustomEvent).detail);
    window.addEventListener("portal-open-tab", listener);
    try {
      await render();
      await clickListRow("PROC_CD");
      expect(calls.some((c) => c.url.includes("/oasis/codeEdit/view") && c.body.params?.maruCodeId === "PROC_CD")).toBe(true);
      expect((container.querySelector('[data-testid="header-name"]') as HTMLInputElement)?.value).toBe("공정 코드");
      expect(container.querySelector('[data-testid="version-list"]')).toBeTruthy();
      expect(opened).toHaveLength(0);
    } finally {
      window.removeEventListener("portal-open-tab", listener);
    }
  });

  it("[신규] 를 누르면 선택이 풀리고 등록 폼이 보인다", async () => {
    searchRows = [
      { maruCodeId: "PROC_CD", maruCodeName: "공정 코드", sourceKind: "MDM", status: "CREATED", storedStatus: "CREATED",
        currentVer: null, currentVerLabel: "미확정", pending: true, unappliedLabel: "v1.000 DRAFT", unappliedCount: 1 },
    ];
    await render();
    await clickListRow("PROC_CD");
    expect(container.querySelector('[data-testid="header-name"]')).toBeTruthy();

    await clickPageButton("신규");
    expect(container.querySelector('[data-testid="header-name"]')).toBeNull();
    expect(container.querySelector('[data-testid="code-reg-id"]')).toBeTruthy();
  });

  it("등록하면 같은 화면에서 새 코드를 고른 상태로 상세를 보인다(탭을 새로 열지 않는다)", async () => {
    const opened: unknown[] = [];
    const listener = (e: Event) => opened.push((e as CustomEvent).detail);
    window.addEventListener("portal-open-tab", listener);
    try {
      await render();
      await clickPageButton("신규");
      await typeInto("code-reg-id", "PROC_CD");
      await typeInto("code-reg-name", "공정 코드");
      await typeInto("code-reg-lvl", "2");
      await click("code-reg-save");

      const reg = calls.find((c) => c.url.includes("/codeMng/reg"));
      expect(reg).toBeTruthy();
      expect(reg!.body.params).toEqual({ maruCodeId: "PROC_CD", maruCodeName: "공정 코드", lvlCnt: 2 });
      expect("sourceKind" in (reg!.body.params as Record<string, unknown>)).toBe(false);
      expect(opened).toHaveLength(0);
      expect(calls.some((c) => c.url.includes("/oasis/codeEdit/view") && c.body.params?.maruCodeId === "PROC_CD")).toBe(true);
      expect((container.querySelector('[data-testid="header-name"]') as HTMLInputElement)?.value).toBe("공정 코드");
      expect(calls.filter((c) => c.url.includes("/codeMng/search")).length).toBe(2);
    } finally {
      window.removeEventListener("portal-open-tab", listener);
    }
  });

  it("서버가 거부하면 오류 모달에 문구를 보인다", async () => {
    regResponse = { meta: { success: false, message: "마루 코드·마루 데이터에 같은 ID 가 있습니다" } };
    await render();
    await clickPageButton("신규");
    await typeInto("code-reg-id", "PROC_CD");
    await typeInto("code-reg-name", "공정 코드");
    await click("code-reg-save");
    expect(visibleText(document.body)).toContain("마루 코드·마루 데이터에 같은 ID 가 있습니다");
  });

  it("원천은 MDM 읽기 전용으로만 보인다(선택 없음)", async () => {
    await render();
    await clickPageButton("신규");
    expect(container.querySelector('[data-testid="code-reg-source"]')?.textContent).toBe("MDM");
    expect(container.querySelector('[data-testid="code-reg-source"] select, [data-testid="code-reg-source"] input')).toBeNull();
  });

  it("handoff 로 받은 코드를 목록 조회와 함께 골라 둔다", async () => {
    searchRows = [
      { maruCodeId: "PROC_CD", maruCodeName: "공정 코드", sourceKind: "MDM", status: "CREATED", storedStatus: "CREATED",
        currentVer: null, currentVerLabel: "미확정", pending: true, unappliedLabel: "v1.000 DRAFT", unappliedCount: 1 },
    ];
    openMdmPage("dmc/codeMng", { maruCodeId: "PROC_CD" });
    await render();
    expect(calls.some((c) => c.url.includes("/oasis/codeMng/search"))).toBe(true);
    expect(calls.some((c) => c.url.includes("/oasis/codeEdit/view") && c.body.params?.maruCodeId === "PROC_CD")).toBe(true);
    expect((container.querySelector('[data-testid="header-name"]') as HTMLInputElement)?.value).toBe("공정 코드");
  });
});
