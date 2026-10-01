/** @vitest-environment happy-dom */

// 그룹 통째로 옮기기 — 제목을 끌면 소속 노드가 함께 움직이고, 두 끝이 모두 옮겨진 선의 꺾는 점도 같은 만큼 옮긴다. 화살표 키도 그룹을 받는다.
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import { FlowCanvas, type FlowCanvasProps } from "../../../pages/dme/ruleSetEdit/canvas/FlowCanvas";
import { nudgeNodes } from "../../../pages/dme/ruleSetEdit/canvas/align";
import { addGroup, setPositions, setRoute, shiftRoutes, toEditFlow, type EditFlow, type EditResult, type FlowPos } from "../../../pages/dme/ruleSetEdit/flow-edit";
import { flush, installDomStorage } from "../helpers/render";

function ok(r: EditResult): EditFlow {
  if (!r.ok) throw new Error(r.reason);
  return r.flow;
}
const P = (x: number, y: number): FlowPos => ({ x, y });
/**
 * start(0,0) → r1(0,150) → r2(0,300) → r3(600,300) → end(600,450). 선 e1(start→r1) e2(r1→r2) e3(r2→r3) e4(r3→end).
 * 그룹 g1 = members. e2·e3 에 꺾는 점을 저장한다.
 */
function grouped(members: string[] = ["r1", "r2"]): EditFlow {
  const base = setPositions(toEditFlow(null, ["GM_A", "GM_B", "GM_C"]), {
    start: P(0, 0), r1: P(0, 150), r2: P(0, 300), r3: P(600, 300), end: P(600, 450),
  });
  const withRoutes = ok(setRoute(ok(setRoute(base, "e2", [P(116, 260)])), "e3", [P(400, 334)]));
  const g = addGroup(withRoutes, members, "묶음");
  if (!g.ok) throw new Error(g.reason);
  return g.flow;
}

describe("shiftRoutes", () => {
  it("두 끝이 모두 ids 에 든 선의 꺾는 점만 옮긴다. 입력은 바뀌지 않는다", () => {
    const f = grouped();
    const g = shiftRoutes(f, new Set(["r1", "r2"]), 10, -5);
    expect(g.view.routes.e2).toEqual([P(126, 255)]);
    expect(g.view.routes.e3).toEqual([P(400, 334)]); // r3 는 밖
    expect(f.view.routes.e2).toEqual([P(116, 260)]);
  });

  it("이동량이 0 이거나 옮길 선이 없으면 입력 그대로다", () => {
    const f = grouped();
    expect(shiftRoutes(f, new Set(["r1", "r2"]), 0, 0)).toBe(f);
    expect(shiftRoutes(f, new Set(["r1"]), 5, 5)).toBe(f);
  });
});

describe("nudgeNodes — 그룹", () => {
  const drawn = { start: P(0, 0), r1: P(0, 150), r2: P(0, 300), r3: P(600, 300), end: P(600, 450) };
  it("그룹 ID 를 고르면 소속 노드를 옮기고 안쪽 선의 꺾는 점도 같은 만큼 옮긴다", () => {
    const g = nudgeNodes(grouped(), ["g1"], 10, 0, drawn);
    expect(g.view.positions.r1).toEqual(P(10, 150));
    expect(g.view.positions.r2).toEqual(P(10, 300));
    expect(g.view.positions.r3).toEqual(P(600, 300));
    expect(g.view.routes.e2).toEqual([P(126, 260)]);
    expect(g.view.routes.e3).toEqual([P(400, 334)]);
  });

  it("그룹과 그 소속 노드를 함께 골라도 한 번만 옮긴다", () => {
    const g = nudgeNodes(grouped(), ["g1", "r1"], 10, 0, drawn);
    expect(g.view.positions.r1).toEqual(P(10, 150));
  });

  it("노드 여럿을 화살표로 옮겨도 그 사이 선의 꺾는 점이 따라간다", () => {
    const g = nudgeNodes(grouped(), ["r2", "r3"], 0, 10, drawn);
    expect(g.view.routes.e3).toEqual([P(400, 344)]);
    expect(g.view.routes.e2).toEqual([P(116, 260)]); // r1 은 안 움직였다
  });
});

// ───────────────────────── 캔버스 ─────────────────────────

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
async function draw(p: FlowCanvasProps) {
  await act(async () => {
    root.render(createElement(DmesUiProvider, null, createElement("div", { style: { width: 800, height: 600 } }, createElement(FlowCanvas, p))));
  });
  await flush();
}
const fire = (el: Element | Window, type: string, init: MouseEventInit = {}) =>
  act(async () => {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, view: window, ...init }));
  });
