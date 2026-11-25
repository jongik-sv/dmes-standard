/** @vitest-environment happy-dom */
// 룰 기준 화면 틀 렌더 시험 — 진입 자동 조회, 묶음 막대·가려짐 배지·상세, 간편판정(입력·결과·탈락 근거), 변경 이력, 코드 범례,
// 추가 탭 자리, Maru 편집 이동, 늦은 응답 버림. 서버·사용자 확인·버튼 권한은 fetch 대역이고 catalog 는 대역 모듈이다.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import {
  RuleStandardScreen,
  signedNumber,
  useRules,
  type RuleDisplay,
  type RuleExtraTab,
  type RuleView,
  type UseRulesResult,
} from "@/common/rule";
import {
  RULE_EDIT_PAGE_ID,
  RULE_EDIT_TARGET_KEY,
} from "@/common/rule/open-rule-edit";

import { CGL, HISTORY, PLTCM } from "./fixtures";

vi.mock("@/common/catalog", async () => {
  const f = await import("./fixtures");
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
/** 설정하면 judge 응답을 이것으로 바꾼다. */
let judgeOverride: unknown = null;

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
  judgeOverride = null;
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
        if (m[1] === "judge" && judgeOverride) return ok(judgeOverride);
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
const EXTRA: RuleExtraTab[] = [
  {
    key: "flow",
    label: "공정 흐름",
    render: (ctx) => (
      <div data-testid="extra-flow">{`룰 ${ctx.rules.length}개`}</div>
    ),
  },
];
async function mount(extraTabs: RuleExtraTab[] = EXTRA, display?: RuleDisplay) {
  await act(async () => {
    root.render(
      createElement(
        DmesUiProvider,
        null,
        createElement(RuleStandardScreen, {
          screenId: "testScreen",
          title: "시험 화면",
          extraTabs,
          display,
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
  const input = byTestId("testScreen-group")?.querySelector<HTMLInputElement>(
    `input[value="${value}"]`,
  );
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

describe("RuleStandardScreen", () => {
  it("탭 순서(추가 탭은 룰 목록 뒤)와 진입 자동 조회 한 번, 묶음 막대 행 수", async () => {
    await mount();
    expect(tabs().map((t) => text(t))).toEqual([
      "룰 목록",
      "공정 흐름",
      "간편판정",
      "변경 이력",
      "코드 범례",
    ]);
    expect(callsOf("search").map((c) => c.params)).toEqual([
      { ruleIds: "C10B1074,C10B1075" },
    ]);
    expect(groupOption("").label).toBe("전체 3");
    expect(groupOption("PLTCM").label).toBe("PLTCM 2");
    expect(groupOption("CGL").label).toBe("CGL 1");
    expect(listCount()).toBe("3건");
  });

  it("조건 칸은 읽는 글(—·x·≤)이고, 가려진 행에만 배지가 붙는다. 묶음을 고르면 그 행만", async () => {
    await mount();
    const row10 = gridRow(host, "rowId", "10");
    expect(text(row10?.querySelector('[col-id="c_THK"]'))).toBe(
      "0.22 ≤ x ≤ 0.249",
    );
    expect(text(row10?.querySelector('[col-id="c_WID"]'))).toBe("—");
    expect(text(row10?.querySelector('[col-id="r_WID_SHRINK_QTY"]'))).toBe("2");
    expect(byTestId("testScreen-badge-unreachable-C10B1074-11")).not.toBeNull();
    expect(byTestId("testScreen-badge-unreachable-C10B1074-10")).toBeNull();
    await click(groupOption("CGL").input);
    expect(listCount()).toBe("1건");
    // CGL 만 보이면 머리글은 CGL 라벨(catalog), 라벨이 없는 변수는 Maru 변수명.
    const headers = [...host.querySelectorAll(".ag-header-cell-text")].map(
      (h) => text(h),
    );
    expect(headers).toContain("압연SET 두께");
    expect(headers).toContain("PROC_CD");
  });

  it("행을 누르면 상세에 조건 문장·결과(단위)·행·버전을 보인다", async () => {
    await mount();
    expect(text(byTestId("testScreen-detail"))).toContain("—");
    await click(gridRow(host, "rowId", "10")?.querySelector('[col-id="seq"]'));
    const detail = text(byTestId("testScreen-detail"));
    expect(detail).toContain("PLTCM · PLTCM폭수축량 (C10B1074)");
    expect(detail).toContain("원자재코드 IN (H32, M32)");
    expect(detail).toContain("0.22 ≤ PLTCM 출측두께 ≤ 0.249");
    expect(detail).toContain("보지 않음");
    expect(text(byTestId("testScreen-detail-result-WID_SHRINK_QTY"))).toBe(
      "2 mm",
    );
    expect(text(byTestId("testScreen-detail-row"))).toBe("10 · 1");
    expect(text(byTestId("testScreen-detail-version"))).toBe(
      "v1 · 2026-11-01 00:00:00 부터",
    );
  });

  it("간편판정 — 룰 조건으로 칸을 만들고, 숫자 칸을 먼저 검사하고, 결과·근거를 보인다", async () => {
    await mount();
    await click(tab("간편판정"));
    expect(byTestId("testScreen-judge-RAW_MATL_CD")).not.toBeNull();
    expect(byTestId("testScreen-judge-PROC_CD")).toBeNull(); // PLTCM 룰에는 공정코드가 없다
    await typeInto(byTestId<HTMLInputElement>("testScreen-judge-THK"), "abc");
    await click(byTestId("testScreen-judge-run"));
    expect(text(host)).toContain("PLTCM 출측두께 값이 숫자가 아닙니다: abc");
    expect(callsOf("judge")).toHaveLength(0);

    await typeInto(
      byTestId<HTMLInputElement>("testScreen-judge-RAW_MATL_CD"),
      "H32",
    );
    await typeInto(byTestId<HTMLInputElement>("testScreen-judge-THK"), "0.23");
    await click(byTestId("testScreen-judge-run"));
    expect(
      callsOf("judge").map((c) => [
        c.params.ruleId,
        JSON.parse(String(c.params.inputJson)),
      ]),
    ).toEqual([["C10B1074", { RAW_MATL_CD: "H32", THK: "0.23" }]]);
    expect(text(byTestId("testScreen-judge-status"))).toBe("적중");
    expect(text(byTestId("testScreen-judge-value-WID_SHRINK_QTY"))).toContain(
      "2",
    );
    expect(text(byTestId("testScreen-judge-hits"))).toBe("행 10 (순번 1)");

    await typeInto(byTestId<HTMLInputElement>("testScreen-judge-THK"), "0.5");
    await click(byTestId("testScreen-judge-run"));
    expect(text(byTestId("testScreen-judge-status"))).toBe("적중 없음");
    expect(text(byTestId("testScreen-judge-message"))).toBe(
      "조건에 맞는 행이 없습니다",
    );
    const card = byTestId("testScreen-judge-result");
    expect(text(gridRow(card, "rowId", "10"))).toContain(
      "0.22 ≤ PLTCM 출측두께 ≤ 0.249",
    );
    expect(text(gridRow(card, "rowId", "11"))).toContain("0.5");
  });

  it("간편판정에서 고른 룰이 Maru 편집 대상이 된다", async () => {
    await mount();
    await click(tab("간편판정"));
    const cgl = byTestId(
      "testScreen-judge-rule",
    )?.querySelector<HTMLInputElement>('input[value="C10B1075"]');
    await click(cgl);
    expect(byTestId("testScreen-judge-PROC_CD")).not.toBeNull();
    const spy = vi.fn();
    window.addEventListener("portal-open-tab", spy as EventListener);
    try {
      await click(headerButton("Maru에서 편집"));
      expect((spy.mock.calls[0][0] as CustomEvent).detail.pageId).toBe(
        RULE_EDIT_PAGE_ID,
      );
      expect(
        JSON.parse(window.sessionStorage.getItem(RULE_EDIT_TARGET_KEY)!),
      ).toMatchObject({ ruleId: "C10B1075", ver: "2" });
    } finally {
      window.removeEventListener("portal-open-tab", spy as EventListener);
    }
  });

  it("변경 이력 — 가장 새 버전과 직전 버전의 행 차이", async () => {
    await mount();
    await click(tab("변경 이력"));
    expect(callsOf("history").map((c) => c.params)).toEqual([
      { ruleId: "C10B1074" },
    ]);
    expect(byTestId<HTMLSelectElement>("testScreen-history-ver")?.value).toBe(
      "2",
    );
    expect(
      text(host.querySelector('[data-testid="grid-panel-title"]')),
    ).toContain("추가 1 · 삭제 1 · 변경 1");
    expect(text(gridRow(host, "rowId", "10"))).toContain("변경");
    expect(text(gridRow(host, "rowId", "11"))).toContain("추가");
    expect(text(gridRow(host, "rowId", "12"))).toContain("삭제");
  });

  it("코드 범례 — 룰 구성, 연산자 읽는 법, catalog 코드 항목(속성 이름)", async () => {
    await mount();
    await click(tab("코드 범례"));
    expect(callsOf("codes").map((c) => c.params)).toEqual([
      { codeIds: "QC_ITEM_NAME" },
    ]);
    const legend = byTestId("testScreen-legend");
    expect(text(gridRow(legend, "ruleId", "C10B1074"))).toContain(
      "원자재코드 · PLTCM 출측두께 · PLTCM 폭",
    );
    expect(text(legend)).toContain("NOT IN (A, B)");
    const code = byTestId("testScreen-legend-code-QC_ITEM_NAME");
    expect(text(code)).toContain("품명코드 (QC_ITEM_NAME v1)");
    expect(text(gridRow(code, "code", "L"))).toContain("GALVALUME");
  });

  it("추가 탭은 화면 상태(룰)를 받는다", async () => {
    await mount();
    await click(tab("공정 흐름"));
    expect(text(byTestId("extra-flow"))).toBe("룰 2개");
  });
});

describe("useRules", () => {
  let latest: UseRulesResult | null = null;
  function Probe({ ids }: { ids: string[] }) {
    latest = useRules(ids);
    return (
      <span data-testid="probe">
        {latest.rules.map((r) => r.ruleId).join(",")}
      </span>
    );
  }
  const render = (ids: string[]) =>
    act(async () => {
      root.render(<Probe ids={ids} />);
    });

  it("ID 가 바뀌면 다시 읽고, 늦게 온 앞 응답은 버린다", async () => {
    let release!: () => void;
    searchGates = [new Promise<void>((r) => (release = r))];
    searchResults = [{ rules: [PLTCM] }, { rules: [CGL] }];
    await render(["C10B1074"]);
    await settle();
    expect(latest?.loading).toBe(true);
    await render(["C10B1075"]);
    await settle();
    expect(text(byTestId("probe"))).toBe("C10B1075");
    await act(async () => release());
    await settle();
    expect(text(byTestId("probe"))).toBe("C10B1075");
    expect(callsOf("search").map((c) => c.params.ruleIds)).toEqual([
      "C10B1074",
      "C10B1075",
    ]);
  });

  it("같은 조건으로 진행 중인 조회는 다시 보내지 않는다", async () => {
    let release!: () => void;
    searchGates = [new Promise<void>((r) => (release = r))];
    await render(["C10B1074", "C10B1075"]);
    await act(async () => {
      void latest?.reload();
      void latest?.reload();
    });
    expect(callsOf("search")).toHaveLength(1);
    await act(async () => release());
    await settle();
    expect(text(byTestId("probe"))).toBe("C10B1074,C10B1075");
    expect(latest?.loaded).toBe(true);
  });
});

// ── 결과 표시 설정(display) ────────────────────────────────────

/** PLTCM 에 보조 결과(RULE_KEY·PRIO·SRC_NOTE)를 더한 룰 — 데이터 담당이 행 메모 대신 결과 열에 둔 값. */
const PLTCM_K: RuleView = {
  ...PLTCM,
  vars: [
    ...PLTCM.vars,
    {
      varId: 5,
      kind: "RESULT",
      name: "RULE_KEY",
      dataType: "STRING",
      dispType: "VALUE",
      seq: 2,
    },
    {
      varId: 6,
      kind: "RESULT",
      name: "PRIO",
      dataType: "NUMBER",
      dispType: "VALUE",
      seq: 3,
    },
    {
      varId: 7,
      kind: "RESULT",
      name: "SRC_NOTE",
      dataType: "STRING",
      dispType: "VALUE",
      seq: 4,
    },
  ],
  rows: PLTCM.rows.map((r, i) => ({
    ...r,
    results: {
      ...r.results,
      RULE_KEY: `WR-${i + 1}`,
      PRIO: String(i + 1),
      SRC_NOTE: i === 1 ? "원본주의 폭 600~1000 보존" : "-",
    },
  })),
};

const DISPLAY: RuleDisplay = {
  keyVar: "RULE_KEY",
  seqLabel: "평가 순서",
  leadVars: ["PRIO"],
  primaryVars: ["WID_SHRINK_QTY"],
  hiddenVars: ["SRC_NOTE"],
  blankValues: ["-"],
  format: { WID_SHRINK_QTY: signedNumber },
  badges: (r) =>
    r.SRC_NOTE
      ? [{ label: "원본주의", tone: "danger", title: r.SRC_NOTE }]
      : [],
  judgeTiles: ({ input, result }) => [
    {
      key: "echo",
      label: "출측 폭",
      value: String(Number(input.WID) - Number(result.results.WID_SHRINK_QTY)),
      unit: "mm",
    },
  ],
};

describe("RuleStandardScreen — 결과 표시 설정", () => {
  it("룰 ID·앞 열·업무 결과(부호)·배지 열, 숨김·빈 값 처리", async () => {
    searchResults = [{ rules: [PLTCM_K, CGL] }];
    await mount(EXTRA, DISPLAY);
    const row10 = gridRow(host, "rowId", "10");
    expect(text(row10?.querySelector('[col-id="ruleKey"]'))).toBe("WR-1");
    expect(text(row10?.querySelector('[col-id="l_PRIO"]'))).toBe("1");
    expect(text(row10?.querySelector('[col-id="r_WID_SHRINK_QTY"]'))).toBe(
      "+2",
    );
    // 룰 ID·앞 열·숨김 변수는 결과 열로 다시 나오지 않는다.
    expect(host.querySelector('[col-id="r_RULE_KEY"]')).toBeNull();
    expect(host.querySelector('[col-id="r_SRC_NOTE"]')).toBeNull();
    const headers = [...host.querySelectorAll(".ag-header-cell-text")].map(
      (h) => text(h),
    );
    expect(headers).toContain("평가 순서");
    expect(headers).toContain("룰 ID");
    // 행 11 — 가려짐 + 원본주의(「-」 는 빈 값이라 행 10 에는 배지가 없다).
    expect(text(byTestId("testScreen-badges-C10B1074-11"))).toBe(
      "가려짐원본주의",
    );
    expect(byTestId("testScreen-badges-C10B1074-10")).toBeNull();
    // 결과가 없는 룰(CGL)의 룰 ID 칸은 「—」.
    expect(
      text(gridRow(host, "rowId", "20")?.querySelector('[col-id="ruleKey"]')),
    ).toBe("—");

    await click(gridRow(host, "rowId", "11")?.querySelector('[col-id="seq"]'));
    expect(text(byTestId("testScreen-detail-key"))).toBe("WR-2 · PRIO 2");
    expect(text(byTestId("testScreen-detail"))).toContain(
      "원본주의 — 원본주의 폭 600~1000 보존",
    );
    expect(text(byTestId("testScreen-detail-result-WID_SHRINK_QTY"))).toBe(
      "+9 mm",
    );
  });

  it("간편판정 — 적용 룰 타일, 업무 결과 타일만, 화면 계산 타일, 적중 행 룰 ID", async () => {
    searchResults = [{ rules: [PLTCM_K, CGL] }];
    judgeOverride = {
      ...MATCHED,
      results: {
        WID_SHRINK_QTY: "2",
        RULE_KEY: "WR-1",
        PRIO: "1",
        SRC_NOTE: "-",
      },
    };
    await mount(EXTRA, DISPLAY);
    await click(tab("간편판정"));
    await typeInto(byTestId<HTMLInputElement>("testScreen-judge-WID"), "1000");
    await click(byTestId("testScreen-judge-run"));
    expect(text(byTestId("testScreen-judge-tile-__appliedRule"))).toContain(
      "WR-1",
    );
    expect(text(byTestId("testScreen-judge-tile-__appliedRule"))).toContain(
      "PRIO 1",
    );
    expect(text(byTestId("testScreen-judge-value-WID_SHRINK_QTY"))).toContain(
      "+2",
    );
    expect(byTestId("testScreen-judge-value-RULE_KEY")).toBeNull();
    expect(byTestId("testScreen-judge-value-SRC_NOTE")).toBeNull();
    expect(text(byTestId("testScreen-judge-tile-echo"))).toContain("998");
    const hit = gridRow(byTestId("testScreen-judge-result"), "rowId", "10");
    expect(text(hit?.querySelector('[col-id="ruleKey"]'))).toBe("WR-1");
    expect(text(hit?.querySelector('[col-id="result"]'))).toBe(
      "폭 수축량 +2 mm",
    );
  });
});
