/** @vitest-environment happy-dom */

// 외관 옵션(S1) Task 4 — 노드 크기 손잡이: 계산(dragNodeSize), 보이는 조건, 끄는 동안 캔버스 안에서만·놓을 때 한 번, 범위 자르기, 성능.
import { createElement, act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

const layout = vi.hoisted(() => ({ calls: 0 }));
vi.mock("@dagrejs/dagre", async (importOriginal) => {
  const real = await importOriginal<typeof import("@dagrejs/dagre")>();
  const inner = real.default ?? real;
  const wrapped = new Proxy(inner, {
    get: (t, k, r) => (k === "layout" ? (...a: Parameters<typeof inner.layout>) => (layout.calls++, t.layout(...a)) : Reflect.get(t, k, r)),
  });
  return { ...real, default: wrapped };
});

import { FlowCanvas, type FlowCanvasProps } from "../../../pages/dme/ruleSetEdit/canvas/FlowCanvas";
import { NODE_GRIPS, dragNodeSize } from "../../../pages/dme/ruleSetEdit/canvas/node-size";
import { insertSplit, insertTask, removeNode, setPositions, toEditFlow, type EditFlow, type EditResult, type FlowPos } from "../../../pages/dme/ruleSetEdit/flow-edit";
import { restyleNode, type SpaceBlocks } from "../../../pages/dme/ruleSetEdit/flow-layout";
import type { NodeSize } from "../../../pages/dme/ruleSetEdit/node-style";
import { flush, installDomStorage } from "../helpers/render";

function ok(r: EditResult): EditFlow {
  if (!r.ok) throw new Error(r.reason);
  return r.flow;
}
const P = (x: number, y: number): FlowPos => ({ x, y });
/** start(0,0) · r1(0,150) · r2(0,300) · end(0,450) 고정. */
const pinned = () => setPositions(toEditFlow(null, ["NG_A", "NG_B"]), { start: P(0, 0), r1: P(0, 150), r2: P(0, 300), end: P(0, 450) });

describe("dragNodeSize — 손잡이 끌기 계산", () => {
  const B: NodeSize = { w: 232, h: 68 };
  it("e 는 너비만, s 는 높이만, se 는 둘 다 — 정수로 반올림", () => {
    expect(NODE_GRIPS).toEqual(["e", "s", "se"]);
    expect(dragNodeSize(B, "e", 40.4, 30)).toEqual({ w: 272, h: 68 });
    expect(dragNodeSize(B, "s", 40, 30.6)).toEqual({ w: 232, h: 99 });
    expect(dragNodeSize(B, "se", 40, 30)).toEqual({ w: 272, h: 98 });
  });
  it("232~640 × 68~320 으로 자른다(S-D4)", () => {
    expect(dragNodeSize(B, "se", -100, -100)).toEqual({ w: 232, h: 68 });
    expect(dragNodeSize(B, "se", 1000, 1000)).toEqual({ w: 640, h: 320 });
  });
});

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  installDomStorage();
  layout.calls = 0;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
});
const noop = () => {};
function props(over: Partial<FlowCanvasProps> = {}): FlowCanvasProps {
  return {
    flow: pinned(), rules: {}, checks: [], mode: "edit", varDisplay: "off", selectedId: "r1", selectedEdgeId: null,
    overlay: null, focusId: null, focusSeq: 0, onSelect: noop, onSelectEdge: noop, onOpenRule: noop, onMove: noop, onConnect: noop,
    onDropPalette: noop, onNoteChange: noop, breakpoints: new Set(), collapsed: new Set(), showMiniMap: false, editingCondEdgeId: null,
    onMoveNode: noop, onDropRule: noop, onContextMenu: noop, onEditCond: noop, onEditCondClose: noop, onToggleBreakpoint: noop,
    onRouteChange: noop, ...over,
  };
}
const wrap = (el: ReturnType<typeof createElement>) =>
  createElement(DmesUiProvider, null, createElement("div", { style: { width: 800, height: 600 } }, el));
async function draw(p: FlowCanvasProps) {
  await act(async () => {
    root.render(wrap(createElement(FlowCanvas, p)));
  });
  await flush();
}
const q = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const grips = (id: string) => [...document.querySelectorAll(`[data-testid^="flow-node-grip-${id}-"]`)].map((e) => e.getAttribute("data-grip"));
const box = (id: string) => {
  const el = document.querySelector(`.react-flow__node[data-id="${id}"]`) as HTMLElement;
  const m = /translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(el.style.transform)!;
  return { x: Number(m[1]), y: Number(m[2]), w: parseFloat(el.style.width), h: parseFloat(el.style.height) };
};
const fire = async (el: Element | Window, type: string, init: MouseEventInit = {}) =>
  act(async () => { el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init })); });
