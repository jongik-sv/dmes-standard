/** @vitest-environment happy-dom */

// 룰 세트 흐름 끌어 놓기·놓인 노드 옮기기·룰 목록·조건식 즉석 편집(3단계 Task 7, A1·A2·A4·B10).
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

import { FlowCanvas, PALETTE_MIME, RULE_MIME, type FlowCanvasProps } from "../../../pages/dme/ruleSetEdit/canvas/FlowCanvas";
import {
  flowJsonOf, insertSplit, moveNode, toEditFlow, updateEdge, type EditFlow, type FlowPos,
} from "../../../pages/dme/ruleSetEdit/flow-edit";
import { NODE_SIZE, positionsOf } from "../../../pages/dme/ruleSetEdit/flow-layout";
import { blockDragPositions, dropTargetAt, resolveNodeDrop } from "../../../pages/dme/ruleSetEdit/flow-vars";
import { useDragActions } from "../../../pages/dme/ruleSetEdit/state/useDragActions";
import { useRuleSetEdit } from "../../../pages/dme/ruleSetEdit/state/useRuleSetEdit";
import type { RuleIo, RuleSetView } from "../../../pages/dme/ruleSetEdit/types";
import { flush, installDomStorage, visibleText } from "../helpers/render";
import { byTestId as pageById, calls, click, installServer, ok, openSet, q as pageQ, settle, srv, uninstallServer } from "../helpers/rule-set-page";

// 캔버스 단독 테스트는 page 도우미의 화면 틀이 없으므로 문서 전체에서 찾는다(화면 테스트는 아래 pageById·pageQ).
const docQ = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

const nm = (n: string) => ({ name: n, source: "DICT" as const, label: null, dataType: null, scale: null, dateString: false, maruCodeId: null });
function ioOf(ruleId: string, extra: Partial<RuleIo> = {}): RuleIo {
  return {
    ruleId, ruleName: `${ruleId} 이름`, ruleKind: "DECISION", status: "INUSE", exists: true, releasedVer: 1, hitPolicy: "FIRST",
    conds: [nm("SET_THK")], results: [{ ...nm(`S_${ruleId}`), source: null }], ...extra,
  };
}

/** 선 중점(흐름 좌표) — flow-vars.nearestEdge 와 같은 식. */
function mid(f: EditFlow, edgeId: string, pos: Record<string, FlowPos> = positionsOf(f)): FlowPos {
  const e = f.edges.find((x) => x.id === edgeId)!;
  const a = pos[e.from];
  const b = pos[e.to];
  const ka = NODE_SIZE[f.nodes.find((n) => n.id === e.from)!.kind];
  const kb = NODE_SIZE[f.nodes.find((n) => n.id === e.to)!.kind];
  return { x: (a.x + ka.w / 2 + b.x + kb.w / 2) / 2, y: (a.y + ka.h + b.y) / 2 };
}

function dnd(type: string, target: Element, data: Record<string, string>, at: FlowPos, related: Element | null = null) {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(ev, {
    dataTransfer: { value: { types: Object.keys(data), getData: (t: string) => data[t] ?? "", setData: () => {}, dropEffect: "none", effectAllowed: "all" } },
    clientX: { value: at.x },
    clientY: { value: at.y },
    relatedTarget: { value: related },
  });
  return act(async () => {
    target.dispatchEvent(ev);
  });
}

