/** @vitest-environment happy-dom */
import { act, createElement as h, useMemo } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ReactFlow, ReactFlowProvider, isMacPlatform, useReactFlow, type EdgeTypes, type NodeTypes,
} from "@dk-oasis/shared/react-flow";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import { ErdRelationEdge } from "../../../pages/dma/erdEdit/canvas/ErdRelationEdge";
import { ErdTableNode } from "../../../pages/dma/erdEdit/canvas/ErdTableNode";
import { buildFlow, type ErdFlowEdge, type ErdFlowNode } from "../../../pages/dma/erdEdit/canvas/erd-flow";
import { useCanvasEditing, type CanvasEditing } from "../../../pages/dma/erdEdit/canvas/useCanvasEditing";
import type { ApplyOutcome, ErdEditContext } from "../../../pages/dma/erdEdit/edit-context";
import { flush, typeInto } from "../../dme/helpers/render";
import { deny, fakeCtx, notice, type FakeCtx } from "./erd-canvas-fixtures";

const NODE_TYPES: NodeTypes = { erdTable: ErdTableNode };
const EDGE_TYPES: EdgeTypes = { erdRelation: ErdRelationEdge };
let host: HTMLDivElement;
let root: Root | null = null;
let editing: CanvasEditing;
let raw: ErdFlowNode[] = [];

/** CanvasPane 과 같은 연결: buildFlow → decorateNodes → ReactFlow, flowProps 펼치기, host div 의 onKeyDown, toolbar·overlay. */
function Harness({ ctx, selected }: { ctx: ErdEditContext; selected: readonly string[] }) {
  const rf = useReactFlow<ErdFlowNode, ErdFlowEdge>();
  const e = useCanvasEditing(ctx, rf);
  editing = e;
  const flow = useMemo(
    () => buildFlow({
      state: ctx.state, diagramId: ctx.diagramId, mode: "logical", preset: "basic", namesOnly: false,
      statuses: {}, domains: {}, selected: new Set(selected), mySession: ctx.session,
    }),
    [ctx.state, ctx.diagramId, ctx.session, selected],
  );
  raw = flow.nodes;
  return h("div", { tabIndex: 0, "data-testid": "erd-host", onKeyDown: e.onKeyDown, style: { position: "relative", width: 1200, height: 800 } },
    e.toolbar,
    h(ReactFlow<ErdFlowNode, ErdFlowEdge>, {
      nodes: e.decorateNodes(flow.nodes), edges: flow.edges, nodeTypes: NODE_TYPES, edgeTypes: EDGE_TYPES,
      onNodesChange: e.onNodesChange, ...e.flowProps, fitView: false, defaultViewport: { x: 0, y: 0, zoom: 1 },
    }),
    e.overlay);
}

async function mount(ctx: FakeCtx, selected: readonly string[] = []) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(h(DmesUiProvider, null, h(ReactFlowProvider, null, h(Harness, { ctx, selected }))));
  });
  await flush();
}

async function press(init: KeyboardEventInit) {
  const el = host.querySelector<HTMLElement>('[data-testid="erd-host"]')!;
  await act(async () => {
    el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
  });
  await flush();
}

async function click(sel: string) {
  const el = document.querySelector<HTMLElement>(sel);
  if (!el) throw new Error(`없는 요소: ${sel}`);
  await act(async () => {
    el.click();
  });
  await flush();
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
});

