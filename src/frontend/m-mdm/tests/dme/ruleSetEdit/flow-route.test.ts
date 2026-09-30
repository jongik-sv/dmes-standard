/** @vitest-environment happy-dom */

// 룰 세트 흐름 선 경로 편집(3단계 Task 15, C14) — view.routes 코덱·연산, 경로 계산 순수 함수, 캔버스 손잡이·메뉴.
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import { FlowCanvas, type FlowCanvasProps } from "../../../pages/dme/ruleSetEdit/canvas/FlowCanvas";
import { buildMenu, type CanvasActions, type MenuContext } from "../../../pages/dme/ruleSetEdit/canvas/context-menu";
import { MENU_PROVIDERS } from "../../../pages/dme/ruleSetEdit/canvas/menus";
import { insertRoutePoint, routeMidpoint, routePath } from "../../../pages/dme/ruleSetEdit/canvas/route-path";
import {
  EMPTY_VIEW, addNote, clearRoutes, dissolveSplit, flowJsonOf, insertSplit, moveNode, removeNode, setRoute, toEditFlow, updateEdge,
  type EditFlow, type EditResult, type FlowPos,
} from "../../../pages/dme/ruleSetEdit/flow-edit";
import { autoArrange } from "../../../pages/dme/ruleSetEdit/flow-layout";
import { flush, installDomStorage } from "../helpers/render";

function ok(r: EditResult): EditFlow {
  if (!r.ok) throw new Error(r.reason);
  return r.flow;
}
/** start → r1 → if1{e4 조건 / e5 그 외} → m1 → r2 → end. 선: e1 e2 e4 e5 e6 e3. */
function ifFlow(): EditFlow {
  const f = ok(insertSplit(toEditFlow(null, ["R_A", "R_B"]), "e2", "IF"));
  return ok(updateEdge(f, f.edges.find((e) => e.from === "if1" && !e.otherwise)!.id, { cond: "true" }));
}
const P = (x: number, y: number): FlowPos => ({ x, y });

describe("view.routes 코덱", () => {
  it("EMPTY_VIEW·빈 view 는 routes 가 비어 있다", () => {
    expect(EMPTY_VIEW.routes).toEqual({});
    expect(toEditFlow(null, ["R_A"]).view.routes).toEqual({});
  });

  it("sanitizeView — 유한 x·y 점만 남기고 20개에서 자른다, 빈 경로·잘못된 모양은 버린다", () => {
    const base = ifFlow();
    const many = Array.from({ length: 25 }, (_, i) => ({ x: i, y: i }));
    const raw = {
      ...base,
      view: {
        positions: {}, notes: [], groups: [],
        routes: { e1: [{ x: 1, y: 2 }, { x: "a", y: 2 }, { x: Infinity, y: 1 }, null, { x: 3, y: 4 }], e2: many, e4: [], e5: "x", zz: [{ x: 1, y: 1 }] },
      },
    };
    const f = toEditFlow(raw as never, []);
    expect(f.view.routes.e1).toEqual([P(1, 2), P(3, 4)]);
    expect(f.view.routes.e2).toHaveLength(20);
    expect(f.view.routes.e2[19]).toEqual(P(19, 19));
    expect(f.view.routes.e4).toBeUndefined();
    expect(f.view.routes.e5).toBeUndefined();
    expect(f.view.routes.zz).toBeUndefined(); // 흐름에 없는 선
  });

  it("flowJsonOf — view 키 순서는 positions·notes·groups·routes 이고 routes 키는 선 배열 순서다", () => {
    let f = ifFlow();
    f = ok(setRoute(f, "e3", [P(9, 9)]));
    f = ok(setRoute(f, "e1", [P(1, 1), P(2, 2)]));
    const json = JSON.parse(flowJsonOf(f));
    expect(Object.keys(json.view)).toEqual(["positions", "notes", "groups", "routes"]);
    expect(Object.keys(json.view.routes)).toEqual(["e1", "e3"]); // 선 배열: e1 … e3(끝)
    expect(flowJsonOf(f)).toContain('"routes":{"e1":[{"x":1,"y":1},{"x":2,"y":2}],"e3":[{"x":9,"y":9}]}');
  });

  it("왕복 — flowJsonOf → toEditFlow → flowJsonOf 가 같다", () => {
    const f = ok(setRoute(ifFlow(), "e2", [P(10, 20), P(30, 40)]));
    const s = flowJsonOf(f);
    expect(flowJsonOf(toEditFlow(JSON.parse(s), []))).toBe(s);
  });

  it("routes 가 없는 옛 저장본 — 정규화한 기준(baseJson)과 같아 열자마자 dirty 가 되지 않는다", () => {
    const saved = JSON.parse(flowJsonOf(ifFlow()));
    delete saved.view.routes; // 옛 저장본
    const base = flowJsonOf(toEditFlow(saved, [])); // useRuleSetEdit.baseJson 과 같은 식
    const current = flowJsonOf(toEditFlow(saved, [])); // 열린 흐름의 flowJson
    expect(current).toBe(base);
    expect(base).toContain('"routes":{}');
  });
});

