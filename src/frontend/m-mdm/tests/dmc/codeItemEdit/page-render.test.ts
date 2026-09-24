/** @vitest-environment happy-dom */

// TSK-06-03 design.md §4.8 page-render ①~⑥ — 화면 셸·빈 상태·DRAFT/RELEASED/CANCELLED 에 따른 편집 요소와 경미 수정 패널의
// 잠김(수용 기준 2·5·6). PageLayout 이 /api/auth/me·버튼 RBAC 를 부르므로 fetch 를 URL 별로 스텁하고, 버튼 RBAC 는
// SYSADMIN 와일드카드로 응답한다 — 편집 요소가 사라지는 까닭이 권한이 아니라 버전 상태임을 보이기 위해서다.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import CodeItemEditPage from "../../../pages/dmc/codeItemEdit/page";
import { PatchPanel } from "../../../pages/dmc/codeItemEdit/components/PatchPanel";
import type { ServerRow } from "../../../pages/dmc/codeItemEdit/grid-state";

const RBAC_STORE_KEY = "__dkOasisButtonRbacStore__";
const originalFetch = globalThis.fetch;
let container: HTMLDivElement;
let root: Root | null = null;

function row(code: string, extra: Partial<ServerRow> = {}): ServerRow {
  return {
    code, name: `${code} 이름`, alterName: null, seq: 1, description: null, fromVer: "1.000", toVer: "9999.000",
    lvl1: "KS", lvl2: null, lvl3: null, lvl4: null, lvl5: null,
    attr01: "270", attr02: null, attr03: null, attr04: null, attr05: null,
    attr06: null, attr07: null, attr08: null, attr09: null, attr10: null,
    change: "NONE", prev: null, tableCategories: [], patchBlocked: false, ...extra,
  };
}

function viewOf(status: string, flags: { editable: boolean; patchable: boolean }, rows: ServerRow[]) {
  return {
    header: {
      maruCodeId: "STEEL", maruCodeName: "강종", sourceKind: "MDM", status: "INUSE", lvlCnt: 1,
      attrLabels: [{ no: 1, label: "인장강도" }],
    },
    versions: [{ ver: "1.000", display: "v1.000", status, verKind: "MAJOR", ownerId: "kim", applyFrom: null, applyTo: null }],
    selected: { ver: "1.000", display: "v1.000", status, ownerId: "kim", rowVersion: 4, warning: null, ...flags },
    rows, closed: [], closedCateItems: [], categories: [{ cateId: "BASE", cateName: "전체", defKind: "REGEX" }],
  };
}

function stubFetch(view: unknown) {
  globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
    const u = String(url);
    const ok = (result: unknown) => new Response(JSON.stringify({ meta: { success: true }, data: { result } }), { status: 200 });
    if (u.includes("/oasis/codeItemEdit/search")) {
      return ok({ codes: [{ maruCodeId: "STEEL", maruCodeName: "강종", sourceKind: "MDM", status: "INUSE", lvlCnt: 1 }] });
    }
    if (u.includes("/oasis/codeItemEdit/view")) return ok(view);
    if (u.includes("/oasis/codeItemEdit/compare")) {
      return ok({ cateId: "BASE", ver: "1.000", hitCount: 0, total: 0, rows: [], warnings: [] });
    }
    if (u.includes("/api/auth/me")) return new Response(JSON.stringify({ user: { id: "tester" } }), { status: 200 });
    if (u.includes("/api/mcm/oasis/secUser/myButtonEndpoints")) {
      return new Response(JSON.stringify({ grids: { buttons: { rows: [{ objId: "*", action: "*" }] } } }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
}

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
}

async function render(element: ReturnType<typeof createElement>) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(DmesUiProvider, null, element));
  });
  await settle();
}

