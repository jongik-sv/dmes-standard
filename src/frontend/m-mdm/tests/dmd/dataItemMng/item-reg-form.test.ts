/** @vitest-environment happy-dom */

// dataItemMng 상세 폼 분리(Screen-Performance-Guide R12) — 항목 추가 등록 폼의 입력 state 가 ItemRegForm 안으로
// 옮겨진 뒤에도 등록 본문·폼 비우기(등록 뒤·마루 데이터 전환)·오른쪽 탭을 오가도 입력 유지가 그대로이고,
// 입력 한 글자마다 화면 루트가 다시 그려지지 않는지 본다.
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import { takeMdmPageParams } from "@/shell";

const mocks = vi.hoisted(() => ({
  grids: {} as Record<string, Record<string, unknown>>,
  layoutRenders: 0,
}));

// 그리드는 그리지 않고 rowKey 별로 props 만 잡는다(항목 code · 카테고리 cateId).
vi.mock("@dk-oasis/shared/grid", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dk-oasis/shared/grid")>();
  return {
    ...actual,
    AgDataGrid: (props: Record<string, unknown>) => {
      mocks.grids[String(props.rowKey)] = props;
      return null;
    },
  };
});

// 화면 루트가 다시 그려지면 MdmPageLayout 도 다시 불린다 — 그 횟수로 루트 재렌더를 센다.
vi.mock("@/shell", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/shell")>();
  return {
    ...actual,
    MdmPageLayout: (props: Parameters<typeof actual.MdmPageLayout>[0]) => {
      mocks.layoutRenders += 1;
      return createElement(actual.MdmPageLayout, props);
    },
  };
});

import DataItemMngPage from "../../../pages/dmd/dataItemMng/page";

import { RBAC_STORE_KEY, findButton, flush, installDomStorage, jsonResponse, typeInto } from "../../dme/helpers/render";

let container: HTMLDivElement;
let root: Root | null = null;
const originalFetch = globalThis.fetch;
let regBodies: string[] = [];

const ok = (result: unknown) => ({ data: { result }, meta: { success: true } });

const MARU = [
  { maruDataId: "PORT", maruDataName: "항구", status: "INUSE", sourceKind: "MDM" },
  { maruDataId: "CUST", maruDataName: "거래처", status: "INUSE", sourceKind: "MDM" },
];

function header(id: string) {
  return {
    maruDataId: id,
    maruDataName: id === "PORT" ? "항구" : "거래처",
    status: "INUSE",
    sourceKind: "MDM",
    sourceSystem: null,
    lvlCnt: 1,
    attrLabels: [{ field: "attr01", label: "국가" }],
    editable: true,
    categories: [{ cateId: "BASE", cateName: "전체", defKind: "REGEX" }],
  };
}

const ROWS = [
  {
    code: "KRPUS", name: "부산", alterName: null, seq: 1, description: null, lvl1: "KR", attr01: "KR",
    validFrom: "2026-08-20 09:00:00", validTo: "9999-12-31 00:00:00", open: true, rowVersion: 0,
  },
];

const CATE_LIST = [
  { cateId: "BASE", cateName: "전체", defKind: "REGEX", defExpr: "^.*$", defTarget: "KEY", description: null, open: true, matchCount: 1 },
];

function el<T extends HTMLElement = HTMLInputElement>(testId: string): T {
  const found = container.querySelector(`[data-testid="${testId}"]`);
  expect(found, testId).toBeTruthy();
  const input = found!.matches("input, textarea, select") ? found : found!.querySelector("input, textarea, select");
  return (input ?? found) as T;
}

async function render() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(DmesUiProvider, null, createElement(DataItemMngPage)));
  });
  await flush();
  await flush();
}

