/** @vitest-environment happy-dom */

// 추가 Task C1(Ruling 28) — 노드 네 변 어디서나 선을 끌기 시작해 대상 노드 몸통 어디에나 놓아 잇는다.
// 진짜 React Flow 연결 끌기(XYHandle: 손잡이 mousedown → document mousemove → document mouseup)로 본다.
// happy-dom 은 배치·겹침을 계산하지 않으므로 "커서 아래 요소"(document.elementFromPoint)만 흉내 낸다 — 몸통 판정·빈 곳·START 거부는 그 요소로 갈린다.
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
import { setPositions, toEditFlow, type EditFlow, type FlowPos } from "../../../pages/dme/ruleSetEdit/flow-edit";
import { NODE_SIZE } from "../../../pages/dme/ruleSetEdit/flow-layout";
import type { RuleIo, RuleSetView } from "../../../pages/dme/ruleSetEdit/types";
import { flush, installDomStorage } from "../helpers/render";
import { byTestId, click, installServer, openSet, q, settle, uninstallServer } from "../helpers/rule-set-page";

const SIDES = ["top", "right", "bottom", "left"] as const;
const noop = () => {};

// ─────────────────── 커서 아래 요소 흉내 ───────────────────

let below: Element | null = null;
const hadElementFromPoint = Object.prototype.hasOwnProperty.call(document, "elementFromPoint");
const originalElementFromPoint = (document as { elementFromPoint?: unknown }).elementFromPoint;
function installBelow() {
  below = null;
  Object.defineProperty(document, "elementFromPoint", { configurable: true, writable: true, value: () => below });
}
function uninstallBelow() {
  if (hadElementFromPoint) Object.defineProperty(document, "elementFromPoint", { configurable: true, writable: true, value: originalElementFromPoint });
  else delete (document as { elementFromPoint?: unknown }).elementFromPoint;
}

const fire = (el: Element | Document | Window, type: string, init: MouseEventInit = {}) =>
  act(async () => {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, view: window, ...init }));
  });
const handle = (nodeId: string, side: string) => document.querySelector(`[data-testid="flow-handle-${nodeId}-${side}"]`) as HTMLElement | null;
const body = (nodeId: string) => document.querySelector(`[data-testid="flow-drop-${nodeId}"]`) as HTMLElement | null;
const nodeEl = (id: string) => document.querySelector(`[data-testid="flow-node-${id}"]`) as HTMLElement;
const sideHandles = (nodeId: string) => document.querySelectorAll(`[data-testid^="flow-handle-${nodeId}-"]`);

/**
 * 노드 `from` 의 `side` 손잡이를 누르고 화면에서 조금 움직여 연결을 시작한 뒤, 커서 아래 요소를 `over` 로 두고 한 번 더 움직여(판정은 움직일 때 한다)
 * `release` 면 놓는다.
 */
async function dragLink(from: string, side: string, over: Element | null, release = true) {
  const h = handle(from, side);
  if (!h) throw new Error(`손잡이 flow-handle-${from}-${side} 가 없다`);
  await dragFrom(h, over, release);
}
/** 요소 `h`(잇기 손잡이·선 끝 손잡이)를 눌러 끌고 커서 아래 요소를 `over` 로 두고 놓는다. */
async function dragFrom(h: Element, over: Element | null, release = true) {
  // happy-dom 은 캔버스 크기가 0 이라 연결 중 자동 화면 이동(가장자리 40px 안)이 끝없이 돈다 — 캔버스 틀에 800×600 을 준다.
  const rf = document.querySelector(".react-flow") as HTMLElement;
  rf.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON: () => ({}) }) as DOMRect;
  await fire(h, "mousedown", { clientX: 100, clientY: 100 });
  below = null;
  await fire(document, "mousemove", { clientX: 110, clientY: 110, buttons: 1 });
  below = over;
  await fire(document, "mousemove", { clientX: 400, clientY: 400, buttons: 1 });
  if (release) await fire(document, "mouseup", { clientX: 400, clientY: 400 });
}

// ─────────────────── 캔버스 ───────────────────

let host: HTMLDivElement;
let root: Root;