async function dragGrip(testId: string, dx: number, dy: number, release = true) {
  await fire(q(testId)!, "pointerdown", { clientX: 0, clientY: 0, button: 0 });
  await fire(window, "pointermove", { clientX: dx / 2, clientY: dy / 2, buttons: 1 });
  await fire(window, "pointermove", { clientX: dx, clientY: dy, buttons: 1 });
  if (release) await fire(window, "pointerup", { clientX: dx, clientY: dy });
}

describe("FlowCanvas 노드 크기 손잡이(S-D4)", () => {
  it("편집 모드에서 고른 RULE·TASK 에만 e·s·se 손잡이가 뜬다(누름을 받는 표시 nodrag nopan)", async () => {
    await draw(props());
    expect(grips("r1")).toEqual(["e", "s", "se"]);
    const cl = q("flow-node-grip-r1-se")!.classList;
    expect(cl.contains("nodrag") && cl.contains("nopan")).toBe(true);
    expect(grips("r2")).toEqual([]);
    await draw(props({ mode: "view" }));
    expect(grips("r1")).toEqual([]);
    await draw(props({ mode: "debug" }));
    expect(grips("r1")).toEqual([]);
    await draw(props({ selectedId: "start" }));
    expect(grips("start")).toEqual([]);
    let f = ok(insertTask(pinned(), "e2"));
    const task = f.edges.find((e) => e.id === "e2")!.to;
    await draw(props({ flow: f, selectedId: task }));
    expect(grips(task)).toEqual(["e", "s", "se"]);
    f = ok(insertSplit(pinned(), "e2", "IF"));
    await draw(props({ flow: f, selectedId: "if1" }));
    expect(grips("if1")).toEqual([]);
    await draw(props({ flow: f, selectedId: "if1", collapsed: new Set(["if1"]) }));
    expect(grips("if1")).toEqual([]); // 접힌 상자도 없다
  });

  it("memo — 다른 props 는 같은 참조로 두고 selectedId 만, mode 만 바꿔도 따라 바뀐다(Local-Rules §19)", async () => {
    const p = props({ selectedId: null });
    await draw(p);
    expect(grips("r1")).toEqual([]);
    const sel = { ...p, selectedId: "r1" };
    await draw(sel);
    expect(grips("r1")).toHaveLength(3);
    await draw({ ...sel, mode: "view" });
    expect(grips("r1")).toHaveLength(0);
  });

  it("se 를 끌면 끄는 동안 캔버스 안에서만 커지고(왼쪽 위 고정) 놓을 때 한 번 올린다 — 그린 위치 전부를 함께", async () => {
    const onNodeSizeChange = vi.fn();
    await draw(props({ onNodeSizeChange }));
    await dragGrip("flow-node-grip-r1-se", 100, 50, false);
    expect(box("r1")).toEqual({ x: 0, y: 150, w: 332, h: 118 });
    expect(onNodeSizeChange).not.toHaveBeenCalled();
    await fire(window, "pointerup", { clientX: 100, clientY: 50 });
    expect(onNodeSizeChange).toHaveBeenCalledTimes(1);
    const [id, size, drawn, blocks] = onNodeSizeChange.mock.calls[0] as [string, NodeSize, Record<string, FlowPos>, SpaceBlocks];
    expect([id, size]).toEqual(["r1", { w: 332, h: 118 }]);
    expect(Object.keys(drawn).sort()).toEqual(["end", "r1", "r2", "start"]);
    expect(blocks).toEqual({});
  });

  it("e·s 손잡이는 한 축만 바꾼다", async () => {
    const onNodeSizeChange = vi.fn();
    await draw(props({ onNodeSizeChange }));
    await dragGrip("flow-node-grip-r1-e", 60, 40);
    await dragGrip("flow-node-grip-r1-s", 60, 40);
    expect(onNodeSizeChange.mock.calls.map((c) => c[1])).toEqual([{ w: 292, h: 68 }, { w: 232, h: 108 }]);
  });

  it("범위 밖으로 끌면 자르고, 안쪽으로 끌어 바뀐 것이 없으면 올리지 않는다", async () => {
    const onNodeSizeChange = vi.fn();
    await draw(props({ onNodeSizeChange }));
    await dragGrip("flow-node-grip-r1-se", -50, -50);
    expect(onNodeSizeChange).not.toHaveBeenCalled();
    expect(box("r1").w).toBe(232);
    await dragGrip("flow-node-grip-r1-se", 2000, 2000, false);
    expect(box("r1")).toMatchObject({ w: 640, h: 320 });
  });

  it("pointercancel·단추 뗀 움직임이면 올리지 않고 제 크기로 돌아간다", async () => {
    const onNodeSizeChange = vi.fn();
    await draw(props({ onNodeSizeChange }));
    await dragGrip("flow-node-grip-r1-e", 80, 0, false);
    await fire(window, "pointercancel", {});
    expect(box("r1").w).toBe(232);
    await dragGrip("flow-node-grip-r1-e", 80, 0, false);
    await fire(window, "pointermove", { clientX: 90, clientY: 0, buttons: 0 });
    await fire(window, "pointerup", { clientX: 90, clientY: 0 });
    expect(box("r1").w).toBe(232);
    expect(onNodeSizeChange).not.toHaveBeenCalled();
  });

  it("줌 배율 — 화면 거리를 배율로 나눈 흐름 거리만큼 커진다", async () => {
    const onNodeSizeChange = vi.fn();
    await draw(props({ onNodeSizeChange }));
    const vp = document.querySelector(".react-flow__viewport") as HTMLElement;
    const k = (el: HTMLElement) => Number(/scale\(\s*([\d.]+)\s*\)/.exec(el.style.transform)?.[1] ?? 1);
    // 확대 단추로 배율을 올린다(happy-dom 에서 휠은 줌을 일으키지 않는다).
    const zoomIn = document.querySelector(".react-flow__controls-zoomin") as HTMLElement;
    for (let i = 0; i < 3; i++) {
      await fire(zoomIn, "click");
      await flush();
    }
    const z = k(vp);
    expect(z).toBeGreaterThan(1.2);
    await dragGrip("flow-node-grip-r1-e", 100, 0);
    expect(onNodeSizeChange).toHaveBeenCalledTimes(1);
    expect(onNodeSizeChange.mock.calls[0][1]).toEqual({ w: 232 + Math.round(100 / z), h: 68 });
  });

  it("끄는 중 노드가 흐름에서 사라지면 놓아도 올리지 않는다", async () => {
    const onNodeSizeChange = vi.fn();
    await draw(props({ onNodeSizeChange }));
    await dragGrip("flow-node-grip-r1-e", 100, 0, false);
    await draw(props({ onNodeSizeChange, flow: ok(removeNode(pinned(), "r1")), selectedId: null }));
    await fire(window, "pointerup", { clientX: 100, clientY: 0 });
    expect(onNodeSizeChange).not.toHaveBeenCalled();
  });

  it("CSS — 손잡이는 잇기 손잡이 자리(변 가운데)를 비켜 75% 자리, 크기 커서", async () => {
    const { NODE_STYLE_CSS } = await import("../../../pages/dme/ruleSetEdit/styles/node-style");
    const css = NODE_STYLE_CSS.replace(/\s+/g, " ");
    expect(css).toMatch(/\.rsf-node-grip \{[^}]*pointer-events: auto/);
    expect(css).toMatch(/\.rsf-node-grip\[data-grip="e"\] \{[^}]*top: calc\(75% - 5px\)[^}]*cursor: ew-resize/);
    expect(css).toMatch(/\.rsf-node-grip\[data-grip="s"\] \{[^}]*left: calc\(75% - 5px\)[^}]*cursor: ns-resize/);
    expect(css).toMatch(/\.rsf-node-grip\[data-grip="se"\] \{[^}]*cursor: nwse-resize/);
  });
});

