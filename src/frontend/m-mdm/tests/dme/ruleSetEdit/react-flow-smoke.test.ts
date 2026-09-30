/** @vitest-environment happy-dom */
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { describe, expect, it } from "vitest";

import { ReactFlow, ReactFlowProvider } from "../../../pages/dme/ruleSetEdit/canvas/react-flow";

describe("React Flow 스모크", () => {
  it("크기를 준 노드 두 개와 선 하나를 그린다", async () => {
    const host = document.createElement("div");
    host.style.width = "800px";
    host.style.height = "600px";
    document.body.appendChild(host);
    const nodes = [
      { id: "a", position: { x: 0, y: 0 }, data: { label: "A" }, width: 120, height: 40 },
      { id: "b", position: { x: 0, y: 100 }, data: { label: "B" }, width: 120, height: 40 },
    ];
    const edges = [{ id: "e1", source: "a", target: "b" }];
    await act(async () => {
      createRoot(host).render(createElement(ReactFlowProvider, null, createElement("div", { style: { width: 800, height: 600 } },
        createElement(ReactFlow, { nodes, edges, fitView: false }))));
    });
    expect(host.querySelectorAll(".react-flow__node").length).toBe(2);
    expect(host.querySelector('[data-id="a"]')?.textContent).toContain("A");
  });
});
