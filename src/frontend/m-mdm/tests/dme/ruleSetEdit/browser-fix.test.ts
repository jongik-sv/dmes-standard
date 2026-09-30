/** @vitest-environment happy-dom */

// 3단계 브라우저 확인 결함 고침 — 저장 위치가 있는 흐름에 새 노드를 넣으면 겹치지 않는다(5번), 도움말 Esc 뒤 초점(8번 단서),
// 빈 갈래 둘인 IF 의 라벨 겹침·변수 칩 쌓임 순서(그 밖의 관찰).
import { createElement, act } from "react";
import { createRoot } from "react-dom/client";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ openRuleEdit: vi.fn(), openMdmPage: vi.fn() }));

vi.mock("@/dme/rule-handoff", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/dme/rule-handoff")>()),
  openRuleEdit: (...args: unknown[]) => mocks.openRuleEdit(...args),
}));

vi.mock("@/shell", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shell")>()),
  openMdmPage: (...args: unknown[]) => mocks.openMdmPage(...args),
}));

import {
  copyFragment, duplicateNode, insertSplit, pasteFragment, setPositions, toEditFlow,
  type EditFlow, type EditResult, type Fragment,
} from "../../../pages/dme/ruleSetEdit/flow-edit";
import { NODE_SIZE, autoLayout, drawnPositions, positionsOf, resolveOverlaps } from "../../../pages/dme/ruleSetEdit/flow-layout";
import { FlowCanvas, type FlowCanvasProps } from "../../../pages/dme/ruleSetEdit/canvas/FlowCanvas";
import { RSF_CSS } from "../../../pages/dme/ruleSetEdit/rsf-styles";
import type { RuleIo, RuleSetView } from "../../../pages/dme/ruleSetEdit/types";
import type { FlowNodeKind } from "@/contract/engine-contract.generated";
import { flush, installDomStorage } from "../helpers/render";
import { byTestId, calls, canvasNodeIds, click, installServer, openSet, q, uninstallServer } from "../helpers/rule-set-page";

const ioName = (n: string) => ({ name: n, source: "DICT" as const, label: null, dataType: null, scale: null, dateString: false, maruCodeId: null });
const rule = (ruleId: string, cond: string, result: string): RuleIo => ({
  ruleId, ruleName: `${ruleId} 이름`, ruleKind: "DECISION", status: "INUSE", exists: true, releasedVer: 1, hitPolicy: "FIRST",
  conds: [ioName(cond)], results: [{ ...ioName(result), source: null }],
});
const RULES = [rule("BF_A", "IN_A", "OUT_A"), rule("BF_B", "OUT_A", "OUT_B"), rule("BF_C", "OUT_B", "OUT_C")];
const IDS = RULES.map((r) => r.ruleId);

function viewOf(setId: string, flow: EditFlow): RuleSetView {
  return {
    set: { setId, setName: "이름", description: null, status: "INUSE", rowVersion: 1, ruleIds: IDS, flow, branched: false },
    rules: RULES, checks: [], condIo: {}, editable: true, restorable: false, cases: [],
  };
}
function ok(r: EditResult): EditFlow {
  if (!r.ok) throw new Error(r.reason);
  return r.flow;
}
/** start → r1 → r2 → r3 → end. 선 e1(start→r1) e2(r1→r2) e3(r2→r3) e4(r3→end). */
const chain = () => toEditFlow(null, IDS);

/**
 * 덫 — op 가 만들 새 노드(newId)가 자동 배치로 놓일 자리에 기존 노드 victim 의 저장 위치를 둔다(브라우저 확인 5번의 r3~m1 과 같은 모양).
 * 고치기 전에는 새 노드가 victim 과 같은 자리에 그려진다.
 */
function trap(op: (f: EditFlow) => EditFlow, newId: string, victim: string): EditFlow {
  const spot = autoLayout(op(chain()))[newId];
  return setPositions(chain(), { [victim]: spot });
}

