/** @vitest-environment happy-dom */
// 표 크기(§7.4, erd-size-2) — 순수 계산·명령·델타·화면(손잡이 끌기 → resizeNodes 1회, 줄인 높이 → PK 고정 + 「▾ N개 더」).
import { act, createElement as h, useMemo } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ReactFlow, ReactFlowProvider, ROUTE_RADIUS, routePath, smoothStepPoints, useReactFlow, type EdgeProps, type EdgeTypes, type Node, type NodeTypes,
} from "@dk-oasis/shared/react-flow";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import { ErdRelationEdge } from "../../../pages/dma/erdEdit/canvas/ErdRelationEdge";
import { ErdTableNode } from "../../../pages/dma/erdEdit/canvas/ErdTableNode";
import { ERD_CSS } from "../../../pages/dma/erdEdit/canvas/erd-styles";
import { resizeNodesCommand } from "../../../pages/dma/erdEdit/canvas/erd-commands";
import { buildFlow, type ErdFlowEdge, type ErdFlowNode } from "../../../pages/dma/erdEdit/canvas/erd-flow";
import {
  CLIP_BAR_HEIGHT, END_STUB, NODE_WIDTH, bodyLayout, dragSize, liveEnds, minNodeHeight, nodeHeight, relationSides, sizeBusOf, setSizeDraft,
} from "../../../pages/dma/erdEdit/canvas/erd-geometry";
import { autoLayoutCommand, estimatedSize } from "../../../pages/dma/erdEdit/canvas/erd-layout";
import { useCanvasEditing } from "../../../pages/dma/erdEdit/canvas/useCanvasEditing";
import type { ApplyOutcome, ErdEditContext } from "../../../pages/dma/erdEdit/edit-context";
import { applyDelta, fromView, nodeKey } from "../../../pages/dma/erdEdit/state/model-delta";
import { enqueue, initLayers, onResult, pendingIds, project } from "../../../pages/dma/erdEdit/state/pending";
import type { ErdCommandJson, ErdDelta, ErdState } from "../../../pages/dma/erdEdit/types";
import { flush } from "../../dme/helpers/render";
import { OK, deny, fakeCtx, notice } from "./erd-canvas-fixtures";
import { MENU_DIAGRAMS, column, emptyModel, menuModel, stateOf, table, viewOf } from "./erd-fixtures";

const T1 = nodeKey("d-all", "t-1");
const sized = (state: ErdState, key: string, size: { w?: number; h?: number }): ErdState => {
  const nodes = { ...state.nodes };
  const { w: _w, h: _h, ...rest } = nodes[key];
  nodes[key] = { ...rest, ...size };
  return { ...state, nodes };
};
const menuState = (size?: { w?: number; h?: number }, fold?: "KEYS" | "NAME"): ErdState => {
  const base = stateOf(menuModel(), MENU_DIAGRAMS);
  const s = size ? sized(base, T1, size) : base;
  return fold ? { ...s, nodes: { ...s.nodes, [T1]: { ...s.nodes[T1], foldMode: fold } } } : s;
};
const flowOf = (state: ErdState, preset: "basic" | "overview" = "basic") => buildFlow({
  state, diagramId: "d-all", mode: "logical", preset, namesOnly: false, showAudit: true, statuses: {}, domains: {}, selected: new Set(), mySession: "ui-me",
});

/** PK 1 + 일반 컬럼 6 인 표 t-1 하나. */
function wideState(size?: { w?: number; h?: number }): ErdState {
  const m = emptyModel();
  const ids = ["c-0", "c-1", "c-2", "c-3", "c-4", "c-5", "c-6"];
  m.tables["t-1"] = table("TB_A", "에이", ids);
  ids.forEach((c, i) => { m.columns[c] = column("t-1", `COL_${i}`, `칼럼${i}`); });
  m.keys["k-1"] = { table: "t-1", kind: "PK", name: "PK_A", columns: ["c-0"] };
  const s = stateOf(m, { diagrams: MENU_DIAGRAMS.diagrams, nodes: [{ diagram: "d-all", table: "t-1", x: 0, y: 0, foldMode: "NONE" }] });
  return size ? sized(s, T1, size) : s;
}

