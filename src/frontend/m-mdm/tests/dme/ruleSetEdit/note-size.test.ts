/** @vitest-environment happy-dom */

// 메모 크기 손잡이 — 계산(dragNoteSize), 편집 모드에서 고른 메모에만 보임, 끄는 동안 캔버스 안에서만·놓을 때 한 번(onNoteChange {w,h}), 범위 자르기, 되돌리기.
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import { FlowCanvas, type FlowCanvasProps } from "../../../pages/dme/ruleSetEdit/canvas/FlowCanvas";
import { NOTE_GRIPS, NOTE_H_MAX, NOTE_H_MIN, NOTE_W_MAX, NOTE_W_MIN, dragNoteSize } from "../../../pages/dme/ruleSetEdit/canvas/note-size";
import { addNote, setPositions, toEditFlow, flowJsonOf, updateNote, type EditFlow, type FlowPos } from "../../../pages/dme/ruleSetEdit/flow-edit";
import { clearLayoutCache } from "../../../pages/dme/ruleSetEdit/flow-layout";
import { flush, installDomStorage } from "../helpers/render";

const P = (x: number, y: number): FlowPos => ({ x, y });
const base = () => setPositions(toEditFlow(null, ["NG_A", "NG_B"]), { start: P(0, 0), r1: P(0, 150), r2: P(0, 300), end: P(0, 450) });
const withNote = (): { flow: EditFlow; id: string } => addNote(base(), P(300, 150), null);

describe("dragNoteSize — 손잡이 끌기 계산", () => {
  const B = { w: 160, h: 80 };
  it("e 는 너비만, s 는 높이만, se 는 둘 다 — 정수로 반올림", () => {
    expect(NOTE_GRIPS).toEqual(["e", "s", "se"]);
    expect(dragNoteSize(B, "e", 40.4, 30)).toEqual({ w: 200, h: 80 });
    expect(dragNoteSize(B, "s", 40, 30.6)).toEqual({ w: 160, h: 111 });
    expect(dragNoteSize(B, "se", 40, 30)).toEqual({ w: 200, h: 110 });
  });
  it("최소·최대로 자른다", () => {
    expect(dragNoteSize(B, "se", -1000, -1000)).toEqual({ w: NOTE_W_MIN, h: NOTE_H_MIN });
    expect(dragNoteSize(B, "se", 5000, 5000)).toEqual({ w: NOTE_W_MAX, h: NOTE_H_MAX });
  });
});

describe("updateNote 크기 — 저장 JSON 까지 이어진다", () => {
  it("w·h 를 바꾸면 흐름 JSON 의 view.notes 에 그대로 실린다", () => {
    const { flow, id } = withNote();
    const f = updateNote(flow, id, { w: 300, h: 140 });
    const json = JSON.parse(flowJsonOf(f)) as { view: { notes: { id: string; w: number; h: number }[] } };
    expect(json.view.notes.find((n) => n.id === id)).toMatchObject({ w: 300, h: 140 });
  });
});

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  installDomStorage();
  clearLayoutCache();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const noop = () => {};
function props(over: Partial<FlowCanvasProps> = {}): FlowCanvasProps {
  return {
    flow: base(), rules: {}, checks: [], mode: "edit", varDisplay: "off", selectedId: null, selectedEdgeId: null,
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
const q = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const grips = (id: string) => [...document.querySelectorAll(`[data-testid^="flow-notegrip-${id}-"]`)].map((e) => e.getAttribute("data-grip"));
const box = (id: string) => {
  const el = document.querySelector(`.react-flow__node[data-id="${id}"]`) as HTMLElement;
  return { w: parseFloat(el.style.width), h: parseFloat(el.style.height) };
};
const fire = async (el: Element | Window, type: string, init: MouseEventInit = {}) =>
  act(async () => { el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init })); });
async function dragGrip(testId: string, dx: number, dy: number, release = true) {
  await fire(q(testId)!, "pointerdown", { clientX: 0, clientY: 0, button: 0 });
  await fire(window, "pointermove", { clientX: dx / 2, clientY: dy / 2, buttons: 1 });
  await fire(window, "pointermove", { clientX: dx, clientY: dy, buttons: 1 });
  if (release) await fire(window, "pointerup", { clientX: dx, clientY: dy });
}

describe("FlowCanvas 메모 크기 손잡이", () => {
  it("편집 모드에서 고른 메모에만 e·s·se 손잡이가 뜬다(nodrag nopan)", async () => {
    const { flow, id } = withNote();
    await draw(props({ flow, selectedId: id }));
    expect(grips(id)).toEqual(["e", "s", "se"]);
    const cl = q(`flow-notegrip-${id}-se`)!.classList;
    expect(cl.contains("nodrag") && cl.contains("nopan")).toBe(true);
    await draw(props({ flow, selectedId: null }));
    expect(grips(id)).toEqual([]);
    await draw(props({ flow, selectedId: id, mode: "view" }));
    expect(grips(id)).toEqual([]);
  });

  it("se 를 끌면 끄는 동안 커지고 놓을 때 onNoteChange 를 {w,h} 로 한 번 부른다", async () => {
    const { flow, id } = withNote();
    const onNoteChange = vi.fn();
    await draw(props({ flow, selectedId: id, onNoteChange }));
    await dragGrip(`flow-notegrip-${id}-se`, 100, 50, false);
    expect(box(id)).toEqual({ w: 260, h: 130 });
    expect(onNoteChange).not.toHaveBeenCalled();
    await fire(window, "pointerup", { clientX: 100, clientY: 50 });
    expect(onNoteChange).toHaveBeenCalledTimes(1);
    expect(onNoteChange).toHaveBeenCalledWith(id, { w: 260, h: 130 });
  });

  it("손잡이를 끌고 놓아도 글 칸이 열리지 않는다(놓을 때 손잡이에서 오는 click 무시)", async () => {
    const { flow, id } = withNote();
    await draw(props({ flow, selectedId: id }));
    await dragGrip(`flow-notegrip-${id}-se`, 100, 50);
    await fire(q(`flow-notegrip-${id}-se`)!, "click", { clientX: 100, clientY: 50 });
    expect(q(`flow-note-text-${id}`)).toBeNull();
  });

  it("끌어 줄여도 최소 아래로 가지 않고, 안 움직이면 부르지 않는다", async () => {
    const { flow, id } = withNote();
    const onNoteChange = vi.fn();
    await draw(props({ flow, selectedId: id, onNoteChange }));
    await dragGrip(`flow-notegrip-${id}-se`, -1000, -1000);
    expect(onNoteChange).toHaveBeenCalledWith(id, { w: NOTE_W_MIN, h: NOTE_H_MIN });
    onNoteChange.mockClear();
    await dragGrip(`flow-notegrip-${id}-e`, 0, 0);
    expect(onNoteChange).not.toHaveBeenCalled();
  });
});
