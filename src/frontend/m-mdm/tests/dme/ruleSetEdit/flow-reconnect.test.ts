/** @vitest-environment happy-dom */

// 룰 세트 흐름 선 끝 옮기기(다시 잇기, 추가 Task R1) — reconnectEdge 연산, 캔버스 끝 손잡이, page 연결(되돌리기 한 칸·보기 모드 불가).
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

const mocks = vi.hoisted(() => ({ openRuleEdit: vi.fn(), openMdmPage: vi.fn(), canvasProps: { current: null as unknown } }));

vi.mock("@/dme/rule-handoff", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/dme/rule-handoff")>()),
  openRuleEdit: (...args: unknown[]) => mocks.openRuleEdit(...args),
}));
vi.mock("@/shell", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shell")>()),
  openMdmPage: (...args: unknown[]) => mocks.openMdmPage(...args),
}));
// page 가 캔버스에 내린 props 를 붙잡는다(실제 캔버스는 그대로 그린다) — 끝 손잡이 끌기는 DOM 으로 흉내 내기 어렵다.
vi.mock("../../../pages/dme/ruleSetEdit/canvas/FlowCanvas", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../../pages/dme/ruleSetEdit/canvas/FlowCanvas")>();
  const react = await import("react");
  return {
    ...mod,
    FlowCanvas: (p: import("../../../pages/dme/ruleSetEdit/canvas/FlowCanvas").FlowCanvasProps) => {
      mocks.canvasProps.current = p;
      return react.createElement(mod.FlowCanvas, p);
    },
  };
});

import { FlowCanvas, type FlowCanvasProps } from "../../../pages/dme/ruleSetEdit/canvas/FlowCanvas";
import {
  insertSplit, reconnectEdge, setRoute, toEditFlow, updateEdge, type EditFlow, type EditResult,
} from "../../../pages/dme/ruleSetEdit/flow-edit";
import type { RuleIo, RuleSetView } from "../../../pages/dme/ruleSetEdit/types";
import { flush, installDomStorage } from "../helpers/render";
import { byTestId, click, installServer, openSet, settle, srv, uninstallServer } from "../helpers/rule-set-page";

function ok(r: EditResult): EditFlow {
  if (!r.ok) throw new Error(r.reason);
  return r.flow;
}
/** start → r1 → if1{e4 조건 "true" 갈래 / e5 그 외} → m1 → r2 → end. 선: e1 e2 e4 e5 e6 e3. */
function ifFlow(): EditFlow {
  const f = ok(insertSplit(toEditFlow(null, ["R_A", "R_B"]), "e2", "IF"));
  return ok(updateEdge(f, f.edges.find((e) => e.from === "if1" && !e.otherwise)!.id, { cond: "true", label: "큰 것" }));
}
const P = (x: number, y: number) => ({ x, y });

