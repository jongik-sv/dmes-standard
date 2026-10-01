/** @vitest-environment happy-dom */

// 4단계 W1 — 선분 손잡이 캔버스: hover·고른 선의 점·선분 손잡이, 선분 끌기(자동 경로 바꾸기·짧은 선분 끼우기·일직선 맞춤·합치기),
// [+] 비킴, 공간 넓히기 미리보기, 성능(끄는 동안 page·dagre 다시 돌지 않음), memo(Local-Rules §19).
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

import { ADD_HOVER_GRACE_MS, FlowCanvas, addSpot, clampSegmentDelta, segmentBox, type FlowCanvasProps } from "../../../pages/dme/ruleSetEdit/canvas/FlowCanvas";
import { Position, getSmoothStepPath } from "../../../pages/dme/ruleSetEdit/canvas/react-flow";
import { ROUTE_RADIUS } from "../../../pages/dme/ruleSetEdit/canvas/route-path";
import { ROUTE_LIMIT_MESSAGE, setPositions, setRoute, toEditFlow, type EditFlow, type EditResult, type FlowPos } from "../../../pages/dme/ruleSetEdit/flow-edit";
import { RSF_CSS } from "../../../pages/dme/ruleSetEdit/rsf-styles";
import { flush, installDomStorage } from "../helpers/render";
import { clearLayoutCache } from "../../../pages/dme/ruleSetEdit/flow-layout";

function ok(r: EditResult): EditFlow {
  if (!r.ok) throw new Error(r.reason);
  return r.flow;
}
const P = (x: number, y: number): FlowPos => ({ x, y });
/** r1(0,0) → r2(600,400): e2 자동 경로 (116,72)→(116,234)→(716,234)→(716,396), [+] 는 (416,234). */
const wide = () => setPositions(toEditFlow(null, ["R_A", "R_B"]), { r1: P(0, 0), r2: P(600, 400) });
/** r1(0,0) 바로 아래 r2(0,400): e2 곧은 선 (116,72)→(116,396), [+] 는 (116,234). */
const tall = () => setPositions(toEditFlow(null, ["R_A", "R_B"]), { r1: P(0, 0), r2: P(0, 400) });

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

const noop = () => {};
function props(over: Partial<FlowCanvasProps> = {}): FlowCanvasProps {
  return {
    flow: wide(), rules: {}, checks: [], mode: "edit", varDisplay: "off", selectedId: null, selectedEdgeId: null,
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
const all = (prefix: string) => document.querySelectorAll(`[data-testid^="${prefix}"]`);
const segs = (edgeId: string) => all(`flow-route-seg-${edgeId}-`);
const autos = (edgeId: string) => all(`flow-route-auto-${edgeId}-`);
const saved = (edgeId: string) => all(`flow-route-handle-${edgeId}-`);
const edgePath = (edgeId: string) => q(`rf__edge-${edgeId}`)!.querySelector("path")!;
const pathOf = (edgeId: string) => q(`rf__edge-${edgeId}`)!.querySelector("path.react-flow__edge-path")!.getAttribute("d")!;
const fire = async (el: Element | Window, type: string, init: MouseEventInit = {}) =>
  act(async () => { el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init })); });
const wait = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const hoverIn = (el: Element) => fire(el, "mouseover", { relatedTarget: null });
const hoverOut = (el: Element) => fire(el, "mouseout", { relatedTarget: document.body });
const xy = (testId: string) => {
  const m = /translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px\)\s*$/.exec((q(testId)!.parentElement as HTMLElement).style.transform)!;
  return P(Number(m[1]), Number(m[2]));
};
const zoom = () => Number(/scale\(\s*([\d.]+)\s*\)/.exec((document.querySelector(".react-flow__viewport") as HTMLElement).style.transform)?.[1] ?? 1);
/** 막대 끌기 — 누른 뒤 두 번 움직이고 놓는다(단추 누른 채 움직임). */
async function dragBar(testId: string, from: FlowPos, to: FlowPos) {
  await fire(q(testId)!, "pointerdown", { clientX: from.x, clientY: from.y, button: 0 });
  await fire(window, "pointermove", { clientX: (from.x + to.x) / 2, clientY: (from.y + to.y) / 2, buttons: 1 });
  await fire(window, "pointermove", { clientX: to.x, clientY: to.y, buttons: 1 });
  await fire(window, "pointerup", { clientX: to.x, clientY: to.y });
}

