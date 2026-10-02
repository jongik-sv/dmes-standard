/** @vitest-environment happy-dom */

// 추가 작업 최종 고침(FF) — 최종 리뷰 M1·M2, 브라우저 확인 2 의 U1·U2·U3·L6.
// 화면(page) 테스트는 목 서버로 세트를 열고, 캔버스 테스트는 FlowCanvas 를 직접 그린다.
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

const mocks = vi.hoisted(() => ({ openRuleEdit: vi.fn(), openMdmPage: vi.fn() }));
vi.mock("@/dme/rule-handoff", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/dme/rule-handoff")>()),
  openRuleEdit: (...args: unknown[]) => mocks.openRuleEdit(...args),
}));
vi.mock("@/shell", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shell")>()),
  openMdmPage: (...args: unknown[]) => mocks.openMdmPage(...args),
}));

import { FlowCanvas, addSpot, type FlowCanvasProps } from "../../../pages/dme/ruleSetEdit/canvas/FlowCanvas";
import { RSF_CSS } from "../../../pages/dme/ruleSetEdit/rsf-styles";
import { addNote, setPositions, toEditFlow, type EditFlow, type FlowPos } from "../../../pages/dme/ruleSetEdit/flow-edit";
import { removeMany } from "../../../pages/dme/ruleSetEdit/state/useEditActions";
import { visibleText } from "../helpers/render";
import type { RuleIo, RuleSetView } from "../../../pages/dme/ruleSetEdit/types";
import { flush, installDomStorage } from "../helpers/render";
import { byTestId, click, hoverEdge, installServer, openSet, pageContainer, q, settle, uninstallServer } from "../helpers/rule-set-page";

const ioName = (n: string) => ({ name: n, source: "DICT" as const, label: null, dataType: null, scale: null, dateString: false, maruCodeId: null });
const rule = (ruleId: string, cond: string, result: string): RuleIo => ({
  ruleId, ruleName: `${ruleId} 이름`, ruleKind: "DECISION", status: "INUSE", exists: true, releasedVer: "1.000", hitPolicy: "FIRST",
  conds: [ioName(cond)], results: [{ ...ioName(result), source: null }],
});
const RULES = [rule("FF_A", "IN_A", "OUT_A"), rule("FF_B", "OUT_A", "OUT_B"), rule("FF_C", "OUT_B", "OUT_C")];
/** start → r1 → r2 → r3 → end. r1(0,0) r2(300,200) r3(120,500). 선 e1(start→r1) e2(r1→r2) e3(r2→r3) e4(r3→end). */
function scattered(): EditFlow {
  return setPositions(toEditFlow(null, ["FF_A", "FF_B", "FF_C"]), { r1: { x: 0, y: 0 }, r2: { x: 300, y: 200 }, r3: { x: 120, y: 500 } });
}
function viewOf(setId: string, flow: EditFlow): RuleSetView {
  return {
    set: { setId, setName: "이름", description: null, status: "INUSE", rowVersion: 1, ruleIds: RULES.map((r) => r.ruleId), flow, branched: false },
    rules: RULES, checks: [], condIo: {}, editable: true, restorable: false, cases: [],
  };
}
const nodeEl = (id: string) => document.querySelector(`.react-flow__node[data-id="${id}"]`) as HTMLElement | null;
const at = (id: string): FlowPos => {
  const m = /translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(nodeEl(id)!.style.transform)!;
  return { x: Math.round(Number(m[1])), y: Math.round(Number(m[2])) };
};
const canvas = () => byTestId("flow-canvas");
async function key(el: Element, init: KeyboardEventInit): Promise<KeyboardEvent> {
  const ev = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  await act(async () => {
    el.dispatchEvent(ev);
  });
  await flush();
  return ev;
}
async function ctxPane(at = { x: 120, y: 80 }) {
  const pane = canvas().querySelector(".react-flow__pane")!;
  await act(async () => {
    pane.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: at.x, clientY: at.y }));
  });
  await flush();
}
const noteIds = () =>
  Array.from(pageContainer().querySelectorAll('[data-testid^="flow-note-"]'))
    .map((e) => e.getAttribute("data-testid")!)
    .filter((t) => !t.startsWith("flow-note-text-"))
    .map((t) => t.slice("flow-note-".length));
