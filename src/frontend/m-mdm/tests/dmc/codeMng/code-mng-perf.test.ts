/** @vitest-environment happy-dom */

// codeMng 렌더 낭비 회귀 — 조회 입력 한 글자마다 버전 목록 그리드 열 정의를 다시 만들지 않는다.
// 시간(ms) 대신 열 정의 재생성 수와 셀 렌더러 호출 수만 센다. 그리드(AgDataGrid)는 실제 컴포넌트를 쓰되 props 만 가로채 센다.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import { takeMdmPageParams } from "@/shell";

type AnyProps = Record<string, any>;

const log = vi.hoisted(() => ({ verColumns: new Set<unknown>(), verRenderCalls: 0 }));

vi.mock("@dk-oasis/shared/grid", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@dk-oasis/shared/grid")>();
  const React = await import("react");
  const Orig = mod.AgDataGrid as unknown as (p: AnyProps) => unknown;
  function Spy(props: AnyProps) {
    const cols = props.columns as AnyProps[];
    const isVer = props.rowKey === "ver";
    if (isVer) log.verColumns.add(cols);
    const wrapped = React.useMemo(
      () =>
        isVer
          ? cols.map((c) =>
              c.render ? { ...c, render: (v: unknown, row: unknown) => (log.verRenderCalls++, c.render(v, row)) } : c)
          : cols,
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [cols],
    );
    return React.createElement(Orig as never, { ...props, columns: wrapped });
  }
  return { ...mod, AgDataGrid: Spy };
});

import CodeMngPage from "../../../pages/dmc/codeMng/page";

const RBAC_STORE_KEY = "__dkOasisButtonRbacStore__";
let container: HTMLDivElement;
let root: Root | null = null;
const originalFetch = globalThis.fetch;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const listRow = {
  maruCodeId: "PROC_CD", maruCodeName: "공정 코드", sourceKind: "MDM", status: "CREATED", storedStatus: "CREATED",
  currentVer: null, currentVerLabel: "미확정", pending: true, unappliedLabel: "v1.000 DRAFT", unappliedCount: 1,
};
const view = {
  header: {
    maruCodeId: "PROC_CD", maruCodeName: "공정 코드", description: null, lvlCnt: 0, sourceKind: "MDM",
    status: "CREATED", storedStatus: "CREATED", auditVer: 0, currentVerLabel: "미확정", unappliedLabel: "v1.000 DRAFT",
  },
  versions: [
    { ver: "1.000", verLabel: "v1.000", verKind: "MAJOR", status: "DRAFT", ownerId: "tester", applyFrom: null, applyTo: null,
      releasedAt: null, restoredFrom: null, restoredLabel: null, rowVersion: 0, unapplied: true, description: null },
  ],
  flags: { unappliedCount: 1, canNewMajor: false, canNewMinor: false, nextMajor: "2.000", nextMinor: "1.001", minorLimit: false,
    canDeprecate: false, editable: true },
  restoreSources: [], me: "tester", steward: true,
};

async function tick() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe("codeMng 렌더 낭비", () => {
  beforeEach(() => {
    log.verColumns.clear();
    log.verRenderCalls = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/oasis/codeMng/search")) return json({ meta: { success: true }, data: { result: { rows: [listRow], totalCount: 1 } } });
      if (url.includes("/oasis/codeEdit/view")) return json({ meta: { success: true }, data: { result: view } });
      if (url.includes("/api/auth/me")) return json({ user: { id: "tester" } });
      if (url.includes("/api/mcm/oasis/secUser/myButtonEndpoints")) {
        return json({ grids: { buttons: { rows: [{ objId: "*", action: "*", endpoint: "*", httpMethod: "*" }] } } });
      }
      return json({}, 404);
    }) as typeof fetch;
    delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
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

  it("조회 입력 한 글자마다 버전 목록 열 정의를 다시 만들지 않는다", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(createElement(DmesUiProvider, null, createElement(CodeMngPage)));
    });
    await tick();
    await tick();
    // 첫 진입은 목록을 자동 조회하지 않는다 — 머리 [조회] 를 눌러야 행이 생긴다(cf4fbb05). 측정 대상은 조회 입력 때의 열 정의라 영향 없다.
    const searchBtn = Array.from(container.querySelectorAll(".page-layout__header-buttons button")).find((b) => b.textContent === "조회");
    expect(searchBtn, "조회").toBeTruthy();
    await act(async () => {
      (searchBtn as HTMLButtonElement).click();
    });
    await tick();
    await tick();
    const row = Array.from(container.querySelectorAll('[data-testid="code-list"] .ag-row')).find((r) => r.textContent?.includes("PROC_CD"));
    await act(async () => {
      row!.querySelector(".ag-cell")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await tick();
    await tick();
    expect(container.querySelector('[data-testid="version-list"]')).toBeTruthy();

    const colsBefore = log.verColumns.size;
    const rendersBefore = log.verRenderCalls;
    const input = container.querySelector('[data-testid="code-search-keyword"]') as HTMLInputElement;
    for (const v of ["P", "PR", "PRO"]) {
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, v);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }
    await tick();

    // 고치기 전: 열 정의 +3(입력 글자 수만큼), 렌더러 호출 +수십. 고친 뒤 둘 다 0.
    expect(log.verColumns.size - colsBefore).toBe(0);
    expect(log.verRenderCalls - rendersBefore).toBe(0);
    expect(container.querySelector('[data-testid="version-list"]')?.textContent).toContain("v1.000");
  });
});
