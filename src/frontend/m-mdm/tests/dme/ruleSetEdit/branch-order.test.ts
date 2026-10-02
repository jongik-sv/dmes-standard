/** @vitest-environment happy-dom */

// 속성 패널 갈래 순서 끌기(3단계 Task 9, C13) — 순수 함수 movedOrder 와 화면 사례(병렬 끌어 놓기·IF "그 외" 줄·보기 모드).
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { movedOrder } from "../../../pages/dme/ruleSetEdit/panels/PropertyPanel";
import type { RuleIo, RuleSetView } from "../../../pages/dme/ruleSetEdit/types";
import type { RuleSetFlow } from "../../../src/contract/engine-contract.generated";

import { flush } from "../helpers/render";
import { byTestId, click, handoff, installServer, pageContainer, q, renderPage, srv, uninstallServer } from "../helpers/rule-set-page";

describe("movedOrder", () => {
  it("끌어 놓은 자리로 옮긴다", () => {
    expect(movedOrder(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
    expect(movedOrder(["a", "b", "c"], "a", "c")).toEqual(["b", "c", "a"]);
    expect(movedOrder(["a", "b", "c"], "b", "b")).toEqual(["a", "b", "c"]);
  });
});

const nm = (n: string) => ({ name: n, source: null, label: null, dataType: null, scale: null, dateString: false, maruCodeId: null });
const rule = (id: string, res: string): RuleIo => ({
  ruleId: id,
  ruleName: `${id} 이름`,
  ruleKind: "DECISION",
  status: "INUSE",
  exists: true,
  releasedVer: "1.000",
  hitPolicy: "FIRST",
  conds: [],
  results: [nm(res)],
});

const node = (id: string, kind: string, ruleId: string | null = null, splitId: string | null = null, label: string | null = null) => ({ id, kind, ruleId, splitId, label });
const edge = (id: string, from: string, to: string, order: number | null = null, cond: string | null = null, otherwise = false, label: string | null = null) => ({
  id,
  from,
  to,
  order,
  cond,
  otherwise,
  label,
});

/** start → PARALLEL p1 { r1 ; r2 ; r3 } → 합류 m1 → end. 갈래 선 e3·e4·e5 (order 1·2·3). */
const PAR_FLOW = {
  version: 1,
  nodes: [
    node("start", "START"),
    node("p1", "PARALLEL", null, null, "병렬"),
    node("r1", "RULE", "R_A"),
    node("r2", "RULE", "R_B"),
    node("r3", "RULE", "R_C"),
    node("m1", "MERGE", null, "p1"),
    node("end", "END"),
  ],
  edges: [
    edge("e1", "start", "p1"),
    edge("e3", "p1", "r1", 1, null, false, "가"),
    edge("e4", "p1", "r2", 2, null, false, "나"),
    edge("e5", "p1", "r3", 3, null, false, "다"),
    edge("e6", "r1", "m1"),
    edge("e7", "r2", "m1"),
    edge("e8", "r3", "m1"),
    edge("e9", "m1", "end"),
  ],
} as unknown as RuleSetFlow;

/** start → IF if1 { 조건 e3(1) ; 조건 e4(2) ; 그 외 e5 } → 합류 m1 → end. */
const IF_FLOW = {
  version: 1,
  nodes: [
    node("start", "START"),
    node("if1", "IF", null, null, "등급"),
    node("r1", "RULE", "R_A"),
    node("r2", "RULE", "R_B"),
    node("m1", "MERGE", null, "if1"),
    node("end", "END"),
  ],
  edges: [
    edge("e1", "start", "if1"),
    edge("e3", "if1", "r1", 1, 'X = "A"', false, "A"),
    edge("e4", "if1", "r2", 2, 'X = "B"', false, "B"),
    edge("e5", "if1", "m1", null, null, true, "그 외"),
    edge("e6", "r1", "m1"),
    edge("e7", "r2", "m1"),
    edge("e9", "m1", "end"),
  ],
} as unknown as RuleSetFlow;

function viewOf(flow: RuleSetFlow, editable = true): RuleSetView {
  return {
    set: { setId: "E2S_ORD", setName: "순서", description: null, status: "INUSE", rowVersion: 1, ruleIds: ["R_A", "R_B", "R_C"], flow, branched: true },
    rules: [rule("R_A", "OUT_A"), rule("R_B", "OUT_B"), rule("R_C", "OUT_C")],
    checks: [],
    condIo: {},
    editable,
    restorable: false,
  };
}

async function open(flow: RuleSetFlow, opts: { editing: boolean; select: string }) {
  srv.views.E2S_ORD = viewOf(flow);
  handoff("E2S_ORD");
  await renderPage();
  if (opts.editing) await click("flow-mode-edit");
  await click(`flow-node-${opts.select}`);
}

/** 속성 패널의 갈래 줄 선 ID 를 화면 순서대로. */
const branchIds = () =>
  Array.from(pageContainer().querySelectorAll('[data-testid^="flow-prop-branch-"]'))
    .map((e) => e.getAttribute("data-testid")!)
    .filter((t) => /^flow-prop-branch-e\d+$/.test(t))
    .map((t) => t.slice("flow-prop-branch-".length));

/** dragstart(손잡이) → dragover·drop(놓은 줄) — dataTransfer 를 한 벌 공유한다. */
async function drag(fromId: string, toId: string) {
  const store: Record<string, string> = {};
  const dataTransfer = {
    setData: (k: string, v: string) => {
      store[k] = v;
    },
    getData: (k: string) => store[k] ?? "",
  };
  const fire = (el: Element, type: string) => {
    const ev = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(ev, "dataTransfer", { value: dataTransfer });
    el.dispatchEvent(ev);
  };
  await act(async () => {
    fire(byTestId(`flow-prop-branch-${fromId}-handle`), "dragstart");
    fire(byTestId(`flow-prop-branch-${toId}`), "dragover");
    fire(byTestId(`flow-prop-branch-${toId}`), "drop");
  });
  await flush();
}

describe("속성 패널 갈래 끌기(화면)", () => {
  beforeEach(() => installServer());
  afterEach(() => uninstallServer());

  it("병렬 분기에서 셋째 손잡이를 첫째 줄에 놓으면 갈래 순서가 바뀐다", async () => {
    await open(PAR_FLOW, { editing: true, select: "p1" });
    expect(branchIds()).toEqual(["e3", "e4", "e5"]);
    await drag("e5", "e3");
    expect(branchIds()).toEqual(["e5", "e3", "e4"]);
  });

  it("IF 의 그 외 줄에는 손잡이가 없고, 그 줄에 놓으면 마지막 조건 갈래 자리로 간다", async () => {
    await open(IF_FLOW, { editing: true, select: "if1" });
    expect(q("flow-prop-branch-e3-handle")).not.toBeNull();
    expect(q("flow-prop-branch-e5-handle")).toBeNull();
    expect(branchIds()).toEqual(["e3", "e4", "e5"]);
    await drag("e3", "e5");
    expect(branchIds()).toEqual(["e4", "e3", "e5"]);
  });

  it("보기 모드에는 손잡이가 없고 놓아도 순서가 그대로다", async () => {
    await open(PAR_FLOW, { editing: false, select: "p1" });
    expect(branchIds()).toEqual(["e3", "e4", "e5"]);
    expect(q("flow-prop-branch-e3-handle")).toBeNull();
    const dataTransfer = { setData: () => undefined, getData: () => "e5" };
    await act(async () => {
      const ev = new Event("drop", { bubbles: true, cancelable: true });
      Object.defineProperty(ev, "dataTransfer", { value: dataTransfer });
      byTestId("flow-prop-branch-e3").dispatchEvent(ev);
    });
    await flush();
    expect(branchIds()).toEqual(["e3", "e4", "e5"]);
  });
});
