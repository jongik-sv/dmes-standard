/** @vitest-environment happy-dom */

// 받는 노드 자리 옮기기(D-142) — 룰 테두리 네 변 자리 계산, view.catchSpots 저장·정리, 나가는 연결점 방향, 캔버스 끌기.
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import { FlowCanvas, type FlowCanvasProps } from "../../../pages/dme/ruleSetEdit/canvas/FlowCanvas";
import { handlesOf } from "../../../pages/dme/ruleSetEdit/canvas/nodes";
import {
  addCatch, flowJsonOf, insertRule, removeNode, setCatchSpot, setPositions, setRoute, toEditFlow, type CatchSpot, type EditFlow, type EditResult, type FlowPos,
} from "../../../pages/dme/ruleSetEdit/flow-edit";
import {
  NODE_SIZE, catchSlots, catchSpot, catchSpotAt, clearLayoutCache, drawnPositions, endingRoutes,
} from "../../../pages/dme/ruleSetEdit/flow-layout";
import { flush, installDomStorage } from "../helpers/render";

function ok(r: EditResult): EditFlow {
  if (!r.ok) throw new Error(r.reason);
  return r.flow;
}
const P = (x: number, y: number): FlowPos => ({ x, y });
const RULE = { w: 232, h: 68 };
/** start → r1 → r2 → r3 → end, 받는 노드 c1(r1) → end. 위치 고정: r1 (0,150). */
const withCatch = (rules = ["R_A", "R_B", "R_C"]): EditFlow => {
  const f = ok(addCatch(toEditFlow(null, rules), "r1", null));
  return setPositions(f, { start: P(0, 0), r1: P(0, 150), r2: P(0, 300), r3: P(0, 450), end: P(0, 600) });
};
/** c1 에 이어 c2 를 하나 더 붙인다. */
const twoCatches = (): EditFlow => ok(addCatch(withCatch(), "r1", null));

beforeEach(() => clearLayoutCache());

describe("catchSpot — 룰 테두리 네 변 자리(D-142)", () => {
  const r = P(100, 200);
  it("자리가 없으면 아래 변 기본 자리(R15) 그대로다", () => {
    expect(catchSpot(r, RULE, 0)).toEqual({ x: 116, y: 254 });
    expect(catchSpot(r, RULE, 1, null)).toEqual({ x: 152, y: 254 });
  });
  it("변마다 원 가운데가 테두리 위, 변 시작에서 at 거리다", () => {
    expect(catchSpot(r, RULE, 0, { side: "top", at: 50 })).toEqual({ x: 136, y: 186 });
    expect(catchSpot(r, RULE, 0, { side: "bottom", at: 116 })).toEqual({ x: 202, y: 254 });
    expect(catchSpot(r, RULE, 0, { side: "left", at: 34 })).toEqual({ x: 86, y: 220 });
    expect(catchSpot(r, RULE, 0, { side: "right", at: 34 })).toEqual({ x: 318, y: 220 });
  });
  it("룰 크기가 줄어 거리가 변을 넘으면 원이 모서리 안에 머물게 자른다", () => {
    expect(catchSpot(r, RULE, 0, { side: "right", at: 300 })).toEqual({ x: 318, y: 240 }); // 가운데 y = 68 − 14
    expect(catchSpot(r, RULE, 0, { side: "top", at: 0 })).toEqual({ x: 100, y: 186 }); // 가운데 x = 14
  });
});

