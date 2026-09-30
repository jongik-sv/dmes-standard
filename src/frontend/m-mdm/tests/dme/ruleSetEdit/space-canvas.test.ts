/** @vitest-environment happy-dom */

// S1 — 흐름 캔버스 공간 넓히기([공간] 토글·Alt+끌기)와 끌어서 영역 선택(Figma 방식 이동 조작 props).
import { createElement, act } from "react";
import { createRoot } from "react-dom/client";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ openRuleEdit: vi.fn(), openMdmPage: vi.fn(), layoutCalls: 0, rfProps: [] as Record<string, unknown>[] }));
vi.mock("@/dme/rule-handoff", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/dme/rule-handoff")>()),
  openRuleEdit: (...args: unknown[]) => mocks.openRuleEdit(...args),
}));
vi.mock("@/shell", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shell")>()),
  openMdmPage: (...args: unknown[]) => mocks.openMdmPage(...args),
}));
vi.mock("@dagrejs/dagre", async (importOriginal) => {
  const real = await importOriginal<typeof import("@dagrejs/dagre")>();
  const inner = real.default ?? real;
  const wrapped = new Proxy(inner, {
    get: (t, k, r) => (k === "layout" ? (...a: Parameters<typeof inner.layout>) => (mocks.layoutCalls++, t.layout(...a)) : Reflect.get(t, k, r)),
  });
  return { ...real, default: wrapped };
});
// React Flow 에 넘긴 props 를 적어 둔다(그리기는 진짜 ReactFlow 가 한다).
vi.mock("../../../pages/dme/ruleSetEdit/canvas/react-flow", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../pages/dme/ruleSetEdit/canvas/react-flow")>();
  const Spy = (p: Record<string, unknown>) => {
    mocks.rfProps.push(p);
    return createElement(real.ReactFlow as never, p as never);
  };
  return { ...real, ReactFlow: Spy };
});

import { addNote, insertSplit, setRoute, toEditFlow, type EditFlow, type EditResult, type FlowPos } from "../../../pages/dme/ruleSetEdit/flow-edit";
import { drawnPositions, foldOffsetX, shiftSpace } from "../../../pages/dme/ruleSetEdit/flow-layout";
import { FlowCanvas, type FlowCanvasProps } from "../../../pages/dme/ruleSetEdit/canvas/FlowCanvas";
import type { RuleIo, RuleSetView } from "../../../pages/dme/ruleSetEdit/types";
import { flush, installDomStorage } from "../helpers/render";
import { byTestId, calls, click, installServer, openSet, q, uninstallServer } from "../helpers/rule-set-page";

function ok(r: EditResult): EditFlow {
  if (!r.ok) throw new Error(r.reason);
  return r.flow;
}
/** start → r1 → r2 → r3 → end. 선 e1(start→r1) e2(r1→r2) e3(r2→r3) e4(r3→end). */
const chain = () => toEditFlow(null, ["SC_A", "SC_B", "SC_C"]);
const lastRf = () => mocks.rfProps[mocks.rfProps.length - 1];

const fire = (el: Element | Window, type: string, init: MouseEventInit = {}) =>
  act(async () => {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, view: window, ...init }));
  });
const pane = () => document.querySelector(".react-flow__pane") as HTMLElement;
const nodeEl = (id: string) => document.querySelector(`.react-flow__node[data-id="${id}"]`) as HTMLElement;
const xy = (s: string) => {
  const m = /translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(s)!;
  return { x: Number(m[1]), y: Number(m[2]) };
};
const at = (id: string): FlowPos => {
  const p = xy(nodeEl(id).style.transform);
  return { x: Math.round(p.x), y: Math.round(p.y) };
};
/** 뷰포트 변환(이동·배율) — 흐름 좌표를 화면 좌표로 바꿀 때 쓴다(happy-dom 은 캔버스 상자가 0,0 이다). */
function viewport() {
  const t = (document.querySelector(".react-flow__viewport") as HTMLElement).style.transform;
  const p = xy(t);
  const k = Number(/scale\(\s*([\d.]+)\s*\)/.exec(t)?.[1] ?? 1);
  return { tx: p.x, ty: p.y, k };
}
const screenOf = (p: FlowPos) => {
  const v = viewport();
  return { clientX: p.x * v.k + v.tx, clientY: p.y * v.k + v.ty };
};
/** 빈 곳(pane)에서 누르고 화면 거리만큼 두 번에 나눠 끈다(첫 번째는 임계값 아래). */
async function spaceDrag(from: FlowPos, dx: number, dy: number, mods: MouseEventInit = {}, release = true) {
  const s = screenOf(from);
  await fire(pane(), "pointerdown", { ...s, ...mods });
  await fire(pane(), "mousedown", { ...s, ...mods });
  await fire(window, "pointermove", { clientX: s.clientX + Math.sign(dx) * 2, clientY: s.clientY + Math.sign(dy) * 2 });
  await fire(window, "pointermove", { clientX: s.clientX + dx, clientY: s.clientY + dy });
  if (release) {
    await fire(window, "pointerup", { clientX: s.clientX + dx, clientY: s.clientY + dy });
    await fire(window, "mouseup", { clientX: s.clientX + dx, clientY: s.clientY + dy });
  }
}
const guide = () => document.querySelector('[data-testid="flow-space-guide"]') as HTMLElement | null;