describe("표 크기 — 순수 계산", () => {
  it("bodyLayout: 자동 높이 이상이면 가려지는 것이 없고, 줄이면 막대 한 줄을 빼고 센다", () => {
    expect(bodyLayout(null, 1, 6)).toEqual({ visible: 6, hidden: 0 });
    expect(bodyLayout(nodeHeight(7, false), 1, 6)).toEqual({ visible: 6, hidden: 0 });
    // 막대가 한 줄을 차지하고 남는 반 줄도 쓰지 못한다: 171 - 2 - 30 - 20 - 20 = 99 → 4줄
    expect(bodyLayout(nodeHeight(7, false) - 1, 1, 6)).toEqual({ visible: 4, hidden: 2 });
    // h 100: 100 - 2 - 30 - PK 20 - 막대 20 = 28 → 1줄
    expect(bodyLayout(100, 1, 6)).toEqual({ visible: 1, hidden: 5 });
    // 최소 높이 52 는 일반 컬럼이 하나도 안 보인다(막대 + 머리만)
    expect(bodyLayout(52, 1, 6)).toEqual({ visible: 0, hidden: 6 });
    expect(bodyLayout(60, 0, 0)).toEqual({ visible: 0, hidden: 0 });
    expect(CLIP_BAR_HEIGHT).toBe(20);
  });

  it("minNodeHeight: 머리 + PK + 스크롤 줄 하나 + 막대가 들어가는 높이. 줄일 것이 없으면 자동 높이", () => {
    // PK 1 + 일반 6: 2 + 30 + 20 + 20 + 20(막대) = 92
    expect(minNodeHeight(1, 6)).toBe(92);
    expect(minNodeHeight(3, 6)).toBe(132);
    // 일반 컬럼 하나: 줄일 수 없다(자동 높이가 바닥)
    expect(minNodeHeight(1, 1)).toBe(nodeHeight(2, false));
    // 키만 있는 표: 자동 높이 아래로 못 줄인다(넘침·막대 없음)
    expect(minNodeHeight(2, 0)).toBe(nodeHeight(2, false));
    expect(minNodeHeight(0, 0)).toBe(52);
    // 막대가 있는 바닥 높이에서는 정말 아무것도 넘치지 않는다
    const h = minNodeHeight(1, 6);
    expect(2 + 30 + 1 * 20 + 20 + 20).toBeLessThanOrEqual(h);
    expect(bodyLayout(h, 1, 6)).toEqual({ visible: 1, hidden: 5 });
  });

  it("relationSides: 너비를 안 주면 그대로, 주면 실제 상자 사이 빈 폭으로 고른다", () => {
    expect(relationSides(0, 400, false)).toEqual({ child: "R", parent: "L" });
    expect(relationSides(0, 400, false, NODE_WIDTH, NODE_WIDTH)).toEqual(relationSides(0, 400, false));
    expect(relationSides(0, 248, false)).toEqual({ child: "R", parent: "R" }); // 빈 폭 8 이하는 같은 변
    expect(relationSides(0, 249, false)).toEqual({ child: "R", parent: "L" });
    expect(relationSides(249, 0, false)).toEqual(relationSides(249, 0, false, 240, 240));
    // 자식이 넓어져 부모와 겹치면 같은 변
    expect(relationSides(0, 400, false, 500, NODE_WIDTH)).toEqual({ child: "R", parent: "R" });
    // 부모(왼쪽)가 넓어도 마찬가지
    expect(relationSides(400, 0, false, NODE_WIDTH, 500)).toEqual({ child: "R", parent: "R" });
    expect(relationSides(400, 0, false, NODE_WIDTH, 300)).toEqual({ child: "L", parent: "R" });
  });

  it("liveEnds: 너비를 안 주면 NODE_WIDTH 로 접고, 주면 그 상자 가운데로 접는다", () => {
    const src = { x: 242, position: "right" as const };
    const tgt = { x: 398, position: "left" as const };
    expect(liveEnds(src, 0, tgt, 400)).toEqual({ source: src, target: tgt });
    // 부모가 자식 왼쪽으로 옮겨져 변이 어긋나면 각자 상자 가운데로 접는다
    const a = liveEnds(src, 500, tgt, 0);
    expect(a.source.position).toBe("left");
    expect(a.source.x).toBe(2 * (500 + 120) - 242);
    const b = liveEnds(src, 500, tgt, 0, 400, 300);
    expect(b.source.x).toBe(2 * (500 + 200) - 242);
    expect(b.target.x).toBe(2 * (0 + 150) - 398);
  });

  it("dragSize: 정수·범위로 자르고 끌지 않는 방향은 그대로", () => {
    const base = { w: 240, h: 92 };
    expect(dragSize(base, "e", 50.4, 999)).toEqual({ w: 290, h: 92 });
    expect(dragSize(base, "s", 999, -500)).toEqual({ w: 240, h: 52 });
    expect(dragSize(base, "s", 999, -500, 92)).toEqual({ w: 240, h: 92 }); // 표마다 바닥(minH)
    expect(dragSize(base, "se", -500, 5000)).toEqual({ w: 160, h: 4000 });
    expect(dragSize(base, "e", 5000, 0).w).toBe(1600);
  });

  it("estimatedSize: 저장 너비는 늘 쓰고, 저장 높이는 접기가 없을 때만 쓴다", () => {
    const s = menuState({ w: 320, h: 150 });
    const n = s.nodes[T1];
    expect(estimatedSize(s.model, "t-1", "NONE", undefined, true, n)).toEqual({ width: 320, height: 150 });
    expect(estimatedSize(s.model, "t-1", "KEYS", undefined, true, n).width).toBe(320);
    expect(estimatedSize(s.model, "t-1", "KEYS", undefined, true, n).height).toBe(nodeHeight(2, true));
    expect(estimatedSize(s.model, "t-1")).toEqual({ width: NODE_WIDTH, height: nodeHeight(3, false) });
  });

  it("자동 배치는 저장 크기를 쓴다(잰 크기가 없을 때) — 넓은 부모 오른쪽에 자식이 놓인다", () => {
    const s = sized(menuState(), nodeKey("d-all", "t-2"), { w: 700 });
    const cmd = autoLayoutCommand(s, "d-all", new Map());
    const x = Object.fromEntries(((cmd?.nodes ?? []) as { table: string; x: number }[]).map((n) => [n.table, n.x]));
    expect(x["t-2"]).toBe(0);
    expect(x["t-1"]).toBeGreaterThanOrEqual(700 + 100); // 부모 폭 700 + 층 간격 100
  });
});

