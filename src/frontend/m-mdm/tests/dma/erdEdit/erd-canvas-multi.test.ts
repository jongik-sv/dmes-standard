/** @vitest-environment happy-dom */
// 여러 표 동시 처리(UX 1.5) — 캔버스 연결: 정렬(U58-U60), Ctrl/⌘+A(U67), 툴팁 개수(U68), 이미 되는 일괄 동작(U56), 넣기·같은 컬럼(Task 3).
import { act, createElement as h, useMemo } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ReactFlow, ReactFlowProvider, isMacPlatform, useReactFlow, type NodeChange, type NodeTypes,
} from "@dk-oasis/shared/react-flow";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import { previewName } from "../../../pages/dma/erdEdit/api";
import { MAX_BATCH } from "../../../pages/dma/erdEdit/canvas/erd-commands";
import { ErdTableNode } from "../../../pages/dma/erdEdit/canvas/ErdTableNode";
import { buildFlow, type ErdFlowEdge, type ErdFlowNode } from "../../../pages/dma/erdEdit/canvas/erd-flow";
import { useCanvasEditing, type CanvasEditing } from "../../../pages/dma/erdEdit/canvas/useCanvasEditing";
import type { ErdEditContext } from "../../../pages/dma/erdEdit/edit-context";
import { RELEASED_TEXT } from "../../../pages/dma/erdEdit/state/permissions";
import type { ErdState } from "../../../pages/dma/erdEdit/types";
import { flush, typeInto } from "../../dme/helpers/render";
import { deny, fakeCtx, type FakeCtx } from "./erd-canvas-fixtures";
import { MENU_DIAGRAMS, bigState, menuModel, stateOf } from "./erd-fixtures";
import { previewOf } from "./grid-fixtures";

vi.mock("../../../pages/dma/erdEdit/api", async (orig) => ({ ...(await orig<object>()), previewName: vi.fn() }));

const preview = vi.mocked(previewName);
const NODE_TYPES: NodeTypes = { erdTable: ErdTableNode };
let host: HTMLDivElement;
let root: Root | null = null;
let editing: CanvasEditing;
let raw: ErdFlowNode[] = [];
/** React Flow 가 보낸 select 변경(하네스는 선택을 props 로만 준다 — Ctrl/⌘+A 결과는 여기서 본다). */
let picks: { id: string; selected: boolean }[] = [];

function Harness({ ctx, selected }: { ctx: ErdEditContext; selected: readonly string[] }) {
  const rf = useReactFlow<ErdFlowNode, ErdFlowEdge>();
  const e = useCanvasEditing(ctx, rf);
  editing = e;
  const flow = useMemo(() => buildFlow({
    state: ctx.state, diagramId: ctx.diagramId, mode: "logical", preset: "basic", namesOnly: false, showAudit: ctx.audit.show,
    statuses: {}, domains: {}, selected: new Set(selected), mySession: ctx.session,
  }), [ctx.state, ctx.diagramId, ctx.session, ctx.audit.show, selected]);
  raw = flow.nodes;
  const onNodesChange = (changes: NodeChange<ErdFlowNode>[]) => {
    for (const c of changes) if (c.type === "select") picks.push({ id: c.id, selected: c.selected });
    e.onNodesChange(changes);
  };
  return h("div", { tabIndex: 0, "data-testid": "erd-host", onKeyDown: e.onKeyDown, style: { position: "relative", width: 1200, height: 800 } },
    e.toolbar,
    h(ReactFlow<ErdFlowNode, ErdFlowEdge>, {
      nodes: e.decorateNodes(flow.nodes), edges: flow.edges, nodeTypes: NODE_TYPES, onNodesChange, ...e.flowProps,
      fitView: false, defaultViewport: { x: 0, y: 0, zoom: 1 },
    }),
    e.overlay);
}

