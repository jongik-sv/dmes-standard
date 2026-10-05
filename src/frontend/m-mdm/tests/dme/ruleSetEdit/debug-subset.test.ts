/** @vitest-environment happy-dom */
// 하위 세트 spec §11 — 디버거: SET 노드 상세, 안으로 들어가기(같은 캔버스·경로 표시), ‹ ›, 돌아오기, 새 기록·모드 나가기에 비움, calledFlows 없을 때 안내.
// 하위 세트 spec §10.4(C-D18) — 부르는 세트가 다른 탭에서 확정하지 않은 변경을 가지면 디버그 모드 경고.
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/dme/rule-handoff", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/dme/rule-handoff")>()) }));

import type { RuleSetView } from "../../../pages/dme/ruleSetEdit/types";
import { flush, typeInto } from "../helpers/render";
import { byTestId, calls, canvasNodeIds, click, handoff, installServer, ok, openSet, q, settle, srv, uninstallServer } from "../helpers/rule-set-page";
import { activateTab, clickIn, inPanel, qPanel, tabKeys } from "./set-tabs-helpers";

const PARENT_FLOW = {
  version: 1,
  nodes: [
    { id: "start", kind: "START", ruleId: null, splitId: null, label: null },
    { id: "s1", kind: "SET", ruleId: null, splitId: null, label: "단가 결정", setId: "CHILD" },
    { id: "end", kind: "END", ruleId: null, splitId: null, label: null },
  ],
  edges: [
    { id: "e1", from: "start", to: "s1", order: null, cond: null, otherwise: false, label: null },
    { id: "e2", from: "s1", to: "end", order: null, cond: null, otherwise: false, label: null },
  ],
  view: { positions: {}, notes: [], groups: [] },
};
const K = { type: "NUMBER", value: "1" };
const n = (seq: number, nodeId: string, kind: string, extra: Record<string, unknown> = {}) => ({
  seq, nodeId, kind, status: "OK", ruleId: null, ver: null, reads: null, branches: null, chosenEdgeId: null, order: null, splitId: null, merged: null, violations: null, ...extra,
});
/** 하위 세트 CHILD 의 기록: start → r1(C_K: K = 1) → end. */
const SUB = {
  setId: "CHILD", evalTs: "2026-10-01T09:00:00", input: {},
  nodes: [
    n(1, "start", "START"),
    n(2, "r1", "RULE", { ruleId: "C_K", ver: 1, reads: {}, result: { ruleId: "C_K", ver: 1, evalTs: "2026-10-01T09:00:00", hits: [], defaultApplied: true, results: { K }, trace: [], warnings: [] } }),
    n(3, "end", "END"),
  ],
  finalValues: { K }, violations: null,
};
const TRACE = {
  setId: "(저장 전)", evalTs: "2026-10-01T09:00:00", input: {},
  nodes: [n(1, "start", "START"), n(2, "s1", "SET", { reads: {}, outputs: { K }, sub: SUB }), n(3, "end", "END")],
  finalValues: { K }, violations: null,
};
const CALLED = { CHILD: { setId: "CHILD", setName: "하위", flow: null, ruleIds: ["C_K"], rules: [] } };

function view(): RuleSetView {
  return {
    set: { setId: "PARENT", setName: "부모", description: null, status: "INUSE", rowVersion: 0, ruleIds: [], flow: PARENT_FLOW, branched: false },
    rules: [], checks: [], editable: true, restorable: false, condIo: {}, cases: [],
  } as unknown as RuleSetView;
}

/** 부모 세트를 디버그 모드로 열고 [끝까지] 로 실행한 뒤 SET 노드를 고른다. */
async function runAndPickSet(execute: unknown = { trace: TRACE, warnings: [], calledFlows: CALLED }) {
  srv.replies.execute = ok(execute);
  await openSet("PARENT", view(), { tabId: "T1" });
  await click("flow-mode-debug");
  await click("dbg-finish");
  await settle(50);
  await click("flow-node-s1");
}

