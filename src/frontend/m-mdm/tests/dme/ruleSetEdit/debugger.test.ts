/** @vitest-environment happy-dom */

// 룰 세트 디버거(시뮬레이션 탭) 렌더 테스트 — 2단계 계획 Task 11. Task 4 골든(mdm/api test resources)을 사본 없이 경로로 읽어
// execute 응답으로 돌려준다. 입력 폼 → 실행 params → 따라가기(상태 문구·캔버스 겹침) → 값 표(병렬 합류) → 오류 노드 상세 →
// 편집 뒤 표시 지우기(구조만, 라벨·위치는 그대로) → 실행 권한 없음.
import fs from "node:fs";
import path from "node:path";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

const mocks = vi.hoisted(() => ({ openRuleEdit: vi.fn(), openMdmPage: vi.fn() }));

vi.mock("@/dme/rule-handoff", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/dme/rule-handoff")>()),
  openRuleEdit: (...args: unknown[]) => mocks.openRuleEdit(...args),
}));

vi.mock("@/shell", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shell")>()),
  openMdmPage: (...args: unknown[]) => mocks.openMdmPage(...args),
}));

import RuleSetEditPage from "../../../pages/dme/ruleSetEdit/page";
import type { RuleIo, RuleSetView } from "../../../pages/dme/ruleSetEdit/types";
import type { RuleSetFlow, RunTrace } from "../../../src/contract/engine-contract.generated";
import { PACKAGE_ROOT } from "../../helpers/engine-paths";

import { RBAC_STORE_KEY, findButton, flush, installDomStorage, jsonResponse, typeInto, visibleText } from "../helpers/render";

const GOLDEN_PATH = path.resolve(
  PACKAGE_ROOT,
  "../../backend/mdm/api/src/test/resources/com/dongkuk/dmes/mdm/dme/ruleSetEdit/rule-set-trace-golden.json",
);
interface GoldenCase {
  name: string;
  flowJson: string;
  recordJson: string;
  response: { trace: RunTrace; warnings: Array<{ code: string; ruleId: string | null; message: string }> };
}
const goldenCases = (JSON.parse(fs.readFileSync(GOLDEN_PATH, "utf8")) as { cases: GoldenCase[] }).cases;
const golden = (name: string): GoldenCase => {
  const c = goldenCases.find((x) => x.name === name);
  if (!c) throw new Error(`골든 사례가 없다: ${name}`);
  return c;
};

type Src = "DICT" | "PROG" | "NONE";
const ioName = (n: string, source: Src | null) => ({ name: n, source, label: null, dataType: null, scale: null, dateString: false, maruCodeId: null });
function io(ruleId: string, conds: Array<[string, Src]>, results: string[]): RuleIo {
  return {
    ruleId, ruleName: `${ruleId} 이름`, ruleKind: "DECISION", status: "INUSE", exists: true, releasedVer: 1, hitPolicy: "FIRST",
    conds: conds.map(([n, s]) => ioName(n, s)), results: results.map((r) => ioName(r, null)),
  };
}
const RULES: RuleIo[] = [
  io("GT_GRADE", [["GT_THK", "DICT"]], ["GT_G"]),
  io("GT_FAST", [["GT_G", "NONE"]], ["GT_F"]),
  io("GT_SLOW", [["GT_G", "NONE"]], ["GT_S"]),
  io("GT_SAME1", [["GT_KIND", "DICT"]], ["GT_V"]),
  io("GT_SAME2", [["GT_KIND", "DICT"]], ["GT_V"]),
];

function viewOf(c: GoldenCase): RuleSetView {
  const flow = JSON.parse(c.flowJson) as RuleSetFlow;
  const ruleIds = [...new Set(flow.nodes.map((n) => n.ruleId).filter((x): x is string => !!x))];
  return {
    set: { setId: "GT_SET", setName: "골든", description: null, status: "INUSE", rowVersion: 1, ruleIds, flow, branched: true },
    rules: RULES.filter((r) => ruleIds.includes(r.ruleId)),
    checks: [],
    condIo: {},
    editable: true,
    restorable: false,
  };
}

