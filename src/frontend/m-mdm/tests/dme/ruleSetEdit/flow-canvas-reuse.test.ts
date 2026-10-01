/** @vitest-environment happy-dom */
// 캔버스 다시 그리기 범위(Local-Rules §19) — 바꾸려는 prop 하나만 바꾸고 나머지는 같은 참조로 둔 채 다시 그리면, 바뀐 노드만 다시 그린다.
// 노드 객체를 재사용하지 않거나(useStableById) React Flow 에 넘기는 노드 콜백이 렌더마다 새 함수면 모든 노드가 다시 그려진다.
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import { FlowCanvas, type FlowCanvasProps } from "../../../pages/dme/ruleSetEdit/canvas/FlowCanvas";
import { FlowNodeView, NODE_TYPES } from "../../../pages/dme/ruleSetEdit/canvas/nodes";
import { setPositions, toEditFlow } from "../../../pages/dme/ruleSetEdit/flow-edit";
import { flush, installDomStorage } from "../helpers/render";

/** 다시 그린 흐름 노드 ID — FlowNodeView 를 세는 감싸개로 바꿔 둔다(NODE_TYPES 참조는 그대로라 React Flow 가 노드 종류를 다시 만들지 않는다). */
const rendered: string[] = [];
const original = NODE_TYPES.rsfFlow;
const counting: typeof FlowNodeView = (p) => {
  rendered.push(p.id);
  return FlowNodeView(p);
};
beforeAll(() => {
  NODE_TYPES.rsfFlow = counting as typeof NODE_TYPES.rsfFlow;
});
afterAll(() => {
  NODE_TYPES.rsfFlow = original;
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
const base: FlowCanvasProps = {
  flow: toEditFlow(null, ["R_A", "R_B", "R_C", "R_D", "R_E", "R_F"]), rules: {}, checks: [], mode: "edit", varDisplay: "off",
  selectedId: null, selectedEdgeId: null, overlay: null, focusId: null, focusSeq: 0, onSelect: noop, onSelectEdge: noop, onOpenRule: noop,
  onMove: noop, onConnect: noop, onDropPalette: noop, onNoteChange: noop, breakpoints: new Set(), collapsed: new Set(), showMiniMap: false,
  editingCondEdgeId: null, onMoveNode: noop, onDropRule: noop, onContextMenu: noop, onEditCond: noop, onEditCondClose: noop,
  onToggleBreakpoint: noop,
};
// 틀에 크기를 준다 — 크기 0 인 틀에서는 끄는 노드가 늘 가장자리라 React Flow 가 화면을 계속 끌어 옮기며(autoPan) 프레임마다 다시 그린다.
const draw = (p: FlowCanvasProps) =>
  act(async () => {
    root.render(createElement(DmesUiProvider, null, createElement("div", { style: { width: 800, height: 600 } }, createElement(FlowCanvas, p))));
  });
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 50)); });
const selectedOf = (id: string) => document.querySelector(`[data-testid="flow-node-${id}"]`)?.getAttribute("data-selected");
/** 다시 그린 노드 ID(중복 없음, 정렬). */
const redrawn = () => [...new Set(rendered)].sort();

describe("FlowCanvas 다시 그리기 범위", () => {
  it("선택(selectedId)만 바꾸면 이전·새 선택 노드만 다시 그린다", async () => {
    await draw(base);
    await settle();
    expect(rendered.length).toBeGreaterThan(0); // 감싸개가 살아 있다
    rendered.length = 0;
    await draw({ ...base, selectedId: "r3" });
    await settle();
    expect(redrawn()).toEqual(["r3"]);
    expect(selectedOf("r3")).toBe("true");
    rendered.length = 0;
    await draw({ ...base, selectedId: "r4" });
    await settle();
    expect(redrawn()).toEqual(["r3", "r4"]);
    expect(selectedOf("r3")).toBe("false");
    expect(selectedOf("r4")).toBe("true");
  });

  it("노드 하나만 옮긴 편집(모든 노드를 복사한 새 흐름)이면 그 노드만 다시 그린다", async () => {
    await draw(base);
    await settle();
    rendered.length = 0;
    const moved = setPositions(base.flow, { r2: { x: 900, y: 40 } });
    await draw({ ...base, flow: moved });
    await settle();
    expect(redrawn()).toEqual(["r2"]);
    const el = document.querySelector('.react-flow__node[data-id="r2"]') as HTMLElement;
    expect(el.style.transform).toBe("translate(900px,40px)");
  });

  it("노드를 끄는 프레임마다 끄는 노드만 다시 그린다", async () => {
    // happy-dom 은 틀 크기를 0 으로 재므로 끄는 점이 늘 가장자리라 React Flow 가 화면을 끝없이 끌어 옮긴다(autoPan) — 틀을 800x600 으로 흉내 낸다.
    const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(DOMRect.fromRect({ x: 0, y: 0, width: 800, height: 600 }));
    onTestFinished(() => rect.mockRestore());
    await draw(base);
    await flush();
    const el = nodeEl("r2");
    const before = el.style.transform;
    await fire(el, new MouseEvent("mousedown", { bubbles: true, cancelable: true, clientX: 100, clientY: 100, button: 0, view: window }));
    await move(110, 112); // 끌기 시작(선택이 바뀌어 r2 를 다시 그린다)
    rendered.length = 0;
    await move(130, 140);
    await move(150, 160);
    expect(nodeEl("r2").style.transform).not.toBe(before); // 끌기 프레임이 실제로 돌았다
    expect(redrawn()).toEqual(["r2"]);
    await fire(window, mouse("mouseup", 150, 160));
  });
});

const nodeEl = (id: string) => document.querySelector(`.react-flow__node[data-id="${id}"]`) as HTMLElement;
const fire = (el: Element | Window, ev: Event) => act(async () => { el.dispatchEvent(ev); });
const mouse = (type: string, x: number, y: number) => new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, view: window });
// happy-dom 에서 d3-drag 가 mousedown → window mousemove → mouseup 으로 돈다(final-fix.test.ts 와 같다).
const move = (x: number, y: number) => fire(window, mouse("mousemove", x, y));
