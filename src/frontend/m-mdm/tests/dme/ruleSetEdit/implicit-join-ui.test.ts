/** @vitest-environment happy-dom */
// implicit-join spec §8.3·§8.4·§10 — 속 빈 병렬 합류·빈 단계 예외 연결점·접기 대표 선 손잡이 없음·분기 풀기 메뉴·IF 패널 끝냄 표지·안내·빈 단계 받는 노드 경고.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import type { FlowEdge, FlowNode } from "../../../src/contract/engine-contract.generated";
import type { RuleSetCheck } from "../../../pages/dme/ruleSetEdit/types";
import { FlowCanvas, type FlowCanvasProps } from "../../../pages/dme/ruleSetEdit/canvas/FlowCanvas";
import { handlesOf } from "../../../pages/dme/ruleSetEdit/canvas/nodes";
import { editMenu } from "../../../pages/dme/ruleSetEdit/canvas/menus/edit-menu";
import { insertSplit, toEditFlow, type EditFlow } from "../../../pages/dme/ruleSetEdit/flow-edit";
import { PropertyPanel, type PropertyPanelProps } from "../../../pages/dme/ruleSetEdit/panels/PropertyPanel";
import type { SectionMemory } from "../../../pages/dme/ruleSetEdit/panels/Section";
import { BASE_CSS } from "../../../pages/dme/ruleSetEdit/styles/base";
import { flush, installDomStorage } from "../helpers/render";

const N = (id: string, kind: FlowNode["kind"], over: Partial<FlowNode> = {}): FlowNode => ({ id, kind, ruleId: kind === "RULE" ? id.toUpperCase() : null, splitId: null, label: null, ...over });
const E = (id: string, from: string, to: string, over: Partial<FlowEdge> = {}): FlowEdge => ({ id, from, to, order: null, cond: null, otherwise: false, label: null, ...over });
/** start → if1 [b1 "X > 0" → k → end](끝내는 갈래) [b2 "X > 1" → z → a] [그 외 → a] → a → end */
const F3 = (): EditFlow => toEditFlow({ version: 1,
  nodes: [N("start", "START"), N("if1", "IF"), N("k", "RULE"), N("z", "RULE"), N("a", "RULE"), N("end", "END")],
  edges: [E("e0", "start", "if1"), E("b1", "if1", "k", { order: 1, cond: "X > 0", label: "단가 없음" }), E("b2", "if1", "z", { order: 2, cond: "X > 1" }),
    E("bo", "if1", "a", { otherwise: true, label: "그 외" }), E("ek", "k", "end"), E("ez", "z", "a"), E("ea", "a", "end")] }, []);

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  installDomStorage();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
});
const q = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const noop = () => {};

describe("속 빈 병렬 합류·빈 단계 예외 연결점(§10·§8.3)", () => {
  it("병렬 합류 스타일은 병렬 막대와 같은 모서리의 속 빈 막대다", () => {
    expect(BASE_CSS).toMatch(/\.rsf-merge \{[^}]*background: transparent;[^}]*border: 3px solid var\(--rsf-par-bar\);[^}]*border-radius: 3px;/);
    expect(BASE_CSS).not.toMatch(/\.rsf-merge \{[^}]*border-radius: 50%/);
    expect(BASE_CSS).not.toMatch(/\.rsf-merge \{[^}]*border-top:/);
  });

  it("병렬 합류는 골라도 테두리 색을 바꾸지 않고 바깥선만 그린다", () => {
    expect(BASE_CSS).toMatch(/\.rsf-merge\[data-selected="true"\] \{[^}]*border-color: var\(--rsf-par-bar\);[^}]*outline: 2px solid var\(--color-primary\);/);
  });

  it("빈 단계에도 예외 연결점 손잡이가 있다", () => {
    expect(handlesOf("TASK").some((h) => h.id === "catch")).toBe(true);
  });
});

describe("편집 메뉴(§8.3)", () => {
  const ctx = (flow: EditFlow) => ({ mode: "edit", flow, act: new Proxy({}, { get: () => noop }), hasClipboard: false, selection: [] }) as unknown as Parameters<typeof editMenu>[1];

  it("분기 풀기 하위 항목 — 빈 갈래는 (빈 갈래), 끝내는 갈래는 (끝냄) 이고 흐리다", () => {
    const items = editMenu({ kind: "node", nodeId: "if1" } as Parameters<typeof editMenu>[0], ctx(F3()));
    const dissolve = items.find((i) => i.id === "dissolve")!.children!;
    expect(dissolve.map((i) => [i.label, !!i.disabled])).toEqual([["단가 없음 (끝냄)", true], ["갈래 2", false], ["그 외 (빈 갈래)", false]]);
  });

  it("빈 단계 우클릭에도 「예외 받기 추가」 가 있다", () => {
    const f = toEditFlow({ version: 1, nodes: [N("start", "START"), N("t1", "TASK", { label: "빈 단계" }), N("end", "END")],
      edges: [E("e1", "start", "t1"), E("e2", "t1", "end")] }, []);
    const items = editMenu({ kind: "node", nodeId: "t1" } as Parameters<typeof editMenu>[0], ctx(f));
    expect(items.map((i) => i.id)).toContain("catch-add");
  });
});