describe("reconnectEdge", () => {
  it("도착 쪽(to)을 바꾼다 — 선 ID·순서 유지, 다른 선은 그대로, 원본 불변", () => {
    const f = ifFlow();
    const before = JSON.stringify(f);
    const g = ok(reconnectEdge(f, "e6", { to: "end" }));
    expect(JSON.stringify(f)).toBe(before);
    expect(g.edges.map((e) => e.id)).toEqual(f.edges.map((e) => e.id));
    const e6 = g.edges.find((e) => e.id === "e6")!;
    expect([e6.from, e6.to]).toEqual(["m1", "end"]);
    for (const e of f.edges.filter((x) => x.id !== "e6")) expect(g.edges.find((x) => x.id === e.id)).toEqual(e);
    expect(g.nodes).toEqual(f.nodes);
  });

  it("출발 쪽(from)을 바꾼다", () => {
    const g = ok(reconnectEdge(ifFlow(), "e6", { from: "r1" }));
    const e6 = g.edges.find((e) => e.id === "e6")!;
    expect([e6.from, e6.to]).toEqual(["r1", "r2"]);
  });

  it("cond·label·order·otherwise 를 그대로 둔다", () => {
    const f = ifFlow();
    const g = ok(reconnectEdge(f, "e4", { to: "r2" }));
    const a = f.edges.find((e) => e.id === "e4")!;
    const b = g.edges.find((e) => e.id === "e4")!;
    expect({ ...b, to: a.to }).toEqual(a);
    expect(b.cond).toBe("true");
    expect(b.label).toBe("큰 것");
    const other = g.edges.find((e) => e.id === "e5")!;
    expect(other.otherwise).toBe(true);
    const g2 = ok(reconnectEdge(f, "e5", { to: "r2" }));
    expect(g2.edges.find((e) => e.id === "e5")).toEqual({ ...f.edges.find((e) => e.id === "e5")!, to: "r2" });
  });

  it("그 선의 꺾는 점만 버리고 다른 선의 경로는 남긴다", () => {
    const f = ok(setRoute(ok(setRoute(ifFlow(), "e6", [P(1, 2), P(3, 4)])), "e3", [P(9, 9)]));
    const g = ok(reconnectEdge(f, "e6", { to: "end" }));
    expect(g.view.routes.e6).toBeUndefined();
    expect(g.view.routes.e3).toEqual([P(9, 9)]);
    expect(f.view.routes.e6).toHaveLength(2);
  });

  it("같은 from→to 선이 이미 있으면 거부한다", () => {
    const f = ifFlow();
    expect(reconnectEdge(f, "e6", { to: "r2" }).ok).toBe(false); // 제자리에 놓기는 바뀌는 끝이 없다
    const r = reconnectEdge(f, "e2", { from: "start", to: "r1" });
    expect(r).toEqual({ ok: false, reason: "이미 이어진 선이다" });
    expect(reconnectEdge(f, "e3", { from: "m1", to: "r2" })).toEqual({ ok: false, reason: "이미 이어진 선이다" });
  });

  it("자기 자신으로 잇기·없는 노드·없는 선을 거부한다", () => {
    const f = ifFlow();
    expect(reconnectEdge(f, "e6", { to: "m1" }).ok).toBe(false); // m1→m1
    expect(reconnectEdge(f, "e6", { from: "r2" }).ok).toBe(false); // r2→r2
    expect(reconnectEdge(f, "e6", { to: "없음" }).ok).toBe(false);
    expect(reconnectEdge(f, "e6", { from: "없음" }).ok).toBe(false);
    expect(reconnectEdge(f, "zz", { to: "end" }).ok).toBe(false);
    expect(reconnectEdge(f, "e6", {}).ok).toBe(false);
  });
});

// ─────────────────── 캔버스 끝 손잡이 ───────────────────

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
    flow: ifFlow(), rules: {}, checks: [], mode: "edit", varDisplay: "off", selectedId: null, selectedEdgeId: null,
    overlay: null, focusId: null, focusSeq: 0, onSelect: noop, onSelectEdge: noop, onOpenRule: noop, onMove: noop, onConnect: noop,
    onDropPalette: noop, onNoteChange: noop,
    breakpoints: new Set(), collapsed: new Set(), showMiniMap: false, editingCondEdgeId: null, onMoveNode: noop, onDropRule: noop,
    onContextMenu: noop, onEditCond: noop, onEditCondClose: noop, onToggleBreakpoint: noop, onRouteChange: noop, onReconnect: noop, ...over,
  };
}
async function draw(p: FlowCanvasProps) {
  await act(async () => {
    root.render(createElement(DmesUiProvider, null, createElement("div", { style: { width: 800, height: 600 } }, createElement(FlowCanvas, p))));
  });
  await flush();
}
const anchors = () => host.querySelectorAll(".react-flow__edgeupdater");

