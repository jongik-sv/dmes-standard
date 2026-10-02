/** @vitest-environment happy-dom */

// 선 [+] 표시 조건 · 칩·조건 라벨 끌어 옮기기(3단계 추가 Task L1) — view.labels 코덱·연산, 캔버스 hover·끌기.
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import { ADD_HOVER_GRACE_MS, FlowCanvas, LABEL_DRAG_THRESHOLD_PX, type FlowCanvasProps } from "../../../pages/dme/ruleSetEdit/canvas/FlowCanvas";
import { buildMenu, type CanvasActions, type MenuContext } from "../../../pages/dme/ruleSetEdit/canvas/context-menu";
import { MENU_PROVIDERS } from "../../../pages/dme/ruleSetEdit/canvas/menus";
import {
  EMPTY_VIEW, MAX_LABEL_OFFSET, clearEdgeLayout, flowJsonOf, insertSplit, reconnectEdge, removeEdge, removeNode, setLabelOffset, setRoute,
  toEditFlow, updateEdge, type EditFlow, type EditResult, type FlowPos,
} from "../../../pages/dme/ruleSetEdit/flow-edit";
import { autoArrange, drawnPositions, shiftSpace } from "../../../pages/dme/ruleSetEdit/flow-layout";
import { RSF_CSS } from "../../../pages/dme/ruleSetEdit/rsf-styles";
import type { RuleIo } from "../../../pages/dme/ruleSetEdit/types";
import { flush, installDomStorage } from "../helpers/render";

function ok(r: EditResult): EditFlow {
  if (!r.ok) throw new Error(r.reason);
  return r.flow;
}
/** start → r1 → if1{e4 조건 "갈래 1" / e5 그 외} → m1 → r2 → end. 선: e1 e2 e4 e5 e6 e3. */
function ifFlow(): EditFlow {
  const f = ok(insertSplit(toEditFlow(null, ["R_A", "R_B"]), "e2", "IF"));
  return ok(updateEdge(f, f.edges.find((e) => e.from === "if1" && !e.otherwise)!.id, { cond: "true" }));
}
const P = (x: number, y: number): FlowPos => ({ x, y });
const D = (dx: number, dy: number) => ({ dx, dy });

// ───────────────────────── 코덱 ─────────────────────────

describe("view.labels 코덱", () => {
  it("EMPTY_VIEW·빈 view 는 labels 가 비어 있다", () => {
    expect(EMPTY_VIEW.labels).toEqual({});
    expect(toEditFlow(null, ["R_A"]).view.labels).toEqual({});
  });

  it("sanitizeView — 유한 dx·dy 만 남기고 ±600 으로 자르며, 흐름에 없는 선·잘못된 모양·빈 항목은 버린다", () => {
    const base = ifFlow();
    const raw = {
      ...base,
      view: {
        positions: {}, notes: [], groups: [], routes: {},
        labels: {
          e4: { label: { dx: 10, dy: -5 }, chips: { dx: "a", dy: 1 } },
          e5: { chips: { dx: 9999, dy: -9999 } },
          e1: "x",
          e2: {},
          e3: { label: { dx: Infinity, dy: 0 } },
          zz: { label: { dx: 1, dy: 1 } },
        },
      },
    };
    const f = toEditFlow(raw as never, []);
    expect(f.view.labels).toEqual({ e4: { label: D(10, -5) }, e5: { chips: D(MAX_LABEL_OFFSET, -MAX_LABEL_OFFSET) } });
  });

  it("flowJsonOf — view 키 순서는 positions·notes·groups·routes·labels, labels 키는 선 배열 순서, 항목은 label·chips 순서다", () => {
    let f = ifFlow();
    f = ok(setLabelOffset(f, "e3", "chips", D(5, 6)));
    f = ok(setLabelOffset(f, "e3", "label", D(1, 2)));
    f = ok(setLabelOffset(f, "e1", "chips", D(3, 4)));
    const json = JSON.parse(flowJsonOf(f));
    expect(Object.keys(json.view)).toEqual(["positions", "notes", "groups", "routes", "labels"]);
    expect(Object.keys(json.view.labels)).toEqual(["e1", "e3"]);
    expect(flowJsonOf(f)).toContain('"labels":{"e1":{"chips":{"dx":3,"dy":4}},"e3":{"label":{"dx":1,"dy":2},"chips":{"dx":5,"dy":6}}}');
  });

  it("왕복 — flowJsonOf → toEditFlow → flowJsonOf 가 같다", () => {
    const f = ok(setLabelOffset(ifFlow(), "e4", "label", D(-30, 12)));
    const s = flowJsonOf(f);
    expect(flowJsonOf(toEditFlow(JSON.parse(s), []))).toBe(s);
  });

  it("labels 가 없는 옛 저장본은 열어서 다시 쓴 값과 같다(dirty 기준 — 열자마자 바뀐 것으로 보지 않는다)", () => {
    const old = { ...ifFlow(), view: { positions: {}, notes: [], groups: [], routes: {} } };
    const opened = toEditFlow(JSON.parse(JSON.stringify(old)), []);
    expect(opened.view.labels).toEqual({});
    expect(flowJsonOf(toEditFlow(JSON.parse(flowJsonOf(opened)), []))).toBe(flowJsonOf(opened));
  });
});

