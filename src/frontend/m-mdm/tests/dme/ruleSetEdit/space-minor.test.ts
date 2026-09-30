/** @vitest-environment happy-dom */

// S1 과 같이 고친 bfix 재리뷰-2 Minor 둘.
// - Minor C: 접힌 블록을 끈 뒤 펼치면 블록이 끈 거리만큼 간다(IF 28px·병렬 16px 덜 가지 않는다). 접힌 채 다시 그려도 놓은 자리에 있다.
// - Minor D: 아무것도 고르지 않고 [메모] 를 누르면 메모 기본 자리는 그린(접힌) 노드 전체 상자의 가운데다.
import { createElement, act } from "react";
import { createRoot } from "react-dom/client";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ openRuleEdit: vi.fn(), openMdmPage: vi.fn() }));
vi.mock("@/dme/rule-handoff", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/dme/rule-handoff")>()),
  openRuleEdit: (...args: unknown[]) => mocks.openRuleEdit(...args),
}));
vi.mock("@/shell", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shell")>()),
  openMdmPage: (...args: unknown[]) => mocks.openMdmPage(...args),
}));

import { insertRule, insertSplit, setPositions, toEditFlow, type EditFlow, type EditResult, type FlowPos } from "../../../pages/dme/ruleSetEdit/flow-edit";
import { drawnPositions } from "../../../pages/dme/ruleSetEdit/flow-layout";
import { FlowCanvas, type FlowCanvasProps } from "../../../pages/dme/ruleSetEdit/canvas/FlowCanvas";
import type { RuleIo, RuleSetView } from "../../../pages/dme/ruleSetEdit/types";
import { flush, installDomStorage } from "../helpers/render";
import { byTestId, canvasNodeIds, click, installServer, openSet, q, uninstallServer } from "../helpers/rule-set-page";

const ioName = (n: string) => ({ name: n, source: "DICT" as const, label: null, dataType: null, scale: null, dateString: false, maruCodeId: null });
const rule = (ruleId: string, cond: string, result: string): RuleIo => ({
  ruleId, ruleName: `${ruleId} 이름`, ruleKind: "DECISION", status: "INUSE", exists: true, releasedVer: 1, hitPolicy: "FIRST",
  conds: [ioName(cond)], results: [{ ...ioName(result), source: null }],
});
const RULES = [rule("SM_A", "IN_A", "OUT_A"), rule("SM_B", "OUT_A", "OUT_B"), rule("SM_C", "OUT_B", "OUT_C")];
const IDS = RULES.map((r) => r.ruleId);
function viewOf(setId: string, flow: EditFlow): RuleSetView {
  return {
    set: { setId, setName: "이름", description: null, status: "INUSE", rowVersion: 1, ruleIds: IDS, flow, branched: false },
    rules: RULES, checks: [], condIo: {}, editable: true, restorable: false, cases: [],
  };
}
function ok(r: EditResult): EditFlow {
  if (!r.ok) throw new Error(r.reason);
  return r.flow;
}
/** start → r1 → r2 → r3 → end. 선 e1(start→r1) e2(r1→r2) e3(r2→r3) e4(r3→end). */
const chain = () => toEditFlow(null, IDS);
/** start→r1→[분기 빈 갈래 둘]→m1→r2→r3→end. */
const splitFlow = (kind: "IF" | "PARALLEL") => ok(insertSplit(chain(), "e2", kind));