describe("FlowCanvas 선 끝 손잡이", () => {
  it("편집 모드에서 고른 선에만 양 끝 손잡이가 뜬다", async () => {
    await draw(props({ selectedEdgeId: "e6" }));
    expect(anchors()).toHaveLength(2);
    expect(host.querySelectorAll(".react-flow__edgeupdater-source")).toHaveLength(1);
    expect(host.querySelectorAll(".react-flow__edgeupdater-target")).toHaveLength(1);
    await draw(props({ selectedEdgeId: null }));
    expect(anchors()).toHaveLength(0);
  });

  it("보기·디버그 모드에서는 없다", async () => {
    for (const mode of ["view", "debug"] as const) {
      await draw(props({ selectedEdgeId: "e6", mode }));
      expect(anchors(), mode).toHaveLength(0);
    }
  });

  it("onReconnect 를 받지 않으면(prop 없음) 손잡이가 없다", async () => {
    await draw(props({ selectedEdgeId: "e6", onReconnect: undefined }));
    expect(anchors()).toHaveLength(0);
  });

  it("접힌 분기가 이어 받은 선에는 없다", async () => {
    await draw(props({ selectedEdgeId: "e6", collapsed: new Set(["if1"]) }));
    expect(anchors()).toHaveLength(0); // e6 은 m1→r2 였다가 if1→r2 로 이어 받은 선이다
    await draw(props({ selectedEdgeId: "e3", collapsed: new Set(["if1"]) }));
    expect(anchors()).toHaveLength(2);
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
    set: { setId: "E2S_CHAIN", setName: "사슬", description: null, status: "INUSE", rowVersion: 3, ruleIds: ["E2S_GRD", "E2S_FCT"], flow: null, branched: false },
    rules: [rule("E2S_GRD", "SET_THK", "S_GRD"), rule("E2S_FCT", "S_GRD", "S_FCT")],
    checks: [], condIo: {}, editable: true, restorable: false, cases: [],
  };
}
const canvasProps = () => mocks.canvasProps.current as FlowCanvasProps;
const shape = () => canvasProps().flow.edges.map((e) => `${e.id}:${e.from}>${e.to}`);

describe("page 선 끝 옮기기", () => {
  beforeEach(() => installServer());
  afterEach(() => uninstallServer());

  it("편집 모드에서 다시 잇기 — 새 선 없이 기존 선의 끝이 바뀌고 되돌리기 한 번에 원래대로", async () => {
    await openSet("E2S_CHAIN", chainView());
    await click("flow-mode-edit");
    const before = shape();
    expect(before).toEqual(["e1:start>r1", "e2:r1>r2", "e3:r2>end"]);
    await act(async () => { canvasProps().onReconnect!("e2", { to: "end" }); });
    await settle(50);
    expect(shape()).toEqual(["e1:start>r1", "e2:r1>end", "e3:r2>end"]);
    expect(canvasProps().flow.edges).toHaveLength(3);
    expect(byTestId<HTMLButtonElement>("flow-undo").disabled).toBe(false);
    await click("flow-undo");
    expect(shape()).toEqual(before);
    expect(byTestId<HTMLButtonElement>("flow-undo").disabled).toBe(true); // 한 칸이었다
  });

  it("거부(같은 선이 이미 있음)이면 흐름이 그대로이고 이력이 안 생긴다", async () => {
    await openSet("E2S_CHAIN", chainView());
    await click("flow-mode-edit");
    const before = shape();
    await act(async () => { canvasProps().onReconnect!("e2", { from: "start", to: "r1" }); });
    await settle(50);
    expect(shape()).toEqual(before);
    expect(byTestId<HTMLButtonElement>("flow-undo").disabled).toBe(true);
  });

  it("보기 모드에서는 불가", async () => {
    await openSet("E2S_CHAIN", chainView());
    const before = shape();
    await act(async () => { canvasProps().onReconnect!("e2", { to: "end" }); });
    await settle(50);
    expect(shape()).toEqual(before);
    expect(srv.requests.filter((r) => r.action === "save")).toHaveLength(0);
  });
});