describe("선분·자동 점 손잡이 표시", () => {
  it("편집 모드에서 선에 마우스를 올리면 자동 경로의 꺾임에 점, 가로·세로 선분에 막대가 뜨고, 떠나면 150ms 유예 뒤 사라진다", async () => {
    await draw(props());
    expect(zoom()).toBe(1); // happy-dom — 흐름 좌표 = 화면 좌표
    expect(segs("e2")).toHaveLength(0);
    await hoverIn(edgePath("e2"));
    expect([...autos("e2")].map((el) => el.getAttribute("data-testid"))).toEqual(["flow-route-auto-e2-0", "flow-route-auto-e2-1"]);
    expect(xy("flow-route-auto-e2-0")).toEqual(P(116, 234));
    expect(xy("flow-route-auto-e2-1")).toEqual(P(716, 234));
    expect(q("flow-route-auto-e2-0")!.getAttribute("data-auto")).toBe("true");
    expect([...segs("e2")].map((el) => el.getAttribute("data-testid"))).toEqual(["flow-route-seg-e2-0", "flow-route-seg-e2-1", "flow-route-seg-e2-2"]);
    expect(q("flow-route-seg-e2-0")!.getAttribute("data-axis")).toBe("v");
    expect(q("flow-route-seg-e2-1")!.getAttribute("data-axis")).toBe("h");
    expect(xy("flow-route-seg-e2-0")).toEqual(P(116, 153));
    expect(xy("flow-route-seg-e2-1")).toEqual(P(266, 234)); // 가운데(416,234)가 [+] 자리 — 같은 거리라 출발 쪽 1/4
    expect(xy("flow-route-seg-e2-2")).toEqual(P(716, 315));
    expect(saved("e2")).toHaveLength(0);
    expect(segs("e1")).toHaveLength(0); // 다른 선은 그대로
    await hoverOut(edgePath("e2"));
    expect(segs("e2")).toHaveLength(3); // 유예 중
    await wait(ADD_HOVER_GRACE_MS + 60);
    expect(segs("e2")).toHaveLength(0);
    expect(autos("e2")).toHaveLength(0);
  });

  it("선에서 막대로 옮겨 가는 사이(유예 안)에는 사라지지 않는다 — 막대도 선의 hover 속성을 단다", async () => {
    await draw(props());
    await hoverIn(edgePath("e2"));
    await hoverOut(edgePath("e2"));
    await wait(40);
    await hoverIn(q("flow-route-seg-e2-1")!);
    await wait(ADD_HOVER_GRACE_MS + 60);
    expect(segs("e2")).toHaveLength(3);
    const cl = q("flow-route-seg-e2-1")!.classList;
    expect(cl.contains("nodrag") && cl.contains("nopan")).toBe(true);
  });

  it("고른 선은 올리지 않아도 뜨고, 보기·디버그 모드에는 없다", async () => {
    await draw(props({ selectedEdgeId: "e2" }));
    expect(segs("e2")).toHaveLength(3);
    for (const mode of ["view", "debug"] as const) {
      await draw(props({ selectedEdgeId: "e2", mode }));
      await hoverIn(edgePath("e2"));
      expect(segs("e2"), mode).toHaveLength(0);
      expect(autos("e2"), mode).toHaveLength(0);
    }
  });

  it("dagre 기본 간격의 짧은 곧은 선(38px)은 가운데가 [+] 자리라 막대가 없다(1/4 지점도 24px 안)", async () => {
    await draw(props({ flow: toEditFlow(null, ["R_A", "R_B"]), selectedEdgeId: "e2" }));
    expect(q("flow-edge-add-e2")).not.toBeNull();
    expect(segs("e2")).toHaveLength(0);
    expect(autos("e2")).toHaveLength(0);
  });

  it("저장 경로가 있는 선은 저장 점(flow-route-handle-*)과 막대가 hover 로도 뜬다", async () => {
    const flow = ok(setRoute(wide(), "e2", [P(116, 300), P(716, 300)]));
    await draw(props({ flow }));
    await hoverIn(edgePath("e2"));
    expect(saved("e2")).toHaveLength(2);
    expect(autos("e2")).toHaveLength(0);
    expect(q("flow-route-seg-e2-1")!.getAttribute("data-axis")).toBe("h");
  });

  it("자동 경로 그리기는 ROUTE_RADIUS 로 getSmoothStepPath 그대로다(처음 끌 때 선이 튀지 않는 기준)", async () => {
    await draw(props());
    const [d] = getSmoothStepPath({
      sourceX: 116, sourceY: 72, sourcePosition: Position.Bottom, targetX: 716, targetY: 396, targetPosition: Position.Top, borderRadius: ROUTE_RADIUS,
    });
    expect(pathOf("e2")).toBe(d);
  });

  it("memo — 다른 props 는 같은 참조로 두고 selectedEdgeId 만, 그다음 flow 만 바꿔도 손잡이가 따라 바뀐다(Local-Rules §19)", async () => {
    const p = props();
    await draw(p);
    expect(autos("e2")).toHaveLength(0);
    const sel = { ...p, selectedEdgeId: "e2" };
    await draw(sel);
    expect(autos("e2")).toHaveLength(2);
    await draw({ ...sel, flow: ok(setRoute(sel.flow, "e2", [P(116, 300), P(716, 300)])) });
    expect(autos("e2")).toHaveLength(0);
    expect(saved("e2")).toHaveLength(2);
  });
});

