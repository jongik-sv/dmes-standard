/** @vitest-environment happy-dom */

// TSK-08-02 design §3.2 — ruleMng 렌더 테스트. 목록 요청 파라미터·빈 상태·ID 규칙 즉시 표시·서버 오류·등록 성공 이동.
// ag-grid 의 행 렌더는 happy-dom 에서 불안정해 GridPanel 건수와 요청 본문으로 확인한다(termMng 선례).
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

const openRuleEdit = vi.fn();
vi.mock("@/dme/rule-handoff", () => ({
  openRuleEdit: (...args: unknown[]) => openRuleEdit(...args),
}));

import RuleMngPage from "../../../pages/dme/ruleMng/page";
import { ruleIdError } from "../../../pages/dme/ruleMng/types";

import {
  RBAC_STORE_KEY,
  findButton,
  flush,
  installDomStorage,
  jsonResponse,
  typeInto,
  visibleText,
} from "../helpers/render";

let container: HTMLDivElement;
let root: Root | null = null;
const originalFetch = globalThis.fetch;
let requests: Array<{ url: string; body: Record<string, unknown> }> = [];
let searchResult: Record<string, unknown> = { list: [], totalCount: 0, page: 0, size: 20 };
let regResponse: unknown = { meta: { success: true }, data: { result: { maruRuleId: "E2E_NEW_JDG", ver: 1, rowVersion: 0 } } };
let rbacRows: Array<Record<string, string>> = [{ objId: "*", action: "*", endpoint: "*", httpMethod: "*" }];

async function render() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(DmesUiProvider, null, createElement(RuleMngPage)));
  });
}

function byTestId<T extends Element>(id: string): T {
  const el = container.querySelector(`[data-testid="${id}"]`);
  if (!el) throw new Error(`data-testid ${id} 없음`);
  return el as T;
}