let container: HTMLDivElement;
let root: Root | null = null;
const originalFetch = globalThis.fetch;
let requests: Array<{ action: string; body: Record<string, unknown> }> = [];
let views: Record<string, RuleSetView> = {};
let replies: Record<string, unknown> = {};
/** 값이 있으면 execute 응답을 이 약속이 풀릴 때까지 붙잡아 둔다(늦은 응답 재현). */
let executeGate: Promise<void> | null = null;
let rbacRows: Array<Record<string, string>> = [];
const ok = (result: unknown) => ({ meta: { success: true }, data: { result } });
const calls = (action: string) => requests.filter((r) => r.action === action);

async function settle(ms = 300) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}
function q<T extends Element = HTMLElement>(id: string): T | null {
  return container.querySelector(`[data-testid="${id}"]`) as T | null;
}
function byTestId<T extends Element = HTMLElement>(id: string): T {
  const el = q<T>(id);
  if (!el) throw new Error(`data-testid ${id} 없음`);
  return el;
}
async function click(id: string) {
  await act(async () => {
    byTestId(id).dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flush();
}
/** 키 보냄 체크박스 — testid 는 감싼 span 에 있다. */
async function clickSend(name: string) {
  await act(async () => {
    byTestId(`sim-send-${name}`).querySelector("input")!.click();
  });
  await flush();
}
const status = () => visibleText(byTestId("sim-status")).trim();
const nodeState = (id: string) => byTestId(`flow-node-${id}`).getAttribute("data-state");
/** 탭 버튼 안 span 의 선택 상태 — closest('[role=tab]') 의 aria-selected. */
const tabSelected = (id: string) => byTestId(id).closest("[role=tab]")?.getAttribute("aria-selected");

async function openCase(name: string, opts: { simTab?: boolean } = {}) {
  const c = golden(name);
  views.GT_SET = viewOf(c);
  replies.execute = ok(c.response);
  (globalThis as Record<string, unknown>).__mdmPageHandoff__ = { "mdm:dme/ruleSetEdit": { setId: "GT_SET" } };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(DmesUiProvider, null, createElement(RuleSetEditPage, {})));
  });
  await flush();
  await settle();
  if (opts.simTab !== false) await click("flow-tab-sim");
  return c;
}

async function runSim(values: Record<string, string> = {}) {
  for (const [k, v] of Object.entries(values)) await typeInto(byTestId<HTMLInputElement>(`sim-input-${k}`), v);
  await click("sim-run");
  await settle(50);
}

beforeEach(() => {
  installDomStorage();
  requests = [];
  executeGate = null;
  views = {};
  replies = {};
  rbacRows = [{ objId: "*", action: "*", endpoint: "*", httpMethod: "*" }];
  mocks.openRuleEdit.mockReset();
  mocks.openMdmPage.mockReset();
  delete (globalThis as Record<string, unknown>).__mdmPageHandoff__;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const m = url.match(/\/oasis\/ruleSetEdit\/(\w+)/);
    if (m) {
      const action = m[1];
      requests.push({ action, body });
      const params = (body.params ?? {}) as Record<string, string>;
      if (action === "view") {
        const v = views[params.setId];
        return jsonResponse(v ? ok(v) : { meta: { success: false, message: `룰 세트를 찾을 수 없습니다: ${params.setId}` } });
      }
      if (action === "execute" && executeGate) await executeGate;
      return jsonResponse(replies[action === "search" ? `search:${params.target ?? "SET"}` : action] ?? ok({}));
    }
    if (url.includes("/api/auth/me")) return jsonResponse({ user: { id: "tester" } });
    if (url.includes("/api/mcm/oasis/secUser/myButtonEndpoints")) return jsonResponse({ grids: { buttons: { rows: rbacRows } } });
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
  delete (globalThis as Record<string, unknown>).__mdmPageHandoff__;
});

