/** @vitest-environment happy-dom */

// TSK-06-04 design.md §3 page-render — 화면 셸·빈 상태·DRAFT/RELEASED 에 따른 편집 요소·BASE 버튼 비노출(수용 기준 2·3).
// PageLayout 이 /api/auth/me·버튼 RBAC 를 부르므로 fetch 를 URL 별로 스텁하고, 버튼 RBAC 는 SYSADMIN 와일드카드로
// 응답한다 — 편집 요소가 사라지는 까닭이 권한이 아니라 버전 상태·BASE 여부임을 보이기 위해서다.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import CodeCateEditPage from "../../../pages/dmc/codeCateEdit/page";
import type { CategoryDef, CateItemInfo, CodeItemInfo } from "../../../pages/dmc/codeCateEdit/types";

const RBAC_STORE_KEY = "__dkOasisButtonRbacStore__";
const originalFetch = globalThis.fetch;
let container: HTMLDivElement;
let root: Root | null = null;

function viewOf(
  status: string, editable: boolean, categories: CategoryDef[], items: CodeItemInfo[] = [], cateItems: CateItemInfo[] = [],
) {
  return {
    header: { maruCodeId: "M", maruCodeName: "시험 코드", sourceKind: "MDM", status: "INUSE", lvlCnt: 1 },
    versions: [{ ver: "1.000", display: "v1.000", status, verKind: "MAJOR", ownerId: "kim", applyFrom: null, applyTo: null }],
    selected: { ver: "1.000", display: "v1.000", status, ownerId: "kim", rowVersion: 4, warning: null, editable },
    categories, items, cateItems,
  };
}

const BASE: CategoryDef = { cateId: "BASE", cateName: "전체", defKind: "REGEX", defExpr: ".*", defTarget: "CODE", description: null };
const TABLE1: CategoryDef = { cateId: "T1", cateName: "표1", defKind: "TABLE", defExpr: null, defTarget: null, description: null };
const REGEX1: CategoryDef = { cateId: "R1", cateName: "정규식1", defKind: "REGEX", defExpr: "8[0-9]", defTarget: "CODE", description: null };

function stubFetch(view: unknown) {
  globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
    const u = String(url);
    const ok = (result: unknown) => new Response(JSON.stringify({ meta: { success: true }, data: { result } }), { status: 200 });
    if (u.includes("/oasis/codeCateEdit/search")) {
      return ok({ codes: [{ maruCodeId: "M", maruCodeName: "시험 코드", sourceKind: "MDM", status: "INUSE" }] });
    }
    if (u.includes("/oasis/codeCateEdit/view")) return ok(view);
    if (u.includes("/oasis/codeCateEdit/compare")) {
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
  const sel = container.querySelector('[data-testid="cate-maru-select"]') as HTMLSelectElement;
  await act(async () => {
    sel.value = id;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle();
}

async function clickRow(cateId: string) {
  const row = container.querySelector(`[data-testid="cate-row-${cateId}"]`) as HTMLElement;
  await act(async () => {
    row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await settle();
}

const testId = (id: string) => container.querySelector(`[data-testid="${id}"]`);
const buttonTexts = () => Array.from(container.querySelectorAll("button")).map((b) => b.textContent?.trim());

describe("codeCateEdit page", () => {
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
    stubFetch(viewOf("DRAFT", true, [BASE]));
    await render(createElement(CodeCateEditPage));
    expect(container.querySelector(".page-layout__footer-screen-id")?.textContent).toBe("codeCateEdit");
    expect(container.querySelector(".page-layout__footer-breadcrumb")?.textContent).toContain("마루 MDM > 마스터코드 > 카테고리 편집");
  });

  it("② 카테고리가 BASE 뿐인 새 마루 코드는 목록에 BASE 하나만 보인다", async () => {
    stubFetch(viewOf("DRAFT", true, [BASE]));
    await render(createElement(CodeCateEditPage));
    await chooseCode("M");
    expect(testId("cate-row-BASE")).not.toBeNull();
    expect(testId("cate-list")?.querySelectorAll('[data-testid^="cate-row-"]')).toHaveLength(1);
  });

  it("③ DRAFT(편집 가능)는 저장·카테고리 추가가 있고 BASE 행에는 편집·닫기 버튼이 없다", async () => {
    stubFetch(viewOf("DRAFT", true, [BASE, TABLE1]));
    await render(createElement(CodeCateEditPage));
    await chooseCode("M");
    expect(buttonTexts()).toContain("저장");
    expect(testId("cate-add-submit")).not.toBeNull();
    expect(testId("cate-close-BASE")).toBeNull();
    expect(testId("cate-close-T1")).not.toBeNull();
    expect(testId("cate-row-version")?.textContent).toBe("row_version = 4");
  });

  it("④ RELEASED(읽기 전용)는 저장·카테고리 추가·닫기 버튼이 없다", async () => {
    stubFetch(viewOf("RELEASED", false, [BASE, TABLE1]));
    await render(createElement(CodeCateEditPage));
    await chooseCode("M");
    expect(buttonTexts()).not.toContain("저장");
    expect(testId("cate-add-submit")).toBeNull();
    expect(testId("cate-close-T1")).toBeNull();
  });

  it("⑤ TABLE 카테고리를 고르면 transfer-list 가 보인다", async () => {
    stubFetch(viewOf("DRAFT", true, [BASE, TABLE1], [{ code: "A", name: "에이", seq: 1, lvls: ["G", null, null, null, null] }]));
    await render(createElement(CodeCateEditPage));
    await chooseCode("M");
    await clickRow("T1");
    expect(testId("cate-transfer")).not.toBeNull();
    expect(testId("cate-transfer-item-available-A")).not.toBeNull();
  });

  it("⑥ BASE 를 고르면 예약 카테고리 안내만 보이고 편집 영역이 없다", async () => {
    stubFetch(viewOf("DRAFT", true, [BASE]));
    await render(createElement(CodeCateEditPage));
    await chooseCode("M");
    await clickRow("BASE");
    expect(testId("cate-base-readonly")).not.toBeNull();
    expect(testId("cate-regex-edit")).toBeNull();
  });

  it("⑦ REGEX 카테고리를 고르면 정규식 편집 영역과 미리보기가 보인다", async () => {
    stubFetch(viewOf("DRAFT", true, [BASE, REGEX1]));
    await render(createElement(CodeCateEditPage));
    await chooseCode("M");
    await clickRow("R1");
    expect(testId("cate-regex-edit")).not.toBeNull();
    expect((testId("cate-regex-expr") as HTMLInputElement).value).toBe("8[0-9]");
    await settle();
    expect(testId("cate-preview-summary")).not.toBeNull();
  });
});