const undoDisabled = () => (byTestId("flow-undo") as HTMLButtonElement).disabled;
const shift = (type: "keydown" | "keyup") =>
  act(async () => {
    document.dispatchEvent(new KeyboardEvent(type, { key: "Shift", bubbles: true }));
  });
const tid = (id: string) => (id.startsWith("n") ? `flow-note-${id}` : `flow-node-${id}`);
/** 첫 노드를 누르고 Shift 를 누른 채 나머지를 눌러 여럿 고른다(Shift 를 누른 채 이미 고른 것을 누르면 뺀다). */
async function pick(...ids: string[]) {
  await click(tid(ids[0]));
  await shift("keydown");
  for (const id of ids.slice(1)) await click(tid(id));
  await shift("keyup");
  await act(async () => canvas().focus());
}
/** scattered + 메모 하나(600,0). */
function withNote(): { flow: EditFlow; noteId: string } {
  const { flow, id } = addNote(scattered(), { x: 600, y: 0 }, null);
  return { flow, noteId: id };
}

describe("화면 — 선택 모델 맞추기(M1)", () => {
  beforeEach(() => {
    installDomStorage();
    installServer();
    localStorage.clear();
  });
  afterEach(() => uninstallServer());

  it("노드 A 를 고른 뒤 메뉴 「메모 더하기」 — 화살표는 새 메모를 옮기고 Delete 는 메모를 지운다(A 는 그대로)", async () => {
    await openSet("FF_M1", viewOf("FF_M1", scattered()));
    await click("flow-mode-edit");
    await click("flow-node-r2");
    await ctxPane();
    await click("flow-menu-item-note-add");
    const [noteId] = noteIds();
    expect(noteId).toBeTruthy();
    await act(async () => canvas().focus());
    const before = at(noteId);
    const ev = await key(canvas(), { key: "ArrowRight" });
    expect(ev.defaultPrevented).toBe(true);
    expect(at("r2")).toEqual({ x: 300, y: 200 }); // 눈에 보이는 선택(메모)이 아닌 A 는 움직이지 않는다
    expect(at(noteId)).toEqual({ x: before.x + 1, y: before.y });
    await key(canvas(), { key: "Delete" });
    expect(noteIds()).toEqual([]);
    expect(nodeEl("r2")).not.toBeNull();
  });
});