describe("setRoute·clearRoutes", () => {
  it("경로를 두고 빈 배열이면 키를 지운다, 입력은 바뀌지 않는다", () => {
    const f = ifFlow();
    const before = flowJsonOf(f);
    const g = ok(setRoute(f, "e2", [P(1, 2)]));
    expect(g.view.routes).toEqual({ e2: [P(1, 2)] });
    expect(flowJsonOf(f)).toBe(before);
    const h = ok(setRoute(g, "e2", []));
    expect(h.view.routes).toEqual({});
    expect(Object.keys(h.view.routes)).toEqual([]);
  });

  it("없는 선과 21개 이상을 거부한다", () => {
    const f = ifFlow();
    expect(setRoute(f, "e99", [P(1, 1)])).toEqual({ ok: false, reason: "선 e99를 찾지 못했다" });
    expect(setRoute(f, "e1", Array.from({ length: 21 }, (_, i) => P(i, i)))).toEqual({ ok: false, reason: "꺾는 점은 선 하나에 20개까지 둔다" });
    expect(setRoute(f, "e1", Array.from({ length: 20 }, (_, i) => P(i, i))).ok).toBe(true);
  });

  it("점의 좌표는 유한한 수여야 한다", () => {
    expect(setRoute(ifFlow(), "e1", [P(NaN, 1)]).ok).toBe(false);
  });

  it("clearRoutes — 모든 경로를 지우고 위치·메모는 남긴다", () => {
    let f = ok(setRoute(ifFlow(), "e1", [P(1, 1)]));
    f = ok(setRoute(f, "e2", [P(2, 2)]));
    f = addNote(f, P(5, 5), null).flow;
    const before = flowJsonOf(f);
    const g = clearRoutes(f);
    expect(g.view.routes).toEqual({});
    expect(g.view.notes).toHaveLength(1);
    expect(flowJsonOf(f)).toBe(before);
  });

  it("autoArrange — 자동 정렬은 위치를 채우고 경로를 함께 지운다", () => {
    const f = ok(setRoute(ifFlow(), "e1", [P(1, 1)]));
    const g = autoArrange(f);
    expect(g.view.routes).toEqual({});
    expect(Object.keys(g.view.positions).length).toBe(f.nodes.length);
  });
});