describe("표 크기 — 명령·델타·낙관 투영", () => {
  it("resizeNodesCommand: 정수·범위로 자르고, 같은 크기·없는 표는 뺀다", () => {
    const nodes = menuState({ w: 300 }).nodes;
    expect(resizeNodesCommand("d-all", [{ table: "t-1", w: 300.4, h: null }], nodes)).toBeNull();
    expect(resizeNodesCommand("d-all", [{ table: "t-1", w: 9999, h: 10 }], nodes))
      .toEqual({ op: "resizeNodes", diagram: "d-all", nodes: [{ table: "t-1", w: 1600, h: 52 }] });
    expect(resizeNodesCommand("d-all", [{ table: "t-9", w: 200, h: null }], nodes)).toBeNull();
    expect(resizeNodesCommand("d-all", [{ table: "t-1", w: null, h: null }], nodes))
      .toEqual({ op: "resizeNodes", diagram: "d-all", nodes: [{ table: "t-1", w: null, h: null }] });
  });

  it("pending: resizeNodes 투영은 null 이면 키를 지우고, moveNodes·setFold 는 크기를 유지하며, 흐린 표시 대상에 든다", () => {
    const l0 = initLayers(menuState({ w: 300, h: 200 }));
    const batch = (commands: ErdCommandJson[]) => enqueue(l0, { id: 1, label: "x", baseRev: 3, commands });
    const resize = batch([{ op: "resizeNodes", diagram: "d-all", nodes: [{ table: "t-1", w: null, h: 120 }] }]);
    const n = project(resize.server, resize.pending).nodes[T1];
    expect("w" in n).toBe(false);
    expect(n.h).toBe(120);
    expect(pendingIds(resize.pending).has("t-1")).toBe(true);
    const moved = batch([{ op: "moveNodes", diagram: "d-all", nodes: [{ table: "t-1", x: 50, y: 60 }] }]);
    expect(project(moved.server, moved.pending).nodes[T1]).toMatchObject({ x: 50, y: 60, w: 300, h: 200 });
    const fold = batch([{ op: "setFold", diagram: "d-all", tables: ["t-1"], foldMode: "KEYS" }]);
    expect(project(fold.server, fold.pending).nodes[T1]).toMatchObject({ foldMode: "KEYS", w: 300, h: 200 });
  });

  it("view 응답: w·h 키가 없으면 자동 크기다", () => {
    const s = fromView(viewOf(menuModel(), { ...MENU_DIAGRAMS, nodes: [{ ...MENU_DIAGRAMS.nodes[0], w: 300 }, MENU_DIAGRAMS.nodes[1]] }));
    expect(s.nodes[T1].w).toBe(300);
    expect("w" in s.nodes[nodeKey("d-all", "t-2")]).toBe(false);
  });

  it("델타: w·h 가 없는 diagramNode 값은 그 표를 자동 크기로 되돌린다", () => {
    const s = menuState({ w: 300, h: 200 });
    const d = (rev: number, value: Record<string, unknown>): ErdDelta => ({
      modelId: "mcm", rev, userId: "peer", session: "ui-peer", source: "UI", rowVersion: null,
      changes: [{ kind: "diagramNode", id: T1, op: "upsert", value }],
    });
    const keep = applyDelta(s, d(4, { diagram: "d-all", table: "t-1", x: 0, y: 0, foldMode: "NONE", w: 320, h: 200 }));
    expect(keep.kind === "applied" && keep.state.nodes[T1]).toMatchObject({ w: 320, h: 200 });
    if (keep.kind !== "applied") throw new Error("applied 가 아니다");
    const reset = applyDelta(keep.state, d(5, { diagram: "d-all", table: "t-1", x: 0, y: 0, foldMode: "NONE" }));
    if (reset.kind !== "applied") throw new Error("applied 가 아니다");
    expect(Object.keys(reset.state.nodes[T1]).sort()).toEqual(["diagram", "foldMode", "table", "x", "y"]);
  });
});