interface Box { id: string; x1: number; y1: number; x2: number; y2: number }
const boxesOf = (f: EditFlow): Box[] => {
  const pos = positionsOf(f);
  return f.nodes.map((n) => {
    const p = pos[n.id];
    const s = NODE_SIZE[n.kind];
    return { id: n.id, x1: p.x, y1: p.y, x2: p.x + s.w, y2: p.y + s.h };
  });
};
const hit = (a: Box, b: Box) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
/** 새 노드마다 겹치는 다른 노드 ID 목록(비어야 한다). */
function clashes(boxes: Box[], fresh: readonly string[]): string[] {
  const out: string[] = [];
  for (const id of fresh) {
    const me = boxes.find((b) => b.id === id)!;
    for (const b of boxes) if (b.id !== id && !fresh.includes(b.id) && hit(me, b)) out.push(`${id}~${b.id}`);
  }
  return out;
}

/** 캔버스에 그려진 흐름 노드 상자(React Flow 노드 transform + 종류 크기). */
function renderedBoxes(): Box[] {
  return canvasNodeIds().map((id) => {
    const el = document.querySelector(`.react-flow__node[data-id="${id}"]`) as HTMLElement;
    const m = /translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(el.style.transform)!;
    const kind = byTestId(`flow-node-${id}`).getAttribute("data-kind") as FlowNodeKind;
    const x = Number(m[1]);
    const y = Number(m[2]);
    // 접힌 분기는 룰 크기로 그린다 — React Flow 래퍼에 준 width/height 를 먼저 본다.
    const w = parseFloat(el.style.width) || NODE_SIZE[kind].w;
    const h = parseFloat(el.style.height) || NODE_SIZE[kind].h;
    return { id, x1: x, y1: y, x2: x + w, y2: y + h };
  });
}

async function key(el: Element, init: KeyboardEventInit): Promise<KeyboardEvent> {
  const ev = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  await act(async () => {
    el.dispatchEvent(ev);
  });
  await flush();
  return ev;
}
const canvas = () => byTestId("flow-canvas");
async function focusCanvas() {
  await act(async () => {
    canvas().focus();
  });
}
async function clickEdge(id: string) {
  await act(async () => {
    q(`rf__edge-${id}`)!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flush();
}
const transformOf = (el: Element) => (el as HTMLElement).style.transform;

/** 그려진 상자 전부에서 서로 겹치는 쌍(비어야 한다). */
function allClashes(boxes: Box[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (hit(boxes[i], boxes[j])) out.push(`${boxes[i].id}~${boxes[j].id}`);
  return out;
}
async function ctxMenu(id: string) {
  await act(async () => {
    byTestId(id).dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 120, clientY: 80 }));
  });
  await flush();
}
/** 저장 요청의 view.positions 키(정렬). */
function savedPositionKeys(): string[] {
  const params = calls("save").at(-1)!.body.params as Record<string, unknown>;
  const flow = JSON.parse(String(params.flowJson)) as EditFlow;
  return Object.keys(flow.view.positions).sort();
}
/** start 만 자동 배치 자리에 저장해 둔 흐름(「저장 위치가 있는 흐름」 — 리뷰 Important 1·2 의 시작 모양). */
const pinStart = (f: EditFlow) => setPositions(f, { start: positionsOf(f).start });