describe("FlowCanvas — 공간 넓히기", () => {
  const noop = () => {};
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  beforeEach(() => {
    installDomStorage();
    mocks.layoutCalls = 0;
    mocks.rfProps = [];
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });
  const props = (over: Partial<FlowCanvasProps> = {}): FlowCanvasProps => ({
    flow: chain(), rules: {}, checks: [], mode: "edit", showVars: false, selectedId: null, selectedEdgeId: null,
    overlay: null, focusId: null, focusSeq: 0, onSelect: noop, onSelectEdge: noop, onOpenRule: noop, onMove: noop, onConnect: noop,
    onDropPalette: noop, onNoteChange: noop, breakpoints: new Set(), collapsed: new Set(), showMiniMap: false, editingCondEdgeId: null,
    onMoveNode: noop, onDropRule: noop, onContextMenu: noop, onEditCond: noop, onEditCondClose: noop, onToggleBreakpoint: noop,
    onRouteChange: noop, ...over,
  });
  const draw = async (p: FlowCanvasProps) => {
    await act(async () => {
      root.render(createElement(DmesUiProvider, null, createElement("div", { style: { width: 800, height: 600 } }, createElement(FlowCanvas, p))));
    });
    await flush();
  };

  it("[공간] 켜고 빈 곳을 아래로 끌면 — 임계값 뒤 세로로 정하고, 기준선 너머 노드·메모·꺾는 점만 미리 옮기고, 놓을 때 한 번 올리고 토글을 끈다", async () => {
    let f = addNote(chain(), { x: 400, y: 0 }, null).flow; // 메모 위치는 아래에서 다시 둔다
    const onShiftSpace = vi.fn();
    const onSpaceToolChange = vi.fn();
    const onSelect = vi.fn();
    await draw(props({ flow: f, spaceTool: true, onShiftSpace, onSpaceToolChange, onSelect }));
    const base = { start: at("start"), r1: at("r1"), r2: at("r2"), r3: at("r3"), end: at("end") };
    // 메모는 r2 와 같은 높이 오른쪽, 꺾는 점은 r2 와 r3 사이(e3) — 둘 다 기준선(r2 위 10) 너머.
    const noteId = f.view.notes[0].id;
    f = { ...f, view: { ...f.view, notes: [{ ...f.view.notes[0], x: base.r2.x + 300, y: base.r2.y }] } };
    f = ok(setRoute(f, "e3", [{ x: base.r2.x + 260, y: base.r3.y - 20 }]));
    await draw(props({ flow: f, spaceTool: true, onShiftSpace, onSpaceToolChange, onSelect, selectedEdgeId: "e3" }));
    const handleAt = () => xy((document.querySelector('[data-testid="flow-route-handle-e3-0"]')!.parentElement as HTMLElement).style.transform);
    const handle0 = handleAt();
    const layoutStart = mocks.layoutCalls;
    const k = viewport().k;

    const press = { x: base.r1.x + 10, y: base.r2.y - 10 };
    await spaceDrag(press, 3, 90, {}, false);
    // 끄는 동안 — 방향 세로, 기준선 표시, 너머만 미리 이동
    expect(guide()?.getAttribute("data-axis")).toBe("y");
    const d = Math.round(90 / k);
    expect(at("start")).toEqual(base.start);
    expect(at("r1")).toEqual(base.r1);
    for (const id of ["r2", "r3", "end"] as const) expect(at(id)).toEqual({ x: base[id].x, y: base[id].y + d });
    expect(xy(nodeEl(noteId).style.transform).y).toBe(base.r2.y + d);
    expect(handleAt().y).toBe(handle0.y + d);
    expect(onShiftSpace).not.toHaveBeenCalled();
    expect(onSpaceToolChange).not.toHaveBeenCalled();
    expect(mocks.layoutCalls).toBe(layoutStart);

    const s = screenOf(press);
    await fire(pane(), "pointerup", { clientX: s.clientX + 3, clientY: s.clientY + 90 });
    await fire(window, "mouseup", { clientX: s.clientX + 3, clientY: s.clientY + 90 });
    await fire(pane(), "click", { clientX: s.clientX + 3, clientY: s.clientY + 90 });
    expect(onShiftSpace).toHaveBeenCalledTimes(1);
    const [axis, line, delta, drawn] = onShiftSpace.mock.calls[0];
    expect([axis, delta]).toEqual(["y", d]);
    expect(Math.abs(line - press.y)).toBeLessThanOrEqual(1);
    expect(drawn).toMatchObject(base); // 그린 위치 전체
    expect(onSpaceToolChange).toHaveBeenCalledTimes(1);
    expect(onSpaceToolChange).toHaveBeenCalledWith(false);
    expect(onSelect).not.toHaveBeenCalled(); // 놓아도 빈 곳 누르기(선택 풀기)로 보지 않는다
    expect(guide()).toBeNull();
    expect(at("r2")).toEqual(base.r2); // 부모가 새 흐름을 주기 전까지는 원래 자리(미리보기만 지운다)
    expect(mocks.layoutCalls).toBe(layoutStart);
  });

  it("줄이기는 기준선에 가장 가까운 너머 노드가 기준선을 넘지 않게 멈춘다", async () => {
    const onShiftSpace = vi.fn();
    await draw(props({ spaceTool: true, onShiftSpace }));
    const r2 = at("r2");
    const press = { x: r2.x + 10, y: r2.y - 12 };
    await spaceDrag(press, 2, -400, {}, false);
    const line = at("r2").y;
    expect(line).toBeLessThan(r2.y);
    expect(Math.abs(line - press.y)).toBeLessThanOrEqual(1); // 기준선에 닿아 멈춤
    const s = screenOf(press);
    await fire(window, "pointerup", { clientX: s.clientX, clientY: s.clientY - 400 });
    expect(onShiftSpace.mock.calls[0][2]).toBe(line - r2.y);
  });

  it("Alt+끌기는 토글 없이 공간 넓히기다(가로). 토글은 건드리지 않는다", async () => {
    const f = addNote(chain(), { x: 900, y: 0 }, null).flow;
    const onShiftSpace = vi.fn();
    const onSpaceToolChange = vi.fn();
    await draw(props({ flow: f, onShiftSpace, onSpaceToolChange }));
    const r1 = at("r1");
    await spaceDrag({ x: r1.x + 400, y: r1.y }, 80, 4, { altKey: true });
    expect(onShiftSpace).toHaveBeenCalledTimes(1);
    expect(onShiftSpace.mock.calls[0][0]).toBe("x");
    expect(onSpaceToolChange).not.toHaveBeenCalled();
  });

  it("공간 넓히기 누르기는 React Flow 로 가지 않는다 — 영역 선택·화면 이동이 시작되지 않는다", async () => {
    await draw(props({ spaceTool: true, onShiftSpace: vi.fn() }));
    const r1 = at("r1");
    const s = screenOf({ x: r1.x, y: r1.y + 20 });
    const down = new MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, ...s });
    const spy = vi.fn();
    pane().addEventListener("pointerdown", spy);
    await act(async () => {
      pane().dispatchEvent(down);
    });
    expect(down.defaultPrevented).toBe(true);
    expect(spy).not.toHaveBeenCalled(); // 캡처 단계에서 끊는다
    await fire(window, "pointerup", s);
  });

  it("노드 위·보기 모드·토글 없는 그냥 끌기는 공간 넓히기가 아니다", async () => {
    const onShiftSpace = vi.fn();
    await draw(props({ onShiftSpace }));
    const r1 = at("r1");
    // 토글·Alt 없이 빈 곳 끌기 — 영역 선택(공간 넓히기 아님)
    await spaceDrag({ x: r1.x, y: r1.y + 100 }, 3, 90);
    expect(guide()).toBeNull();
    // Alt 로 노드 위에서 시작
    const s = screenOf(r1);
    await fire(nodeEl("r1"), "pointerdown", { ...s, altKey: true });
    await fire(window, "pointermove", { clientX: s.clientX + 3, clientY: s.clientY + 90 });
    expect(guide()).toBeNull();
    await fire(window, "pointerup", { clientX: s.clientX + 3, clientY: s.clientY + 90 });
    // 보기 모드 — 토글이 켜져 들어와도, Alt 로도 안 된다
    await draw(props({ onShiftSpace, mode: "view", spaceTool: true }));
    await spaceDrag({ x: r1.x, y: r1.y + 100 }, 3, 90, { altKey: true });
    expect(guide()).toBeNull();
    expect(onShiftSpace).not.toHaveBeenCalled();
  });

  it("접힌 블록 — 블록이 너머면 숨은 멤버도 같은 delta 로 가고, 펼치면 블록 모양 그대로 옮겨져 있다", async () => {
    const f = ok(insertSplit(chain(), "e2", "IF")); // start→r1→if1[빈 갈래 둘]→m1→r2→r3→end
    const full = drawnPositions(f);
    const onShiftSpace = vi.fn();
    await draw(props({ flow: f, onShiftSpace, collapsed: new Set(["if1"]) }));
    const r1 = at("r1");
    const if1 = at("if1");
    expect(if1.x).toBe(full.if1.x - foldOffsetX("IF")); // 접힌 상자는 가운데 맞춤
    await spaceDrag({ x: r1.x + 10, y: if1.y - 5 }, 2, 60, { altKey: true });
    expect(onShiftSpace).toHaveBeenCalledTimes(1);
    const [axis, line, delta, drawn, blocks] = onShiftSpace.mock.calls[0];
    expect(Object.keys(blocks)).toEqual(["if1"]);
    expect(drawn.m1).toEqual(full.m1); // 숨은 멤버 — 블록과 맞춘 전체 흐름 자리
    const g = shiftSpace(f, axis, line, delta, drawn, blocks);
    const after = drawnPositions(g); // 펼친 흐름
    expect(after.if1).toEqual({ x: full.if1.x, y: full.if1.y + delta });
    expect(after.m1).toEqual({ x: full.m1.x, y: full.m1.y + delta });
    expect(after.r1).toEqual(full.r1);
  });

  it("방향이 정해지기 전(임계값 안)에 놓으면 아무것도 올리지 않는다. 토글은 끈다", async () => {
    const onShiftSpace = vi.fn();
    const onSpaceToolChange = vi.fn();
    await draw(props({ spaceTool: true, onShiftSpace, onSpaceToolChange }));
    const r1 = at("r1");
    await spaceDrag({ x: r1.x, y: r1.y + 100 }, 2, 3);
    expect(onShiftSpace).not.toHaveBeenCalled();
    expect(onSpaceToolChange).toHaveBeenCalledWith(false);
  });
});