describe("디버거 하위 세트", () => {
  beforeEach(() => {
    installServer();
    localStorage.clear();
  });
  afterEach(uninstallServer);

  it("SET 노드 상세는 세트 ID·넘겨받은 출력·하위 세트 끝을 보이고, 실행된 SET 노드 칩은 첫 출력이다", async () => {
    await runAndPickSet();
    expect(calls("execute")).toHaveLength(1);
    expect(byTestId("sim-detail-set").textContent).toBe("CHILD");
    expect(byTestId("sim-detail-outputs").textContent).toContain("K");
    expect(byTestId("sim-detail-sub-summary").textContent).toBe("하위 세트 끝: 정상 · 받아 처리한 예외 0건");
    expect(byTestId("sim-detail-enter").hasAttribute("disabled")).toBe(false);
    expect(q("sim-detail-enter-off")).toBeNull();
    expect(byTestId("flow-node-chip-s1").textContent).toBe("K=1");
  });

  it("들어가면 같은 캔버스가 하위 흐름을 그리고 경로 표시·‹ › 로 하위 기록을 따라가며, 경로 앞 조각을 누르면 돌아온다", async () => {
    await runAndPickSet();
    await click("sim-detail-enter");
    expect(byTestId("dbg-callpath").textContent).toContain("세트 PARENT › 단가 결정(s1)");
    expect(canvasNodeIds()).toEqual(expect.arrayContaining(["start", "r1", "end"]));
    expect(canvasNodeIds()).not.toContain("s1");
    expect(byTestId("dbg-frame-status").textContent).toBe("3/3");
    expect(byTestId("dbg-frame-next").hasAttribute("disabled")).toBe(true);
    expect(q("var-panel")).toBeNull(); // 하위 프레임에서는 값 고치기 패널이 없다
    expect(byTestId("frame-detail-status").textContent).toBe("완료 · 3단계 · 결과 변수 1개");
    expect(byTestId("flow-node-chip-r1").textContent).toBe("K=1");

    // 하위 노드를 고르면 그 기록 상세(프레임 커서 앞에서 실행된 것만)
    await click("flow-node-r1");
    expect(byTestId("sim-detail-results").textContent).toContain("K");
    await click("dbg-frame-prev");
    await click("dbg-frame-prev");
    expect(byTestId("dbg-frame-status").textContent).toBe("1/3");
    expect(byTestId("flow-node-r1").getAttribute("data-state")).toBe("current");
    expect(q("sim-detail-results")).toBeNull();
    expect(byTestId("sim-detail").textContent).toContain("아직 실행하지 않은 노드다");
    expect(byTestId("frame-detail-status").textContent).toBe("2/3 · r1 실행 전");
    await click("dbg-frame-next");
    expect(byTestId("dbg-frame-status").textContent).toBe("2/3");

    await click("dbg-callpath-0");
    expect(q("dbg-callpath")).toBeNull();
    expect(canvasNodeIds()).toContain("s1");
    expect(q("var-panel")).not.toBeNull();
    expect(q("frame-detail")).toBeNull();
  });

  it("기록이 바뀌면(중지·새 실행) 들어간 프레임을 비우고, 새 기록에서 다시 들어간다", async () => {
    await runAndPickSet();
    await click("sim-detail-enter");
    expect(q("dbg-callpath")).not.toBeNull();
    await click("dbg-stop");
    expect(q("dbg-callpath")).toBeNull();
    expect(canvasNodeIds()).toContain("s1");
    await click("dbg-finish");
    await settle(50);
    expect(calls("execute")).toHaveLength(2);
    expect(q("dbg-callpath")).toBeNull();
    await click("flow-node-s1");
    await click("sim-detail-enter");
    expect(byTestId("dbg-callpath").textContent).toContain("단가 결정(s1)");
  });

  it("툴바 단계 실행은 최상위 기록에 쓰고, 그러면 최상위로 돌아온다", async () => {
    await runAndPickSet();
    await click("sim-detail-enter");
    await click("dbg-step-back");
    expect(calls("execute")).toHaveLength(1);
    expect(q("dbg-callpath")).toBeNull();
    expect(byTestId("dbg-status").textContent).toContain("3/3 · end 실행 전");
  });

  it("디버그 모드를 나가면 프레임을 비우고, 다시 들어와도 최상위다", async () => {
    await runAndPickSet();
    await click("sim-detail-enter");
    await click("flow-mode-view");
    expect(q("dbg-callpath")).toBeNull();
    expect(canvasNodeIds()).toContain("s1");
    await click("flow-mode-debug");
    expect(q("dbg-callpath")).toBeNull();
    expect(canvasNodeIds()).toContain("s1");
  });

  it("서버가 하위 세트 흐름(calledFlows)을 주지 않으면 [안으로 들어가기]를 끄고 안내한다", async () => {
    await runAndPickSet({ trace: TRACE, warnings: [] });
    expect(byTestId("sim-detail-enter").hasAttribute("disabled")).toBe(true);
    expect(byTestId("sim-detail-enter-off").textContent).toBe("하위 세트 흐름을 받지 못해 안으로 들어갈 수 없다");
    expect(byTestId("sim-detail-sub-summary").textContent).toBe("하위 세트 끝: 정상 · 받아 처리한 예외 0건");
    await click("sim-detail-enter");
    expect(q("dbg-callpath")).toBeNull();
  });

  it("들어간 프레임의 실행 비교는 두 실행에서 같은 SET 노드 경로의 하위 기록끼리 견준다", async () => {
    await runAndPickSet();
    await click("dbg-stop");
    // 두 번째 실행 — 하위 세트의 룰이 다른 값을 내고(K = 2) 하위 세트 안에서만 빈 단계 t9 를 더 지난다. 최상위 경로는 같다.
    const K2 = { type: "NUMBER", value: "2" };
    const sub2 = {
      ...SUB,
      nodes: [SUB.nodes[0], { ...SUB.nodes[1], result: { ...SUB.nodes[1].result, results: { K: K2 } } }, n(3, "t9", "TASK"), n(4, "end", "END")],
      finalValues: { K: K2 },
    };
    const trace2 = { ...TRACE, nodes: [TRACE.nodes[0], { ...TRACE.nodes[1], outputs: { K: K2 }, sub: sub2 }, TRACE.nodes[2]], finalValues: { K: K2 } };
    srv.replies.execute = ok({ trace: trace2, warnings: [], calledFlows: CALLED });
    await click("dbg-finish");
    await settle(50);
    await click("flow-node-s1");
    await click("sim-detail-enter");
    await click("flow-tab-compare");
    expect(byTestId("run-compare").textContent).toContain("1개 가운데 1개 다름");
    expect(byTestId("run-compare-only-after").textContent).toContain("t9");
    await click("dbg-callpath-0");
    expect(byTestId("run-compare-only-after").textContent).toContain("없음"); // 최상위 기록끼리는 지난 노드가 같다
  });

  it("하위 흐름 안의 SET 노드로 다시 들어가고(손주 세트), 경로 가운데 조각을 누르면 그 깊이로 돌아온다", async () => {
    const childFlow = {
      version: 1,
      nodes: [
        { id: "start", kind: "START", ruleId: null, splitId: null, label: null },
        { id: "s2", kind: "SET", ruleId: null, splitId: null, label: null, setId: "GRAND" },
        { id: "end", kind: "END", ruleId: null, splitId: null, label: null },
      ],
      edges: [
        { id: "e1", from: "start", to: "s2", order: null, cond: null, otherwise: false, label: null },
        { id: "e2", from: "s2", to: "end", order: null, cond: null, otherwise: false, label: null },
      ],
      view: { positions: {}, notes: [], groups: [] },
    };
    const grand = { ...SUB, setId: "GRAND" };
    const child = { ...SUB, nodes: [n(1, "start", "START"), n(2, "s2", "SET", { reads: {}, outputs: { K }, sub: grand }), n(3, "end", "END")] };
    const trace = { ...TRACE, nodes: [TRACE.nodes[0], { ...TRACE.nodes[1], sub: child }, TRACE.nodes[2]] };
    await runAndPickSet({
      trace, warnings: [],
      calledFlows: { CHILD: { ...CALLED.CHILD, flow: childFlow, ruleIds: [] }, GRAND: { setId: "GRAND", setName: "손주", flow: null, ruleIds: ["C_K"], rules: [] } },
    });
    await click("sim-detail-enter");
    expect(canvasNodeIds()).toContain("s2");
    await click("flow-node-s2");
    expect(byTestId("sim-detail-set").textContent).toBe("GRAND");
    await click("sim-detail-enter");
    expect(byTestId("dbg-callpath").textContent).toContain("세트 PARENT › 단가 결정(s1) › 손주(s2)");
    expect(canvasNodeIds()).toEqual(expect.arrayContaining(["start", "r1", "end"]));
    await click("dbg-callpath-1");
    expect(byTestId("dbg-callpath-1").tagName).toBe("STRONG");
    expect(canvasNodeIds()).toContain("s2");
  });

  it("들어간 프레임에서는 우클릭 메뉴·중단점 단축키가 최상위 흐름에 닿지 않는다(노드 ID 가 겹쳐도)", async () => {
    // 최상위 흐름에 하위 흐름과 같은 ID 의 빈 단계 r1 을 둔다: start → r1(TASK) → s1 → end.
    const flow = {
      ...PARENT_FLOW,
      nodes: [PARENT_FLOW.nodes[0], { id: "r1", kind: "TASK", ruleId: null, splitId: null, label: null }, ...PARENT_FLOW.nodes.slice(1)],
      edges: [
        { id: "e1", from: "start", to: "r1", order: null, cond: null, otherwise: false, label: null },
        { id: "e3", from: "r1", to: "s1", order: null, cond: null, otherwise: false, label: null },
        PARENT_FLOW.edges[1],
      ],
    };
    const v = view();
    srv.replies.execute = ok({
      trace: { ...TRACE, nodes: [TRACE.nodes[0], n(2, "r1", "TASK"), { ...TRACE.nodes[1], seq: 3 }, { ...TRACE.nodes[2], seq: 4 }] },
      warnings: [], calledFlows: CALLED,
    });
    await openSet("PARENT", { ...v, set: { ...v.set, flow } } as RuleSetView, { tabId: "T1" });
    await click("flow-mode-debug");
    await click("dbg-finish");
    await settle(50);
    await click("flow-node-s1");
    await click("sim-detail-enter");
    const menuOn = async (id: string) => {
      await act(async () => {
        byTestId(`flow-node-${id}`).dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 200, clientY: 120 }));
      });
      await flush();
    };
    await menuOn("r1");
    expect(q("flow-menu-item-bp-toggle")).toBeNull();
    await click("flow-node-r1");
    await act(async () => {
      byTestId("flow-canvas").dispatchEvent(new KeyboardEvent("keydown", { key: "F9", bubbles: true, cancelable: true }));
    });
    await flush();
    await click("flow-bp-r1"); // 프레임 안 중단점 점은 CSS 로 숨기고 눌러도 아무 일 없다
    await click("dbg-callpath-0");
    expect(byTestId("flow-bp-r1").getAttribute("data-on")).toBe("false");
    // 최상위로 돌아오면 같은 노드의 메뉴가 다시 뜬다
    await menuOn("r1");
    expect(q("flow-menu-item-bp-toggle")).not.toBeNull();
  });

  it("들어간 프레임에서는 값 표가 그 하위 기록을 보인다", async () => {
    await runAndPickSet();
    await click("sim-detail-enter");
    await click("flow-tab-values");
    const table = byTestId("sim-values");
    expect(table.textContent).toContain("C_K");
    expect(table.textContent).not.toContain("세트 CHILD");
    await click("dbg-callpath-0");
    expect(byTestId("sim-values").textContent).toContain("세트 CHILD");
  });
});