// ───────────────────────── 연산 ─────────────────────────

describe("setLabelOffset", () => {
  it("라벨·칩 오프셋을 따로 두고, 입력은 바뀌지 않는다", () => {
    const f = ifFlow();
    const before = flowJsonOf(f);
    const g = ok(setLabelOffset(f, "e4", "label", D(20, -10)));
    expect(g.view.labels).toEqual({ e4: { label: D(20, -10) } });
    const h = ok(setLabelOffset(g, "e4", "chips", D(-4, 8)));
    expect(h.view.labels).toEqual({ e4: { label: D(20, -10), chips: D(-4, 8) } });
    expect(g.view.labels).toEqual({ e4: { label: D(20, -10) } });
    expect(flowJsonOf(f)).toBe(before);
  });

  it("null 이면 그 부분을 지우고, 둘 다 없어지면 선 키를 지운다. {0,0} 도 기본 자리라 지운다", () => {
    let f = ok(setLabelOffset(ifFlow(), "e4", "label", D(20, -10)));
    f = ok(setLabelOffset(f, "e4", "chips", D(1, 1)));
    f = ok(setLabelOffset(f, "e4", "label", null));
    expect(f.view.labels).toEqual({ e4: { chips: D(1, 1) } });
    f = ok(setLabelOffset(f, "e4", "chips", D(0, 0)));
    expect(f.view.labels).toEqual({});
    expect(Object.prototype.hasOwnProperty.call(f.view.labels, "e4")).toBe(false);
  });

  it("±600 으로 자르고 정수로 반올림한다", () => {
    const f = ok(setLabelOffset(ifFlow(), "e1", "chips", D(700, -900.2)));
    expect(f.view.labels.e1.chips).toEqual(D(600, -600));
    const g = ok(setLabelOffset(ifFlow(), "e1", "label", D(1.4, -2.6)));
    expect(g.view.labels.e1.label).toEqual(D(1, -3));
  });

  it("없는 선·유한하지 않은 값은 거부한다", () => {
    expect(setLabelOffset(ifFlow(), "zz", "label", D(1, 1)).ok).toBe(false);
    expect(setLabelOffset(ifFlow(), "e1", "label", D(Number.NaN, 1)).ok).toBe(false);
    expect(setLabelOffset(ifFlow(), "e1", "chips", D(1, Infinity)).ok).toBe(false);
  });
});

describe("선이 바뀔 때의 labels", () => {
  const labelled = () => {
    let f = ifFlow();
    for (const id of ["e1", "e3", "e6"]) f = ok(setLabelOffset(f, id, "label", D(10, 10)));
    return f;
  };

  it("지운 선의 labels 는 버린다(removeNode·removeEdge — 공용 done)", () => {
    const g = ok(removeNode(labelled(), "r2")); // e3(r2→end) 가 지워지고 e6 이 m1→end 로 이어 받는다
    expect(g.edges.some((e) => e.id === "e3")).toBe(false);
    expect(Object.keys(g.view.labels)).toEqual(["e1", "e6"]);
    const h = ok(removeEdge(labelled(), "e1"));
    expect(Object.keys(h.view.labels)).toEqual(["e6", "e3"]);
  });

  it("선 끝 옮기기(reconnectEdge)는 labels 를 남기고 경로만 지운다", () => {
    const f = ok(setRoute(labelled(), "e1", [P(5, 5)]));
    const g = ok(reconnectEdge(f, "e1", { to: "r2" }));
    expect(g.view.routes.e1).toBeUndefined();
    expect(g.view.labels.e1).toEqual({ label: D(10, 10) });
  });

  it("[자동 정렬] 은 경로와 labels 를 함께 비운다", () => {
    const f = ok(setRoute(labelled(), "e1", [P(5, 5)]));
    const g = autoArrange(f);
    expect(g.view.routes).toEqual({});
    expect(g.view.labels).toEqual({});
  });

  it("clearEdgeLayout([경로 초기화]) 는 그 선의 경로와 labels 만 비운다", () => {
    let f = ok(setRoute(labelled(), "e1", [P(5, 5)]));
    f = ok(setRoute(f, "e3", [P(7, 7)]));
    const g = ok(clearEdgeLayout(f, "e1"));
    expect(g.view.routes).toEqual({ e3: [P(7, 7)] });
    expect(Object.keys(g.view.labels)).toEqual(["e6", "e3"]);
    expect(clearEdgeLayout(f, "zz").ok).toBe(false);
  });

  it("공간 넓히기(shiftSpace)는 오프셋이라 labels 를 그대로 둔다", () => {
    const f = labelled();
    const g = shiftSpace(f, "y", 100, 60, drawnPositions(f));
    expect(g).not.toBe(f);
    expect(g.view.labels).toEqual(f.view.labels);
  });
});