const nodeEl = (id: string) => document.querySelector(`.react-flow__node[data-id="${id}"]`) as HTMLElement;
const titleEl = (id: string) => nodeEl(id).querySelector(".rsf-group-title") as HTMLElement;
const xy = (s: string) => {
  const m = /translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(s)!;
  return { x: Number(m[1]), y: Number(m[2]) };
};
const at = (id: string) => xy(nodeEl(id).style.transform);
function viewport() {
  const t = (document.querySelector(".react-flow__viewport") as HTMLElement).style.transform;
  return { ...xy(t), k: Number(/scale\(\s*([\d.]+)\s*\)/.exec(t)?.[1] ?? 1) };
}
const screenOf = (p: FlowPos) => {
  const v = viewport();
  return { clientX: p.x * v.k + v.x, clientY: p.y * v.k + v.y };
};
/** 요소 `el` 을 흐름 좌표 `press` 에서 눌러 화면 2px 움직여 끌기를 시작하고, 흐름 거리 (fx, fy) 만큼 더 끈다. */
async function dragFrom(el: Element, press: FlowPos, fx: number, fy: number, release = true) {
  const s = screenOf(press);
  const k = viewport().k;
  await fire(el, "mousedown", s);
  const m1 = { clientX: s.clientX + 2, clientY: s.clientY };
  await fire(window, "mousemove", { ...m1, buttons: 1 });
  const m2 = { clientX: m1.clientX + fx * k, clientY: m1.clientY + fy * k };
  await fire(window, "mousemove", { ...m2, buttons: 1 });
  if (release) await fire(window, "mouseup", m2);
  return m2;
}
/** 그룹 제목의 흐름 좌표(틀 좌상단 + 제목 자리 안쪽). */
const titleAt = (id: string): FlowPos => {
  const p = at(id);
  return { x: p.x + 12, y: p.y + 8 };
};

describe("FlowCanvas 그룹 통째로 옮기기", () => {
  it("편집 모드에서 제목을 끌면 끄는 동안 소속 노드·틀이 함께 움직이고, 놓을 때 onMove 한 번(소속 노드 위치·선 옮김 정보)", async () => {
    const onMove = vi.fn();
    const onMoveNode = vi.fn();
    await draw(props({ onMove, onMoveNode }));
    const g0 = at("g1");
    const m2 = await dragFrom(titleEl("g1"), titleAt("g1"), 98, 40, false);
    // 틀이 움직인 만큼(스냅 포함) 소속 노드가 함께 움직인다. 밖의 r3 는 그대로다.
    const d = { x: at("g1").x - g0.x, y: at("g1").y - g0.y };
    expect(Math.abs(d.x - 100) <= 6 && Math.abs(d.y - 40) <= 6, JSON.stringify(d)).toBe(true);
    expect(at("r1")).toEqual({ x: d.x, y: 150 + d.y });
    expect(at("r2")).toEqual({ x: d.x, y: 300 + d.y });
    expect(at("r3")).toEqual({ x: 600, y: 300 });
    expect(onMove).not.toHaveBeenCalled();
    await fire(window, "mouseup", m2);
    expect(onMove).toHaveBeenCalledTimes(1);
    const [pos, notes, shift] = onMove.mock.calls[0];
    expect(pos).toEqual({ r1: P(d.x, 150 + d.y), r2: P(d.x, 300 + d.y) });
    expect(notes ?? {}).toEqual({});
    expect({ ids: [...shift.ids].sort(), dx: shift.dx, dy: shift.dy }).toEqual({ ids: ["r1", "r2"], dx: d.x, dy: d.y });
    expect(onMoveNode).not.toHaveBeenCalled();
  });

  it("노드 하나짜리 그룹을 선 위에 놓아도 선에 끼우지 않고 옮기기만 한다", async () => {
    const onMove = vi.fn();
    const onMoveNode = vi.fn();
    await draw(props({ flow: grouped(["r3"]), onMove, onMoveNode }));
    // 제목을 e1(start→r1) 중점 근처로 끈다 — r3 를 직접 끌었다면 끼우기 대상이 되는 자리.
    const t = titleAt("g1");
    await dragFrom(titleEl("g1"), t, 88 - t.x - 2, 93 - t.y);
    expect(onMoveNode).not.toHaveBeenCalled();
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(Object.keys(onMove.mock.calls[0][0])).toEqual(["r3"]);
  });

  it("보기 모드에서는 제목을 끌어도 옮겨지지 않는다", async () => {
    const onMove = vi.fn();
    await draw(props({ mode: "view", onMove }));
    await dragFrom(titleEl("g1"), titleAt("g1"), 98, 40);
    expect(at("r1")).toEqual({ x: 0, y: 150 });
    expect(onMove).not.toHaveBeenCalled();
  });
});
