/** @vitest-environment happy-dom */

// 저장된 도메인을 열고 테스트 케이스를 [삭제]하면 [저장] 이 꺼지고 다시 검증하라는 안내가 보이며, [도메인검증] 이 통과하면 [저장] 이 켜진다.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import DomainMngPage from "../../../pages/dma/domainMng/page";

const RBAC_STORE_KEY = "__dkOasisButtonRbacStore__";
const originalFetch = globalThis.fetch;
let container: HTMLDivElement;
let root: Root | null = null;
let validateBodies: Array<Record<string, unknown>> = [];

const TEL = {
  DOMAIN_ID: 188, PARENT_DOMAIN_ID: 180, DEPTH: 1, DOMAIN_NAME: "전화 번호", STD_NAME: "TEL_NO", DOMAIN_KIND: "TEXT",
  DATA_TYPE: "STRING", LENGTH: 20, SCALE: null, UNIT_CODE: null, MARU_CODE_ID: null, CATE_ID: null,
  STD_RULE: "STR_MATCHES(value, \"^[0-9-]+$\")", BIZ_RULE: null, VER: 0, EFF_LENGTH: 20, EFF_SCALE: null,
  EFF_STD_EXPR: "STR_MATCHES(value, \"^[0-9-]+$\")", EFF_STD_AST: null, BIZ_REQUIRED_VARS: [], HAS_BIZ: false,
  MATCHED: true, CHILD_COUNT: 0,
};

function stubFetch() {
  validateBodies = [];
  globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    const body = JSON.parse(String((init?.body as string) ?? "{}"));
    if (u === "/api/auth/me") return new Response(JSON.stringify({ user: { id: "u1" } }), { status: 200 });
    if (u === "/api/mcm/oasis/secUser/myButtonEndpoints") {
      return new Response(JSON.stringify({ grids: { buttons: { rows: ["search", "view", "save", "validate", "execute", "delete"]
        .map((action) => ({ objId: "domainMng", action })) } } }), { status: 200 });
    }
    if (u.startsWith("/api/mdm/oasis/domainMng/search")) {
      return new Response(JSON.stringify({ meta: { success: true }, data: { result: { domains: [TEL] } } }), { status: 200 });
    }
    if (u.startsWith("/api/mdm/oasis/domainMng/view")) {
      return new Response(JSON.stringify({ meta: { success: true }, data: { result: {
        domain: { ...TEL, DESCRIPTION: "전화 번호", EXAMPLES: ["010-1234-5678"],
          TEST_CASES: [{ VALUE: "010-1234-5678", EXPECT: true, VARS: null, MEMO: null }, { VALUE: "", EXPECT: false, VARS: null, MEMO: null }] },
        requiredVars: [], impact: null } } }), { status: 200 });
    }
    if (u.startsWith("/api/mdm/oasis/domainMng/validate")) {
      validateBodies.push(body);
      return new Response(JSON.stringify({ meta: { success: true }, data: { result: {
        ok: true, issues: [], classification: "COMPATIBLE", diff: [], testResults: [
          { DOMAIN_ID: 188, DOMAIN_NAME: "전화 번호", OWN: true, IDX: 0, VALUE: "010-1234-5678", EXPECT: true, ACTUAL: true, RESULT: "MATCH", MESSAGE: "" },
        ], effective: {}, requiredVars: [], impact: null } } }), { status: 200 });
    }
    if (u.startsWith("/api/mdm/oasis/domainMng/execute")) {
      return new Response(JSON.stringify({ meta: { success: true }, data: { result: { compileIssues: [] } } }), { status: 200 });
    }
    return new Response("{}", { status: 401 });
  }) as typeof fetch;
}

async function settle(ms = 60) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

const button = (label: string) =>
  Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent?.trim() === label) ?? null;

describe("domainMng — 케이스 삭제 뒤 저장", () => {
  beforeEach(() => {
    delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} });
    stubFetch();
  });
  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    container?.remove();
    globalThis.fetch = originalFetch;
    vi.unstubAllGlobals();
    delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
  });

  it("케이스를 지우고 검증이 통과하면 저장이 켜진다", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(createElement(DmesUiProvider, null, createElement(DomainMngPage)));
    });
    await settle();
    await act(async () => button("조회")!.click());
    await vi.waitFor(() => expect(container.querySelector(".ag-row[row-id='188']")).not.toBeNull());
    const cell = container.querySelector(".ag-row[row-id='188'] .ag-cell") as HTMLElement;
    await act(async () => cell.click());
    await vi.waitFor(() => expect(container.querySelector("[data-testid='case-message-2'], .ag-row[row-id='2']")).not.toBeNull());
    await settle();

    // 두 번째 케이스(빈 입력) 삭제
    const deleteButtons = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).filter((b) => b.textContent?.trim() === "삭제");
    expect(deleteButtons.length).toBeGreaterThanOrEqual(2);
    await act(async () => deleteButtons[1].click());
    await settle();
    expect(button("저장")!.disabled).toBe(true);
    expect(container.querySelector("[data-testid='domain-save-hint']")?.textContent).toContain("[도메인검증]");

    await act(async () => button("도메인검증")!.click());
    await settle(150);
    expect(validateBodies.length).toBe(1);
    const sent = (validateBodies[0].grids as { testCases: { rows: unknown[] } }).testCases.rows;
    expect(sent).toHaveLength(1);
    expect(button("저장")!.disabled, "검증이 통과했는데 저장이 꺼져 있다").toBe(false);
    expect(container.querySelector("[data-testid='domain-save-hint']")).toBeNull();
  });
});