describe("선 우클릭 [경로 초기화] 항목 조건", () => {
  const act_ = (): CanvasActions => new Proxy({} as CanvasActions, { get: (t, k) => ((t as never)[k] ??= vi.fn()) });
  const ctx = (flow: EditFlow): MenuContext => ({
    flow, rules: {}, mode: "edit", hasClipboard: false, selectedEdgeId: null, collapsed: new Set(), breakpoints: new Set(), canRun: true, act: act_(),
  });
  it("경로 없이 labels 만 있어도 보이고 누르면 resetRoute 를 부른다", () => {
    const f = ok(setLabelOffset(ifFlow(), "e1", "chips", D(3, 3)));
    const c = ctx(f);
    const items = buildMenu(MENU_PROVIDERS, { kind: "edge", edgeId: "e1", via: "context" }, c);
    const item = items.find((i) => i.id === "route-reset");
    expect(item).toBeDefined();
    item!.run!();
    expect(c.act.resetRoute).toHaveBeenCalledWith("e1");
    expect(buildMenu(MENU_PROVIDERS, { kind: "edge", edgeId: "e2", via: "context" }, ctx(f)).map((i) => i.id)).not.toContain("route-reset");
  });
});

// ───────────────────────── 캔버스 ─────────────────────────

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

const nm = (n: string) => ({ name: n, source: null, label: null, dataType: null, scale: null, dateString: false, maruCodeId: null });
const ioOf = (ruleId: string, out: string): RuleIo => ({
  ruleId, ruleName: `${ruleId} 이름`, ruleKind: "DECISION", status: "INUSE", exists: true, releasedVer: "1.000", hitPolicy: "FIRST", conds: [], results: [nm(out)],
});
const RULES = { R_A: ioOf("R_A", "S_A"), R_B: ioOf("R_B", "S_B") };
const noop = () => {};
function props(over: Partial<FlowCanvasProps> = {}): FlowCanvasProps {
  return {
    flow: ifFlow(), rules: RULES, checks: [], mode: "edit", varDisplay: "id", selectedId: null, selectedEdgeId: null,
    overlay: null, focusId: null, focusSeq: 0, onSelect: noop, onSelectEdge: noop, onOpenRule: noop, onMove: noop, onConnect: noop,
    onDropPalette: noop, onNoteChange: noop,
    breakpoints: new Set(), collapsed: new Set(), showMiniMap: false, editingCondEdgeId: null, onMoveNode: noop, onDropRule: noop,
    onContextMenu: noop, onEditCond: noop, onEditCondClose: noop, onToggleBreakpoint: noop, onRouteChange: noop, onLabelOffsetChange: noop, ...over,
  };
}
async function draw(p: FlowCanvasProps) {
  await act(async () => {
    root.render(createElement(DmesUiProvider, null, createElement("div", { style: { width: 800, height: 600 } }, createElement(FlowCanvas, p))));
  });
  await flush();
}
const q = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const edgePath = (edgeId: string) => q(`rf__edge-${edgeId}`)!.querySelector("path")!;
const fire = async (el: Element | Window, type: string, init: MouseEventInit = {}) =>
  act(async () => { el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...init })); });
