/** @vitest-environment happy-dom */

// 4단계 G2 — 그룹 크기: FlowGroup.pad 코덱·연산, 손잡이 끌기 계산, 캔버스 손잡이·끌기·성능·memo.
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
import { GROUP_GRIPS, dragGroupPad } from "../../../pages/dme/ruleSetEdit/canvas/group-size";
import {
  MAX_GROUP_PAD, addGroup, flowJsonOf, removeNode, setGroupPad, setPositions, toEditFlow, updateGroup,
  type EditFlow, type EditResult, type FlowPos, type GroupPad,
} from "../../../pages/dme/ruleSetEdit/flow-edit";
import { RSF_CSS } from "../../../pages/dme/ruleSetEdit/rsf-styles";
import { flush, installDomStorage } from "../helpers/render";

function ok(r: EditResult): EditFlow {
  if (!r.ok) throw new Error(r.reason);
  return r.flow;
}
const P = (x: number, y: number): FlowPos => ({ x, y });
const PAD: GroupPad = { l: 10, t: 20, r: 30, b: 40 };
/** r1(0,0)·r2(0,200) 를 담은 그룹 g1 "묶음" — 기본 틀 (-16,-16) 264×300. start·r1·r2·end, 선 e1~e3. */
function grouped(pad?: GroupPad): EditFlow {
  const base = setPositions(toEditFlow(null, ["R_A", "R_B"]), { r1: P(0, 0), r2: P(0, 200) });
  const g = addGroup(base, ["r1", "r2"], "묶음");
  if (!g.ok) throw new Error(g.reason);
  return pad ? ok(setGroupPad(g.flow, "g1", pad)) : g.flow;
}

describe("FlowGroup.pad 코덱", () => {
  it("sanitizeView — pad 를 0~2000 정수로 자르고 유한하지 않은 칸은 0, 모두 0 이거나 객체가 아니면 키를 두지 않는다", () => {
    const base = grouped();
    const raw = {
      ...base,
      view: {
        ...base.view,
        groups: [
          { id: "g1", title: "묶음", nodeIds: ["r1"], pad: { l: -5, t: 2500, r: 1.6, b: "x" } },
          { id: "g2", title: "둘", nodeIds: ["r2"], pad: { l: 0, t: 0, r: 0, b: 0 } },
          { id: "g3", title: "셋", nodeIds: ["r2"], pad: "x" },
        ],
      },
    };
    const f = toEditFlow(raw as never, []);
    expect(f.view.groups[0].pad).toEqual({ l: 0, t: MAX_GROUP_PAD, r: 2, b: 0 });
    expect("pad" in f.view.groups[1]).toBe(false);
    expect("pad" in f.view.groups[2]).toBe(false);
  });

  it("flowJsonOf — pad 는 그룹의 마지막 키(l·t·r·b 순서)이고, pad 없는 그룹의 저장 글자는 예전과 같다(dirty 기준 불변)", () => {
    expect(flowJsonOf(grouped())).toContain('"groups":[{"id":"g1","title":"묶음","nodeIds":["r1","r2"]}]');
    expect(flowJsonOf(grouped(PAD))).toContain('"groups":[{"id":"g1","title":"묶음","nodeIds":["r1","r2"],"pad":{"l":10,"t":20,"r":30,"b":40}}]');
  });

  it("왕복 — flowJsonOf → toEditFlow → flowJsonOf 가 같다", () => {
    const s = flowJsonOf(grouped(PAD));
    expect(flowJsonOf(toEditFlow(JSON.parse(s), []))).toBe(s);
  });
});