describe("화면 — 여럿 고른 뒤 Delete(M2)", () => {
  beforeEach(() => {
    installDomStorage();
    installServer();
    localStorage.clear();
  });
  afterEach(() => uninstallServer());

  it("노드 둘·메모 하나를 고르고 Delete — 편집 한 번에 모두 지우고(시작은 건너뜀) 되돌리기 한 칸에 모두 돌아온다", async () => {
    const { flow, noteId } = withNote();
    await openSet("FF_M2A", viewOf("FF_M2A", flow));
    await click("flow-mode-edit");
    await pick("r1", "r3", noteId, "start");
    const ev = await key(canvas(), { key: "Delete" });
    expect(ev.defaultPrevented).toBe(true);
    expect(nodeEl("r1")).toBeNull();
    expect(nodeEl("r3")).toBeNull();
    expect(noteIds()).toEqual([]);
    expect(nodeEl("start")).not.toBeNull();
    expect(nodeEl("r2")).not.toBeNull();
    await click("flow-undo");
    expect(nodeEl("r1")).not.toBeNull();
    expect(nodeEl("r3")).not.toBeNull();
    expect(noteIds()).toEqual([noteId]);
    expect(undoDisabled()).toBe(true); // 한 칸
  });

  it("고른 것이 모두 지울 수 없으면(시작·끝) 흐름은 그대로이고 기존 알림을 보인다", async () => {
    await openSet("FF_M2B", viewOf("FF_M2B", scattered()));
    await click("flow-mode-edit");
    await pick("start", "end");
    const ev = await key(canvas(), { key: "Delete" });
    expect(ev.defaultPrevented).toBe(true);
    expect(nodeEl("start")).not.toBeNull();
    expect(nodeEl("end")).not.toBeNull();
    expect(visibleText(byTestId("set-message"))).toContain("시작 노드는 지울 수 없다");
    expect(undoDisabled()).toBe(true);
  });

  it("Shift+누르기로 하나를 빼 캔버스 선택이 단일 선택과 다르면 캔버스 선택(남은 것)을 지운다", async () => {
    await openSet("FF_M2C", viewOf("FF_M2C", scattered()));
    await click("flow-mode-edit");
    await pick("r1", "r3", "r3"); // r3 을 다시 눌러 뺀다 — 단일 선택은 r3, 캔버스 선택은 r1
    await key(canvas(), { key: "Delete" });
    expect(nodeEl("r1")).toBeNull();
    expect(nodeEl("r3")).not.toBeNull();
  });

  it("아무것도 안 골랐으면 Delete 는 키를 쓰지 않는다(UNHANDLED)", async () => {
    await openSet("FF_M2D", viewOf("FF_M2D", scattered()));
    await click("flow-mode-edit");
    await act(async () => canvas().focus());
    const ev = await key(canvas(), { key: "Delete" });
    expect(ev.defaultPrevented).toBe(false);
    expect(undoDisabled()).toBe(true);
  });

  it("노드를 고른 뒤 Shift+선을 누르고 Delete — 노드와 선을 편집 한 번에 함께 지우고 되돌리기 한 칸에 둘 다 돌아온다(N1)", async () => {
    await openSet("FF_N1", viewOf("FF_N1", scattered()));
    await click("flow-mode-edit");
    await click("flow-node-r1");
    await shift("keydown");
    await act(async () => {
      pageContainer().querySelector('[data-testid="rf__edge-e3"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true }));
    });
    await flush();
    await shift("keyup");
    await act(async () => canvas().focus());
    const edge = (id: string) => pageContainer().querySelector(`[data-testid="rf__edge-${id}"]`);
    expect(nodeEl("r1")!.classList.contains("selected")).toBe(true);
    expect(edge("e3")!.classList.contains("selected")).toBe(true);
    const ev = await key(canvas(), { key: "Delete" });
    expect(ev.defaultPrevented).toBe(true);
    expect(nodeEl("r1")).toBeNull();
    expect(edge("e3")).toBeNull();
    await click("flow-undo");
    expect(nodeEl("r1")).not.toBeNull();
    expect(edge("e3")).not.toBeNull();
    expect(undoDisabled()).toBe(true); // 한 칸
  });

  it("removeMany — 고른 선도 함께 지우되, 지운 노드에 붙어 있던 선은 다시 지우지 않는다(N1)", () => {
    const f = scattered(); // e1 start→r1, e2 r1→r2, e3 r2→r3, e4 r3→end
    const out = removeMany(f, ["r1"], ["e1", "e2", "e3"]);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    // r1 을 지우면 e1 이 start→r2 로 이어 붙고 e2 는 사라진다 — e1(r1 에 붙어 있던 선)은 다시 지우지 않고, e3 만 더 지운다.
    expect(out.flow.edges.map((e) => `${e.id}:${e.from}>${e.to}`)).toEqual(["e1:start>r2", "e4:r3>end"]);
    // 선만 넘겨도 지운다.
    const only = removeMany(f, [], ["e3"]);
    expect(only.ok && only.flow.edges.map((e) => e.id)).toEqual(["e1", "e2", "e4"]);
  });

  it("removeMany — 분기와 그 안 노드를 함께 골라도 블록째 한 번 지우고, 없는 ID·합류는 건너뛴다", async () => {
    const { insertRule, insertSplit } = await import("../../../pages/dme/ruleSetEdit/flow-edit");
    // r1 → if1 [갈래 1 → 빈 단계 → r2][그 외 → r2] → r2(모이는 자리, 블록 밖) — IF 에는 합류가 없다(implicit-join §8.2)
    const s = insertSplit(toEditFlow(null, ["FF_A", "FF_Z"]), "e2", "IF");
    if (!s.ok) throw new Error(s.reason);
    const ifId = s.flow.nodes.find((n) => n.kind === "IF")!.id;
    const branch = s.flow.edges.find((e) => e.from === ifId && !e.otherwise)!;
    const r = insertRule(s.flow, branch.id, "FF_B");
    if (!r.ok) throw new Error(r.reason);
    const inner = r.flow.nodes.find((n) => n.ruleId === "FF_B")!.id;
    const out = removeMany(r.flow, [ifId, inner, "없음"]);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.flow.nodes.map((n) => n.id).sort()).toEqual(["end", "r1", "r2", "start"]);
    // 병렬은 짝 합류를 함께 골라도 블록째 한 번 지운다
    const p = insertSplit(toEditFlow(null, ["FF_A"]), "e2", "PARALLEL");
    if (!p.ok) throw new Error(p.reason);
    const pm = removeMany(p.flow, ["par1", "m1"]);
    expect(pm.ok && pm.flow.nodes.map((n) => n.id).sort()).toEqual(["end", "r1", "start"]);
    expect(removeMany(r.flow, ["start", "end"])).toEqual({ ok: false, reason: "시작 노드는 지울 수 없다" });
  });
});