describe("캔버스 편집 — 키", () => {
  it("Delete 는 고른 표를 이 다이어그램에서 뺀다", async () => {
    const ctx = fakeCtx({ selectedTableId: "t-1" });
    await mount(ctx, ["t-1"]);
    await press({ key: "Delete", code: "Delete" });
    expect(ctx.applied).toEqual([{ commands: [{ op: "removeFromDiagram", diagram: "d-all", tables: ["t-1"] }], label: "다이어그램에서 빼기" }]);
  });

  it("고른 표가 없으면 Delete 를 막지 않는다", async () => {
    const ctx = fakeCtx();
    await mount(ctx);
    await press({ key: "Delete", code: "Delete" });
    expect(ctx.applied).toEqual([]);
  });

  it("Alt+Backspace 는 확인 창을 띄우고, [삭제] 뒤에 deleteTable 을 보낸다", async () => {
    const ctx = fakeCtx({ selectedTableId: "t-1" });
    await mount(ctx, ["t-1"]);
    await press({ key: "Backspace", code: "Backspace", altKey: true });
    expect(document.querySelector('[data-testid="erd-delete-confirm"]')?.textContent).toContain("TB_MCM_SEC_MENU");
    expect(ctx.applied).toEqual([]);
    await click('[data-testid="erd-delete-ok"]');
    expect(ctx.applied).toEqual([{ commands: [{ op: "deleteTable", id: "t-1" }], label: "표 삭제" }]);
  });

  it("다이어그램 편집 권한이 없으면 Delete 는 이유를 알리고 보내지 않는다", async () => {
    const ctx = fakeCtx({ rights: { ...fakeCtx().rights, diagram: deny("공동 편집자가 아닙니다.") } });
    await mount(ctx, ["t-1"]);
    await press({ key: "Delete", code: "Delete" });
    expect(ctx.applied).toEqual([]);
    expect(ctx.notify).toHaveBeenCalledWith("공동 편집자가 아닙니다.", "warn");
  });

  it("4 는 비식별 관계 도구 — 끌기를 끄고 잇기를 켠다. Escape 는 선택 도구로 돌린다", async () => {
    const ctx = fakeCtx();
    await mount(ctx);
    expect(editing.flowProps).toMatchObject({ nodesDraggable: true, nodesConnectable: false, deleteKeyCode: null });
    await press({ key: "4", code: "Digit4" });
    expect(document.querySelector('[data-testid="erd-tool-relation"]')?.getAttribute("aria-pressed")).toBe("true");
    expect(editing.flowProps).toMatchObject({ nodesDraggable: false, nodesConnectable: true });
    expect(editing.decorateNodes(raw).every((n) => n.data.pickable === true)).toBe(true);
    expect(host.querySelectorAll('[data-testid^="erd-pick-"]')).toHaveLength(2);
    await press({ key: "Escape", code: "Escape" });
    expect(document.querySelector('[data-testid="erd-tool-select"]')?.getAttribute("aria-pressed")).toBe("true");
    expect(editing.decorateNodes(raw)).toBe(raw);
  });

  it("모델 편집 권한이 없으면 그리는 도구를 고르지 못한다", async () => {
    const ctx = fakeCtx({ rights: { ...fakeCtx().rights, model: deny("확정된 버전이라 모델을 고칠 수 없습니다.") } });
    await mount(ctx);
    await press({ key: "5", code: "Digit5" });
    expect(ctx.notify).toHaveBeenCalledWith("확정된 버전이라 모델을 고칠 수 없습니다.", "warn");
    expect(document.querySelector('[data-testid="erd-tool-select"]')?.getAttribute("aria-pressed")).toBe("true");
  });

  it("Alt+↑ 는 부모 표로, Alt+↓ 는 자식 표로 옮긴다", async () => {
    const child = fakeCtx({ selectedTableId: "t-1" });
    await mount(child, ["t-1"]);
    await press({ key: "ArrowUp", code: "ArrowUp", altKey: true });
    expect(child.nav.selectTable).toHaveBeenCalledWith("t-2");
    act(() => root?.unmount());
    const parent = fakeCtx({ selectedTableId: "t-2" });
    await mount(parent, ["t-2"]);
    await press({ key: "ArrowDown", code: "ArrowDown", altKey: true });
    expect(parent.nav.selectTable).toHaveBeenCalledWith("t-1");
    await press({ key: "ArrowUp", code: "ArrowUp", altKey: true });
    expect(parent.notify).toHaveBeenCalledWith("부모 표가 없습니다.", "info");
  });

  it("Ctrl/⌘+F 는 표 찾기를 연다", async () => {
    const ctx = fakeCtx();
    await mount(ctx);
    const mac = isMacPlatform();
    await press({ key: "f", code: "KeyF", ctrlKey: !mac, metaKey: mac });
    expect(ctx.nav.openTableFind).toHaveBeenCalledTimes(1);
  });
});

