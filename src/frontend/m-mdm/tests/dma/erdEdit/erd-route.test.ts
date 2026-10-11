/** @vitest-environment happy-dom */
import { act, createElement as h, useMemo } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import {
  ReactFlow, ReactFlowProvider, useReactFlow, type EdgeProps, type NodeTypes,
} from "@dk-oasis/shared/react-flow";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import { ErdRelationEdge } from "../../../pages/dma/erdEdit/canvas/ErdRelationEdge";
import { ErdTableNode } from "../../../pages/dma/erdEdit/canvas/ErdTableNode";
import { buildFlow, type ErdFlowEdge, type ErdFlowNode } from "../../../pages/dma/erdEdit/canvas/erd-flow";
import {
  MAX_ROUTE_POINTS, insertPoint, movePoint, polylinePath, removePoint, segmentMids, tidyPoints,
} from "../../../pages/dma/erdEdit/canvas/erd-route";
import { useCanvasEditing, type CanvasEditing } from "../../../pages/dma/erdEdit/canvas/useCanvasEditing";
import type { ErdEditContext } from "../../../pages/dma/erdEdit/edit-context";
import type { ErdDiagramRoute, ErdState } from "../../../pages/dma/erdEdit/types";
import { flush } from "../../dme/helpers/render";
import { deny, fakeCtx, type FakeCtx } from "./erd-canvas-fixtures";
import { MENU_DIAGRAMS, menuModel, stateOf } from "./erd-fixtures";

const withRoutes = (routes: ErdDiagramRoute[]): ErdState => {
  const s = stateOf(menuModel(), MENU_DIAGRAMS);
  return { ...s, routes: Object.fromEntries(routes.map((r) => [`${r.diagram}:${r.relation}`, r])) };
};

describe("경유점 순수 계산(c5)", () => {
  const pts = [{ x: 100, y: 0 }, { x: 100, y: 100 }];
  it("옮기기·넣기·지우기는 정수 좌표로 새 목록을 만든다. 50개 상한", () => {
    expect(movePoint(pts, 1, { x: 120.6, y: 99.2 })).toEqual([{ x: 100, y: 0 }, { x: 121, y: 99 }]);
    expect(insertPoint(pts, 1, { x: 50, y: 50 })).toEqual([{ x: 100, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 100 }]);
    expect(insertPoint(pts, 0, { x: 1, y: 1 })[0]).toEqual({ x: 1, y: 1 });
    expect(removePoint(pts, 0)).toEqual([{ x: 100, y: 100 }]);
    const full = Array.from({ length: MAX_ROUTE_POINTS }, (_, k) => ({ x: k, y: k }));
    expect(insertPoint(full, 3, { x: 9, y: 9 })).toHaveLength(MAX_ROUTE_POINTS);
  });

  it("한 줄이 된 점·겹친 점은 정리 대상, 꺾은선 path·마디 가운데", () => {
    // 끝(0,0) → (50,0) → (100,0)끝 : 가운데 점은 한 줄 위
    expect(tidyPoints([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }])).toEqual([0]);
    expect(tidyPoints([{ x: 0, y: 0 }, { x: 50, y: 40 }, { x: 100, y: 0 }])).toEqual([]);
    // 서로 가까운 두 꺾임점은 하나만 지운다(둘 다 지워 자동 경로로 돌아가지 않게)
    expect(tidyPoints([{ x: 0, y: 0 }, { x: 50, y: 40 }, { x: 52, y: 41 }, { x: 100, y: 0 }])).toHaveLength(1);
    // 선분 밖으로 되돌아가는 점은 남긴다
    expect(tidyPoints([{ x: 0, y: 0 }, { x: 150, y: 0 }, { x: 100, y: 0 }])).toEqual([]);
    expect(polylinePath([{ x: 0, y: 0 }, { x: 10, y: 5 }])).toBe("M0,0 L10,5");
    expect(segmentMids([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 45, y: 0 }])).toEqual([{ x: 20, y: 0 }, null]);
  });

  it("buildFlow 는 이 다이어그램의 route 만 선에 싣는다. 모델에 없는 관계의 route 는 그리지 않는다", () => {
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
    id: "r-1", source: "t-1", target: "t-2", sourceX: 242, sourceY: 50, targetX: 398, targetY: 150,
    sourcePosition: "right", targetPosition: "left", data: { state: "CONFIRMED", folded: 0, zeroChild: false, route },
  } as unknown as EdgeProps<ErdFlowEdge>;
  return h("svg", null, h(ErdRelationEdge, props));
}

