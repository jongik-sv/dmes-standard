/** @vitest-environment happy-dom */
// 관계선 꺾임점 편집(r2) — 룰 세트 편집기와 같은 방식: hover/고른 선 손잡이, 직각 선분 끌기, 점 맞춤, 두 번 누르기, Delete 연속 지우기.
// 모든 입력은 실제 순서(pointerdown → window pointermove(buttons 1) → pointerup, 키는 erd-host keydown)로 흉내 낸다. 줌 1, 뷰포트 (0,0) 이라 화면 = 흐름 좌표.
import { act, createElement as h, useMemo, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import {
  ReactFlow, ReactFlowProvider, ROUTE_RADIUS, autoRoute, clampSegmentDelta, finishRoute, insertRoutePoint, moveSegment, roundPoint, routePath,
  segmentHandles, smoothStepPoints, snapRoutePoint, snapSegmentDelta, useReactFlow, type EdgeProps, type FlowPos, type NodeTypes,
} from "@dk-oasis/shared/react-flow";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import { ErdRelationEdge } from "../../../pages/dma/erdEdit/canvas/ErdRelationEdge";
import { ErdTableNode } from "../../../pages/dma/erdEdit/canvas/ErdTableNode";
import { buildFlow, type ErdFlowEdge, type ErdFlowNode } from "../../../pages/dma/erdEdit/canvas/erd-flow";
import { endStub } from "../../../pages/dma/erdEdit/canvas/erd-geometry";
import { ROUTE_HOVER_GRACE_MS } from "../../../pages/dma/erdEdit/canvas/erd-route";
import { useCanvasEditing, type CanvasEditing } from "../../../pages/dma/erdEdit/canvas/useCanvasEditing";
import type { ErdEditContext } from "../../../pages/dma/erdEdit/edit-context";
import type { ErdCommandJson, ErdDiagramRoute, ErdState } from "../../../pages/dma/erdEdit/types";
import { flush } from "../../dme/helpers/render";
import { deny, fakeCtx, type FakeCtx } from "./erd-canvas-fixtures";
import { MENU_DIAGRAMS, menuModel, stateOf } from "./erd-fixtures";

const withRoutes = (routes: ErdDiagramRoute[]): ErdState => {
  const s = stateOf(menuModel(), MENU_DIAGRAMS);
  return { ...s, routes: Object.fromEntries(routes.map((r) => [`${r.diagram}:${r.relation}`, r])) };
};
const P = (x: number, y: number): FlowPos => ({ x, y });
const routeOf = (points: FlowPos[]): ErdDiagramRoute[] => [{ diagram: "d-all", relation: "r-1", points }];

/** Probe 선의 양 끝(손잡이 점)과 같은 쪽 계산 — 마주 보는 두 끝이라 offset = endStub(두 끝 사이 폭). */
const SRC = P(242, 50);
const TGT = P(398, 150);
const OFFSET = endStub(TGT.x - SRC.x);
const AUTO_IN = { sourceX: SRC.x, sourceY: SRC.y, sourcePosition: "right", targetX: TGT.x, targetY: TGT.y, targetPosition: "left", offset: OFFSET } as const;
const AUTO = autoRoute(AUTO_IN);
const fullOf = (points: readonly FlowPos[]): FlowPos[] => [SRC, ...points, TGT];
const LIMIT_MESSAGE = "꺾임점은 한 선에 50개까지입니다.";

describe("buildFlow 의 route", () => {
  it("이 다이어그램의 route 만 선에 싣는다. 모델에 없는 관계의 route 는 그리지 않는다", () => {
    const state = withRoutes([
      { diagram: "d-all", relation: "r-1", points: [{ x: 300, y: 200 }] },
      { diagram: "d-other", relation: "r-1", points: [{ x: 1, y: 1 }] },
      { diagram: "d-all", relation: "r-gone", points: [{ x: 1, y: 1 }] },
    ]);
    const flow = buildFlow({
      state, diagramId: "d-all", mode: "logical", preset: "basic", namesOnly: false, showAudit: true,
      statuses: {}, domains: {}, selected: new Set(), mySession: "ui-me",
    });
    expect(flow.edges.map((e) => [e.id, e.data?.route])).toEqual([["r-1", [{ x: 300, y: 200 }]]]);
  });
});

const NODE_TYPES: NodeTypes = { erdTable: ErdTableNode };
let host: HTMLDivElement;
let root: Root | null = null;
let editing: CanvasEditing;

/** happy-dom 은 손잡이를 재지 못해 React Flow 가 선을 그리지 않는다 — 같은 선 부품을 r-1 로 직접 그린다(손잡이 점 고정). */
function Probe({ route }: { route: ErdDiagramRoute["points"] | null }) {
  const props = {
    id: "r-1", source: "t-1", target: "t-2", sourceX: SRC.x, sourceY: SRC.y, targetX: TGT.x, targetY: TGT.y,
    sourcePosition: "right", targetPosition: "left", data: { state: "CONFIRMED", folded: 0, zeroChild: false, route },
  } as unknown as EdgeProps<ErdFlowEdge>;
  return h("svg", null, h(ErdRelationEdge, props));
}

/** setRoute·clearRoutes 만 상태에 반영한다(live 일 때). 나머지 명령은 기록만 남는다. */
function applyRoutes(state: ErdState, commands: ErdCommandJson[]): ErdState {
  const routes = { ...state.routes };
  for (const c of commands) {
    if (c.op === "setRoute") routes[`${c.diagram}:${c.relation}`] = { diagram: c.diagram as string, relation: c.relation as string, points: c.points as FlowPos[] };
    if (c.op === "clearRoutes") for (const r of c.relations as string[]) delete routes[`${c.diagram}:${r}`];
  }
  return { ...state, routes };
}

/**
 * live = 서버가 받아들인 setRoute·clearRoutes 를 상태에 반영해 다시 그린다(연속 Delete·끌었다 되돌리기처럼 이전 결과 위에 쌓이는 시험용).
 * 아니면 fakeCtx 의 상태는 고정이다(apply 는 기록만).
 */
function Harness({ ctx, live }: { ctx: ErdEditContext; live: boolean }) {
  const rf = useReactFlow<ErdFlowNode, ErdFlowEdge>();
  const [liveState, setLiveState] = useState(ctx.state);
  const eff = useMemo<ErdEditContext>(
    () => (!live ? ctx : {
      ...ctx,
      state: liveState,
      apply: async (commands, label) => {
        const out = await ctx.apply(commands, label);
        if (out.ok) setLiveState((prev) => applyRoutes(prev, commands));
        return out;
      },
    }),
    [ctx, live, liveState],
  );
  const e = useCanvasEditing(eff, rf);
  editing = e;
  const flow = useMemo(
    () => buildFlow({
      state: eff.state, diagramId: eff.diagramId, mode: "logical", preset: "basic", namesOnly: false, showAudit: true,
      statuses: {}, domains: {}, selected: new Set(), mySession: eff.session,
    }),
    [eff.state, eff.diagramId, eff.session],
  );
  const route = flow.edges.find((x) => x.id === "r-1")?.data?.route ?? null;
  return h("div", { tabIndex: 0, "data-testid": "erd-host", onKeyDown: e.onKeyDown, style: { position: "relative", width: 1200, height: 800 } },
    e.toolbar,
    h(ReactFlow<ErdFlowNode, ErdFlowEdge>, {
      nodes: e.decorateNodes(flow.nodes), edges: flow.edges, nodeTypes: NODE_TYPES,
      onNodesChange: e.onNodesChange, ...e.flowProps, fitView: false, defaultViewport: { x: 0, y: 0, zoom: 1 },
    }),
    e.overlay,
    h(Probe, { route }));
}

async function mount(ctx: FakeCtx, live = false) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(h(DmesUiProvider, null, h(ReactFlowProvider, null, h(Harness, { ctx, live }))));
  });
  await flush();
}

