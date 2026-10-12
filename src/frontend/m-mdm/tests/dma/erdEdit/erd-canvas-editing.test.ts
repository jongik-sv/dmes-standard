/** @vitest-environment happy-dom */
import { act, createElement as h, useMemo } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ReactFlow, ReactFlowProvider, isMacPlatform, useReactFlow, useStore, useStoreApi,
  type EdgeProps, type EdgeTypes, type FinalConnectionState, type NodeTypes, type ReactFlowInstance, type ReactFlowState,
} from "@dk-oasis/shared/react-flow";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import { clearClip, copyTables, readClip, writeClip } from "../../../pages/dma/erdEdit/canvas/erd-clipboard";
import { ErdRelationEdge } from "../../../pages/dma/erdEdit/canvas/ErdRelationEdge";
import { HANDLE_REACH, NODE_WIDTH } from "../../../pages/dma/erdEdit/canvas/erd-geometry";
import { ErdTableNode } from "../../../pages/dma/erdEdit/canvas/ErdTableNode";
import { buildFlow, type ErdFlowEdge, type ErdFlowNode } from "../../../pages/dma/erdEdit/canvas/erd-flow";
import { SHOW_MINIMAP_KEY, loadShowMiniMap, miniMapNodeColor, saveShowMiniMap } from "../../../pages/dma/erdEdit/canvas/erd-minimap";
import { SELF_REF_TEXT, hintText, useCanvasEditing, type CanvasEditing } from "../../../pages/dma/erdEdit/canvas/useCanvasEditing";
import { SplitDialog } from "../../../pages/dma/erdEdit/canvas/SplitDialog";
import type { ApplyOutcome, ErdEditContext } from "../../../pages/dma/erdEdit/edit-context";
import { RELEASED_TEXT } from "../../../pages/dma/erdEdit/state/permissions";
import type { ErdCommandJson } from "../../../pages/dma/erdEdit/types";
import { flush, settleGrid, typeInto } from "../../dme/helpers/render";
import { deny, fakeCtx, mcmState, notice, type FakeCtx } from "./erd-canvas-fixtures";
import { MENU_DIAGRAMS, bigState, column, menuModel, stateOf } from "./erd-fixtures";

const NODE_TYPES: NodeTypes = { erdTable: ErdTableNode };
const EDGE_TYPES: EdgeTypes = { erdRelation: ErdRelationEdge };
let host: HTMLDivElement;
let root: Root | null = null;
let editing: CanvasEditing;
let raw: ErdFlowNode[] = [];
let rfNow: ReactFlowInstance<ErdFlowNode, ErdFlowEdge>;
let storeNow: { getState(): ReactFlowState; setState(s: Partial<ReactFlowState>): void };

/** CanvasPane 과 같은 연결: buildFlow → decorateNodes → ReactFlow, flowProps 펼치기, host div 의 onKeyDown, toolbar·overlay. */
function Harness({ ctx, selected }: { ctx: ErdEditContext; selected: readonly string[] }) {
  const rf = useReactFlow<ErdFlowNode, ErdFlowEdge>();
  rfNow = rf;
  storeNow = useStoreApi() as unknown as typeof storeNow;
  const e = useCanvasEditing(ctx, rf);
  editing = e;
  const flow = useMemo(
    () => buildFlow({
      state: ctx.state, diagramId: ctx.diagramId, mode: "logical", preset: "basic", namesOnly: false, showAudit: ctx.audit.show,
      statuses: {}, domains: {}, selected: new Set(selected), mySession: ctx.session,
    }),
    [ctx.state, ctx.diagramId, ctx.session, ctx.audit.show, selected],
  );
  raw = flow.nodes;
  return h("div", { tabIndex: 0, "data-testid": "erd-host", onKeyDown: e.onKeyDown, style: { position: "relative", width: 1200, height: 800 } },
    e.toolbar,
    h(ReactFlow<ErdFlowNode, ErdFlowEdge>, {
      nodes: e.decorateNodes(flow.nodes), edges: flow.edges, nodeTypes: NODE_TYPES, edgeTypes: EDGE_TYPES,
      onNodesChange: e.onNodesChange, ...e.flowProps, fitView: false, defaultViewport: { x: 0, y: 0, zoom: 1 },
    }),
    e.overlay,
    // 관계선 시험용 표본: happy-dom 은 손잡이를 재지 못해 React Flow 가 선을 그리지 않는다. 같은 선 부품을 손잡이 점(자식 t-1 오른쪽, 부모 t-2 왼쪽,
    // 놓기 전 위치 0·400)으로 직접 그려 끄는 동안 부품이 두 노드의 덮개 위치로 변을 다시 정하는지 본다.
    probeEdge && h("svg", null, h(ProbeEdge)));
}

let probeEdge = false;
const PROBE_PROPS = {
  id: "probe", source: "t-1", target: "t-2", sourceX: 242, sourceY: 50, targetX: 398, targetY: 150, sourcePosition: "right", targetPosition: "left",
  data: { state: "CONFIRMED", folded: 0, zeroChild: false },
} as unknown as EdgeProps<ErdFlowEdge>;
const leftOfNode = (id: string) => (s: ReactFlowState): number => s.nodeLookup.get(id)?.internals.positionAbsolute.x ?? 0;
const srcLeftSel = leftOfNode("t-1");
const tgtLeftSel = leftOfNode("t-2");
/**
 * React Flow 는 끄는 동안 손잡이 id(모델이 정한 오른쪽·왼쪽)는 그대로 두고 손잡이 점 x 만 노드 위치에 맞춰 옮긴다. 같은 모양으로 props 를 만든다:
 * 자식 t-1 오른쪽 손잡이(왼쪽 x + 폭 + 2), 부모 t-2 왼쪽 손잡이(왼쪽 x - 2).
 */