describe("저장 위치가 있는 흐름에 새 노드 넣기(브라우저 확인 5번, 고침 1회차 Ruling 19)", () => {
  beforeEach(() => {
    installServer();
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    uninstallServer();
  });

  it("덫 확인 — 연산 결과(위치 없음)의 자동 배치는 새 노드가 저장 위치 노드와 겹친다", () => {
    const f = trap((g) => ok(duplicateNode(g, "r1")), "r4", "r3");
    expect(clashes(boxesOf(ok(duplicateNode(f, "r1"))), ["r4"])).toEqual(["r4~r3"]);
  });

  it("resolveOverlaps — 고정 노드가 없으면 같은 객체, 있으면 고정 노드는 그대로 두고 겹친 노드만 가로로 민다", () => {
    const boxes = [
      { id: "a", w: 100, h: 40 },
      { id: "b", w: 100, h: 40 },
      { id: "c", w: 100, h: 40 },
    ];
    const pos = { a: { x: 0, y: 0 }, b: { x: 10, y: 10 }, c: { x: 0, y: 200 } };
    expect(resolveOverlaps(boxes, pos, new Set())).toBe(pos);
    const out = resolveOverlaps(boxes, pos, new Set(["a"]));
    expect(out.a).toEqual({ x: 0, y: 0 }); // 고정은 움직이지 않는다
    expect(out.b.y).toBe(10); // 세로는 그대로, 가로로만
    expect(out.b.x).not.toBe(10);
    expect(out.c).toEqual({ x: 0, y: 200 }); // 겹치지 않은 노드는 그대로
    expect(pos.b).toEqual({ x: 10, y: 10 }); // 입력은 바꾸지 않는다
  });

  it("resolveOverlaps — 상한 안에 빈자리가 없으면 그 자리에 둔다", () => {
    const wall = Array.from({ length: 101 }, (_, i) => ({ id: `w${i}`, w: 24, h: 40 }));
    const boxes = [...wall, { id: "x", w: 24, h: 40 }];
    const pos: Record<string, { x: number; y: number }> = { x: { x: 0, y: 0 } };
    wall.forEach((w, i) => (pos[w.id] = { x: (i - 50) * 24, y: 0 }));
    const out = resolveOverlaps(boxes, pos, new Set(wall.map((w) => w.id)));
    expect(out.x).toEqual({ x: 0, y: 0 });
  });

  it("항목 5 — 옮겨 둔 IF 블록의 합류 자리에 올 룰을 다른 IF 의 '그 외' 선에 붙여도 그려진 상자가 서로 겹치지 않는다(좌표를 저장하지 않는 것은 복제 케이스가 저장 요청으로 본다)", async () => {
    let g = ok(insertSplit(chain(), "e2", "IF")); // if1·m1
    g = ok(insertSplit(g, g.edges.find((e) => e.to === "r3")!.id, "IF")); // if2·m2
    const other = g.edges.find((e) => e.from === "if2" && e.otherwise)!.id;
    const spot = autoLayout(ok(pasteFragment(g, other, copyFragment(g, "r1") as Fragment))).r4;
    const moved = positionsOf(g);
    const dx = spot.x - moved.m1.x;
    const dy = spot.y - moved.m1.y;
    const f = setPositions(g, Object.fromEntries(["if1", "r2", "m1"].map((id) => [id, { x: moved[id].x + dx, y: moved[id].y + dy }])));
    await openSet("BF_ITEM5", viewOf("BF_ITEM5", f));
    await click("flow-mode-edit");
    await click("flow-node-r1");
    await focusCanvas();
    await key(canvas(), { key: "c", ctrlKey: true });
    await clickEdge(other);
    await key(canvas(), { key: "v", ctrlKey: true });
    expect(canvasNodeIds()).toContain("r4");
    expect(allClashes(renderedBoxes())).toEqual([]);
  });

  it("리뷰 시나리오 1 — start 만 저장된 흐름에서 r2→r3 에 넣은 뒤 r1 을 지우거나 그 위쪽에 또 넣어도 겹치지 않는다", async () => {
    await openSet("BF_S1", viewOf("BF_S1", pinStart(chain())));
    await click("flow-mode-edit");
    await click("flow-node-r2");
    await focusCanvas();
    await key(canvas(), { key: "d", ctrlKey: true }); // r4 가 r2→r3 선에
    expect(canvasNodeIds()).toContain("r4");
    expect(allClashes(renderedBoxes())).toEqual([]);

    // 위쪽(start→r1 선)에 또 넣기
    await click("flow-node-r1");
    await key(canvas(), { key: "c", ctrlKey: true });
    await clickEdge("e1");
    await key(canvas(), { key: "v", ctrlKey: true });
    expect(canvasNodeIds()).toContain("r5");
    expect(allClashes(renderedBoxes())).toEqual([]);

    // 위쪽 노드 지우기
    await click("flow-node-r1");
    await key(canvas(), { key: "Delete" });
    expect(canvasNodeIds()).not.toContain("r1");
    expect(allClashes(renderedBoxes())).toEqual([]);
  });

  it("리뷰 시나리오 2 — 블록을 접은 채 그 아래에 넣어도 접힌 표시에서 겹치지 않는다", async () => {
    const f = pinStart(ok(insertSplit(chain(), "e2", "IF"))); // start→r1→[if1 빈 갈래 둘]→m1→r2→r3→end
    await openSet("BF_S2", viewOf("BF_S2", f));
    await click("flow-mode-edit");
    await ctxMenu("flow-node-if1");
    await click("flow-menu-item-collapse");
    expect(canvasNodeIds()).not.toContain("m1"); // 접혔다
    await click("flow-node-r2");
    await focusCanvas();
    await key(canvas(), { key: "d", ctrlKey: true }); // r4 가 r2→r3 선에
    expect(canvasNodeIds()).toContain("r4");
    expect(allClashes(renderedBoxes())).toEqual([]);
  });

  it("복제(Ctrl+D) — 되돌리기 한 번에 원래 흐름·그려진 상자로 돌아가고, 저장 위치는 원래 것뿐이다", async () => {
    const f = trap((g) => ok(duplicateNode(g, "r1")), "r4", "r3");
    await openSet("BF_DUP", viewOf("BF_DUP", f));
    await click("flow-mode-edit");
    const before = renderedBoxes();
    await click("flow-node-r1");
    await focusCanvas();
    await key(canvas(), { key: "d", ctrlKey: true });
    expect(canvasNodeIds()).toContain("r4");
    expect(allClashes(renderedBoxes())).toEqual([]);
    await click("set-save");
    expect(savedPositionKeys()).toEqual(["r3"]);

    await key(canvas(), { key: "z", ctrlKey: true });
    expect(canvasNodeIds()).not.toContain("r4");
    expect(renderedBoxes()).toEqual(before);
  });

  it("[+] → IF 넣기 — 새 분기·합류가 다른 노드와 겹치지 않는다", async () => {
    const f = trap((g) => ok(insertSplit(g, "e3", "IF")), "if1", "r1");
    await openSet("BF_IF", viewOf("BF_IF", f));
    await click("flow-mode-edit");
    await click("flow-edge-add-e3");
    await click("flow-menu-item-insert-if");
    expect(canvasNodeIds()).toEqual(expect.arrayContaining(["if1", "m1"]));
    expect(allClashes(renderedBoxes())).toEqual([]);
  });
});

