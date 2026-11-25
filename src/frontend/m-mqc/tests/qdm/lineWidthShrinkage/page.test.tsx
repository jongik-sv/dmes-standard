/** @vitest-environment happy-dom */
// 폭수축량관리 화면 렌더 시험 — 공정 묶음 5개(catalog 가 비면 기본 묶음)와 「공정 흐름」 탭(앞 공정을 나간 폭으로 다음 공정 판정).
// 서버·사용자 확인·버튼 권한은 fetch 대역이고 catalog 는 대역 모듈이다(lineWidthShrinkage 화면 목록은 없다).
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import { LineWidthShrinkagePage } from "@/qdm/lineWidthShrinkage/LineWidthShrinkagePage";

import { CGL, HISTORY, PLTCM } from "../../common/rule/fixtures";

vi.mock("@/common/catalog", async () => {
  const f = await import("../../common/rule/fixtures");
  return f.CATALOG;
});

const MATCHED = {
  ruleId: "C10B1074",
  ver: "1",
  evalTs: "2026-11-25 10:00:00",
  status: "MATCHED",
  hits: [{ rowId: 10, seq: 1 }],
  results: { WID_SHRINK_QTY: "2" },
  defaultApplied: false,
  trace: [
    { rowId: 10, seq: 1, evaluated: true, hit: true, firstFalseVar: null },
  ],
  message: null,
};
const NO_MATCH = {
  ...MATCHED,
  status: "NO_MATCH",
  hits: [],
  results: {},
  trace: [
    { rowId: 10, seq: 1, evaluated: true, hit: false, firstFalseVar: "THK" },
    { rowId: 11, seq: 2, evaluated: true, hit: false, firstFalseVar: "THK" },
  ],
  message: "조건에 맞는 행이 없습니다",
};
const CODES = {
  codes: [
    {
      codeId: "QC_ITEM_NAME",
      ver: "1",
      items: [
        {
          code: "L",
          name: "G/L",
          alterName: null,
          seq: 1,
          lvl: [],
          attrs: ["GALVALUME"],
        },
      ],
    },
  ],
};

type Call = { action: string; params: Record<string, unknown> };
let calls: Call[] = [];
/** 설정하면 search 응답을 이 약속이 풀릴 때까지 붙잡는다(늦은 응답 시험). */
let searchGates: Promise<void>[] = [];
let searchResults: unknown[] = [];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const ok = (result: unknown) =>
  json({ meta: { success: true }, data: { result } });
const callsOf = (action: string) => calls.filter((c) => c.action === action);

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  setItem(key: string, value: string) {
    this.map.set(key, String(value));
  }
}
const STORES = ["__dkOasisButtonRbacStore__", "__dkOasisCurrentUserStore__"];

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  for (const name of ["localStorage", "sessionStorage"] as const) {
    Object.defineProperty(globalThis, name, {
      value: new MemoryStorage(),
      configurable: true,
      writable: true,
    });
  }
  for (const k of STORES) delete (globalThis as Record<string, unknown>)[k];
  calls = [];
  searchGates = [];
  searchResults = [];
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const m = url.match(/\/api\/mqc\/oasis\/qcdRule\/(\w+)/);
      if (m) {
        const params = (JSON.parse(String(init?.body ?? "{}")).params ??
          {}) as Record<string, unknown>;
        calls.push({ action: m[1], params });
        if (m[1] === "search") {
          const gate = searchGates.shift();
          const result = searchResults.shift() ?? { rules: [PLTCM, CGL] };
          if (gate) await gate;
          return ok(result);
        }
        if (m[1] === "judge")
          return ok(
            JSON.parse(String(params.inputJson)).THK === "0.5"
              ? NO_MATCH
              : MATCHED,
          );
        if (m[1] === "history")
          return ok({ ruleId: params.ruleId, versions: HISTORY });
        if (m[1] === "codes") return ok(CODES);
      }
      if (url.includes("/api/auth/me")) return json({ user: { id: "tester" } });
      if (url.includes("/secUser/myButtonEndpoints"))
        return json({
          grids: {
            buttons: {
              rows: [
                { objId: "*", action: "*", endpoint: "*", httpMethod: "*" },
              ],
            },
          },
        });
      return json({}, 404);
    }),
  );
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  for (const k of STORES) delete (globalThis as Record<string, unknown>)[k];
});