describe("선이 사라지면 경로도 사라진다", () => {
  it("removeNode — 룰을 지우면 닿던 선의 경로가 없어지고 남은 선의 경로는 남는다", () => {
    let f = ifFlow();
    f = ok(setRoute(f, "e1", [P(1, 1)])); // start→r1
    f = ok(setRoute(f, "e3", [P(3, 3)])); // r2→end
    const g = ok(removeNode(f, "r1"));
    expect(g.edges.some((e) => e.id === "e1")).toBe(true); // 앞선이 이어받는다(start→if1)
    for (const id of Object.keys(g.view.routes)) expect(g.edges.some((e) => e.id === id)).toBe(true);
    expect(g.view.routes.e3).toEqual([P(3, 3)]);
    const h = ok(removeNode(f, "if1")); // 분기 통째
    expect(h.view.routes.e4).toBeUndefined();
    for (const id of Object.keys(h.view.routes)) expect(h.edges.some((e) => e.id === id)).toBe(true);
  });

  it("removeNode — 분기를 지우면 갈래 선의 경로가 남지 않는다", () => {
    let f = ifFlow();
    f = ok(setRoute(f, "e4", [P(4, 4)]));
    f = ok(setRoute(f, "e5", [P(5, 5)]));
    const g = ok(removeNode(f, "if1"));
    expect(g.view.routes.e4).toBeUndefined();
    expect(g.view.routes.e5).toBeUndefined();
  });

  it("dissolveSplit — 풀린 분기의 갈래 선 경로가 없어진다", () => {
    let f = ifFlow();
    f = ok(setRoute(f, "e4", [P(4, 4)]));
    f = ok(setRoute(f, "e5", [P(5, 5)]));
    const g = ok(dissolveSplit(f, "if1", "e4"));
    for (const id of Object.keys(g.view.routes)) expect(g.edges.some((e) => e.id === id)).toBe(true);
    expect(g.edges.some((e) => e.id === "e5")).toBe(false);
    expect(g.view.routes.e5).toBeUndefined();
  });

  it("moveNode — 지운 선 ID 를 새 선이 쓰지 않으므로 옛 경로가 엉뚱한 선에 붙지 않는다", () => {
    const base = toEditFlow(null, ["R_A", "R_B", "R_C"]); // e1 e2 e3 e4
    let f = ok(setRoute(base, "e2", [P(2, 2)])); // r1→r2
    f = ok(setRoute(f, "e3", [P(3, 3)])); // r2→r3
    const g = ok(moveNode(f, "r1", "e4")); // r1 을 r3→end 로
    const idsAfter = g.edges.map((e) => e.id);
    for (const id of Object.keys(g.view.routes)) expect(idsAfter).toContain(id);
    // 살아남은 선 e3 의 경로는 그대로, 사라진 e2 의 경로는 새로 생긴 선에 붙지 않는다
    for (const e of g.edges) {
      if (e.id === "e3") expect(g.view.routes[e.id]).toEqual([P(3, 3)]);
      else if (!base.edges.some((b) => b.id === e.id)) expect(g.view.routes[e.id]).toBeUndefined();
    }
    expect(Object.keys(g.view.routes)).not.toContain("e2");
  });
});

describe("route-path 순수 함수", () => {
  it("routePath — 점 0개(직선)", () => {
    expect(routePath([P(0, 0), P(0, 100)], 8)).toBe("M 0 0 L 0 100");
  });

  it("routePath — 꺾는 점 1개는 모서리를 반경만큼 둥글린다", () => {
    expect(routePath([P(0, 0), P(0, 100), P(100, 100)], 8)).toBe("M 0 0 L 0 92 Q 0 100 8 100 L 100 100");
  });

  it("routePath — 반경이 구간 길이의 절반보다 크면 줄인다", () => {
    // 구간 길이 10 → 반경 최대 5
    expect(routePath([P(0, 0), P(0, 10), P(10, 10)], 8)).toBe("M 0 0 L 0 5 Q 0 10 5 10 L 10 10");
  });

  it("routePath — 겹친 점(길이 0 구간)은 꺾지 않고 지나간다", () => {
    expect(routePath([P(0, 0), P(0, 0), P(0, 50)], 8)).toBe("M 0 0 L 0 0 L 0 50");
  });

  it("routeMidpoint — 경로 길이의 가운데", () => {
    expect(routeMidpoint([P(0, 0), P(0, 100)])).toEqual(P(0, 50));
    expect(routeMidpoint([P(0, 0), P(0, 100), P(100, 100)])).toEqual(P(0, 100)); // 총 200, 가운데는 꺾임 점
    expect(routeMidpoint([P(0, 0), P(0, 100), P(300, 100)])).toEqual(P(100, 100)); // 총 400 → 200 지점
    expect(routeMidpoint([P(5, 5), P(5, 5)])).toEqual(P(5, 5));
  });

  it("insertRoutePoint — 가장 가까운 구간에 점을 끼운다", () => {
    const s = P(0, 0);
    const t = P(0, 300);
    expect(insertRoutePoint([], s, t, P(40, 150))).toEqual([P(40, 150)]);
    const pts = [P(100, 100), P(100, 200)];
    // s→p0, p0→p1, p1→t 세 구간
    expect(insertRoutePoint(pts, s, t, P(50, 50))).toEqual([P(50, 50), P(100, 100), P(100, 200)]);
    expect(insertRoutePoint(pts, s, t, P(110, 150))).toEqual([P(100, 100), P(110, 150), P(100, 200)]);
    expect(insertRoutePoint(pts, s, t, P(30, 290))).toEqual([P(100, 100), P(100, 200), P(30, 290)]);
    expect(pts).toHaveLength(2); // 입력 불변
  });
});

