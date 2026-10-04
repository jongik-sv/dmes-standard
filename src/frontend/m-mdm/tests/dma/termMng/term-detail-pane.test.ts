/** @vitest-environment happy-dom */

// termMng 상세 폼 분리(Screen-Performance-Guide R12, F4) — 입력 state 가 TermDetailPane 안으로 옮겨진 뒤에도 저장 본문·행 전환
// 초기화가 그대로이고, 입력 한 글자마다 화면 루트와 추천 그리드 열 정의가 바뀌지 않는지 본다.
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

const mocks = vi.hoisted(() => ({
  grids: {} as Record<string, Record<string, unknown>>,
  layoutRenders: 0,
}));

// 그리드는 그리지 않고 rowKey 별로 props 만 잡는다(목록 termId · 추천 recoKey).
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

import TermMngPage from "../../../pages/dma/termMng/page";

import { RBAC_STORE_KEY, findButton, flush, installDomStorage, jsonResponse, typeInto } from "../../dme/helpers/render";

let container: HTMLDivElement;
let root: Root | null = null;
const originalFetch = globalThis.fetch;
let saveBodies: string[] = [];

const TERMS = [
  { termId: 7, termName: "코일", senseNo: 1, definition: "강판 말이", context: null, engName: "Coil", engAbbr: "COIL",
    synonyms: [], aliases: [], systems: [], stdBasis: null },
  { termId: 8, termName: "강종", senseNo: 1, definition: "강의 종류", context: "제강", engName: "Steel Grade", engAbbr: "STL_GRD",
    synonyms: [], aliases: [], systems: ["MES"], stdBasis: null },
];

/** 상세 표에서 머리글이 `label` 로 시작하는 줄의 입력 칸. */
function detailInput(label: string): HTMLInputElement {
  const th = Array.from(container.querySelectorAll("th")).find((x) => x.textContent?.trim().startsWith(label));
  const input = th?.closest("tr")?.querySelector("input, textarea");
  expect(input, `입력 ${label}`).toBeTruthy();
  return input as HTMLInputElement;
}

async function render() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(DmesUiProvider, null, createElement(TermMngPage)));
  });
  await flush();
  await flush();
}

async function pressHeader(label: string) {
  await act(async () => findButton(container.querySelector(".page-layout__header-buttons")!, label).click());
  await flush();
  await flush();
}

async function openRow(termId: number) {
  await act(async () => {
    (mocks.grids.termId!.onRowClick as (row: Record<string, unknown>) => void)({ termId });
  });
  await flush();
}

describe("TermMngPage 상세 폼 분리(R12)", () => {
  beforeEach(() => {
    installDomStorage();
    mocks.grids = {};
    mocks.layoutRenders = 0;
    saveBodies = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/oasis/termMng/search")) return jsonResponse({ data: { result: { list: TERMS } }, meta: { success: true } });
      if (url.includes("/oasis/termMng/recommend"))
        return jsonResponse({ data: { result: { candidates: [], stage2Enabled: false } }, meta: { success: true } });
      if (url.includes("/oasis/termMng/save")) {
        saveBodies.push(String(init?.body ?? ""));
        return jsonResponse({ data: { result: { termId: 7, warnings: [] } }, meta: { success: true } });
      }
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
  });

  it("상세 칸을 입력해도 화면 루트도 추천 그리드 열 정의도 바뀌지 않는다", async () => {
    await render();
    await pressHeader("조회");
    await openRow(7);
    expect(detailInput("표기").value).toBe("코일");

    const before = mocks.layoutRenders;
    const recoColumns = mocks.grids.recoKey!.columns;
    const text = "제강";
    for (let i = 1; i <= text.length; i += 1) await typeInto(detailInput("맥락"), text.slice(0, i));
    expect(detailInput("맥락").value).toBe("제강");
    expect(mocks.layoutRenders).toBe(before);
    expect(mocks.grids.recoKey!.columns).toBe(recoColumns);
  });

  it("입력한 값이 저장 요청 본문에 실린다", async () => {
    await render();
    await pressHeader("조회");
    await openRow(7);
    await typeInto(detailInput("맥락"), "압연");
    await pressHeader("저장");
    expect(saveBodies).toHaveLength(1);
    expect(saveBodies[0]).toContain("압연");
    expect(saveBodies[0]).toContain("코일");
  });

  it("다른 행을 열면 고친 입력은 버리고 그 행 값으로 채운다", async () => {
    await render();
    await pressHeader("조회");
    await openRow(7);
    await typeInto(detailInput("맥락"), "고친 값");
    await openRow(8);
    expect(detailInput("표기").value).toBe("강종");
    expect(detailInput("맥락").value).toBe("제강");
  });

  it("[조회] 를 다시 누르면 상세를 비우고 [저장] 을 막는다", async () => {
    await render();
    await pressHeader("조회");
    await openRow(7);
    expect(findButton(container.querySelector(".page-layout__header-buttons")!, "저장").disabled).toBe(false);
    await pressHeader("조회");
    expect(detailInput("표기").value).toBe("");
    expect(detailInput("표기").disabled).toBe(true);
    expect(findButton(container.querySelector(".page-layout__header-buttons")!, "저장").disabled).toBe(true);
  });
});