const wait = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const hoverIn = (el: Element) => fire(el, "mouseover", { relatedTarget: null });
const hoverOut = (el: Element) => fire(el, "mouseout", { relatedTarget: document.body });
const tf = (testId: string) => (q(testId)!.parentElement as HTMLElement).style.transform;
const xy = (s: string) => {
  const m = /translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px\)\s*$/.exec(s)!;
  return { x: Number(m[1]), y: Number(m[2]) };
};
const zoom = () => Number(/scale\(\s*([\d.]+)\s*\)/.exec((document.querySelector(".react-flow__viewport") as HTMLElement).style.transform)?.[1] ?? 1);

describe("FlowCanvas 선 [+] 표시 조건", () => {
  it("편집 모드에서 선에 마우스를 올리면 [+] 가 보이고, 떠나면 유예 뒤 사라진다", async () => {
    await draw(props());
    expect(q("flow-edge-add-e2")).toBeNull();
    await hoverIn(edgePath("e2"));
    expect(q("flow-edge-add-e2")).not.toBeNull();
    expect(q("flow-edge-add-e1")).toBeNull(); // 다른 선은 그대로
    await hoverOut(edgePath("e2"));
    expect(q("flow-edge-add-e2")).not.toBeNull(); // 유예 중
    await wait(ADD_HOVER_GRACE_MS + 60);
    expect(q("flow-edge-add-e2")).toBeNull();
  });

  it("선에서 [+] 로 옮겨 가는 사이(유예 안)에는 사라지지 않고, [+] 위에 있는 동안 남는다", async () => {
    await draw(props());
    await hoverIn(edgePath("e2"));
    await hoverOut(edgePath("e2"));
    await wait(40);
    await hoverIn(q("flow-edge-add-e2")!);
    await wait(ADD_HOVER_GRACE_MS + 60);
    expect(q("flow-edge-add-e2")).not.toBeNull();
    await hoverOut(q("flow-edge-add-e2")!);
    await wait(ADD_HOVER_GRACE_MS + 60);
    expect(q("flow-edge-add-e2")).toBeNull();
  });

  it("라벨·칩 위에 올려도 그 선의 [+] 가 보인다", async () => {
    await draw(props());
    await hoverIn(q("flow-edge-label-e4")!);
    expect(q("flow-edge-add-e4")).not.toBeNull();
    await hoverOut(q("flow-edge-label-e4")!);
    await hoverIn(q("flow-edge-chips-e2")!);
    expect(q("flow-edge-add-e2")).not.toBeNull();
  });

  it("고른 선은 올리지 않아도 [+] 가 보이고, 보기·디버그 모드에서는 고르거나 올려도 없다", async () => {
    await draw(props({ selectedEdgeId: "e2" }));
    expect(q("flow-edge-add-e2")).not.toBeNull();
    expect(q("flow-edge-add-e1")).toBeNull();
    for (const mode of ["view", "debug"] as const) {
      await draw(props({ selectedEdgeId: "e2", mode }));
      await hoverIn(edgePath("e1"));
      expect(document.querySelectorAll('[data-testid^="flow-edge-add-"]'), mode).toHaveLength(0);
      await hoverOut(edgePath("e1"));
    }
  });

  it("memo — 같은 props 에서 selectedEdgeId 만 바꿔도 [+] 가 나타나고, hover 는 어떤 콜백도 부르지 않는다", async () => {
    const onSelectEdge = vi.fn();
    const onSelect = vi.fn();
    const onContextMenu = vi.fn();
    const p = props({ onSelectEdge, onSelect, onContextMenu });
    await draw(p);
    expect(q("flow-edge-add-e3")).toBeNull();
    await draw({ ...p, selectedEdgeId: "e3" });
    expect(q("flow-edge-add-e3")).not.toBeNull();
    await draw(p);
    expect(q("flow-edge-add-e3")).toBeNull();
    await hoverIn(edgePath("e3"));
    expect(q("flow-edge-add-e3")).not.toBeNull();
    expect(onSelectEdge).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
    expect(onContextMenu).not.toHaveBeenCalled();
  });
});