describe("FlowCanvas — 끌어서 영역 선택(Figma 방식 이동 조작)", () => {
  const noop = () => {};
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  beforeEach(() => {
    installDomStorage();
    mocks.rfProps = [];
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });
  const props = (over: Partial<FlowCanvasProps> = {}): FlowCanvasProps => ({
    flow: chain(), rules: {}, checks: [], mode: "edit", showVars: false, selectedId: null, selectedEdgeId: null,
    overlay: null, focusId: null, focusSeq: 0, onSelect: noop, onSelectEdge: noop, onOpenRule: noop, onMove: noop, onConnect: noop,
    onDropPalette: noop, onNoteChange: noop, breakpoints: new Set(), collapsed: new Set(), showMiniMap: false, editingCondEdgeId: null,
    onMoveNode: noop, onDropRule: noop, onContextMenu: noop, onEditCond: noop, onEditCondClose: noop, onToggleBreakpoint: noop,
    onRouteChange: noop, ...over,
  });
  const draw = async (p: FlowCanvasProps) => {
    await act(async () => {
      root.render(createElement(DmesUiProvider, null, createElement("div", { style: { width: 800, height: 600 } }, createElement(FlowCanvas, p))));
    });
    await flush();
  };

  it("편집 모드 — 빈 곳 끌기 = 영역 선택(부분 포함), 이동은 스페이스·가운데 버튼·두 손가락 스크롤, 확대는 핀치·Ctrl/Cmd+휠", async () => {
    await draw(props());
    expect(lastRf()).toMatchObject({
      selectionOnDrag: true,
      selectionMode: "partial",
      panOnDrag: [1],
      panOnScroll: true,
      panActivationKeyCode: "Space",
      zoomOnPinch: true,
      selectionKeyCode: "Shift",
      disableKeyboardA11y: true,
    });
    expect(lastRf().multiSelectionKeyCode).toEqual(["Shift", "Meta", "Control"]);
    expect(lastRf().zoomActivationKeyCode).toBeUndefined(); // 설치본 기본값(Mac Meta, 그 밖 Control)을 쓴다
  });

  it("보기·디버그 모드 — 지금 동작 그대로(끌기 = 화면 이동, 휠 = 확대, 상자 선택 없음)", async () => {
    for (const mode of ["view", "debug"] as const) {
      await draw(props({ mode }));
      expect(lastRf(), mode).toMatchObject({ selectionOnDrag: false, panOnDrag: true, panOnScroll: false, selectionKeyCode: null, multiSelectionKeyCode: null });
    }
  });

  it("영역 선택 결과(React Flow 선택 변경)는 onSelectionChange 로 흐름 노드 ID 가 올라가고, 고른 노드·메모를 끌면 onMove 한 번이다", async () => {
    const f = addNote(chain(), { x: 600, y: 10 }, null).flow;
    const noteId = f.view.notes[0].id;
    const onSelectionChange = vi.fn();
    const onMove = vi.fn();
    await draw(props({ flow: f, onSelectionChange, onMove }));
    const onNodesChange = lastRf().onNodesChange as (c: unknown[]) => void;
    await act(async () => {
      onNodesChange(["r2", "r1", noteId].map((id) => ({ type: "select", id, selected: true })));
    });
    await flush();
    expect(onSelectionChange).toHaveBeenLastCalledWith(["r1", "r2"]); // 흐름 순서, 메모 제외
    expect(nodeEl("r1").classList.contains("selected")).toBe(true);
    expect(nodeEl(noteId).classList.contains("selected")).toBe(true);
    // 여러 개 끌기(이미 있는 동작 — 회귀): React Flow 는 고른 노드를 함께 끈다.
    const s = screenOf(at("r1"));
    await fire(nodeEl("r1"), "mousedown", s);
    await fire(window, "mousemove", { clientX: s.clientX + 30, clientY: s.clientY + 40 });
    await fire(window, "mousemove", { clientX: s.clientX + 50, clientY: s.clientY + 60 });
    await fire(window, "mouseup", { clientX: s.clientX + 50, clientY: s.clientY + 60 });
    expect(onMove).toHaveBeenCalledTimes(1);
    const [pos, notes] = onMove.mock.calls[0];
    expect(Object.keys(pos).sort()).toEqual(["r1", "r2"]);
    expect(Object.keys(notes ?? {})).toEqual([noteId]);
  });
});

