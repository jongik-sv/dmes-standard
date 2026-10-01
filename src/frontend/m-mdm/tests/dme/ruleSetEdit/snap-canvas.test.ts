/** @vitest-environment happy-dom */

// 추가 Task G1 — 흐름 캔버스에서 노드·메모를 끌 때 맞춤 안내선·스냅. 진짜 React Flow 끌기(d3-drag: mousedown → window mousemove → mouseup)로 본다.
import { createElement, act } from "react";
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
import { addNote, insertSplit, setNodeStyle, setPositions, toEditFlow, type EditFlow, type FlowPos } from "../../../pages/dme/ruleSetEdit/flow-edit";
import { NODE_SIZE, drawnPositions, foldOffsetX, clearLayoutCache } from "../../../pages/dme/ruleSetEdit/flow-layout";
import { RSF_CSS } from "../../../pages/dme/ruleSetEdit/rsf-styles";
import { flush, installDomStorage } from "../helpers/render";

const noop = () => {};
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  installDomStorage();
  layout.calls = 0;
  clearLayoutCache(); // 앞 테스트가 같은 흐름을 배치해 둔 캐시에 맞으면 dagre 를 부르지 않는다
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
});

/**
 * start(0,0) → r1(0,150) → r2(0,300) → r3(600,300) → end(600,450). 선 e1(start→r1) e2(r1→r2) e3(r2→r3) e4(r3→end).
 * r3 는 r2 와 위가 같고 자기 선(e3·e4) 밖의 선(e1·e2)과 멀다 — r3 를 끌 때 끼우기 강조가 뜨지 않는다.
 */
function chainFlow(over: Record<string, FlowPos> = {}): EditFlow {
  return setPositions(toEditFlow(null, ["SC_A", "SC_B", "SC_C"]), {
    start: { x: 0, y: 0 }, r1: { x: 0, y: 150 }, r2: { x: 0, y: 300 }, r3: { x: 600, y: 300 }, end: { x: 600, y: 450 }, ...over,
  });
}
function props(over: Partial<FlowCanvasProps> = {}): FlowCanvasProps {
  return {
    flow: chainFlow(), rules: {}, checks: [], mode: "edit", varDisplay: "off", selectedId: null, selectedEdgeId: null,
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

const fire = (el: Element | Window | Document, type: string, init: MouseEventInit = {}) =>
  act(async () => {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, view: window, ...init }));
  });
const nodeEl = (id: string) => document.querySelector(`.react-flow__node[data-id="${id}"]`) as HTMLElement;
const xy = (s: string) => {
  const m = /translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(s)!;
  return { x: Number(m[1]), y: Number(m[2]) };
};
/** 그린 노드 좌상단(흐름 좌표). */
const at = (id: string): FlowPos => {
  const p = xy(nodeEl(id).style.transform);
  return { x: Math.round(p.x * 1000) / 1000, y: Math.round(p.y * 1000) / 1000 };
};
function viewport() {
  const t = (document.querySelector(".react-flow__viewport") as HTMLElement).style.transform;
  const p = xy(t);
  const k = Number(/scale\(\s*([\d.]+)\s*\)/.exec(t)?.[1] ?? 1);
  return { tx: p.x, ty: p.y, k };
}
const screenOf = (p: FlowPos) => {
  const v = viewport();
  return { clientX: p.x * v.k + v.tx, clientY: p.y * v.k + v.ty };
};
const guides = () => Array.from(document.querySelectorAll('[data-testid="flow-snap-guide"]')) as HTMLElement[];

/**
 * 노드 `id` 의 흐름 좌표 `press` 를 누르고 화면 2px 움직여 끌기를 시작한 뒤(React Flow 는 이 움직임에서 끌기만 시작한다),
 * 흐름 거리 (fx, fy) 만큼 더 끈다 — 노드는 (fx, fy) 만큼 움직인다. `release` 면 놓는다. 끝 화면 좌표를 돌려준다.
 */