function ProbeEdge() {
  const srcLeft = useStore(srcLeftSel);
  const tgtLeft = useStore(tgtLeftSel);
  return h(ErdRelationEdge, { ...PROBE_PROPS, sourceX: srcLeft + NODE_WIDTH + HANDLE_REACH, targetX: tgtLeft - HANDLE_REACH });
}
const sidesOf = (): string | null | undefined => host.querySelector('[data-testid="erd-rel-probe"]')?.getAttribute("data-sides");
/** 본선 path 의 시작 x(자식 끝)와 마지막 점 x(부모 끝). */
const lineEndsX = (): { start: number; end: number } => {
  const d = host.querySelector('[data-testid="erd-rel-probe"] .erd-rel__line')?.getAttribute("d") ?? "";
  const n = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  return { start: n[0], end: n[n.length - 2] };
};

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
  probeEdge = false;
  act(() => root?.unmount());
  root = null;
  host?.remove();
});

describe("캔버스 편집 — 표 복사·붙이기(c3)", () => {
  afterEach(() => clearClip());
  const mod = (k: string): KeyboardEventInit => ({ key: k, code: `Key${k.toUpperCase()}`, ctrlKey: !isMacPlatform(), metaKey: isMacPlatform() });

  it("Ctrl/⌘+C 는 고른 표를 복사하고, Ctrl/⌘+V 는 한 묶음으로 붙인다(마우스 없으면 원래 자리 + 간격)", async () => {
    const ctx = fakeCtx({ selectedTableId: "t-2" });
    await mount(ctx, ["t-2"]);
    await press(mod("c"));
    expect(readClip()).toMatchObject({ kind: "tables", tables: [{ id: "t-2" }] });
    expect(ctx.applied).toEqual([]);
    await press(mod("v"));
    expect(ctx.applied).toHaveLength(1);
    const { commands, label } = ctx.applied[0];
    expect(label).toBe("표 붙이기");
    expect(commands[0]).toMatchObject({ op: "addTable", phys: "TB_MCM_SEC_OBJ_COPY", logical: "오브젝트 복사", audit: false });
    expect(commands.at(-1)).toMatchObject({ op: "placeTables", diagram: "d-all", nodes: [{ x: 440, y: 40 }] });
  });

  it("고른 표가 없으면 복사하지 않고, 모델 편집 권한이 없으면 붙이지 않는다", async () => {
    const ctx = fakeCtx({ rights: { ...fakeCtx().rights, model: deny("확정된 버전이라 모델을 고칠 수 없습니다.") } });
    await mount(ctx);
    await press(mod("c"));
    expect(readClip()).toBeNull();
    writeClip(copyTables(ctx.state, "d-all", ["t-1"])!);
    await press(mod("v"));
    expect(ctx.applied).toEqual([]);
    expect(ctx.notify).toHaveBeenCalledWith("확정된 버전이라 모델을 고칠 수 없습니다.", "warn");
  });
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

  it("[자동 배치]는 변만 고른 선(§7.5, 점 없음)도 clearRoutes 에 넣어 자동 변으로 돌린다", async () => {
    const base = fakeCtx();
    const ctx = fakeCtx({
      state: { ...base.state, routes: { "d-all:r-1": { diagram: "d-all", relation: "r-1", points: [], childSide: "L" } } },
    });
    await mount(ctx);
    await click('[data-testid="erd-tool-layout"]');
    expect(ctx.applied[0].commands[1]).toEqual({ op: "clearRoutes", diagram: "d-all", relations: ["r-1"] });
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

  it("관계선 변은 놓기 전, 끄는 동안 덮개 위치로 다시 정해진다(마주 봄 → 같은 변 → 마주 봄)", async () => {
    probeEdge = true;
    const ctx = fakeCtx();
    await mount(ctx);
    // t-1 0, t-2 400 (빈 폭 160) — 손잡이 그대로 오른쪽 → 왼쪽
    expect(sidesOf()).toBe("rl");
    expect(lineEndsX()).toEqual({ start: 242, end: 398 }); // 자식 오른쪽 손잡이 · 부모 왼쪽 손잡이
    // 아직 놓지 않았다(저장 위치 400): 부모 t-2 를 x=20 으로 끄는 중 — 덮개만 바뀌어도 부모 끝이 오른쪽 변으로 접힌다
    await act(async () => {
      editing.onNodesChange([{ type: "position", id: "t-2", position: { x: 20, y: 150 }, dragging: true }]);
    });
    await flush();
    expect(ctx.applied).toEqual([]);
    expect(sidesOf()).toBe("rr");
    expect(lineEndsX()).toEqual({ start: 242, end: 20 + NODE_WIDTH + HANDLE_REACH }); // 둘 다 오른쪽 변
    // 좁은 틈(빈 폭 40, 예전 60 띠)도 마주 본다 — 꼬리는 줄어 선이 두 상자 사이에 든다
    await act(async () => {
      editing.onNodesChange([{ type: "position", id: "t-2", position: { x: NODE_WIDTH + 40, y: 150 }, dragging: true }]);
    });
    await flush();
    expect(sidesOf()).toBe("rl");
    expect(lineEndsX()).toEqual({ start: 242, end: NODE_WIDTH + 40 - HANDLE_REACH });
    // 다시 멀리 끌어도 마주 봄이다
    await act(async () => {
      editing.onNodesChange([{ type: "position", id: "t-2", position: { x: 310, y: 150 }, dragging: true }]);
    });
    await flush();
    expect(sidesOf()).toBe("rl");
    expect(lineEndsX()).toEqual({ start: 242, end: 308 });
    // 자식 t-1 을 부모 오른쪽으로 끌면 자식 왼쪽 · 부모 오른쪽
    await act(async () => {
      editing.onNodesChange([{ type: "position", id: "t-1", position: { x: 700, y: 0 }, dragging: true }]);
    });
    await flush();
    expect(sidesOf()).toBe("lr");
    expect(lineEndsX()).toEqual({ start: 700 - HANDLE_REACH, end: 310 + NODE_WIDTH + HANDLE_REACH });
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

/** 메뉴 표(t-1)에 감사 컬럼 둘(C_USR_ID·u_at)을 더한 상태. */
function withAudit() {
  const m = menuModel();
  m.tables["t-1"].columnOrder.push("c-a1", "c-a2");
  m.columns["c-a1"] = column("t-1", "C_USR_ID", "생성자");
  m.columns["c-a2"] = column("t-1", "u_at", "수정일시");
  return stateOf(m, MENU_DIAGRAMS);
}

describe("감사 컬럼 보기", () => {
  it("도구 막대 단추는 꺼진 채 시작하고(aria-pressed=false) 누르면 켜라고 알린다", async () => {
    const ctx = fakeCtx();
    await mount(ctx);
    const btn = document.querySelector('[data-testid="erd-audit-toggle"]')!;
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    await click('[data-testid="erd-audit-toggle"]');
    expect(ctx.audit.setShow).toHaveBeenCalledWith(true);
  });

  it("켜져 있으면 눌림 상태이고 끄라고 알린다", async () => {
    const ctx = fakeCtx({ audit: { show: true, setShow: vi.fn() } });
    await mount(ctx);
    expect(document.querySelector('[data-testid="erd-audit-toggle"]')?.getAttribute("aria-pressed")).toBe("true");
    await click('[data-testid="erd-audit-toggle"]');
    expect(ctx.audit.setShow).toHaveBeenCalledWith(false);
  });

  it("숨김: 노드 행에서 감사 컬럼을 빼고 머리에 「감사 n」 배지를 단다. 감사 컬럼이 없는 표에는 배지가 없다", async () => {
    await mount(fakeCtx({ state: withAudit() }));
    expect(host.querySelector('[data-testid="erd-col-c-1"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="erd-col-c-a1"]')).toBeNull();
    expect(host.querySelector('[data-testid="erd-col-c-a2"]')).toBeNull();
    expect(host.querySelector('[data-testid="erd-audit-badge-t-1"]')?.textContent).toBe("감사 2");
    expect(host.querySelector('[data-testid="erd-audit-badge-t-2"]')).toBeNull();
  });

  it("보기 켬: 감사 행이 보이고 배지는 사라진다", async () => {
    await mount(fakeCtx({ state: withAudit(), audit: { show: true, setShow: vi.fn() } }));
    expect(host.querySelector('[data-testid="erd-col-c-a1"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="erd-col-c-a2"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="erd-audit-badge-t-1"]')).toBeNull();
  });
});

/** 연결 끝 상태 흉내 — onConnectEnd 가 보는 fromNode·toNode 만 채운다. */
const connEnd = (from: string, to: string | null) =>
  ({ fromNode: { id: from }, toNode: to ? { id: to } : null } as unknown as FinalConnectionState);

describe("큰 모델 읽기 — 미니맵(U51)", () => {
  let saved: Map<string, string>;
  beforeEach(() => {
    saved = new Map();
    vi.stubGlobal("localStorage", { getItem: (k: string) => saved.get(k) ?? null, setItem: (k: string, v: string) => void saved.set(k, v) });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("저장값이 없으면 표 30개 다이어그램에서 켜져 있고, 토글하면 사라지며 \"0\" 을 저장한다", async () => {
    await mount(fakeCtx({ state: bigState(30, 2) }));
    const btn = document.querySelector('[data-testid="erd-tool-minimap"]')!;
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    expect(host.querySelector('[data-testid="erd-minimap"] .react-flow__minimap')).not.toBeNull();
    await click('[data-testid="erd-tool-minimap"]');
    expect(host.querySelector('[data-testid="erd-minimap"]')).toBeNull();
    expect(saved.get(SHOW_MINIMAP_KEY)).toBe("0");
    expect(document.querySelector('[data-testid="erd-tool-minimap"]')?.getAttribute("aria-pressed")).toBe("false");
  });

  it("저장소가 막히면 표 수로 정하고, 노드 색은 고른 표 > 위반 > 나머지", () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } });
    expect(loadShowMiniMap(30)).toBe(true);
    expect(loadShowMiniMap(29)).toBe(false);
    expect(() => saveShowMiniMap(true)).not.toThrow();
    const node = (selected: boolean, violations: number) => ({ id: "t", position: { x: 0, y: 0 }, selected, data: { violations } }) as unknown as ErdFlowNode;
    expect(miniMapNodeColor(node(true, 3))).toBe("var(--color-primary)");
    expect(miniMapNodeColor(node(false, 3))).toBe("var(--color-danger-soft)");
    expect(miniMapNodeColor(node(false, 0))).toBe("var(--color-bg-header)");
  });

  it("표 2개 다이어그램은 꺼진 채 시작하고, 저장값 \"1\" 이면 켜진다", async () => {
    await mount(fakeCtx());
    expect(host.querySelector('[data-testid="erd-minimap"]')).toBeNull();
    act(() => root?.unmount());
    saved.set(SHOW_MINIMAP_KEY, "1");
    await mount(fakeCtx());
    expect(host.querySelector('[data-testid="erd-minimap"]')).not.toBeNull();
  });
});

describe("큰 모델 읽기 — 단계별 그리기 DOM(U50)", () => {
  it(".react-flow 요소에 data-lod 와 --erd-zoom 을 쓰고, 배율이 바뀌면 고친다", async () => {
    await mount(fakeCtx());
    const rfEl = host.querySelector<HTMLElement>(".react-flow")!;
    expect(rfEl.dataset.lod).toBe("detail");
    expect(rfEl.style.getPropertyValue("--erd-zoom")).toBe("1");
    await act(async () => {
      storeNow.setState({ transform: [0, 0, 0.4] });
    });
    expect(rfEl.dataset.lod).toBe("names");
    expect(rfEl.style.getPropertyValue("--erd-zoom")).toBe("0.4");
    await act(async () => {
      storeNow.setState({ transform: [0, 0, 0.3] });
    });
    expect(rfEl.dataset.lod).toBe("overview");
    expect(rfEl.style.getPropertyValue("--erd-zoom")).toBe("0.3");
  });
});

describe("큰 모델 읽기 — Shift+1/2(U38)·자기 참조(U42)", () => {
  it("Shift+1 은 다이어그램 전체에 맞춘다(setViewport, 배율 상한 1)", async () => {
    await mount(fakeCtx());
    const spy = vi.spyOn(rfNow, "setViewport");
    await press({ key: "!", code: "Digit1", shiftKey: true });
    expect(spy).toHaveBeenCalledTimes(1);
    const [vp, opt] = spy.mock.calls[0];
    expect(vp.zoom).toBeLessThanOrEqual(1);
    expect(opt).toEqual({ duration: 200 });
  });

  it("Shift+2 는 고른 표가 없으면 \"표를 먼저 고르세요.\" 를 알리고, 있으면 그 표에 맞춘다", async () => {
    const none = fakeCtx();
    await mount(none);
    const spy = vi.spyOn(rfNow, "setViewport");
    await press({ key: "@", code: "Digit2", shiftKey: true });
    expect(none.notify).toHaveBeenCalledWith("표를 먼저 고르세요.", "info");
    expect(spy).not.toHaveBeenCalled();
    act(() => root?.unmount());
    const one = fakeCtx({ selectedTableId: "t-1" });
    await mount(one, ["t-1"]);
    const spy2 = vi.spyOn(rfNow, "setViewport");
    const bounds = vi.spyOn(rfNow, "getNodesBounds");
    await press({ key: "!", code: "Digit1", shiftKey: true });
    await press({ key: "@", code: "Digit2", shiftKey: true });
    expect(spy2).toHaveBeenCalledTimes(2);
    expect(bounds.mock.calls.map((c) => c[0])).toEqual([["t-1", "t-2"], ["t-1"]]);
    // 고른 표(t-1) 하나의 경계 상자에 맞춘 viewport 는 전체 맞춤과 다르다
    expect(spy2.mock.calls[1][0]).not.toEqual(spy2.mock.calls[0][0]);
    expect(one.notify).not.toHaveBeenCalledWith("표를 먼저 고르세요.", "info");
  });

  it("누르기 잇기로 같은 표를 두 번 누르면 자기 참조 경고, 다른 표면 관계를 보낸다", async () => {
    const ctx = fakeCtx();
    await mount(ctx);
    await press({ key: "4", code: "Digit4" });
    await click('[data-testid="erd-pick-t-1"]');
    await click('[data-testid="erd-pick-t-1"]');
    expect(ctx.notify).toHaveBeenCalledWith(SELF_REF_TEXT, "warn");
    expect(ctx.applied).toEqual([]);
    ctx.notify.mockClear();
    await click('[data-testid="erd-pick-t-2"]');
    await click('[data-testid="erd-pick-t-1"]');
    expect(ctx.notify).not.toHaveBeenCalledWith(SELF_REF_TEXT, "warn");
    expect(ctx.applied[0].commands[0]).toMatchObject({ op: "addRelation", parent: "t-2", child: "t-1" });
  });

  it("관계 도구에서 같은 표로 끝난 연결은 자기 참조 경고를 알린다. 다른 표·선택 도구면 알리지 않는다", async () => {
    const ctx = fakeCtx();
    await mount(ctx);
    const end = (from: string, to: string) => act(() => editing.flowProps.onConnectEnd!(new MouseEvent("mouseup"), connEnd(from, to)));
    end("t-1", "t-1");
    expect(ctx.notify).not.toHaveBeenCalledWith(SELF_REF_TEXT, "warn"); // 선택 도구
    await press({ key: "4", code: "Digit4" });
    end("t-2", "t-1");
    expect(ctx.notify).not.toHaveBeenCalledWith(SELF_REF_TEXT, "warn");
    end("t-1", "t-1");
    expect(ctx.notify).toHaveBeenCalledWith(SELF_REF_TEXT, "warn");
    expect(SELF_REF_TEXT).toBe("같은 표 안의 관계(자기 참조)는 아직 화면에서 그릴 수 없습니다. Claude 나 CLI 의 addRelation 으로 만드세요.");
  });

  it("같은 표에서 몇 px 만 움직인 끌기(누르기 흔들림)는 알리지 않는다", async () => {
    const ctx = fakeCtx();
    await mount(ctx);
    await press({ key: "4", code: "Digit4" });
    // onConnectStart/End 는 안내 줄 상태(U41)를 바꾸므로 act 안에서 부른다.
    act(() => {
      editing.flowProps.onConnectStart!(new MouseEvent("mousemove", { clientX: 100, clientY: 100 }), { nodeId: "t-1", handleId: "pick", handleType: "source" });
      editing.flowProps.onConnectEnd!(new MouseEvent("mouseup", { clientX: 102, clientY: 101 }), connEnd("t-1", "t-1"));
    });
    expect(ctx.notify).not.toHaveBeenCalledWith(SELF_REF_TEXT, "warn");
    act(() => {
      editing.flowProps.onConnectStart!(new MouseEvent("mousemove", { clientX: 100, clientY: 100 }), { nodeId: "t-1", handleId: "pick", handleType: "source" });
      editing.flowProps.onConnectEnd!(new MouseEvent("mouseup", { clientX: 140, clientY: 130 }), connEnd("t-1", "t-1"));
    });
    expect(ctx.notify).toHaveBeenCalledWith(SELF_REF_TEXT, "warn");
  });
});

describe("주제별로 나누기(U52)", () => {
  const dlg = () => document.querySelector<HTMLElement>('[data-testid="erd-split-dialog"]');
  const okButton = () => document.querySelector<HTMLButtonElement>('[data-testid="erd-split-ok"]')!;
  const splitButton = () => document.querySelector<HTMLButtonElement>('[data-testid="erd-tool-split"]')!;
  const mcm = (over: Parameters<typeof fakeCtx>[0] = {}) => fakeCtx({ state: mcmState(), modelId: "mcm", diagramId: "d-all", ...over });
  const group = (key: string) => document.querySelector(`[data-testid="${CSS.escape("erd-split-group-" + key).replace(/\\/g, "")}"]`);
  async function openDialog() {
    await click('[data-testid="erd-tool-split"]');
    await settleGrid(dlg()!);
  }

  it("도구 막대 [주제별 나누기] — 창을 열고 묶음 목록(이름·표 수·앞 표)을 보인다", async () => {
    await mount(mcm());
    expect(dlg()).toBeNull();
    expect(splitButton().parentElement?.getAttribute("data-tip")).toBe("주제별로 나누기 — 표 이름별 작은 다이어그램");
    await openDialog();
    expect(dlg()).not.toBeNull();
    expect(document.querySelector<HTMLInputElement>('[data-testid="erd-split-area"]')!.value).toBe("주제별");
    for (const name of ["JOB 1", "JOB 2", "SEC", "기타"]) expect(document.querySelector(`[data-testid="erd-split-group-${name}"]`)).not.toBeNull();
    expect(document.querySelector('[data-testid="erd-split-count"]')?.textContent).toBe("고른 묶음 4개 · 표 57개");
    expect(dlg()!.textContent).toContain("TB_MCM_JOB_A01, TB_MCM_JOB_A02, TB_MCM_JOB_A03");
    // 만들 수 있는 묶음은 처음부터 모두 체크
    expect([...dlg()!.querySelectorAll<HTMLInputElement>('[data-testid^="erd-split-group-"] input')].map((i) => i.checked)).toEqual([true, true, true, true]);
    expect(okButton().disabled).toBe(false);
  });

  it("[만들기] — 묶음마다 addDiagram 이 한 묶음으로 가고, 끝나면 창이 닫히고 첫 새 다이어그램으로 간다", async () => {
    const ctx = mcm();
    await mount(ctx);
    await openDialog();
    await click('[data-testid="erd-split-ok"]');
    expect(ctx.applied).toHaveLength(1);
    expect(ctx.applied[0].label).toBe("주제별로 나누기");
    const cmds = ctx.applied[0].commands;
    const adds = cmds.filter((c) => c.op === "addDiagram");
    expect(adds.map((c) => [c.diagramName, c.areaName])).toEqual([["JOB 1", "주제별"], ["JOB 2", "주제별"], ["SEC", "주제별"], ["기타", "주제별"]]);
    expect(adds.map((c) => c.sortSeq)).toEqual([1, 2, 3, 4]);
    expect(cmds.filter((c) => c.op === "placeTables")).toHaveLength(4);
    expect(ctx.nav.selectDiagram).toHaveBeenCalledTimes(1);
    expect(ctx.nav.selectDiagram).toHaveBeenCalledWith(adds[0].id);
    expect(ctx.notify).toHaveBeenCalledWith("다이어그램 4개를 만들었습니다.", "info");
    await flush();
    expect(document.querySelector('[data-modal-content="true"]')?.getAttribute("style")).toContain("opacity: 0"); // 닫힘 전환 중
  });

  it("업무영역에 같은 이름이 이미 있으면 그 묶음은 \"이미 있음\"이고 만들지 않는다", async () => {
    const base = mcmState();
    const state = { ...base, diagrams: { ...base.diagrams, "d-sec": { id: "d-sec", areaName: "주제별", diagramName: "SEC", sortSeq: 1 } } };
    const ctx = mcm({ state });
    await mount(ctx);
    await openDialog();
    expect(group("SEC")!.closest(".ag-row")?.textContent).toContain("이미 있음");
    expect(document.querySelector('[data-testid="erd-split-count"]')?.textContent).toBe("고른 묶음 3개 · 표 42개");
    await click('[data-testid="erd-split-ok"]');
    expect(ctx.applied[0].commands.filter((c) => c.op === "addDiagram").map((c) => c.diagramName)).toEqual(["JOB 1", "JOB 2", "기타"]);
    expect(ctx.applied[0].commands.filter((c) => c.op === "addDiagram").map((c) => c.sortSeq)).toEqual([2, 3, 4]);
  });

  it("체크를 끈 묶음은 만들지 않는다", async () => {
    const ctx = mcm();
    await mount(ctx);
    await openDialog();
    const box = group("기타")!.querySelector<HTMLInputElement>("input")!;
    await act(async () => box.click());
    await flush();
    expect(document.querySelector('[data-testid="erd-split-count"]')?.textContent).toBe("고른 묶음 3개 · 표 40개");
    await click('[data-testid="erd-split-ok"]');
    expect(ctx.applied[0].commands.filter((c) => c.op === "addDiagram").map((c) => c.diagramName)).toEqual(["JOB 1", "JOB 2", "SEC"]);
  });

  it("업무영역을 고치면 그 이름으로 만든다. 비우면 [만들기]가 꺼진다", async () => {
    const ctx = mcm();
    await mount(ctx);
    await openDialog();
    const area = document.querySelector<HTMLInputElement>('[data-testid="erd-split-area"]')!;
    await typeInto(area, "");
    expect(okButton().disabled).toBe(true);
    expect(document.querySelector('[data-testid="erd-split-ok-tip"]')?.getAttribute("title")).toBe("업무영역을 넣으세요");
    await typeInto(area, "읽기용");
    expect(okButton().disabled).toBe(false);
    await click('[data-testid="erd-split-ok"]');
    expect(ctx.applied[0].commands.find((c) => c.op === "addDiagram")).toMatchObject({ areaName: "읽기용" });
  });

  it("다이어그램 권한이 없으면 도구 막대 단추와 [만들기]가 꺼지고 이유를 짧게 보인다", async () => {
    const ctx = mcm({ rights: { ...fakeCtx().rights, diagram: deny(RELEASED_TEXT) } });
    await mount(ctx);
    expect(splitButton().disabled).toBe(true);
    expect(splitButton().parentElement?.getAttribute("data-tip")).toBe("주제별로 나누기 — 확정된 버전");
    // 메뉴로 열려 해도 알리고 열지 않는다
    await act(async () => {
      editing.flowProps.onPaneContextMenu!(new MouseEvent("contextmenu", { clientX: 10, clientY: 10 }) as unknown as React.MouseEvent);
    });
    await flush();
    expect(document.querySelector<HTMLButtonElement>('[data-testid="erd-menu-item-split"]')?.disabled).toBe(true);
    expect(dlg()).toBeNull();
    expect(ctx.applied).toEqual([]);
  });

  it("창 자체도 권한이 없으면 [만들기]가 꺼지고 짧은 이유를 단다(보내지 않는다)", async () => {
    const apply = vi.fn();
    const onClose = vi.fn();
    const node = (right: { ok: boolean; reason: string | null }) => h(SplitDialog, {
      state: mcmState(), right, showAudit: false, getAspect: () => 1.6, apply, onClose, onCreated: vi.fn(),
    });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(h(DmesUiProvider, null, node({ ok: false, reason: RELEASED_TEXT })));
    });
    await settleGrid(dlg()!);
    expect(okButton().disabled).toBe(true);
    expect(document.querySelector('[data-testid="erd-split-ok-tip"]')?.getAttribute("title")).toBe("확정된 버전");
    await click('[data-testid="erd-split-ok"]');
    expect(apply).not.toHaveBeenCalled();
    // 권한이 생기면 같은 창에서 켜진다
    await act(async () => {
      root!.render(h(DmesUiProvider, null, node({ ok: true, reason: null })));
    });
    expect(okButton().disabled).toBe(false);
    expect(document.querySelector('[data-testid="erd-split-ok-tip"]')?.getAttribute("title")).toBeNull();
  });

  it("빈 곳 메뉴의 [주제별로 나누기…] 항목이 창을 연다", async () => {
    await mount(mcm());
    await act(async () => {
      editing.flowProps.onPaneContextMenu!(new MouseEvent("contextmenu", { clientX: 10, clientY: 10 }) as unknown as React.MouseEvent);
    });
    await flush();
    const item = document.querySelector<HTMLElement>('[data-testid="erd-menu-item-split"]')!;
    expect(item.textContent).toBe("주제별로 나누기…");
    await click('[data-testid="erd-menu-item-split"]');
    await settleGrid(dlg()!);
    expect(dlg()).not.toBeNull();
  });

  it("앞 묶음은 만들어졌는데 거절되면 멈추고 몇 개까지 만들었는지 창에 적는다(닫지 않고 이동도 안 함)", async () => {
    // 묶음 수가 많아 명령이 두 배열로 나뉘는 모델(표 600개 = 5개씩 120묶음 + 기존 묶음)
    const base = mcmState();
    const model = { ...base.model, tables: { ...base.model.tables } };
    for (let i = 0; i < 120 * 5; i++) model.tables[`t-q${i}`] = { ...base.model.tables["t-x01"], phys: `TB_MCM_Q${String(Math.floor(i / 5)).padStart(3, "0")}_${i}` };
    const big = fakeCtx({ state: { ...base, model }, modelId: "mcm", diagramId: "d-all" });
    big.outcomes.push({ ok: true, rev: 4, warnings: [] }, { ok: false, notice: notice({ message: "거절" }) });
    await mount(big);
    await openDialog();
    await click('[data-testid="erd-split-ok"]');
    expect(big.applied.length).toBe(2);
    expect(document.querySelector('[data-testid="erd-split-error"]')?.textContent).toMatch(/^\d+개 만들었습니다\./);
    expect(dlg()).not.toBeNull();
    expect(big.nav.selectDiagram).not.toHaveBeenCalled();
  });
});

describe("도구 막대 글자 단추·표 메뉴·안내 줄(U41·U43·U44)", () => {
  const btn = (id: string) => document.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`)!;
  const hint = () => document.querySelector('[data-testid="erd-tool-hint"]')?.textContent ?? null;
  const ASK = "부모 표에서 자식 표로 끌거나, 부모 표 → 자식 표 순서로 누르세요 · Esc 취소";
  const CHILD = "자식 표를 누르세요 · Esc 취소";

  async function nodeMenu(index: number) {
    await act(async () => {
      editing.flowProps.onNodeContextMenu!(new MouseEvent("contextmenu", { clientX: 10, clientY: 10 }) as unknown as React.MouseEvent, raw[index]);
    });
    await flush();
  }
  async function nodeClick(index: number) {
    await act(async () => {
      editing.flowProps.onNodeClick!(new MouseEvent("click") as unknown as React.MouseEvent, raw[index]);
    });
    await flush();
  }

  it("hintText — 표 도구·관계 도구 시작 전(식별이면 앞에 \"식별 관계:\")·시작 뒤, 선택 도구는 없음", () => {
    expect(hintText("table", false)).toBe("표를 놓을 빈 곳을 누르세요 · Esc 취소");
    expect(hintText("relation", false)).toBe(ASK);
    expect(hintText("identifying", false)).toBe(`식별 관계: ${ASK}`);
    expect(hintText("relation", true)).toBe(CHILD);
    expect(hintText("identifying", true)).toBe(CHILD);
    expect(hintText("select", false)).toBeNull();
  });

  it("[컬럼 추가]·[PK 추가] — 고른 표 하나에 nav.startColumnAdd(표, pk)", async () => {
    const ctx = fakeCtx({ selectedTableId: "t-1" });
    await mount(ctx, ["t-1"]);
    expect(btn("erd-tool-addcol").disabled).toBe(false);
    expect(btn("erd-tool-addcol").parentElement?.getAttribute("title")).toBeNull();
    // 켜진 글자 단추는 단추 자체 title 로 할 일(과 단축키)을 알리고, 이유 글·aria-describedby 는 없다
    expect(btn("erd-tool-addcol").getAttribute("title")).toBe("컬럼 추가");
    expect(btn("erd-tool-table").getAttribute("title")).toBe("표 추가 (2)");
    expect(btn("erd-tool-relmenu").getAttribute("title")).toBe("관계 추가 (4·5)");
    expect(btn("erd-tool-addcol").getAttribute("aria-describedby")).toBeNull();
    expect(document.querySelector('[data-testid="erd-tool-addcol-reason"]')).toBeNull();
    await click('[data-testid="erd-tool-addcol"]');
    expect(ctx.nav.startColumnAdd).toHaveBeenCalledWith("t-1", false);
    await click('[data-testid="erd-tool-addpk"]');
    expect(ctx.nav.startColumnAdd).toHaveBeenLastCalledWith("t-1", true);
  });

  it("표를 둘 고르면 [PK 추가]만 꺼지고, 안 고르면 둘 다 꺼진다", async () => {
    const ctx = fakeCtx();
    await mount(ctx, ["t-1", "t-2"]);
    expect(btn("erd-tool-addcol").disabled).toBe(false);
    expect(btn("erd-tool-addcol").getAttribute("title")).toBe("컬럼 추가 — 고른 표 2개에 같은 컬럼");
    expect(btn("erd-tool-addpk").disabled).toBe(true);
    expect(btn("erd-tool-addpk").parentElement?.getAttribute("title")).toBe("PK 추가 — 표를 하나만 고르세요");
    // 꺼진 단추: 보이지 않는 이유 글을 aria-describedby 로 가리키고, 단추 자체 title 은 없다
    const reason = document.querySelector<HTMLElement>('[data-testid="erd-tool-addpk-reason"]')!;
    expect(reason.textContent).toBe("PK 추가 — 표를 하나만 고르세요");
    expect(reason.id).not.toBe("");
    expect(btn("erd-tool-addpk").getAttribute("aria-describedby")).toBe(reason.id);
    expect(btn("erd-tool-addpk").getAttribute("title")).toBeNull();
    act(() => root?.unmount());
    await mount(fakeCtx());
    expect(btn("erd-tool-addcol").disabled).toBe(true);
    expect(btn("erd-tool-addpk").disabled).toBe(true);
    expect(btn("erd-tool-addpk").parentElement?.getAttribute("title")).toBe("PK 추가 — 표를 먼저 고르세요");
  });

  it("꺼진 단추 이유는 짧은 이유(U19) — 글자 단추 title·아이콘 단추 툴팁", async () => {
    await mount(fakeCtx({ rights: { ...fakeCtx().rights, model: deny(RELEASED_TEXT) } }), ["t-1"]);
    expect(btn("erd-tool-table").disabled).toBe(true);
    expect(btn("erd-tool-table").parentElement?.getAttribute("title")).toBe("표 추가 (2) — 확정된 버전");
    expect(btn("erd-tool-relmenu").parentElement?.getAttribute("title")).toBe("관계 추가 (4·5) — 확정된 버전");
    expect(btn("erd-tool-addcol").parentElement?.getAttribute("title")).toBe("컬럼 추가 — 확정된 버전");
    expect(btn("erd-tool-relation").parentElement?.getAttribute("data-tip")).toBe("비식별 관계 (4) — 확정된 버전");
    expect(btn("erd-tool-delete").parentElement?.getAttribute("data-tip")).toMatch(/^모델에서 삭제 \(.+\) — 확정된 버전$/);
  });

  it("[관계 ▾] — 메뉴에서 \"식별 관계 (5)\"를 고르면 식별 도구가 되고 안내 줄이 뜬다. Esc 로 사라진다", async () => {
    await mount(fakeCtx());
    expect(hint()).toBeNull();
    await click('[data-testid="erd-tool-relmenu"]');
    expect(document.querySelector('[data-testid="erd-relmenu-item-relation"]')?.textContent).toBe("비식별 관계 (4)");
    expect(document.querySelector('[data-testid="erd-relmenu-item-identifying"]')?.textContent).toBe("식별 관계 (5)");
    await click('[data-testid="erd-relmenu-item-identifying"]');
    expect(document.querySelector('[data-testid="erd-relmenu"]')).toBeNull();
    expect(btn("erd-tool-identifying").getAttribute("aria-pressed")).toBe("true");
    expect(hint()).toBe(`식별 관계: ${ASK}`);
    expect(document.querySelector('[data-testid="erd-tool-hint"]')?.getAttribute("role")).toBe("status");
    await press({ key: "Escape", code: "Escape" });
    expect(hint()).toBeNull();
  });

  it("안내 줄 — 표 도구 글, 끌기 시작 뒤 \"자식 표를 누르세요\", 연결이 끝나면 처음 글", async () => {
    await mount(fakeCtx());
    await press({ key: "2", code: "Digit2" });
    expect(hint()).toBe("표를 놓을 빈 곳을 누르세요 · Esc 취소");
    await press({ key: "4", code: "Digit4" });
    expect(hint()).toBe(ASK);
    const before = { flowProps: editing.flowProps, decorate: editing.decorateNodes, overlay: editing.overlay };
    await act(async () => {
      editing.flowProps.onConnectStart!(new MouseEvent("mousedown", { clientX: 10, clientY: 10 }), { nodeId: "t-2", handleId: "pick", handleType: "source" });
    });
    expect(hint()).toBe(CHILD);
    // 시작 상태는 막대만 바꾼다 — 노드 props·꾸밈·창 overlay 는 같은 참조(Local-Rules §19)
    expect(editing.flowProps).toBe(before.flowProps);
    expect(editing.decorateNodes).toBe(before.decorate);
    expect(editing.overlay).toBe(before.overlay);
    await act(async () => {
      editing.flowProps.onConnectEnd!(new MouseEvent("mouseup", { clientX: 300, clientY: 10 }), connEnd("t-2", null));
    });
    expect(hint()).toBe(ASK);
  });

  it("표 메뉴 — 표 하나면 맨 앞에 컬럼 추가·PK 컬럼 추가·관계 시작, [PK 컬럼 추가]는 startColumnAdd(표, true)", async () => {
    const ctx = fakeCtx();
    await mount(ctx);
    await nodeMenu(0);
    const ids = [...document.querySelectorAll('[data-testid^="erd-menu-item-"]')].map((el) => el.getAttribute("data-testid")!.slice("erd-menu-item-".length));
    expect(ids.slice(0, 5)).toEqual(["addcol", "addpk", "rel-start", "rel-start-n", "rel-start-i"]);
    expect(document.querySelector('[data-testid="erd-menu-item-rel-start"]')?.textContent).toBe("관계 시작");
    await click('[data-testid="erd-menu-item-addpk"]');
    expect(ctx.nav.startColumnAdd).toHaveBeenCalledWith("t-1", true);
    await nodeMenu(1);
    await click('[data-testid="erd-menu-item-addcol"]');
    expect(ctx.nav.startColumnAdd).toHaveBeenLastCalledWith("t-2", false);
  });

  it("표 메뉴 — 표 둘이면 컬럼·관계 항목이 없고, 모델 권한이 없으면 꺼지고 title 은 짧은 이유", async () => {
    await mount(fakeCtx(), ["t-1", "t-2"]);
    await nodeMenu(0);
    expect(document.querySelector('[data-testid="erd-menu-item-addcol"]')).toBeNull();
    expect(document.querySelector('[data-testid="erd-menu-item-rel-start"]')).toBeNull();
    act(() => root?.unmount());
    await mount(fakeCtx({ rights: { ...fakeCtx().rights, model: deny(RELEASED_TEXT) } }));
    await nodeMenu(0);
    for (const id of ["addcol", "addpk", "rel-start-n", "rel-start-i", "delete"]) {
      const item = document.querySelector<HTMLButtonElement>(`[data-testid="erd-menu-item-${id}"]`)!;
      expect(item.disabled).toBe(true);
      expect(item.getAttribute("title")).toBe("확정된 버전");
    }
  });

  it("[관계 시작 ▸ 비식별] 뒤 같은 표를 누르면 자기 참조 경고 후 기다리고, 다른 표를 누르면 addRelation(부모 = 메뉴 표)", async () => {
    const ctx = fakeCtx();
    await mount(ctx);
    await nodeMenu(0);
    await click('[data-testid="erd-menu-item-rel-start-n"]');
    expect(btn("erd-tool-relation").getAttribute("aria-pressed")).toBe("true");
    expect(hint()).toBe(CHILD);
    await nodeClick(0);
    expect(ctx.notify).toHaveBeenCalledWith(SELF_REF_TEXT, "warn");
    expect(ctx.applied).toEqual([]);
    expect(hint()).toBe(CHILD);
    await nodeClick(1);
    expect(ctx.applied).toHaveLength(1);
    expect(ctx.applied[0].commands[0]).toMatchObject({ op: "addRelation", parent: "t-1", child: "t-2", identifying: false, onNameClash: "ASK" });
    expect(ctx.applied[0].label).toBe("비식별 관계 추가");
    expect(btn("erd-tool-select").getAttribute("aria-pressed")).toBe("true");
    expect(hint()).toBeNull();
  });

  it("앞 관계 요청이 가는 중에 [관계 시작] 뒤 표를 눌러도 시작 표를 지우지 않고 기다린다 — 요청이 끝난 뒤 누르면 보낸다", async () => {
    let finish: (o: ApplyOutcome) => void = () => {};
    const calls: ErdCommandJson[][] = [];
    let first = true;
    const apply = vi.fn(async (commands: ErdCommandJson[]): Promise<ApplyOutcome> => {
      calls.push(commands);
      if (!first) return { ok: true, rev: 5, warnings: [] };
      first = false;
      return new Promise<ApplyOutcome>((resolve) => { finish = resolve; });
    });
    await mount(fakeCtx({ apply }));
    await nodeMenu(0);
    await click('[data-testid="erd-menu-item-rel-start-n"]');
    await nodeClick(1);
    expect(calls).toHaveLength(1);
    // 첫 요청이 아직 가는 중 — t-2 를 부모로 다시 시작하고 t-1 을 누른다
    await nodeMenu(1);
    await click('[data-testid="erd-menu-item-rel-start-n"]');
    expect(hint()).toBe(CHILD);
    await nodeClick(0);
    expect(calls).toHaveLength(1);
    expect(hint()).toBe(CHILD);
    // 첫 요청이 거절로 끝나면 관계 도구가 남고, 기다리던 시작 표로 다시 누르면 보낸다
    await act(async () => finish({ ok: false, notice: notice({ message: "거절" }) }));
    await flush();
    expect(hint()).toBe(CHILD);
    await nodeClick(0);
    expect(calls).toHaveLength(2);
    expect(calls[1][0]).toMatchObject({ op: "addRelation", parent: "t-2", child: "t-1" });
  });

  it("[관계 시작 ▸ 식별] 뒤 표 손잡이를 누르면(누르기 잇기와 겹침) 관계를 한 번만 보낸다", async () => {
    const ctx = fakeCtx();
    await mount(ctx);
    await nodeMenu(0);
    await click('[data-testid="erd-menu-item-rel-start-i"]');
    await click('[data-testid="erd-pick-t-1"]');
    expect(ctx.notify).toHaveBeenCalledWith(SELF_REF_TEXT, "warn");
    expect(storeNow.getState().connectionClickStartHandle).toBeNull();
    await click('[data-testid="erd-pick-t-2"]');
    expect(ctx.applied).toHaveLength(1);
    expect(ctx.applied[0].commands[0]).toMatchObject({ op: "addRelation", parent: "t-1", child: "t-2", identifying: true });
    expect(storeNow.getState().connectionClickStartHandle).toBeNull();
  });

  it("누르기 잇기를 시작한 뒤 1 로 도구를 바꾸면 그 시작도 버린다 — 다시 4 뒤 다른 표를 눌러도 보내지 않는다", async () => {
    const ctx = fakeCtx();
    await mount(ctx);
    await press({ key: "4", code: "Digit4" });
    await click('[data-testid="erd-pick-t-1"]');
    expect(hint()).toBe(CHILD);
    await press({ key: "1", code: "Digit1" });
    await press({ key: "4", code: "Digit4" });
    expect(hint()).toBe(ASK);
    expect(storeNow.getState().connectionClickStartHandle).toBeNull();
    await click('[data-testid="erd-pick-t-2"]');
    expect(ctx.applied).toEqual([]);
  });

  it("[관계 시작] 뒤 Esc 는 부모 표를 버리고 선택 도구로 — 그 뒤 표 누르기는 보내지 않는다", async () => {
    const ctx = fakeCtx();
    await mount(ctx);
    await nodeMenu(0);
    await click('[data-testid="erd-menu-item-rel-start-n"]');
    await press({ key: "Escape", code: "Escape" });
    expect(btn("erd-tool-select").getAttribute("aria-pressed")).toBe("true");
    expect(hint()).toBeNull();
    await nodeClick(1);
    expect(ctx.applied).toEqual([]);
  });
});