// ───────────────────────── 화면(page) ─────────────────────────

const ioName = (n: string) => ({ name: n, source: "DICT" as const, label: null, dataType: null, scale: null, dateString: false, maruCodeId: null });
const rule = (ruleId: string, cond: string, result: string): RuleIo => ({
  ruleId, ruleName: `${ruleId} 이름`, ruleKind: "DECISION", status: "INUSE", exists: true, releasedVer: 1, hitPolicy: "FIRST",
  conds: [ioName(cond)], results: [{ ...ioName(result), source: null }],
});
const RULES = [rule("SC_A", "IN_A", "OUT_A"), rule("SC_B", "OUT_A", "OUT_B"), rule("SC_C", "OUT_B", "OUT_C")];
function viewOf(setId: string, flow: EditFlow): RuleSetView {
  return {
    set: { setId, setName: "이름", description: null, status: "INUSE", rowVersion: 1, ruleIds: RULES.map((r) => r.ruleId), flow, branched: false },
    rules: RULES, checks: [], condIo: {}, editable: true, restorable: false, cases: [],
  };
}
const pressed = () => byTestId("flow-space-tool").getAttribute("aria-pressed");
const saveOn = () => !(byTestId("set-save") as HTMLButtonElement).disabled;
async function key(el: Element, init: KeyboardEventInit) {
  await act(async () => {
    el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
  });
  await flush();
}
const edgeEl = (id: string) => q(`rf__edge-${id}`)!;