async function mount(ctx: FakeCtx, selected: readonly string[] = []) {
  picks = [];
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
const btn = (id: string) => document.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`)!;
const MOD = (): KeyboardEventInit => (isMacPlatform() ? { metaKey: true } : { ctrlKey: true });
/** bigState(3) = d-all 에 t-0·t-1·t-2 가 (0,0)(280,0)(560,0). */
const three = (over: Partial<ErdEditContext> = {}) => fakeCtx({ state: bigState(3, 2), ...over });
async function nodeMenu(index: number) {
  await act(async () => {
    editing.flowProps.onNodeContextMenu!(new MouseEvent("contextmenu", { clientX: 10, clientY: 10 }) as unknown as React.MouseEvent, raw[index]);
  });
  await flush();
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
});

describe("정렬(U58-U60)", () => {
  it("[정렬 ▾] 왼쪽 맞춤 — moveNodes 한 건, 안 바뀐 표는 뺌, 라벨에 표 수", async () => {
    const s = bigState(3, 2);
    s.nodes["d-all:t-1"] = { ...s.nodes["d-all:t-1"], y: 40 };
    const ctx = fakeCtx({ state: s });
    await mount(ctx, ["t-0", "t-1", "t-2"]);
    await click('[data-testid="erd-tool-align"]');
    await click('[data-testid="erd-alignmenu-item-align-left"]');
    expect(ctx.applied).toEqual([{
      commands: [{ op: "moveNodes", diagram: "d-all", nodes: [{ table: "t-1", x: 0, y: 40 }, { table: "t-2", x: 0, y: 0 }] }],
      label: "왼쪽 맞춤(표 3개)",
    }]);
  });

  it("alignUsesNodeHeights — 중간 맞춤은 표마다 높이(잰 값이 없으면 initialHeight)를 쓴다", async () => {
    // menuModel: t-1 컬럼 3개, t-2 컬럼 1개 → 높이가 다르다. (0,0)·(400,0)
    const ctx = fakeCtx();
    await mount(ctx, ["t-1", "t-2"]);
    const h1 = raw.find((n) => n.id === "t-1")!.initialHeight!;
    const h2 = raw.find((n) => n.id === "t-2")!.initialHeight!;
    expect(h1).toBeGreaterThan(h2);
    await click('[data-testid="erd-tool-align"]');
    await click('[data-testid="erd-alignmenu-item-align-vcenter"]');
    expect(ctx.applied[0].commands).toEqual([{ op: "moveNodes", diagram: "d-all", nodes: [{ table: "t-2", x: 400, y: Math.round((h1 - h2) / 2) }] }]);
  });

  it("모두 그대로면 보내지 않고 알림, 간격은 3개 미만이면 메뉴 항목이 꺼짐", async () => {
    const ctx = fakeCtx();
    await mount(ctx, ["t-1", "t-2"]); // 둘 다 y 0
    await click('[data-testid="erd-tool-align"]');
    expect(btn("erd-alignmenu-item-dist-x").disabled).toBe(true);
    expect(btn("erd-alignmenu-item-dist-x").getAttribute("title")).toBe("표를 3개 이상 고르세요");
    await click('[data-testid="erd-alignmenu-item-align-top"]');
    expect(ctx.applied).toEqual([]);
    expect(ctx.notify).toHaveBeenCalledWith("이미 맞춰져 있습니다.", "info");
  });

  it("[정렬 ▾] 은 고른 표 2개 미만이면 꺼지고 이유", async () => {
    await mount(three(), ["t-0"]);
    expect(btn("erd-tool-align").disabled).toBe(true);
    expect(btn("erd-tool-align").parentElement?.getAttribute("title")).toBe("정렬 — 표를 2개 이상 고르세요");
  });

  it("표 메뉴(여러 개) — 정렬 묶음의 가로 간격 같게", async () => {
    const s = bigState(3, 2);
    s.nodes["d-all:t-2"] = { ...s.nodes["d-all:t-2"], x: 900 };
    const ctx = fakeCtx({ state: s });
    await mount(ctx, ["t-0", "t-1", "t-2"]);
    await nodeMenu(0);
    expect(document.querySelector('[data-testid="erd-menu-item-align"]')?.textContent).toContain("정렬");
    await click('[data-testid="erd-menu-item-dist-x"]');
    const cmd = ctx.applied[0].commands[0] as { op: string; nodes: { table: string; x: number }[] };
    expect(cmd.op).toBe("moveNodes");
    expect(cmd.nodes).toEqual([{ table: "t-1", x: 450, y: 0 }]); // 0 · 450 · 900 (폭이 같아 가운데)
    expect(ctx.applied[0].label).toBe("가로 간격 같게(표 3개)");
  });

  it("다이어그램 편집 권한이 없으면 [정렬 ▾] 꺼짐, tip 에 짧은 이유", async () => {
    await mount(three({ rights: { ...three().rights, diagram: deny(RELEASED_TEXT) } }), ["t-0", "t-1"]);
    expect(btn("erd-tool-align").disabled).toBe(true);
    expect(btn("erd-tool-align").parentElement?.getAttribute("title")).toBe("정렬 — 확정된 버전");
  });
});

describe("Ctrl/⌘+A·툴팁(U67·U68)", () => {
  it("Ctrl/⌘+A 는 이 다이어그램 표를 모두 고른다", async () => {
    await mount(three());
    await press({ key: "a", ...MOD() });
    expect(picks.filter((p) => p.selected).map((p) => p.id).sort()).toEqual(["t-0", "t-1", "t-2"]);
  });

  it("한글 자판(e.key \"ㅁ\")에서도 Ctrl/⌘+A 는 물리 키 KeyA 로 받는다", async () => {
    await mount(three());
    await press({ key: "ㅁ", code: "KeyA", ...MOD() });
    expect(picks.filter((p) => p.selected).map((p) => p.id).sort()).toEqual(["t-0", "t-1", "t-2"]);
  });

  it("여러 개면 접기·빼기·삭제 툴팁 끝에 (표 n개), 고른 표가 없으면 '— 표를 먼저 고르세요'(disabledNoReason 판정)", async () => {
    await mount(three(), ["t-0", "t-1"]);
    expect(btn("erd-fold-KEYS").parentElement?.getAttribute("data-tip")).toBe("키 컬럼만 (표 2개)");
    expect(btn("erd-tool-remove").parentElement?.getAttribute("data-tip")).toBe("다이어그램에서 빼기 (Delete) (표 2개)");
    act(() => root?.unmount());
    await mount(three());
    for (const id of ["erd-fold-NONE", "erd-fold-KEYS", "erd-fold-NAME", "erd-tool-remove", "erd-tool-delete"]) {
      expect(btn(id).disabled).toBe(true);
      expect(btn(id).parentElement?.getAttribute("data-tip")).toMatch(/ — 표를 먼저 고르세요$/);
    }
  });
});

describe("이미 되는 일괄 동작(U56)", () => {
  it("[키만] 접기는 고른 표 모두에 setFold 한 건, 이미 KEYS 인 표는 뺀다", async () => {
    const s: ErdState = bigState(3, 2);
    s.nodes["d-all:t-1"] = { ...s.nodes["d-all:t-1"], foldMode: "KEYS" };
    const ctx = fakeCtx({ state: s });
    await mount(ctx, ["t-0", "t-1", "t-2"]);
    await click('[data-testid="erd-fold-KEYS"]');
    expect(ctx.applied).toEqual([{ commands: [{ op: "setFold", diagram: "d-all", tables: ["t-0", "t-2"], foldMode: "KEYS" }], label: "키만 보이기" }]);
  });

  it("관계로 이은 표 2개를 모델에서 삭제 = deleteTable 2건 한 묶음", async () => {
    const ctx = fakeCtx(); // menuModel: t-1 → t-2 관계 r-1
    await mount(ctx, ["t-1", "t-2"]);
    await press({ key: "Backspace", code: "Backspace", altKey: true });
    await click('[data-testid="erd-delete-ok"]');
    expect(ctx.applied).toEqual([{ commands: [{ op: "deleteTable", id: "t-1" }, { op: "deleteTable", id: "t-2" }], label: "표 2개 삭제" }]);
  });

  it("Delete 는 고른 표 모두를 removeFromDiagram 한 건으로 뺀다", async () => {
    const ctx = three();
    await mount(ctx, ["t-0", "t-2"]);
    await press({ key: "Delete", code: "Delete" });
    expect(ctx.applied).toEqual([{ commands: [{ op: "removeFromDiagram", diagram: "d-all", tables: ["t-0", "t-2"] }], label: "다이어그램에서 빼기" }]);
  });
});

/** menuModel 두 표 + 다이어그램 d-sub(t-2 만, (50,60)). */
function withSub(): ErdState {
  return stateOf(menuModel(), {
    diagrams: [...MENU_DIAGRAMS.diagrams, { id: "d-sub", areaName: "기본", diagramName: "오브젝트", sortSeq: 1 }],
    nodes: [...MENU_DIAGRAMS.nodes, { diagram: "d-sub", table: "t-2", x: 50, y: 60, foldMode: "NONE" }],
  });
}

describe("다른 다이어그램에 넣기 연결(U61)", () => {
  it("[다른 다이어그램에 넣기] → 창 → 대상에 없는 표만 placeTables 한 건, 알림", async () => {
    const ctx = fakeCtx({ state: withSub() });
    await mount(ctx, ["t-1", "t-2"]);
    await click('[data-testid="erd-tool-place"]');
    expect(document.querySelector("[data-testid=erd-place-info]")?.textContent).toBe("표 1개를 넣습니다. 이미 있는 1개는 그대로 둡니다.");
    await click('[data-testid="erd-place-ok"]');
    expect(ctx.applied).toHaveLength(1);
    expect(ctx.applied[0].label).toBe("다른 다이어그램에 넣기(표 1개)");
    const cmd = ctx.applied[0].commands[0] as { op: string; diagram: string; nodes: { table: string }[] };
    expect([cmd.op, cmd.diagram, cmd.nodes.map((n) => n.table)]).toEqual(["placeTables", "d-sub", ["t-1"]]);
    expect(ctx.notify).toHaveBeenCalledWith("표 1개를 「기본 / 오브젝트」에 넣었습니다(이미 있던 1개 뺌).", "info");
    // 닫힘 전환(Mantine 퇴장 애니메이션)이 끝난 뒤 창이 없어야 한다.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 350));
    });
    expect(document.querySelector("[data-testid=erd-place-dialog]")).toBeNull();
  });

  it("다른 다이어그램이 없으면 [넣기] 꺼짐·이유, 표 메뉴 항목도 꺼짐", async () => {
    await mount(fakeCtx(), ["t-1"]);
    expect(btn("erd-tool-place").disabled).toBe(true);
    expect(btn("erd-tool-place").parentElement?.getAttribute("data-tip")).toBe("다른 다이어그램에 넣기 — 다른 다이어그램이 없습니다");
    await nodeMenu(0);
    expect(btn("erd-menu-item-place").disabled).toBe(true);
  });
});

describe("같은 컬럼 여러 표에 연결(U63)", () => {
  it("bulkColumnSkipsAndSendsOneBatch — 둘 고르고 [컬럼 추가] → 창, MENU_NM 은 t-2 에만 addColumn 한 묶음", async () => {
    preview.mockResolvedValue(previewOf("MENU_NM", { recommendedDomainId: 3 }));
    const ctx = fakeCtx();
    await mount(ctx, ["t-1", "t-2"]);
    expect(btn("erd-tool-addcol").disabled).toBe(false);
    expect(btn("erd-tool-addcol").getAttribute("title")).toBe("컬럼 추가 — 고른 표 2개에 같은 컬럼");
    await click('[data-testid="erd-tool-addcol"]');
    expect(ctx.nav.startColumnAdd).not.toHaveBeenCalled();
    await typeInto(document.querySelector<HTMLInputElement>("[data-testid=erd-bulkcol-logical]")!, "메뉴명");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 350));
    });
    await click('[data-testid="erd-bulkcol-ok"]');
    expect(ctx.applied).toHaveLength(1);
    expect(ctx.applied[0].label).toBe("컬럼 추가(표 1개)");
    expect(ctx.applied[0].commands).toEqual([
      { op: "addColumn", id: expect.stringMatching(/^c-/), table: "t-2", logical: "메뉴명", phys: "MENU_NM", domainId: 3 },
    ]);
    expect(ctx.notify).toHaveBeenCalledWith("MENU_NM 컬럼을 표 1개에 더했습니다(이미 있던 1개 건너뜀).", "info");
  });

  it("bulkColumnOverBatchRefuses — 고른 표가 201개면 창을 열지 않고 알림", async () => {
    const ctx = fakeCtx({ state: bigState(MAX_BATCH + 1, 1) });
    await mount(ctx, Array.from({ length: MAX_BATCH + 1 }, (_, i) => `t-${i}`));
    await click('[data-testid="erd-tool-addcol"]');
    expect(document.querySelector("[data-testid=erd-bulkcol-dialog]")).toBeNull();
    expect(ctx.notify).toHaveBeenCalledWith(`한 번에 ${MAX_BATCH}개 표까지 넣을 수 있습니다.`, "warn");
  });

  it("표 메뉴(여러 개)의 '표 2개에 같은 컬럼 추가…' 도 창을 연다", async () => {
    await mount(fakeCtx(), ["t-1", "t-2"]);
    await nodeMenu(0);
    await click('[data-testid="erd-menu-item-bulkcol"]');
    expect(document.querySelector("[data-testid=erd-bulkcol-dialog]")).not.toBeNull();
  });

  it("releasedAllowsDiagramOpsOnly — 확정된 버전: 정렬·넣기 켜짐, [컬럼 추가] 꺼짐", async () => {
    const base = fakeCtx({ state: withSub() });
    await mount(fakeCtx({ state: withSub(), rights: { ...base.rights, model: deny(RELEASED_TEXT) } }), ["t-1", "t-2"]);
    expect(btn("erd-tool-align").disabled).toBe(false);
    expect(btn("erd-tool-place").disabled).toBe(false);
    expect(btn("erd-tool-addcol").disabled).toBe(true);
    expect(btn("erd-tool-addcol").parentElement?.getAttribute("title")).toBe("컬럼 추가 — 확정된 버전");
  });
});