const flush = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
async function settle(rounds = 6) {
  for (let i = 0; i < rounds; i++) await flush();
}
async function mount() {
  await act(async () => {
    root.render(
      createElement(
        DmesUiProvider,
        null,
        createElement(LineWidthShrinkagePage, {
          tabId: "t",
          snapshot: null,
          onSnapshotChange: () => {},
        }),
      ),
    );
  });
  await settle();
}
const byTestId = <T extends HTMLElement = HTMLElement>(id: string) =>
  host.querySelector<T>(`[data-testid="${id}"]`);
const text = (el: Element | null | undefined) =>
  (el?.textContent ?? "").replace(/\s+/g, " ").trim();
async function click(el: Element | null | undefined) {
  expect(el).toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
  await settle();
}
const tabs = () => [...host.querySelectorAll<HTMLElement>('[role="tab"]')];
const tab = (label: string) => tabs().find((b) => text(b) === label);
const headerButton = (label: string) =>
  [
    ...host.querySelectorAll<HTMLButtonElement>(
      ".page-layout__header-buttons button",
    ),
  ].find((b) => text(b) === label);
function groupOption(value: string) {
  const input = byTestId(
    "lineWidthShrinkage-group",
  )?.querySelector<HTMLInputElement>(`input[value="${value}"]`);
  return {
    input,
    label: text(input ? host.querySelector(`label[for="${input.id}"]`) : null),
  };
}
async function typeInto(el: HTMLInputElement | null, value: string) {
  expect(el).toBeTruthy();
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;
  await act(async () => {
    setter.call(el, value);
    el!.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const listCount = () =>
  text(host.querySelector('[data-testid="grid-panel-count"]'));
const gridRow = (scope: Element | null, colId: string, value: string) =>
  [
    ...(scope?.querySelectorAll(".ag-center-cols-container .ag-row") ?? []),
  ].find((r) => text(r.querySelector(`[col-id="${colId}"]`)) === value);

describe("LineWidthShrinkagePage", () => {
  it("catalog 에 화면 목록이 없으면 공정 5개 기본 묶음으로 조회한다", async () => {
    await mount();
    expect(callsOf("search").map((c) => c.params)).toEqual([
      { ruleIds: "C10B1074,C10B1075,C10B1076,C10B1077,C10B1078" },
    ]);
    expect(tabs().map((t) => text(t))).toEqual([
      "룰 목록",
      "공정 흐름",
      "간편판정",
      "변경 이력",
      "코드 범례",
    ]);
    expect(groupOption("JZ").label).toBe("정전 0");
  });

  it("공정 흐름 — 5개 공정을 차례로 판정하고 합산 폭수축량·최종 폭을 보인다", async () => {
    await mount();
    await click(tab("공정 흐름"));
    await typeInto(
      byTestId<HTMLInputElement>("lineWidthShrinkage-flow-THK"),
      "0.23",
    );
    await click(byTestId("lineWidthShrinkage-flow-run"));
    const judged = callsOf("judge").map((c) => [
      c.params.ruleId,
      JSON.parse(String(c.params.inputJson)).WID,
    ]);
    // PLTCM 은 원자재 폭 1000, CGL 은 PLTCM 을 나간 폭 998(수축 2). 정의가 없는 공정은 폭 변수를 모른다.
    expect(judged).toEqual([
      ["C10B1074", "1000"],
      ["C10B1075", "998"],
      ["C10B1076", undefined],
      ["C10B1077", undefined],
      ["C10B1078", undefined],
    ]);
    expect(text(byTestId("lineWidthShrinkage-flow-total"))).toContain("+4");
    expect(text(byTestId("lineWidthShrinkage-flow-total"))).toContain(
      "최종 폭 996 mm",
    );
    expect(text(byTestId("lineWidthShrinkage-flow-step-PLTCM"))).toContain(
      "1000 → 998 mm",
    );
    expect(text(byTestId("lineWidthShrinkage-flow-result"))).toContain(
      "적중 5 / 5 공정",
    );
  });

  it("원자재 폭이 숫자가 아니면 판정하지 않는다", async () => {
    await mount();
    await click(tab("공정 흐름"));
    await typeInto(
      byTestId<HTMLInputElement>("lineWidthShrinkage-flow-start"),
      "넓음",
    );
    await click(byTestId("lineWidthShrinkage-flow-run"));
    expect(text(host)).toContain("원자재 폭 값이 숫자가 아닙니다: 넓음");
    expect(callsOf("judge")).toHaveLength(0);
  });
});
