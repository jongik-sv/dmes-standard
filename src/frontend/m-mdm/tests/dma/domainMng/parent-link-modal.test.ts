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
let closed = false;

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
  { DOMAIN_ID: 4, PARENT_DOMAIN_ID: null, DOMAIN_NAME: "판 두께", STD_NAME: "PLATE_T" },
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
    if (action === "search") {
      // 서버 검색 흉내 — keyword 부분 일치만 MATCHED, 빈 글자는 전부.
      const kw = String((JSON.parse(String(init?.body ?? "{}")).params ?? {}).keyword ?? "");
      return ok({ domains: ROWS.map((r) => ({ ...r, MATCHED: kw === "" || r.DOMAIN_NAME.includes(kw) || r.STD_NAME.includes(kw) })) });
    }
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
      open: true, mode, rows: ROWS as never, domain: DOMAIN, dirty: true, onClose: () => { closed = true; }, onChanged,
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

const FIELD = "[data-testid='domain-parent-link-field']";

async function typeAndEnter(text: string) {
  const input = modal().querySelector<HTMLInputElement>(FIELD)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  await settle();
}

function searchCalls() {
  return calls.filter((c) => c.action === "search");
}

describe("ParentLinkModal", () => {
  beforeEach(() => {
    validateOk = true;
    closed = false;
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
    expect(searchCalls(), "열 때 전체 조회를 하지 않는다").toHaveLength(0);
    expect(button("교체").disabled).toBe(true);

    await typeAndEnter("길이");
    expect(searchCalls()).toHaveLength(1);
    expect(searchCalls()[0].body.params.keyword).toBe("길이");
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

  it("자기·지금 부모는 이름을 정확히 넣어도 고를 수 없고, 찾기 팝업 목록에도 나오지 않는다", async () => {
    await render("link");
    for (const name of ["코일 두께", "THK"]) {
      await typeAndEnter(name);
      expect(calls.filter((c) => c.action === "validate"), `${name} 로는 검증하지 않는다`).toHaveLength(0);
      const pop = document.querySelector("[data-testid='domain-parent-link-field-box']");
      expect(pop, `${name} 입력은 팝업을 연다`).not.toBeNull();
      expect(pop!.querySelectorAll("li")).toHaveLength(0);
      expect(pop!.textContent).toContain("검색 결과가 없습니다");
      await act(async () => {
        Array.from(pop!.querySelectorAll("button")).find((b) => b.textContent === "닫기")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    }
    expect(button("교체").disabled).toBe(true);
  });

  it("후보에서 뺀 도메인 이름을 넣어도 남은 다른 후보(판 두께)가 저절로 적용되지 않고, 팝업 목록에 그 후보가 보인다", async () => {
    await render("link");
    await typeAndEnter("두께"); // 지금 부모(두께)·자기(코일 두께)는 제외 — 남는 건 판 두께 하나
    expect(calls.filter((c) => c.action === "validate")).toHaveLength(0);
    expect(modal().querySelector<HTMLInputElement>(FIELD)!.value).toBe("두께");
    const pop = document.querySelector("[data-testid='domain-parent-link-field-box']");
    expect(pop, "팝업이 열린다").not.toBeNull();
    expect(Array.from(pop!.querySelectorAll("li")).map((li) => li.textContent)).toEqual([expect.stringContaining("판 두께")]);
    expect(button("교체").disabled).toBe(true);
  });

  it("찾기 팝업이 위에 떠 있을 때 Escape 는 그 팝업만 닫고 연결 팝업은 남는다", async () => {
    await render("link");
    await act(async () => {
      document.querySelector<HTMLButtonElement>("[data-testid='domain-parent-link-field-find']")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await settle();
    expect(document.querySelector("[data-testid='domain-parent-link-field-box']")).not.toBeNull();
    await act(async () => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    await settle();
    expect(document.querySelector("[data-testid='domain-parent-link-field-box']")).toBeNull();
    expect(closed, "연결 팝업은 닫히지 않는다").toBe(false);
  });

  it("칸을 비우면 선택이 풀리고 실행 단추가 잠긴다", async () => {
    await render("link");
    await typeAndEnter("길이");
    expect(button("교체").disabled).toBe(false);
    await typeAndEnter("");
    expect(button("교체").disabled).toBe(true);
  });

  it("오류가 있으면 실행 단추가 잠긴다", async () => {
    validateOk = false;
    await render("link");
    await typeAndEnter("길이");
    expect(modal().textContent).toContain("유효 단위 mm → ton");
    expect(button("교체").disabled).toBe(true);
  });

  it("연결 제거 — 열자마자 부모 없이 검증한다", async () => {
    await render("unlink");
    expect(document.body.textContent).toContain("부모 연결 제거");
    const validate = calls.find((c) => c.action === "validate")!;
    expect(validate.body.params.parentDomainId).toBeUndefined();
    expect(validate.body.params.domainId).toBe(2);
    expect(modal().querySelector(FIELD)).toBeNull();
    expect(searchCalls()).toHaveLength(0);
    expect(button("연결 제거").disabled).toBe(false);
  });
});