describe("디버거(시뮬레이션 탭)", () => {
  // 1
  it("입력 칸이 GT_THK·GT_KIND 두 개이고, 값을 넣고 [실행] 하면 execute 에 flowJson·recordJson 을 보낸다", async () => {
    const c = await openCase("PARALLEL_MERGE");
    expect(tabSelected("flow-tab-sim")).toBe("true");
    const inputs = Array.from(container.querySelectorAll('[data-testid^="sim-input-"]')).map((e) => e.getAttribute("data-testid"));
    expect(inputs).toEqual(["sim-input-GT_THK", "sim-input-GT_KIND"]);
    expect(visibleText(byTestId("flow-sim-slot"))).toContain("컬럼 사전");
    await runSim({ GT_THK: "12", GT_KIND: "x" });
    expect(calls("execute")).toHaveLength(1);
    const params = calls("execute")[0].body.params as Record<string, unknown>;
    expect(params.recordJson).toBe(c.recordJson);
    expect(JSON.parse(params.flowJson as string).nodes.map((n: { id: string }) => n.id)).toEqual(JSON.parse(c.flowJson).nodes.map((n: { id: string }) => n.id));
    expect(params.evalTs).toBeUndefined();
  });

  it("빈 칸은 null 로 보내고, 키 보냄을 끄면 그 키를 뺀다. 판정 시각은 형식이 맞아야 보낸다", async () => {
    await openCase("PARALLEL_MERGE");
    await typeInto(byTestId<HTMLInputElement>("sim-input-GT_THK"), "12");
    await clickSend("GT_KIND");
    await typeInto(byTestId<HTMLInputElement>("sim-evalts"), "2026/06/01");
    await click("sim-run");
    expect(calls("execute")).toHaveLength(0);
    expect(visibleText(byTestId("flow-sim-slot"))).toContain("yyyy-MM-dd HH:mm:ss");
    await typeInto(byTestId<HTMLInputElement>("sim-evalts"), "2026-06-01 09:00:00");
    await click("sim-run");
    await settle(50);
    const params = calls("execute")[0].body.params as Record<string, unknown>;
    expect(params.recordJson).toBe('{"GT_THK":"12"}');
    expect(params.evalTs).toBe("2026-06-01 09:00:00");
    await clickSend("GT_KIND");
    await typeInto(byTestId<HTMLInputElement>("sim-input-GT_THK"), "");
    await click("sim-run");
    await settle(50);
    expect((calls("execute")[1].body.params as Record<string, unknown>).recordJson).toBe('{"GT_THK":null,"GT_KIND":null}');
  });

  it("JSON 붙여 넣기가 있으면 폼 대신 그것을 보내고, 객체가 아니면 오류 문구를 보이며 보내지 않는다. 폼으로 가져오기가 칸을 채운다", async () => {
    await openCase("PARALLEL_MERGE");
    await typeInto(byTestId<HTMLTextAreaElement>("sim-json"), "[1,2]");
    await click("sim-run");
    expect(calls("execute")).toHaveLength(0);
    expect(visibleText(byTestId("flow-sim-slot"))).toContain("JSON 객체");
    await typeInto(byTestId<HTMLTextAreaElement>("sim-json"), '{"GT_THK":"7"}');
    await click("sim-run");
    await settle(50);
    expect((calls("execute")[0].body.params as Record<string, unknown>).recordJson).toBe('{"GT_THK":"7"}');
    await click("sim-json-import");
    expect(byTestId<HTMLInputElement>("sim-input-GT_THK").value).toBe("7");
    expect(byTestId<HTMLTextAreaElement>("sim-json").value).toBe("");
  });

  // 2
  it("PARALLEL_MERGE 응답 뒤 완료 문구, [처음]·[다음] 으로 따라가고 캔버스 노드가 current 가 된다", async () => {
    const c = await openCase("PARALLEL_MERGE");
    const trace = c.response.trace;
    await runSim({ GT_THK: "12", GT_KIND: "x" });
    expect(trace.nodes.map((n) => n.nodeId)).toEqual(["start", "r1", "par1", "r2", "rs1", "r3", "rs2", "m1", "end"]);
    expect(status()).toBe(`완료 · 9단계 · 결과 변수 ${Object.keys(trace.finalValues).length}개`);
    expect(nodeState("end")).toBe("current");
    await click("sim-first");
    expect(status()).toBe("1/9 · start");
    expect(byTestId<HTMLButtonElement>("sim-first").disabled).toBe(true);
    await click("sim-next");
    expect(status()).toBe("2/9 · r1");
    expect(nodeState("r1")).toBe("current");
    expect(nodeState("start")).toBe("run");
    expect(nodeState("rs2")).toBe("pending");
    expect(byTestId("sim-progress").getAttribute("data-value")).toBe(String(Math.round((2 / 9) * 100)));
    await click("sim-prev");
    expect(status()).toBe("1/9 · start");
    await click("sim-last");
    expect(status()).toContain("완료 · 9단계");
    expect(byTestId<HTMLButtonElement>("sim-next").disabled).toBe(true);
  });

  it("[실행]·따라가기 버튼 줄은 스크롤 밖(탭 머리 쪽)에 고정되고, 입력 폼·값 표만 스크롤된다(브라우저 확인 4번)", async () => {
    await openCase("PARALLEL_MERGE");
    await runSim({ GT_THK: "12", GT_KIND: "x" });
    const bar = byTestId("sim-bar");
    const scroll = byTestId("sim-scroll");
    for (const id of ["sim-run", "sim-clear", "sim-first", "sim-prev", "sim-next", "sim-last", "sim-status"]) {
      expect(bar.contains(byTestId(id)), id).toBe(true);
      expect(scroll.contains(byTestId(id)), id).toBe(false);
    }
    for (const id of ["sim-input-GT_THK", "sim-json", "sim-evalts", "sim-values"]) expect(scroll.contains(byTestId(id)), id).toBe(true);
    expect(bar.compareDocumentPosition(scroll) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); // 버튼 줄이 위
    expect(byTestId("sim-panel").contains(bar)).toBe(true); // ← → 키가 버튼 줄에 포커스가 있어도 된다
    // 아래 패널 본문은 시뮬레이션 탭에서 스스로 스크롤하지 않는다(스크롤은 sim-scroll 몫). 검사 결과 탭은 본문이 스크롤한다.
    expect(byTestId("flow-bottom-body").getAttribute("data-tab")).toBe("sim");
    await click("flow-tab-checks");
    expect(byTestId("flow-bottom-body").getAttribute("data-tab")).toBe("checks");
  });

  it("← → 키로도 단계를 넘긴다", async () => {
    await openCase("PARALLEL_MERGE");
    await runSim({ GT_THK: "12", GT_KIND: "x" });
    const slot = byTestId("sim-panel");
    await act(async () => {
      slot.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    });
    expect(status()).toBe("8/9 · m1");
    await act(async () => {
      slot.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    expect(status()).toContain("완료 · 9단계");
  });

  // 3
  it("값 표에 열 `합류 m1` 이 있고 GT_V 행 마지막 칸이 two, 다른 갈래 칸은 —(값 없음)이다", async () => {
    await openCase("PARALLEL_MERGE");
    await runSim({ GT_THK: "12", GT_KIND: "x" });
    const table = byTestId("sim-values");
    expect(visibleText(table)).toContain("합류 m1");
    const cellsOf = (name: string) => Array.from(byTestId(`sim-row-${name}`).closest("tr")!.querySelectorAll("td")).map((t) => t.textContent!.trim());
    const gtV = cellsOf("GT_V");
    expect(gtV[0]).toBe("GT_V");
    expect(gtV.at(-1)).toBe("two");
    // 열 순서: r1, r2, rs1, r3, rs2, m1 — 두 번째 갈래 시작(r3)에서 첫 갈래 값(one)이 보이면 안 된다(Review Focus 4).
    expect(gtV.slice(1)).toEqual(["—", "—", "one", "—", "two", "two"]);
    expect(cellsOf("GT_THK").slice(1)).toEqual(["12", "12", "12", "12", "12", "12"]);
    // 지금 단계(마지막)는 합류 열이다.
    await click("sim-first");
    expect(byTestId("sim-values").querySelector('[data-current="true"]')).toBeNull();
    await click("sim-last");
    expect(byTestId("sim-col-7").getAttribute("data-current")).toBe("true");
  });

  // 4
  it("IF_ERROR_STOPS — 오류로 멈춤 문구, if1 이 error, 노드를 누르면 갈래 결과(오류·평가 안 함)와 위반 문장을 보인다", async () => {
    const c = await openCase("IF_ERROR_STOPS");
    await runSim({ GT_THK: "12" });
    const first = c.response.trace.violations![0].message;
    expect(status()).toBe(`오류로 멈춤 — if1: ${first}`);
    expect(nodeState("if1")).toBe("error");
    await click("flow-node-if1");
    const detail = byTestId("sim-detail");
    expect(byTestId("sim-branch-e3").textContent).toContain("오류");
    expect(byTestId("sim-branch-e5").textContent).toContain("평가 안 함");
    expect(byTestId("sim-branch-e4").textContent).toContain("평가 안 함");
    expect(visibleText(detail)).toContain("GT_THK + 1");
    expect(visibleText(detail)).toContain(first);
    expect(byTestId("sim-violation-0").getAttribute("title")).toContain("BRANCH_EVAL_ERROR");
  });

  it("룰 노드를 누르면 읽은 값·맞은 행·결과값·행 판정을 보이고 [룰 편집 열기] 가 룰 화면을 연다", async () => {
    await openCase("PARALLEL_MERGE");
    await runSim({ GT_THK: "12", GT_KIND: "x" });
    await click("flow-node-r1");
    const detail = visibleText(byTestId("sim-detail"));
    expect(detail).toContain("GT_GRADE");
    expect(detail).toContain("GT_THK");
    expect(detail).toContain("12");
    expect(detail).toContain("GT_G");
    expect(detail).toContain("A");
    expect(detail).toContain("row_id 1");
    expect(tabSelected("flow-right-tab-detail")).toBe("true");
    await click("sim-detail-open-rule");
    expect(mocks.openRuleEdit).toHaveBeenCalledWith("GT_GRADE");
    await click("flow-node-m1");
    expect(visibleText(byTestId("sim-detail"))).toContain("GT_F");
    await click("flow-node-par1");
    expect(visibleText(byTestId("sim-detail"))).toContain("p1");
  });

  it("STRUCTURE_ERROR — 기록이 비면 실행 전 오류 문구를 보인다", async () => {
    const c = await openCase("STRUCTURE_ERROR");
    await runSim();
    expect(c.response.trace.nodes).toHaveLength(0);
    expect(status()).toBe(`실행 전 오류 — ${c.response.trace.violations![0].message}`);
    expect(byTestId<HTMLButtonElement>("sim-next").disabled).toBe(true);
  });

  it("응답 경고를 코드 배지와 문구로 보인다", async () => {
    const c = golden("PARALLEL_MERGE");
    c.response.warnings = [{ code: "TEST_WARN", ruleId: "GT_GRADE", message: "경고 문구" }];
    try {
      await openCase("PARALLEL_MERGE");
      await runSim({ GT_THK: "12", GT_KIND: "x" });
      const w = visibleText(byTestId("sim-warnings"));
      expect(w).toContain("TEST_WARN");
      expect(w).toContain("경고 문구");
    } finally {
      c.response.warnings = [];
    }
  });

  // 5
  it("위치만 바꾸면 겹침이 남고, 룰을 지우면 표시를 지우고 안내한다. 표시 지우기는 문구가 없다", async () => {
    await openCase("PARALLEL_MERGE");
    await runSim({ GT_THK: "12", GT_KIND: "x" });
    await click("flow-mode-edit");
    await click("flow-auto-layout");
    expect(nodeState("end")).toBe("current");
    expect(q("sim-values")).not.toBeNull();

    await click("flow-node-r2");
    expect(q("sim-detail")).not.toBeNull();
    await click("flow-right-tab-props");
    expect(q("sim-detail")).toBeNull();
    await click("flow-prop-delete");
    await settle(50);
    expect(q("flow-node-r2")).toBeNull();
    expect(nodeState("end")).toBe("idle");
    expect(q("sim-values")).toBeNull();
    expect(status()).toBe("흐름이 바뀌어 실행 표시를 지웠다. 다시 실행한다");

    await runSim({ GT_THK: "12", GT_KIND: "x" });
    expect(calls("execute")).toHaveLength(2);
    expect(status()).toContain("완료");
    await click("sim-clear");
    expect(nodeState("end")).toBe("idle");
    expect(q("sim-values")).toBeNull();
    expect(status()).not.toContain("흐름이 바뀌어");
  });

  it("다시 실행하는 중에 구조를 바꾸면 [실행] 이 다시 켜지고 안내가 보이며, 늦은 응답은 무시된다", async () => {
    await openCase("PARALLEL_MERGE");
    await runSim({ GT_THK: "12", GT_KIND: "x" });
    await click("flow-mode-edit");
    let release!: () => void;
    executeGate = new Promise<void>((r) => {
      release = r;
    });
    await click("sim-run");
    expect(status()).toContain("완료");
    expect(byTestId<HTMLButtonElement>("sim-run").disabled).toBe(true);
    await click("flow-node-r2");
    await click("flow-right-tab-props");
    await click("flow-prop-delete");
    await settle(50);
    expect(byTestId<HTMLButtonElement>("sim-run").disabled).toBe(false);
    expect(status()).toBe("흐름이 바뀌어 실행 표시를 지웠다. 다시 실행한다");
    await act(async () => {
      release();
    });
    await settle(50);
    expect(calls("execute")).toHaveLength(2);
    expect(q("sim-values")).toBeNull();
    expect(nodeState("end")).toBe("idle");
    expect(byTestId<HTMLButtonElement>("sim-run").disabled).toBe(false);
    expect(status()).toBe("흐름이 바뀌어 실행 표시를 지웠다. 다시 실행한다");
  });

  it("갈래 이름(label)만 고치면 실행 표시가 남는다", async () => {
    await openCase("PARALLEL_MERGE");
    await runSim({ GT_THK: "12", GT_KIND: "x" });
    await click("flow-mode-edit");
    await click("flow-node-par1");
    await click("flow-right-tab-props");
    await typeInto(byTestId<HTMLInputElement>("flow-prop-branch-p1-label"), "첫 갈래");
    expect(byTestId<HTMLInputElement>("flow-prop-branch-p1-label").value).toBe("첫 갈래");
    expect(nodeState("end")).toBe("current");
    expect(q("sim-values")).not.toBeNull();
    expect(status()).toContain("완료 · 9단계");
  });

  it("다른 세트를 열면 실행 표시를 지운다(안내 문구는 없다)", async () => {
    await openCase("PARALLEL_MERGE");
    await runSim({ GT_THK: "12", GT_KIND: "x" });
    const other = viewOf(golden("IF_ERROR_STOPS"));
    other.set.setId = "GT_OTHER";
    views.GT_OTHER = other;
    replies["search:SET"] = ok({ sets: [{ setId: "GT_OTHER", setName: "다른", status: "INUSE" }] });
    await typeInto(byTestId<HTMLInputElement>("set-pick-keyword"), "GT_");
    await act(async () => {
      findButton(container, "찾기").click();
    });
    await flush();
    await click("set-pick-GT_OTHER");
    await settle();
    expect(byTestId("set-edit-current").textContent).toContain("GT_OTHER");
    expect(q("sim-values")).toBeNull();
    expect(nodeState("if1")).toBe("idle");
    expect(status()).not.toContain("흐름이 바뀌어");
    expect(status()).not.toContain("완료");
  });

  // 6
  it("execute 권한이 없으면 [실행] 이 꺼져 있고 이유를 title 로 알린다", async () => {
    rbacRows = [
      { objId: "ruleSetEdit", action: "search", endpoint: "*", httpMethod: "*" },
      { objId: "ruleSetEdit", action: "save", endpoint: "*", httpMethod: "*" },
    ];
    await openCase("PARALLEL_MERGE");
    const run = byTestId<HTMLButtonElement>("sim-run");
    expect(run.disabled).toBe(true);
    expect(run.getAttribute("title")).toBe("디버거는 편집 권한이 있어야 쓸 수 있다");
    expect(calls("execute")).toHaveLength(0);
  });
});