const edgeEl = (id: string) => pageContainer().querySelector(`[data-testid="rf__edge-${id}"]`) as SVGGElement | null;

describe("화면 — 편집 뒤 초점·선 우클릭 경로 초기화(U3·L6)", () => {
  beforeEach(() => {
    installDomStorage();
    installServer();
    localStorage.clear();
  });
  afterEach(() => uninstallServer());

  it("선을 골라 Delete — 초점을 가진 선이 사라져도 초점이 캔버스로 돌아와 Ctrl+Z 로 선이 돌아온다(U3)", async () => {
    await openSet("FF_U3", viewOf("FF_U3", scattered()));
    await click("flow-mode-edit");
    await act(async () => {
      edgeEl("e2")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
    await act(async () => edgeEl("e2")!.focus()); // 브라우저는 누른 선에 초점을 준다(happy-dom 누르기는 초점을 옮기지 않는다)
    expect(document.activeElement).toBe(edgeEl("e2"));
    const del = await key(edgeEl("e2")!, { key: "Delete" });
    expect(del.defaultPrevented).toBe(true);
    await settle(20);
    expect(edgeEl("e2")).toBeNull();
    const a = document.activeElement as HTMLElement | null;
    expect(a && a !== document.body && a.isConnected).toBe(true);
    expect(a).toBe(canvas());
    await key(a!, { key: "z", ctrlKey: true }); // 초점이 가 있는 곳에서 누른다
    expect(edgeEl("e2")).not.toBeNull();
  });

  it("선 우클릭 → [경로 초기화] 가 꺾는 점·이름표 오프셋을 지우고 되돌리기 한 칸에 돌아온다(L6)", async () => {
    const base = scattered();
    const flow: EditFlow = { ...base, view: { ...base.view, routes: { e2: [{ x: 400, y: 60 }] }, labels: {} } };
    await openSet("FF_L6", viewOf("FF_L6", flow));
    await click("flow-mode-edit");
    await act(async () => {
      edgeEl("e2")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
    expect(q("flow-route-handle-e2-0")).not.toBeNull();
    await act(async () => {
      edgeEl("e2")!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 200, clientY: 100 }));
    });
    await flush();
    await click("flow-menu-item-route-reset");
    expect(q("flow-route-handle-e2-0")).toBeNull();
    await click("flow-undo");
    expect(q("flow-route-handle-e2-0")).not.toBeNull();
    expect(undoDisabled()).toBe(true);
  });
});

// ───────────────────────── 캔버스 ─────────────────────────

let host: HTMLDivElement;
let root: Root;
const noop = () => {};
function cprops(over: Partial<FlowCanvasProps> = {}): FlowCanvasProps {
  return {
    flow: scattered(), rules: {}, checks: [], mode: "edit", varDisplay: "off", selectedId: null, selectedEdgeId: null,
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
const fire = (el: Element | Window | Document, type: string, init: MouseEventInit = {}) =>
  act(async () => {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, view: window, ...init }));
  });