// ── 확정하지 않은 하위 세트 경고(하위 세트 spec §10.4, C-D18) — 탭 틀 안 두 탭 ──

function childView(draft = false): RuleSetView {
  const base = {
    set: { setId: "CHILD", setName: "하위", description: null, status: "INUSE", rowVersion: 3, ruleIds: [], flow: null, branched: false },
    rules: [], checks: [], editable: true, restorable: false, condIo: {}, cases: [],
  };
  if (!draft) return base as unknown as RuleSetView;
  return {
    ...base,
    set: { ...base.set, rowVersion: 0, ver: "2.000", verKind: "MAJOR", verLabel: "v2.000", verStatus: "DRAFT", ownerId: "tester" },
    versions: [
      { ver: "2.000", verKind: "MAJOR", verLabel: "v2.000", status: "DRAFT", applyFrom: null, applyTo: null, ownerId: "tester", rowVersion: 0, cancelConfirmable: false },
      { ver: "1.000", verKind: "MAJOR", verLabel: "v1.000", status: "RELEASED", applyFrom: "2026-01-01 00:00:00", applyTo: "9999-12-31 00:00:00", ownerId: null, rowVersion: 3, cancelConfirmable: false },
    ],
    flags: { canNewMajor: false, canNewMinor: false, nextMajor: null, nextMinor: null, unappliedCount: 1, currentVer: "1.000", canDeprecate: false },
    me: "tester",
  } as unknown as RuleSetView;
}