describe("선 우클릭 메뉴 — 경로 초기화", () => {
  const act_ = (): CanvasActions => new Proxy({} as CanvasActions, { get: (t, k) => ((t as never)[k] ??= vi.fn()) });
  const ctx = (flow: EditFlow, mode: "view" | "edit" | "debug"): MenuContext => ({
    flow, rules: {}, mode, hasClipboard: false, selectedEdgeId: null, collapsed: new Set(), breakpoints: new Set(), canRun: true, act: act_(),
  });
  const ids = (flow: EditFlow, mode: "view" | "edit" | "debug") =>
    buildMenu(MENU_PROVIDERS, { kind: "edge", edgeId: "e1", via: "context" }, ctx(flow, mode)).map((i) => i.id);

  it("경로가 있을 때만 보이고 누르면 resetRoute 를 부른다", () => {
    const plain = ifFlow();
    expect(ids(plain, "edit")).not.toContain("route-reset");
    const routed = ok(setRoute(plain, "e1", [P(1, 1)]));
    expect(ids(routed, "edit")).toContain("route-reset");
    expect(ids(routed, "view")).not.toContain("route-reset");
    const c = ctx(routed, "edit");
    buildMenu(MENU_PROVIDERS, { kind: "edge", edgeId: "e1", via: "context" }, c).find((i) => i.id === "route-reset")!.run!();
    expect(c.act.resetRoute).toHaveBeenCalledWith("e1");
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
    flow: ifFlow(), rules: {}, checks: [], mode: "edit", showVars: false, selectedId: null, selectedEdgeId: null,
    overlay: null, focusId: null, focusSeq: 0, onSelect: noop, onSelectEdge: noop, onOpenRule: noop, onMove: noop, onConnect: noop,
    onDropPalette: noop, onNoteChange: noop,
    breakpoints: new Set(), collapsed: new Set(), showMiniMap: false, editingCondEdgeId: null, onMoveNode: noop, onDropRule: noop,
    onContextMenu: noop, onEditCond: noop, onEditCondClose: noop, onToggleBreakpoint: noop, onRouteChange: noop, ...over,
  };
}
async function draw(p: FlowCanvasProps) {
  await act(async () => {
    root.render(createElement(DmesUiProvider, null, createElement("div", { style: { width: 800, height: 600 } }, createElement(FlowCanvas, p))));
  });
  await flush();
}
const q = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const handles = (edgeId: string) => document.querySelectorAll(`[data-testid^="flow-route-handle-${edgeId}-"]`);
const pathOf = (edgeId: string) => q(`rf__edge-${edgeId}`)!.querySelector("path.react-flow__edge-path")!.getAttribute("d")!;
const fire = async (el: Element | Window, type: string, init: MouseEventInit = {}) =>
  act(async () => { el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init })); });

