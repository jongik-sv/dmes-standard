/** @vitest-environment happy-dom */

// columnMng 상세 폼 분리(Screen-Performance-Guide R12, F4) — 입력 state 가 ColumnDetailForm 안으로 옮겨진 뒤에도
// 저장 본문·행 전환 초기화·[상세에 적용] 이 그대로 동작하고, 입력 한 글자마다 화면 루트가 다시 그려지지 않는지 본다.
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

const mocks = vi.hoisted(() => ({
  grids: {} as Record<string, Record<string, unknown>>,
  layoutRenders: 0,
}));

// 그리드는 그리지 않고 rowKey 별로 props 만 잡는다(목록 columnId · 토큰 seq · 시스템 __rowId).
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

import ColumnMngPage from "../../../pages/dma/columnMng/page";

import { RBAC_STORE_KEY, findButton, flush, installDomStorage, jsonResponse, typeInto } from "../../dme/helpers/render";

let container: HTMLDivElement;
let root: Root | null = null;
const originalFetch = globalThis.fetch;
let saveBodies: string[] = [];

const ok = (result: unknown) => ({ meta: { success: true }, data: { result } });

const COLUMNS: Record<number, Record<string, unknown>> = {
  7: { columnId: 7, columnName: "강종", physName: "STL_GRD", labelLong: "강종", domainId: null, required: false, defaultValue: "" },
  8: { columnId: 8, columnName: "코일두께", physName: "COIL_THK", labelLong: "코일 두께", domainId: null, required: true, defaultValue: "0" },
};

const COMPARE = {
  direction: "FORWARD",
  input: "강판폭",
  tokens: [
    { seq: 1, surface: "강판폭", status: "MATCHED", termId: 3, termName: "강판폭", senseNo: 1, engAbbr: "STL_WDT", abbr: "STL_WDT", candidates: [] },
  ],
  logicalName: "강판폭",
  physName: "STL_WDT",
  placeholder: false,
  labels: { labelLong: "강판 폭", labelMid: "강판폭", labelShort: "폭" },
  domains: [],
  recommendedDomainId: null,
  duplicates: [],
};

function el<T extends HTMLElement = HTMLInputElement>(testId: string): T {
  const found = container.querySelector(`[data-testid="${testId}"]`);
  expect(found, testId).toBeTruthy();
  const input = found!.matches("input, textarea, select") ? found : found!.querySelector("input, textarea, select");
  return (input ?? found) as T;
}

/** 상세 표에서 머리글이 `label` 인 칸의 입력(data-testid 가 없는 칸). */
function detailInput(label: string): HTMLInputElement {
  const th = Array.from(container.querySelectorAll("th")).find((x) => x.textContent?.trim() === label);
  const td = th?.nextElementSibling;
  const input = td?.querySelector("input");
  expect(input, `입력 ${label}`).toBeTruthy();
  return input as HTMLInputElement;
}

async function render() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(DmesUiProvider, null, createElement(ColumnMngPage)));
  });
  await flush();
  await flush();
}

async function openRow(columnId: number) {
  await act(async () => {
    (mocks.grids.columnId!.onRowClick as (row: Record<string, unknown>) => void)({ columnId });
  });
  await flush();
  await flush();
}

/** 한 글자씩 친다(사람 입력처럼 매 글자 onChange). */
async function typeChars(input: HTMLInputElement, text: string) {
  for (let i = 1; i <= text.length; i += 1) {
    await typeInto(input, text.slice(0, i));
  }
}

async function pressHeader(label: string) {
  await act(async () => findButton(container.querySelector(".page-layout__header-buttons")!, label).click());
  await flush();
  await flush();
}