function Harness({ ctx }: { ctx: ErdEditContext }) {
  const rf = useReactFlow<ErdFlowNode, ErdFlowEdge>();
  const e = useCanvasEditing(ctx, rf);
  editing = e;
  const flow = useMemo(
    () => buildFlow({
      state: ctx.state, diagramId: ctx.diagramId, mode: "logical", preset: "basic", namesOnly: false, showAudit: true,
      statuses: {}, domains: {}, selected: new Set(), mySession: ctx.session,
    }),
    [ctx.state, ctx.diagramId, ctx.session],
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

async function mount(ctx: FakeCtx) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(h(DmesUiProvider, null, h(ReactFlowProvider, null, h(Harness, { ctx }))));
  });
  await flush();
}

const edge = { id: "r-1" } as ErdFlowEdge;
const rel = () => host.querySelector('[data-testid="erd-rel-r-1"]')!;
const q = <T extends Element>(sel: string) => document.querySelector<T>(sel);

async function pickLine() {
  await act(async () => {
    editing.flowProps.onEdgeClick!({} as never, edge);
  });
  await flush();
}

async function dragFrom(sel: string, to: { x: number; y: number }) {
  const el = q<SVGElement>(sel);
  if (!el) throw new Error(`없는 요소: ${sel}`);
  await act(async () => {
    el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, clientX: 0, clientY: 0 }));
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: to.x, clientY: to.y, buttons: 1 }));
    window.dispatchEvent(new PointerEvent("pointerup", { clientX: to.x, clientY: to.y }));
  });
  await flush();
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
});