async function chooseCode(id: string) {
  const sel = container.querySelector('[data-testid="code-maru-select"]') as HTMLSelectElement;
  await act(async () => {
    sel.value = id;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle();
}

const testId = (id: string) => container.querySelector(`[data-testid="${id}"]`);
const buttonTexts = () => Array.from(container.querySelectorAll("button")).map((b) => b.textContent?.trim());

describe("codeItemEdit page", () => {
  beforeEach(() => {
    delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} });
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    container?.remove();
    globalThis.fetch = originalFetch;
    vi.unstubAllGlobals();
    delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
  });

  it("① 화면 id 꼬리표와 breadcrumb", async () => {
    stubFetch(viewOf("DRAFT", { editable: true, patchable: false }, []));
    await render(createElement(CodeItemEditPage));
    expect(container.querySelector(".page-layout__footer-screen-id")?.textContent).toBe("codeItemEdit");
    expect(container.querySelector(".page-layout__footer-breadcrumb")?.textContent).toContain("마루 MDM > 마스터코드 > 코드 편집");
  });

  it("② 코드가 0건이면 빈 상태 문구", async () => {
    stubFetch(viewOf("DRAFT", { editable: true, patchable: false }, []));
    await render(createElement(CodeItemEditPage));
    await chooseCode("STEEL");
    expect(testId("code-grid-empty")?.textContent).toBe("보일 코드가 없습니다");
  });

  it("③ DRAFT(편집 가능)는 저장·코드 추가가 있고 경미 수정 패널이 없다", async () => {
    stubFetch(viewOf("DRAFT", { editable: true, patchable: false }, [row("KS-9")]));
    await render(createElement(CodeItemEditPage));
    await chooseCode("STEEL");
    expect(buttonTexts()).toContain("저장");
    expect(testId("code-add")).not.toBeNull();
    expect(testId("code-row-version")?.textContent).toBe("row_version = 4");
    expect(testId("patch-panel")).toBeNull();
    expect(testId("code-grid-empty")).toBeNull();
  });

  it("④ RELEASED 는 저장·코드 추가가 없고 경미 수정 패널이 있다", async () => {
    stubFetch(viewOf("RELEASED", { editable: false, patchable: true }, [row("KS-9")]));
    await render(createElement(CodeItemEditPage));
    await chooseCode("STEEL");
    expect(buttonTexts()).not.toContain("저장");
    expect(testId("code-add")).toBeNull();
    expect(testId("patch-panel")).not.toBeNull();
  });

  it("④ 경미 수정 패널은 코드·계층·추가 컬럼이 disabled 이고 이름·약칭·순서·설명만 입력된다", async () => {
    stubFetch(viewOf("RELEASED", { editable: false, patchable: true }, []));
    await render(createElement(PatchPanel, {
      row: row("KS-9"), lvlCnt: 1, attrLabels: [{ no: 1, label: "인장강도" }], canPatch: true, onSave: () => {},
    }));
    const input = (id: string) => testId(id) as HTMLInputElement;
    expect(input("patch-code").disabled).toBe(true);
    expect(input("patch-code").value).toBe("KS-9");
    expect(input("patch-lvl1").disabled).toBe(true);
    expect(input("patch-attr01").disabled).toBe(true);
    for (const id of ["patch-name", "patch-alter-name", "patch-seq", "patch-description"]) {
      expect(input(id).disabled, id).toBe(false);
    }
    expect((testId("patch-save") as HTMLButtonElement).disabled).toBe(false);
    expect(testId("patch-blocked")).toBeNull();
  });

  it("⑤ patchBlocked 행은 경미 수정 저장이 막히고 DRAFT에서 고치세요", async () => {
    stubFetch(viewOf("RELEASED", { editable: false, patchable: true }, []));
    await render(createElement(PatchPanel, {
      row: row("82", { patchBlocked: true }), lvlCnt: 1, attrLabels: [], canPatch: true, onSave: () => {},
    }));
    expect((testId("patch-save") as HTMLButtonElement).disabled).toBe(true);
    expect(testId("patch-blocked")?.textContent).toBe("DRAFT에서 고치세요");
  });

  it("⑥ CANCELLED 는 경미 수정 패널도 편집 요소도 없다", async () => {
    stubFetch(viewOf("CANCELLED", { editable: false, patchable: false }, [row("KS-9")]));
    await render(createElement(CodeItemEditPage));
    await chooseCode("STEEL");
    expect(testId("patch-panel")).toBeNull();
    expect(testId("code-add")).toBeNull();
    expect(buttonTexts()).not.toContain("저장");
  });
});