describe("성능 — 끄는 동안 page 를 다시 그리지 않고 dagre 도 다시 돌지 않는다(Local-Rules §16)", () => {
  const renders = { host: 0 };
  function Host({ initial }: { initial: EditFlow }) {
    renders.host++;
    const [flow, setFlow] = useState(initial);
    const [, bump] = useState(0);
    const touch = () => bump((n) => n + 1);
    return createElement(FlowCanvas, props({
      flow, onSelect: touch, onSelectEdge: touch, onMove: touch, onContextMenu: touch, onRouteChange: touch,
      onNodeSizeChange: (id, size, drawn, blocks) => setFlow((f) => ok(restyleNode(f, id, { w: size.w, h: size.h }, drawn, blocks))),
    }));
  }

  it("끄는 동안 Host 다시 그리기·dagre 호출이 늘지 않고, 놓으면 한 번 다시 그려 새 크기가 정본 — 이웃 자리는 그대로", async () => {
    renders.host = 0;
    await act(async () => {
      root.render(wrap(createElement(Host, { initial: toEditFlow(null, ["NG_A", "NG_B"]) })));
    });
    await flush();
    const r2 = box("r2");
    const hostStart = renders.host;
    const layoutStart = layout.calls;
    await dragGrip("flow-node-grip-r1-se", 100, 50, false);
    expect(renders.host).toBe(hostStart);
    expect(layout.calls).toBe(layoutStart);
    await fire(window, "pointerup", { clientX: 100, clientY: 50 });
    await flush();
    expect(renders.host).toBe(hostStart + 1);
    expect(box("r1")).toMatchObject({ w: 332, h: 118 });
    expect(box("r2")).toEqual(r2); // 그린 위치를 모두 고정해 이웃이 밀리지 않는다(S-D6)
  });
});