describe("자동 점·선분 끌기", () => {
  it("자동 경로의 점을 끌면 저장 경로로 바꿔 옮기고 놓을 때 한 번 올린다. 자동 점은 고른 손잡이가 되지 않는다", async () => {
    const onRouteChange = vi.fn();
    const ref = { current: null as (() => boolean) | null };
    await draw(props({ selectedEdgeId: "e2", onRouteChange, removeRoutePointRef: ref }));
    await fire(q("flow-route-auto-e2-0")!, "pointerdown", { clientX: 116, clientY: 234, button: 0 });
    await fire(window, "pointermove", { clientX: 150, clientY: 260, buttons: 1 });
    expect(onRouteChange).not.toHaveBeenCalled();
    await fire(window, "pointerup", { clientX: 150, clientY: 260 });
    expect(onRouteChange).toHaveBeenCalledTimes(1);
    expect(onRouteChange).toHaveBeenCalledWith("e2", [P(150, 260), P(716, 234)]);
    expect(ref.current!()).toBe(false); // 고른 점이 없어 Delete 는 선택 삭제로 간다
  });

  it("움직이지 않고 놓거나 두 번 누르면 아무것도 올리지 않는다", async () => {
    const onRouteChange = vi.fn();
    await draw(props({ selectedEdgeId: "e2", onRouteChange }));
    await fire(q("flow-route-auto-e2-1")!, "pointerdown", { clientX: 716, clientY: 234, button: 0 });
    await fire(window, "pointerup", { clientX: 716, clientY: 234 });
    await fire(q("flow-route-auto-e2-1")!, "dblclick");
    await fire(q("flow-route-seg-e2-1")!, "pointerdown", { clientX: 266, clientY: 234, button: 0 });
    await fire(window, "pointerup", { clientX: 266, clientY: 234 });
    expect(onRouteChange).not.toHaveBeenCalled();
  });

  it("가로 선분을 끌면 세로로만 옮기고, 끄는 동안은 캔버스 안에서만 다시 그리고 놓을 때 한 번 올린다(자동 경로 → 저장 경로)", async () => {
    const onRouteChange = vi.fn();
    await draw(props({ selectedEdgeId: "e2", onRouteChange }));
    await fire(q("flow-route-seg-e2-1")!, "pointerdown", { clientX: 266, clientY: 234, button: 0 });
    await fire(window, "pointermove", { clientX: 300, clientY: 260, buttons: 1 });
    await fire(window, "pointermove", { clientX: 320, clientY: 284, buttons: 1 });
    expect(onRouteChange).not.toHaveBeenCalled();
    expect(pathOf("e2")).toContain("284");
    expect(q("flow-route-seg-e2-1")!.getAttribute("data-dragging")).toBe("true");
    await fire(window, "pointerup", { clientX: 320, clientY: 284 });
    expect(onRouteChange).toHaveBeenCalledTimes(1);
    expect(onRouteChange).toHaveBeenCalledWith("e2", [P(116, 284), P(716, 284)]); // x 이동은 버린다
  });

  it("노드에 붙은 곧은 선분 — 양쪽에 20px 짧은 선분과 꺾임을 끼워 나가는 방향을 지킨다", async () => {
    const onRouteChange = vi.fn();
    await draw(props({ flow: tall(), selectedEdgeId: "e2", onRouteChange }));
    expect(xy("flow-route-seg-e2-0")).toEqual(P(116, 153)); // 가운데(116,234)는 [+] 자리 — 출발 쪽 1/4
    await dragBar("flow-route-seg-e2-0", P(116, 153), P(176, 170));
    expect(onRouteChange).toHaveBeenCalledWith("e2", [P(116, 92), P(176, 92), P(176, 376), P(116, 376)]);
  });

  it("끄는 선분이 안쪽 이웃과 화면 6px 안이면 일직선으로 맞추고, 놓을 때 합쳐 점을 줄인다", async () => {
    // S(116,72) → (116,150) → (300,150) → (300,250) → (716,250) → T(716,396). 선분 3 가운데 (508,250).
    const flow = ok(setRoute(wide(), "e2", [P(116, 150), P(300, 150), P(300, 250), P(716, 250)]));
    const onRouteChange = vi.fn();
    await draw(props({ flow, selectedEdgeId: "e2", onRouteChange }));
    expect(xy("flow-route-seg-e2-3")).toEqual(P(508, 250));
    await dragBar("flow-route-seg-e2-3", P(508, 250), P(508, 154)); // 154 → 150 에 맞춤
    expect(onRouteChange).toHaveBeenCalledWith("e2", [P(116, 150), P(716, 150)]);
    onRouteChange.mockClear();
    await draw(props({ flow, selectedEdgeId: "e2", onRouteChange }));
    await dragBar("flow-route-seg-e2-3", P(508, 250), P(508, 160)); // 10 떨어져 맞추지 않는다
    expect(onRouteChange).toHaveBeenCalledWith("e2", [P(116, 150), P(300, 150), P(300, 160), P(716, 160)]);
  });

  it("자동 경로 선을 두 번 누르면 자동 경로의 꺾임을 이어받고 누른 자리에 점 하나가 더해진다(스펙 §3.3)", async () => {
    const onRouteChange = vi.fn();
    await draw(props({ onRouteChange }));
    await fire(edgePath("e2"), "dblclick", { clientX: 416, clientY: 234 });
    expect(onRouteChange).toHaveBeenCalledTimes(1);
    expect(onRouteChange).toHaveBeenCalledWith("e2", [P(116, 234), P(416, 234), P(716, 234)]);
  });

  it("안쪽 선분을 크게 끌어도 노드 쪽 선분이 20px 밑으로 줄거나 뒤집히지 않는다(clamp)", async () => {
    // S(116,72) → (116,150) → (300,150) → (300,250) → (716,250) → T(716,396). 선분 1(가로)을 위로 200 끌면 -50 이 되는데 92 에서 멈춘다.
    const flow = ok(setRoute(wide(), "e2", [P(116, 150), P(300, 150), P(300, 250), P(716, 250)]));
    const onRouteChange = vi.fn();
    await draw(props({ flow, selectedEdgeId: "e2", onRouteChange }));
    await dragBar("flow-route-seg-e2-1", P(208, 150), P(208, -50));
    expect(onRouteChange).toHaveBeenCalledWith("e2", [P(116, 92), P(300, 92), P(300, 250), P(716, 250)]);
  });

  it("고른 선의 끝 손잡이를 두 번 눌러도 자동 경로의 꺾임을 이어받는다(U2) — 선이 대각선으로 튀지 않는다", async () => {
    const onRouteChange = vi.fn();
    await draw(props({ selectedEdgeId: "e2", onRouteChange, onReconnect: noop }));
    const anchor = q("rf__edge-e2")!.querySelector(".react-flow__edgeupdater-target")!;
    await fire(anchor, "dblclick", { clientX: 716, clientY: 390 });
    expect(onRouteChange).toHaveBeenCalledTimes(1);
    expect(onRouteChange).toHaveBeenCalledWith("e2", [P(116, 234), P(716, 234), P(716, 390)]);
  });

  it("선분을 끌어 놓은 뒤에는 고른 꺾는 점이 비워져 Delete(removeRoutePointRef)가 엉뚱한 점을 빼지 않는다", async () => {
    const flow = ok(setRoute(wide(), "e2", [P(116, 150), P(300, 150), P(300, 250), P(716, 250)]));
    const onRouteChange = vi.fn();
    const ref = { current: null as (() => boolean) | null };
    await draw(props({ flow, selectedEdgeId: "e2", onRouteChange, removeRoutePointRef: ref }));
    await fire(q("flow-route-handle-e2-2")!, "pointerdown", { clientX: 300, clientY: 250, button: 0 });
    await fire(window, "pointerup", { clientX: 300, clientY: 250 });
    expect(q("flow-route-handle-e2-2")!.getAttribute("data-selected")).toBe("true");
    await dragBar("flow-route-seg-e2-3", P(508, 250), P(508, 200)); // 안쪽 선분 — 점 수가 그대로여도 고른 점은 비운다
    expect(onRouteChange).toHaveBeenCalledTimes(1);
    onRouteChange.mockClear();
    expect(ref.current!()).toBe(false);
    expect(onRouteChange).not.toHaveBeenCalled();
    expect(host.querySelector('[data-selected="true"]')).toBeNull();
  });

  it("pointercancel·단추 뗀 움직임이면 올리지 않고 제자리로 돌아간다", async () => {
    const onRouteChange = vi.fn();
    await draw(props({ selectedEdgeId: "e2", onRouteChange }));
    const before = pathOf("e2");
    await fire(q("flow-route-seg-e2-1")!, "pointerdown", { clientX: 266, clientY: 234, button: 0 });
    await fire(window, "pointermove", { clientX: 266, clientY: 300, buttons: 1 });
    await fire(window, "pointercancel", {});
    expect(pathOf("e2")).toBe(before);
    await fire(q("flow-route-seg-e2-1")!, "pointerdown", { clientX: 266, clientY: 234, button: 0 });
    await fire(window, "pointermove", { clientX: 266, clientY: 300, buttons: 1 });
    await fire(window, "pointermove", { clientX: 266, clientY: 310, buttons: 0 });
    await fire(window, "pointerup", { clientX: 266, clientY: 310 });
    expect(pathOf("e2")).toBe(before);
    expect(onRouteChange).not.toHaveBeenCalled();
  });

  it("공간 넓히기(Alt+끌기) 미리보기를 막대가 따라간다", async () => {
    await draw(props({ flow: tall(), selectedEdgeId: "e2" }));
    const pane = document.querySelector(".react-flow__pane")!;
    await fire(pane, "pointerdown", { clientX: 900, clientY: 100, button: 0, altKey: true });
    await fire(window, "pointermove", { clientX: 900, clientY: 102, buttons: 1 });
    await fire(window, "pointermove", { clientX: 900, clientY: 190, buttons: 1 });
    // r2(위 400)가 기준선 y 100 너머라 90 내려가 e2 가 (116,72)→(116,486) — 가운데는 [+] 자리라 출발 쪽 1/4
    expect(xy("flow-route-seg-e2-0")).toEqual(P(116, 72 + 414 / 4));
    await fire(window, "pointercancel", {});
  });
});

