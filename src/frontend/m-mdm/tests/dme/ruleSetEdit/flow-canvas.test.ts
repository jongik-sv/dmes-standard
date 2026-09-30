/** @vitest-environment happy-dom */
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

const mocks = vi.hoisted(() => ({ searchRules: vi.fn() }));
vi.mock("../../../pages/dme/ruleSetEdit/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../pages/dme/ruleSetEdit/api")>()),
  searchRules: (...a: unknown[]) => mocks.searchRules(...a),
}));

import { insertSplit, toEditFlow, updateEdge, type EditFlow } from "../../../pages/dme/ruleSetEdit/flow-edit";
import { FlowCanvas, type FlowCanvasProps } from "../../../pages/dme/ruleSetEdit/canvas/FlowCanvas";
import { FlowPalette } from "../../../pages/dme/ruleSetEdit/canvas/FlowPalette";
import { RuleSearchModal } from "../../../pages/dme/ruleSetEdit/canvas/RuleSearchModal";
import type { RuleIo, RuleSetCheck } from "../../../pages/dme/ruleSetEdit/types";
import { flush, installDomStorage } from "../helpers/render";

function ifFlow(): EditFlow {
  const r = insertSplit(toEditFlow(null, ["R_A"]), "e2", "IF");
  if (!r.ok) throw new Error(r.reason);
  const c = r.flow.edges.find((e) => e.from === "if1" && !e.otherwise)!;
  const u = updateEdge(r.flow, c.id, { cond: "true" });
  if (!u.ok) throw new Error(u.reason);
  return u.flow;
}

function ioOf(ruleId: string, extra: Partial<RuleIo> = {}): RuleIo {
  const nm = (n: string) => ({ name: n, source: null, label: null, dataType: null, scale: null, dateString: false, maruCodeId: null });
  return {
    ruleId, ruleName: `${ruleId} 이름`, ruleKind: "DECISION", status: "INUSE", exists: true, releasedVer: 1, hitPolicy: "FIRST",
    conds: [], results: ruleId === "R_A" ? [nm("S_A")] : [], ...extra,
  };
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  installDomStorage();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  mocks.searchRules.mockReset();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
});

const noop = () => {};
function props(over: Partial<FlowCanvasProps> = {}): FlowCanvasProps {
  return {
    flow: ifFlow(), rules: { R_A: ioOf("R_A") }, checks: [], mode: "view", showVars: false, selectedId: null, selectedEdgeId: null,
    overlay: null, focusId: null, onSelect: noop, onSelectEdge: noop, onOpenRule: noop, onMove: noop, onConnect: noop,
    onDeleteEdge: noop, onDropPalette: noop, onNoteChange: noop, ...over,
  };
}
async function draw(p: FlowCanvasProps) {
  await act(async () => {
    root.render(createElement(DmesUiProvider, null, createElement("div", { style: { width: 800, height: 600 } }, createElement(FlowCanvas, p))));
  });
}
const q = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const click = async (el: Element) => act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });

describe("FlowCanvas", () => {
  it("노드 5개를 그리고 링크 아이콘은 룰에만 있다", async () => {
    await draw(props());
    for (const id of ["start", "r1", "if1", "m1", "end"]) expect(q(`flow-node-${id}`), id).not.toBeNull();
    expect(q("flow-rule-open-r1")).not.toBeNull();
    expect(document.querySelectorAll('[data-testid^="flow-rule-open-"]').length).toBe(1);
    expect(q("flow-rule-open-r1")!.getAttribute("aria-label")).toBe("룰 편집 열기");
  });

  it("IF 갈래 선에 이름표가 보인다", async () => {
    await draw(props());
    const labels = Array.from(document.querySelectorAll('[data-testid^="flow-edge-label-"]')).map((e) => e.textContent);
    expect(labels).toContain("그 외");
    expect(labels).toContain("갈래 1");
  });

  it("룰 박스는 선택하고, 링크 아이콘은 onOpenRule 만 부른다", async () => {
    const onSelect = vi.fn();
    const onOpenRule = vi.fn();
    await draw(props({ onSelect, onOpenRule }));
    await click(q("flow-node-r1")!);
    expect(onSelect).toHaveBeenCalledWith("r1");
    onSelect.mockClear();
    await click(q("flow-rule-open-r1")!);
    expect(onOpenRule).toHaveBeenCalledWith("R_A");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("검사가 걸린 노드에 표시 점이 생긴다", async () => {
    const checks: RuleSetCheck[] = [{ code: "ORDER", severity: "REJECT", ruleId: null, otherRuleId: null, varName: null, message: "x", nodeId: "r1", edgeId: null }];
    await draw(props({ checks }));
    expect(q("flow-node-mark-r1")).not.toBeNull();
    expect(q("flow-node-mark-if1")).toBeNull();
  });

  it("변수 흐름을 켜면 룰에서 나가는 선에 결과 이름 칩이 뜬다", async () => {
    await draw(props({ showVars: true }));
    expect(q("flow-edge-chips-e2")?.textContent).toContain("S_A");
    await draw(props({ showVars: false }));
    expect(q("flow-edge-chips-e2")).toBeNull();
  });

  it("겹침: 실행 노드는 data-state=run 과 순번 배지", async () => {
    const overlay = { nodes: { r1: { state: "run" as const, seq: 2, chip: "S_A=1" } }, edges: {} };
    await draw(props({ overlay }));
    expect(q("flow-node-r1")!.getAttribute("data-state")).toBe("run");
    expect(q("flow-node-seq-r1")?.textContent).toBe("2");
    expect(q("flow-node-chip-r1")?.textContent).toBe("S_A=1");
    expect(q("flow-node-if1")!.getAttribute("data-state")).toBe("idle");
  });

  it("편집 모드에서 선택한 선을 Delete 로 지운다, 보기 모드는 지우지 않는다", async () => {
    const onDeleteEdge = vi.fn();
    await draw(props({ mode: "edit", selectedEdgeId: "e2", onDeleteEdge }));
    await act(async () => { q("flow-canvas")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true })); });
    expect(onDeleteEdge).toHaveBeenCalledWith("e2");
    onDeleteEdge.mockClear();
    await draw(props({ mode: "view", selectedEdgeId: "e2", onDeleteEdge }));
    await act(async () => { q("flow-canvas")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true })); });
    expect(onDeleteEdge).not.toHaveBeenCalled();
  });

  it("메모는 편집 모드에서만 글을 고친다", async () => {
    const flow = { ...ifFlow(), view: { positions: {}, notes: [{ id: "n1", text: "메모글", x: 10, y: 10, w: 120, h: 60, attach: null }], groups: [{ id: "g1", title: "묶음", nodeIds: ["r1"] }] } };
    await draw(props({ flow }));
    expect(q("flow-note-n1")?.textContent).toBe("메모글");
    expect(q("flow-note-text-n1")).toBeNull();
    expect(q("flow-group-g1")?.textContent).toBe("묶음");
    await draw(props({ flow, mode: "edit" }));
    expect(q("flow-note-text-n1")).not.toBeNull();
  });
});

describe("FlowPalette", () => {
  it("버튼 5개, disabled 면 모두 꺼진다", async () => {
    const onPick = vi.fn();
    await act(async () => { root.render(createElement(DmesUiProvider, null, createElement(FlowPalette, { onPick, disabled: false }))); });
    for (const id of ["rule", "if", "par", "note", "group"]) expect(q(`flow-add-${id}`), id).not.toBeNull();
    await click(q("flow-add-if")!);
    expect(onPick).toHaveBeenCalledWith("if");
    await act(async () => { root.render(createElement(DmesUiProvider, null, createElement(FlowPalette, { onPick, disabled: true }))); });
    expect((q("flow-add-rule") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("RuleSearchModal", () => {
  it("확정 버전 없는 후보는 빠지고, 세트에 있는 룰에 사용 중이 붙으며, 늦은 응답은 버린다", async () => {
    const onPick = vi.fn();
    mocks.searchRules.mockResolvedValue({ rules: [ioOf("R_A"), ioOf("R_B"), ioOf("R_C", { releasedVer: null })] });
    const render = () => act(async () => {
      root.render(createElement(DmesUiProvider, null, createElement(RuleSearchModal, { opened: true, usedRuleIds: new Set(["R_A"]), onClose: noop, onPick })));
    });
    await render();
    await click(q("flow-rule-search-find")!);
    await flush();
    expect(q("flow-rule-cand-R_A")).not.toBeNull();
    expect(q("flow-rule-cand-R_B")).not.toBeNull();
    expect(q("flow-rule-cand-R_C")).toBeNull();
    expect(q("flow-rule-cand-R_A")!.textContent).toContain("사용 중");
    expect(q("flow-rule-cand-R_B")!.textContent).not.toContain("사용 중");
    await click(q("flow-rule-cand-R_A")!);
    expect(onPick).toHaveBeenCalledTimes(1);

    // 늦은 응답: 첫 요청이 두 번째보다 늦게 오면 버린다.
    let late!: (v: unknown) => void;
    mocks.searchRules.mockReset();
    mocks.searchRules.mockImplementationOnce(() => new Promise((r) => { late = r; }));
    mocks.searchRules.mockResolvedValueOnce({ rules: [ioOf("R_NEW")] });
    await click(q("flow-rule-search-find")!);
    await click(q("flow-rule-search-find")!);
    await flush();
    late({ rules: [ioOf("R_OLD")] });
    await flush();
    expect(q("flow-rule-cand-R_NEW")).not.toBeNull();
    expect(q("flow-rule-cand-R_OLD")).toBeNull();
  });
});
