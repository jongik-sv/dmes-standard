/** @vitest-environment happy-dom */

// TSK-07-03 design.md §3.4 — 항목 관리 렌더 스모크(unit-mng-page.test.ts 패턴). 동적 열 머리(Q5), EXTERNAL 조회 전용(Q6),
// 충돌 문구 → 목록 재조회(F1).
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import DataItemMngPage from "../../../pages/dmd/dataItemMng/page";

const RBAC_STORE_KEY = "__dkOasisButtonRbacStore__";
const CONFLICT = "다른 사용자가 수정했습니다. 다시 불러오세요";

let container: HTMLDivElement;
let root: Root | null = null;
const originalFetch = globalThis.fetch;
let calls: { action: string; params: Record<string, unknown> }[] = [];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const ok = (result: unknown) => jsonResponse({ data: { result }, meta: { success: true } });

function header(id: string) {
  const external = id === "CUST";
  return {
    maruDataId: id,
    maruDataName: external ? "거래처" : "항구",
    status: "INUSE",
    sourceKind: external ? "EXTERNAL" : "MDM",
    sourceSystem: external ? "ERP" : null,
    lvlCnt: 1,
    attrLabels: [{ field: "attr01", label: external ? "사업자번호" : "국가" }],
    editable: !external,
    categories: [{ cateId: "BASE", cateName: "전체", defKind: "REGEX" }],
  };
}

const row = {
  code: "KRPUS",
  name: "부산",
  alterName: null,
  seq: 1,
  description: null,
  lvl1: "KR",
  attr01: "KR",
  validFrom: "2026-08-20 09:00:00",
  validTo: "9999-12-31 00:00:00",
  open: true,
  rowVersion: 0,
};

async function render() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(DmesUiProvider, null, createElement(DataItemMngPage)));
  });
  await flush();
}

async function flush() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

function button(text: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.trim() === text) as
    | HTMLButtonElement
    | undefined;
}

describe("DataItemMngPage", () => {
  beforeEach(() => {
    calls = [];
    // apiRequest 가 토큰을 localStorage 에서 읽는데 이 happy-dom 환경에는 localStorage 가 없다.
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    });
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const m = url.match(/\/oasis\/dataItemMng\/(\w+)/);
      if (m) {
        const params = (JSON.parse(String(init?.body ?? "{}")).params ?? {}) as Record<string, unknown>;
        calls.push({ action: m[1], params });
        if (m[1] === "view") {
          return params.maruDataId
            ? ok({ maruDataOptions: [], header: header(String(params.maruDataId)) })
            : ok({
                maruDataOptions: [
                  { maruDataId: "PORT", maruDataName: "항구", status: "INUSE", sourceKind: "MDM" },
                  { maruDataId: "CUST", maruDataName: "거래처", status: "INUSE", sourceKind: "EXTERNAL" },
                ],
              });
        }
        if (m[1] === "search") return ok({ list: [row], totalCount: 1, page: 0, size: 50 });
        if (m[1] === "delete" || m[1] === "save") {
          return jsonResponse({ data: {}, meta: { success: false, message: CONFLICT } });
        }
      }
      if (url.includes("/api/auth/me")) return jsonResponse({ user: { id: "tester" } });
      if (url.includes("/api/mcm/oasis/secUser/myButtonEndpoints")) {
        return jsonResponse({
          grids: { buttons: { rows: [{ objId: "*", action: "*", endpoint: "*", httpMethod: "*" }] } },
        });
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
    vi.unstubAllGlobals();
    delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
  });

  it("첫 마루 데이터를 골라 동적 열 머리를 라벨로 보인다(Q5)", async () => {
    await render();
    expect(calls.map((c) => c.action)).toEqual(["view", "view", "search"]);
    expect(container.textContent).toContain("항목 관리");
    const headers = Array.from(container.querySelectorAll(".ag-header-cell-text")).map((h) => h.textContent);
    expect(headers).toContain("국가");
    expect(headers).toContain("1차");
    expect(headers).not.toContain("attr01");
    expect(button("항목 추가")?.disabled).toBe(false);
  });

  it("EXTERNAL 마루 데이터는 「항목 추가」가 비활성이고 행에 닫기가 없다(Q6)", async () => {
    await render();
    const select = container.querySelector('[data-testid="item-search-maru"]') as HTMLSelectElement;
    await act(async () => {
      select.value = "CUST";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await flush();
    expect(calls.filter((c) => c.action === "view").at(-1)?.params.maruDataId).toBe("CUST");
    expect(button("항목 추가")?.disabled).toBe(true);
    expect(container.querySelector('[data-testid="item-readonly"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="item-close-KRPUS"]')).toBeNull();
    expect(container.querySelector('[data-testid="item-history-KRPUS"]')).not.toBeNull();
  });

  it("충돌 문구를 받으면 안내를 보이고 목록을 다시 부른다(F1)", async () => {
    await render();
    const close = container.querySelector('[data-testid="item-close-KRPUS"]') as HTMLButtonElement;
    expect(close).not.toBeNull();
    const searchesBefore = calls.filter((c) => c.action === "search").length;
    await act(async () => {
      close.click();
    });
    await flush();
    expect(calls.some((c) => c.action === "delete")).toBe(true);
    expect(document.body.textContent).toContain("다른 사용자가 수정했습니다");
    expect(calls.filter((c) => c.action === "search").length).toBe(searchesBefore + 1);
  });
});