describe("표 크기 — buildFlow", () => {
  it("저장 크기는 노드 데이터·초기 크기·선 변 고르기에 쓰인다", () => {
    const n = flowOf(menuState({ w: 320, h: 150 })).nodes.find((x) => x.id === "t-1")!;
    expect(n.data).toMatchObject({ w: 320, h: 150, boxHeight: 150 });
    expect(n.data.heightLocked).toBeUndefined();
    expect([n.initialWidth, n.initialHeight]).toEqual([320, 150]);
    const auto = flowOf(menuState()).nodes.find((x) => x.id === "t-1")!;
    expect("w" in auto.data || "h" in auto.data).toBe(false);
    expect([auto.initialWidth, auto.initialHeight]).toEqual([NODE_WIDTH, nodeHeight(3, false)]);
    // t-1(자식) 폭을 520 으로 키우면 t-2(x 400)와 겹쳐 두 끝이 같은 변(오른쪽)이다
    const wide = flowOf(menuState({ w: 520 })).edges[0];
    expect(wide.sourceHandle).toMatch(/\|R\|s$/);
    expect(wide.targetHandle).toMatch(/\|R\|t$/);
    const normal = flowOf(menuState()).edges[0];
    expect(normal.sourceHandle).toMatch(/\|R\|s$/);
    expect(normal.targetHandle).toMatch(/\|L\|t$/);
  });

  it("접기(KEYS·NAME)와 개요 보기는 저장 높이를 쓰지 않고 너비는 쓴다", () => {
    for (const fold of ["KEYS", "NAME"] as const) {
      const n = flowOf(menuState({ w: 320, h: 150 }, fold)).nodes.find((x) => x.id === "t-1")!;
      expect("h" in n.data).toBe(false);
      expect(n.data.w).toBe(320);
      expect(n.data.heightLocked).toBe(true);
      expect(n.initialWidth).toBe(320);
      expect(n.initialHeight).not.toBe(150);
    }
    const ov = flowOf(menuState({ w: 320, h: 150 }), "overview").nodes.find((x) => x.id === "t-1")!;
    expect("h" in ov.data).toBe(false);
  });

  it("높이를 줄여 스크롤 칸이 생기면 일반 컬럼 전부의 선이 표 머리 손잡이에 붙고(처음 보이는 줄도), 고정된 PK 컬럼은 그대로다", () => {
    // t-1: PK MENU_ID, 일반 OBJECT_ID(FK 선), MENU_NM. 자동 높이 92 아래면 막대가 생겨 일반 컬럼이 스크롤 칸으로 간다.
    for (const h of [60, 90]) {
      expect(bodyLayout(h, 1, 2).hidden).toBeGreaterThan(0);
      const edge = flowOf(menuState({ h })).edges[0];
      expect(edge.sourceHandle).toBe("tbl|R|s");
      expect(edge.targetHandle).toBe("c-3|L|t"); // 부모 t-2 는 그대로
      const row = flowOf(menuState({ h })).nodes.find((x) => x.id === "t-1")!.data.rows.find((r) => r.id === "c-2")!;
      expect(row.handles).toEqual([]);
    }
    // 다 보이는 높이(자동 이상)면 컬럼 손잡이
    expect(flowOf(menuState()).edges[0].sourceHandle).toBe("c-2|R|s");
    expect(flowOf(menuState({ h: 92 })).edges[0].sourceHandle).toBe("c-2|R|s");
    // 고정된 PK 컬럼에 선이 걸리면 컬럼 손잡이를 쓴다(부모 쪽 PK c-3 은 t-2 라 자동 크기, 여기서는 t-2 를 줄인다)
    expect(flowOf(sized(menuState(), nodeKey("d-all", "t-2"), { h: 40 })).edges[0].targetHandle).toBe("c-3|L|t");
  });
});

// ── 화면 ──
const NODE_TYPES: NodeTypes = { erdTable: ErdTableNode };
const EDGE_TYPES: EdgeTypes = { erdRelation: ErdRelationEdge };
let host: HTMLDivElement;
let root: Root | null = null;

let harnessRenders = 0;
function Harness({ ctx, selected }: { ctx: ErdEditContext; selected: readonly string[] }) {
  harnessRenders++;
  const rf = useReactFlow<ErdFlowNode, ErdFlowEdge>();
  const e = useCanvasEditing(ctx, rf);
  const flow = useMemo(
    () => buildFlow({
      state: ctx.state, diagramId: ctx.diagramId, mode: "logical", preset: "basic", namesOnly: false, showAudit: true,
      statuses: {}, domains: {}, selected: new Set(selected), mySession: ctx.session,
    }),
    [ctx.state, ctx.diagramId, ctx.session, selected],
  );
  return h("div", { tabIndex: 0, onKeyDown: e.onKeyDown, style: { position: "relative", width: 1200, height: 800 } },
    e.toolbar,
    h(ReactFlow<ErdFlowNode, ErdFlowEdge>, {
      nodes: e.decorateNodes(flow.nodes), edges: flow.edges, nodeTypes: NODE_TYPES, edgeTypes: EDGE_TYPES,
      onNodesChange: e.onNodesChange, ...e.flowProps, fitView: false, defaultViewport: { x: 0, y: 0, zoom: 1 },
    }),
    e.overlay);
}

async function render(ctx: ErdEditContext, selected: readonly string[]) {
  if (!root) {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  }
  await act(async () => {
    root!.render(h(DmesUiProvider, null, h(ReactFlowProvider, null, h(Harness, { ctx, selected }))));
  });
  await flush();
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
});

const q = <T extends HTMLElement>(sel: string): T | null => host.querySelector<T>(sel);
const node = (id: string) => q(`[data-testid="erd-node-${id}"]`);
const grip = (id: string, g: string) => q(`[data-testid="erd-grip-${id}-${g}"]`);

const PointerCtor: typeof MouseEvent = (globalThis as unknown as { PointerEvent?: typeof MouseEvent }).PointerEvent ?? MouseEvent;
const fire = async (target: EventTarget, type: string, init: MouseEventInit) => {
  await act(async () => {
    target.dispatchEvent(new PointerCtor(type, { bubbles: true, cancelable: true, ...init }));
  });
};

/** 손잡이를 누르고 (dx, dy) 만큼 끈 뒤(놓지 않음). */
async function dragGrip(id: string, g: string, dx: number, dy: number) {
  await fire(grip(id, g)!, "pointerdown", { button: 0, buttons: 1, clientX: 100, clientY: 100 });
  await fire(window, "pointermove", { buttons: 1, clientX: 100 + dx, clientY: 100 + dy });
}
const release = () => fire(window, "pointerup", { button: 0, buttons: 0 });