describe("ColumnMngPage 상세 폼 분리(R12)", () => {
  beforeEach(() => {
    installDomStorage();
    mocks.grids = {};
    mocks.layoutRenders = 0;
    saveBodies = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const m = url.match(/\/oasis\/columnMng\/(\w+)/);
      if (m?.[1] === "search") return jsonResponse(ok({ list: Object.values(COLUMNS), systems: [] }));
      if (m?.[1] === "view") {
        const body = JSON.parse(String(init?.body ?? "{}"));
        const id = Number(body?.params?.columnId ?? body?.columnId ?? JSON.stringify(body).match(/"columnId":(\d+)/)?.[1]);
        return jsonResponse(ok({ column: COLUMNS[id], systems: id === 7 ? [{ systemCode: "ERP", physName: "ERP_STL_GRD" }] : [], terms: [] }));
      }
      if (m?.[1] === "compare") return jsonResponse(ok(COMPARE));
      if (m?.[1] === "save") {
        saveBodies.push(String(init?.body ?? ""));
        return jsonResponse(ok({ columnId: 7 }));
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

  it("상세 칸을 입력해도 화면 루트는 다시 그려지지 않는다", async () => {
    await render();
    await openRow(7);
    expect(el("form-label-long").value).toBe("강종");

    const before = mocks.layoutRenders;
    await typeChars(el("form-label-long"), "ABCDE");
    expect(el("form-label-long").value).toBe("ABCDE");
    expect(el("form-label-preview").textContent).toContain("ABCDE");
    expect(mocks.layoutRenders).toBe(before);
  });

  it("입력한 값이 저장 요청 본문에 실린다", async () => {
    await render();
    await openRow(7);
    await typeInto(el("form-label-long"), "강종 긴 이름");
    await typeInto(el("form-phys-name"), "stl_grd_x");
    expect(el("form-phys-name").value).toBe("STL_GRD_X");

    await pressHeader("저장");
    expect(saveBodies).toHaveLength(1);
    expect(saveBodies[0]).toContain("강종 긴 이름");
    expect(saveBodies[0]).toContain("STL_GRD_X");
  });

  it("다른 행을 열면 고친 입력은 버리고 그 행 값으로 채운다", async () => {
    await render();
    await openRow(7);
    await typeInto(el("form-label-long"), "고친 값");
    await openRow(8);
    expect(el("form-column-name").value).toBe("코일두께");
    expect(el("form-label-long").value).toBe("코일 두께");
    expect(detailInput("기본값").value).toBe("0");
  });

  it("[상세에 적용]은 자동 생성 칸만 바꾸고 다른 칸 입력은 지킨다", async () => {
    await render();
    await openRow(7);
    await typeInto(detailInput("기본값"), "X1");
    await typeInto(el("gen-input"), "강판폭");
    await act(async () => el<HTMLButtonElement>("gen-decompose").click());
    await flush();
    await flush();
    await act(async () => el<HTMLButtonElement>("gen-apply").click());
    await flush();

    expect(el("form-column-name").value).toBe("강판폭");
    expect(el("form-phys-name").value).toBe("STL_WDT");
    expect(el("form-label-long").value).toBe("강판 폭");
    expect(detailInput("기본값").value).toBe("X1");
  });

  it("저장 본문에 시스템별 실제 필드명을 싣고, 저장 뒤 상세를 다시 읽는다", async () => {
    await render();
    await openRow(7);
    expect((mocks.grids.__rowId!.data as unknown[]).length).toBe(1);
    const views = () => (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(([u]) => /columnMng\/view/.test(String(u))).length;
    const before = views();
    await pressHeader("저장");
    expect(saveBodies[0]).toContain("ERP_STL_GRD");
    expect(views()).toBe(before + 1);
  });

  it("[신규] 는 상세와 시스템 그리드를 비운다", async () => {
    await render();
    await openRow(7);
    await typeInto(el("form-label-long"), "고친 값");
    await pressHeader("신규");
    expect(el("form-column-name").value).toBe("");
    expect(el("form-label-long").value).toBe("");
    expect((mocks.grids.__rowId!.data as unknown[]).length).toBe(0);
  });
});
