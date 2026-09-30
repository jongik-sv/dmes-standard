/** @vitest-environment happy-dom */

// 3단계 최종 리뷰 고침 — 내장 키 처리 끄기·끌기 중 배치 재계산 없음·메모+노드 한 칸·IME Enter·도움말 Esc.
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

const layout = vi.hoisted(() => ({ calls: 0 }));
vi.mock("@dagrejs/dagre", async (importOriginal) => {
  const real = await importOriginal<typeof import("@dagrejs/dagre")>();
  const inner = real.default ?? real;
  const wrapped = new Proxy(inner, {
    get: (t, k, r) => (k === "layout" ? (...a: Parameters<typeof inner.layout>) => (layout.calls++, t.layout(...a)) : Reflect.get(t, k, r)),
  });
  return { ...real, default: wrapped };
});

import { FlowCanvas, type FlowCanvasProps } from "../../../pages/dme/ruleSetEdit/canvas/FlowCanvas";
import { addNote, insertSplit, toEditFlow, type EditFlow } from "../../../pages/dme/ruleSetEdit/flow-edit";
import { flush, installDomStorage } from "../helpers/render";

const noop = () => {};
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  installDomStorage();
  layout.calls = 0;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
});

function baseFlow(): EditFlow {
  const r = insertSplit(toEditFlow(null, ["R_A"]), "e2", "IF");
  if (!r.ok) throw new Error(r.reason);
  return r.flow;
}
function props(over: Partial<FlowCanvasProps> = {}): FlowCanvasProps {
  return {
    flow: baseFlow(), rules: {}, checks: [], mode: "edit", varDisplay: "off", selectedId: null, selectedEdgeId: null,
    overlay: null, focusId: null, focusSeq: 0, onSelect: noop, onSelectEdge: noop, onOpenRule: noop, onMove: noop, onConnect: noop,
    onDropPalette: noop, onNoteChange: noop, breakpoints: new Set(), collapsed: new Set(), showMiniMap: false, editingCondEdgeId: null,
    onMoveNode: noop, onDropRule: noop, onContextMenu: noop, onEditCond: noop, onEditCondClose: noop, onToggleBreakpoint: noop,
    onRouteChange: noop, ...over,
  };
}
async function draw(p: FlowCanvasProps) {
  await act(async () => {
    root.render(createElement(DmesUiProvider, null, createElement("div", { style: { width: 800, height: 600 } }, createElement(FlowCanvas, p))));
  });
  await flush();
}
const nodeEl = (id: string) => document.querySelector(`.react-flow__node[data-id="${id}"]`) as HTMLElement;
const fire = (el: Element | Window, ev: Event) => act(async () => { el.dispatchEvent(ev); });
const mouse = (type: string, x: number, y: number) => new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, view: window });


// happy-dom 에서 d3-drag 가 mousedown → window mousemove → mouseup 으로 돈다.
const down = (id: string, mods: MouseEventInit = {}) =>
  fire(nodeEl(id), new MouseEvent("mousedown", { bubbles: true, cancelable: true, clientX: 100, clientY: 100, button: 0, view: window, ...mods }));
const move = (x: number, y: number) => fire(window, mouse("mousemove", x, y));
const up = (x: number, y: number) => fire(window, mouse("mouseup", x, y));

describe("내장 키 처리 끄기(Important 2)", () => {
  it("편집 모드에서 노드를 고르고 화살표 키를 눌러도 위치가 바뀌지 않고 onMove 도 없다", async () => {
    const onMove = vi.fn();
    const onMoveNode = vi.fn();
    const onNoteChange = vi.fn();
    await draw(props({ onMove, onMoveNode, onNoteChange }));
    const el = nodeEl("r1");
    const before = el.style.transform;
    await fire(el, new MouseEvent("click", { bubbles: true, cancelable: true }));
    el.focus();
    for (const key of ["ArrowRight", "ArrowRight", "ArrowDown"]) {
      await fire(el, new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    }
    await flush();
    expect(nodeEl("r1").style.transform).toBe(before);
    expect(onMove).not.toHaveBeenCalled();
    expect(onMoveNode).not.toHaveBeenCalled();
    expect(onNoteChange).not.toHaveBeenCalled();
  });
});

describe("끌기 중 배치 재계산 없음(Important 3)", () => {
  it("노드를 끄는 동안과 놓은 뒤 dagre 를 다시 돌리지 않는다", async () => {
    const onMove = vi.fn();
    await draw(props({ onMove }));
    const start = layout.calls;
    expect(start).toBeGreaterThan(0);
    await down("r1");
    await move(130, 140);
    await move(150, 160);
    expect(nodeEl("r1").style.transform).not.toBe("translate(0px,82px)");
    expect(layout.calls).toBe(start); // 끄는 동안
    await up(150, 160);
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(layout.calls).toBe(start); // 놓은 뒤(흐름이 그대로면)
  });

  it("분기(IF)를 끄는 동안에도 dagre 를 다시 돌리지 않고 블록 멤버가 함께 움직인다", async () => {
    const onMove = vi.fn();
    await draw(props({ onMove }));
    const start = layout.calls;
    const rBefore = nodeEl("r1").style.transform;
    await down("if1");
    await move(130, 140);
    await move(150, 160);
    expect(layout.calls).toBe(start);
    await up(150, 160);
    expect(layout.calls).toBe(start);
    const moved = onMove.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(moved).length).toBeGreaterThan(1);
    expect(rBefore).toBeTruthy();
  });
});

describe("메모와 노드를 함께 끌면 onMove 한 번(Minor 1)", () => {
  it("메모 위치는 onNoteChange 가 아니라 onMove 두 번째 인자로 한 번에 올라간다", async () => {
    const withNote = addNote(baseFlow(), { x: 400, y: 10 }, null).flow;
    const noteId = withNote.view.notes[0].id;
    const onMove = vi.fn();
    const onNoteChange = vi.fn();
    await draw(props({ flow: withNote, onMove, onNoteChange }));
    await fire(nodeEl(noteId), new MouseEvent("click", { bubbles: true, cancelable: true }));
    await fire(document as unknown as Element, new KeyboardEvent("keydown", { key: "Control", code: "Control", ctrlKey: true, bubbles: true }));
    await fire(nodeEl("r1"), new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true }));
    await down("r1", { ctrlKey: true });
    await move(130, 140);
    await move(150, 160);
    await up(150, 160);
    expect(onNoteChange).not.toHaveBeenCalled();
    expect(onMove).toHaveBeenCalledTimes(1);
    const [pos, notes] = onMove.mock.calls[0];
    expect(Object.keys(pos)).toContain("r1");
    expect(Object.keys(notes ?? {})).toEqual([noteId]);
  });

  it("메모만 끌어도 onMove 로 한 번 올라간다", async () => {
    const withNote = addNote(baseFlow(), { x: 400, y: 10 }, null).flow;
    const noteId = withNote.view.notes[0].id;
    const onMove = vi.fn();
    const onNoteChange = vi.fn();
    await draw(props({ flow: withNote, onMove, onNoteChange }));
    await down(noteId);
    await move(130, 140);
    await move(150, 160);
    await up(150, 160);
    expect(onNoteChange).not.toHaveBeenCalled();
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove.mock.calls[0][0]).toEqual({});
    expect(Object.keys(onMove.mock.calls[0][1])).toEqual([noteId]);
  });
});