describe("RuleMngPage", () => {
  beforeEach(() => {
    installDomStorage();
    requests = [];
    openRuleEdit.mockReset();
    searchResult = { list: [], totalCount: 0, page: 0, size: 20 };
    regResponse = { meta: { success: true }, data: { result: { maruRuleId: "E2E_NEW_JDG", ver: 1, rowVersion: 0 } } };
    rbacRows = [{ objId: "*", action: "*", endpoint: "*", httpMethod: "*" }];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (url.includes("/oasis/ruleMng/")) requests.push({ url, body });
      if (url.includes("/oasis/ruleMng/search")) {
        return jsonResponse({ data: { result: searchResult }, meta: { success: true } });
      }
      if (url.includes("/oasis/ruleMng/reg")) return jsonResponse(regResponse);
      if (url.includes("/api/auth/me")) return jsonResponse({ user: { id: "tester" } });
      if (url.includes("/api/mcm/oasis/secUser/myButtonEndpoints")) {
        return jsonResponse({ grids: { buttons: { rows: rbacRows } } });
      }
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
  });

  it("처음 조회는 page 0·size 20 으로 서버 페이징을 요청한다", async () => {
    await render();
    const search = requests.filter((r) => r.url.includes("/ruleMng/search"));
    expect(search).toHaveLength(1);
    expect(search[0].body.params).toEqual({ page: 0, size: 20 });
    expect(search[0].body.meta).toEqual({ menuId: "ruleMng" });
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });

  it("다음 페이지를 누르면 page 1 을 같은 조건으로 요청한다", async () => {
    searchResult = {
      list: [{ maruRuleId: "A_RULE", maruRuleName: "가", ruleKind: "DECISION", sourceKind: "MDM", status: "INUSE" }],
      totalCount: 45,
      page: 0,
      size: 20,
    };
    await render();
    await typeInto(byTestId<HTMLInputElement>("rule-search-keyword"), "QLTY");
    await act(async () => {
      findButton(container, "조회").click();
    });
    await flush();
    await act(async () => {
      findButton(container, "다음").click();
    });
    await flush();
    const search = requests.filter((r) => r.url.includes("/ruleMng/search"));
    expect(search.at(-1)!.body.params).toEqual({ keyword: "QLTY", page: 1, size: 20 });
    expect(visibleText(container)).toContain("45건");
  });

  it("목록이 비면 0건과 빈 상태 문구 자리를 보인다", async () => {
    await render();
    expect(visibleText(container)).toContain("룰 목록");
    expect(visibleText(container)).toContain("0건");
    expect(visibleText(container)).toContain("조회된 룰이 없습니다.");
  });

  it("등록 폼은 원천 선택 칸 없이 MDM 고정 표시다", async () => {
    await render();
    expect(visibleText(container)).toContain("MDM");
    expect(container.querySelector('[data-testid="rule-reg-source"]')?.tagName).not.toBe("SELECT");
  });

  it("룰 ID 가 물리명 규칙을 어기면 즉시 안내하고 저장을 막는다", async () => {
    await render();
    await typeInto(byTestId<HTMLInputElement>("rule-reg-id"), "qlty-bad");
    await typeInto(byTestId<HTMLInputElement>("rule-reg-name"), "나쁜 ID");
    expect(visibleText(container)).toContain("컬럼 물리명 규칙");
    expect(findButton(container, "룰 등록").disabled).toBe(true);

    await typeInto(byTestId<HTMLInputElement>("rule-reg-id"), "QLTY_OK");
    expect(visibleText(container)).not.toContain("컬럼 물리명 규칙");
    expect(findButton(container, "룰 등록").disabled).toBe(false);
  });

  it("서버가 거부하면 오류를 화면에 보인다", async () => {
    regResponse = { meta: { success: false, message: "같은 ID 의 룰이 이미 있습니다: QLTY_GRD_JDG" } };
    await render();
    await typeInto(byTestId<HTMLInputElement>("rule-reg-id"), "QLTY_GRD_JDG");
    await typeInto(byTestId<HTMLInputElement>("rule-reg-name"), "중복");
    await act(async () => {
      findButton(container, "룰 등록").click();
    });
    await flush();
    expect(visibleText(document.body)).toContain("같은 ID 의 룰이 이미 있습니다");
    expect(openRuleEdit).not.toHaveBeenCalled();
  });

  it("등록에 성공하면 요청 본문은 원천 없이 보내고 룰 화면으로 이동한다", async () => {
    await render();
    await typeInto(byTestId<HTMLInputElement>("rule-reg-id"), "E2E_NEW_JDG");
    await typeInto(byTestId<HTMLInputElement>("rule-reg-name"), "E2E 신규 판정");
    await act(async () => {
      findButton(container, "룰 등록").click();
    });
    await flush();
    const reg = requests.find((r) => r.url.includes("/ruleMng/reg"))!;
    expect(reg.body.params).toEqual({ maruRuleId: "E2E_NEW_JDG", maruRuleName: "E2E 신규 판정", ruleKind: "DECISION" });
    expect(openRuleEdit).toHaveBeenCalledWith("E2E_NEW_JDG", 1);
    // 등록 뒤 목록을 다시 조회한다.
    expect(requests.filter((r) => r.url.includes("/ruleMng/search")).length).toBeGreaterThanOrEqual(2);
  });

  it("등록 권한(reg)이 없으면 등록 버튼을 숨기지 않고 비활성으로 둔다", async () => {
    rbacRows = [{ objId: "ruleMng", action: "search", endpoint: "", httpMethod: "POST" }];
    await render();
    await flush();
    await typeInto(byTestId<HTMLInputElement>("rule-reg-id"), "QLTY_OK");
    await typeInto(byTestId<HTMLInputElement>("rule-reg-name"), "권한 없음");
    expect(findButton(container, "룰 등록").disabled).toBe(true);
  });
});

describe("ruleIdError", () => {
  it("컬럼 물리명 규칙(정규식·50자)을 따른다", () => {
    expect(ruleIdError("QLTY_GRD_JDG")).toBeNull();
    expect(ruleIdError("A1")).toBeNull();
    expect(ruleIdError("")).not.toBeNull();
    for (const bad of ["qlty_grd", "QLTY__GRD", "_QLTY", "QLTY_", "QLTY-GRD", "1QLTY", "QLTY GRD", "A".repeat(51)]) {
      expect(ruleIdError(bad), bad).not.toBeNull();
    }
    expect(ruleIdError("A".repeat(50))).toBeNull();
  });
});