describe("꺾는 점 상한", () => {
  it("선분 끌기로 점이 20개를 넘으면 조용히 자르지 않고 거부(ROUTE_LIMIT_MESSAGE)하고 선은 끌기 전 모양으로 돌아간다", async () => {
    const stair: FlowPos[] = [P(116, 100)];
    let x = 116;
    let y = 100;
    for (let i = 0; i < 9; i++) {
      x += 30;
      stair.push(P(x, y));
      y += 10;
      stair.push(P(x, y));
    }
    expect(stair).toHaveLength(19);
    const results: EditResult[] = [];
    function CapHost() {
      const [flow, setFlow] = useState(() => ok(setRoute(wide(), "e2", stair)));
      return createElement(FlowCanvas, props({
        flow, selectedEdgeId: "e2",
        onRouteChange: (id: string, pts: FlowPos[]) => {
          const r = setRoute(flow, id, pts);
          results.push(r);
          if (r.ok) setFlow(r.flow);
        },
      }));
    }
    await act(async () => {
      root.render(wrap(createElement(CapHost)));
    });
    await flush();
    const before = pathOf("e2");
    await dragBar("flow-route-seg-e2-0", P(116, 86), P(126, 86)); // 노드에 붙은 첫 선분 — 짧은 선분 둘이 끼어 21개가 된다
    await flush();
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(false);
    expect(!results[0].ok && results[0].reason).toBe(ROUTE_LIMIT_MESSAGE);
    expect(pathOf("e2")).toBe(before);
  });
});

