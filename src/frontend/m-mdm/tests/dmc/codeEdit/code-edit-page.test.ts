/** @vitest-environment happy-dom */

// TSK-06-02 design.md §3.3 — codeEdit 렌더 스모크: handoff/snapshot 으로 받은 코드의 view, 버전 목록·잠금 배지,
// MDM001 오류 모달을 닫으면 다시 불러오기, 확정 이동 handoff, 새 버전 모달의 번호 미리보기(서버 값).
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import { openMdmPage, takeMdmPageParams } from "@/shell";
import CodeEditPage from "../../../pages/dmc/codeEdit/page";

const RBAC_STORE_KEY = "__dkOasisButtonRbacStore__";

let container: HTMLDivElement;
let root: Root | null = null;
const originalFetch = globalThis.fetch;
const calls: { action: string; params: Record<string, unknown> }[] = [];
let saveResponse: unknown;
let viewName = "공정 코드";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function viewResult(overrides: Record<string, unknown> = {}) {
  return {
    header: {
      maruCodeId: "PROC_CD", maruCodeName: viewName, description: null, lvlCnt: 0, sourceKind: "MDM",
      status: "CREATED", storedStatus: "CREATED", auditVer: 0, currentVerLabel: "미확정", unappliedLabel: "v1.000 DRAFT",
      attr01Name: "인장강도",
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
    root!.render(createElement(DmesUiProvider, null, createElement(CodeEditPage, { tabId: "t1", snapshot: null, onSnapshotChange: () => {}, ...props })));
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

const actions = (name: string) => calls.filter((c) => c.action === name);

describe("CodeEditPage", () => {
  beforeEach(() => {
    calls.length = 0;
    viewName = "공정 코드";
    nextView = () => viewResult();
    saveResponse = { meta: { success: true }, data: { result: viewResult() } };
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const m = url.match(/\/oasis\/codeEdit\/(\w+)/);
      if (m) {
        calls.push({ action: m[1], params: body.params ?? {} });
        if (m[1] === "search") {
          return jsonResponse({ meta: { success: true }, data: { result: { rows: [{ maruCodeId: "PROC_CD", maruCodeName: "공정 코드", status: "CREATED" }] } } });
        }
        if (m[1] === "view") return jsonResponse({ meta: { success: true }, data: { result: nextView() } });
        if (m[1] === "save") return jsonResponse(saveResponse);
        return jsonResponse({ meta: { success: true }, data: { result: nextView() } });
      }
      if (url.includes("/api/auth/me")) return jsonResponse({ user: { id: "tester" } });
      if (url.includes("/api/mcm/oasis/secUser/myButtonEndpoints")) {
        return jsonResponse({ grids: { buttons: { rows: [{ objId: "*", action: "*", endpoint: "*", httpMethod: "*" }] } } });
      }
      return jsonResponse({}, 404);
    }) as typeof fetch;
    delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} });
    takeMdmPageParams("dmc/codeEdit");
    takeMdmPageParams("dmc/codeConfirm");
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

  it("코드를 고르기 전에는 안내만 보인다", async () => {
    await render();
    expect(visibleText(container)).toContain("마루 코드를 고르세요");
    expect(actions("view")).toHaveLength(0);
    expect(byTestId("version-list")).toBeNull();
  });

  it("handoff 로 받은 코드를 불러와 버전 목록과 잠금 배지를 보이고 snapshot 에 남긴다", async () => {
    const snapshots: unknown[] = [];
    openMdmPage("dmc/codeEdit", { maruCodeId: "PROC_CD" });
    await render({ snapshot: { maruCodeId: "OTHER" }, onSnapshotChange: (s: unknown) => snapshots.push(s) });
    expect(actions("view").map((c) => c.params.maruCodeId)).toEqual(["PROC_CD"]);
    const list = byTestId("version-list")!;
    expect(visibleText(list)).toContain("v1.000");
    expect(visibleText(list)).toContain("편집 중(나)");
    expect((byTestId("header-name") as HTMLInputElement).value).toBe("공정 코드");
    expect((byTestId("label-attr01") as HTMLInputElement).value).toBe("인장강도");
    expect(snapshots).toContainEqual({ maruCodeId: "PROC_CD" });
  });

  it("handoff 가 없으면 snapshot 의 코드를 불러온다", async () => {
    await render({ snapshot: { maruCodeId: "PROC_CD" } });
    expect(actions("view").map((c) => c.params.maruCodeId)).toEqual(["PROC_CD"]);
  });

  it("버전이 없으면 빈 상태를 보인다", async () => {
    nextView = () => viewResult({ versions: [], flags: { ...viewResult().flags, unappliedCount: 0, canNewMajor: true } });
    await render({ snapshot: { maruCodeId: "PROC_CD" } });
    expect(byTestId("version-empty")?.textContent).toContain("버전이 없습니다");
  });

  it("MDM001 오류 모달을 닫으면 view 를 다시 부른다", async () => {
    saveResponse = { meta: { success: false, message: "다른 사용자가 수정했습니다. 다시 불러오세요" } };
    await render({ snapshot: { maruCodeId: "PROC_CD" } });
    await typeInto("header-name", "새 이름");
    await click(byTestId("header-save"));
    expect(actions("save")[0].params).toMatchObject({ maruCodeId: "PROC_CD", auditVer: 0, maruCodeName: "새 이름" });
    expect(visibleText(document.body)).toContain("다른 사용자가 수정했습니다");

    viewName = "E2E 동시";
    const confirm = Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent === "확인");
    await click(confirm);
    await flush();
    expect(actions("view")).toHaveLength(2);
    expect((byTestId("header-name") as HTMLInputElement).value).toBe("E2E 동시");
  });

  it("내 DRAFT 를 고르고 확정 이동하면 codeConfirm 탭을 코드·버전과 함께 연다", async () => {
    const opened: unknown[] = [];
    const listener = (e: Event) => opened.push((e as CustomEvent).detail);
    window.addEventListener("portal-open-tab", listener);
    try {
      await render({ snapshot: { maruCodeId: "PROC_CD" } });
      expect((byTestId("ver-confirm-move") as HTMLButtonElement).disabled).toBe(true);
      await click(byTestId("version-row-1.000"));
      expect((byTestId("ver-confirm-move") as HTMLButtonElement).disabled).toBe(false);
      await click(byTestId("ver-confirm-move"));
      expect(opened).toEqual([{ pageId: "mdm:dmc/codeConfirm" }]);
      expect(takeMdmPageParams("dmc/codeConfirm")).toEqual({ maruCodeId: "PROC_CD", ver: "1.000" });
      expect(actions("confirm")).toHaveLength(0);
    } finally {
      window.removeEventListener("portal-open-tab", listener);
    }
  });

  it("새 버전 모달은 서버의 다음 번호를 보이고 빈 버전이면 reg 를 부른다", async () => {
    nextView = () => viewResult({
      versions: [{ ...viewResult().versions[0], status: "RELEASED", applyFrom: "2026-01-01 00:00:00", applyTo: "9999-12-31 00:00:00", unapplied: false }],
      flags: { ...viewResult().flags, unappliedCount: 0, canNewMajor: true, canNewMinor: true, nextMajor: "2.000", nextMinor: "1.001" },
      restoreSources: ["1.000"],
    });
    await render({ snapshot: { maruCodeId: "PROC_CD" } });
    await click(byTestId("ver-new-major"));
    expect(byTestId("newver-number")?.textContent).toBe("v2.000");
    expect(byTestId("newver-content-restore-1.000")).toBeTruthy();
    await click(byTestId("newver-ok"));
    expect(actions("reg")[0].params).toEqual({ maruCodeId: "PROC_CD", verKind: "MAJOR" });

    await click(byTestId("ver-new-minor"));
    expect(byTestId("newver-number")?.textContent).toBe("v1.001");
    await click(byTestId("newver-content-restore-1.000")?.querySelector("input"));
    await click(byTestId("newver-ok"));
    expect(actions("restore")[0].params).toEqual({ maruCodeId: "PROC_CD", verKind: "MINOR", sourceVer: "1.000" });
  });

  it("미적용 버전이 2개면 경고 문구가 보인다", async () => {
    const draft2 = { ...viewResult().versions[0], ver: "1.001", verLabel: "v1.001", ownerId: "other" };
    nextView = () => viewResult({ versions: [draft2, viewResult().versions[0]], flags: { ...viewResult().flags, unappliedCount: 2 } });
    await render({ snapshot: { maruCodeId: "PROC_CD" } });
    expect(byTestId("ver-unapplied-warning")?.textContent).toContain("미적용 버전이 2개입니다. 하나를 삭제하세요");
    expect((byTestId("header-save") as HTMLButtonElement).disabled).toBe(true);
  });
});
