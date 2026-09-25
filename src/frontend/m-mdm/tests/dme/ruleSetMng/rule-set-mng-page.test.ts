/** @vitest-environment happy-dom */

// TSK-08-06 design §2.3·§6.11 — ruleSetMng 렌더 테스트. 목록 요청 파라미터(필터 넷)·계산 칸 표시·빈 상태·ID 규칙 즉시 표시·
// 서버 오류·등록 성공 → 룰 세트 편집 이동(I22 보내는 쪽)·목록 ID 링크 이동·RBAC.
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

const openMdmPage = vi.fn();
vi.mock("@/shell", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shell")>()),
  openMdmPage: (...args: unknown[]) => openMdmPage(...args),
}));

import RuleSetMngPage from "../../../pages/dme/ruleSetMng/page";
import { setCheckText, setIdError } from "../../../pages/dme/ruleSetMng/types";

import {
  RBAC_STORE_KEY,
  findButton,
  flush,
  installDomStorage,
  jsonResponse,
  selectValue,
  typeInto,
  visibleText,
} from "../helpers/render";

let container: HTMLDivElement;
let root: Root | null = null;
const originalFetch = globalThis.fetch;
let requests: Array<{ url: string; body: Record<string, unknown> }> = [];
let searchResult: Record<string, unknown> = { rows: [], totalCount: 0 };
let regResponse: unknown = { meta: { success: true }, data: { result: { setId: "E2S_NEW_SET", rowVersion: 0 } } };
let rbacRows: Array<Record<string, string>> = [{ objId: "*", action: "*", endpoint: "*", httpMethod: "*" }];

const LIST_ROWS = [
  {
    setId: "E2S_CHAIN",
    setName: "사슬",
    ruleCount: 3,
    finalResults: ["S_SPD"],
    inputCount: 3,
    description: "통과 사슬",
    rejectCount: 0,
    warnCount: 0,
    status: "INUSE",
  },
  {
    setId: "E2S_BADORD",
    setName: "순서 뒤집힘",
    ruleCount: 2,
    finalResults: [],
    inputCount: 2,
    rejectCount: 1,
    warnCount: 2,
    status: "INUSE",
  },
  {
    setId: "E2S_OLDSET",
    setName: "폐기 세트",
    ruleCount: 1,
    finalResults: ["S_GRD"],
    inputCount: 1,
    rejectCount: 0,
    warnCount: 0,
    status: "DEPRECATED",
  },
];

async function render() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(DmesUiProvider, null, createElement(RuleSetMngPage)));
  });
}

/** ag-grid 가 행을 그릴 때까지 기다린다(headerMng 선례). */
async function settle(ms = 300) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

function byTestId<T extends Element>(id: string): T {
  const el = container.querySelector(`[data-testid="${id}"]`);
  if (!el) throw new Error(`data-testid ${id} 없음`);
  return el as T;
}

function cellText(rowId: string, colId: string): string {
  const row = container.querySelector(`[data-testid="set-list"] .ag-row[row-id="${rowId}"]`);
  const cell = row?.querySelector(`.ag-cell[col-id="${colId}"]`);
  if (!cell) throw new Error(`셀 ${rowId}/${colId} 없음`);
  return cell.textContent ?? "";
}