describe("setGroupPad·그룹 연산", () => {
  it("pad 를 두고 0~2000 정수로 자른다. 입력은 바뀌지 않는다", () => {
    const f = grouped();
    const before = flowJsonOf(f);
    expect(ok(setGroupPad(f, "g1", PAD)).view.groups[0].pad).toEqual(PAD);
    expect(ok(setGroupPad(f, "g1", { l: -1, t: 3000, r: 2.4, b: 7.5 })).view.groups[0].pad).toEqual({ l: 0, t: 2000, r: 2, b: 8 });
    expect(flowJsonOf(f)).toBe(before);
  });

  it("null 이나 모두 0 이면 pad 키를 지운다", () => {
    expect("pad" in ok(setGroupPad(grouped(PAD), "g1", null)).view.groups[0]).toBe(false);
    expect("pad" in ok(setGroupPad(grouped(PAD), "g1", { l: 0, t: 0, r: 0, b: 0 })).view.groups[0]).toBe(false);
  });

  it("없는 그룹·유한하지 않은 값은 거부한다", () => {
    expect(setGroupPad(grouped(), "zz", PAD)).toEqual({ ok: false, reason: "그룹 zz를 찾지 못했다" });
    expect(setGroupPad(grouped(), "g1", { ...PAD, r: Number.NaN })).toEqual({ ok: false, reason: "그룹 크기가 올바르지 않다" });
  });

  it("updateGroup(제목·구성 노드)과 노드 지우기는 pad 를 남긴다 — 속성 패널로 고쳐도 크기가 사라지지 않는다", () => {
    expect(updateGroup(grouped(PAD), "g1", { title: "새 이름" }).view.groups[0].pad).toEqual(PAD);
    expect(updateGroup(grouped(PAD), "g1", { nodeIds: ["r1"] }).view.groups[0].pad).toEqual(PAD);
    expect(ok(removeNode(grouped(PAD), "r1")).view.groups[0]).toEqual({ id: "g1", title: "묶음", nodeIds: ["r2"], pad: PAD });
  });
});

describe("dragGroupPad — 손잡이 끌기 계산", () => {
  const base: GroupPad = { l: 10, t: 10, r: 10, b: 10 };
  it("모서리는 두 변, 변은 한 변만 바꾼다. 왼·위 변은 바깥(음수)으로 끌면 커진다", () => {
    expect(GROUP_GRIPS).toEqual(["nw", "n", "ne", "e", "se", "s", "sw", "w"]);
    expect(dragGroupPad(base, "se", 40, 30)).toEqual({ l: 10, t: 10, r: 50, b: 40 });
    expect(dragGroupPad(base, "nw", -5, -10)).toEqual({ l: 15, t: 20, r: 10, b: 10 });
    expect(dragGroupPad(base, "ne", 5, -5)).toEqual({ l: 10, t: 15, r: 15, b: 10 });
    expect(dragGroupPad(base, "sw", -5, 5)).toEqual({ l: 15, t: 10, r: 10, b: 15 });
    expect(dragGroupPad(base, "n", 99, -5)).toEqual({ l: 10, t: 15, r: 10, b: 10 });
    expect(dragGroupPad(base, "e", 5, 99)).toEqual({ l: 10, t: 10, r: 15, b: 10 });
    expect(dragGroupPad(base, "s", 99, 5)).toEqual({ l: 10, t: 10, r: 10, b: 15 });
    expect(dragGroupPad(base, "w", -5, 99)).toEqual({ l: 15, t: 10, r: 10, b: 10 });
  });

  it("소속 노드보다 작게는 줄지 않고(0), 2000 을 넘지 않으며, 정수로 반올림한다", () => {
    expect(dragGroupPad(base, "se", -50, -50)).toEqual({ l: 10, t: 10, r: 0, b: 0 });
    expect(dragGroupPad(base, "e", 5000, 0).r).toBe(MAX_GROUP_PAD);
    expect(dragGroupPad(base, "e", 1.6, 0).r).toBe(12);
  });
});

