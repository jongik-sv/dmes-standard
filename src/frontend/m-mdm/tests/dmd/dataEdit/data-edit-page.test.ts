/** @vitest-environment happy-dom */

// TSK-07-02 design.md §3.2·§4 — dataEdit 렌더 스모크: handoff(D7 후반부 — consume·리스너)로 받은 ID 의 view, 헤더
// 저장, MDM001(ROW_VERSION_CONFLICT) 오류 모달을 닫으면 다시 불러오기. codeEdit/code-edit-page.test.ts 선례.
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import { openMdmPage, takeMdmPageParams } from "@/shell";
import DataEditPage from "../../../pages/dmd/dataEdit/page";

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
    ...overrides,
  };
}

let nextView: () => unknown = () => viewResult();

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
        createElement(DataEditPage, { tabId: "t1", snapshot: null, onSnapshotChange: () => {}, ...props })),
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

const actions = (service: string, name: string) => calls.filter((c) => c.service === service && c.action === name);

describe("DataEditPage", () => {
  beforeEach(() => {
    calls.length = 0;
    viewName = "항구";
    nextView = () => viewResult();
    saveResponse = { meta: { success: true }, data: { result: viewResult() } };
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (url.includes("/api/auth/me")) return jsonResponse({ user: { id: "tester" } });
      if (url.includes("/api/mcm/oasis/secUser/myButtonEndpoints")) {
        return jsonResponse({ grids: { buttons: { rows: [{ objId: "*", action: "*", endpoint: "*", httpMethod: "*" }] } } });
      }
      const m = url.match(/\/oasis\/(\w+)\/(\w+)/);
      if (m) {
        const [, service, action] = m;
        calls.push({ service, action, params: body.params ?? {} });
        if (service === "dataMng" && action === "search") {
          return jsonResponse({ meta: { success: true }, data: { result: { list: [{ maruDataId: "PORT", maruDataName: "항구", sourceKind: "MDM", status: "INUSE" }] } } });
        }
        if (service === "dataEdit" && action === "view") return jsonResponse({ meta: { success: true }, data: { result: nextView() } });
        if (service === "dataEdit" && action === "save") return jsonResponse(saveResponse);
        if (service === "dataEdit" && action === "delete") return jsonResponse({ meta: { success: true }, data: { result: nextView() } });
        return jsonResponse({ meta: { success: true }, data: { result: nextView() } });
      }
      return jsonResponse({}, 404);
    }) as typeof fetch;
    delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} });
    takeMdmPageParams("dmd/dataEdit");
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

  it("마루 데이터를 고르기 전에는 안내만 보인다", async () => {
    await render();
    expect(byTestId("data-edit-empty")).toBeTruthy();
    expect(actions("dataEdit", "view")).toHaveLength(0);
  });

  it("handoff 로 받은 ID 를 불러와 헤더·카테고리 요약을 보인다(D7 후반부)", async () => {
    const snapshots: unknown[] = [];
    openMdmPage("dmd/dataEdit", { maruDataId: "PORT" });
    await render({ snapshot: { maruDataId: "OTHER" }, onSnapshotChange: (s: unknown) => snapshots.push(s) });

    expect(actions("dataEdit", "view").map((c) => c.params.maruDataId)).toEqual(["PORT"]);
    expect((byTestId("data-edit-name") as HTMLInputElement).value).toBe("항구");
    expect((byTestId("data-edit-status") as HTMLElement).textContent).toBe("INUSE");
    expect(byTestId("data-edit-cate-BASE")).toBeTruthy();
    expect(snapshots).toContainEqual({ maruDataId: "PORT" });
  });

  it("handoff 가 없으면 snapshot 의 ID 를 불러온다", async () => {
    await render({ snapshot: { maruDataId: "PORT" } });
    expect(actions("dataEdit", "view").map((c) => c.params.maruDataId)).toEqual(["PORT"]);
  });

  it("헤더 저장 1건 → 갱신된 값이 보인다", async () => {
    saveResponse = { meta: { success: true }, data: { result: viewResult({ maruDataName: "항구(개정)", auditVer: 1 }) } };
    await render({ snapshot: { maruDataId: "PORT" } });

    await typeInto("data-edit-name", "항구(개정)");
    await click(byTestId("data-edit-save"));

    expect(actions("dataEdit", "save")[0].params).toMatchObject({ maruDataId: "PORT", auditVer: 0, maruDataName: "항구(개정)" });
    expect((byTestId("data-edit-name") as HTMLInputElement).value).toBe("항구(개정)");
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
    expect((byTestId("data-edit-name") as HTMLInputElement).value).toBe("동시 수정됨");
  });
});
