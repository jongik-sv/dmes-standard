/** @vitest-environment happy-dom */

// unitMng 상세 폼 분리(Screen-Performance-Guide R12) — 입력 state 가 UnitDetailForm 안으로 옮겨진 뒤에도 저장 본문·행 전환
// 초기화·기존 차원 선택(D-002)·새 차원 생성이 그대로이고, 입력 한 글자마다 화면 루트가 다시 그려지지 않는지 본다.
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

const mocks = vi.hoisted(() => ({
  grids: {} as Record<string, Record<string, unknown>>,
  layoutRenders: 0,
  combos: [] as Record<string, unknown>[],
}));

// 그리드는 그리지 않고 종류별로 props 만 잡는다. 목록과 환산 계산기 결과 표가 같은 rowKey(unitCode) 를 쓰므로
// 열 내용(목록에만 dimensionLabel 이 있다)으로 나눠 저장한다.
vi.mock("@dk-oasis/shared/grid", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dk-oasis/shared/grid")>();
  return {
    ...actual,
    AgDataGrid: (props: Record<string, unknown>) => {
      const cols = props.columns as { key?: string }[] | undefined;
      const kind = cols?.some((c) => c.key === "dimensionLabel") ? "unitCode" : "unitCode-calc";
      mocks.grids[kind] = props;
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

// 차원 ComboBox 는 happy-dom 에서 드롭다운을 열 수 없어 props 만 잡는다(기존 차원 선택·새 차원 생성 시험용).
// 환산 계산기도 ComboBox 를 쓰므로 렌더마다 모아 두고 placeholder 로 상세 폼 칸을 찾는다.
vi.mock("@dk-oasis/shared/form", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dk-oasis/shared/form")>();
  return {
    ...actual,
    ComboBox: (props: Record<string, unknown>) => {
      mocks.combos.push(props);
      return null;
    },
  };
});

import UnitMngPage from "../../../pages/dma/unitMng/page";

import { RBAC_STORE_KEY, findButton, flush, installDomStorage, jsonResponse, typeInto } from "../../dme/helpers/render";

let container: HTMLDivElement;
let root: Root | null = null;
const originalFetch = globalThis.fetch;
let saveBodies: string[] = [];

const ok = (result: unknown) => ({ data: { result }, meta: { success: true } });

const UNITS = [
  { unitCode: "G", dimension: "MASS", baseUnit: "KG", factor: 0.001 },
  { unitCode: "KG", dimension: "MASS", baseUnit: "KG", factor: 1 },
  { unitCode: "M", dimension: "LENGTH", baseUnit: "M", factor: 1 },
];
const DIMENSIONS = [
  { dimension: "MASS", baseUnit: "KG" },
  { dimension: "LENGTH", baseUnit: "M" },
];

/** 상세 표에서 머리글이 `label` 로 시작하는 줄의 입력 칸. */
function detailInput(label: string): HTMLInputElement {
  const th = Array.from(container.querySelectorAll("th")).find((x) => x.textContent?.trim().startsWith(label));
  const input = th?.closest("tr")?.querySelector("input");
  expect(input, `입력 ${label}`).toBeTruthy();
  return input as HTMLInputElement;
}

/** 상세 폼의 차원 ComboBox — 가장 최근 렌더의 props. */
function dimensionCombo(): { onChange: (v: string) => void; onCreateNew: (v: string) => void } {
  const found = [...mocks.combos].reverse().find((p) => String(p.placeholder ?? "").includes("차원 선택"));
  expect(found, "차원 ComboBox").toBeTruthy();
  return found as { onChange: (v: string) => void; onCreateNew: (v: string) => void };
}

async function render() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(DmesUiProvider, null, createElement(UnitMngPage)));
  });
  await flush();
  await flush();
}

async function pressHeader(label: string) {
  await act(async () => findButton(container.querySelector(".page-layout__header-buttons")!, label).click());
  await flush();
  await flush();
}