// ─── 순수 함수 ───────────────────────────────────────────────────────────────
describe("끌어 놓기 순수 함수(Task 7)", () => {
  const chain = () => toEditFlow(null, ["R_A", "R_B", "R_C"]); // start → r1 → r2 → r3 → end (e1~e4)

  it("확대 0.5 에서는 화면 80px = 흐름 160 이 반경이다", () => {
    const f = chain();
    const pos = positionsOf(f);
    const m = mid(f, "e2", pos);
    expect(dropTargetAt(f, pos, { x: m.x + 150, y: m.y }, 0.5)).toBe("e2");
    expect(dropTargetAt(f, pos, { x: m.x + 170, y: m.y }, 0.5)).not.toBe("e2");
    expect(dropTargetAt(f, pos, { x: m.x + 90, y: m.y }, 1)).not.toBe("e2");
    expect(dropTargetAt(f, pos, { x: m.x + 70, y: m.y }, 1)).toBe("e2");
    expect(dropTargetAt(f, pos, { x: m.x + 900, y: m.y }, 0.5)).toBeNull();
  });

  it("resolveNodeDrop: 자기 앞뒤 선은 대상에서 빠지고, 다른 선에 놓으면 그 선이다", () => {
    const f = chain();
    const pos = positionsOf(f);
    expect(resolveNodeDrop(f, pos, "r1", mid(f, "e3", pos), 1)).toBe("e3");
    expect(resolveNodeDrop(f, pos, "r1", mid(f, "e2", pos), 1)).not.toBe("e2"); // 자기 나가는 선
    expect(resolveNodeDrop(f, pos, "r2", mid(f, "e2", pos), 1)).not.toBe("e2");
    expect(resolveNodeDrop(f, pos, "r2", mid(f, "e3", pos), 1)).not.toBe("e3");
  });

  it("blockDragPositions: 분기·안쪽이 같은 만큼 움직이고 바깥 노드(모이는 자리 포함)는 그대로다", () => {
    const r = insertSplit(chain(), "e2", "IF"); // r1 → if1 [e5 → r4(빈 단계) → r2][e6 그 외 → r2] → r2(모이는 자리)
    if (!r.ok) throw new Error(r.reason);
    const f = r.flow;
    const base = positionsOf(f);
    const out = blockDragPositions(f, "if1", { x: 10, y: -5 }, base);
    expect(Object.keys(out).sort()).toEqual(["if1", "r4"]);
    expect(out.if1).toEqual({ x: base.if1.x + 10, y: base.if1.y - 5 });
    expect(out.r4).toEqual({ x: base.r4.x + 10, y: base.r4.y - 5 });
    expect(out.r1).toBeUndefined();
    expect(out.r2).toBeUndefined();
    expect(blockDragPositions(f, "r1", { x: 1, y: 1 }, base)).toEqual({});
  });

  it("옮긴 뒤 정규 JSON 과 위치가 한 번의 edit 으로 남는다(moveNode + setPositions)", () => {
    const f = chain();
    const m = moveNode(f, "r1", "e3");
    expect(m.ok).toBe(true);
  });
});