describe("캔버스 편집 — 끌기·관계·표 추가·배치·꾸밈", () => {
  it("끄는 동안은 보내지 않고 덮개로 그리며, 놓을 때 moveNodes 를 한 번 보낸 뒤 덮개를 지운다", async () => {
    const ctx = fakeCtx();
    await mount(ctx);
    await act(async () => {
      editing.onNodesChange([{ type: "position", id: "t-1", position: { x: 100, y: 50 }, dragging: true }]);
    });
    expect(ctx.applied).toEqual([]);
    expect(editing.decorateNodes(raw)[0].position).toEqual({ x: 100, y: 50 });
    await act(async () => {
      editing.flowProps.onNodeDragStop!(new MouseEvent("mouseup"), raw[0], [raw[0]]);
    });
    await flush();
    expect(ctx.applied).toEqual([{ commands: [{ op: "moveNodes", diagram: "d-all", nodes: [{ table: "t-1", x: 100, y: 50 }] }], label: "표 옮기기" }]);
    expect(editing.decorateNodes(raw)[0]).toBe(raw[0]);
  });

  it("앞선 놓기의 응답은 그 뒤 다시 끄는 같은 표의 덮개를 지우지 않는다", async () => {
    let resolve!: (v: ApplyOutcome) => void;
    const ctx = fakeCtx({ apply: vi.fn(() => new Promise<ApplyOutcome>((r) => { resolve = r; })) });
    await mount(ctx);
    await act(async () => {
      editing.onNodesChange([{ type: "position", id: "t-1", position: { x: 100, y: 50 }, dragging: true }]);
      editing.flowProps.onNodeDragStop!(new MouseEvent("mouseup"), raw[0], [raw[0]]);
      editing.onNodesChange([{ type: "position", id: "t-1", position: { x: 300, y: 80 }, dragging: true }]);
    });
    await act(async () => {
      resolve({ ok: true, rev: 4, warnings: [] });
    });
    await flush();
    expect(editing.decorateNodes(raw)[0].position).toEqual({ x: 300, y: 80 });
  });

  it("관계 이름 겹침(NEEDS_CHOICE) — 선택 창에서 [있는 컬럼 쓰기]를 누르면 REUSE 로 다시 보낸다", async () => {
    const ctx = fakeCtx();
    ctx.outcomes.push({
      ok: false,
      notice: notice({ code: "NEEDS_CHOICE", property: "onNameClash", choices: [{ parentColumn: "c-3", childColumn: "c-2", phys: "OBJECT_ID" }] }),
    });
    await mount(ctx);
    await press({ key: "4", code: "Digit4" });
    await act(async () => {
      editing.flowProps.onConnect!({ source: "t-2", target: "t-1", sourceHandle: "pick", targetHandle: "pick" });
    });
    await flush();
    expect(ctx.applied[0].commands[0]).toMatchObject({ op: "addRelation", child: "t-1", parent: "t-2", identifying: false, onNameClash: "ASK" });
    expect(document.querySelector('[data-testid="erd-clash"]')?.textContent).toContain("OBJECT_ID");
    await click('[data-testid="erd-clash-reuse"]');
    expect(ctx.applied[1].commands[0]).toMatchObject({ op: "addRelation", child: "t-1", parent: "t-2", identifying: false, onNameClash: "REUSE" });
    expect(ctx.applied[1].label).toBe("비식별 관계 추가");
    expect(document.querySelector('[data-testid="erd-tool-select"]')?.getAttribute("aria-pressed")).toBe("true");
  });

  it("관계 추가 응답을 기다리는 동안 다시 이어도 두 번 보내지 않는다", async () => {
    const ctx = fakeCtx();
    await mount(ctx);
    await press({ key: "4", code: "Digit4" });
    await act(async () => {
      editing.flowProps.onConnect!({ source: "t-2", target: "t-1", sourceHandle: "pick", targetHandle: "pick" });
      editing.flowProps.onConnect!({ source: "t-2", target: "t-1", sourceHandle: "pick", targetHandle: "pick" });
    });
    await flush();
    expect(ctx.applied).toHaveLength(1);
  });

  it("자기 자신으로는 잇지 않는다", async () => {
    const ctx = fakeCtx();
    await mount(ctx);
    expect(editing.flowProps.isValidConnection!({ source: "t-1", target: "t-1", sourceHandle: null, targetHandle: null })).toBe(false);
    expect(editing.flowProps.isValidConnection!({ source: "t-2", target: "t-1", sourceHandle: null, targetHandle: null })).toBe(true);
  });

  it("표 도구 — 빈 곳을 누르면 새 표 창, [만들기]는 addTable·placeTables 한 묶음이고 새 표를 고른다", async () => {
    const ctx = fakeCtx();
    await mount(ctx);
    await press({ key: "2", code: "Digit2" });
    await act(async () => {
      editing.flowProps.onPaneClick!(new MouseEvent("click", { clientX: 123, clientY: 47 }) as unknown as React.MouseEvent);
    });
    await flush();
    await typeInto(document.querySelector<HTMLInputElement>('[data-testid="erd-newtable-phys"]')!, "tb_new");
    await typeInto(document.querySelector<HTMLInputElement>('[data-testid="erd-newtable-logical"]')!, "새 표");
    await click('[data-testid="erd-newtable-ok"]');
    const [add, place] = ctx.applied[0].commands as Array<Record<string, unknown>>;
    expect(add).toMatchObject({ op: "addTable", phys: "TB_NEW", logical: "새 표", comment: "" });
    expect(String(add.id)).toMatch(/^t-[0-9a-zA-Z-]{1,48}$/);
    expect(place).toMatchObject({ op: "placeTables", diagram: "d-all" });
    expect((place.nodes as Array<{ table: string; x: number; y: number }>)[0].table).toBe(add.id);
    expect(ctx.nav.selectTable).toHaveBeenCalledWith(add.id);
  });

  it("새 표 창은 같은 물리명을 막고, 서버 거절 문구를 창 안에 보인다", async () => {
    const ctx = fakeCtx();
    ctx.outcomes.push({ ok: false, notice: notice({ code: "INVALID", message: "Oracle 식별자 규칙에 맞지 않습니다: TB_X" }) });
    await mount(ctx);
    await press({ key: "2", code: "Digit2" });
    await act(async () => {
      editing.flowProps.onPaneClick!(new MouseEvent("click", { clientX: 10, clientY: 10 }) as unknown as React.MouseEvent);
    });
    await flush();
    await typeInto(document.querySelector<HTMLInputElement>('[data-testid="erd-newtable-phys"]')!, "TB_MCM_SEC_MENU");
    expect(document.querySelector<HTMLButtonElement>('[data-testid="erd-newtable-ok"]')!.disabled).toBe(true);
    await typeInto(document.querySelector<HTMLInputElement>('[data-testid="erd-newtable-phys"]')!, "TB_X");
    await click('[data-testid="erd-newtable-ok"]');
    expect(document.querySelector('[data-testid="erd-newtable-error"]')?.textContent).toBe("Oracle 식별자 규칙에 맞지 않습니다: TB_X");
  });

  it("[자동 배치]는 바뀐 표만 moveNodes 로 보낸다(부모 t-2 가 왼쪽)", async () => {
    const ctx = fakeCtx();
    await mount(ctx);
    await click('[data-testid="erd-tool-layout"]');
    const cmd = ctx.applied[0].commands[0] as { op: string; nodes: { table: string; x: number }[] };
    expect(cmd.op).toBe("moveNodes");
    expect(cmd.nodes.find((n) => n.table === "t-2")?.x).toBe(0);
    expect(ctx.applied[0].label).toBe("자동 배치");
  });

  it("[키만] 접기는 고른 표에 setFold 를 보낸다", async () => {
    const ctx = fakeCtx({ selectedTableId: "t-1" });
    await mount(ctx, ["t-1"]);
    await click('[data-testid="erd-fold-KEYS"]');
    expect(ctx.applied).toEqual([{ commands: [{ op: "setFold", diagram: "d-all", tables: ["t-1"], foldMode: "KEYS" }], label: "키만 보이기" }]);
  });

  it("접속자 목록에 없는 Claude 세션의 작업 중 표시도 노드에 이름표(erd-tag-<세션>)로 그린다", async () => {
    const base = fakeCtx();
    const ctx = fakeCtx({
      state: { ...base.state, claims: [{ tableId: "t-2", session: "claude-b", userId: "erd-mcp-b", expiresAt: "2999-01-01T00:00:00Z" }] },
    });
    await mount(ctx);
    const tag = host.querySelector('[data-testid="erd-node-t-2"] [data-testid="erd-tag-claude-b"]');
    expect(tag?.getAttribute("data-source")).toBe("llm");
    expect(tag?.hasAttribute("data-claimed")).toBe(true);
    expect(tag?.textContent).toBe("claude-b · 작업 중");
  });

  it("decorateNodes — 대기 표는 erd-pending, 강조 칸의 표는 erd-hl, 같은 꾸밈이면 같은 객체", async () => {
    const ctx = fakeCtx({
      pendingIds: new Set(["t-2"]),
      highlight: { code: "CONFLICT", elementId: "c-1", property: "logical", message: "다른 세션이 먼저 바꾼 값입니다", mine: "x" },
    });
    await mount(ctx);
    const a = editing.decorateNodes(raw);
    expect(a.map((n) => n.className)).toEqual(["erd-hl", "erd-pending"]);
    const b = editing.decorateNodes(raw);
    expect(b[0]).toBe(a[0]);
    expect(b[1]).toBe(a[1]);
  });
});