describe("관계선 꺾임점 편집(c5)", () => {
  it("선을 누르면 고르고 손잡이를 보인다. Esc·빈 곳 누르기로 놓는다", async () => {
    const ctx = fakeCtx({ state: withRoutes([{ diagram: "d-all", relation: "r-1", points: [{ x: 300, y: 200 }] }]) });
    await mount(ctx);
    expect(rel().hasAttribute("data-selected")).toBe(false);
    expect(rel().getAttribute("data-routed")).toBe("");
    // 손잡이 → 그리기 전용 꼬리(변 방향) → 꺾임점 → 꼬리 → 손잡이
    expect(rel().querySelector(".erd-rel__line")?.getAttribute("d")).toBe("M242,50 L270,50 L300,200 L370,150 L398,150");
    await pickLine();
    expect(rel().hasAttribute("data-selected")).toBe(true);
    expect(q('[data-testid="erd-rel-bend-r-1-0"]')).not.toBeNull();
    expect(q('[data-testid="erd-rel-mid-r-1-0"]')).not.toBeNull();
    await act(async () => {
      host.querySelector<HTMLElement>('[data-testid="erd-host"]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });
    await flush();
    expect(rel().hasAttribute("data-selected")).toBe(false);
  });

  it("꺾임점을 끌면 놓을 때 setRoute 한 번, 두 번 누르면 지운다(마지막이면 clearRoutes)", async () => {
    const ctx = fakeCtx({ state: withRoutes([{ diagram: "d-all", relation: "r-1", points: [{ x: 300, y: 200 }] }]) });
    await mount(ctx);
    await pickLine();
    await dragFrom('[data-testid="erd-rel-bend-r-1-0"]', { x: 320, y: 260 });
    expect(ctx.applied).toEqual([{ commands: [{ op: "setRoute", diagram: "d-all", relation: "r-1", points: [{ x: 320, y: 260 }] }], label: "꺾임점 바꾸기" }]);
    await act(async () => {
      q('[data-testid="erd-rel-bend-r-1-0"]')!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
    });
    await flush();
    expect(ctx.applied[1]).toEqual({ commands: [{ op: "clearRoutes", diagram: "d-all", relations: ["r-1"] }], label: "자동 경로로 되돌리기" });
  });

  it("실제 마우스 순서(누름·뗌·click ×2 → dblclick)로 꺾임점을 두 번 눌러도 첫 click 에 선택이 풀리지 않고 지워진다(f1)", async () => {
    const ctx = fakeCtx({ state: withRoutes([{ diagram: "d-all", relation: "r-1", points: [{ x: 300, y: 200 }] }]) });
    await mount(ctx);
    await pickLine();
    const bend = '[data-testid="erd-rel-bend-r-1-0"]';
    // 실제 브라우저는 손잡이를 누른 뒤의 click 을 빈 곳(pane)으로 보내 onPaneClick 이 선택을 풀 수 있다.
    const press = async () => {
      await act(async () => {
        const el = q<SVGElement>(bend);
        if (!el) throw new Error("꺾임점 손잡이가 사라졌다");
        el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, clientX: 5, clientY: 5 }));
        window.dispatchEvent(new PointerEvent("pointerup", { clientX: 5, clientY: 5 }));
        q<HTMLElement>(".react-flow__pane")!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
      });
      await flush();
    };
    await press();
    expect(q(bend)).not.toBeNull();
    await press();
    await act(async () => {
      q(bend)!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
    });
    await flush();
    expect(ctx.applied).toEqual([{ commands: [{ op: "clearRoutes", diagram: "d-all", relations: ["r-1"] }], label: "자동 경로로 되돌리기" }]);
  });

  it("손잡이를 누르지 않은 빈 곳 누르기는 여전히 선택을 푼다", async () => {
    const ctx = fakeCtx({ state: withRoutes([{ diagram: "d-all", relation: "r-1", points: [{ x: 300, y: 200 }] }]) });
    await mount(ctx);
    await pickLine();
    await act(async () => {
      q<HTMLElement>(".react-flow__pane")!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await flush();
    expect(rel().hasAttribute("data-selected")).toBe(false);
  });

  it("자동 경로 선의 가운데 손잡이를 끌면 꺾임점 하나로 setRoute. 누르기만 하면 보내지 않는다", async () => {
    const ctx = fakeCtx();
    await mount(ctx);
    await pickLine();
    expect(q('[data-testid="erd-rel-bend-r-1-0"]')).toBeNull();
    const mid = q<SVGElement>('[data-testid="erd-rel-mid-r-1-0"]')!;
    await act(async () => {
      mid.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, clientX: 0, clientY: 0 }));
      window.dispatchEvent(new PointerEvent("pointerup", { clientX: 0, clientY: 0 }));
    });
    await flush();
    expect(ctx.applied).toEqual([]);
    await dragFrom('[data-testid="erd-rel-mid-r-1-0"]', { x: 330, y: 300 });
    expect(ctx.applied).toEqual([{ commands: [{ op: "setRoute", diagram: "d-all", relation: "r-1", points: [{ x: 330, y: 300 }] }], label: "꺾임점 바꾸기" }]);
  });

  it("선 메뉴 [자동 경로로 되돌리기] = clearRoutes. 꺾임점이 없으면 꺼져 있다", async () => {
    const ctx = fakeCtx({ state: withRoutes([{ diagram: "d-all", relation: "r-1", points: [{ x: 300, y: 200 }] }]) });
    await mount(ctx);
    await act(async () => {
      editing.flowProps.onEdgeContextMenu!({ preventDefault() {}, clientX: 10, clientY: 10 } as never, edge);
    });
    await flush();
    await act(async () => {
      q<HTMLElement>('[data-testid="erd-menu-item-route-reset"]')!.click();
    });
    await flush();
    expect(ctx.applied).toEqual([{ commands: [{ op: "clearRoutes", diagram: "d-all", relations: ["r-1"] }], label: "자동 경로로 되돌리기" }]);
  });

  it("다이어그램 편집 권한이 없으면 골라도 손잡이가 없다", async () => {
    const ctx = fakeCtx({
      state: withRoutes([{ diagram: "d-all", relation: "r-1", points: [{ x: 300, y: 200 }] }]),
      rights: { ...fakeCtx().rights, diagram: deny("보기 전용입니다.") },
    });
    await mount(ctx);
    await pickLine();
    expect(rel().hasAttribute("data-selected")).toBe(true);
    expect(q('[data-testid="erd-rel-bend-r-1-0"]')).toBeNull();
  });
});

describe("자동 배치와 꺾임점(c6)", () => {
  it("[자동 배치]는 옮긴 표에 걸린 관계의 꺾임점을 moveNodes 와 한 묶음으로 지운다", async () => {
    const ctx = fakeCtx({ state: withRoutes([{ diagram: "d-all", relation: "r-1", points: [{ x: 300, y: 200 }] }]) });
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