describe("RuleSetMngPage", () => {
  beforeEach(() => {
    installDomStorage();
    requests = [];
    openMdmPage.mockReset();
    searchResult = { rows: [], totalCount: 0 };
    regResponse = { meta: { success: true }, data: { result: { setId: "E2S_NEW_SET", rowVersion: 0 } } };
    rbacRows = [{ objId: "*", action: "*", endpoint: "*", httpMethod: "*" }];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (url.includes("/oasis/ruleSetMng/")) requests.push({ url, body });
      if (url.includes("/oasis/ruleSetMng/search")) {
        return jsonResponse({ data: { result: searchResult }, meta: { success: true } });
      }
      if (url.includes("/oasis/ruleSetMng/reg")) return jsonResponse(regResponse);
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

  it("처음 조회는 meta.menuId=ruleSetMng, page 0·size 20 으로 요청한다", async () => {
    await render();
    const search = requests.filter((r) => r.url.includes("/ruleSetMng/search"));
    expect(search).toHaveLength(1);
    expect(search[0].body.params).toEqual({ page: 0, size: 20 });
    expect(search[0].body.meta).toEqual({ menuId: "ruleSetMng" });
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });

  it("조회 조건 넷(세트·담은 룰·결과 변수·상태)을 그대로 보내고 page 0 부터 다시 조회한다", async () => {
    searchResult = { rows: LIST_ROWS, totalCount: 45 };
    await render();
    await typeInto(byTestId<HTMLInputElement>("set-search-keyword"), "E2S_");
    await typeInto(byTestId<HTMLInputElement>("set-search-rule"), "E2S_OLD");
    await typeInto(byTestId<HTMLInputElement>("set-search-var"), "S_GRD");
    await selectValue(byTestId<HTMLSelectElement>("set-search-status"), "DEPRECATED");
    await act(async () => {
      findButton(container, "조회").click();
    });
    await flush();
    const search = requests.filter((r) => r.url.includes("/ruleSetMng/search"));
    expect(search.at(-1)!.body.params).toEqual({
      keyword: "E2S_",
      ruleId: "E2S_OLD",
      resultVar: "S_GRD",
      status: "DEPRECATED",
      page: 0,
      size: 20,
    });

    await act(async () => {
      findButton(container, "다음").click();
    });
    await flush();
    expect(requests.filter((r) => r.url.includes("/ruleSetMng/search")).at(-1)!.body.params).toEqual({
      keyword: "E2S_",
      ruleId: "E2S_OLD",
      resultVar: "S_GRD",
      status: "DEPRECATED",
      page: 1,
      size: 20,
    });
    expect(visibleText(container)).toContain("45건");
  });

  it("계산 칸을 보인다 — 최종 결과 변수 코드 칩, 통과·거부 N·경고 N, DEPRECATED 는 '-'", async () => {
    searchResult = { rows: LIST_ROWS, totalCount: 3 };
    await render();
    await settle();
    expect(cellText("E2S_CHAIN", "ruleCount")).toBe("3");
    expect(cellText("E2S_CHAIN", "inputCount")).toBe("3");
    expect(cellText("E2S_CHAIN", "checkText")).toBe("통과");
    const chip = container.querySelector('[data-testid="set-list"] .ag-row[row-id="E2S_CHAIN"] .ag-cell[col-id="finalResults"] code');
    expect(chip?.textContent).toBe("S_SPD");
    expect(cellText("E2S_BADORD", "finalResults")).toBe("-");
    expect(cellText("E2S_BADORD", "checkText")).toBe("거부 1 · 경고 2");
    expect(cellText("E2S_OLDSET", "checkText")).toBe("-");
    expect(cellText("E2S_OLDSET", "status")).toContain("DEPRECATED");
  });

  it("목록이 비면 빈 상태 문구를 보인다", async () => {
    await render();
    expect(visibleText(container)).toContain("룰 세트 목록");
    expect(visibleText(container)).toContain("0건");
    expect(byTestId("set-list-empty").textContent).toBe("조건에 맞는 룰 세트가 없다");
  });

  it("세트 ID 가 물리명 규칙을 어기면 즉시 안내하고 저장을 막는다", async () => {
    await render();
    expect(container.querySelector('[data-testid="set-reg-id-error"]')).toBeNull();
    await typeInto(byTestId<HTMLInputElement>("set-reg-id"), "bad-id");
    await typeInto(byTestId<HTMLInputElement>("set-reg-name"), "나쁜 ID");
    expect(byTestId("set-reg-id-error").textContent).toContain("룰 세트 ID 는 컬럼 물리명 규칙");
    expect(byTestId<HTMLButtonElement>("set-reg-save").disabled).toBe(true);

    await typeInto(byTestId<HTMLInputElement>("set-reg-id"), "E2S_OK");
    expect(container.querySelector('[data-testid="set-reg-id-error"]')).toBeNull();
    expect(byTestId<HTMLButtonElement>("set-reg-save").disabled).toBe(false);
  });

  it("세트명이 비면 저장을 막는다", async () => {
    await render();
    await typeInto(byTestId<HTMLInputElement>("set-reg-id"), "E2S_OK");
    expect(byTestId<HTMLButtonElement>("set-reg-save").disabled).toBe(true);
  });

  it("서버가 거부하면 오류를 화면에 보이고 편집 화면으로 가지 않는다", async () => {
    regResponse = { meta: { success: false, message: "이미 있는 룰 세트 ID 입니다: E2S_CHAIN" } };
    await render();
    await typeInto(byTestId<HTMLInputElement>("set-reg-id"), "E2S_CHAIN");
    await typeInto(byTestId<HTMLInputElement>("set-reg-name"), "중복");
    await act(async () => {
      byTestId<HTMLButtonElement>("set-reg-save").click();
    });
    await flush();
    expect(visibleText(document.body)).toContain("이미 있는 룰 세트 ID 입니다: E2S_CHAIN");
    expect(openMdmPage).not.toHaveBeenCalled();
  });

  it("등록에 성공하면 목록을 다시 조회하고 룰 세트 편집 화면을 그 세트로 연다", async () => {
    await render();
    await typeInto(byTestId<HTMLInputElement>("set-reg-id"), "E2S_NEW_SET");
    await typeInto(byTestId<HTMLInputElement>("set-reg-name"), "E2E 새 세트");
    await act(async () => {
      byTestId<HTMLButtonElement>("set-reg-save").click();
    });
    await flush();
    const reg = requests.find((r) => r.url.includes("/ruleSetMng/reg"))!;
    expect(reg.body.meta).toEqual({ menuId: "ruleSetMng" });
    // 빈 설명은 보내지 않는다.
    expect(reg.body.params).toEqual({ setId: "E2S_NEW_SET", setName: "E2E 새 세트" });
    expect(openMdmPage).toHaveBeenCalledTimes(1);
    expect(openMdmPage).toHaveBeenCalledWith("dme/ruleSetEdit", { setId: "E2S_NEW_SET" });
    expect(requests.filter((r) => r.url.includes("/ruleSetMng/search")).length).toBeGreaterThanOrEqual(2);
  });

  it("설명을 넣으면 함께 보낸다", async () => {
    await render();
    await typeInto(byTestId<HTMLInputElement>("set-reg-id"), "E2S_NEW_SET");
    await typeInto(byTestId<HTMLInputElement>("set-reg-name"), "E2E 새 세트");
    await typeInto(byTestId<HTMLTextAreaElement>("set-reg-desc"), "설명 한 줄");
    await act(async () => {
      byTestId<HTMLButtonElement>("set-reg-save").click();
    });
    await flush();
    const reg = requests.find((r) => r.url.includes("/ruleSetMng/reg"))!;
    expect(reg.body.params).toEqual({ setId: "E2S_NEW_SET", setName: "E2E 새 세트", description: "설명 한 줄" });
  });

  it("목록의 세트 ID 를 누르면 룰 세트 편집 화면을 그 세트로 연다", async () => {
    searchResult = { rows: LIST_ROWS, totalCount: 3 };
    await render();
    await settle();
    const link = byTestId<HTMLButtonElement>("set-link-E2S_BADORD");
    await act(async () => {
      link.click();
    });
    expect(openMdmPage).toHaveBeenCalledWith("dme/ruleSetEdit", { setId: "E2S_BADORD" });
  });

  it("등록 권한(reg)이 없으면 저장 버튼을 숨기지 않고 비활성으로 둔다", async () => {
    rbacRows = [{ objId: "ruleSetMng", action: "search", endpoint: "", httpMethod: "POST" }];
    await render();
    await flush();
    await typeInto(byTestId<HTMLInputElement>("set-reg-id"), "E2S_OK");
    await typeInto(byTestId<HTMLInputElement>("set-reg-name"), "권한 없음");
    expect(byTestId<HTMLButtonElement>("set-reg-save").disabled).toBe(true);
  });
});

describe("setIdError", () => {
  it("컬럼 물리명 규칙(정규식·50자)을 따른다", () => {
    expect(setIdError("LS_A3")).toBeNull();
    expect(setIdError("A1")).toBeNull();
    expect(setIdError("")).not.toBeNull();
    for (const bad of ["ls_a3", "A__B", "_LS", "LS_", "bad-id", "1LS", "LS A3", "A".repeat(51)]) {
      expect(setIdError(bad), bad).not.toBeNull();
    }
    expect(setIdError("A".repeat(50))).toBeNull();
  });
});

describe("setCheckText", () => {
  it("DEPRECATED 는 '-', 거부가 있으면 '거부 N', 아니면 '통과', 경고가 있으면 뒤에 '경고 N'", () => {
    expect(setCheckText({ status: "DEPRECATED", rejectCount: 3, warnCount: 1 })).toBe("-");
    expect(setCheckText({ status: "INUSE", rejectCount: 0, warnCount: 0 })).toBe("통과");
    expect(setCheckText({ status: "INUSE", rejectCount: 2, warnCount: 0 })).toBe("거부 2");
    expect(setCheckText({ status: "INUSE", rejectCount: 0, warnCount: 1 })).toBe("통과 · 경고 1");
    expect(setCheckText({ status: "INUSE", rejectCount: 1, warnCount: 2 })).toBe("거부 1 · 경고 2");
  });
});