describe("[+] 비킴·스타일", () => {
  it("segmentBox — 막대 상자(가로 16×6, 세로 6×16)를 [+] 가 비킨다", () => {
    expect(segmentBox({ index: 0, axis: "h", at: P(5, 0) })).toEqual({ x: 5, y: 0, w: 16, h: 6 });
    expect(segmentBox({ index: 0, axis: "v", at: P(5, 0) })).toEqual({ x: 5, y: 0, w: 6, h: 16 });
    expect(addSpot(P(0, 0), { w: 18, h: 18 }, [segmentBox({ index: 0, axis: "h", at: P(5, 0) })], 4)).toEqual(P(5 + 8 + 4 + 9, 0));
  });

  it("clampSegmentDelta — 안쪽 선분을 옮길 때 노드에 붙은 이웃 선분이 stub(20) 밑으로 줄지 않게 자른다", () => {
    const full = [P(116, 72), P(116, 150), P(300, 150), P(300, 250), P(716, 250), P(716, 396)];
    expect(clampSegmentDelta(full, 1, -200)).toBe(-58); // 앞 이웃: 72 → 92 에서 멈춤
    expect(clampSegmentDelta(full, 1, -30)).toBe(-30);
    expect(clampSegmentDelta(full, 1, 500)).toBe(500); // 뒤 이웃(선분 2)은 노드에 붙지 않았다
    expect(clampSegmentDelta(full, 3, 500)).toBe(126); // 끝 이웃: 396 - 20 = 376 → 376 - 250
    expect(clampSegmentDelta(full, 3, -100)).toBe(-100);
    expect(clampSegmentDelta(full, 0, -999)).toBe(-999); // 노드에 붙은 선분은 moveSegment 가 stub 을 끼운다
    expect(clampSegmentDelta([P(0, 0), P(0, 10), P(50, 10), P(50, 100)], 1, -999)).toBe(0); // 원래 10px 뿐인 이웃은 그 길이 밑으로 줄지 않게 막는다(더 줄이지만 않는다)
  });

  it("CSS — 가로 막대는 ns-resize, 세로 막대는 ew-resize, 막대만 누름을 받는다", () => {
    const css = RSF_CSS.replace(/\s+/g, " ");
    expect(css).toMatch(/\.rsf-route-seg\[data-axis="h"\] \{[^}]*cursor: ns-resize/);
    expect(css).toMatch(/\.rsf-route-seg\[data-axis="v"\] \{[^}]*cursor: ew-resize/);
    expect(css).toMatch(/\.rsf-route-seg \{[^}]*pointer-events: all/);
  });
});