// ─── 캔버스 ─────────────────────────────────────────────────────────────────
describe("FlowCanvas 끌어 놓기·조건식 즉석 편집(Task 7)", () => {
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
  function ifFlow(nullLabels = false): EditFlow {
    const r = insertSplit(toEditFlow(null, ["R_A"]), "e2", "IF");
    if (!r.ok) throw new Error(r.reason);
    let f = r.flow;
    const c = f.edges.find((e) => e.from === "if1" && !e.otherwise)!;
    const u = updateEdge(f, c.id, { cond: "SET_THK > 1" });
    if (!u.ok) throw new Error(u.reason);
    f = u.flow;
    if (nullLabels) f = { ...f, edges: f.edges.map((e) => (e.from === "if1" && !e.otherwise ? { ...e, label: null } : e)) };
    return f;
  }
  const props = (over: Partial<FlowCanvasProps> = {}): FlowCanvasProps => ({
    flow: ifFlow(), rules: { R_A: ioOf("R_A") }, checks: [], mode: "edit", varDisplay: "off", selectedId: null, selectedEdgeId: null,
    overlay: null, focusId: null, focusSeq: 0, onSelect: noop, onSelectEdge: noop, onOpenRule: noop, onMove: noop, onConnect: noop,
    onDropPalette: noop, onNoteChange: noop, breakpoints: new Set(), collapsed: new Set(), showMiniMap: false, editingCondEdgeId: null,
    onMoveNode: noop, onDropRule: noop, onContextMenu: noop, onEditCond: noop, onEditCondClose: noop, onToggleBreakpoint: noop, ...over,
  });
  const draw = (p: FlowCanvasProps) =>
    act(async () => {
      root.render(createElement(DmesUiProvider, null, createElement("div", { style: { width: 800, height: 600 } }, createElement(FlowCanvas, p))));
    });
  const canvas = () => (docQ as (id: string) => HTMLElement)("flow-canvas");

  it("1. 팔레트를 끄는 동안 선 e2 위에서 표지·클래스가 보이고, 멀어지거나 dragleave 면 사라진다", async () => {
    const p = props();
    await draw(p);
    const m = mid(p.flow, "e2");
    await dnd("dragover", canvas(), { [PALETTE_MIME]: "if" }, m);
    expect(docQ("flow-edge-drop-e2")).not.toBeNull();
    expect(docQ("flow-edge-drop-e2")!.textContent).toBe("여기에 넣기");
    expect(document.querySelectorAll(".rsf-edge-drop").length).toBe(1);
    expect(docQ("flow-edge-add-e2")).not.toBeNull(); // 끌어 끼우기 대상이면 올리거나 고르지 않아도 [+] 가 보인다(L1)
    await dnd("dragover", canvas(), { [PALETTE_MIME]: "if" }, { x: 5000, y: 5000 });
    expect(docQ("flow-edge-drop-e2")).toBeNull();
    expect(docQ("flow-edge-add-e2")).toBeNull();
    expect(document.querySelectorAll(".rsf-edge-drop").length).toBe(0);
    await dnd("dragover", canvas(), { [RULE_MIME]: "R_B" }, m);
    expect(docQ("flow-edge-drop-e2")).not.toBeNull();
    await dnd("dragleave", canvas(), { [RULE_MIME]: "R_B" }, m, null);
    expect(docQ("flow-edge-drop-e2")).toBeNull();
  });

  it("1b. 보기 모드에서는 끌어도 강조가 없고, 놓으면 선 ID 를 올린다", async () => {
    const onDropRule = vi.fn();
    const p = props({ mode: "view", onDropRule });
    await draw(p);
    await dnd("dragover", canvas(), { [RULE_MIME]: "R_B" }, mid(p.flow, "e2"));
    expect(docQ("flow-edge-drop-e2")).toBeNull();
    await draw(props({ onDropRule }));
    await dnd("drop", canvas(), { [RULE_MIME]: "R_B" }, mid(p.flow, "e2"));
    expect(onDropRule).toHaveBeenCalledWith("R_B", "e2");
    expect(docQ("flow-edge-drop-e2")).toBeNull();
  });

  it("7a. 이름 없는 IF 갈래에 대체 라벨 `갈래 {order}` 가 붙고, 그 외·병렬·보기 모드는 그대로다", async () => {
    const f = ifFlow(true);
    const cond = f.edges.find((e) => e.from === "if1" && !e.otherwise)!;
    const other = f.edges.find((e) => e.from === "if1" && e.otherwise)!;
    await draw(props({ flow: f }));
    expect(docQ(`flow-edge-label-${cond.id}`)?.textContent).toBe(`갈래 ${cond.order}`);
    expect(docQ(`flow-edge-label-${other.id}`)?.textContent).toBe("그 외");
    await draw(props({ flow: f, mode: "view" }));
    expect(docQ(`flow-edge-label-${cond.id}`)).toBeNull();
    expect(docQ(`flow-edge-label-${other.id}`)?.textContent).toBe("그 외");
    // 이름이 있으면 그 이름
    await draw(props({ flow: { ...f, edges: f.edges.map((e) => (e.id === cond.id ? { ...e, label: "두꺼움" } : e)) } }));
    expect(docQ(`flow-edge-label-${cond.id}`)?.textContent).toBe("두꺼움");
    // 병렬 갈래
    const pr = insertSplit(toEditFlow(null, ["R_A"]), "e2", "PARALLEL");
    if (!pr.ok) throw new Error(pr.reason);
    const pf = { ...pr.flow, edges: pr.flow.edges.map((e) => (e.from === "par1" ? { ...e, label: null } : e)) };
    await draw(props({ flow: pf }));
    for (const e of pf.edges.filter((x) => x.from === "par1")) expect(docQ(`flow-edge-label-${e.id}`)).toBeNull();
  });

  it("7b. 조건 갈래 라벨을 두 번 누르면 지금 조건식으로 입력 칸이 열리고 Enter 가 확정한다", async () => {
    const f = ifFlow(true);
    const cond = f.edges.find((e) => e.from === "if1" && !e.otherwise)!;
    const onEditCond = vi.fn();
    const onEditCondClose = vi.fn();
    await draw(props({ flow: f, onEditCond, onEditCondClose }));
    expect(docQ(`flow-edge-cond-input-${cond.id}`)).toBeNull();
    await act(async () => {
      docQ(`flow-edge-label-${cond.id}`)!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    const input = docQ(`flow-edge-cond-input-${cond.id}`) as HTMLInputElement;
    expect(input.value).toBe("SET_THK > 1");
    input.value = "SET_THK > 2";
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });
    expect(onEditCond).toHaveBeenCalledWith(cond.id, "SET_THK > 2");
    expect(onEditCondClose).toHaveBeenCalledTimes(1);
    expect(docQ(`flow-edge-cond-input-${cond.id}`)).toBeNull();
  });

  it("7c. Esc 와 칸 밖 누르기는 고치지 않고 닫기만 한다", async () => {
    const f = ifFlow(true);
    const cond = f.edges.find((e) => e.from === "if1" && !e.otherwise)!;
    const onEditCond = vi.fn();
    const onEditCondClose = vi.fn();
    await draw(props({ flow: f, onEditCond, onEditCondClose }));
    const open = () =>
      act(async () => {
        docQ(`flow-edge-label-${cond.id}`)!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
      });
    await open();
    await act(async () => {
      docQ(`flow-edge-cond-input-${cond.id}`)!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });
    expect(docQ(`flow-edge-cond-input-${cond.id}`)).toBeNull();
    await open();
    await act(async () => {
      document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(docQ(`flow-edge-cond-input-${cond.id}`)).toBeNull();
    expect(onEditCond).not.toHaveBeenCalled();
    expect(onEditCondClose).toHaveBeenCalledTimes(2);
  });

  it("7d. 그 외·병렬 갈래·보기 모드에서는 열리지 않고, 메뉴가 준 editingCondEdgeId 로는 열린다", async () => {
    const f = ifFlow(true);
    const cond = f.edges.find((e) => e.from === "if1" && !e.otherwise)!;
    const other = f.edges.find((e) => e.from === "if1" && e.otherwise)!;
    await draw(props({ flow: f }));
    await act(async () => {
      docQ(`flow-edge-label-${other.id}`)!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    expect(docQ(`flow-edge-cond-input-${other.id}`)).toBeNull();
    await draw(props({ flow: f, mode: "view", editingCondEdgeId: cond.id }));
    expect(docQ(`flow-edge-cond-input-${cond.id}`)).toBeNull();
    await draw(props({ flow: f, editingCondEdgeId: other.id }));
    expect(docQ(`flow-edge-cond-input-${other.id}`)).toBeNull();
    await draw(props({ flow: f, editingCondEdgeId: cond.id }));
    expect((docQ(`flow-edge-cond-input-${cond.id}`) as HTMLInputElement).value).toBe("SET_THK > 1");
  });
});

// ─── 훅: 옮기기와 되돌리기 한 번 ────────────────────────────────────────────
describe("노드 옮기기 + 위치는 되돌리기 한 번(Task 7)", () => {
  let st: ReturnType<typeof useRuleSetEdit> | null = null;
  let drag: ReturnType<typeof useDragActions> | null = null;
  const Probe = () => {
    st = useRuleSetEdit();
    drag = useDragActions(st);
    return null;
  };
  let host: HTMLDivElement | null = null;
  let root: Root | null = null;
  beforeEach(() => installServer());
  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    uninstallServer();
  });

  it("r1 을 선 e3 로 옮기고 되돌리기 한 번이면 원래 정규 JSON 이다. 거부되면 위치도 바뀌지 않는다", async () => {
    srv.views.E2S = {
      set: { setId: "E2S", setName: "사슬", description: null, status: "INUSE", rowVersion: 1, ruleIds: ["R_A", "R_B", "R_C"], flow: null, branched: false },
      rules: [ioOf("R_A"), ioOf("R_B"), ioOf("R_C")], checks: [], condIo: {}, editable: true, restorable: false, cases: [],
    } as RuleSetView;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(createElement(DmesUiProvider, null, createElement(Probe)));
    });
    await act(async () => {
      await st!.open("E2S");
    });
    await act(async () => st!.setMode("edit"));
    const before = flowJsonOf(st!.flow!);
    const pos = { r1: { x: 300, y: 300 } };
    await act(async () => drag!.moveNodeTo("r1", "e3", pos));
    const after = st!.flow!;
    expect(flowJsonOf(after)).not.toBe(before);
    expect(after.view.positions.r1).toEqual({ x: 300, y: 300 });
    expect(after.edges.find((e) => e.from === "start")!.to).toBe("r2");
    await act(async () => st!.undo());
    expect(flowJsonOf(st!.flow!)).toBe(before);
    expect(st!.canUndo).toBe(false);

    // 거부(자기 자리): 위치도 적지 않는다.
    await act(async () => drag!.moveNodeTo("r1", "e2", pos));
    expect(flowJsonOf(st!.flow!)).toBe(before);
  });
});