describe("비켜 그린 노드를 끌면 그린 자리에서 시작한다(Ruling 19 — 4)", () => {
  const noop = () => {};
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  beforeEach(() => {
    installDomStorage();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });
  const props = (flow: EditFlow, over: Partial<FlowCanvasProps> = {}): FlowCanvasProps => ({
    flow, rules: {}, checks: [], mode: "edit", showVars: false, selectedId: null, selectedEdgeId: null,
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
  const nodeEl = (id: string) => host.querySelector(`.react-flow__node[data-id="${id}"]`) as HTMLElement;
  const fire = (el: Element | Window, ev: Event) => act(async () => { el.dispatchEvent(ev); });
  const mouse = (type: string, x: number, y: number) => new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, view: window });
  const at = (id: string) => {
    const m = /translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(nodeEl(id).style.transform)!;
    return { x: Math.round(Number(m[1])), y: Math.round(Number(m[2])) };
  };
  /** 끌어 놓는다. 놓기 직전 그려진 자리(시작 자리 + 끈 만큼)를 돌려준다. */
  async function drag(id: string) {
    await fire(nodeEl(id), mouse("mousedown", 100, 100));
    await fire(window, mouse("mousemove", 130, 140));
    await fire(window, mouse("mousemove", 150, 160));
    const shown = at(id);
    await fire(window, mouse("mouseup", 150, 160));
    return shown;
  }
  /** IF 블록(if1·m1)이 자동 배치 자리에서, 저장 위치 노드 r1 이 그 자리를 덮어 블록이 비켜 그려지는 흐름. */
  function pushedIf(): EditFlow {
    const g = ok(insertSplit(chain(), "e3", "IF")); // r2 → if1 → m1 → r3
    return setPositions(g, { r1: positionsOf(g).if1 });
  }

  it("룰 노드 — onMove 가 받는 위치는 비켜 그린 자리다", async () => {
    const f = trap((g) => g, "r2", "r1"); // r1 을 r2 자동 배치 자리에 저장 → r2 가 비킨다
    const drawn = drawnPositions(f);
    expect(drawn.r2).not.toEqual(positionsOf(f).r2);
    const onMove = vi.fn();
    await draw(props(f, { onMove, onMoveNode: (_n, _e, pos) => onMove(pos) }));
    expect(at("r2")).toEqual(drawn.r2); // 비킨 자리에 그린다
    const shown = await drag("r2");
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove.mock.calls[0][0].r2).toEqual(shown);
  });

  it("분기 블록 — 블록 멤버 위치도 비켜 그린 자리 기준이다(blockPositionsOf), 접힌 채도 같다", async () => {
    const f = pushedIf();
    const drawn = drawnPositions(f);
    expect(drawn.if1).not.toEqual(positionsOf(f).if1);
    const onMove = vi.fn();
    await draw(props(f, { onMove, onMoveNode: (_n, _e, pos) => onMove(pos) }));
    expect(at("if1")).toEqual(drawn.if1);
    await drag("if1");
    const moved = onMove.mock.calls[0][0] as Record<string, { x: number; y: number }>;
    // 멤버는 그린 자리에서 분기와 같은 만큼 움직인다.
    expect(moved.m1.x - drawn.m1.x).toBe(moved.if1.x - drawn.if1.x);
    expect(moved.m1.y - drawn.m1.y).toBe(moved.if1.y - drawn.if1.y);

    // 접힌 채 — 숨은 멤버(m1)는 전체 흐름의 그린 자리에서 분기와 같은 만큼 움직인다. m1 만 비키는 흐름으로 본다.
    const g = ok(insertSplit(chain(), "e3", "IF"));
    const f2 = setPositions(g, { r1: positionsOf(g).m1 });
    const full = drawnPositions(f2);
    expect(full.m1.x - full.if1.x).not.toBe(positionsOf(f2).m1.x - positionsOf(f2).if1.x); // m1 만 비켰다
    onMove.mockClear();
    await draw(props(f2, { onMove, onMoveNode: (_n, _e, pos) => onMove(pos), collapsed: new Set(["if1"]) }));
    await drag("if1");
    const moved2 = onMove.mock.calls[0][0] as Record<string, { x: number; y: number }>;
    expect(moved2.m1.x - moved2.if1.x).toBe(full.m1.x - full.if1.x);
    expect(moved2.m1.y - moved2.if1.y).toBe(full.m1.y - full.if1.y);
  });
});