/** start(0,0) → r1(0,150) → r2(0,300) → r3(600,300) → end(600,450). 선 e1(start→r1) e2(r1→r2) e3(r2→r3) e4(r3→end). */
function chainFlow(over: Record<string, FlowPos> = {}): EditFlow {
  return setPositions(toEditFlow(null, ["SC_A", "SC_B", "SC_C"]), {
    start: { x: 0, y: 0 }, r1: { x: 0, y: 150 }, r2: { x: 0, y: 300 }, r3: { x: 600, y: 300 }, end: { x: 600, y: 450 }, ...over,
  });
}
function props(over: Partial<FlowCanvasProps> = {}): FlowCanvasProps {
  return {
    flow: chainFlow(), rules: {}, checks: [], mode: "edit", varDisplay: "off", selectedId: null, selectedEdgeId: null,
    overlay: null, focusId: null, focusSeq: 0, onSelect: noop, onSelectEdge: noop, onOpenRule: noop, onMove: noop, onConnect: noop,
    onDropPalette: noop, onNoteChange: noop, breakpoints: new Set(), collapsed: new Set(), showMiniMap: false, editingCondEdgeId: null,
    onMoveNode: noop, onDropRule: noop, onContextMenu: noop, onEditCond: noop, onEditCondClose: noop, onToggleBreakpoint: noop,
    onRouteChange: noop, onReconnect: noop, ...over,
  };
}
async function draw(p: FlowCanvasProps) {
  await act(async () => {
    root.render(createElement(DmesUiProvider, null, createElement("div", { style: { width: 800, height: 600 } }, createElement(FlowCanvas, p))));
  });
  await flush();
}