async function click(testId: string) {
  const target = container.querySelector(`[data-testid="${testId}"]`);
  expect(target, testId).toBeTruthy();
  await act(async () => {
    target!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flush();
}

/** 조회칸 고르기(IdPicker)에서 `keyword` 로 찾아 그 ID 후보를 누른다. */
async function chooseMaru(id: string) {
  const input = el("item-pick-keyword");
  await typeInto(input, id);
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  await flush();
  await click(`item-pick-${id}`);
}

/** [항목 추가] 로 등록 폼을 연다 — 오른쪽 [코드 테스트] 탭에서 봐야 화면에 그려진다. */
async function openForm() {
  await click("item-add");
  await click("item-right-tab-test");
}

/** 한 글자씩 친다(사람 입력처럼 매 글자 onChange). */
async function typeChars(input: HTMLInputElement, text: string) {
  for (let i = 1; i <= text.length; i += 1) {
    await typeInto(input, text.slice(0, i));
  }
}

describe("DataItemMngPage 상세 폼 분리(R12)", () => {
  beforeEach(() => {
    installDomStorage();
    mocks.grids = {};
    mocks.layoutRenders = 0;
    regBodies = [];
    takeMdmPageParams("dmd/dataItemMng");
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const params = JSON.parse(String(init?.body ?? "{}")).params ?? {};
      if (url.includes("/oasis/dataItemMng/view"))
        return jsonResponse(ok({ maruDataOptions: MARU, ...(params.maruDataId ? { header: header(String(params.maruDataId)) } : {}) }));
      if (url.includes("/oasis/dataItemMng/search"))
        return jsonResponse(ok({ list: ROWS, totalCount: ROWS.length, page: 0, size: 20000 }));
      if (url.includes("/oasis/dataItemMng/reg")) {
        regBodies.push(String(init?.body ?? ""));
        return jsonResponse(ok({ action: "reg", row: ROWS[0] }));
      }
      if (url.includes("/oasis/dataCateEdit/search"))
        return jsonResponse(ok({ maruDataId: params.maruDataId, lvlCnt: 1, attrLabels: ["국가"], list: CATE_LIST }));
      if (url.includes("/oasis/dataHistory/search"))
        return jsonResponse(ok({ target: params.target, key: params.key, state: "OPEN", rows: [] }));
      if (url.includes("/api/auth/me")) return jsonResponse({ user: { id: "tester" } });
      if (url.includes("/api/mcm/oasis/secUser/myButtonEndpoints"))
        return jsonResponse({ grids: { buttons: { rows: [{ objId: "*", action: "*", endpoint: "*", httpMethod: "*" }] } } });
      return jsonResponse({}, 404);
    }) as typeof fetch;
    delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    globalThis.fetch = originalFetch;
    delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
    takeMdmPageParams("dmd/dataItemMng");
  });

  it("등록 폼을 입력해도 화면 루트는 다시 그려지지 않는다", async () => {
    await render();
    await openForm();
    expect(el("item-form-name").value).toBe("");

    const before = mocks.layoutRenders;
    await typeChars(el("item-form-name"), "부산항");
    expect(el("item-form-name").value).toBe("부산항");
    expect(mocks.layoutRenders).toBe(before);
  });

  it("입력한 값이 등록 요청 본문에 실리고, 등록이 끝나면 폼을 비운다", async () => {
    await render();
    await openForm();
    await typeInto(el("item-form-code"), "KRINC");
    await typeInto(el("item-form-name"), "인천");
    await click("item-form-submit");
    expect(regBodies).toHaveLength(1);
    expect(regBodies[0]).toContain("KRINC");
    expect(regBodies[0]).toContain("인천");
    expect(container.querySelector('[data-testid="item-form"]')).toBeNull();
  });

  it("마루 데이터를 바꾸면 폼을 비운다", async () => {
    await render();
    await openForm();
    await typeInto(el("item-form-name"), "고친 값");
    await chooseMaru("CUST");
    expect(container.querySelector('[data-testid="item-form"]')).toBeNull();
  });

  it("코드 테스트 ↔ 카테고리 편집 탭을 오가도 입력은 남는다", async () => {
    await render();
    await openForm();
    await typeInto(el("item-form-name"), "임시 값");
    await click("item-right-tab-cate");
    expect(container.querySelector('[data-testid="item-form"]')).toBeNull();
    await click("item-right-tab-test");
    expect(el("item-form-name").value).toBe("임시 값");
  });

  it("[취소] 는 폼을 비운다", async () => {
    await render();
    await openForm();
    await typeInto(el("item-form-name"), "버릴 값");
    await click("item-form-cancel");
    expect(container.querySelector('[data-testid="item-form"]')).toBeNull();
  });
});