describe("setPositions — 흐름에 있는 노드 ID 만 남긴다(리뷰 Minor 2)", () => {
  it("없는 ID 는 버리고, 이미 있던 없는 ID 키도 치운다", () => {
    const f = { ...chain(), view: { ...chain().view, positions: { ghost: { x: 1, y: 1 } } } };
    const g = setPositions(f, { r1: { x: 5, y: 6 }, zz: { x: 7, y: 8 } });
    expect(g.view.positions).toEqual({ r1: { x: 5, y: 6 } });
  });
});

describe("도움말 Esc 뒤 초점(브라우저 확인 8번 단서)", () => {
  beforeEach(() => {
    installServer();
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    uninstallServer();
  });

  it("[?] 에 초점이 있는 채 Esc 로 도움말을 닫으면 초점이 캔버스로 가고, 다음 Esc 가 선택을 푼다", async () => {
    await openSet("BF_HELP", viewOf("BF_HELP", chain()));
    await click("flow-mode-edit");
    await clickEdge("e2");
    await click("flow-help");
    const help = byTestId("flow-help");
    await act(async () => {
      help.focus();
    });
    await key(help, { key: "Escape" });
    expect(q("flow-help-panel")).toBeNull();
    expect(document.activeElement).toBe(canvas());
    expect(q("rf__edge-e2")!.classList.contains("selected")).toBe(true); // 첫 Esc 는 도움말만 닫는다
    await key(document.activeElement!, { key: "Escape" });
    expect(q("rf__edge-e2")!.classList.contains("selected")).toBe(false);
  });

  it("도움말을 연 채 찾기 칸에 초점을 두고 Esc — 도움말만 닫고 초점은 찾기 칸에 남는다(리뷰 Minor 1)", async () => {
    await openSet("BF_HELP3", viewOf("BF_HELP3", chain()));
    await click("flow-help");
    const find = byTestId<HTMLInputElement>("flow-find");
    await act(async () => {
      find.focus();
    });
    await key(find, { key: "Escape" });
    expect(q("flow-help-panel")).toBeNull();
    expect(document.activeElement).toBe(find);
  });

  it("[?] 를 다시 눌러(마우스) 닫으면 초점을 옮기지 않는다", async () => {
    await openSet("BF_HELP2", viewOf("BF_HELP2", chain()));
    await click("flow-help");
    const help = byTestId("flow-help");
    await act(async () => {
      help.focus();
    });
    await click("flow-help");
    expect(q("flow-help-panel")).toBeNull();
    expect(document.activeElement).toBe(help);
  });
});

