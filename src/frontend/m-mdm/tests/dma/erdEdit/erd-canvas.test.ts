/** @vitest-environment happy-dom */
import { Profiler, act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import {
  ReactFlow, ReactFlowProvider, useStoreApi, type EdgeTypes, type NodeProps, type NodeTypes, type ReactFlowState,
} from "@dk-oasis/shared/react-flow";

import { ErdRelationEdge } from "../../../pages/dma/erdEdit/canvas/ErdRelationEdge";
import { ErdTableNode } from "../../../pages/dma/erdEdit/canvas/ErdTableNode";
import { buildFlow, type ErdFlowNode } from "../../../pages/dma/erdEdit/canvas/erd-flow";
import { ZOOM_NAMES_ONLY, ZOOM_OVERVIEW, lodTier } from "../../../pages/dma/erdEdit/canvas/erd-geometry";
import { bigState } from "./erd-fixtures";

const NODE_TYPES: NodeTypes = { erdTable: ErdTableNode };
const EDGE_TYPES: EdgeTypes = { erdRelation: ErdRelationEdge };
let host: HTMLDivElement;
let root: Root | null = null;
let store: { getState(): ReactFlowState; setState(s: Partial<ReactFlowState>): void } | null = null;
let renders = 0;

/** 노드 부품 렌더 수를 센다 — Profiler 는 그 아래 무엇이든 다시 그려지면 onRender 를 부른다. */
function CountedNode(p: NodeProps<ErdFlowNode>) {
  return createElement(Profiler, { id: p.id, onRender: () => { renders++; } }, createElement(ErdTableNode, p));
}
const COUNTED_TYPES: NodeTypes = { erdTable: CountedNode };

function GrabStore() {
  store = useStoreApi() as unknown as typeof store;
  return null;
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  store = null;
  host?.remove();
});

/** 표 60개 × 컬럼 9개 = 컬럼 540개 모델을 주어진 확대율로 그린다. */
async function renderAt(zoom: number, nodeTypes: NodeTypes = NODE_TYPES) {
  const flow = buildFlow({
    state: bigState(60, 9), diagramId: "d-all", mode: "logical", preset: "basic", namesOnly: zoom < 0.5, showAudit: true,
    statuses: {}, domains: {}, selected: new Set(), mySession: "ui-me",
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(createElement(ReactFlowProvider, null, createElement("div", { style: { width: 1200, height: 800 } },
      createElement(ReactFlow, {
        nodes: flow.nodes, edges: flow.edges, nodeTypes, edgeTypes: EDGE_TYPES,
        defaultViewport: { x: 0, y: 0, zoom }, minZoom: 0.1, maxZoom: 2, fitView: false,
      }), createElement(GrabStore))));
  });
}

async function zoomTo(z: number) {
  await act(async () => {
    store!.setState({ transform: [0, 0, z] });
  });
}

describe("ERD 캔버스", () => {
  it("zoomBelowHalfRendersNamesOnly", async () => {
    await renderAt(0.4);
    expect(host.querySelectorAll(".erd-node")).toHaveLength(60);
    expect(host.querySelectorAll(".erd-col")).toHaveLength(0);
    expect(host.querySelectorAll("[data-names-only]")).toHaveLength(60);
    expect(host.querySelectorAll(".erd-node__sub")).toHaveLength(0);
    expect(host.querySelector('[data-testid="erd-node-t-0"]')?.textContent).toBe("표0");
  });

  it("확대율 50% 이상이면 컬럼 행을 모두 그린다", async () => {
    await renderAt(1);
    expect(host.querySelectorAll(".erd-col")).toHaveLength(540);
    expect(host.querySelectorAll("[data-names-only]")).toHaveLength(0);
    expect(host.querySelectorAll(".erd-node__sub")).toHaveLength(60);
    expect(host.querySelector('[data-testid="erd-col-c-0-0"] .erd-col__key')?.textContent).toBe("PK");
  });
});

describe("단계별 그리기(U50)", () => {
  it("lodTier — 0.5 이상 detail, 0.35 이상 names, 그 아래 overview", () => {
    expect(ZOOM_NAMES_ONLY).toBe(0.5);
    expect(ZOOM_OVERVIEW).toBe(0.35);
    expect(lodTier(1)).toBe("detail");
    expect(lodTier(0.5)).toBe("detail");
    expect(lodTier(0.4999)).toBe("names");
    expect(lodTier(0.35)).toBe("names");
    expect(lodTier(0.3499)).toBe("overview");
    expect(lodTier(0.1)).toBe("overview");
  });

  it("확대율 35% 미만이면 원래 높이 상자에 논리명·물리명 두 줄만 그리고 손잡이는 남긴다", async () => {
    await renderAt(0.3);
    const nodes = host.querySelectorAll<HTMLElement>('.erd-node[data-lod="overview"]');
    expect(nodes).toHaveLength(60);
    expect(host.querySelectorAll(".erd-node__hd")).toHaveLength(0);
    expect(host.querySelectorAll(".erd-col")).toHaveLength(0);
    const t0 = host.querySelector<HTMLElement>('[data-testid="erd-node-t-0"]')!;
    expect(t0.querySelector(".erd-node__ov-l")?.textContent).toBe("표0");
    expect(t0.querySelector(".erd-node__ov-p")?.textContent).toBe("TB_T000");
    // 상세 단계 높이(머리 30 + 행 9 × 20 + 테두리 2)
    expect(t0.style.height).toBe("212px");
    expect(t0.querySelectorAll(".erd-handle").length).toBeGreaterThan(0);
  });

  it("lodTierRerendersOnlyOnTierChange — 0.6 → 0.55 → 0.45 → 0.4 → 0.3 → 0.2 에서 노드는 단계가 바뀌는 두 번만 다시 그린다", async () => {
    await renderAt(0.6, COUNTED_TYPES);
    expect(host.querySelectorAll(".erd-col")).toHaveLength(540);
    renders = 0;
    await zoomTo(0.55);
    expect(renders).toBe(0);
    await zoomTo(0.45);
    expect(renders).toBe(60);
    expect(host.querySelectorAll("[data-names-only]")).toHaveLength(60);
    await zoomTo(0.4);
    expect(renders).toBe(60);
    await zoomTo(0.3);
    expect(renders).toBe(120);
    expect(host.querySelectorAll('.erd-node[data-lod="overview"]')).toHaveLength(60);
    await zoomTo(0.2);
    expect(renders).toBe(120);
  });
});