describe("표 크기 — 손잡이 끌기", () => {
  it("손잡이는 편집 가능할 때 고른 표 하나에만 있다", async () => {
    await render(fakeCtx({ state: menuState() }), ["t-1"]);
    expect(["e", "s", "se"].map((g) => !!grip("t-1", g))).toEqual([true, true, true]);
    expect(grip("t-2", "e")).toBeNull();
    await render(fakeCtx({ state: menuState() }), ["t-1", "t-2"]);
    expect(grip("t-1", "e")).toBeNull();
    await render(fakeCtx({ state: menuState() }), []);
    expect(grip("t-1", "e")).toBeNull();
  });

  it("다이어그램 편집 권한이 없으면 손잡이가 없다", async () => {
    const base = fakeCtx({ state: menuState() });
    await render({ ...base, rights: { ...base.rights, diagram: deny("읽기 전용") } }, ["t-1"]);
    expect(grip("t-1", "e")).toBeNull();
  });

  it("접기 상태의 표는 너비 손잡이만 있다", async () => {
    await render(fakeCtx({ state: menuState({}, "KEYS") }), ["t-1"]);
    expect([!!grip("t-1", "e"), !!grip("t-1", "s"), !!grip("t-1", "se")]).toEqual([true, false, false]);
  });

  it("끄는 동안은 화면만 바뀌고, 놓을 때 resizeNodes 를 한 번(끌지 않은 방향은 저장 값 null 그대로) 보낸다", async () => {
    const ctx = fakeCtx({ state: menuState() });
    await render(ctx, ["t-1"]);
    await dragGrip("t-1", "e", 60, 40);
    expect(ctx.applied).toEqual([]);
    expect(node("t-1")!.style.width).toBe("300px");
    expect(node("t-1")!.style.height).toBe(""); // 높이는 자동 그대로
    await fire(window, "pointermove", { buttons: 1, clientX: 100 + 80, clientY: 100 });
    expect(node("t-1")!.style.width).toBe("320px");
    await release();
    await flush();
    expect(ctx.applied).toEqual([{ commands: [{ op: "resizeNodes", diagram: "d-all", nodes: [{ table: "t-1", w: 320, h: null }] }], label: "표 크기 바꾸기" }]);
    // 놓은 뒤 더 움직여도(리스너가 지워졌다) 다시 보내지 않는다
    await fire(window, "pointermove", { buttons: 1, clientX: 400, clientY: 400 });
    await release();
    expect(ctx.applied).toHaveLength(1);
  });

  it("놓은 뒤에도 크기가 유지된다: 끄는 중 → 놓은 직후(낙관 투영) → 서버 응답 뒤, 진짜 pending 경로로", async () => {
    const initial = menuState({ w: 320 });
    let layers = initLayers(initial);
    let confirm!: (o: ApplyOutcome) => void;
    const base = fakeCtx({
      state: initial,
      apply: vi.fn((commands: ErdCommandJson[], label: string) => {
        layers = enqueue(layers, { id: 1, label, baseRev: layers.server.rev, commands });
        return new Promise<ApplyOutcome>((r) => { confirm = r; });
      }),
    });
    const show = () => render({ ...base, state: project(layers.server, layers.pending), pendingIds: pendingIds(layers.pending) }, ["t-1"]);
    await show();
    expect(node("t-1")!.style.width).toBe("320px");
    await dragGrip("t-1", "s", 0, 58);
    expect(node("t-1")!.style.height).toBe("150px"); // 자동 92 + 58
    await release();
    await flush();
    expect(base.apply).toHaveBeenCalledTimes(1);
    expect((base.apply as ReturnType<typeof vi.fn>).mock.calls[0][0]).toEqual([{ op: "resizeNodes", diagram: "d-all", nodes: [{ table: "t-1", w: 320, h: 150 }] }]);
    // 놓은 직후: 아직 응답 전. 낙관 투영이 들어와도 크기는 그대로(깜박임 없음)
    expect([node("t-1")!.style.width, node("t-1")!.style.height]).toEqual(["320px", "150px"]);
    await show();
    expect([node("t-1")!.style.width, node("t-1")!.style.height]).toEqual(["320px", "150px"]);
    expect(layers.pending[0].commands[0].op).toBe("resizeNodes");
    // 서버 응답(델타) → 아래층에 반영되고 묶음이 빠진다 → 덮개가 지워져도 저장 크기가 남는다
    const out = onResult(layers, 1, {
      applied: true, rev: 4, rowVersion: null, warnings: [], rejection: null,
      changes: [{ kind: "diagramNode", id: T1, op: "upsert", value: { diagram: "d-all", table: "t-1", x: 0, y: 0, foldMode: "NONE", w: 320, h: 150 } }],
    }, { userId: "tester", session: "ui-me" }, 0);
    layers = out.layers;
    await show();
    await act(async () => {
      confirm({ ok: true, rev: 4, warnings: [] });
    });
    await flush();
    expect(layers.pending).toEqual([]);
    expect([node("t-1")!.style.width, node("t-1")!.style.height]).toEqual(["320px", "150px"]);
  });

  it("거절된 저장: 덮개가 지워지고 크기가 저장 값으로 돌아간다", async () => {
    const ctx = fakeCtx({ state: menuState({ w: 320 }) });
    ctx.outcomes.push({ ok: false, notice: notice() });
    await render(ctx, ["t-1"]);
    await dragGrip("t-1", "e", 80, 0);
    expect(node("t-1")!.style.width).toBe("400px");
    await release();
    await flush();
    expect(ctx.applied).toHaveLength(1);
    expect(node("t-1")!.style.width).toBe("320px");
  });

  it("범위를 넘게 끌면 서버 범위·표 바닥으로 자르고(PK·막대가 넘치지 않게), 움직이지 않고 놓으면 보내지 않는다", async () => {
    const ctx = fakeCtx({ state: wideState() });
    await render(ctx, ["t-1"]);
    await dragGrip("t-1", "se", -5000, -5000);
    // PK 1 + 일반 6: 바닥 92(= 2 + 30 + PK 20 + 줄 20 + 막대 20), 서버 최소 52 가 아니다
    expect([node("t-1")!.style.width, node("t-1")!.style.height]).toEqual(["160px", "92px"]);
    expect(q('[data-testid="erd-clip-t-1"]')!.textContent).toBe("▾ 5개 더");
    await release();
    await flush();
    expect(ctx.applied[0].commands).toEqual([{ op: "resizeNodes", diagram: "d-all", nodes: [{ table: "t-1", w: 160, h: 92 }] }]);
    const ctx2 = fakeCtx({ state: menuState() });
    await render(ctx2, ["t-1"]);
    await fire(grip("t-1", "e")!, "pointerdown", { button: 0, buttons: 1, clientX: 5, clientY: 5 });
    await release();
    expect(ctx2.applied).toEqual([]);
  });

  it("일반 컬럼이 없는 표는 자동 높이 아래로 줄지 않는다(넘침·막대 없음)", async () => {
    const m = emptyModel();
    m.tables["t-1"] = table("TB_K", "키", ["c-0", "c-1"]);
    m.columns["c-0"] = column("t-1", "A", "에이");
    m.columns["c-1"] = column("t-1", "B", "비");
    m.keys["k-1"] = { table: "t-1", kind: "PK", name: "PK_K", columns: ["c-0", "c-1"] };
    const state = stateOf(m, { diagrams: MENU_DIAGRAMS.diagrams, nodes: [{ diagram: "d-all", table: "t-1", x: 0, y: 0, foldMode: "NONE" }] });
    const ctx = fakeCtx({ state });
    await render(ctx, ["t-1"]);
    await dragGrip("t-1", "s", 0, -5000);
    expect(node("t-1")!.style.height).toBe(""); // 바닥 = 자동 높이라 저장할 높이가 없다
    expect(q('[data-testid="erd-clip-t-1"]')).toBeNull();
    await release();
    await flush();
    expect(ctx.applied).toEqual([]); // 바뀐 것이 없다
  });

  it("안 바뀐 축은 보내지 않는다: 모서리를 옆으로만 끌면 w 만, 자동 높이는 null 로 둔다", async () => {
    const ctx = fakeCtx({ state: menuState() });
    await render(ctx, ["t-1"]);
    await dragGrip("t-1", "se", 60, 0);
    expect(node("t-1")!.style.width).toBe("300px");
    expect(node("t-1")!.style.height).toBe("");
    await release();
    await flush();
    expect(ctx.applied[0].commands).toEqual([{ op: "resizeNodes", diagram: "d-all", nodes: [{ table: "t-1", w: 300, h: null }] }]);
    // 아래로만 끌면 h 만, 저장된 너비는 그대로
    const ctx2 = fakeCtx({ state: menuState({ w: 320 }) });
    await render(ctx2, ["t-1"]);
    await dragGrip("t-1", "se", 0, 30);
    await release();
    await flush();
    expect(ctx2.applied[0].commands).toEqual([{ op: "resizeNodes", diagram: "d-all", nodes: [{ table: "t-1", w: 320, h: 122 }] }]);
  });

  it("끌다가 시작 크기로 돌아와 놓으면(떨림·되돌아옴) 아무것도 보내지 않고 자동 크기를 굳히지 않는다", async () => {
    const ctx = fakeCtx({ state: menuState() });
    await render(ctx, ["t-1"]);
    await dragGrip("t-1", "se", 40, 40);
    expect(node("t-1")!.style.width).toBe("280px");
    await fire(window, "pointermove", { buttons: 1, clientX: 100, clientY: 100 }); // 출발점으로 돌아옴
    expect([node("t-1")!.style.width, node("t-1")!.style.height]).toEqual(["", ""]);
    await release();
    await flush();
    expect(ctx.applied).toEqual([]);
    // 제자리 떨림(0 이동)도 마찬가지
    await dragGrip("t-1", "se", 0, 0);
    await release();
    expect(ctx.applied).toEqual([]);
  });

  it("끄는 도중 pointerup 을 잃거나(buttons 0) pointercancel 이면 보내지 않고 미리보기를 지운다", async () => {
    const ctx = fakeCtx({ state: menuState() });
    await render(ctx, ["t-1"]);
    await dragGrip("t-1", "e", 80, 0);
    expect(node("t-1")!.style.width).toBe("320px");
    await fire(window, "pointermove", { buttons: 0, clientX: 300, clientY: 100 });
    expect(node("t-1")!.style.width).toBe("");
    await release();
    expect(ctx.applied).toEqual([]);
    await dragGrip("t-1", "s", 0, 50);
    expect(node("t-1")!.style.height).toBe("142px");
    await fire(window, "pointercancel", {});
    expect(node("t-1")!.style.height).toBe("");
    await release();
    expect(ctx.applied).toEqual([]);
  });

  it("권한이 끄는 도중 사라지면 미리보기를 버린다", async () => {
    const ctx = fakeCtx({ state: menuState() });
    await render(ctx, ["t-1"]);
    await dragGrip("t-1", "e", 80, 0);
    await render({ ...ctx, rights: { ...ctx.rights, diagram: deny("읽기 전용") } }, ["t-1"]);
    expect(node("t-1")!.style.width).toBe("");
    await release();
    expect(ctx.applied).toEqual([]);
  });

  it("끄는 동안 다른 곳에서 반대 축이 바뀌면 놓을 때 그 최신 값을 쓴다(되돌리지 않는다)", async () => {
    const ctx = fakeCtx({ state: menuState() });
    await render(ctx, ["t-1"]);
    await dragGrip("t-1", "e", 60, 0);
    await render({ ...ctx, state: menuState({ h: 200 }) }, ["t-1"]); // 남이 높이를 200 으로
    await release();
    await flush();
    expect(ctx.applied[0].commands).toEqual([{ op: "resizeNodes", diagram: "d-all", nodes: [{ table: "t-1", w: 300, h: 200 }] }]);
  });

  it("Esc 는 끌기만 그만두고 보내지 않는다", async () => {
    const ctx = fakeCtx({ state: menuState() });
    await render(ctx, ["t-1"]);
    await dragGrip("t-1", "e", 80, 0);
    expect(node("t-1")!.style.width).toBe("320px");
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });
    await release();
    expect(ctx.applied).toEqual([]);
    expect(node("t-1")!.style.width).toBe("");
  });

  it("끄는 동안 캔버스 하니스(useCanvasEditing 쪽)는 다시 그려지지 않고, 다른 표 DOM 도 그대로다", async () => {
    const ctx = fakeCtx({ state: menuState() });
    await render(ctx, ["t-1"]);
    const t2 = node("t-2");
    await fire(grip("t-1", "e")!, "pointerdown", { button: 0, buttons: 1, clientX: 100, clientY: 100 });
    const before = harnessRenders;
    await fire(window, "pointermove", { buttons: 1, clientX: 120, clientY: 100 });
    await fire(window, "pointermove", { buttons: 1, clientX: 150, clientY: 100 });
    expect(node("t-1")!.style.width).toBe("290px");
    expect(harnessRenders).toBe(before); // 끄는 크기는 React 상태가 아니라 버스 — 위쪽 컴포넌트를 다시 그리지 않는다
    expect(node("t-2")).toBe(t2);
    expect(node("t-2")!.style.width).toBe("");
    await release();
    await flush();
    expect(ctx.applied).toHaveLength(1);
  });
});

