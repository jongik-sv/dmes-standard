/** @vitest-environment happy-dom */
// 룰 화면 고유 탭 렌더 시험 — 원자재강종 「원판연계」(이력으로 원판 변경 → 재검토 필요), 규격약호 「간편조회」(두 룰 함께 판정),
// 폭마진량 「공정별 마진」(같은 주문 폭, 폭 조건 없는 공정은 폭 없이). catalog 는 실제 모듈, 서버·사용자·권한은 fetch 대역이다.
import { act, createElement, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import type { PageProps } from "@dk-oasis/shared/portal-shell-core";

import type { RuleView } from "@/common/rule";
import { LineWidthMarginPage } from "@/qdm/lineWidthMargin/LineWidthMarginPage";
import { RawMaterialGradePage } from "@/qdm/rawMaterialGrade/RawMaterialGradePage";
import { SpecCodePage } from "@/qdm/specCode/SpecCodePage";

import { base, derived, solo, version } from "./rawMaterialGrade/fixtures";

const V1 = version("1.000", [base("2.2"), derived(), solo]);
const V2 = version("1.001", [base("2.5"), derived(), solo]);
const RM: RuleView = {
  ruleId: "QD_RAW_MATERIAL_GRADE",
  applyFrom: "2026-11-20 09:00:00",
  hitPolicy: "FIRST",
  ...V2,
};

const v = (
  varId: number,
  name: string,
  kind: "COND" | "RESULT",
  dataType: "STRING" | "NUMBER" = "STRING",
) => ({
  varId,
  kind,
  name,
  dataType,
  dispType: kind === "RESULT" ? ("VALUE" as const) : ("ONE" as const),
  seq: varId,
});
const ruleOf = (ruleId: string, vars: ReturnType<typeof v>[]): RuleView => ({
  ruleId,
  ver: "1.000",
  applyFrom: "2026-11-01 00:00:00",
  hitPolicy: "FIRST",
  vars,
  rows: [],
});
const RULES: Record<string, RuleView> = {
  QD_RAW_MATERIAL_GRADE: RM,
  QD_SPEC_THK_STD: ruleOf("QD_SPEC_THK_STD", [
    v(1, "SPEC_ORG_CD", "COND"),
    v(2, "THK_STD_CD", "RESULT"),
    v(3, "RULE_KEY", "RESULT"),
  ]),
  QD_SPEC_BASE_GRADE: ruleOf("QD_SPEC_BASE_GRADE", [
    v(1, "SPEC_ORG_CD", "COND"),
    v(2, "STL_GRD_CD", "COND"),
    v(3, "BASE_STL_GRD_CD", "RESULT"),
    v(4, "RULE_KEY", "RESULT"),
  ]),
  C10B1073: ruleOf("C10B1073", [
    v(1, "RAW_MAT_CD", "COND"),
    v(2, "WID", "COND", "NUMBER"),
    v(3, "WID_MARGIN_QTY", "RESULT", "NUMBER"),
    v(4, "RULE_KEY", "RESULT"),
  ]),
  C10B1079: ruleOf("C10B1079", [
    v(1, "PRD_NM_CD", "COND"),
    v(2, "THK", "COND", "NUMBER"),
    v(3, "WID_MARGIN_QTY", "RESULT", "NUMBER"),
    v(4, "RULE_KEY", "RESULT"),
  ]),
};
const JUDGED: Record<string, Record<string, string>> = {
  QD_SPEC_THK_STD: { THK_STD_CD: "BMT", RULE_KEY: "TK-001" },
  QD_SPEC_BASE_GRADE: { BASE_STL_GRD_CD: "SGCC", RULE_KEY: "MP-001" },
  C10B1073: { WID_MARGIN_QTY: "10", RULE_KEY: "WM-PLTCM-001" },
  C10B1079: { WID_MARGIN_QTY: "20", RULE_KEY: "WM-JZ-001" },
};

type Call = { action: string; params: Record<string, unknown> };
let calls: Call[] = [];
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
  for (const name of ["localStorage", "sessionStorage"] as const)
    Object.defineProperty(globalThis, name, {
      value: new MemoryStorage(),
      configurable: true,
      writable: true,
    });
  for (const k of STORES) delete (globalThis as Record<string, unknown>)[k];
  calls = [];
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
        if (m[1] === "search")
          return ok({
            rules: String(params.ruleIds)
              .split(",")
              .map((id) => RULES[id]),
          });
        if (m[1] === "history")
          return ok({
            ruleId: params.ruleId,
            versions: params.ruleId === "QD_RAW_MATERIAL_GRADE" ? [V1, V2] : [],
          });
        if (m[1] === "codes") return ok({ codes: [] });
        if (m[1] === "judge") {
          const id = String(params.ruleId);
          return ok({
            ruleId: id,
            ver: "1.000",
            evalTs: "2026-11-25 10:00:00",
            status: "MATCHED",
            hits: [{ rowId: 1, seq: 1 }],
            results: JUDGED[id],
            defaultApplied: false,
            trace: [],
            message: null,
          });
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
        }),
      ),
    );
  });
  await settle();
}
const byTestId = (id: string) =>
  host.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const text = (el: Element | null | undefined) =>
  (el?.textContent ?? "").replace(/\s+/g, " ").trim();