describe("접기 대표 선(J-D14, R20)", () => {
  const props = (over: Partial<FlowCanvasProps>): FlowCanvasProps => ({
    flow: F3(), rules: {}, checks: [], mode: "edit", varDisplay: "off", selectedId: null, selectedEdgeId: null, overlay: null, focusId: null, focusSeq: 0,
    onSelect: noop, onSelectEdge: noop, onOpenRule: noop, onMove: noop, onConnect: noop, onDropPalette: noop, onNoteChange: noop, breakpoints: new Set(),
    collapsed: new Set(), showMiniMap: false, editingCondEdgeId: null, onMoveNode: noop, onDropRule: noop, onContextMenu: noop, onEditCond: noop,
    onEditCondClose: noop, onToggleBreakpoint: noop, ...over,
  });
  const draw = async (p: FlowCanvasProps) => {
    await act(async () => {
      root.render(createElement(DmesUiProvider, null, createElement("div", { style: { width: 800, height: 600 } }, createElement(FlowCanvas, p))));
    });
    await flush();
  };

  it("고른 대표 선에는 [+] 가 없고, 고른 실제 선에는 있다", async () => {
    await draw(props({ collapsed: new Set(["if1"]), selectedEdgeId: "fold:if1" }));
    expect(document.querySelector('[data-testid="flow-edge-add-fold:if1"]')).toBeNull();
    await draw(props({ collapsed: new Set(["if1"]), selectedEdgeId: "ea" }));
    expect(q("flow-edge-add-ea")).not.toBeNull();
  });
});

describe("속성 패널(§8.3)", () => {
  const OPEN: SectionMemory = { isOpen: () => true, toggle: () => {}, open: () => {} };
  const render = async (flow: EditFlow, selectedId: string, checks: RuleSetCheck[] = []) => {
    const p: PropertyPanelProps = { flow, rules: {}, checks, selectedId, editable: true, editing: true, sections: OPEN, onOpenRule: () => {}, onEdit: () => null };
    await act(async () => {
      root.render(createElement(DmesUiProvider, null, createElement(PropertyPanel, p)));
    });
    await flush();
  };

  it("IF 갈래 목록에서 끝내는 갈래 옆에 「끝냄」 을, 목록 아래에 이어지는 갈래 안내를 보인다", async () => {
    await render(F3(), "if1");
    expect(q("flow-prop-branch-b1-ending")!.textContent).toBe("끝냄");
    expect(q("flow-prop-branch-b2-ending")).toBeNull();
    expect(q("flow-prop-if-ending-help")!.textContent).toBe("흐름을 이어 갈 갈래는 「그 외」로 둔다. 끝낼 갈래는 조건 갈래로 두고 끝 노드로 잇는다.");
  });

  it("END 앞에 끼운 IF 는 모이는 자리 빈 단계를 두므로 「그 외」 가 끝내는 갈래가 아니다 — 표지·안내가 없다(Task 4 수정 뒤 모양)", async () => {
    const r = insertSplit(toEditFlow(null, ["R_A"]), "e2", "IF");
    if (!r.ok) throw new Error(r.reason);
    await render(r.flow, "if1");
    const other = r.flow.edges.find((e) => e.from === "if1" && e.otherwise)!;
    expect(q(`flow-prop-branch-${other.id}-ending`)).toBeNull();
    expect(q("flow-prop-if-ending-help")).toBeNull();
  });

  it("IF 의 몸 있는 끝내는 갈래만 안내를 켜고, END 직행 끝내는 갈래는 표지만 보인다(R21)", async () => {
    const f = toEditFlow({ version: 1,
      nodes: [N("start", "START"), N("if1", "IF"), N("a", "RULE"), N("end", "END")],
      edges: [E("e0", "start", "if1"), E("b1", "if1", "a", { order: 1, cond: "X > 0" }), E("bo", "if1", "end", { otherwise: true }), E("ea", "a", "end")] }, []);
    await render(f, "if1");
    expect(q("flow-prop-branch-bo-ending")).not.toBeNull();
    expect(q("flow-prop-if-ending-help")).toBeNull();
  });

  it("빈 단계에 붙은 받는 노드는 「붙은 노드」 와 빈 단계 경고 한 줄을 보인다", async () => {
    const f = toEditFlow({ version: 1, nodes: [N("start", "START"), N("t1", "TASK", { label: "빈 단계" }), { ...N("c1", "CATCH"), attachTo: "t1", catches: ["NO_RESULT"] },
      N("end", "END")], edges: [E("e1", "start", "t1"), E("e2", "t1", "end"), E("e3", "c1", "end")] }, []);
    const never: RuleSetCheck = { code: "CATCH_NEVER", severity: "WARN", ruleId: null, otherRuleId: null, varName: null,
      message: "t1는 빈 단계라 c1가 받는 예외가 일어나지 않는다", nodeId: "c1", edgeId: null };
    await render(f, "c1", [never]);
    expect(q("flow-prop-catch")!.textContent).toContain("붙은 노드");
    expect(q("flow-prop-catch-never-task")!.textContent).toBe("t1는 빈 단계라 c1가 받는 예외가 일어나지 않는다");
  });
});