describe("FlowCanvas 선 경로", () => {
  const routed = () => ok(setRoute(ifFlow(), "e2", [P(300, 120), P(340, 200)]));

  it("편집 모드에서 고른 선에만 점마다 손잡이가 보이고, 안 고르면·보기·디버그 모드면 없다", async () => {
    await draw(props({ flow: routed(), selectedEdgeId: "e2" }));
    expect(handles("e2")).toHaveLength(2);
    expect(q("flow-route-handle-e2-0")).not.toBeNull();
    expect(handles("e1")).toHaveLength(0);
    await draw(props({ flow: routed(), selectedEdgeId: null }));
    expect(handles("e2")).toHaveLength(0);
    for (const mode of ["view", "debug"] as const) {
      await draw(props({ flow: routed(), selectedEdgeId: "e2", mode }));
      expect(handles("e2"), mode).toHaveLength(0);
    }
  });

  it("경로가 있는 선은 꺾는 점을 지나는 둥근 꺾은선으로 그린다(보기 모드도)", async () => {
    await draw(props({ flow: routed(), mode: "view" }));
    const d = pathOf("e2");
    expect(d).toContain("300");
    expect(d).toContain("Q");
    expect(pathOf("e1")).not.toContain("Q"); // 경로 없는 선은 자동 경로(직선)
  });

  it("손잡이를 끌어 놓으면 onRouteChange 를 한 번만 부르고 끄는 동안은 부르지 않는다", async () => {
    const onRouteChange = vi.fn();
    await draw(props({ flow: routed(), selectedEdgeId: "e2", onRouteChange }));
    const h = q("flow-route-handle-e2-0")!;
    const before = pathOf("e2");
    await fire(h, "pointerdown", { clientX: 300, clientY: 120, button: 0 });
    await fire(window, "pointermove", { clientX: 350, clientY: 140 });
    await fire(window, "pointermove", { clientX: 360, clientY: 150 });
    expect(onRouteChange).not.toHaveBeenCalled();
    expect(pathOf("e2")).not.toBe(before); // 끄는 동안은 캔버스 안에서 다시 그린다
    await fire(window, "pointerup", { clientX: 360, clientY: 150 });
    expect(onRouteChange).toHaveBeenCalledTimes(1);
    const [edgeId, points] = onRouteChange.mock.calls[0] as [string, FlowPos[]];
    expect(edgeId).toBe("e2");
    expect(points).toHaveLength(2);
    expect(points[1]).toEqual(P(340, 200));
    expect(points[0]).not.toEqual(P(300, 120));
  });

  it("움직이지 않고 놓으면 onRouteChange 를 부르지 않는다", async () => {
    const onRouteChange = vi.fn();
    await draw(props({ flow: routed(), selectedEdgeId: "e2", onRouteChange }));
    const h = q("flow-route-handle-e2-1")!;
    await fire(h, "pointerdown", { clientX: 340, clientY: 200, button: 0 });
    await fire(window, "pointerup", { clientX: 340, clientY: 200 });
    expect(onRouteChange).not.toHaveBeenCalled();
  });

  it("선을 두 번 누르면 점을 더하고, 손잡이를 두 번 누르면 점을 뺀다", async () => {
    const onRouteChange = vi.fn();
    await draw(props({ flow: routed(), selectedEdgeId: "e2", onRouteChange }));
    await fire(q("rf__edge-e2")!.querySelector("path")!, "dblclick", { clientX: 320, clientY: 160 });
    expect(onRouteChange).toHaveBeenCalledTimes(1);
    expect((onRouteChange.mock.calls[0][1] as FlowPos[]).length).toBe(3);
    onRouteChange.mockClear();
    await fire(q("flow-route-handle-e2-0")!, "dblclick");
    expect(onRouteChange).toHaveBeenCalledTimes(1);
    expect(onRouteChange).toHaveBeenCalledWith("e2", [P(340, 200)]);
  });

  it("손잡이를 고른 채 Delete 를 누르면 그 점을 빼고, 캔버스 위로 키를 올리지 않는다", async () => {
    const onRouteChange = vi.fn();
    const outer = vi.fn();
    document.body.addEventListener("keydown", outer);
    await draw(props({ flow: routed(), selectedEdgeId: "e2", onRouteChange }));
    await fire(q("flow-route-handle-e2-1")!, "pointerdown", { clientX: 340, clientY: 200, button: 0 });
    await fire(window, "pointerup", { clientX: 340, clientY: 200 });
    await act(async () => {
      q("flow-canvas")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true }));
    });
    expect(onRouteChange).toHaveBeenCalledWith("e2", [P(300, 120)]);
    expect(outer).not.toHaveBeenCalled();
  });

  it("접힌 분기가 이어 받은 선은 원래 경로를 그리지 않고 손잡이도 없다", async () => {
    const flow = ok(setRoute(ifFlow(), "e6", [P(500, 300)])); // m1→r2: 접으면 if1→r2
    await draw(props({ flow, selectedEdgeId: "e6", collapsed: new Set(["if1"]) }));
    expect(pathOf("e6")).not.toContain("500");
    expect(handles("e6")).toHaveLength(0);
  });
});