async function dragNode(id: string, press: FlowPos, fx: number, fy: number, mods: MouseEventInit = {}, release = true) {
  const s = screenOf(press);
  const k = viewport().k;
  await fire(nodeEl(id), "mousedown", { ...s, ...mods });
  const m1 = { clientX: s.clientX + 2, clientY: s.clientY };
  await fire(window, "mousemove", { ...m1, buttons: 1, ...mods });
  const m2 = { clientX: m1.clientX + fx * k, clientY: m1.clientY + fy * k };
  await fire(window, "mousemove", { ...m2, buttons: 1, ...mods });
  if (release) await fire(window, "mouseup", { ...m2, ...mods });
  return m2;
}
const center = (id: string, kind: keyof typeof NODE_SIZE): FlowPos => {
  const p = at(id);
  return { x: p.x + NODE_SIZE[kind].w / 2, y: p.y + NODE_SIZE[kind].h / 2 };
};

describe("끌 때 맞춤 안내선·스냅(G1)", () => {
  it("다른 노드의 위와 6px 안이면 붙고 안내선을 보인다 — 끄는 동안 page 콜백·dagre 없음, 놓으면 붙은 자리로 onMove 한 번·안내선 사라짐", async () => {
    const cb = { onMove: vi.fn(), onMoveNode: vi.fn(), onNoteChange: vi.fn(), onSelect: vi.fn(), onSelectEdge: vi.fn(), onContextMenu: vi.fn(), onSelectionChange: vi.fn() };
    await draw(props(cb));
    const start = layout.calls;
    expect(start).toBeGreaterThan(0);
    expect(at("r3")).toEqual({ x: 600, y: 300 });
    const selBefore = cb.onSelectionChange.mock.calls.length;
    const m2 = await dragNode("r3", center("r3", "RULE"), 300, 3, {}, false);
    // 끌기 위치(900, 303) → r2 의 위·가운데·아래(300·334·368)와 모두 3 차이 → 위(300)에 붙는다. x 는 멀어 그대로.
    expect(at("r3")).toEqual({ x: 900, y: 300 });
    const g = guides();
    expect(g).toHaveLength(1);
    expect(g[0].getAttribute("data-axis")).toBe("y");
    expect(g[0].getAttribute("data-at")).toBe("300");
    // 길이는 맞은 노드(r2, 0..232)와 끄는 노드(900..1132)를 잇는 만큼, 굵기는 화면 1px(= 1/배율).
    expect(parseFloat(g[0].style.left)).toBe(0);
    expect(parseFloat(g[0].style.width)).toBe(1132);
    expect(parseFloat(g[0].style.borderTopWidth)).toBeCloseTo(1 / viewport().k, 5);
    // 끄는 동안 — 배치 재계산·page 콜백 없음(선택 변경은 끌기 시작의 한 번뿐 — React Flow 가 끄는 노드를 고른다).
    expect(layout.calls).toBe(start);
    for (const f of [cb.onMove, cb.onMoveNode, cb.onNoteChange, cb.onSelect, cb.onSelectEdge, cb.onContextMenu]) expect(f).not.toHaveBeenCalled();
    expect(cb.onSelectionChange.mock.calls.length - selBefore).toBeLessThanOrEqual(1);
    await fire(window, "mouseup", m2);
    expect(guides()).toHaveLength(0);
    // 놓는 순간 React Flow 가 주는 마지막 위치(붙이기 전 303)로 튀지 않는다 — page 가 새 흐름을 내려줄 때까지 붙은 자리에 둔다.
    expect(at("r3")).toEqual({ x: 900, y: 300 });
    expect(cb.onMove).toHaveBeenCalledTimes(1);
    expect(cb.onMove.mock.calls[0][0]).toEqual({ r3: { x: 900, y: 300 } });
    expect(cb.onMove.mock.calls[0][1]).toBeUndefined();
    expect(cb.onMoveNode).not.toHaveBeenCalled();
    expect(layout.calls).toBe(start);
  });

  it("Alt(⌥)를 누른 채 끌면 붙지 않고 안내선도 없다 — 누른 때가 아니라 끄는 프레임의 altKey 로 본다", async () => {
    const onMove = vi.fn();
    await draw(props({ onMove }));
    await dragNode("r3", center("r3", "RULE"), 300, 3, { altKey: true });
    expect(guides()).toHaveLength(0);
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove.mock.calls[0][0]).toEqual({ r3: { x: 900, y: 303 } });

    // Alt 없이 눌러 끌기를 시작하고 움직이는 프레임에서만 Alt — 그 프레임은 붙지 않는다.
    onMove.mockClear();
    await draw(props({ onMove, flow: chainFlow() }));
    const s = screenOf(center("r3", "RULE"));
    await fire(nodeEl("r3"), "mousedown", s);
    await fire(window, "mousemove", { clientX: s.clientX + 2, clientY: s.clientY, buttons: 1 });
    const m2 = { clientX: s.clientX + 2 + 300 * viewport().k, clientY: s.clientY + 3 * viewport().k };
    await fire(window, "mousemove", { ...m2, buttons: 1, altKey: true });
    expect(guides()).toHaveLength(0);
    expect(at("r3")).toEqual({ x: 900, y: 303 });
    await fire(window, "mouseup", { ...m2, altKey: true });
    expect(onMove.mock.calls[0][0]).toEqual({ r3: { x: 900, y: 303 } });
  });

  it("끼우기 대상 선이 강조된 동안은 붙이지 않고 안내선이 없다 — 놓으면 끼우기(onMoveNode)가 이긴다", async () => {
    const onMove = vi.fn();
    const onMoveNode = vi.fn();
    await draw(props({ onMove, onMoveNode }));
    // r3 를 (2, 59) 로 — 왼쪽 2 는 start·r1·r2 의 왼쪽 0 과 2 차이(강조가 없으면 붙는다). 누른 자리(가운데)는 e1(start→r1) 위.
    await dragNode("r3", center("r3", "RULE"), -598, -241, {}, false);
    expect(document.querySelector('[data-testid="flow-edge-drop-e1"]')).not.toBeNull();
    expect(guides()).toHaveLength(0);
    expect(at("r3")).toEqual({ x: 2, y: 59 });
    await fire(window, "mouseup", screenOf({ x: 118 + 2 / viewport().k, y: 93 }));
    expect(onMoveNode).toHaveBeenCalledTimes(1);
    expect(onMoveNode.mock.calls[0][0]).toBe("r3");
    expect(onMoveNode.mock.calls[0][1]).toBe("e1");
    expect(onMoveNode.mock.calls[0][2]).toEqual({ r3: { x: 2, y: 59 } });
    expect(onMove).not.toHaveBeenCalled();
    expect(guides()).toHaveLength(0);
  });

  it("메모도 끌면 다른 노드에 붙는다 — onMove({}, {메모}) 한 번", async () => {
    const { flow, id: noteId } = addNote(chainFlow(), { x: 300, y: 700 }, null);
    const onMove = vi.fn();
    const onNoteChange = vi.fn();
    await draw(props({ flow, onMove, onNoteChange }));
    // 메모 왼쪽 300 → 602: r3·end 의 왼쪽 600 과 2 차이.
    await dragNode(noteId, { x: 380, y: 740 }, 302, 0, {}, false);
    expect(at(noteId)).toEqual({ x: 600, y: 700 });
    const g = guides();
    expect(g.map((e) => [e.getAttribute("data-axis"), e.getAttribute("data-at")])).toEqual([["x", "600"]]);
    // 같은 왼쪽(600)인 r3(300..368)·end(450..486) 가운데 메모(700..780)와 가까운 end 와 잇는다.
    expect(parseFloat(g[0].style.top)).toBe(450);
    expect(parseFloat(g[0].style.height)).toBe(330);
    await fire(window, "mouseup", screenOf({ x: 682, y: 740 }));
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove.mock.calls[0]).toEqual([{}, { [noteId]: { x: 600, y: 700 } }]);
    expect(onNoteChange).not.toHaveBeenCalled();
  });

  it("여러 개를 끌면 묶음 경계 상자로 붙고 모두 같은 만큼 움직인다 — onMove 한 번", async () => {
    const onMove = vi.fn();
    await draw(props({ onMove }));
    await fire(nodeEl("r2"), "click");
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Control", code: "Control", ctrlKey: true, bubbles: true }));
    });
    await fire(nodeEl("r3"), "click", { ctrlKey: true });
    // 묶음(0..832) 을 122 오른쪽으로 → 왼쪽 122 가 start 오른쪽 120 과 2 차이.
    await dragNode("r3", center("r3", "RULE"), 122, 0, { ctrlKey: true }, false);
    expect(at("r2")).toEqual({ x: 120, y: 300 });
    expect(at("r3")).toEqual({ x: 720, y: 300 });
    expect(guides().map((e) => e.getAttribute("data-at"))).toEqual(["120"]);
    await fire(window, "mouseup", { clientX: 0, clientY: 0, ctrlKey: true });
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove.mock.calls[0][0]).toEqual({ r2: { x: 120, y: 300 }, r3: { x: 720, y: 300 } });
  });

  it("분기를 끌면 붙은 이동량만큼 블록 멤버도 함께 간다 — 함께 움직이는 멤버는 후보가 아니다, dagre 호출 불변", async () => {
    const r = insertSplit(toEditFlow(null, ["R_A"]), "e2", "IF");
    if (!r.ok) throw new Error(r.reason);
    const ifId = r.flow.nodes.find((n) => n.kind === "IF")!.id;
    const mId = r.flow.nodes.find((n) => n.kind === "MERGE")!.id;
    // 블록(분기 0,0 · 합류 74,200)만 가까이 두고 나머지는 멀리. 메모 왼쪽 3 은 분기 왼쪽 0 과 3 차이.
    const base = setPositions(r.flow, {
      start: { x: -3000, y: -3000 }, r1: { x: -3000, y: 3000 }, end: { x: 3000, y: 6000 }, [ifId]: { x: 0, y: 0 }, [mId]: { x: 74, y: 200 },
    });
    const { flow } = addNote(base, { x: 3, y: 1000 }, null);
    const onMove = vi.fn();
    await draw(props({ flow, onMove }));
    const start = layout.calls;
    await dragNode(ifId, center(ifId, "IF"), 0, 10, {}, false);
    expect(at(ifId)).toEqual({ x: 3, y: 10 });
    expect(at(mId)).toEqual({ x: 77, y: 210 });
    expect(guides().map((e) => [e.getAttribute("data-axis"), e.getAttribute("data-at")])).toEqual([["x", "3"]]);
    await fire(window, "mouseup", { clientX: 0, clientY: 0 });
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove.mock.calls[0][0]).toEqual({ [ifId]: { x: 3, y: 10 }, [mId]: { x: 77, y: 210 } });
    expect(layout.calls).toBe(start);
  });

  it("접힌 블록은 접힌 상자(룰 크기)로 후보가 된다", async () => {
    const r = insertSplit(toEditFlow(null, ["R_A"]), "e2", "IF");
    if (!r.ok) throw new Error(r.reason);
    const ifId = r.flow.nodes.find((n) => n.kind === "IF")!.id;
    const mId = r.flow.nodes.find((n) => n.kind === "MERGE")!.id;
    const flow = setPositions(r.flow, {
      start: { x: -3000, y: -3000 }, r1: { x: -3000, y: 3000 }, end: { x: 1000, y: 500 }, [ifId]: { x: 0, y: 0 }, [mId]: { x: 74, y: 200 },
    });
    const onMove = vi.fn();
    await draw(props({ flow, onMove, collapsed: new Set([ifId]) }));
    const box = at(ifId); // 접힌 상자 좌상단
    expect(nodeEl(mId)).toBeNull();
    // end 왼쪽을 접힌 상자 오른쪽(+룰 폭 232) 보다 2 오른쪽으로 — 분기 제 폭(176)이면 58 떨어져 붙지 않는다.
    const target = box.x + NODE_SIZE.RULE.w;
    await dragNode("end", center("end", "END"), target + 2 - 1000, 0, {}, false);
    expect(at("end")).toEqual({ x: target, y: 500 });
    await fire(window, "mouseup", { clientX: 0, clientY: 0 });
    expect(onMove.mock.calls[0][0]).toEqual({ end: { x: target, y: 500 } });
  });

  it("memo — 다른 prop 은 같은 참조로 두고 flow 만 바꿔 다시 그리면 새 위치에 붙는다(낡은 후보를 쓰지 않는다)", async () => {
    const onMove = vi.fn();
    const p = props({ onMove });
    await draw(p);
    await draw({ ...p, flow: chainFlow({ r2: { x: 0, y: 320 } }) });
    expect(at("r2")).toEqual({ x: 0, y: 320 });
    // r3(600,300) → (900, 322): 새 r2 의 위 320 과 2 차이.
    await dragNode("r3", center("r3", "RULE"), 300, 22);
    expect(onMove.mock.calls[0][0]).toEqual({ r3: { x: 900, y: 320 } });
  });

  it("저장 위치가 없는(고정 안 된) 노드에 맞닿게 붙여 놓으면 맞은 대상도 그린 위치로 함께 적어 고정한다 — 겹침 풀기가 대상을 밀지 않는다(I2)", async () => {
    const flow = toEditFlow(null, ["SC_A", "SC_B", "SC_C"]); // 저장 위치 없음 = 모두 자동 배치
    const drawn = drawnPositions(flow);
    const p2 = drawn.r2;
    const onMove = vi.fn();
    const onMoveNode = vi.fn();
    await draw(props({ flow, onMove, onMoveNode }));
    const start = layout.calls;
    expect(at("r2")).toEqual(p2);
    // r3 를 r2 오른쪽에 맞닿게(왼쪽 = r2 오른쪽 +3, 위 = r2 위 +2) — 왼쪽 → r2 오른쪽, 위 → r2 위에 붙는다.
    const p3 = at("r3");
    await dragNode("r3", center("r3", "RULE"), p2.x + NODE_SIZE.RULE.w + 3 - p3.x, p2.y + 2 - p3.y, {}, false);
    expect(at("r3")).toEqual({ x: p2.x + NODE_SIZE.RULE.w, y: p2.y });
    await fire(window, "mouseup", { clientX: 0, clientY: 0 });
    expect(layout.calls).toBe(start); // 끌기·놓기(대상 고정 포함)는 배치를 다시 돌리지 않는다
    expect(onMoveNode).not.toHaveBeenCalled(); // 끼우기 강조가 없었다(강조 중이면 스냅이 꺼진다)
    expect(onMove).toHaveBeenCalledTimes(1);
    const moved = onMove.mock.calls[0][0] as Record<string, FlowPos>;
    expect(moved.r3).toEqual({ x: p2.x + NODE_SIZE.RULE.w, y: p2.y });
    expect(moved.r2).toEqual(p2); // 맞은 대상 — 그린 위치 그대로 고정
    expect(Object.keys(moved).sort()).toEqual(["r2", "r3"]); // 맞지 않은 노드는 적지 않는다
    // 놓은 뒤 그린 위치(겹침 풀기 뒤)에서도 기준선이 맞다.
    const after = setPositions(flow, moved);
    const d = drawnPositions(after);
    expect(d.r2).toEqual(p2);
    expect(d.r3).toEqual({ x: d.r2.x + NODE_SIZE.RULE.w, y: d.r2.y });
    await draw(props({ flow: after, onMove, onMoveNode }));
    expect(at("r2")).toEqual(p2);
    expect(at("r3")).toEqual({ x: p2.x + NODE_SIZE.RULE.w, y: p2.y });
  });

  it("맞은 대상이 고정 안 된 접힌 분기면 제 크기 기준(+foldOffsetX)으로 적고 숨은 블록 멤버도 함께 고정한다(I2)", async () => {
    const r = insertSplit(toEditFlow(null, ["R_A"]), "e2", "IF");
    if (!r.ok) throw new Error(r.reason);
    const flow = r.flow; // 저장 위치 없음
    const ifId = flow.nodes.find((n) => n.kind === "IF")!.id;
    const mId = flow.nodes.find((n) => n.kind === "MERGE")!.id;
    const collapsed = new Set([ifId]);
    const onMove = vi.fn();
    await draw(props({ flow, onMove, collapsed }));
    const box = at(ifId); // 접힌 상자 좌상단
    const pe = at("end");
    await dragNode("end", center("end", "END"), box.x + NODE_SIZE.RULE.w + 2 - pe.x, box.y + 1 - pe.y);
    const moved = onMove.mock.calls[0][0] as Record<string, FlowPos>;
    expect(moved.end).toEqual({ x: box.x + NODE_SIZE.RULE.w, y: box.y });
    expect(moved[ifId]).toEqual({ x: box.x + foldOffsetX("IF"), y: box.y });
    expect(moved[mId]).toBeDefined(); // 숨은 합류도 블록과 맞춘 자리로 고정
    await draw(props({ flow: setPositions(flow, moved), onMove, collapsed }));
    expect(at(ifId)).toEqual(box);
    expect(at("end")).toEqual({ x: box.x + NODE_SIZE.RULE.w, y: box.y });
  });

  it("이미 저장 위치가 있는 대상은 다시 적지 않는다 — 끈 노드만 올린다", async () => {
    const onMove = vi.fn();
    await draw(props({ onMove }));
    await dragNode("r3", center("r3", "RULE"), 300, 3);
    expect(onMove.mock.calls[0][0]).toEqual({ r3: { x: 900, y: 300 } });
  });

  it("보기 모드는 끌리지 않아 안내선도 없다", async () => {
    const onMove = vi.fn();
    await draw(props({ onMove, mode: "view" }));
    await dragNode("r3", center("r3", "RULE"), 300, 3, {}, false);
    expect(guides()).toHaveLength(0);
    expect(at("r3")).toEqual({ x: 600, y: 300 });
    await fire(window, "mouseup", { clientX: 0, clientY: 0 });
    expect(onMove).not.toHaveBeenCalled();
  });

  it("크기를 키운 노드는 새 크기 상자로 맞춘다 — 아래 변이 다른 노드의 아래 변에 붙는다(S1)", async () => {
    // r3 를 높이 200 으로 키운다(600..832 × 300..500). 흐름 y -130 → 아래 변 370 이 r2 의 아래(368)와 2 차이, 위(170)·가운데(270)는 어느 것과도 6px 밖.
    // 예전 크기(68)였다면 위 170·가운데 204·아래 238 모두 맞는 자리가 없어 붙지 않는다.
    const r = setNodeStyle(chainFlow(), "r3", { h: 200 });
    if (!r.ok) throw new Error(r.reason);
    const onMove = vi.fn();
    await draw(props({ onMove, flow: r.flow }));
    await dragNode("r3", { x: at("r3").x + 20, y: at("r3").y + 20 }, 300, -130, {}, false);
    expect(at("r3")).toEqual({ x: 900, y: 168 });
    const g = guides();
    expect(g).toHaveLength(1);
    expect(g[0].getAttribute("data-axis")).toBe("y");
    expect(g[0].getAttribute("data-at")).toBe("368");
  });

  it("안내선 CSS 는 styles 문자열이고 색은 의미 토큰(--color-primary)이다", () => {
    expect(RSF_CSS).toContain(".rsf-snap-guide");
    expect(RSF_CSS).toMatch(/\.rsf-snap-guide \{[^}]*var\(--color-primary\)/);
  });
});