describe("Minor C — 접힌 블록을 끈 만큼 펼쳐진다", () => {
  const noop = () => {};
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  beforeEach(() => {
    installDomStorage();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });
  const props = (flow: EditFlow, over: Partial<FlowCanvasProps> = {}): FlowCanvasProps => ({
    flow, rules: {}, checks: [], mode: "edit", showVars: false, selectedId: null, selectedEdgeId: null,
    overlay: null, focusId: null, focusSeq: 0, onSelect: noop, onSelectEdge: noop, onOpenRule: noop, onMove: noop, onConnect: noop,
    onDropPalette: noop, onNoteChange: noop, breakpoints: new Set(), collapsed: new Set(), showMiniMap: false, editingCondEdgeId: null,
    onMoveNode: noop, onDropRule: noop, onContextMenu: noop, onEditCond: noop, onEditCondClose: noop, onToggleBreakpoint: noop,
    onRouteChange: noop, ...over,
  });
  const draw = async (p: FlowCanvasProps) => {
    await act(async () => {
      root.render(createElement(DmesUiProvider, null, createElement("div", { style: { width: 800, height: 600 } }, createElement(FlowCanvas, p))));
    });
    await flush();
  };
  const nodeEl = (id: string) => host.querySelector(`.react-flow__node[data-id="${id}"]`) as HTMLElement;
  const fire = (el: Element | Window, ev: Event) => act(async () => { el.dispatchEvent(ev); });
  const mouse = (type: string, x: number, y: number) => new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, view: window });
  const at = (id: string): FlowPos => {
    const m = /translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(nodeEl(id).style.transform)!;
    return { x: Math.round(Number(m[1])), y: Math.round(Number(m[2])) };
  };

  for (const kind of ["IF", "PARALLEL"] as const) {
    it(`${kind} — 접은 채 끌고 놓은 위치로 펼치면 블록 전체가 끈 거리만큼 움직였고, 접은 채 다시 그려도 놓은 자리다`, async () => {
      const f = splitFlow(kind);
      const split = kind === "IF" ? "if1" : "par1";
      const before = drawnPositions(f); // 펼친 전체 흐름의 그린 자리
      const onMove = vi.fn();
      await draw(props(f, { onMove, onMoveNode: (_n, _e, pos) => onMove(pos), collapsed: new Set([split]) }));
      const start = at(split);
      await fire(nodeEl(split), mouse("mousedown", 100, 100));
      await fire(window, mouse("mousemove", 120, 100));
      await fire(window, mouse("mousemove", 140, 130));
      const shown = at(split);
      await fire(window, mouse("mouseup", 140, 130));
      const d = { x: shown.x - start.x, y: shown.y - start.y };
      expect(d.x).not.toBe(0);
      expect(onMove).toHaveBeenCalledTimes(1);
      const g = setPositions(f, onMove.mock.calls[0][0]);
      const after = drawnPositions(g); // 펼친 흐름
      for (const id of [split, "m1"]) {
        expect({ id, x: after[id].x - before[id].x, y: after[id].y - before[id].y }).toEqual({ id, ...d });
      }
      // 접은 채 다시 그리면 놓은 자리에 있다(튀지 않는다).
      await draw(props(g, { collapsed: new Set([split]) }));
      expect(at(split)).toEqual(shown);
    });
  }
});

describe("Minor D — 선택 없는 메모 기본 자리는 그린(접힌) 위치 기준 가운데", () => {
  beforeEach(() => {
    installServer();
    localStorage.clear();
  });
  afterEach(() => {
    uninstallServer();
  });

  it("if1 을 접은 채(갈래에 룰 둘) 선택 없이 [메모] — 메모 좌상단이 그린 노드 전체 상자의 가운데다", async () => {
    // start→r1→if1[갈래1: r4→r5 | 그 외]→m1→r2→r3→end
    let f = splitFlow("IF");
    f = ok(insertRule(f, "e5", "SM_C"));
    f = ok(insertRule(f, f.edges.find((e) => e.from === "r4")!.id, "SM_B"));
    expect(f.nodes.map((n) => n.id)).toEqual(expect.arrayContaining(["r4", "r5"]));
    await openSet("SM_NOTE", viewOf("SM_NOTE", f));
    await click("flow-mode-edit");
    await act(async () => {
      byTestId("flow-node-if1").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
    });
    await flush();
    await click("flow-menu-item-collapse");
    expect(canvasNodeIds()).not.toContain("m1");
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const id of canvasNodeIds()) {
      const el = document.querySelector(`.react-flow__node[data-id="${id}"]`) as HTMLElement;
      const m = /translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(el.style.transform)!;
      const x = Number(m[1]);
      const y = Number(m[2]);
      x1 = Math.min(x1, x);
      y1 = Math.min(y1, y);
      x2 = Math.max(x2, x + parseFloat(el.style.width));
      y2 = Math.max(y2, y + parseFloat(el.style.height));
    }
    await click("flow-add-note");
    const note = document.querySelector<HTMLElement>(".react-flow__node-rsfNote")!;
    expect(q("flow-props")).not.toBeNull();
    const m = /translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(note.style.transform)!;
    expect({ x: Number(m[1]), y: Number(m[2]) }).toEqual({ x: Math.round((x1 + x2) / 2), y: Math.round((y1 + y2) / 2) });
  });
});