describe("FlowCanvas 네 변 잇기 손잡이", () => {
  beforeEach(() => {
    installDomStorage();
    installBelow();
    layout.calls = 0;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
    uninstallBelow();
  });

  it("편집 모드 — 나가는 선이 있는 노드는 네 변 손잡이 4개, END 는 없다. START 는 몸통 받기가 없고 END 는 있다", async () => {
    await draw(props());
    for (const id of ["start", "r1", "r2", "r3"]) {
      expect(sideHandles(id), id).toHaveLength(4);
      for (const s of SIDES) {
        const h = handle(id, s)!;
        expect(h, `${id}-${s}`).not.toBeNull();
        expect(h.getAttribute("data-handlepos")).toBe(s);
        expect(h.classList.contains("source")).toBe(true);
        expect(nodeEl(id).contains(h)).toBe(true);
      }
    }
    expect(sideHandles("end")).toHaveLength(0);
    expect(body("start")).toBeNull();
    for (const id of ["r1", "r2", "r3", "end"]) {
      expect(body(id), id).not.toBeNull();
      expect(body(id)!.classList.contains("target")).toBe(true);
    }
  });

  it("보기·디버그 모드에는 잇기 손잡이·몸통 받기가 없다", async () => {
    for (const mode of ["view", "debug"] as const) {
      await draw(props({ mode }));
      expect(document.querySelectorAll('[data-testid^="flow-handle-"]'), mode).toHaveLength(0);
      expect(document.querySelectorAll('[data-testid^="flow-drop-"]'), mode).toHaveLength(0);
    }
  });

  it("모드만 바꿔 다시 그려도(나머지 prop 같은 참조) 손잡이가 따라 생기고 사라진다", async () => {
    const p = props({ mode: "view" });
    await draw(p);
    expect(sideHandles("r1")).toHaveLength(0);
    await draw({ ...p, mode: "edit" });
    expect(sideHandles("r1")).toHaveLength(4);
    expect(body("r2")).not.toBeNull();
    await draw({ ...p, mode: "view" });
    expect(sideHandles("r1")).toHaveLength(0);
    expect(body("r2")).toBeNull();
  });

  it("어느 변의 손잡이에서 끌어도 그 노드에서 나가는 선이다 — 대상 몸통에 놓으면 onConnect(끈 노드, 놓은 노드) 한 번", async () => {
    for (const s of SIDES) {
      const onConnect = vi.fn();
      await draw(props({ onConnect }));
      await dragLink("r1", s, body("r3"));
      expect(onConnect, s).toHaveBeenCalledTimes(1);
      expect(onConnect, s).toHaveBeenCalledWith("r1", "r3");
    }
  });

  it("START 의 손잡이에서도 끌 수 있다", async () => {
    const onConnect = vi.fn();
    await draw(props({ onConnect }));
    await dragLink("start", "left", body("r3"));
    expect(onConnect).toHaveBeenCalledWith("start", "r3");
  });

  it("끄는 동안 page 콜백·dagre 가 없고, 몸통 받기는 연결 중에만 누름을 받는다(connectionindicator)", async () => {
    const cb = { onConnect: vi.fn(), onMove: vi.fn(), onMoveNode: vi.fn(), onSelect: vi.fn(), onSelectEdge: vi.fn(), onReconnect: vi.fn(), onContextMenu: vi.fn() };
    await draw(props(cb));
    const start = layout.calls;
    expect(start).toBeGreaterThan(0);
    const target = body("end")!;
    expect(target.classList.contains("connectionindicator")).toBe(false); // 평소에는 누름이 몸통(노드 끌기·누르기·우클릭)으로 간다
    await dragLink("r2", "right", target, false);
    expect(body("end")!.classList.contains("connectionindicator")).toBe(true);
    expect(layout.calls).toBe(start);
    for (const f of Object.values(cb)) expect(f).not.toHaveBeenCalled();
    await fire(document, "mouseup", { clientX: 400, clientY: 400 });
    expect(cb.onConnect).toHaveBeenCalledTimes(1);
    expect(cb.onConnect).toHaveBeenCalledWith("r2", "end");
    expect(body("end")!.classList.contains("connectionindicator")).toBe(false);
    expect(layout.calls).toBe(start);
  });

  it("START 에 놓으면 거부한다(들어오는 선이 없다) — 손잡이 위에 놓아도", async () => {
    const onConnect = vi.fn();
    await draw(props({ onConnect }));
    await dragLink("r2", "right", nodeEl("start"));
    await dragLink("r2", "right", handle("start", "top"));
    expect(onConnect).not.toHaveBeenCalled();
  });

  it("빈 곳에 놓으면 아무 일도 없다", async () => {
    const onConnect = vi.fn();
    await draw(props({ onConnect }));
    await dragLink("r1", "bottom", document.querySelector(".react-flow__pane"));
    await dragLink("r1", "left", null);
    expect(onConnect).not.toHaveBeenCalled();
  });

  it("자기 몸통에 놓으면 아무 일도 없다", async () => {
    const onConnect = vi.fn();
    await draw(props({ onConnect }));
    await dragLink("r1", "right", body("r1"));
    expect(onConnect).not.toHaveBeenCalled();
  });

  it("다른 노드의 변 손잡이에 놓아도 그 노드로 잇는다(방향은 끈 노드 → 놓은 노드)", async () => {
    const onConnect = vi.fn();
    await draw(props({ onConnect }));
    await dragLink("r1", "right", handle("r3", "left"));
    expect(onConnect).toHaveBeenCalledWith("r1", "r3");
  });

  it("선 끝 옮기기(R1)도 몸통 어디에 놓으면 옮겨 붙는다 — 도착 쪽·출발 쪽 모두, START·자기 자리는 거부", async () => {
    const onReconnect = vi.fn();
    const onConnect = vi.fn();
    await draw(props({ onReconnect, onConnect, selectedEdgeId: "e2" })); // e2 = r1 → r2
    const end = (type: "source" | "target") => document.querySelector(`.react-flow__edge[data-id="e2"] .react-flow__edgeupdater-${type}`)!;
    await dragFrom(end("target"), body("r3"));
    expect(onReconnect).toHaveBeenLastCalledWith("e2", { to: "r3" });
    await dragFrom(end("source"), body("r3")); // 출발 쪽 끝을 몸통(target)에 — 느슨한 연결 모드라 된다
    expect(onReconnect).toHaveBeenLastCalledWith("e2", { from: "r3" });
    expect(onReconnect).toHaveBeenCalledTimes(2);
    await dragFrom(end("target"), handle("start", "right")); // START 로 들어가기
    await dragFrom(end("source"), body("r2")); // r2 → r2 자기 잇기
    await dragFrom(end("source"), body("end")); // END 에서 나가기
    expect(onReconnect).toHaveBeenCalledTimes(2);
    expect(onConnect).not.toHaveBeenCalled(); // 선 끝 옮기기는 새 선을 만들지 않는다
  });

  it("손잡이를 누르기만 하고(끌지 않고) 다른 노드를 눌러도 선이 생기지 않는다(누르기 잇기 끔)", async () => {
    const onConnect = vi.fn();
    await draw(props({ onConnect }));
    await fire(handle("r1", "right")!, "click", { clientX: 100, clientY: 100 });
    await fire(body("r3")!, "click", { clientX: 400, clientY: 400 });
    await fire(handle("r3", "top")!, "click", { clientX: 400, clientY: 400 });
    expect(onConnect).not.toHaveBeenCalled();
  });

  it("선 그리는 자리는 그대로 — 출발 노드 아래 가운데 → 도착 노드 위 가운데(손잡이를 어디서 잡든 저장·그리기에 손잡이가 없다)", async () => {
    await draw(props());
    const R = NODE_SIZE.RULE;
    const ends = (edgeId: string) => {
      const d = document.querySelector(`.react-flow__edge[data-id="${edgeId}"] path.react-flow__edge-path`)!.getAttribute("d")!;
      const nums = (s: string) => s.trim().split(/[\s,]+/).map(Number);
      const first = nums(/^M\s*([-\d.]+[\s,]+[-\d.]+)/.exec(d)![1]);
      const last = nums(/L\s*([-\d.]+[\s,]+[-\d.]+)\s*$/.exec(d)![1]);
      return { from: { x: first[0], y: first[1] }, to: { x: last[0], y: last[1] } };
    };
    // 선 끝은 8px 연결점의 바깥 가장자리다(아래 연결점은 노드 아래로 4px, 위 연결점은 노드 위로 4px) — 이 작업 전과 같은 값.
    const A = 4;
    expect(ends("e2")).toEqual({ from: { x: R.w / 2, y: 150 + R.h + A }, to: { x: R.w / 2, y: 300 - A } }); // r1 아래 → r2 위
    expect(ends("e3")).toEqual({ from: { x: R.w / 2, y: 300 + R.h + A }, to: { x: 600 + R.w / 2, y: 300 - A } }); // r2 아래 → r3 위
    expect(ends("e1").from).toEqual({ x: NODE_SIZE.START.w / 2, y: NODE_SIZE.START.h + A }); // start 아래
    expect(ends("e4").to).toEqual({ x: 600 + NODE_SIZE.END.w / 2, y: 450 - A }); // end 위
  });
});