describe("화면 — [공간] 토글·Alt+끌기", () => {
  beforeEach(() => {
    installServer();
    localStorage.clear();
  });
  afterEach(() => {
    uninstallServer();
  });

  it("토글을 켜고 끌어 놓으면 편집 한 번(되돌리기 한 칸에 원래대로)이고 토글이 꺼진다. 저장하면 모든 노드 위치가 적힌다", async () => {
    await openSet("SC_T", viewOf("SC_T", chain()));
    await click("flow-mode-edit");
    expect(pressed()).toBe("false");
    await click("flow-space-tool");
    expect(pressed()).toBe("true");
    const before = { r1: at("r1"), r2: at("r2"), r3: at("r3") };
    await spaceDrag({ x: before.r1.x + 10, y: before.r2.y - 10 }, 2, 80);
    expect(pressed()).toBe("false");
    expect(at("r1")).toEqual(before.r1);
    expect(at("r2").y).toBeGreaterThan(before.r2.y);
    expect(at("r3").y - before.r3.y).toBe(at("r2").y - before.r2.y);
    expect(saveOn()).toBe(true);
    const movedR2 = at("r2");
    await click("flow-undo");
    expect(at("r2")).toEqual(before.r2);
    expect(at("r3")).toEqual(before.r3);
    expect((byTestId("flow-undo") as HTMLButtonElement).disabled).toBe(true); // 한 칸
    await click("flow-redo");
    await click("set-save");
    const params = calls("save").at(-1)!.body.params as Record<string, unknown>;
    const savedFlow = JSON.parse(String(params.flowJson)) as EditFlow;
    expect(Object.keys(savedFlow.view.positions).sort()).toEqual(["end", "r1", "r2", "r3", "start"]); // 모든 노드(전부 고정)
    expect(savedFlow.view.positions.r2).toEqual(movedR2);
  });

  it("Esc 는 켜진 토글만 끄고 선택은 그대로 둔다. 다음 Esc 가 선택을 푼다", async () => {
    await openSet("SC_E", viewOf("SC_E", chain()));
    await click("flow-mode-edit");
    await act(async () => {
      edgeEl("e2").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
    await click("flow-space-tool");
    const canvas = byTestId("flow-canvas");
    await act(async () => {
      canvas.focus();
    });
    await key(canvas, { key: "Escape" });
    expect(pressed()).toBe("false");
    expect(edgeEl("e2").classList.contains("selected")).toBe(true);
    await key(canvas, { key: "Escape" });
    expect(edgeEl("e2").classList.contains("selected")).toBe(false);
  });

  it("Alt+끌기는 토글 없이 된다(되돌리기 한 칸)", async () => {
    await openSet("SC_A", viewOf("SC_A", chain()));
    await click("flow-mode-edit");
    const r2 = at("r2");
    await spaceDrag({ x: r2.x + 10, y: r2.y - 10 }, 2, 60, { altKey: true });
    expect(at("r2").y).toBeGreaterThan(r2.y);
    expect(pressed()).toBe("false");
    await click("flow-undo");
    expect(at("r2")).toEqual(r2);
  });

  it("보기 모드 — [공간] 이 꺼져 있고 Alt+끌기도 무시한다. 편집 모드를 떠나면 켜 둔 토글이 꺼진다", async () => {
    await openSet("SC_V", viewOf("SC_V", chain()));
    expect((byTestId("flow-space-tool") as HTMLButtonElement).disabled).toBe(true);
    const r2 = at("r2");
    await spaceDrag({ x: r2.x + 10, y: r2.y - 10 }, 2, 60, { altKey: true });
    expect(at("r2")).toEqual(r2);
    await click("flow-mode-edit");
    await click("flow-space-tool");
    expect(pressed()).toBe("true");
    await click("flow-mode-view");
    expect(pressed()).toBe("false");
    await click("flow-mode-edit");
    expect(pressed()).toBe("false");
  });

  it("도움말(편집 모드)에 영역 선택·Alt+끌기·스페이스+끌기 줄이 있다", async () => {
    await openSet("SC_H", viewOf("SC_H", chain()));
    await click("flow-mode-edit");
    await click("flow-help");
    const text = byTestId("flow-help-panel").textContent ?? "";
    expect(text).toContain("Alt+끌기");
    expect(text).toContain("공간 넓히기");
    expect(text).toContain("스페이스+끌기");
    expect(text).toContain("영역 선택");
  });
});
