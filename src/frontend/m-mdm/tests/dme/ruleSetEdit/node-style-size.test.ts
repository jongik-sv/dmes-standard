/** @vitest-environment happy-dom */

// 외관 옵션(S1) — 캔버스가 노드별 크기로 노드 상자·선 끝·그룹 틀을 그리고, 외관만 바뀐 흐름에도 배치가 다시 돈다(Local-Rules §19).
import { act, createElement } from "react";
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
import { addGroup, insertSplit, setNodeStyle, setPositions, toEditFlow, type EditFlow, type EditResult, type FlowPos } from "../../../pages/dme/ruleSetEdit/flow-edit";
import { autoLayout } from "../../../pages/dme/ruleSetEdit/flow-layout";
import { flush, installDomStorage } from "../helpers/render";

function ok(r: EditResult): EditFlow {
  if (!r.ok) throw new Error(r.reason);
  return r.flow;
}
const P = (x: number, y: number): FlowPos => ({ x, y });
const base = () => toEditFlow(null, ["NZ_A", "NZ_B"]);
/** start(0,0) · r1(0,150) · r2(0,300) · end(0,450) 고정. */
const pinned = (f: EditFlow) => setPositions(f, { start: P(0, 0), r1: P(0, 150), r2: P(0, 300), end: P(0, 450) });

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
    flow: base(), rules: {}, checks: [], mode: "edit", varDisplay: "off", selectedId: null, selectedEdgeId: null,
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
/** React Flow 노드 감싸개의 자리·크기. */
const box = (id: string) => {
  const el = document.querySelector(`.react-flow__node[data-id="${id}"]`) as HTMLElement;
  const m = /translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(el.style.transform)!;
  return { x: Number(m[1]), y: Number(m[2]), w: parseFloat(el.style.width), h: parseFloat(el.style.height) };
};
const ends = (edgeId: string) => {
  const d = document.querySelector(`.react-flow__edge[data-id="${edgeId}"] path.react-flow__edge-path`)!.getAttribute("d")!;
  const nums = (s: string) => s.trim().split(/[\s,]+/).map(Number);
  const first = nums(/^M\s*([-\d.]+[\s,]+[-\d.]+)/.exec(d)![1]);
  const last = nums(/L\s*([-\d.]+[\s,]+[-\d.]+)\s*$/.exec(d)![1]);
  return { from: { x: first[0], y: first[1] }, to: { x: last[0], y: last[1] } };
};

describe("캔버스 — 노드별 크기(S-D5)", () => {
  it("노드 상자와 선 끝(아래 가운데 → 위 가운데)이 외관 크기를 따른다", async () => {
    await draw(props({ flow: ok(setNodeStyle(pinned(base()), "r1", { w: 400, h: 100 })) }));
    expect(box("r1")).toEqual({ x: 0, y: 150, w: 400, h: 100 });
    expect(ends("e2").from).toEqual({ x: 200, y: 150 + 100 + 4 }); // 8px 연결점의 바깥 가장자리(4px)
    expect(box("r2")).toEqual({ x: 0, y: 300, w: 232, h: 68 });
  });

  it("그룹 틀은 노드별 크기로 잰다", async () => {
    const f = ok(addGroup(ok(setNodeStyle(pinned(base()), "r1", { w: 400, h: 100 })), ["r1"], "묶음"));
    await draw(props({ flow: f }));
    expect(box("g1")).toEqual({ x: -16, y: 134, w: 432, h: 132 });
  });

  it("접힌 분기를 담은 그룹 틀은 그린 접힌 상자(룰 크기)로 잰다(계획 Ruling 8)", async () => {
    const f = ok(addGroup(ok(insertSplit(base(), "e2", "IF")), ["if1"], "분기"));
    await draw(props({ flow: f, collapsed: new Set(["if1"]) }));
    const b = box("if1");
    expect(box("g1")).toEqual({ x: b.x - 16, y: b.y - 16, w: 232 + 32, h: 68 + 32 });
  });

  it("memo — 다른 props 는 같은 참조로 두고 외관만 바꾼 흐름을 넘겨도 새 크기로 그리고 자동 배치가 다시 돈다(Review Focus 2)", async () => {
    const p = props();
    await draw(p);
    expect(box("r1").w).toBe(232);
    const calls = layout.calls;
    const wide = ok(setNodeStyle(p.flow, "r1", { w: 640 }));
    await draw({ ...p, flow: wide });
    expect(layout.calls).toBeGreaterThan(calls);
    expect(box("r1").w).toBe(640);
    expect(box("r1").x).toBe(autoLayout(wide).r1.x);
    expect(box("r2").x).toBe(autoLayout(wide).r2.x);
  });
});