const edge = { id: "r-1" } as ErdFlowEdge;
const rel = () => host.querySelector('[data-testid="erd-rel-r-1"]')!;
const lineD = () => rel().querySelector(".erd-rel__line")?.getAttribute("d");
const q = <T extends Element>(sel: string) => document.querySelector<T>(sel);
const tid = (id: string) => `[data-testid="${id}"]`;
const pt = (i: number) => tid(`erd-rel-pt-r-1-${i}`);
const seg = (i: number) => tid(`erd-rel-seg-r-1-${i}`);
const auto = (i: number) => tid(`erd-rel-auto-r-1-${i}`);
const all = (sel: string) => [...document.querySelectorAll(sel)];
const hostEl = () => host.querySelector<HTMLElement>(tid("erd-host"))!;
const wait = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

async function pickLine() {
  await act(async () => {
    editing.flowProps.onEdgeClick!({} as never, edge);
  });
  await flush();
}

const need = (sel: string) => {
  const el = q<SVGElement>(sel);
  if (!el) throw new Error(`없는 요소: ${sel}`);
  return el;
};
const down = async (sel: string, at: FlowPos) => {
  const el = need(sel);
  await act(async () => {
    el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, clientX: at.x, clientY: at.y }));
  });
};
const move = async (at: FlowPos, init: PointerEventInit = {}) => {
  await act(async () => {
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: at.x, clientY: at.y, buttons: 1, ...init }));
  });
};
const up = async (at: FlowPos) => {
  await act(async () => {
    window.dispatchEvent(new PointerEvent("pointerup", { clientX: at.x, clientY: at.y }));
  });
  await flush();
};
/** 손잡이를 from 에서 눌러 to 로 끌어 놓는다(중간에 한 번 더 움직인다). */
async function drag(sel: string, from: FlowPos, to: FlowPos, init: PointerEventInit = {}) {
  await down(sel, from);
  await move(P((from.x + to.x) / 2, (from.y + to.y) / 2), init);
  await move(to, init);
  await up(to);
}
/** 움직이지 않고 누르고 뗀다(손잡이 고르기). */
async function press(sel: string, at: FlowPos) {
  await down(sel, at);
  await up(at);
}
async function dbl(sel: string, at: FlowPos = P(0, 0)) {
  const el = need(sel);
  await act(async () => {
    el.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true, clientX: at.x, clientY: at.y }));
  });
  await flush();
}
async function key(k: string, init: KeyboardEventInit = {}) {
  await act(async () => {
    hostEl().dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init }));
  });
  await flush();
}
/** React onMouseEnter/Leave 는 mouseover/mouseout 으로 오고, 직접 단 mouseenter 도 받도록 둘 다 보낸다. */
async function hoverIn(el: Element) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, cancelable: true, relatedTarget: null }));
    el.dispatchEvent(new MouseEvent("mouseenter", { bubbles: false, cancelable: true, relatedTarget: null }));
  });
}
async function hoverOut(el: Element) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, cancelable: true, relatedTarget: document.body }));
    el.dispatchEvent(new MouseEvent("mouseleave", { bubbles: false, cancelable: true, relatedTarget: document.body }));
  });
}

