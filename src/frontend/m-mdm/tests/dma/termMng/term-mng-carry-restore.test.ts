/** @vitest-environment happy-dom */

// 새 창 분리(popout) 복원 — 이어받은 선택 행(selectedTermId)의 상세 폼을 목록 값으로 되살린다.
// 행이 함께 왔으면 `loadForm` 을 직접 한 번 부르고, 행 없이 복원돼 재조회하면 재조회 결과에서 그 행을 찾아 폼을 채운다(선택을 비우지 않는다).
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import { CarryStateProvider, createCarryRegistry, type CarryRestore } from "@dk-oasis/shared/portal-shell";

import TermMngPage from "../../../pages/dma/termMng/page";
import { RBAC_STORE_KEY, flush, installDomStorage, jsonResponse } from "../../dme/helpers/render";

let container: HTMLDivElement;
let root: Root | null = null;
const originalFetch = globalThis.fetch;
let searchCount = 0;

const TERMS = [
  { termId: 7, termName: "코일", senseNo: 1, definition: "강판 말이", context: null, engName: "Coil", engAbbr: "COIL", synonyms: [], aliases: [], systems: [], stdBasis: null },
  { termId: 8, termName: "슬라브", senseNo: 1, definition: "압연 전 소재", context: null, engName: "Slab", engAbbr: "SLAB", synonyms: [], aliases: [], systems: [], stdBasis: null },
];

const LIGHT = {
  filters: { keyword: "", systems: "", context: "" },
  rowsTotal: null,
  showAll: false,
  selectedTermId: 8,
};

function detailInput(label: string): HTMLInputElement | null {
  const th = Array.from(container.querySelectorAll("th")).find((x) => x.textContent?.trim().startsWith(label));
  return (th?.closest("tr")?.querySelector("input") as HTMLInputElement | null | undefined) ?? null;
}

/** restore 가 null 이면 포털 탭(등록소는 있으나 복원값이 없다). */
async function render(restore: CarryRestore | null) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const page = createElement(DmesUiProvider, null, createElement(TermMngPage));
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
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/oasis/termMng/search")) {
      searchCount += 1;
      return jsonResponse({ data: { result: { list: TERMS } }, meta: { success: true } });
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

describe("TermMngPage 새 창 분리 복원 — 선택 행", () => {
  it("행과 함께 복원되면 재조회 없이 이어받은 선택 행의 폼을 목록 값으로 채운다", async () => {
    await render({ light: LIGHT, bulky: { rows: TERMS }, hadBulky: true });
    expect(searchCount).toBe(0);
    expect(detailInput("표기")?.value).toBe("슬라브");
    expect(detailInput("영문명")?.value).toBe("Slab");
  });

  it("행 없이 복원돼 재조회하면 선택을 비우지 않고 재조회 결과의 그 행으로 폼을 채운다", async () => {
    await render({ light: LIGHT, bulky: null, hadBulky: true });
    expect(searchCount).toBe(1);
    expect(detailInput("표기")?.value).toBe("슬라브");
  });

  it("포털 탭(복원값 없음)에서는 마운트 때 조회도 폼 채우기도 하지 않는다", async () => {
    await render(null);
    expect(searchCount).toBe(0);
    expect(detailInput("표기")?.value ?? "").toBe(""); // 폼이 채워지지 않는다(빈 칸·꺼진 상태)
  });
});