describe("catchSpotAt — 끄는 점에서 가장 가까운 테두리 자리", () => {
  const r = P(0, 0);
  it("가장 가까운 변에 대고 변 위 거리를 잰다", () => {
    expect(catchSpotAt(r, RULE, P(250, 20))).toEqual({ side: "right", at: 20 });
    expect(catchSpotAt(r, RULE, P(-20, 50))).toEqual({ side: "left", at: 50 });
    expect(catchSpotAt(r, RULE, P(60, -10))).toEqual({ side: "top", at: 60 });
    expect(catchSpotAt(r, RULE, P(60, 80))).toEqual({ side: "bottom", at: 60 });
    expect(catchSpotAt(r, RULE, P(200, 60))).toEqual({ side: "bottom", at: 200 }); // 룰 안쪽 점도 가장 가까운 변으로
  });
  it("모서리 바깥은 더 벗어난 방향의 변, 원이 변 안에 머물게 자르고, 변 가운데 근처는 가운데에 붙인다", () => {
    expect(catchSpotAt(r, RULE, P(240, -40))).toEqual({ side: "top", at: 218 }); // 모서리 바깥 — 위로 더 벗어났다
    expect(catchSpotAt(r, RULE, P(300, -10))).toEqual({ side: "right", at: 14 }); // 모서리 바깥 — 오른쪽으로 더 벗어났다
    expect(catchSpotAt(r, RULE, P(270, 80))).toEqual({ side: "right", at: 54 });
    expect(catchSpotAt(r, RULE, P(120, 90))).toEqual({ side: "bottom", at: 116 });
    expect(catchSpotAt(r, RULE, P(240, 30))).toEqual({ side: "right", at: 34 });
  });
});

describe("view.catchSpots 저장·정리(D-142)", () => {
  const right: CatchSpot = { side: "right", at: 34 };
  it("옮기면 키가 생기고 그린 위치가 그 자리다. 기본 자리로 되돌리면 키가 사라진다", () => {
    const f = ok(setCatchSpot(withCatch(), "c1", right));
    expect(f.view.catchSpots).toEqual({ c1: right });
    expect(catchSlots(f).get("c1")).toEqual({ attachTo: "r1", k: 0, spot: right });
    expect(drawnPositions(f).c1).toEqual(catchSpot(P(0, 150), NODE_SIZE.RULE, 0, right));
    const back = ok(setCatchSpot(f, "c1", null));
    expect(back.view.catchSpots).toBeUndefined();
    expect(flowJsonOf(back)).toBe(flowJsonOf(withCatch()));
  });
  it("옮기지 않은 흐름의 JSON 에는 catchSpots 키가 없고, 옮긴 흐름은 맨 뒤에 싣는다", () => {
    expect(flowJsonOf(withCatch())).not.toContain("catchSpots");
    const json = JSON.parse(flowJsonOf(ok(setCatchSpot(withCatch(), "c1", right))));
    expect(Object.keys(json.view).at(-1)).toBe("catchSpots");
    expect(json.view.catchSpots).toEqual({ c1: right });
  });
  it("같은 자리면 입력 흐름을 그대로 돌려준다(편집을 만들지 않는다). 받는 노드가 아니면 거부한다", () => {
    const f = ok(setCatchSpot(withCatch(), "c1", right));
    expect(ok(setCatchSpot(f, "c1", { ...right }))).toBe(f);
    expect(setCatchSpot(f, "r1", right).ok).toBe(false);
  });
  it("다른 편집(끼우기·위치 적기)을 거쳐도 남는다", () => {
    const f = ok(setCatchSpot(withCatch(), "c1", right));
    const ins = ok(insertRule(f, f.edges.find((e) => e.from === "r2")!.id, "R_D"));
    expect(ins.view.catchSpots).toEqual({ c1: right });
    expect(setPositions(ins, { r2: P(10, 10) }).view.catchSpots).toEqual({ c1: right });
  });
  it("옮기면 받는 노드에서 나가는 선의 저장 경로만 지운다(예전 출발 자리에 맞춘 꺾는 점)", () => {
    const f0 = withCatch();
    const out = f0.edges.find((e) => e.from === "c1")!.id;
    const other = f0.edges.find((e) => e.from === "r2")!.id;
    const f = ok(setRoute(ok(setRoute(f0, out, [P(30, 260), P(400, 260)])), other, [P(116, 400)]));
    const moved = ok(setCatchSpot(f, "c1", right));
    expect(moved.view.routes[out]).toBeUndefined();
    expect(moved.view.routes[other]).toEqual([P(116, 400)]);
  });
  it("받는 노드가 지워지면 자리도 지운다", () => {
    const f = ok(setCatchSpot(withCatch(), "c1", right));
    const gone = ok(removeNode(f, "c1"));
    expect(gone.view.catchSpots).toBeUndefined();
  });
  it("저장 글자에서 읽을 때 모양이 틀린 항목·받는 노드가 아닌 키는 버리고 거리는 정수로 반올림한다", () => {
    const raw = JSON.parse(flowJsonOf(withCatch()));
    raw.view.catchSpots = { c1: { side: "left", at: 20.6 }, r1: { side: "top", at: 3 }, c9: { side: "diag", at: 1 } };
    expect(toEditFlow(raw, []).view.catchSpots).toEqual({ c1: { side: "left", at: 21 } });
  });
});