type RouteCmd = { op: string; diagram: string; relation: string; points: FlowPos[] };
const routeCmds = (ctx: FakeCtx): RouteCmd[] => ctx.applied.flatMap((a) => a.commands).filter((c) => c.op === "setRoute") as unknown as RouteCmd[];
const opsOf = (ctx: FakeCtx) => ctx.applied.flatMap((a) => a.commands.map((c) => c.op));
const SET = (points: FlowPos[]) => ({ commands: [{ op: "setRoute", diagram: "d-all", relation: "r-1", points }], label: "꺾임점 바꾸기" });
const CLEAR = { commands: [{ op: "clearRoutes", diagram: "d-all", relations: ["r-1"] }], label: "자동 경로로 되돌리기" };

/** 선분 끌기의 기대값 — 화면 사양: snap → clamp → moveSegment → finishRoute. */
function expectedSegDrag(full: FlowPos[], index: number, raw: number): FlowPos[] {
  const delta = clampSegmentDelta(full, index, snapSegmentDelta(full, index, raw, 1));
  const moved = moveSegment(full, index, delta)!;
  return finishRoute(full[0], moved.points, full[full.length - 1]);
}
const rightAngles = (full: FlowPos[]) => full.slice(1).every((b, i) => b.x === full[i].x || b.y === full[i].y);

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
});

