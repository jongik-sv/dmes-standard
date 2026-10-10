/** @vitest-environment happy-dom */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { ReactFlow, ReactFlowProvider, type EdgeTypes, type NodeTypes } from "@dk-oasis/shared/react-flow";

import { ErdRelationEdge } from "../../../pages/dma/erdEdit/canvas/ErdRelationEdge";
import { ErdTableNode } from "../../../pages/dma/erdEdit/canvas/ErdTableNode";
import { buildFlow } from "../../../pages/dma/erdEdit/canvas/erd-flow";
import { bigState } from "./erd-fixtures";

const NODE_TYPES: NodeTypes = { erdTable: ErdTableNode };
const EDGE_TYPES: EdgeTypes = { erdRelation: ErdRelationEdge };
let host: HTMLDivElement;
let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
});

/** 표 60개 × 컬럼 9개 = 컬럼 540개 모델을 주어진 확대율로 그린다. */
async function renderAt(zoom: number) {
  const flow = buildFlow({
    state: bigState(60, 9), diagramId: "d-all", mode: "logical", preset: "basic", namesOnly: zoom < 0.5,
    statuses: {}, domains: {}, selected: new Set(), mySession: "ui-me",
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(createElement(ReactFlowProvider, null, createElement("div", { style: { width: 1200, height: 800 } },
      createElement(ReactFlow, {
        nodes: flow.nodes, edges: flow.edges, nodeTypes: NODE_TYPES, edgeTypes: EDGE_TYPES,
        defaultViewport: { x: 0, y: 0, zoom }, minZoom: 0.1, maxZoom: 2, fitView: false,
      }))));
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