describe("L1 고침 1회차", () => {
  it("값 툴팁이 있는 변수 칩은 모든 모드에서 마우스를 받는다 — 이름표 층의 pointer-events: none 을 칩에서 다시 켠다(T11 E3)", () => {
    expect(RSF_CSS.replace(/\s+/g, " ")).toContain(".rsf-vchip[title] { cursor: help; pointer-events: auto; }");
  });

  it("올려 둔 선이 흐름에서 사라지면 hover 를 비운다 — 되살아난 선에 [+] 가 붙어 남지 않는다", async () => {
    const p = props();
    await draw(p);
    await hoverIn(edgePath("e1"));
    expect(q("flow-edge-add-e1")).not.toBeNull();
    await draw({ ...p, flow: ok(removeEdge(p.flow, "e1")) }); // 포인터를 둔 채 선을 지움 — React 는 leave 를 보내지 않는다
    await draw(p); // 되돌리기
    expect(q("flow-edge-add-e1")).toBeNull();
  });

  it("onLabelOffsetChange 를 넘기지 않으면 라벨·칩을 끌 수 없다(끌다가 제자리로 튀지 않게)", async () => {
    await draw(props({ onLabelOffsetChange: undefined }));
    expect(q("flow-edge-label-e4")!.classList.contains("rsf-elabel-drag")).toBe(false);
    expect(q("flow-edge-chips-e2")!.classList.contains("rsf-elabel-drag")).toBe(false);
  });
});