describe("관계선 그리기와 고르기(r2)", () => {
  it("저장 경로는 [끝, ...꺾임점, 끝] 을 routePath 로 그린다(그리기 전용 꼬리 없음)", async () => {
    const ctx = fakeCtx({ state: withRoutes(routeOf([P(300, 200)])) });
    await mount(ctx);
    expect(rel().getAttribute("data-routed")).toBe("");
    expect(lineD()).toBe(routePath([SRC, P(300, 200), TGT], ROUTE_RADIUS));
    expect(lineD()).not.toContain("270"); // 예전 꼬리 점 (270,50) 이 없다
  });

  it("경로 없는 선은 자동 경로 그대로 그린다", async () => {
    await mount(fakeCtx());
    expect(rel().hasAttribute("data-routed")).toBe(false);
    expect(lineD()).toBe(routePath(smoothStepPoints(AUTO_IN), ROUTE_RADIUS));
  });

  it("선을 누르면 고르고 점·선분 손잡이를 보인다. Esc 로 놓는다", async () => {
    const ctx = fakeCtx({ state: withRoutes(routeOf([P(300, 200)])) });
    await mount(ctx);
    expect(rel().hasAttribute("data-selected")).toBe(false);
    expect(rel().hasAttribute("data-handles")).toBe(false);
    expect(q(pt(0))).toBeNull();
    await pickLine();
    expect(rel().hasAttribute("data-selected")).toBe(true);
    expect(rel().hasAttribute("data-handles")).toBe(true);
    expect(q(pt(0))).not.toBeNull();
    expect(q(tid("erd-rel-bend-r-1-0"))).toBeNull(); // 예전 손잡이는 없다
    expect(q(tid("erd-rel-mid-r-1-0"))).toBeNull();
    // 저장 경로 선분 (SRC→(300,200)) 대각선, ((300,200)→TGT) 대각선이라 막대는 없다
    expect(all('[data-testid^="erd-rel-seg-r-1-"]')).toHaveLength(0);
    await key("Escape");
    expect(rel().hasAttribute("data-selected")).toBe(false);
    expect(rel().hasAttribute("data-handles")).toBe(false);
  });

  it("손잡이를 누르지 않은 빈 곳 누르기는 선택을 푼다", async () => {
    const ctx = fakeCtx({ state: withRoutes(routeOf([P(300, 200)])) });
    await mount(ctx);
    await pickLine();
    await act(async () => {
      q<HTMLElement>(".react-flow__pane")!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await flush();
    expect(rel().hasAttribute("data-selected")).toBe(false);
  });

  it("다이어그램 편집 권한이 없으면 골라도 손잡이가 없다. 올려도 없다", async () => {
    const ctx = fakeCtx({
      state: withRoutes(routeOf([P(300, 200)])),
      rights: { ...fakeCtx().rights, diagram: deny("보기 전용입니다.") },
    });
    await mount(ctx);
    await pickLine();
    expect(rel().hasAttribute("data-selected")).toBe(true);
    expect(rel().hasAttribute("data-handles")).toBe(false);
    expect(q(pt(0))).toBeNull();
    await hoverIn(rel());
    expect(rel().hasAttribute("data-handles")).toBe(false);
    expect(q(pt(0))).toBeNull();
    expect(all('[data-testid^="erd-rel-seg-r-1-"]')).toHaveLength(0);
  });

  it("선 메뉴 [자동 경로로 되돌리기] = clearRoutes", async () => {
    const ctx = fakeCtx({ state: withRoutes(routeOf([P(300, 200)])) });
    await mount(ctx);
    await act(async () => {
      editing.flowProps.onEdgeContextMenu!({ preventDefault() {}, clientX: 10, clientY: 10 } as never, edge);
    });
    await flush();
    await act(async () => {
      q<HTMLElement>('[data-testid="erd-menu-item-route-reset"]')!.click();
    });
    await flush();
    expect(ctx.applied).toEqual([CLEAR]);
  });
});

describe("올려서 손잡이 보이기(hover)", () => {
  it("고르지 않아도 선에 올리면 자동 경로의 점·선분 손잡이가 뜨고, 떠나면 유예 뒤에 사라진다", async () => {
    await mount(fakeCtx());
    expect(rel().hasAttribute("data-handles")).toBe(false);
    await hoverIn(rel());
    expect(rel().hasAttribute("data-handles")).toBe(true);
    expect(rel().hasAttribute("data-selected")).toBe(false); // 올리기만 했다 — 고르지 않았다
    // 자동 경로 점: autoRoute 목록의 번호, 저장 점은 없다
    expect(all('[data-testid^="erd-rel-auto-r-1-"]').map((el) => el.getAttribute("data-testid"))).toEqual(AUTO.map((_, i) => `erd-rel-auto-r-1-${i}`));
    expect(q(auto(0))!.hasAttribute("data-auto")).toBe(true);
    expect(q(auto(0))!.classList.contains("nodrag") && q(auto(0))!.classList.contains("nopan")).toBe(true);
    expect(all('[data-testid^="erd-rel-pt-r-1-"]')).toHaveLength(0);
    // 선분 막대: segmentHandles(full, 1, []) 와 같은 번호·방향
    const want = segmentHandles(fullOf(AUTO), 1, []);
    expect(want.length).toBeGreaterThan(0);
    expect(all('[data-testid^="erd-rel-seg-r-1-"]').map((el) => [el.getAttribute("data-testid"), el.getAttribute("data-axis")]))
      .toEqual(want.map((s) => [`erd-rel-seg-r-1-${s.index}`, s.axis]));
    expect(q(seg(want[0].index))!.classList.contains("nodrag")).toBe(true);

    await hoverOut(rel());
    await wait(40);
    expect(rel().hasAttribute("data-handles")).toBe(true); // 유예 안
    await wait(ROUTE_HOVER_GRACE_MS + 80);
    expect(rel().hasAttribute("data-handles")).toBe(false);
    expect(q(auto(0))).toBeNull();
    expect(all('[data-testid^="erd-rel-seg-r-1-"]')).toHaveLength(0);
  });

  it("유예 안에 다시 들어오면 사라지지 않는다", async () => {
    await mount(fakeCtx());
    await hoverIn(rel());
    await hoverOut(rel());
    await wait(40);
    await hoverIn(rel());
    await wait(ROUTE_HOVER_GRACE_MS + 80);
    expect(rel().hasAttribute("data-handles")).toBe(true);
    await hoverOut(rel());
    await wait(ROUTE_HOVER_GRACE_MS + 80);
    expect(rel().hasAttribute("data-handles")).toBe(false);
  });

  it("저장 경로가 있는 선에 올리면 저장 점(erd-rel-pt-*)이 뜬다. 자동 점은 없다", async () => {
    await mount(fakeCtx({ state: withRoutes(routeOf([P(300, 200), P(350, 200)])) }));
    await hoverIn(rel());
    expect(all('[data-testid^="erd-rel-pt-r-1-"]').map((el) => el.getAttribute("data-testid"))).toEqual(["erd-rel-pt-r-1-0", "erd-rel-pt-r-1-1"]);
    expect(all('[data-testid^="erd-rel-auto-r-1-"]')).toHaveLength(0);
  });

  it("고른 선은 올리지 않아도 손잡이가 뜨고 유예를 기다릴 필요가 없다", async () => {
    await mount(fakeCtx());
    await pickLine();
    expect(rel().hasAttribute("data-handles")).toBe(true);
    await hoverIn(rel());
    await hoverOut(rel());
    await wait(ROUTE_HOVER_GRACE_MS + 80);
    expect(rel().hasAttribute("data-handles")).toBe(true); // 고른 선이라 남는다
  });
});

describe("꺾임점 끌기·누르기", () => {
  it("꺾임점을 끌면 이웃과 6px 안일 때 맞추고, 끄는 동안 안내선이 있고, 놓을 때 setRoute 한 번", async () => {
    const ctx = fakeCtx({ state: withRoutes(routeOf([P(300, 200)])) });
    await mount(ctx);
    await pickLine();
    // 캔버스는 10px 격자에 맞춰 좌표를 준다(screenToFlowPosition) — 격자 값으로 쓴다. 뒤 이웃(TGT) x=398 과 2 차이
    const raw = P(400, 260);
    const snapped = snapRoutePoint(raw, SRC, TGT, 1);
    expect(snapped.guides.length).toBeGreaterThan(0); // 시험 전제: 정말 맞춰지는 값
    await down(pt(0), P(300, 200));
    await move(raw);
    expect(ctx.applied).toEqual([]); // 끄는 동안은 보내지 않는다
    expect(q(".erd-rel__guide")).not.toBeNull();
    expect(q(tid("erd-rel-guide-r-1-x"))).not.toBeNull();
    expect(q(pt(0))!.hasAttribute("data-dragging")).toBe(true);
    await up(raw);
    expect(ctx.applied).toEqual([SET([roundPoint(snapped.point)])]);
    expect(roundPoint(snapped.point)).toEqual(P(398, 260));
    expect(q(".erd-rel__guide")).toBeNull();
  });

  it("Alt 를 누른 채 끌면 맞추지 않는다", async () => {
    const ctx = fakeCtx({ state: withRoutes(routeOf([P(300, 200)])) });
    await mount(ctx);
    await pickLine();
    await down(pt(0), P(300, 200));
    // 격자(10px) 밖 값 — 점 끌기는 캔버스 격자에 붙지 않는다(룰 세트 편집기와 같은 자유 끌기). 이웃 x=398 과 3 차이지만 Alt 라 맞추지 않는다
    await move(P(395, 263), { altKey: true });
    expect(q(".erd-rel__guide")).toBeNull();
    await up(P(395, 263));
    expect(ctx.applied).toEqual([SET([P(395, 263)])]);
  });

  it("이웃과 멀면 맞추지 않고 안내선도 없다", async () => {
    const ctx = fakeCtx({ state: withRoutes(routeOf([P(300, 200)])) });
    await mount(ctx);
    await pickLine();
    await down(pt(0), P(300, 200));
    await move(P(330, 280));
    expect(q(".erd-rel__guide")).toBeNull();
    await up(P(330, 280));
    expect(ctx.applied).toEqual([SET([P(330, 280)])]);
  });

  it("움직이지 않고 놓으면 보내지 않는다. 누른 점은 고른 점(data-selected)이 된다", async () => {
    const ctx = fakeCtx({ state: withRoutes(routeOf([P(300, 200), P(350, 220)])) });
    await mount(ctx);
    await pickLine();
    await press(pt(1), P(350, 220));
    expect(ctx.applied).toEqual([]);
    expect(q(pt(1))!.hasAttribute("data-selected")).toBe(true);
    expect(q(pt(0))!.hasAttribute("data-selected")).toBe(false);
  });

  it("자동 경로의 점을 끌면 자동 경로 전체(정수)를 저장 경로로 바꿔 그 점만 옮긴다. 자동 점은 고른 점이 아니다", async () => {
    const ctx = fakeCtx();
    await mount(ctx);
    await pickLine();
    const a0 = AUTO[0]; // (320, 50)
    const to = P(a0.x + 30, a0.y + 40);
    await drag(auto(0), a0, to);
    const want = AUTO.map(roundPoint);
    want[0] = to;
    expect(ctx.applied).toEqual([SET(want)]);
  });

  it("끝 손잡이 근처에서 pointerup 이 유실되어도(buttons 0 움직임) 보내지 않는다", async () => {
    const ctx = fakeCtx({ state: withRoutes(routeOf([P(300, 200)])) });
    await mount(ctx);
    await pickLine();
    await down(pt(0), P(300, 200));
    await move(P(320, 220));
    await move(P(330, 230), { buttons: 0 });
    await up(P(330, 230));
    expect(ctx.applied).toEqual([]);
  });
});

describe("선분 막대 끌기", () => {
  it("경로 없는 선의 세로 선분을 가로로 끌면 직각을 지킨 꺾임점으로 setRoute 한 번(finishRoute 결과)", async () => {
    const ctx = fakeCtx();
    await mount(ctx);
    await pickLine();
    const full = fullOf(AUTO);
    const bar = segmentHandles(full, 1, []).find((s) => s.axis === "v")!;
    expect(bar).toBeDefined();
    expect(q(seg(bar.index))!.getAttribute("data-axis")).toBe("v");
    const from = bar.at;
    await down(seg(bar.index), from);
    await move(P(from.x + 20, from.y + 5));
    await move(P(from.x + 40, from.y + 7)); // 세로 막대는 가로로만 간다 — y 움직임은 버린다
    expect(ctx.applied).toEqual([]);
    expect(q(seg(bar.index))!.hasAttribute("data-dragging")).toBe(true);
    await up(P(from.x + 40, from.y + 7));
    const want = expectedSegDrag(full, bar.index, 40);
    expect(ctx.applied).toEqual([SET(want)]);
    expect(rightAngles(fullOf(want))).toBe(true);
    expect(want.length).toBeGreaterThan(0);
  });

  it("끄는 동안 선이 따라 움직이고(저장 경로로 그림), 놓기 전에는 보내지 않는다", async () => {
    const ctx = fakeCtx();
    await mount(ctx);
    await pickLine();
    const full = fullOf(AUTO);
    const bar = segmentHandles(full, 1, []).find((s) => s.axis === "v")!;
    const before = lineD();
    await down(seg(bar.index), bar.at);
    await move(P(bar.at.x + 30, bar.at.y));
    await move(P(bar.at.x + 40, bar.at.y));
    expect(lineD()).not.toBe(before);
    const want = expectedSegDrag(full, bar.index, 40);
    expect(lineD()).toBe(routePath(fullOf(want), ROUTE_RADIUS));
    expect(ctx.applied).toEqual([]);
    await up(P(bar.at.x + 40, bar.at.y));
  });

  it("움직이지 않고 놓거나 단추 뗀 움직임이면 보내지 않고 제자리로 돌아간다", async () => {
    const ctx = fakeCtx();
    await mount(ctx);
    await pickLine();
    const full = fullOf(AUTO);
    const bar = segmentHandles(full, 1, []).find((s) => s.axis === "v")!;
    const before = lineD();
    await press(seg(bar.index), bar.at);
    expect(ctx.applied).toEqual([]);
    await down(seg(bar.index), bar.at);
    await move(P(bar.at.x + 40, bar.at.y));
    await move(P(bar.at.x + 50, bar.at.y), { buttons: 0 });
    await up(P(bar.at.x + 50, bar.at.y));
    expect(ctx.applied).toEqual([]);
    expect(lineD()).toBe(before);
  });

  it("노드에 붙은 끝 선분을 끌었다 되돌려도 꺾임점이 늘지 않는다(끌기→되돌리기→다시 끌기)", async () => {
    const ctx = fakeCtx();
    await mount(ctx, true);
    await pickLine();
    // 1) 출발 쪽 가로 선분을 아래로 40 — 노드에서 나온 짧은 선분과 꺾임이 끼어 점이 늘어난다
    const full0 = fullOf(AUTO);
    const first = segmentHandles(full0, 1, []).find((s) => s.index === 0 && s.axis === "h")!;
    expect(first).toBeDefined();
    await drag(seg(0), first.at, P(first.at.x, first.at.y + 40));
    const p1 = expectedSegDrag(full0, 0, 40);
    expect(routeCmds(ctx).map((c) => c.points)).toEqual([p1]);
    expect(p1.length).toBeGreaterThan(AUTO.length);
    expect(lineD()).toBe(routePath(fullOf(p1), ROUTE_RADIUS));
    // 2) 옮겨 온 가로 선분(y=50+40)을 도로 -40 — 점이 줄거나 같고 자동 경로 모양으로 돌아온다
    const full1 = fullOf(p1);
    const back = segmentHandles(full1, 1, []).find((s) => s.axis === "h" && full1[s.index].y === 90 && s.index > 0)!;
    expect(back).toBeDefined();
    await drag(seg(back.index), back.at, P(back.at.x, back.at.y - 40));
    const p2 = expectedSegDrag(full1, back.index, -40);
    expect(routeCmds(ctx).map((c) => c.points)).toEqual([p1, p2]);
    expect(p2.length).toBeLessThanOrEqual(p1.length);
    expect(p2).toEqual(AUTO);
    // 3) 다시 한 번 끌어도 처음 끌었을 때와 같은 개수
    const full2 = fullOf(p2);
    const again = segmentHandles(full2, 1, []).find((s) => s.index === 0 && s.axis === "h")!;
    await drag(seg(0), again.at, P(again.at.x, again.at.y + 40));
    const cmds = routeCmds(ctx);
    expect(cmds).toHaveLength(3);
    expect(cmds[2].points).toEqual(expectedSegDrag(full2, 0, 40));
    expect(cmds[2].points.length).toBe(p1.length);
    expect(Math.max(...cmds.map((c) => c.points.length))).toBe(p1.length);
  });
});

describe("두 번 누르기(점 더하기·빼기)", () => {
  it("경로 없는 선을 두 번 누르면 자동 경로의 꺾임을 이어받고 누른 자리 점 하나가 더해진다", async () => {
    const ctx = fakeCtx();
    await mount(ctx, true);
    const before = lineD();
    const at = P(300, 80); // 세로 선분(x=320) 가까이, 선 위가 아니어도 hit 영역에서 온 클릭이라 그대로 쓴다
    await dbl(".erd-rel__sel", at);
    const want = insertRoutePoint(AUTO.map(roundPoint), SRC, TGT, roundPoint(at));
    expect(ctx.applied).toEqual([SET(want)]);
    expect(want).toHaveLength(AUTO.length + 1);
    // 다시 그린 선: 저장 경로로, 자동 경로 점들이 그대로 들어 있다
    expect(lineD()).toBe(routePath(fullOf(want), ROUTE_RADIUS));
    expect(lineD()).not.toBe(before);
    for (const a of AUTO) expect(want).toContainEqual(a);
  });

  it("저장 경로가 있는 선을 두 번 누르면 가장 가까운 구간에 점을 끼운다", async () => {
    const stored = [P(300, 60), P(300, 120)];
    const ctx = fakeCtx({ state: withRoutes(routeOf(stored)) });
    await mount(ctx);
    const at = P(340.4, 119.6);
    await dbl(".erd-rel__sel", at);
    expect(ctx.applied).toEqual([SET(insertRoutePoint(stored, SRC, TGT, roundPoint(at)))]);
  });

  it("꺾임점 손잡이를 두 번 누르면 그 점을 지운다. 마지막 점이면 clearRoutes", async () => {
    const ctx = fakeCtx({ state: withRoutes(routeOf([P(300, 60), P(300, 120)])) });
    await mount(ctx, true);
    await pickLine();
    await dbl(pt(0));
    expect(ctx.applied).toEqual([SET([P(300, 120)])]);
    await dbl(pt(0));
    expect(ctx.applied[1]).toEqual(CLEAR);
    expect(ctx.applied).toHaveLength(2);
    expect(rel().hasAttribute("data-routed")).toBe(false);
  });

  it("실제 마우스 순서(누름·뗌·click ×2 → dblclick)로 꺾임점을 두 번 눌러도 첫 click 에 선택이 풀리지 않고 지워진다(f1)", async () => {
    const ctx = fakeCtx({ state: withRoutes(routeOf([P(300, 200)])) });
    await mount(ctx);
    await pickLine();
    // 실제 브라우저는 손잡이를 누른 뒤의 click 을 빈 곳(pane)으로 보내 onPaneClick 이 선택을 풀 수 있다.
    const pressAndClick = async () => {
      await act(async () => {
        const el = q<SVGElement>(pt(0));
        if (!el) throw new Error("꺾임점 손잡이가 사라졌다");
        el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, clientX: 5, clientY: 5 }));
        window.dispatchEvent(new PointerEvent("pointerup", { clientX: 5, clientY: 5 }));
        q<HTMLElement>(".react-flow__pane")!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
      });
      await flush();
    };
    await pressAndClick();
    expect(q(pt(0))).not.toBeNull();
    await pressAndClick();
    await dbl(pt(0));
    expect(ctx.applied).toEqual([CLEAR]);
  });

  it("꺾임점이 50개인 선을 두 번 눌러도 점을 더하지 않고 경고만 한다", async () => {
    const full50 = Array.from({ length: 50 }, (_, i) => P(300 + i, i % 2 === 0 ? 60 : 100));
    const ctx = fakeCtx({ state: withRoutes(routeOf(full50)) });
    await mount(ctx);
    await dbl(".erd-rel__sel", P(310, 80));
    expect(ctx.applied).toEqual([]);
    expect(ctx.notify).toHaveBeenCalledWith(LIMIT_MESSAGE, "warn");
  });
});

