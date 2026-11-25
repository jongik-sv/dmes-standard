/** @vitest-environment happy-dom */
// 생산가부관리(qdf) 화면 3종 렌더 시험 — 진입 조회, 매트릭스·시트 칸 누름 → 판정, 수정 이력, 주문정합성 룰 카드·프리셋 시뮬레이션.
// 서버(qcdRule search·judge·history·codes)·사용자 확인·버튼 권한은 fetch 대역이다. catalog 는 실제 파일을 쓴다.
import { act, createElement, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import type { PageProps } from "@dk-oasis/shared/portal-shell-core";

import { OrderWeightErrorPage } from "@/qdf/orderWeightError/OrderWeightErrorPage";
import { ProductionFeasibilityPage } from "@/qdf/productionFeasibility/ProductionFeasibilityPage";
import { OrderConsistencyPage } from "@/qdf/orderConsistency/OrderConsistencyPage";

import {
  FEAS_CODES,
  FEAS_RULE,
  OC_CODES,
  OC_RULE,
  WEIGHT_LIMIT,
  WEIGHT_V1,
  WEIGHT_V2,
} from "./fixtures";

type Call = { action: string; params: Record<string, unknown> };
let calls: Call[] = [];
let judgeReply: (params: Record<string, unknown>) => unknown = () => ({});

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

const ALL_CODES = [WEIGHT_LIMIT, ...FEAS_CODES, ...OC_CODES];
const RULES = [WEIGHT_V2, FEAS_RULE, OC_RULE];

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  for (const name of ["localStorage", "sessionStorage"] as const)
    Object.defineProperty(globalThis, name, {
      value: new MemoryStorage(),
      configurable: true,
      writable: true,
    });
  for (const k of STORES) delete (globalThis as Record<string, unknown>)[k];
  calls = [];
  judgeReply = () => ({});
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
          const ids = String(params.ruleIds).split(",");
          return ok({ rules: RULES.filter((r) => ids.includes(r.ruleId)) });
        }
        if (m[1] === "judge") return ok(judgeReply(params));
        if (m[1] === "history")
          return ok({
            ruleId: params.ruleId,
            versions:
              params.ruleId === WEIGHT_V2.ruleId
                ? [
                    { ...WEIGHT_V1, applyTo: "2026-11-20 09:00:00" },
                    {
                      ...WEIGHT_V2,
                      applyFrom: "2026-11-20 09:00:00",
                      applyTo: null,
                    },
                  ]
                : [],
          });
        if (m[1] === "codes") {
          const ids = String(params.codeIds).split(",");
          return ok({ codes: ALL_CODES.filter((c) => ids.includes(c.codeId)) });
        }
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
async function settle(rounds = 8) {
  for (let i = 0; i < rounds; i++) await flush();
}
async function mount(Page: ComponentType<PageProps>) {
  await act(async () => {
    root.render(
      createElement(
        DmesUiProvider,
        null,
        createElement(Page, {
          tabId: "t",
          snapshot: null,
          onSnapshotChange: () => {},
        } as PageProps),
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
const tab = (label: string) => tabs().find((b) => text(b).startsWith(label));
async function choose(el: HTMLSelectElement | null, value: string) {
  expect(el).toBeTruthy();
  await act(async () => {
    el!.value = value;
    el!.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle();
}

describe("주문단중에러관리", () => {
  it("진입 조회 → 매트릭스(범위 내·수정값), 칸을 누르면 그 단중·분할로 판정한다", async () => {
    judgeReply = () => ({
      ruleId: "QD_ORDER_WEIGHT_ERROR",
      ver: "1.001",
      evalTs: "2026-11-25 10:00:00",
      status: "MATCHED",
      hits: [{ rowId: 4, seq: 4 }],
      results: { SPLIT_UNT_WGT: "4.05", IN_RANGE_YN: "Y" },
      defaultApplied: false,
      trace: [],
      message: null,
    });
    await mount(OrderWeightErrorPage);
    expect(callsOf("search").map((c) => c.params.ruleIds)).toEqual([
      "QD_ORDER_WEIGHT_ERROR",
    ]);
    expect(text(byTestId("orderWeightError-in-range-count"))).toBe(
      "범위 내 3셀",
    );
    expect(text(byTestId("orderWeightError-edited-count"))).toBe("수정값 1셀");
    expect(text(byTestId("orderWeightError-limit"))).toContain(
      "4.0 ~ 5.0 MT/개",
    );
    const cell = byTestId("orderWeightError-cell-24.0-6");
    expect(text(cell)).toBe("4.05");
    await click(cell);
    expect(
      callsOf("judge").map((c) => JSON.parse(String(c.params.inputJson))),
    ).toEqual([{ ORD_UNT_WGT: "24.0", SPLIT_CNT: "6" }]);
    const result = text(byTestId("orderWeightError-judge-result"));
    expect(result).toContain("4.05");
    expect(result).toContain("범위 내 — 생산 가능");
    expect(text(byTestId("orderWeightError-judge-feasible"))).toContain(
      "5분할, 6분할",
    );
  });

  it("수정 이력 — 1.000 → 1.001 칸 변경", async () => {
    await mount(OrderWeightErrorPage);
    await click(tab("수정 이력"));
    expect(callsOf("history").map((c) => c.params.ruleId)).toEqual([
      "QD_ORDER_WEIGHT_ERROR",
    ]);
    expect(text(host)).toContain("단중 24.0 × 6분할");
    expect(tab("수정 이력")?.textContent).toContain("(2)");
  });
});

describe("생산가부관리", () => {
  it("시트 탭·재질 그룹 칸 — 칸을 누르면 그룹·폭·두께로 판정한다", async () => {
    judgeReply = () => ({
      ruleId: "QD_FEAS_2CGL_GI",
      ver: "1.000",
      evalTs: "",
      status: "MATCHED",
      hits: [{ rowId: 5, seq: 5 }],
      results: { FEAS_STAT: "C" },
      defaultApplied: false,
      trace: [],
      message: null,
    });
    await mount(ProductionFeasibilityPage);
    expect(callsOf("search").map((c) => c.params.ruleIds)).toEqual([
      "QD_FEAS_2CGL_GI,QD_FEAS_2CGL_GL,QD_FEAS_3CGL,QD_FEAS_4CGL,QD_FEAS_5CGL",
    ]);
    expect(text(tabs()[0])).toBe("B.D 생산범위(2CGL GI)");
    expect(text(tabs().at(-1))).toBe("수정 이력");
    expect(text(byTestId("productionFeasibility-sheet-S1"))).toContain(
      "2CGL GI 생산가능 SIZE",
    );
    expect(text(byTestId("productionFeasibility-group-S1-G1"))).toContain(
      "※ 폭 수축량 불균일",
    );
    // 1230 × 1 칸(조건부 생산)
    await click(byTestId("productionFeasibility-cell-S1-G1-1-3"));
    expect(
      callsOf("judge").map((c) => [
        c.params.ruleId,
        JSON.parse(String(c.params.inputJson)),
      ]),
    ).toEqual([
      ["QD_FEAS_2CGL_GI", { MAT_GRP_CD: "S1-G1", WID: "1230", THK: "1" }],
    ]);
    const result = text(byTestId("productionFeasibility-lookup-result"));
    expect(result).toContain("조건부 생산");
    expect(result).toContain("적중 행 순번 5");
  });
});

describe("주문정합성관리", () => {
  it("룰 카드는 대상 항목별로 묶고 조건을 문장으로 보인다", async () => {
    await mount(OrderConsistencyPage);
    expect(callsOf("search").map((c) => c.params.ruleIds)).toEqual([
      "QD_ORDER_CHECK",
    ]);
    expect(text(tab("룰 목록"))).toBe("룰 목록 (7)");
    const card = text(byTestId("orderConsistency-rule-R-075"));
    expect(card).toContain("GI Spangle 선택 오류");
    expect(card).toContain("품명코드가 G(GI*)·K·V 중 하나이고");
    expect(card).toContain("주문Spangle구분이 6이면");
  });

  it("프리셋 ① → 조건 키 전부(빈칸 null)로 판정하고 발화 카드를 보인다", async () => {
    judgeReply = () => ({
      ruleId: "QD_ORDER_CHECK",
      ver: "1.000",
      evalTs: "",
      status: "MATCHED",
      hits: [{ rowId: 1, seq: 1 }],
      results: {},
      defaultApplied: false,
      trace: [],
      message: null,
    });
    await mount(OrderConsistencyPage);
    await click(tab("주문 시뮬레이션"));
    await choose(
      byTestId<HTMLSelectElement>("orderConsistency-sim-preset"),
      "p1",
    );
    await click(byTestId("orderConsistency-sim-run"));
    const sent = JSON.parse(String(callsOf("judge")[0].params.inputJson));
    expect(sent).toEqual({
      PRD_NM_CD: "G",
      ORD_SPNL_TP: "6",
      GW_ASG_CD: "Z10",
      ORD_EXC_WTH: "1219",
      ORD_MIX_WTH10: null,
    });
    expect(text(byTestId("orderConsistency-sim-fired-count"))).toBe("1");
    const fired = text(byTestId("orderConsistency-fired-R-075"));
    expect(fired).toContain("조건 2/2 충족");
    expect(fired).toContain("주문값: G (GI)");
  });

  it("검토 이슈의 관련 룰을 누르면 룰 목록에서 그 룰을 펼친다", async () => {
    await mount(OrderConsistencyPage);
    await click(tab("검토 이슈"));
    expect(text(byTestId("orderConsistency-issue-I-R5"))).toContain(
      "A72 GI Spangle 금지값",
    );
    const button = [
      ...(byTestId("orderConsistency-issue-I-R5")?.querySelectorAll("button") ??
        []),
    ].find((b) => text(b) === "R-075");
    await click(button);
    expect(text(tab("룰 목록"))).toBe("룰 목록 (7)");
    expect(text(byTestId("orderConsistency-rule-R-075"))).toContain(
      "시뮬레이션에서 확인",
    );
  });
});
