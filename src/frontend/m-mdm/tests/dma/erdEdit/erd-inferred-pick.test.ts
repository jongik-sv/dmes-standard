/** @vitest-environment happy-dom */
// Task 6 A — 추정 관계선(점선) 눌림 영역과 검토 패널 추정 탭 행 고르기(InferredPick 저장소).
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReactFlowProvider, type EdgeProps } from "@dk-oasis/shared/react-flow";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import { ErdRelationEdge, RelationPickContext } from "../../../pages/dma/erdEdit/canvas/ErdRelationEdge";
import type { ErdFlowEdge } from "../../../pages/dma/erdEdit/canvas/erd-flow";
import { ReviewPanel, createInferredPick, type InferredPick, type ReviewPanelProps } from "../../../pages/dma/erdEdit/panels/ReviewPanel";
import { flush, settleGrid } from "../../dme/helpers/render";
import { menuModel, relation } from "./erd-fixtures";

let host: HTMLDivElement;
let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
});

async function render(el: ReturnType<typeof h>) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(h(DmesUiProvider, null, el));
  });
  await flush();
}

/** happy-dom 은 손잡이를 재지 못해 React Flow 가 선을 그리지 않는다. 같은 선 부품을 손잡이 점으로 직접 그린다(erd-canvas-editing 의 ProbeEdge 와 같은 방식). */
const edgeProps = (id: string, state: "INFERRED" | "CONFIRMED") => ({
  id, source: "t-1", target: "t-2", sourceX: 242, sourceY: 50, targetX: 398, targetY: 150, sourcePosition: "right", targetPosition: "left",
  data: { state, folded: 0, zeroChild: false },
}) as unknown as EdgeProps<ErdFlowEdge>;

function renderEdges(onPick: ((id: string) => void) | null) {
  return render(h(ReactFlowProvider, null, h(RelationPickContext.Provider, { value: onPick },
    h("svg", null, h(ErdRelationEdge, edgeProps("r-1", "INFERRED")), h(ErdRelationEdge, edgeProps("r-9", "CONFIRMED"))))));
}

const byTestId = (id: string) => host.querySelector<SVGElement>(`[data-testid="${id}"]`);