describe("나가는 선 방향(D-142)", () => {
  it("받는 노드 나가는 연결점은 걸친 변 바깥쪽 가운데다", () => {
    const S = NODE_SIZE.CATCH;
    const at = (side?: "top" | "right" | "bottom" | "left") => {
      const [h] = handlesOf("CATCH", S, side);
      return { id: h.id, position: h.position, cx: h.x + h.width! / 2, cy: h.y + h.height! / 2 };
    };
    expect(at()).toEqual({ id: "out", position: "bottom", cx: 14, cy: 28 });
    expect(at("right")).toEqual({ id: "out", position: "right", cx: 28, cy: 14 });
    expect(at("top")).toEqual({ id: "out", position: "top", cx: 14, cy: 0 });
    expect(at("left")).toEqual({ id: "out", position: "left", cx: 0, cy: 14 });
  });
  it("아래 변이 아닌 자리로 옮긴 빈 끝내는 갈래는 아래에서 출발하는 자동 경로를 쓰지 않는다", () => {
    const f = withCatch();
    const e = f.edges.find((x) => x.from === "c1")!.id;
    expect(endingRoutes(f, drawnPositions(f))[e]?.length).toBeGreaterThan(0);
    const moved = ok(setCatchSpot(f, "c1", { side: "right", at: 34 }));
    expect(endingRoutes(moved, drawnPositions(moved))[e]).toBeUndefined();
    const bottom = ok(setCatchSpot(f, "c1", { side: "bottom", at: 200 }));
    expect(endingRoutes(bottom, drawnPositions(bottom))[e]?.length).toBeGreaterThan(0);
  });
});

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
    flow: withCatch(), rules: {}, checks: [], mode: "edit", varDisplay: "off", selectedId: null, selectedEdgeId: null,
    overlay: null, focusId: null, focusSeq: 0, onSelect: noop, onSelectEdge: noop, onOpenRule: noop, onMove: noop, onConnect: noop,
    onDropPalette: noop, onNoteChange: noop, breakpoints: new Set(), collapsed: new Set(), showMiniMap: false, editingCondEdgeId: null,
    onMoveNode: noop, onDropRule: noop, onContextMenu: noop, onEditCond: noop, onEditCondClose: noop, onToggleBreakpoint: noop, ...over,
  };
}
async function draw(p: FlowCanvasProps) {
  await act(async () => {
    root.render(createElement(DmesUiProvider, null, createElement("div", { style: { width: 800, height: 600 } }, createElement(FlowCanvas, p))));
  });
  await flush();
}
const q = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const box = (id: string) => {
  const el = document.querySelector(`.react-flow__node[data-id="${id}"]`) as HTMLElement;
  const m = /translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(el.style.transform)!;
  return { x: Number(m[1]), y: Number(m[2]) };
};
/** 흐름 좌표 → 화면 좌표(뷰포트 변환을 읽는다). */
const screen = (p: FlowPos) => {
  const vp = document.querySelector(".react-flow__viewport") as HTMLElement;
  const m = /translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px\)\s*scale\(\s*([\d.]+)\s*\)/.exec(vp.style.transform)!;
  const [tx, ty, k] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return { clientX: p.x * k + tx, clientY: p.y * k + ty };
};
const fire = async (el: Element | Window, type: string, init: MouseEventInit = {}) =>
  act(async () => { el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init })); });
