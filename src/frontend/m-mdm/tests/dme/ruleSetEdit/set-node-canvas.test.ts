// 하위 세트 spec §9(계획 Task 8 갱신 메모) — SET 노드를 RULE·TASK 와 같은 단계로: 자동 배치(D-140)·받는 노드 자리(D-142·D-143)·연결점(예외 연결점),
// 메뉴 제공자(편집·보기·디버그), 머리글 종류 CALL, 룰 목록 섹션 없음, 입출력 표의 세트 키 표시, 팝업 후보 거르기. 순수 함수만 본다.
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FlowEdge, FlowNode, FlowNodeKind, RuleSetFlow } from "../../../src/contract/engine-contract.generated";
import { keyLabel } from "../../../pages/dme/ruleSetEdit/cards/SetIoTables";
import { buildMenu, type CanvasActions, type MenuContext } from "../../../pages/dme/ruleSetEdit/canvas/context-menu";
import { MENU_PROVIDERS } from "../../../pages/dme/ruleSetEdit/canvas/menus";
import { CATCH_HANDLE, handlesOf } from "../../../pages/dme/ruleSetEdit/canvas/nodes";
import { pickCut, setPickRows } from "../../../pages/dme/ruleSetEdit/canvas/SetPickModal";
import { addCatch, insertSet, toEditFlow, type EditFlow } from "../../../pages/dme/ruleSetEdit/flow-edit";
import { NODE_SIZE, autoArrange, autoLayout, catchSlots, catchSpot, clearLayoutCache } from "../../../pages/dme/ruleSetEdit/flow-layout";
import { panelTargetOf } from "../../../pages/dme/ruleSetEdit/panels/PanelHeader";
import { NO_RULE_LIST_KINDS, ruleListMode } from "../../../pages/dme/ruleSetEdit/panels/SidePanel";
import type { FlowMode } from "../../../pages/dme/ruleSetEdit/state/useRuleSetEdit";
import type { SetCallIo } from "../../../pages/dme/ruleSetEdit/types";

const nd = (id: string, kind: FlowNodeKind, over: Partial<FlowNode> = {}): FlowNode => ({ id, kind, ruleId: null, splitId: null, label: null, ...over });
const ed = (id: string, from: string, to: string): FlowEdge => ({ id, from, to, order: null, cond: null, otherwise: false, label: null });

/** 새 형식(D-136, 합류 없음): start → s1(SET A) → n1 → r2 → end, c1(s1 에 붙음) → h1 → r2(돌아오는 자리). */
const guardedSet = (): RuleSetFlow => ({
  version: 1,
  nodes: [
    nd("start", "START"), nd("s1", "SET", { setId: "A" }), nd("n1", "RULE", { ruleId: "N1" }),
    nd("c1", "CATCH", { attachTo: "s1", catches: ["SUBSET_ENDED"] }), nd("h1", "RULE", { ruleId: "H1" }),
    nd("r2", "RULE", { ruleId: "R2" }), nd("end", "END"),
  ],
  edges: [ed("e1", "start", "s1"), ed("e2", "s1", "n1"), ed("e3", "n1", "r2"), ed("e4", "c1", "h1"), ed("e5", "h1", "r2"), ed("e6", "r2", "end")],
});

const callOf = (setId: string, exists = true): SetCallIo => ({
  setId, setName: exists ? `${setId} 세트` : null, exists, status: exists ? "INUSE" : null, inputs: [], outputs: [], endsEarly: false,
});

function actions(): CanvasActions {
  return new Proxy({} as CanvasActions, { get: (t, k) => ((t as never)[k] ??= vi.fn()) });
}
function ctx(mode: FlowMode, flow: EditFlow): MenuContext {
  return { flow, rules: {}, mode, hasClipboard: false, selectedEdgeId: null, collapsed: new Set(), breakpoints: new Set(), canRun: true, act: actions() };
}
const ids = (c: MenuContext, nodeId: string) => buildMenu(MENU_PROVIDERS, { kind: "node", nodeId }, c).map((i) => i.id);

beforeEach(() => clearLayoutCache());

describe("SET 노드 배치·연결점(RULE·TASK 와 같은 단계)", () => {
  it("SET 노드 크기는 룰과 같고, 연결점에 예외 연결점이 있다", () => {
    expect(NODE_SIZE.SET).toEqual(NODE_SIZE.RULE);
    expect(handlesOf("SET").map((h) => h.id)).toEqual(handlesOf("RULE").map((h) => h.id));
    expect(handlesOf("SET").some((h) => h.id === CATCH_HANDLE)).toBe(true);
  });

  it("받는 노드는 SET 노드 아래 테두리에 걸치고, 자동 배치에서 처리 갈래는 SET 아래 층 오른쪽에 놓인다", () => {
    const f = guardedSet();
    expect([...catchSlots(f)]).toEqual([["c1", { attachTo: "s1", k: 0, spot: null }]]);
    const pos = autoLayout(f);
    expect(pos.n1.x).toBe(pos.s1.x); // 정상 갈래는 SET 바로 아래
    expect(pos.h1.x).toBeGreaterThanOrEqual(pos.n1.x + NODE_SIZE.RULE.w); // 처리 갈래는 그 오른쪽
    expect(pos.h1.y).toBeGreaterThan(pos.s1.y + NODE_SIZE.SET.h);
    expect(pos.c1).toEqual(catchSpot(pos.s1, NODE_SIZE.SET, 0));
    // 같은 흐름에서 s1 이 룰 노드일 때와 배치가 같다(D-140 자동 배치·D-142 받는 노드 자리).
    clearLayoutCache();
    const asRule: RuleSetFlow = { ...f, nodes: f.nodes!.map((n) => (n.id === "s1" ? nd("s1", "RULE", { ruleId: "S1" }) : n)) };
    expect(autoLayout(asRule)).toEqual(pos);
  });

  it("편집 연산으로 붙인 받는 노드도 [자동 정렬] 뒤 SET 테두리 자리에 있다", () => {
    const s = insertSet(toEditFlow(null, ["R_A"]), "e2", "A");
    if (!s.ok) throw new Error(s.reason);
    const c = addCatch(s.flow, "s1", null);
    if (!c.ok) throw new Error(c.reason);
    const g = autoArrange(c.flow);
    const catchId = g.nodes.find((n) => n.kind === "CATCH")!.id;
    const p = g.view.positions;
    expect(catchSlots(g).get(catchId)?.attachTo).toBe("s1");
    expect(p.s1).toBeDefined();
    expect(p.s1.y).toBeGreaterThan(p.r1.y);
  });
});