describe("선 라벨·변수 칩(그 밖의 관찰)", () => {
  beforeEach(() => {
    installServer();
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    uninstallServer();
  });

  it("빈 갈래가 둘인 IF — '갈래 1' 과 '그 외' 라벨, 두 [+] 가 서로 다른 자리에 그려진다", async () => {
    const f = ok(insertSplit(chain(), "e2", "IF")); // if1 → m1 빈 갈래 둘
    const branches = f.edges.filter((e) => e.from === "if1").map((e) => e.id);
    expect(branches).toHaveLength(2);
    await openSet("BF_LABEL", viewOf("BF_LABEL", f));
    await click("flow-mode-edit");
    const [a, b] = branches;
    const labelA = transformOf(byTestId(`flow-edge-label-${a}`).parentElement!);
    const labelB = transformOf(byTestId(`flow-edge-label-${b}`).parentElement!);
    expect(labelA).not.toBe(labelB);
    expect(transformOf(byTestId(`flow-edge-add-${a}`))).not.toBe(transformOf(byTestId(`flow-edge-add-${b}`)));
  });

  it("변수 칩은 노드 위에 그려진다 — 칩 층에 쌓임 순서 클래스가 붙고 CSS 가 z-index 를 준다", async () => {
    await openSet("BF_CHIP", viewOf("BF_CHIP", chain()));
    await click("flow-var-toggle");
    const chips = q("flow-edge-chips-e2") ?? q("flow-edge-chips-e1");
    expect(chips).not.toBeNull();
    expect(chips!.parentElement!.classList.contains("rsf-elabel-chips")).toBe(true);
    expect(RSF_CSS).toMatch(/\.rsf-elabel-chips\s*\{[^}]*z-index:\s*1\b/);
  });
});
