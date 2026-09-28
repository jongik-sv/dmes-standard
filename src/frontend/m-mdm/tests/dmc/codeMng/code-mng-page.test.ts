/** @vitest-environment happy-dom */

// TSK-06-02 design.md §3.3 — codeMng 렌더 스모크: 서버 목록, 빈 상태, 등록(원천 미전송) 뒤 codeEdit 열기, 서버 오류 모달.
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import { takeMdmPageParams } from "@/shell";
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

async function render() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(DmesUiProvider, null, createElement(CodeMngPage)));
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

describe("CodeMngPage", () => {
  beforeEach(() => {
    searchRows = [];
    regResponse = { meta: { success: true }, data: { result: { maruCodeId: "PROC_CD", ver: "1.000", rowVersion: 0, ownerId: "tester" } } };
    calls.length = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (url.includes("/oasis/codeMng/")) calls.push({ url, body });
      if (url.includes("/oasis/codeMng/search")) {
        return jsonResponse({ meta: { success: true }, data: { result: { rows: searchRows, totalCount: searchRows.length } } });
      }
      if (url.includes("/oasis/codeMng/reg")) return jsonResponse(regResponse);
      if (url.includes("/api/auth/me")) return jsonResponse({ user: { id: "tester" } });
      if (url.includes("/api/mcm/oasis/secUser/myButtonEndpoints")) {
        return jsonResponse({ grids: { buttons: { rows: [{ objId: "*", action: "*", endpoint: "*", httpMethod: "*" }] } } });
      }
      return jsonResponse({}, 404);
    }) as typeof fetch;
    delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
    // apiRequest 가 토큰을 localStorage 에서 읽는다 — 이 happy-dom 환경에는 저장소가 없어 스텁한다(domainMng 선례).
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} });
    takeMdmPageParams("dmc/codeEdit");
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

  it("서버 목록을 조회해 건수를 보인다", async () => {
    searchRows = [
      { maruCodeId: "PROC_CD", maruCodeName: "공정", sourceKind: "MDM", status: "INUSE", storedStatus: "CREATED",
        currentVer: "1.001", currentVerLabel: "v1.001", pending: false, unappliedLabel: "없음", unappliedCount: 0 },
    ];
    await render();
    expect(calls[0].url).toContain("/api/mdm/oasis/codeMng/search");
    expect(visibleText(container)).toContain("마루 코드");
    expect(visibleText(container)).toContain("1건");
    expect(container.querySelector('[data-testid="code-list-empty"]')).toBeNull();
  });

  it("0건이면 빈 상태 문구를 보인다", async () => {
    await render();
    // 빈 상태 문구는 그리드의 "데이터 없음" 안내(emptyTestId)다 — 조회 중 표시가 풀린 뒤 그려진다.
    await vi.waitFor(() =>
      expect(container.querySelector('[data-testid="code-list-empty"]')?.textContent).toContain("조회된 마루 코드가 없습니다"));
  });

  it("등록은 원천을 보내지 않고, 성공하면 codeEdit 탭을 코드 ID 와 함께 연다", async () => {
    const opened: unknown[] = [];
    const listener = (e: Event) => opened.push((e as CustomEvent).detail);
    window.addEventListener("portal-open-tab", listener);
    try {
      await render();
      await typeInto("code-reg-id", "PROC_CD");
      await typeInto("code-reg-name", "공정 코드");
      await typeInto("code-reg-lvl", "2");
      await click("code-reg-save");

      const reg = calls.find((c) => c.url.includes("/codeMng/reg"));
      expect(reg).toBeTruthy();
      expect(reg!.body.params).toEqual({ maruCodeId: "PROC_CD", maruCodeName: "공정 코드", lvlCnt: 2 });
      expect("sourceKind" in (reg!.body.params as Record<string, unknown>)).toBe(false);
      expect(opened).toEqual([{ pageId: "mdm:dmc/codeEdit" }]);
      expect(takeMdmPageParams("dmc/codeEdit")).toEqual({ maruCodeId: "PROC_CD" });
      expect(calls.filter((c) => c.url.includes("/codeMng/search")).length).toBe(2);
    } finally {
      window.removeEventListener("portal-open-tab", listener);
    }
  });

  it("서버가 거부하면 오류 모달에 문구를 보인다", async () => {
    regResponse = { meta: { success: false, message: "마루 코드·마루 데이터에 같은 ID 가 있습니다" } };
    await render();
    await typeInto("code-reg-id", "PROC_CD");
    await typeInto("code-reg-name", "공정 코드");
    await click("code-reg-save");
    expect(visibleText(document.body)).toContain("마루 코드·마루 데이터에 같은 ID 가 있습니다");
  });

  it("원천은 MDM 읽기 전용으로만 보인다(선택 없음)", async () => {
    await render();
    expect(container.querySelector('[data-testid="code-reg-source"]')?.textContent).toBe("MDM");
    expect(container.querySelector('[data-testid="code-reg-source"] select, [data-testid="code-reg-source"] input')).toBeNull();
  });
});
