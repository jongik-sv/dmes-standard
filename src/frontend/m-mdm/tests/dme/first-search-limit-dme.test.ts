/** @vitest-environment happy-dom */

// 첫 조회 상한(화면 성능 가이드 R1) — ruleConfirm·ruleSetConfirm 은 진입 자동 조회와 [조회] 가 limit 을 보내고, 잘린 응답이면
// 「전체 N건 중 M건」 안내와 [전체 보기] 를 보인다. [전체 보기] 는 limit 없이 다시 받고 안내를 지운다. 다시 [조회] 하면 상한 모드로 돌아간다.
import { act, createElement, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import RuleConfirmPage from "../../pages/dme/ruleConfirm/page";
import RuleSetConfirmPage from "../../pages/dme/ruleSetConfirm/page";
import { FIRST_SEARCH_LIMIT } from "../../src/oasis-screen";
import { RBAC_STORE_KEY, flush, installDomStorage, jsonResponse } from "./helpers/render";

/** 상단 버튼 줄의 [조회] 단추 — 확정 화면은 조회 영역(SearchArea) + 상단 조회 단추 구조다. */
const searchButton = () =>
  Array.from(document.querySelectorAll(".page-layout__header-buttons button")).find((b) => b.textContent === "조회") as HTMLElement;

let container: HTMLDivElement;
let root: Root | null = null;
const originalFetch = globalThis.fetch;
/** 목록 조회(search) 요청의 params. */
let searchParams: Record<string, unknown>[] = [];

const ok = (result: unknown) => ({ meta: { success: true }, data: { result } });

function stubFetch(service: "ruleConfirm" | "ruleSetConfirm") {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes(`/oasis/${service}/search`)) {
      const params = (JSON.parse(String(init?.body ?? "{}")).params ?? {}) as Record<string, unknown>;
      searchParams.push(params);
      const limited = typeof params.limit === "number";
      const rows = service === "ruleConfirm"
        ? [{ maruRuleId: "A_JDG", maruRuleName: "가", ruleKind: "DECISION", ver: "2.000", ownerId: "kim", ruleStatus: "INUSE" },
          { maruRuleId: "B_JDG", maruRuleName: "나", ruleKind: "DECISION", ver: "2.000", ownerId: "kim", ruleStatus: "INUSE" }]
        : [{ setId: "S_A", setName: "가", ver: "2.000", verKind: "MAJOR", ownerId: "kim", setStatus: "INUSE" },
          { setId: "S_B", setName: "나", ver: "2.000", verKind: "MAJOR", ownerId: "kim", setStatus: "INUSE" }];
      return jsonResponse(ok({ rows: limited ? rows.slice(0, 1) : rows, ...(limited ? { totalCount: 2, truncated: true } : {}) }));
    }
    if (url.includes("/api/auth/me")) return jsonResponse({ user: { id: "tester" } });
    if (url.includes("/api/mcm/oasis/secUser/myButtonEndpoints"))
      return jsonResponse({ grids: { buttons: { rows: [{ objId: "*", action: "*", endpoint: "*", httpMethod: "*" }] } } });
    return jsonResponse({}, 404);
  }) as typeof fetch;
}

async function render(page: ComponentType<Record<string, unknown>>) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(DmesUiProvider, null,
      createElement(page, { tabId: "t1", snapshot: null, onSnapshotChange: () => {} })));
  });
  await flush();
  await flush();
}

async function click(el: HTMLElement) {
  await act(async () => el.click());
  await flush();
  await flush();
}

const byTestId = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`);

describe.each([
  { name: "ruleConfirm", page: RuleConfirmPage, prefix: "rc", testId: "rc-list-limit" },
  { name: "ruleSetConfirm", page: RuleSetConfirmPage, prefix: "rsc", testId: "rsc-list-limit" },
] as const)("$name 첫 조회 상한", ({ name, page, prefix, testId }) => {
  beforeEach(() => {
    installDomStorage();
    searchParams = [];
    stubFetch(name);
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

  it("진입 자동 조회는 limit 을 보내고, 잘리면 안내·[전체 보기] → 누르면 limit 없이 받고 안내가 사라진다", async () => {
    await render(page as ComponentType<Record<string, unknown>>);
    expect(searchParams).toHaveLength(1);
    expect(searchParams[0].limit).toBe(FIRST_SEARCH_LIMIT);
    expect(byTestId(testId)?.textContent).toContain("전체 2건 중 1건을 표시합니다.");

    await click(byTestId(`${testId}-show-all`)!);
    expect(searchParams).toHaveLength(2);
    expect(searchParams[1]).not.toHaveProperty("limit");
    expect(byTestId(testId)).toBeNull();

    await click(searchButton());
    expect(searchParams[2].limit).toBe(FIRST_SEARCH_LIMIT);
    expect(byTestId(testId)).not.toBeNull();
  });
});