describe("표 크기 — 줄인 높이", () => {
  const rowIds = (el: Element | null) => [...(el?.querySelectorAll("[data-col]") ?? [])].map((r) => r.getAttribute("data-col"));

  it("PK 묶음은 스크롤 칸 밖에 고정하고, 일반 컬럼만 nowheel 스크롤 칸에 둔다. 가려진 수를 막대에 적는다", async () => {
    await render(fakeCtx({ state: wideState({ h: 100 }) }), []);
    const body = q('[data-testid="erd-body-t-1"]')!;
    expect(body.classList.contains("nowheel")).toBe(true);
    expect(rowIds(body)).toEqual(["c-1", "c-2", "c-3", "c-4", "c-5", "c-6"]);
    expect(body.querySelector('[data-col="c-0"]')).toBeNull();
    const pk = node("t-1")!.querySelector('[data-col="c-0"]')!;
    expect(body.contains(pk)).toBe(false);
    // PK 행은 머리 바로 아래(스크롤 칸보다 앞)
    expect(pk.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(node("t-1")!.style.height).toBe("100px");
    expect(q('[data-testid="erd-clip-t-1"]')!.textContent).toBe("▾ 5개 더");
  });

  it("다 보이면 막대도 스크롤 칸도 없다", async () => {
    await render(fakeCtx({ state: wideState({ h: 400 }) }), []);
    expect(q('[data-testid="erd-clip-t-1"]')).toBeNull();
    expect(q('[data-testid="erd-body-t-1"]')).toBeNull();
    expect(node("t-1")!.style.height).toBe("400px");
    await render(fakeCtx({ state: wideState() }), []);
    expect(q('[data-testid="erd-clip-t-1"]')).toBeNull();
  });

  it("막대를 누르면 h:null 한 번(너비 유지)을 보낸다", async () => {
    const ctx = fakeCtx({ state: wideState({ w: 300, h: 100 }) });
    await render(ctx, []);
    await act(async () => {
      q<HTMLButtonElement>('[data-testid="erd-clip-t-1"]')!.click();
    });
    await flush();
    expect(ctx.applied).toEqual([{ commands: [{ op: "resizeNodes", diagram: "d-all", nodes: [{ table: "t-1", w: 300, h: null }] }], label: "표 높이 자동" }]);
    // 너비도 자동이면 w:null
    const ctx2 = fakeCtx({ state: wideState({ h: 100 }) });
    await render(ctx2, []);
    await act(async () => {
      q<HTMLButtonElement>('[data-testid="erd-clip-t-1"]')!.click();
    });
    expect(ctx2.applied[0].commands).toEqual([{ op: "resizeNodes", diagram: "d-all", nodes: [{ table: "t-1", w: null, h: null }] }]);
  });

  it("편집 권한이 없으면 막대는 글자일 뿐 누를 수 없다", async () => {
    const base = fakeCtx({ state: wideState({ h: 100 }) });
    await render({ ...base, rights: { ...base.rights, model: OK, diagram: deny("읽기 전용") } }, []);
    const clip = q('[data-testid="erd-clip-t-1"]')!;
    expect(clip.tagName).toBe("DIV");
    expect(clip.textContent).toBe("▾ 5개 더");
  });

  it("막대와 손잡이는 nodrag 라 표 끌기를 시작하지 않고, 막대 누르기는 한 번의 h:null 명령뿐이다", async () => {
    const ctx = fakeCtx({ state: wideState({ h: 100 }) });
    await render(ctx, ["t-1"]);
    expect(q('[data-testid="erd-clip-t-1"]')!.classList.contains("nodrag")).toBe(true);
    for (const g of ["e", "s", "se"]) expect(grip("t-1", g)!.classList.contains("nodrag")).toBe(true);
    // 막대가 손잡이(z-index 3) 위에 놓이도록 CSS 에 막대 z-index 가 있다
    expect(ERD_CSS).toMatch(/\.erd-node__clip \{ position: relative; z-index: 4; \}/);
    expect(ERD_CSS).toMatch(/\.erd-grip \{[^}]*touch-action: none/);
  });

  it("접기 상태는 저장 높이를 무시하고(스크롤 칸·막대 없음) 저장 너비는 쓴다", async () => {
    const s = wideState({ w: 300, h: 100 });
    await render(fakeCtx({ state: { ...s, nodes: { ...s.nodes, [T1]: { ...s.nodes[T1], foldMode: "KEYS" } } } }), []);
    expect(q('[data-testid="erd-clip-t-1"]')).toBeNull();
    expect(q('[data-testid="erd-body-t-1"]')).toBeNull();
    expect(node("t-1")!.style.width).toBe("300px");
    expect(node("t-1")!.style.height).toBe("");
  });

  it("스크롤 칸 자신(스크롤바)을 누른 mousedown 은 노드 끌기로 올라가지 않고, 컬럼 행은 그대로 올라간다", async () => {
    await render(fakeCtx({ state: wideState({ h: 100 }) }), []);
    // 표 끌기는 노드 뿌리의 d3-drag mousedown(네이티브)이라, 그 아래 .erd-node 까지 올라오는지로 본다.
    let reached = 0;
    node("t-1")!.addEventListener("mousedown", () => { reached++; });
    const body = q('[data-testid="erd-body-t-1"]')!;
    await act(async () => {
      body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(reached).toBe(0);
    await act(async () => {
      body.querySelector('[data-col="c-1"]')!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, view: window }));
    });
    expect(reached).toBe(1);
  });
});