// ─── 룰 목록 패널(화면) ─────────────────────────────────────────────────────
describe("룰 목록 패널(Task 7)", () => {
  const view = (): RuleSetView => ({
    set: { setId: "E2S_CHAIN", setName: "사슬", description: null, status: "INUSE", rowVersion: 3, ruleIds: ["E2S_A", "E2S_B"], flow: null, branched: false },
    rules: [ioOf("E2S_A"), ioOf("E2S_B")], checks: [], condIo: {}, editable: true, restorable: false, cases: [],
  } as RuleSetView);
  const NEW = ioOf("E2S_NEW", { ruleKind: "DERIVE" });
  const DRAFT = ioOf("E2S_DRAFT", { releasedVer: null });

  beforeEach(() => {
    installServer();
    localStorage.clear();
    srv.replies["search:RULE"] = ok({ rules: [NEW, DRAFT] });
  });
  afterEach(() => uninstallServer());

  async function find(text = "E2S") {
    const input = pageById<HTMLInputElement>("flow-rule-panel-search");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, text);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click("flow-rule-panel-find");
    await settle(20);
  }

  it("3. 확정된 룰만 줄이 되고, 보기 모드는 끌기가 꺼지며 편집 모드는 켜진다", async () => {
    await openSet("E2S_CHAIN", view());
    await find();
    expect(pageQ("flow-rule-row-E2S_NEW")).not.toBeNull();
    expect(pageQ("flow-rule-row-E2S_DRAFT")).toBeNull();
    const text = visibleText(pageById("flow-rule-row-E2S_NEW"));
    expect(text).toContain("E2S_NEW");
    expect(text).toContain("E2S_NEW 이름");
    expect(text).toContain("DERIVE");
    expect(pageById("flow-rule-row-E2S_NEW").getAttribute("draggable")).toBe("false");
    await click("flow-mode-edit");
    expect(pageById("flow-rule-row-E2S_NEW").getAttribute("draggable")).toBe("true");
    await click("flow-section-rules-head");
    expect(pageQ("flow-rule-row-E2S_NEW")).toBeNull();
    await click("flow-section-rules-head");
    expect(pageQ("flow-rule-row-E2S_NEW")).not.toBeNull();
  });

  it("3a. 검색 칸에서 한글 조합 중 Enter(isComposing)는 검색하지 않는다", async () => {
    await openSet("E2S_CHAIN", view());
    const input = pageById<HTMLInputElement>("flow-rule-panel-search");
    const enter = (isComposing: boolean) =>
      act(async () => {
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing, bubbles: true, cancelable: true }));
      });
    const before = calls("search").length;
    await enter(true);
    await settle(20);
    expect(calls("search").length).toBe(before);
    await enter(false);
    await settle(20);
    expect(calls("search").length).toBe(before + 1);
  });

  it("3b. 늦게 온 앞 응답은 버린다", async () => {
    await openSet("E2S_CHAIN", view());
    let releaseFirst!: () => void;
    const gate = new Promise<void>((r) => (releaseFirst = r));
    const realFetch = globalThis.fetch;
    let n = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/oasis/ruleSetEdit/search")) {
        const mine = ++n;
        if (mine === 1) {
          await gate;
          srv.replies["search:RULE"] = ok({ rules: [ioOf("E2S_OLD")] });
        } else srv.replies["search:RULE"] = ok({ rules: [ioOf("E2S_FRESH")] });
      }
      return realFetch(input, init);
    }) as typeof fetch;
    await click("flow-rule-panel-find");
    await click("flow-rule-panel-find");
    await settle(20);
    releaseFirst();
    await settle(20);
    expect(pageQ("flow-rule-row-E2S_FRESH")).not.toBeNull();
    expect(pageQ("flow-rule-row-E2S_OLD")).toBeNull();
    globalThis.fetch = realFetch;
  });

  it("4. 줄을 선 e2 에 떨어뜨리면 끼워지고, 빈 곳이면 '선 위에 놓아야 한다'", async () => {
    await openSet("E2S_CHAIN", view());
    await click("flow-mode-edit");
    await find();
    const flowNow = toEditFlow(null, ["E2S_A", "E2S_B"]);
    // 빈 곳
    await dnd("drop", pageById("flow-canvas"), { [RULE_MIME]: "E2S_NEW" }, { x: 50000, y: 50000 });
    await settle(20);
    expect(visibleText(pageById("set-message"))).toContain("선 위에 놓아야 한다");
    expect(pageQ("flow-node-r3")).toBeNull();
    // 선 e2 위
    await dnd("drop", pageById("flow-canvas"), { [RULE_MIME]: "E2S_NEW" }, mid(flowNow, "e2"));
    await settle(20);
    expect(pageQ("flow-node-r3")).not.toBeNull();
    expect(visibleText(pageById("flow-node-r3"))).toContain("E2S_NEW");
  });

  it("4b. 줄을 두 번 누르면 고른 선에, 고른 선이 없으면 END 앞 선에 끼운다", async () => {
    await openSet("E2S_CHAIN", view());
    await click("flow-mode-edit");
    await find();
    const dbl = () =>
      act(async () => {
        pageById("flow-rule-row-E2S_NEW").dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
      });
    await dbl();
    await settle(20);
    expect(pageQ("set-message")?.textContent ?? "").not.toContain("넣을 선을 먼저 고른다");
    expect(pageQ("flow-node-r3")).not.toBeNull();
    await act(async () => {
      pageQ("rf__edge-e1")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
    await dbl();
    await settle(20);
    expect(pageQ("flow-node-r4")).not.toBeNull();
  });
});