// ─────────────────── page 연결 ───────────────────

const ioName = (n: string) => ({ name: n, source: "DICT" as const, label: null, dataType: null, scale: null, dateString: false, maruCodeId: null });
const rule = (ruleId: string, cond: string, result: string): RuleIo => ({
  ruleId, ruleName: `${ruleId} 이름`, ruleKind: "DECISION", status: "INUSE", exists: true, releasedVer: 1, hitPolicy: "FIRST",
  conds: [ioName(cond)], results: [{ ...ioName(result), source: null }],
});
function chainView(): RuleSetView {
  return {
    set: { setId: "C1S_CHAIN", setName: "사슬", description: null, status: "INUSE", rowVersion: 3, ruleIds: ["C1S_GRD", "C1S_FCT"], flow: null, branched: false },
    rules: [rule("C1S_GRD", "SET_THK", "S_GRD"), rule("C1S_FCT", "S_GRD", "S_FCT")],
    checks: [], condIo: {}, editable: true, restorable: false, cases: [],
  };
}
const edgeShape = () =>
  Array.from(document.querySelectorAll(".react-flow__edge")).map((e) => e.getAttribute("aria-label") ?? e.getAttribute("data-id")).sort();

describe("page 네 변 잇기", () => {
  beforeEach(() => {
    installServer();
    installBelow();
  });
  afterEach(() => {
    uninstallServer();
    uninstallBelow();
  });

  it("편집 모드 — 끌어 몸통에 놓으면 선 하나가 늘고 되돌리기 한 번에 원래대로", async () => {
    await openSet("C1S_CHAIN", chainView());
    await click("flow-mode-edit");
    const before = edgeShape();
    expect(before).toHaveLength(3);
    await dragLink("r1", "left", body("end"));
    await settle(50);
    const after = edgeShape();
    expect(after).toHaveLength(4);
    expect(after).toContain("Edge from r1 to end");
    await click("flow-undo");
    expect(edgeShape()).toEqual(before);
    expect(byTestId<HTMLButtonElement>("flow-undo").disabled).toBe(true); // 한 칸이었다
  });

  it("보기 모드에는 손잡이가 없다", async () => {
    await openSet("C1S_CHAIN", chainView());
    expect(q("flow-handle-r1-left")).toBeNull();
    expect(q("flow-drop-end")).toBeNull();
  });
});