describe("표 크기 — 버스", () => {
  it("setSizeDraft 는 같은 값이면 구독자를 깨우지 않는다", () => {
    const bus = sizeBusOf({ getState: () => 1 });
    let n = 0;
    bus.listeners.add(() => { n++; });
    setSizeDraft(bus, { id: "t-1", w: 200, h: null });
    setSizeDraft(bus, { id: "t-1", w: 200, h: null });
    expect(n).toBe(1);
    setSizeDraft(bus, null);
    expect(n).toBe(2);
  });
});


describe("표 크기 — 관계선 끝은 넓힌 표 상자를 쓴다", () => {
  it("잰 너비(nodeLookup.measured)가 liveEnds 에 들어가, 접힌 끝 x 가 넓힌 상자 가운데 기준이다(240 기준이 아니다)", async () => {
    // t-1 은 x=0 너비 395, t-2 는 x=400 너비 300(넓힌 표). 빈 폭 5 <= 8 이라 규칙은 둘 다 오른쪽 변이다.
    // 손잡이는 t-2 의 왼쪽(x=400)에 붙어 있어 어긋나므로 대상 끝이 오른쪽 변으로 접힌다. happy-dom 은 못 재므로 measured 를 직접 준다.
    const nodes: Node[] = [
      { id: "t-1", position: { x: 0, y: 0 }, data: {}, measured: { width: 395, height: 100 } },
      { id: "t-2", position: { x: 400, y: 0 }, data: {}, measured: { width: 300, height: 100 } },
    ];
    const SRC_X = 395;
    const TGT_X = 400;
    const props = {
      id: "r-1", source: "t-1", target: "t-2", sourceX: SRC_X, sourceY: 50, targetX: TGT_X, targetY: 50,
      sourcePosition: "right", targetPosition: "left", data: { state: "CONFIRMED", folded: 0, zeroChild: false, route: null },
    } as unknown as EdgeProps<ErdFlowEdge>;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(h(DmesUiProvider, null, h(ReactFlowProvider, null,
        h("div", { style: { width: 1200, height: 800 } },
          h(ReactFlow, { nodes, edges: [], fitView: false, defaultViewport: { x: 0, y: 0, zoom: 1 } }),
          h("svg", null, h(ErdRelationEdge, props))))));
    });
    await flush();
    const drawn = host.querySelector(".erd-rel__line")?.getAttribute("d");
    const pathFor = (tx: number) => routePath(smoothStepPoints({
      sourceX: SRC_X, sourceY: 50, sourcePosition: "right", targetX: tx, targetY: 50, targetPosition: "right", offset: END_STUB,
    } as Parameters<typeof smoothStepPoints>[0]), ROUTE_RADIUS);
    // 넓힌 너비(300) 기준: 2 * (400 + 150) - 400 = 700. 기본 너비(240) 기준이면 640 이다.
    expect(drawn).toBe(pathFor(700));
    expect(drawn).not.toBe(pathFor(640));
    expect(liveEnds({ x: SRC_X, position: "right" }, 0, { x: TGT_X, position: "left" }, 400, 395, 300).target.x).toBe(700);
    expect(liveEnds({ x: SRC_X, position: "right" }, 0, { x: TGT_X, position: "left" }, 400, 395).target.x).toBe(640);
  });
});
