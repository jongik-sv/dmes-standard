/** @vitest-environment happy-dom */

// 새 창 분리(popout) 복원 — 이어받은 선택 행(selectedUnitCode)의 상세 폼을 목록 값으로 되살린다.
// 행이 함께 왔으면 재조회 없이 폼 적재 함수를 직접 한 번 부르고, 행 없이 복원돼 재조회하면 재조회 결과에서 그 행을 찾아 폼을 채운다(선택을 비우지 않는다).
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import { CarryStateProvider, createCarryRegistry, type CarryRestore } from "@dk-oasis/shared/portal-shell";

import UnitMngPage from "../../../pages/dma/unitMng/page";
import { RBAC_STORE_KEY, flush, installDomStorage, jsonResponse } from "../../dme/helpers/render";

let container: HTMLDivElement;
let root: Root | null = null;
const originalFetch = globalThis.fetch;
let searchCount = 0;

const UNITS = [
  { unitCode: "KG", dimension: "MASS", baseUnit: "KG", factor: 1 },
  { unitCode: "G", dimension: "MASS", baseUnit: "KG", factor: 0.001 },
];

const LIGHT = { filters: { unitCode: "", dimension: "" }, selectedUnitCode: "G" };

/** 상세 표에서 머리글이 `label` 로 시작하는 줄의 입력 칸. */
function detailInput(label: string): HTMLInputElement | null {
  const th = Array.from(container.querySelectorAll("th")).find((x) => x.textContent?.trim().startsWith(label));
  return (th?.closest("tr")?.querySelector("input") as HTMLInputElement | null | undefined) ?? null;
}

/** restore 가 null 이면 포털 탭(등록소는 있으나 복원값이 없다). */
async function render(restore: CarryRestore | null) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const page = createElement(DmesUiProvider, null, createElement(UnitMngPage));
  await act(async () => {
    root!.render(createElement(CarryStateProvider, { registry: createCarryRegistry(restore) }, page));
  });
  await flush();
  await flush();
  await flush();
}

beforeEach(() => {
  installDomStorage();
  searchCount = 0;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/oasis/unitMng/search")) {
      // 진입 때 콤보만 받는 호출(optionsOnly)은 목록 조회가 아니라 세지 않는다.
      const params = (JSON.parse(String(init?.body ?? "{}")).params ?? {}) as Record<string, unknown>;
      if (!params.optionsOnly) searchCount += 1;
      return jsonResponse({ data: { result: { list: UNITS, dimensionOptions: [], unitOptions: [] } }, meta: { success: true } });
    }
    if (url.includes("/api/auth/me")) return jsonResponse({ user: { id: "tester" } });
    if (url.includes("/api/mcm/oasis/secUser/myButtonEndpoints")) {
      return jsonResponse({ grids: { buttons: { rows: [{ objId: "*", action: "*", endpoint: "*", httpMethod: "*" }] } } });
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

describe("UnitMngPage 새 창 분리 복원 — 선택 행", () => {
  it("행과 함께 복원되면 재조회 없이 이어받은 선택 행의 폼을 목록 값으로 채운다", async () => {
    await render({ light: LIGHT, bulky: { rows: UNITS }, hadBulky: true });
    expect(searchCount).toBe(0);
    expect(detailInput("환산 계수")?.value).toBe("0.001");
  });

  it("행 없이 복원돼 재조회하면 선택을 비우지 않고 재조회 결과의 그 행으로 폼을 채운다", async () => {
    await render({ light: LIGHT, bulky: null, hadBulky: true });
    expect(searchCount).toBe(1);
    expect(detailInput("환산 계수")?.value).toBe("0.001");
  });

  it("포털 탭(복원값 없음)에서는 마운트 때 조회도 폼 채우기도 하지 않는다", async () => {
    await render(null);
    expect(searchCount).toBe(0);
    expect(detailInput("환산 계수")?.value ?? "").toBe("");
  });
});