/** 포털이 세트를 넘기고 이 화면 탭을 다시 고른 것처럼 연다(두 번째부터 새 탭). */
async function openLink(setId: string, v: RuleSetView): Promise<void> {
  srv.views[setId] = v;
  handoff(setId);
  await activateTab("T1");
}

const WARN_CHILD = "하위 세트 CHILD에 확정하지 않은 변경이 있다. 실행은 판정 시각의 RELEASED 로 한다.";

describe("디버거 하위 세트 — 확정하지 않은 변경 경고", () => {
  beforeEach(() => {
    installServer();
    localStorage.clear();
  });
  afterEach(uninstallServer);

  it("부르는 세트의 탭에 저장 안 한 변경이 있으면 디버그 모드에 경고를 보이고, 그 탭을 닫으면 사라진다", async () => {
    await openSet("PARENT", view(), { tabId: "T1" });
    await openLink("CHILD", childView());
    const child = tabKeys()[1];
    await click("set-tab-t1");
    await click("flow-mode-debug"); // t1 이 첫 패널·지금 탭
    expect(qPanel("t1", "dbg-subset-unconfirmed")).toBeNull(); // 적용 중인 세트를 고치지 않고 열기만 했다

    await click(`set-tab-${child}`);
    await clickIn(child, "flow-mode-edit");
    await typeInto(inPanel<HTMLInputElement>(child, "set-name"), "하위 고침");
    await click("set-tab-t1");
    expect(inPanel("t1", "dbg-subset-unconfirmed").textContent).toBe(WARN_CHILD);
    expect(inPanel("t1", "dbg-subset-unconfirmed-CHILD").textContent).toBe(WARN_CHILD);
    expect(qPanel(child, "dbg-subset-unconfirmed")).toBeNull(); // 하위 세트 탭 자신은 디버그 모드가 아니다

    // 디버그 모드 밖에서는 보이지 않는다
    await click("flow-mode-view");
    expect(qPanel("t1", "dbg-subset-unconfirmed")).toBeNull();
    await click("flow-mode-debug");
    expect(qPanel("t1", "dbg-subset-unconfirmed")).not.toBeNull();

    window.confirm = vi.fn(() => true);
    await click(`set-tab-close-${child}`);
    expect(tabKeys()).toEqual(["t1"]);
    expect(qPanel("t1", "dbg-subset-unconfirmed")).toBeNull();
  });

  it("부르는 세트의 탭이 DRAFT 버전을 열고 있으면 저장 안 한 변경이 없어도 경고한다", async () => {
    await openSet("PARENT", view(), { tabId: "T1" });
    await click("flow-mode-debug");
    expect(qPanel("t1", "dbg-subset-unconfirmed")).toBeNull();
    await openLink("CHILD", childView(true));
    expect(inPanel("t1", "dbg-subset-unconfirmed").textContent).toBe(WARN_CHILD);
  });

  it("흐름이 부르지 않는 세트의 확정 안 한 변경은 경고하지 않는다", async () => {
    await openSet("PARENT", view(), { tabId: "T1" });
    await click("flow-mode-debug");
    await openLink("OTHER", { ...childView(true), set: { ...childView(true).set, setId: "OTHER" } } as RuleSetView);
    expect(qPanel("t1", "dbg-subset-unconfirmed")).toBeNull();
  });
});
