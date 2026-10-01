/** @vitest-environment happy-dom */

// D-132 — 부모 연결 대화상자: 저장된 행에 부모만 바꿔 validate(경고 미리보기) → 실행 단추로 save. 오류가 있으면 실행 단추가 잠긴다.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import { ParentLinkModal } from "../../../pages/dma/domainMng/components/ParentLinkModal";
import type { DomainDetail } from "../../../pages/dma/domainMng/types";

let container: HTMLDivElement;
let root: Root | null = null;
const originalFetch = globalThis.fetch;
let calls: Array<{ action: string; body: { params: Record<string, unknown>; grids?: Record<string, { rows: unknown[] }> } }>;
let validateOk = true;

const DOMAIN: DomainDetail = {
  DOMAIN_ID: 2, PARENT_DOMAIN_ID: 1, DEPTH: 1, DOMAIN_NAME: "코일 두께", STD_NAME: "COIL_THK", DOMAIN_KIND: "QTY",
  DATA_TYPE: "NUMBER", LENGTH: 10, SCALE: null, UNIT_CODE: null, MARU_CODE_ID: null, CATE_ID: null, STD_RULE: "value < 9",
  BIZ_RULE: null, VER: 4, EFF_LENGTH: 10, EFF_SCALE: null, EFF_UNIT_CODE: "mm", EFF_MARU_CODE_ID: null, EFF_CATE_ID: null,
  EFF_STD_EXPR: null, EFF_STD_AST: null, EFF_BIZ_EXPR: null, BIZ_REQUIRED_VARS: [], HAS_BIZ: false, CHILD_COUNT: 0,
  MATCHED: true, DESCRIPTION: null, EXAMPLES: [], TEST_CASES: [{ VALUE: "5", EXPECT: true, VARS: null, MEMO: null }],
};

const ROWS = [
  { DOMAIN_ID: 1, PARENT_DOMAIN_ID: null, DOMAIN_NAME: "두께", STD_NAME: "THK" },
  { DOMAIN_ID: 2, PARENT_DOMAIN_ID: 1, DOMAIN_NAME: "코일 두께", STD_NAME: "COIL_THK" },
  { DOMAIN_ID: 3, PARENT_DOMAIN_ID: null, DOMAIN_NAME: "길이", STD_NAME: "LEN" },
];

function ok(result: unknown) {
  return new Response(JSON.stringify({ meta: { success: true }, data: { result } }), { status: 200 });
}

function stubFetch() {
  calls = [];
  globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    const action = u.split("/").pop() ?? "";
    calls.push({ action, body: JSON.parse(String(init?.body ?? "{}")) });
    if (action === "search") return ok({ domains: ROWS });
    if (action === "validate") {
      return ok({
        ok: validateOk, classification: "PARENT_CHANGE",
        issues: [validateOk
          ? { CODE: "W04", LEVEL: "WARN", FIELD: "PARENT_DOMAIN_ID", ITEM_KEY: null, MESSAGE: "참조 컬럼 2개, 하위 도메인 0개" }
          : { CODE: "S02", LEVEL: "ERROR", FIELD: "UNIT_CODE", ITEM_KEY: null, MESSAGE: "유효 단위 mm → ton" }],
        diff: [{ FIELD: "PARENT_DOMAIN_ID", LABEL: "부모 도메인", BEFORE: 1, AFTER: 3, DIRECTION: "RELINK" }],
        testResults: [], impact: { descendants: [], columns: [], ruleVars: [], layoutItems: [], otherRefs: [], systems: [],
          deployHeld: true },
      });
    }
    if (action === "save") return ok({ domainId: 2, ver: 5, classification: "PARENT_CHANGE", warnings: [] });
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
}

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
}

async function render(mode: "link" | "unlink", onChanged = vi.fn()) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(DmesUiProvider, null, createElement(ParentLinkModal, {
      open: true, mode, domain: DOMAIN, dirty: true, onClose: () => {}, onChanged,
    })));
  });
  await settle();
  return onChanged;
}

function modal(): HTMLElement {
  const el = document.querySelector<HTMLElement>("[data-testid='domain-parent-link-modal']");
  if (!el) throw new Error("대화상자가 없다");
  return el;
}

function button(label: string): HTMLButtonElement {
  const b = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((x) => x.textContent?.trim() === label);
  if (!b) throw new Error(`단추 ${label} 없음`);
  return b;
}

async function choose(value: string) {
  const sel = modal().querySelector<HTMLSelectElement>("select[aria-label='부모 도메인']")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(sel, value);
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle();
}

describe("ParentLinkModal", () => {
  beforeEach(() => {
    validateOk = true;
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} });
    stubFetch();
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    container?.remove();
    globalThis.fetch = originalFetch;
    vi.unstubAllGlobals();
  });

  it("교체 — 후보는 자기·지금 부모를 빼고, 고르면 검증하고, 실행하면 저장된 값에 부모만 바꿔 저장한다", async () => {
    const onChanged = await render("link");
    expect(document.body.textContent).toContain("부모 교체");
    expect(modal().textContent).toContain("편집 중인 변경은 저장되지 않고 버려집니다");
    const options = Array.from(modal().querySelectorAll("select[aria-label='부모 도메인'] option")).map((o) => o.textContent);
    expect(options).toEqual(["선택", "길이 (LEN)"]);
    expect(button("교체").disabled).toBe(true);

    await choose("3");
    const validate = calls.find((c) => c.action === "validate")!;
    expect(validate.body.params).toMatchObject({ domainId: 2, ver: 4, parentDomainId: 3, length: 10, stdRule: "value < 9" });
    expect(validate.body.grids?.testCases.rows).toEqual([{ VALUE: "5", EXPECT: true, VARS: "", MEMO: "" }]);
    expect(modal().textContent).toContain("참조 컬럼 2개");
    expect(modal().textContent).toContain("부모 변경");
    expect(button("교체").disabled).toBe(false);

    await act(async () => {
      button("교체").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await settle();
    const save = calls.find((c) => c.action === "save")!;
    expect(save.body.params).toEqual(validate.body.params);
    expect(onChanged).toHaveBeenCalledWith(2);
  });

  it("오류가 있으면 실행 단추가 잠긴다", async () => {
    validateOk = false;
    await render("link");
    await choose("3");
    expect(modal().textContent).toContain("유효 단위 mm → ton");
    expect(button("교체").disabled).toBe(true);
  });

  it("연결 제거 — 열자마자 부모 없이 검증한다", async () => {
    await render("unlink");
    expect(document.body.textContent).toContain("부모 연결 제거");
    const validate = calls.find((c) => c.action === "validate")!;
    expect(validate.body.params.parentDomainId).toBeUndefined();
    expect(validate.body.params.domainId).toBe(2);
    expect(modal().querySelector("select[aria-label='부모 도메인']")).toBeNull();
    expect(button("연결 제거").disabled).toBe(false);
  });
});