// ───────────────────────── 캔버스 ─────────────────────────

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
    flow: grouped(), rules: {}, checks: [], mode: "edit", varDisplay: "off", selectedId: null, selectedEdgeId: null,
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
const grips = (id: string) => document.querySelectorAll(`[data-testid^="flow-group-grip-${id}-"]`);
/** 그룹 틀(React Flow 노드 감싸개)의 자리·크기. */
const box = (id: string) => {
  const el = document.querySelector(`.react-flow__node[data-id="${id}"]`) as HTMLElement;
  const m = /translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(el.style.transform)!;
  return { x: Number(m[1]), y: Number(m[2]), w: parseFloat(el.style.width), h: parseFloat(el.style.height) };
};
const fire = async (el: Element | Window, type: string, init: MouseEventInit = {}) =>
  act(async () => { el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init })); });
async function dragGrip(testId: string, from: FlowPos, to: FlowPos, release = true) {
  await fire(q(testId)!, "pointerdown", { clientX: from.x, clientY: from.y, button: 0 });
  await fire(window, "pointermove", { clientX: (from.x + to.x) / 2, clientY: (from.y + to.y) / 2, buttons: 1 });
  await fire(window, "pointermove", { clientX: to.x, clientY: to.y, buttons: 1 });
  if (release) await fire(window, "pointerup", { clientX: to.x, clientY: to.y });
}