/** 받는 노드 c 를 흐름 좌표 to 로 끈다. */
async function dragCatch(id: string, to: FlowPos, release = true) {
  const b = box(id);
  const from = screen(P(b.x + 14, b.y + 14));
  await fire(q(`flow-node-${id}`)!, "pointerdown", { ...from, button: 0 });
  const end = screen(to);
  await fire(window, "pointermove", { clientX: (from.clientX + end.clientX) / 2, clientY: (from.clientY + end.clientY) / 2, buttons: 1 });
  await fire(window, "pointermove", { ...end, buttons: 1 });
  if (release) await fire(window, "pointerup", end);
}

describe("FlowCanvas 받는 노드 옮기기(D-142)", () => {
  it("편집 모드에서만 옮길 수 있는 표시(nopan)가 붙고, React Flow 끌기 대상은 아니다", async () => {
    await draw(props({ onCatchSpotChange: noop }));
    const c1 = q("flow-node-c1")!;
    expect(c1.classList.contains("nopan")).toBe(true);
    expect((c1.closest(".react-flow__node") as HTMLElement).classList.contains("draggable")).toBe(false);
    await draw(props({ mode: "view", onCatchSpotChange: noop }));
    expect(q("flow-node-c1")!.classList.contains("nopan")).toBe(false);
  });

  it("끄는 동안 룰 테두리를 따라 그리고, 놓을 때 한 번 올린다", async () => {
    const calls: [string, CatchSpot][] = [];
    await draw(props({ onCatchSpotChange: (id, s) => calls.push([id, s]) }));
    await dragCatch("c1", P(250, 150 + 20), false);
    expect(box("c1")).toEqual({ x: 232 - 14, y: 150 + 20 - 14 });
    expect(q("flow-node-c1")!.getAttribute("data-catch-side")).toBe("right");
    expect(calls).toEqual([]);
    await fire(window, "pointerup", screen(P(250, 170)));
    expect(calls).toEqual([["c1", { side: "right", at: 20 }]]);
  });

  it("문턱보다 적게 움직이면(누르기) 올리지 않는다", async () => {
    const calls: unknown[] = [];
    await draw(props({ onCatchSpotChange: (...a) => calls.push(a) }));
    const b = box("c1");
    const at = screen(P(b.x + 14, b.y + 14));
    await fire(q("flow-node-c1")!, "pointerdown", { ...at, button: 0 });
    await fire(window, "pointermove", { clientX: at.clientX + 1, clientY: at.clientY + 1, buttons: 1 });
    await fire(window, "pointerup", at);
    expect(calls).toEqual([]);
  });

  it("같은 룰의 다른 받는 노드와 겹치는 자리면 올리지 않는다", async () => {
    const calls: unknown[] = [];
    await draw(props({ flow: twoCatches(), onCatchSpotChange: (...a) => calls.push(a) }));
    const c1 = box("c1");
    await dragCatch("c2", P(c1.x + 14 + 4, 150 + 68)); // c1 가운데 바로 옆
    expect(calls).toEqual([]);
    await dragCatch("c2", P(150, 150 - 5));
    expect(calls).toEqual([["c2", { side: "top", at: 150 }]]);
  });

  it("옮긴 자리를 저장한 흐름은 보기 모드에서도 그 자리에 그리고, 룰을 따라간다", async () => {
    const f = ok(setCatchSpot(withCatch(), "c1", { side: "left", at: 34 }));
    await draw(props({ mode: "view", flow: f }));
    expect(box("c1")).toEqual({ x: -14, y: 150 + 34 - 14 });
    await draw(props({ mode: "view", flow: setPositions(f, { r1: P(300, 150) }) }));
    expect(box("c1")).toEqual({ x: 300 - 14, y: 150 + 34 - 14 });
  });
});