async function click(el: Element | null | undefined) {
  expect(el).toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
  await settle();
}
const tabs = () =>
  [...host.querySelectorAll<HTMLElement>('[role="tab"]')].map((t) => text(t));
const tab = (label: string) =>
  [...host.querySelectorAll<HTMLElement>('[role="tab"]')].find(
    (b) => text(b) === label,
  );
const gridRow = (scope: Element | null, colId: string, value: string) =>
  [
    ...(scope?.querySelectorAll(".ag-center-cols-container .ag-row") ?? []),
  ].find((r) => text(r.querySelector(`[col-id="${colId}"]`)) === value);

describe("룰 화면 고유 탭", () => {
  it("원자재강종 — 목록에 재검토 필요 배지, 원판연계 탭의 나무·건수·사유", async () => {
    await mount(RawMaterialGradePage);
    expect(tabs()).toEqual([
      "룰 목록",
      "원판연계",
      "간편판정",
      "변경 이력",
      "코드 범례",
    ]);
    const row7 = gridRow(host, "ruleKey", "RM-007");
    expect(text(row7?.querySelector('[col-id="l_RULE_KIND"]'))).toBe(
      "칼라파생 ↳ RM-006",
    );
    expect(text(row7?.querySelector('[col-id="mark"]'))).toBe("재검토 필요");
    expect(
      text(
        gridRow(host, "ruleKey", "RM-011")?.querySelector(
          '[col-id="l_LEGACY_NO"]',
        ),
      ),
    ).toBe("0 예외");
    await click(tab("원판연계"));
    expect(text(byTestId("rawMaterialGrade-lineage-review"))).toContain("1");
    const tree = byTestId("rawMaterialGrade-lineage");
    await click(
      gridRow(tree, "key", "RM-007")?.querySelector('[col-id="key"]'),
    );
    expect(text(byTestId("rawMaterialGrade-lineage-reasons"))).toBe(
      "원판 RM-006 변경(v1.000 → v1.001): 두께범위 0.2 ≤ t < 2.2 → 0.2 ≤ t < 2.5",
    );
  });

  it("규격약호 — 간편조회 한 번에 두 룰을 판정하고 값·적용 기준을 보인다", async () => {
    await mount(SpecCodePage);
    expect(tabs()).toEqual([
      "룰 목록",
      "간편조회",
      "간편판정",
      "변경 이력",
      "코드 범례",
    ]);
    await click(tab("간편조회"));
    await click(byTestId("specCode-lookup-run"));
    expect(
      callsOf("judge").map((c) => [
        c.params.ruleId,
        JSON.parse(String(c.params.inputJson)),
      ]),
    ).toEqual([
      ["QD_SPEC_THK_STD", { SPEC_ORG_CD: "KS" }],
      ["QD_SPEC_BASE_GRADE", { SPEC_ORG_CD: "KS", STL_GRD_CD: "CGCC" }],
    ]);
    const thk = text(byTestId("specCode-lookup-value-QD_SPEC_THK_STD"));
    expect(thk).toContain("BMT");
    expect(thk).toContain("적용 기준 TK-001");
    expect(
      text(byTestId("specCode-lookup-value-QD_SPEC_BASE_GRADE")),
    ).toContain("SGCC");
  });

  it("폭마진량 — 공정별 마진: 같은 주문 폭, 폭 조건이 없는 정전은 폭 없이, 합산·제품 폭", async () => {
    await mount(LineWidthMarginPage);
    expect(tabs()).toContain("공정별 마진");
    await click(tab("공정별 마진"));
    await click(byTestId("lineWidthMargin-flow-run"));
    expect(
      callsOf("judge").map((c) => [
        c.params.ruleId,
        JSON.parse(String(c.params.inputJson)).WID,
      ]),
    ).toEqual([
      ["C10B1073", "1000"],
      ["C10B1079", undefined],
    ]);
    const total = text(byTestId("lineWidthMargin-flow-total"));
    expect(total).toContain("+30");
    expect(total).toContain("제품 폭 970 mm");
  });
});