describe("FlowCanvas 그룹 크기", () => {
  it("저장된 pad 만큼 틀을 넓혀 그린다 — 보기·디버그 모드도", async () => {
    await draw(props());
    expect(box("g1")).toEqual({ x: -16, y: -16, w: 264, h: 300 });
    for (const mode of ["edit", "view", "debug"] as const) {
      await draw(props({ flow: grouped(PAD), mode }));
      expect(box("g1"), mode).toEqual({ x: -26, y: -36, w: 304, h: 360 });
    }
  });

  it("소속 노드를 옮기면 틀이 따라간다(여백으로 저장하므로 크기는 그대로)", async () => {
    await draw(props({ flow: setPositions(grouped(PAD), { r1: P(100, 50), r2: P(100, 250) }) }));
    expect(box("g1")).toEqual({ x: 74, y: 14, w: 304, h: 360 });
  });

  it("편집 모드에서 고른 그룹에만 네 모서리·네 변 손잡이가 뜬다(누름을 받는 표시 nodrag nopan)", async () => {
    await draw(props({ selectedId: "g1" }));
    expect([...grips("g1")].map((el) => el.getAttribute("data-grip"))).toEqual(["nw", "n", "ne", "e", "se", "s", "sw", "w"]);
    const cl = q("flow-group-grip-g1-se")!.classList;
    expect(cl.contains("nodrag") && cl.contains("nopan")).toBe(true);
    await draw(props());
    expect(grips("g1")).toHaveLength(0);
  });

  it("memo — 다른 props 는 같은 참조로 두고 selectedId 만, mode 만, flow 만 바꿔도 따라 바뀐다(Local-Rules §19)", async () => {
    const p = props();
    await draw(p);
    expect(grips("g1")).toHaveLength(0);
    const sel = { ...p, selectedId: "g1" };
    await draw(sel);
    expect(grips("g1")).toHaveLength(8);
    const padded = { ...sel, flow: grouped(PAD) };
    await draw(padded); // flow 만
    expect(box("g1").w).toBe(304);
    expect(grips("g1")).toHaveLength(8);
    await draw({ ...padded, mode: "view" }); // mode 만
    expect(grips("g1")).toHaveLength(0);
    expect(box("g1").w).toBe(304);
  });

  it("오른쪽 아래 손잡이를 끌면 끄는 동안 캔버스 안에서만 커지고, 놓을 때 한 번 올린다", async () => {
    const onGroupPadChange = vi.fn();
    await draw(props({ selectedId: "g1", onGroupPadChange }));
    await dragGrip("flow-group-grip-g1-se", P(248, 284), P(288, 314), false);
    expect(box("g1")).toEqual({ x: -16, y: -16, w: 304, h: 330 });
    expect(onGroupPadChange).not.toHaveBeenCalled();
    await fire(window, "pointerup", { clientX: 288, clientY: 314 });
    expect(onGroupPadChange).toHaveBeenCalledTimes(1);
    expect(onGroupPadChange).toHaveBeenCalledWith("g1", { l: 0, t: 0, r: 40, b: 30 });
  });

  it("왼쪽 위 손잡이는 저장된 pad 에 더해 바깥으로 넓힌다", async () => {
    const onGroupPadChange = vi.fn();
    await draw(props({ flow: grouped(PAD), selectedId: "g1", onGroupPadChange }));
    await dragGrip("flow-group-grip-g1-nw", P(-26, -36), P(-31, -46));
    expect(onGroupPadChange).toHaveBeenCalledWith("g1", { l: 15, t: 30, r: 30, b: 40 });
  });

  it("안쪽으로 끌어도 소속 노드보다 작아지지 않고, 바뀐 것이 없으면 올리지 않는다", async () => {
    const onGroupPadChange = vi.fn();
    await draw(props({ selectedId: "g1", onGroupPadChange }));
    await dragGrip("flow-group-grip-g1-nw", P(-16, -16), P(34, 34), false);
    expect(box("g1")).toEqual({ x: -16, y: -16, w: 264, h: 300 });
    await fire(window, "pointerup", { clientX: 34, clientY: 34 });
    expect(onGroupPadChange).not.toHaveBeenCalled();
  });

  it("pointercancel·단추 뗀 움직임이면 올리지 않고 제 크기로 돌아간다", async () => {
    const onGroupPadChange = vi.fn();
    await draw(props({ selectedId: "g1", onGroupPadChange }));
    await dragGrip("flow-group-grip-g1-e", P(248, 134), P(300, 134), false);
    await fire(window, "pointercancel", {});
    expect(box("g1").w).toBe(264);
    await dragGrip("flow-group-grip-g1-e", P(248, 134), P(300, 134), false);
    await fire(window, "pointermove", { clientX: 320, clientY: 134, buttons: 0 });
    await fire(window, "pointerup", { clientX: 320, clientY: 134 });
    expect(box("g1").w).toBe(264);
    expect(onGroupPadChange).not.toHaveBeenCalled();
  });

  it("CSS — 손잡이만 누름을 받고(틀은 pointer-events: none), 모서리·변마다 크기 커서를 쓴다", () => {
    const css = RSF_CSS.replace(/\s+/g, " ");
    expect(css).toMatch(/\.rsf-group-grip \{[^}]*pointer-events: auto/);
    expect(css).toMatch(/\.rsf-group-grip\[data-grip="se"\] \{[^}]*cursor: nwse-resize/);
    expect(css).toMatch(/\.rsf-group-grip\[data-grip="e"\] \{[^}]*cursor: ew-resize/);
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
      flow, selectedId: "g1", onSelect: touch, onSelectEdge: touch, onMove: touch, onContextMenu: touch, onRouteChange: touch,
      onGroupPadChange: (id: string, pad: GroupPad) => setFlow((f) => ok(setGroupPad(f, id, pad))),
    }));
  }

  it("손잡이를 끄는 동안 Host 다시 그리기·dagre 호출이 늘지 않고, 놓으면 Host 가 한 번 다시 그려 새 크기가 정본이 된다", async () => {
    renders.host = 0;
    await act(async () => {
      root.render(wrap(createElement(Host, { initial: grouped() })));
    });
    await flush();
    const hostStart = renders.host;
    const layoutStart = layout.calls;
    await dragGrip("flow-group-grip-g1-se", P(248, 284), P(288, 314), false);
    expect(renders.host).toBe(hostStart);
    expect(layout.calls).toBe(layoutStart);
    await fire(window, "pointerup", { clientX: 288, clientY: 314 });
    await flush();
    expect(renders.host).toBe(hostStart + 1);
    expect(box("g1")).toEqual({ x: -16, y: -16, w: 304, h: 330 });
  });
});