async function openRow(unitCode: string) {
  const row = UNITS.find((u) => u.unitCode === unitCode)!;
  await act(async () => {
    (mocks.grids.unitCode!.onRowClick as (row: Record<string, unknown>) => void)({ ...row });
  });
  await flush();
}

/** 한 글자씩 친다(사람 입력처럼 매 글자 onChange). */
async function typeChars(input: HTMLInputElement, text: string) {
  for (let i = 1; i <= text.length; i += 1) {
    await typeInto(input, text.slice(0, i));
  }
}

describe("UnitMngPage 상세 폼 분리(R12)", () => {
  beforeEach(() => {
    installDomStorage();
    mocks.grids = {};
    mocks.layoutRenders = 0;
    mocks.combos = [];
    saveBodies = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/oasis/unitMng/search"))
        return jsonResponse(ok({ list: UNITS, dimensionOptions: DIMENSIONS, unitOptions: UNITS.map((u) => ({ unitCode: u.unitCode, dimension: u.dimension })) }));
      if (url.includes("/oasis/unitMng/save")) {
        saveBodies.push(String(init?.body ?? ""));
        return jsonResponse(ok(UNITS[0]));
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
    await pressHeader("조회");
    await openRow("G");
    expect(detailInput("환산 계수").value).toBe("0.001");

    const before = mocks.layoutRenders;
    await typeChars(detailInput("환산 계수"), "0.002");
    expect(detailInput("환산 계수").value).toBe("0.002");
    expect(mocks.layoutRenders).toBe(before);
  });

  it("입력한 값이 저장 요청 본문에 실린다", async () => {
    await render();
    await pressHeader("조회");
    await openRow("G");
    await typeInto(detailInput("환산 계수"), "0.5");
    await pressHeader("저장");
    expect(saveBodies).toHaveLength(1);
    expect(saveBodies[0]).toContain('"G"');
    expect(saveBodies[0]).toContain("MASS");
    expect(saveBodies[0]).toContain("0.5");
  });

  it("다른 행을 열면 고친 입력은 버리고 그 행 값으로 채운다", async () => {
    await render();
    await pressHeader("조회");
    await openRow("G");
    await typeInto(detailInput("환산 계수"), "9");
    await openRow("M");
    expect(detailInput("단위 코드").value).toBe("M");
    expect(detailInput("환산 계수").value).toBe("1");
  });

  it("기존 차원을 고르면 기준 단위를 그 차원의 확립 단위로 채운다", async () => {
    await render();
    await pressHeader("조회");
    await pressHeader("단위 등록");
    await typeInto(detailInput("단위 코드"), "NEWU");
    await act(async () => {
      dimensionCombo().onChange("LENGTH");
    });
    await flush();
    expect(detailInput("기준 단위").value).toBe("M");
  });

  it("새 차원을 만들면 기준 단위는 자기 자신, 계수는 1 을 제안한다", async () => {
    await render();
    await pressHeader("조회");
    await pressHeader("단위 등록");
    await typeInto(detailInput("단위 코드"), "NEWW");
    await act(async () => {
      dimensionCombo().onCreateNew("NEWDIM");
    });
    await flush();
    expect(detailInput("기준 단위").value).toBe("NEWW");
    expect(detailInput("환산 계수").value).toBe("1");
  });

  it("[조회] 를 다시 누르면 상세를 비우고 [저장] 을 막는다", async () => {
    await render();
    await pressHeader("조회");
    await openRow("G");
    expect(findButton(container.querySelector(".page-layout__header-buttons")!, "저장").disabled).toBe(false);
    await pressHeader("조회");
    expect(detailInput("단위 코드").value).toBe("");
    expect(detailInput("단위 코드").disabled).toBe(true);
    expect(findButton(container.querySelector(".page-layout__header-buttons")!, "저장").disabled).toBe(true);
  });
});
