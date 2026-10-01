/** @vitest-environment happy-dom */
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import { FlowCanvas, catchLinkAllowed, linkAllowed, type FlowCanvasProps } from "../../../pages/dme/ruleSetEdit/canvas/FlowCanvas";
import { CATCH_HANDLE, handlesOf } from "../../../pages/dme/ruleSetEdit/canvas/nodes";
import { CATCH_KIND_LABEL } from "../../../pages/dme/ruleSetEdit/catch-text";
import { editMenu } from "../../../pages/dme/ruleSetEdit/canvas/menus/edit-menu";
import type { CanvasActions, MenuContext } from "../../../pages/dme/ruleSetEdit/canvas/context-menu";
import { addCatch, toEditFlow, type EditFlow } from "../../../pages/dme/ruleSetEdit/flow-edit";
import { guideBlockReason } from "../../../pages/dme/ruleSetEdit/state/useRuleSetEdit";
import { installDomStorage } from "../helpers/render";

const withCatch = (): EditFlow => {
  const r = addCatch(toEditFlow(null, ["R_A"]), "r1", null);
  if (!r.ok) throw new Error(r.reason);
  return r.flow;
};

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
    flow: withCatch(), rules: {}, checks: [], mode: "view", varDisplay: "off", selectedId: null, selectedEdgeId: null,
    overlay: null, focusId: null, focusSeq: 0, onSelect: noop, onSelectEdge: noop, onOpenRule: noop, onMove: noop, onConnect: noop,
    onDropPalette: noop, onNoteChange: noop,
    breakpoints: new Set(), collapsed: new Set(), showMiniMap: false, editingCondEdgeId: null, onMoveNode: noop, onDropRule: noop,
    onContextMenu: noop, onEditCond: noop, onEditCondClose: noop, onToggleBreakpoint: noop, ...over,
  };
}
async function draw(p: FlowCanvasProps) {
  await act(async () => {
    root.render(createElement(DmesUiProvider, null, createElement("div", { style: { width: 800, height: 600 } }, createElement(FlowCanvas, p))));
  });
}
const q = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

describe("받는 노드 캔버스 규칙(받는 노드 spec §8)", () => {
  it("룰 노드 연결점 목록에 예외 연결점이 있고 받는 노드는 나가는 그리기 연결점만 있다", () => {
    expect(handlesOf("RULE").map((h) => h.id)).toContain(CATCH_HANDLE);
    expect(handlesOf("CATCH").map((h) => h.id)).toEqual(["out"]);
    expect(handlesOf("TASK").map((h) => h.id)).not.toContain(CATCH_HANDLE);
  });

  it("받는 노드로 들어가는 선은 막고, 예외 연결점은 룰에서 시작·받는 노드·자기 자신이 아닌 곳으로만", () => {
    const f = withCatch();
    expect(linkAllowed(f, "r1", "c1")).toBe(false);
    expect(linkAllowed(f, "c1", "r1")).toBe(true); // 처리 갈래 첫 선의 끝 옮기기(R1) — 새 선은 받는 노드에 잇기 손잡이가 없어 시작하지 못한다
    expect(catchLinkAllowed(f, "r1", "end")).toBe(true);
    expect(catchLinkAllowed(f, "r1", "start")).toBe(false);
    expect(catchLinkAllowed(f, "r1", "c1")).toBe(false);
    expect(catchLinkAllowed(f, "r1", "r1")).toBe(false);
    expect(catchLinkAllowed(f, "end", "r1")).toBe(false);
  });

  it("룰 우클릭에 「예외 받기 추가」, 받는 노드 우클릭에 「삭제」 가 있다(편집 모드만)", () => {
    const calls: string[] = [];
    const actions = new Proxy({}, { get: (_t, k) => (...a: unknown[]) => calls.push(`${String(k)}:${a.join(",")}`) }) as unknown as CanvasActions;
    const ctx = (mode: "edit" | "view"): MenuContext => ({
      flow: withCatch(), rules: {}, mode, hasClipboard: false, selectedEdgeId: null, collapsed: new Set(), breakpoints: new Set(), canRun: true, act: actions,
    });
    const ruleItems = editMenu({ kind: "node", nodeId: "r1" }, ctx("edit"));
    ruleItems.find((i) => i.id === "catch-add")!.run!();
    expect(calls).toEqual(["addCatch:r1"]);
    expect(editMenu({ kind: "node", nodeId: "c1" }, ctx("edit")).map((i) => i.id)).toEqual(["delete"]);
    expect(editMenu({ kind: "node", nodeId: "r1" }, ctx("view"))).toEqual([]);
  });

  it("받는 노드가 있는 흐름에는 구성 지침을 적용하지 않는다(R19)", () => {
    expect(guideBlockReason(withCatch())).toBe("받는 노드가 있는 흐름에는 적용하지 않는다");
    expect(guideBlockReason(toEditFlow(null, ["R_A"]))).toBeNull();
  });

  it("종류 이름은 결과 없음·입력 오류·계산 오류·판정 충돌이다", () => {
    expect(CATCH_KIND_LABEL).toEqual({ NO_RESULT: "결과 없음", INPUT_ERROR: "입력 오류", EVAL_ERROR: "계산 오류", HIT_CONFLICT: "판정 충돌" });
  });
});
describe("받는 노드 캔버스 그리기", () => {
  it("받는 노드는 룰 아래 테두리 자리에 그려지고 끌 수 없으며, 나가는 선은 빨간 점선이다", async () => {
    await draw(props({ mode: "edit" }));
    const c1 = q("flow-node-c1")!;
    expect(c1.classList.contains("rsf-catch")).toBe(true);
    expect((c1.closest(".react-flow__node") as HTMLElement).classList.contains("draggable")).toBe(false);
    const edge = document.querySelector('.react-flow__edge[data-id="e3"]')!;
    const path = edge.querySelector("path.react-flow__edge-path") as SVGPathElement;
    expect(path.style.strokeDasharray).toBe("6 4");
  });

  it("예외 연결점은 편집 모드의 룰 노드에만 그린다", async () => {
    await draw(props({ mode: "edit" }));
    expect(q("flow-catch-handle-r1")).not.toBeNull();
    await draw(props({ mode: "view" }));
    expect(q("flow-catch-handle-r1")).toBeNull();
  });
});