describe("FlowCanvas 칩·조건 라벨 끌어 옮기기", () => {
  it("저장된 오프셋만큼 기본 자리에서 비켜 그린다(보기 모드도). memo — 같은 props 에서 flow 의 labels 만 바꿔도 다시 그린다", async () => {
    const p = props({ mode: "view" });
    await draw(p);
    const label0 = xy(tf("flow-edge-label-e4"));
    const chips0 = xy(tf("flow-edge-chips-e2"));
    let f = ok(setLabelOffset(p.flow, "e4", "label", D(30, -20)));
    f = ok(setLabelOffset(f, "e2", "chips", D(-15, 25)));
    await draw({ ...p, flow: f });
    expect(xy(tf("flow-edge-label-e4"))).toEqual({ x: label0.x + 30, y: label0.y - 20 });
    expect(xy(tf("flow-edge-chips-e2"))).toEqual({ x: chips0.x - 15, y: chips0.y + 25 });
  });

  it("편집 모드의 라벨·칩은 끌 수 있는 표시(nodrag nopan nokey)를 달고, 보기 모드는 달지 않는다. CSS 가 편집 모드에서 누름을 받게 한다", async () => {
    await draw(props());
    for (const id of ["flow-edge-label-e4", "flow-edge-chips-e2"]) {
      const cl = q(id)!.classList;
      expect(cl.contains("rsf-elabel-drag"), id).toBe(true);
      expect(cl.contains("nodrag") && cl.contains("nopan") && cl.contains("nokey"), id).toBe(true);
    }
    await draw(props({ mode: "view" }));
    expect(q("flow-edge-label-e4")!.classList.contains("rsf-elabel-drag")).toBe(false);
    expect(q("flow-edge-chips-e2")!.classList.contains("rsf-elabel-drag")).toBe(false);
    expect(RSF_CSS.replace(/\s+/g, " ")).toContain('.rsf-canvas[data-mode="edit"] .rsf-elabel-drag { pointer-events: auto;');
  });

  it("라벨을 임계값 넘게 끌면 화면에서만 움직이고, 놓을 때 한 번 올린다(흐름 좌표 = 화면 거리 ÷ 배율)", async () => {
    const onLabelOffsetChange = vi.fn();
    await draw(props({ onLabelOffsetChange }));
    const before = xy(tf("flow-edge-label-e4"));
    const el = q("flow-edge-label-e4")!;
    await fire(el, "pointerdown", { clientX: 100, clientY: 100 });
    await fire(window, "pointermove", { clientX: 102, clientY: 101, buttons: 1 });
    expect(xy(tf("flow-edge-label-e4"))).toEqual(before); // 임계값 아래
    await fire(window, "pointermove", { clientX: 140, clientY: 100, buttons: 1 });
    const k = zoom();
    const dx = Math.round(40 / k);
    expect(xy(tf("flow-edge-label-e4"))).toEqual({ x: before.x + dx, y: before.y });
    expect(onLabelOffsetChange).not.toHaveBeenCalled();
    await fire(window, "pointerup", { clientX: 140, clientY: 100 });
    expect(onLabelOffsetChange).toHaveBeenCalledTimes(1);
    expect(onLabelOffsetChange).toHaveBeenCalledWith("e4", "label", D(dx, 0));
  });

  it("칩 묶음은 저장된 오프셋에 더해 옮기고, 오프셋은 ±600 에서 멈춘다(미리보기도)", async () => {
    const onLabelOffsetChange = vi.fn();
    const f = ok(setLabelOffset(ifFlow(), "e2", "chips", D(10, 10)));
    await draw(props({ flow: f, onLabelOffsetChange }));
    const el = q("flow-edge-chips-e2")!;
    const k = zoom();
    await fire(el, "pointerdown", { clientX: 50, clientY: 50 });
    await fire(window, "pointermove", { clientX: 50, clientY: 70, buttons: 1 });
    await fire(window, "pointerup", { clientX: 50, clientY: 70 });
    expect(onLabelOffsetChange).toHaveBeenLastCalledWith("e2", "chips", D(10, 10 + Math.round(20 / k)));
    onLabelOffsetChange.mockClear();
    const base = xy(tf("flow-edge-chips-e2"));
    await fire(el, "pointerdown", { clientX: 50, clientY: 50 });
    await fire(window, "pointermove", { clientX: 50 + 100000, clientY: 50, buttons: 1 });
    expect(xy(tf("flow-edge-chips-e2")).x).toBe(base.x - 10 + MAX_LABEL_OFFSET);
    await fire(window, "pointerup", { clientX: 50 + 100000, clientY: 50 });
    expect(onLabelOffsetChange).toHaveBeenCalledWith("e2", "chips", D(MAX_LABEL_OFFSET, 10));
  });

  it("임계값 미만은 기록이 없고, 라벨 두 번 누르기(조건식 칸)가 그대로다", async () => {
    const onLabelOffsetChange = vi.fn();
    await draw(props({ onLabelOffsetChange }));
    const el = q("flow-edge-label-e4")!;
    await fire(el, "pointerdown", { clientX: 100, clientY: 100 });
    await fire(window, "pointermove", { clientX: 100 + LABEL_DRAG_THRESHOLD_PX - 1, clientY: 100, buttons: 1 });
    await fire(window, "pointerup", { clientX: 100 + LABEL_DRAG_THRESHOLD_PX - 1, clientY: 100 });
    expect(onLabelOffsetChange).not.toHaveBeenCalled();
    await fire(el, "dblclick");
    expect(q("flow-edge-cond-input-e4")).not.toBeNull();
  });

  it("끌었다가 제자리로 돌아와 놓거나, pointercancel·단추 뗀 움직임이면 기록하지 않고 원래 자리로 돌아간다", async () => {
    const onLabelOffsetChange = vi.fn();
    await draw(props({ onLabelOffsetChange }));
    const el = q("flow-edge-label-e4")!;
    const before = tf("flow-edge-label-e4");
    await fire(el, "pointerdown", { clientX: 100, clientY: 100 });
    await fire(window, "pointermove", { clientX: 160, clientY: 100, buttons: 1 });
    await fire(window, "pointermove", { clientX: 100, clientY: 100, buttons: 1 });
    await fire(window, "pointerup", { clientX: 100, clientY: 100 });
    expect(onLabelOffsetChange).not.toHaveBeenCalled();
    await fire(el, "pointerdown", { clientX: 100, clientY: 100 });
    await fire(window, "pointermove", { clientX: 160, clientY: 100, buttons: 1 });
    expect(tf("flow-edge-label-e4")).not.toBe(before);
    await fire(window, "pointercancel");
    expect(tf("flow-edge-label-e4")).toBe(before);
    await fire(el, "pointerdown", { clientX: 100, clientY: 100 });
    await fire(window, "pointermove", { clientX: 160, clientY: 100, buttons: 1 });
    await fire(window, "pointermove", { clientX: 170, clientY: 100, buttons: 0 });
    expect(tf("flow-edge-label-e4")).toBe(before);
    await fire(window, "pointerup", { clientX: 170, clientY: 100 });
    expect(onLabelOffsetChange).not.toHaveBeenCalled();
  });

  it("보기·디버그 모드에서는 끌 수 없다", async () => {
    for (const mode of ["view", "debug"] as const) {
      const onLabelOffsetChange = vi.fn();
      await draw(props({ mode, onLabelOffsetChange }));
      const before = tf("flow-edge-label-e4");
      await fire(q("flow-edge-label-e4")!, "pointerdown", { clientX: 100, clientY: 100 });
      await fire(window, "pointermove", { clientX: 160, clientY: 130, buttons: 1 });
      expect(tf("flow-edge-label-e4"), mode).toBe(before);
      await fire(window, "pointerup", { clientX: 160, clientY: 130 });
      expect(onLabelOffsetChange, mode).not.toHaveBeenCalled();
    }
  });
});