describe("SET 노드 메뉴 제공자", () => {
  const f = (): EditFlow => {
    const r = insertSet(toEditFlow(null, ["R_A"]), "e2", "A");
    if (!r.ok) throw new Error(r.reason);
    return r.flow;
  };

  it("편집 — 복사·복제·예외 받기·삭제 뒤 세트 탭으로 열기(색상·룰 바꾸기 없음)", () => {
    expect(ids(ctx("edit", f()), "s1")).toEqual(["copy", "duplicate", "catch-add", "delete", "set-open"]);
  });

  it("보기 — 세트 탭으로 열기만, 디버그 — 중단점·여기까지 실행 뒤 세트 탭으로 열기", () => {
    expect(ids(ctx("view", f()), "s1")).toEqual(["set-open"]);
    expect(ids(ctx("debug", f()), "s1")).toEqual(["bp-toggle", "run-to", "set-open"]);
  });

  it("세트 ID 가 빈 SET 노드에는 세트 탭으로 열기가 없다", () => {
    const g = f();
    g.nodes.find((n) => n.id === "s1")!.setId = "";
    expect(ids(ctx("view", g), "s1")).toEqual([]);
  });

  it("「세트 탭으로 열기」 는 그 세트 ID 로 openSet, 선 「룰 세트 넣기」 는 그 선으로 pickSetFor", () => {
    const c = ctx("edit", f());
    buildMenu(MENU_PROVIDERS, { kind: "node", nodeId: "s1" }, c).find((i) => i.id === "set-open")!.run!();
    expect(c.act.openSet).toHaveBeenCalledWith("A");
    buildMenu(MENU_PROVIDERS, { kind: "edge", edgeId: "e1", via: "plus" }, c).find((i) => i.id === "insert-set")!.run!();
    expect(c.act.pickSetFor).toHaveBeenCalledWith("e1");
  });
});

describe("SET 노드 패널·표", () => {
  const flow = (): EditFlow => {
    const r = insertSet(toEditFlow(null, ["R_A"]), "e2", "A");
    if (!r.ok) throw new Error(r.reason);
    return r.flow;
  };

  it("머리글 종류는 CALL(하위 세트) — 이름은 라벨 → 세트명(있는 세트) → 세트 ID", () => {
    expect(panelTargetOf(flow(), {}, "s1", null, "부모", { A: callOf("A") })).toEqual({ kind: "CALL", id: "s1", name: "A 세트" });
    expect(panelTargetOf(flow(), {}, "s1", null, "부모", { A: callOf("A", false) }).name).toBe("A");
    expect(panelTargetOf(flow(), {}, "s1", null, "부모").name).toBe("A");
    const g = flow();
    g.nodes.find((n) => n.id === "s1")!.label = "단가 결정";
    expect(panelTargetOf(g, {}, "s1", null, "부모", { A: callOf("A") }).name).toBe("단가 결정");
    expect(panelTargetOf(flow(), {}, null, null, "부모").kind).toBe("SET"); // 세트 전체 패널은 그대로
  });

  it("SET 노드를 고르면 룰 목록 섹션이 없고 룰 지정 대상도 아니다", () => {
    expect(NO_RULE_LIST_KINDS.has("CALL")).toBe(true);
    expect(ruleListMode(flow(), "s1", true)).toBe("insert");
  });

  it("입출력 표의 쓰는·만드는·읽는 쪽은 룰 ID 그대로, 세트 키는 「세트 {ID}」", () => {
    expect(keyLabel("R_A")).toBe("R_A");
    expect(keyLabel("set:QD_S")).toBe("세트 QD_S");
  });

  it("세트 검색 팝업 후보는 INUSE 이고 지금 세트가 아닌 세트뿐이다", () => {
    const rows = setPickRows(
      [
        { setId: "ME", setName: "자기", status: "INUSE" },
        { setId: "OLD", setName: "폐기", status: "DEPRECATED" },
        { setId: "NEW", setName: "새", status: "CREATED" },
        { setId: "B", setName: "비", status: "INUSE" },
      ],
      "ME",
    );
    expect(rows).toEqual([{ id: "B", name: "비", status: "INUSE" }]);
  });

  it("잘림 안내는 서버가 20건에 닿았고 거르며 줄이 빠졌을 때만이다(IdPicker 안내와 겹치지 않게)", () => {
    expect(pickCut(20, 15)).toBe(true);
    expect(pickCut(20, 0)).toBe(true);
    expect(pickCut(20, 20)).toBe(false);
    expect(pickCut(19, 10)).toBe(false);
  });
});