describe("캔버스 — 단일 선택을 캔버스 선택으로 맞춤(M1)", () => {
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

  it("다른 prop 은 같은 참조로 두고 selectedId 만 바꾸면 React Flow 선택이 그 하나가 된다 — 정렬·화살표 입력도 같은 대상", async () => {
    const alignSourceRef: { current: (() => { ids: string[] }) | null } = { current: null };
    const selectionRef: { current: (() => string[]) | null } = { current: null };
    const p = cprops({ alignSourceRef: alignSourceRef as FlowCanvasProps["alignSourceRef"], selectionRef });
    await draw(p);
    await fire(nodeEl("r1")!, "click"); // 캔버스에서 누름 — React Flow 가 r1 을 고른다(page 는 이 테스트에서 selectedId 를 바꾸지 않는다)
    expect(nodeEl("r1")!.classList.contains("selected")).toBe(true);
    expect(selectionRef.current!()).toEqual(["r1"]);
    await draw({ ...p, selectedId: "r3" }); // page 가 캔버스 밖에서 고름
    expect(nodeEl("r1")!.classList.contains("selected")).toBe(false);
    expect(nodeEl("r3")!.classList.contains("selected")).toBe(true);
    expect(alignSourceRef.current!().ids).toEqual(["r3"]);
    expect(selectionRef.current!()).toEqual(["r3"]);
    await draw({ ...p, selectedId: null }); // 해제는 캔버스 선택을 건드리지 않는다
    expect(nodeEl("r3")!.classList.contains("selected")).toBe(true);
  });
});