describe("Delete·Backspace 로 꺾임점 지우기", () => {
  const stored = [P(300, 60), P(300, 120), P(350, 120)];

  it("고른 점을 지우면 이웃 점이 고른 채 남아 연속 Delete/Backspace 가 점을 하나씩 지우고, 마지막은 clearRoutes (표 삭제로 새지 않는다)", async () => {
    const ctx = fakeCtx({ state: withRoutes(routeOf(stored)) });
    await mount(ctx, true);
    await pickLine();
    await press(pt(1), P(300, 120));
    expect(q(pt(1))!.hasAttribute("data-selected")).toBe(true);
    expect(ctx.applied).toEqual([]);

    await key("Delete");
    expect(ctx.applied).toEqual([SET([stored[0], stored[2]])]);
    // 이웃이 고른 점: min(i, n-2) = 1 → 새 목록의 1번(= 옛 2번)
    expect(q(pt(1))!.hasAttribute("data-selected")).toBe(true);
    expect(q(pt(0))!.hasAttribute("data-selected")).toBe(false);

    await key("Backspace");
    expect(ctx.applied[1]).toEqual(SET([stored[0]]));
    expect(q(pt(0))!.hasAttribute("data-selected")).toBe(true);

    await key("Delete");
    expect(ctx.applied[2]).toEqual(CLEAR);
    expect(ctx.applied).toHaveLength(3);
    // 표를 지우는 명령은 한 번도 나가지 않았다
    expect(opsOf(ctx)).toEqual(["setRoute", "setRoute", "clearRoutes"]);
    // 점이 모두 사라진 뒤 Delete 는 고른 점이 없어 점 지우기로 가지 않는다
    await key("Delete");
    expect(routeCmds(ctx)).toHaveLength(2);
    expect(opsOf(ctx).filter((o) => o === "clearRoutes")).toHaveLength(1);
  });

  it("끝 점을 고르고 지우면 새 끝 점(이웃)이 고른 채 남는다", async () => {
    const ctx = fakeCtx({ state: withRoutes(routeOf(stored)) });
    await mount(ctx, true);
    await pickLine();
    await press(pt(2), P(350, 120));
    await key("Delete");
    expect(ctx.applied).toEqual([SET([stored[0], stored[1]])]);
    expect(q(pt(1))!.hasAttribute("data-selected")).toBe(true); // min(2, 3-2) = 1
  });

  it("고른 점이 없으면 점을 지우지 않는다(기존 Delete 동작: 고른 표 삭제만)", async () => {
    const ctx = fakeCtx({ state: withRoutes(routeOf(stored)) });
    await mount(ctx);
    await pickLine();
    await key("Delete");
    await key("Backspace");
    expect(opsOf(ctx).filter((o) => o === "setRoute" || o === "clearRoutes")).toEqual([]);
  });

  it("보조키를 누른 Delete 는 점을 지우지 않는다", async () => {
    const ctx = fakeCtx({ state: withRoutes(routeOf(stored)) });
    await mount(ctx);
    await pickLine();
    await press(pt(1), P(300, 120));
    await key("Delete", { ctrlKey: true });
    await key("Delete", { shiftKey: true });
    expect(ctx.applied).toEqual([]);
  });

  it("Esc 는 선과 함께 고른 점도 놓는다 — 다시 골라도 Delete 가 점을 지우지 않는다", async () => {
    const ctx = fakeCtx({ state: withRoutes(routeOf(stored)) });
    await mount(ctx);
    await pickLine();
    await press(pt(1), P(300, 120));
    await key("Escape");
    await pickLine();
    expect(q(pt(1))!.hasAttribute("data-selected")).toBe(false);
    await key("Delete");
    expect(routeCmds(ctx)).toEqual([]);
  });

  it("빈 곳을 누르면 고른 점도 놓는다", async () => {
    const ctx = fakeCtx({ state: withRoutes(routeOf(stored)) });
    await mount(ctx);
    await pickLine();
    await press(pt(1), P(300, 120));
    await wait(450); // 손잡이 누름 직후 400ms 안의 pane click 은 선택을 풀지 않는다(f1)
    await act(async () => {
      q<HTMLElement>(".react-flow__pane")!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await flush();
    expect(rel().hasAttribute("data-selected")).toBe(false);
    await pickLine();
    expect(q(pt(1))!.hasAttribute("data-selected")).toBe(false);
  });
});

describe("자동 배치와 꺾임점(c6)", () => {
  it("[자동 배치]는 옮긴 표에 걸린 관계의 꺾임점을 moveNodes 와 한 묶음으로 지운다", async () => {
    const ctx = fakeCtx({ state: withRoutes(routeOf([P(300, 200)])) });
    await mount(ctx);
    await act(async () => {
      q<HTMLElement>('[data-testid="erd-tool-layout"]')!.click();
    });
    await flush();
    expect(ctx.applied).toHaveLength(1);
    const ops = ctx.applied[0].commands.map((c) => c.op);
    expect(ops).toEqual(["moveNodes", "clearRoutes"]);
    expect(ctx.applied[0].commands[1]).toEqual({ op: "clearRoutes", diagram: "d-all", relations: ["r-1"] });
  });
});

describe("리뷰 반영 — 낡은 고른 점·제자리 놓기·끝 모양 두 번 누르기", () => {
  const stored = [P(300, 60), P(300, 120), P(350, 120)];

  it("점을 고른 뒤 표를 고르면(Ctrl+A) 고른 점이 풀려 Delete 가 점을 지우지 않는다", async () => {
    const ctx = fakeCtx({ state: withRoutes(routeOf(stored)) });
    await mount(ctx);
    await pickLine();
    await press(pt(1), P(300, 120));
    expect(q(pt(1))!.hasAttribute("data-selected")).toBe(true);
    await key("a", { ctrlKey: true });
    await key("a", { metaKey: true });
    expect(rel().hasAttribute("data-selected")).toBe(false);
    await key("Delete");
    expect(ctx.applied.some((a) => a.commands.some((c) => c.op === "setRoute" || c.op === "clearRoutes"))).toBe(false);
  });

  it("[자동 경로로 되돌리기] 뒤에는 고른 점이 없어 Delete 가 점을 지우지 않는다", async () => {
    const ctx = fakeCtx({ state: withRoutes(routeOf(stored)) });
    await mount(ctx, true);
    await pickLine();
    await press(pt(0), P(300, 60));
    await act(async () => {
      editing.flowProps.onEdgeContextMenu!({ preventDefault() {}, clientX: 10, clientY: 10 } as never, edge);
    });
    await flush();
    await act(async () => {
      q<HTMLElement>(tid("erd-menu-item-route-reset"))!.click();
    });
    await flush();
    expect(ctx.applied).toEqual([CLEAR]);
    await key("Delete");
    expect(ctx.applied).toEqual([CLEAR]);
  });

  it("점을 끌었다가 제자리에 놓으면 보내지 않는다", async () => {
    const ctx = fakeCtx({ state: withRoutes(routeOf([P(300, 200)])) });
    await mount(ctx);
    await pickLine();
    await down(pt(0), P(300, 200));
    await move(P(330, 230), { altKey: true });
    await move(P(300, 200), { altKey: true });
    await up(P(300, 200));
    expect(ctx.applied).toEqual([]);
  });

  it("끝 모양(까마귀발·막대)을 두 번 누르면 점을 더하지 않는다. 선 몸통은 더한다", async () => {
    const ctx = fakeCtx({ state: withRoutes(routeOf([P(300, 200)])) });
    await mount(ctx);
    for (const end of all(`${tid("erd-rel-r-1")} .erd-rel__end`)) {
      await act(async () => {
        end.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true, clientX: 250, clientY: 52 }));
      });
      await flush();
    }
    expect(ctx.applied).toEqual([]);
    await dbl(`${tid("erd-rel-r-1")} .erd-rel__sel`, P(300, 150));
    expect(ctx.applied).toHaveLength(1);
  });
});