describe("성능 — 끄는 동안 page 를 다시 그리지 않고 dagre 도 다시 돌지 않는다(Local-Rules §16)", () => {
  const renders = { host: 0 };
  /** page 대역 — 콜백이 오면 자기 상태를 바꿔 다시 그린다. */
  function Host({ initial }: { initial: EditFlow }) {
    renders.host++;
    const [flow, setFlow] = useState(initial);
    const [, bump] = useState(0);
    const touch = () => bump((n) => n + 1);
    return createElement(FlowCanvas, props({
      flow, selectedEdgeId: "e2", onSelect: touch, onSelectEdge: touch, onMove: touch, onContextMenu: touch,
      onRouteChange: (id: string, pts: FlowPos[]) => setFlow((f) => ok(setRoute(f, id, pts))),
    }));
  }

  it("선분을 끄는 동안 Host 다시 그리기·dagre 호출이 늘지 않고, 놓으면 Host 가 한 번 다시 그려 저장 경로가 된다", async () => {
    renders.host = 0;
    await act(async () => {
      root.render(wrap(createElement(Host, { initial: wide() })));
    });
    await flush();
    const hostStart = renders.host;
    const layoutStart = layout.calls;
    await fire(q("flow-route-seg-e2-1")!, "pointerdown", { clientX: 266, clientY: 234, button: 0 });
    for (const y of [240, 260, 284]) await fire(window, "pointermove", { clientX: 266, clientY: y, buttons: 1 });
    expect(renders.host).toBe(hostStart);
    expect(layout.calls).toBe(layoutStart);
    await fire(window, "pointerup", { clientX: 266, clientY: 284 });
    await flush();
    expect(renders.host).toBe(hostStart + 1);
    expect(saved("e2")).toHaveLength(2);
  });
});