describe("캔버스 — 선 [+] 자리(U1)·선 끝 손잡이 두 번 누르기(U2)", () => {
  const sizes: Record<string, [number, number]> = { "rsf-vchips": [60, 18], "rsf-edge-add": [18, 18], "rsf-branch": [50, 18] };
  const sizeOf = (el: HTMLElement, i: 0 | 1) => {
    for (const [cls, wh] of Object.entries(sizes)) if (el.classList?.contains(cls)) return wh[i];
    return 0;
  };
  beforeEach(() => {
    installDomStorage();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) {
      return sizeOf(this, 0);
    });
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
      return sizeOf(this, 1);
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
  });

  const IO = { FF_A: RULES[0], FF_B: RULES[1], FF_C: RULES[2] };
  /** r1(0,0) 바로 아래 r2(0,110) — 짧은 선 e2 의 가운데(116,89)가 r1 결과 칩(116,88) 과 겹친다. */
  const short = () => setPositions(toEditFlow(null, ["FF_A", "FF_B", "FF_C"]), { r1: { x: 0, y: 0 }, r2: { x: 0, y: 110 }, r3: { x: 600, y: 400 } });
  const xy = (el: Element) => {
    const m = /translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px\)\s*$/.exec((el as HTMLElement).style.transform)!;
    return { x: Number(m[1]), y: Number(m[2]) };
  };
  const hover = async (id: string) => {
    const path = host.querySelector(`[data-testid="rf__edge-${id}"] path`)!;
    await act(async () => {
      path.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, relatedTarget: null }));
    });
    await flush();
  };

  it("[+] 는 칩·라벨보다 위(z-index)다", () => {
    const z = (sel: string) => Number(new RegExp(`\\${sel} \\{[^}]*z-index: (\\d+)`).exec(RSF_CSS)?.[1] ?? "NaN");
    expect(z(".rsf-edge-add")).toBeGreaterThan(z(".rsf-elabel-chips"));
  });

  it("addSpot — 겹치지 않으면 그대로, 겹치면 겹친 상자 오른쪽 끝 + 간격으로 비키고, 비킨 자리에서 또 겹치면 되풀이한다", () => {
    const size = { w: 18, h: 18 };
    expect(addSpot({ x: 0, y: 0 }, size, [{ x: 100, y: 0, w: 60, h: 18 }], 4)).toEqual({ x: 0, y: 0 });
    expect(addSpot({ x: 0, y: 0 }, size, [{ x: 0, y: 1, w: 60, h: 18 }], 4)).toEqual({ x: 30 + 4 + 9, y: 0 });
    // 첫 상자 옆자리가 둘째 상자와 겹치면 둘째 상자 오른쪽으로.
    expect(addSpot({ x: 0, y: 0 }, size, [{ x: 0, y: 0, w: 60, h: 18 }, { x: 50, y: 0, w: 20, h: 18 }], 4)).toEqual({ x: 60 + 4 + 9, y: 0 });
    // 맞닿기만 하면 겹침이 아니다.
    expect(addSpot({ x: 0, y: 0 }, size, [{ x: 39, y: 0, w: 60, h: 18 }], 4)).toEqual({ x: 0, y: 0 });
  });

  it("짧은 선에 올려 [+] 가 칩과 겹치면 칩 오른쪽으로 비킨다 — 안 겹치는 선은 가운데 그대로", async () => {
    await draw(cprops({ flow: short(), rules: IO, varDisplay: "id" }));
    expect(host.querySelector('[data-testid="flow-edge-chips-e2"]')).not.toBeNull();
    await hover("e2");
    const add = host.querySelector('[data-testid="flow-edge-add-e2"]')!;
    expect(add).not.toBeNull();
    expect(xy(add)).toEqual({ x: 116 + 30 + 4 + 9, y: 89 });
    // 칩을 끄면 겹칠 것이 없어 가운데로 돌아온다.
    await draw(cprops({ flow: short(), rules: IO, varDisplay: "off" }));
    await hover("e2");
    expect(xy(host.querySelector('[data-testid="flow-edge-add-e2"]')!)).toEqual({ x: 116, y: 89 });
  });

  it("고른 선의 끝 손잡이를 두 번 누르면 그 자리에 꺾는 점을 더한다 — 선 위 두 번 누르기와 같다(U2)", async () => {
    const onRouteChange = vi.fn();
    await draw(cprops({ flow: short(), selectedEdgeId: "e3", onRouteChange }));
    const anchor = host.querySelector('[data-testid="rf__edge-e3"] .react-flow__edgeupdater-target')!;
    expect(anchor).not.toBeNull();
    await fire(anchor, "dblclick", { clientX: 300, clientY: 300 });
    expect(onRouteChange).toHaveBeenCalledTimes(1);
    expect(onRouteChange.mock.calls[0][0]).toBe("e3");
    // e3 은 꺾이는 자동 경로라 두 모서리를 이어받고 누른 자리 점이 하나 더해진다(W1 Ruling — 선이 튀지 않는다).
    expect(onRouteChange.mock.calls[0][1]).toHaveLength(3);
    // 보기 모드에는 끝 손잡이가 없고 두 번 누르기도 없다.
    onRouteChange.mockClear();
    await draw(cprops({ flow: short(), selectedEdgeId: "e3", onRouteChange, mode: "view" }));
    expect(host.querySelector(".react-flow__edgeupdater")).toBeNull();
  });
});