describe("추정 관계선 눌림 영역(Task 6)", () => {
  it("추정 선 위의 투명 눌림 영역을 누르면 관계 id 로 콜백을 부른다(본선 클래스는 붙지 않는다)", async () => {
    const onPick = vi.fn();
    await renderEdges(onPick);
    const hit = byTestId("erd-rel-hit-r-1")!;
    expect(hit).not.toBeNull();
    expect(hit.classList.contains("erd-rel__hit")).toBe(true);
    expect(hit.classList.contains("react-flow__edge-path")).toBe(false);
    expect(hit.getAttribute("d")).toBe(host.querySelector('[data-testid="erd-rel-r-1"] .erd-rel__line')?.getAttribute("d"));
    expect(hit.getAttribute("stroke")).toBe("transparent");
    expect(hit.getAttribute("pointer-events")).toBe("stroke");
    await act(async () => {
      hit.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith("r-1");
  });

  it("누름은 위로 번지지 않는다(stopPropagation)", async () => {
    const onPick = vi.fn();
    const outer = vi.fn();
    await render(h("div", { onClick: outer }, h(ReactFlowProvider, null, h(RelationPickContext.Provider, { value: onPick },
      h("svg", null, h(ErdRelationEdge, edgeProps("r-1", "INFERRED")))))));
    await act(async () => {
      byTestId("erd-rel-hit-r-1")!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    expect(onPick).toHaveBeenCalledWith("r-1");
    expect(outer).not.toHaveBeenCalled();
  });

  it("확정 선에는 눌림 영역이 없고, 본선 path 는 선마다 하나씩이다", async () => {
    await renderEdges(vi.fn());
    expect(byTestId("erd-rel-hit-r-9")).toBeNull();
    expect(byTestId("erd-rel-r-9")).not.toBeNull();
    expect(host.querySelectorAll("path.react-flow__edge-path")).toHaveLength(2);
  });

  it("콜백(Provider)이 없으면 추정 선에도 눌림 영역을 그리지 않는다", async () => {
    await renderEdges(null);
    expect(byTestId("erd-rel-r-1")).not.toBeNull();
    expect(byTestId("erd-rel-hit-r-1")).toBeNull();
  });
});

describe("InferredPick 저장소", () => {
  it("값이 바뀔 때만 구독자를 부르고, 해지하면 더는 부르지 않는다", () => {
    const pick = createInferredPick();
    const fn = vi.fn();
    const off = pick.subscribe(fn);
    expect(pick.get()).toBeNull();
    pick.set("r-1");
    pick.set("r-1");
    expect(pick.get()).toBe("r-1");
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    pick.set(null);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(pick.get()).toBeNull();
  });
});

describe("검토 패널 추정 탭 행 고르기(Task 6)", () => {
  function twoInferred() {
    const model = menuModel();
    model.relations["r-2"] = relation("t-1", "t-2", [["c-4", "c-3"]], { state: "INFERRED", evidence: [{ kind: "NAME_RULE", ref: "이름 일치" }] });
    return model;
  }
  const panel = (pick: InferredPick | undefined, over: Partial<ReviewPanelProps> = {}) => h(ReviewPanel, {
    ctx: null, model: twoInferred(), status: null, tab: "inferred", onTab: () => undefined, diff: null, history: null,
    onReloadDiff: () => undefined, onReloadHistory: () => undefined, onDecide: () => undefined, onSelectTable: () => undefined,
    locked: false, lockReason: null, mySession: "ui-me", canUndo: false, undoReason: null, onUndo: () => undefined,
    collapsed: false, onToggle: () => undefined, pick, ...over,
  });
  const row = (id: string) => host.querySelector<HTMLElement>(`.ag-row[row-id="${id}"]`);
  const highlighted = () => [...host.querySelectorAll(".ag-row.ag-row-highlighted")].map((e) => e.getAttribute("row-id"));

  it("저장소의 id 행에 커서(.ag-row-highlighted)가 붙고, 저장소를 바꾸면 커서가 옮겨 간다", async () => {
    const pick = createInferredPick();
    pick.set("r-2");
    await render(panel(pick));
    await settleGrid(host.querySelector('[data-testid="erd-review-inferred"]')!);
    expect(row("r-1")).not.toBeNull();
    expect(highlighted()).toEqual(["r-2"]);
    await act(async () => {
      pick.set("r-1");
    });
    await settleGrid(host.querySelector('[data-testid="erd-review-inferred"]')!);
    expect(highlighted()).toEqual(["r-1"]);
  });

  it("추정 행을 누르면 자식 표를 고르고 저장소도 그 행으로 바뀐다", async () => {
    const pick = createInferredPick();
    const onSelectTable = vi.fn();
    await render(panel(pick, { onSelectTable }));
    await settleGrid(host.querySelector('[data-testid="erd-review-inferred"]')!);
    expect(highlighted()).toEqual([]);
    await act(async () => {
      row("r-2")!.querySelector<HTMLElement>("[col-id='child']")!.click();
    });
    await flush();
    expect(onSelectTable).toHaveBeenCalledWith("t-1");
    expect(pick.get()).toBe("r-2");
    expect(highlighted()).toEqual(["r-2"]);
  });

  it("pick 를 안 넘기면(옛 호출) 그리드가 커서를 스스로 관리한다", async () => {
    await render(panel(undefined));
    await settleGrid(host.querySelector('[data-testid="erd-review-inferred"]')!);
    expect(highlighted()).toEqual([]);
    await act(async () => {
      row("r-1")!.querySelector<HTMLElement>("[col-id='child']")!.click();
    });
    await flush();
    expect(highlighted()).toEqual(["r-1"]);
  });
});
