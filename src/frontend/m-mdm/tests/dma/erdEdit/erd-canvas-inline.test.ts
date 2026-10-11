/** @vitest-environment happy-dom */
import { act, createElement as h, useMemo } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { ReactFlow, ReactFlowProvider, useReactFlow, type NodeTypes } from "@dk-oasis/shared/react-flow";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import { renameCommand } from "../../../pages/dma/erdEdit/canvas/erd-commands";
import { ErdTableNode } from "../../../pages/dma/erdEdit/canvas/ErdTableNode";
import { buildFlow, type ErdFlowEdge, type ErdFlowNode, type ErdMode } from "../../../pages/dma/erdEdit/canvas/erd-flow";
import { useCanvasEditing } from "../../../pages/dma/erdEdit/canvas/useCanvasEditing";
import type { ErdEditContext } from "../../../pages/dma/erdEdit/edit-context";
import { flush } from "../../dme/helpers/render";
import { deny, fakeCtx, type FakeCtx } from "./erd-canvas-fixtures";
import { MENU_DIAGRAMS, menuModel, stateOf } from "./erd-fixtures";

const NODE_TYPES: NodeTypes = { erdTable: ErdTableNode };
let host: HTMLDivElement;
let root: Root | null = null;

function Harness({ ctx, selected, mode }: { ctx: ErdEditContext; selected: readonly string[]; mode: ErdMode }) {
  const rf = useReactFlow<ErdFlowNode, ErdFlowEdge>();
  const e = useCanvasEditing(ctx, rf);
  const flow = useMemo(
    () => buildFlow({
      state: ctx.state, diagramId: ctx.diagramId, mode, preset: "basic", namesOnly: false, showAudit: true,
      statuses: {}, domains: {}, selected: new Set(selected), mySession: ctx.session,
    }),
    [ctx.state, ctx.diagramId, ctx.session, selected, mode],
  );
  return h("div", { tabIndex: 0, "data-testid": "erd-host", onKeyDown: e.onKeyDown, style: { position: "relative", width: 1200, height: 800 } },
    h(ReactFlow<ErdFlowNode, ErdFlowEdge>, {
      nodes: e.decorateNodes(flow.nodes), edges: flow.edges, nodeTypes: NODE_TYPES,
      onNodesChange: e.onNodesChange, ...e.flowProps, fitView: false, defaultViewport: { x: 0, y: 0, zoom: 1 },
    }),
    e.overlay);
}

async function mount(ctx: FakeCtx, selected: readonly string[] = [], mode: ErdMode = "logical") {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(h(DmesUiProvider, null, h(ReactFlowProvider, null, h(Harness, { ctx, selected, mode }))));
  });
  await flush();
}

async function dblclick(sel: string) {
  const el = host.querySelector<HTMLElement>(sel);
  if (!el) throw new Error(`없는 요소: ${sel}`);
  await act(async () => {
    el.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
  });
  await flush();
}

async function rerender(ctx: FakeCtx, selected: readonly string[] = [], mode: ErdMode = "logical") {
  await act(async () => {
    root!.render(h(DmesUiProvider, null, h(ReactFlowProvider, null, h(Harness, { ctx, selected, mode }))));
  });
  await flush();
}

async function blurInput() {
  await act(async () => {
    input()!.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: null }));
  });
  await flush();
}

const input = () => host.querySelector<HTMLInputElement>('[data-testid="erd-inline"]');

async function typeAndKey(value: string, key: string) {
  const el = input()!;
  await act(async () => {
    el.value = value;
    el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
  await flush();
}

async function pressHost(init: KeyboardEventInit) {
  const el = host.querySelector<HTMLElement>('[data-testid="erd-host"]')!;
  await act(async () => {
    el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
  });
  await flush();
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
});

describe("renameCommand(c2)", () => {
  const m = menuModel();
  it("표·컬럼 논리명·물리명 한 칸을 바꾸는 명령. 같은 값이면 명령 없음", () => {
    expect(renameCommand(m, "t-1", null, "logical", " 메뉴 목록 ")).toEqual({ command: { op: "updateTable", id: "t-1", set: { logical: "메뉴 목록" } }, error: null });
    expect(renameCommand(m, "t-1", "c-4", "phys", "MENU_NAME")).toEqual({ command: { op: "updateColumn", id: "c-4", set: { phys: "MENU_NAME" } }, error: null });
    expect(renameCommand(m, "t-1", null, "logical", "메뉴")).toEqual({ command: null, error: null });
  });

  it("물리명 규칙·겹침은 보내기 전에 막는다", () => {
    expect(renameCommand(m, "t-1", null, "phys", "tb_x").error).toContain("대문자");
    expect(renameCommand(m, "t-1", null, "phys", "TB_MCM_SEC_OBJ").error).toBe("같은 물리명의 표가 이미 있습니다: TB_MCM_SEC_OBJ");
    expect(renameCommand(m, "t-1", "c-4", "phys", "MENU_ID").error).toBe("같은 표에 같은 물리명의 컬럼이 있습니다: MENU_ID");
    expect(renameCommand(m, "t-1", "c-4", "phys", "").error).toBe("물리명을 넣으세요.");
  });
});

describe("캔버스 그 자리 편집(c2)", () => {
  it("컬럼 줄을 두 번 누르면 저장 값(*** 포함)으로 시작하고 Enter 로 논리명을 고친다", async () => {
    const m = menuModel();
    m.columns["c-4"].logical = "메뉴 ***";
    const ctx = fakeCtx({ state: stateOf(m, MENU_DIAGRAMS) });
    await mount(ctx);
    expect(host.querySelector('[data-testid="erd-col-c-4"] .erd-col__name')?.textContent).toBe("메뉴 NM");
    await dblclick('[data-testid="erd-col-c-4"] .erd-col__name');
    expect(input()?.value).toBe("메뉴 ***");
    await typeAndKey("메뉴 이름", "Enter");
    expect(ctx.applied).toEqual([{ commands: [{ op: "updateColumn", id: "c-4", set: { logical: "메뉴 이름" } }], label: "컬럼 논리명 바꾸기" }]);
    expect(input()).toBeNull();
  });

  it("물리 모드에서 표 이름을 두 번 누르면 물리명을 고친다. Esc 는 보내지 않고 닫는다", async () => {
    const ctx = fakeCtx();
    await mount(ctx, [], "physical");
    await dblclick('[data-testid="erd-node-t-1"] .erd-node__title');
    expect(input()?.value).toBe("TB_MCM_SEC_MENU");
    await typeAndKey("TB_X", "Escape");
    expect(input()).toBeNull();
    expect(ctx.applied).toEqual([]);
    await dblclick('[data-testid="erd-node-t-1"] .erd-node__title');
    await typeAndKey("TB_MCM_MENU", "Enter");
    expect(ctx.applied).toEqual([{ commands: [{ op: "updateTable", id: "t-1", set: { phys: "TB_MCM_MENU" } }], label: "표 물리명 바꾸기" }]);
  });

  it("F2 는 고른 표 하나의 이름 편집을 연다. 틀린 물리명은 알리고 보내지 않는다", async () => {
    const ctx = fakeCtx({ selectedTableId: "t-2" });
    await mount(ctx, ["t-2"], "physical");
    await pressHost({ key: "F2", code: "F2" });
    expect(input()?.value).toBe("TB_MCM_SEC_OBJ");
    await typeAndKey("TB_MCM_SEC_MENU", "Enter");
    expect(ctx.applied).toEqual([]);
    expect(ctx.notify).toHaveBeenCalledWith("같은 물리명의 표가 이미 있습니다: TB_MCM_SEC_MENU", "warn");
    // 거절된 값은 입력을 열어 둔다(쓴 글 유지, 오류 표시)
    expect(input()?.value).toBe("TB_MCM_SEC_MENU");
    expect(input()?.getAttribute("aria-invalid")).toBe("true");
    await typeAndKey("TB_MCM_OBJ", "Enter");
    expect(ctx.applied).toEqual([{ commands: [{ op: "updateTable", id: "t-2", set: { phys: "TB_MCM_OBJ" } }], label: "표 물리명 바꾸기" }]);
    expect(input()).toBeNull();
  });

  it("편집 중 남이 이름을 바꿔도 고치지 않고 떠나면 보내지 않는다(옛 값으로 덮지 않음)", async () => {
    const ctx = fakeCtx();
    await mount(ctx, [], "physical");
    await dblclick('[data-testid="erd-node-t-1"] .erd-node__title');
    const m = menuModel();
    m.tables["t-1"].phys = "TB_OTHER";
    await rerender({ ...ctx, state: stateOf(m, MENU_DIAGRAMS) }, [], "physical");
    expect(input()?.value).toBe("TB_MCM_SEC_MENU");
    await blurInput();
    expect(input()).toBeNull();
    expect(ctx.applied).toEqual([]);
  });

  it("물리명은 대문자로 바꿔 보낸다", async () => {
    const ctx = fakeCtx();
    await mount(ctx, [], "physical");
    await dblclick('[data-testid="erd-node-t-1"] .erd-node__title');
    await typeAndKey(" tb_mcm_menu ", "Enter");
    expect(ctx.applied).toEqual([{ commands: [{ op: "updateTable", id: "t-1", set: { phys: "TB_MCM_MENU" } }], label: "표 물리명 바꾸기" }]);
  });

  it("편집 중 대상이 지워지면 닫고, 다시 생겨도 입력이 되살아나지 않는다", async () => {
    const ctx = fakeCtx();
    await mount(ctx);
    await dblclick('[data-testid="erd-col-c-4"] .erd-col__name');
    expect(input()).not.toBeNull();
    const m = menuModel();
    delete m.columns["c-4"];
    m.tables["t-1"].columnOrder = m.tables["t-1"].columnOrder.filter((c) => c !== "c-4");
    await rerender({ ...ctx, state: stateOf(m, MENU_DIAGRAMS) });
    expect(input()).toBeNull();
    await rerender(ctx);
    expect(host.querySelector('[data-testid="erd-col-c-4"]')).not.toBeNull();
    expect(input()).toBeNull();
    expect(ctx.applied).toEqual([]);
  });

  it("입력 안 키는 캔버스로 가지 않는다(Delete 가 표를 빼지 않음)", async () => {
    const ctx = fakeCtx({ selectedTableId: "t-1" });
    await mount(ctx, ["t-1"]);
    await dblclick('[data-testid="erd-node-t-1"] .erd-node__title');
    await act(async () => {
      input()!.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", code: "Delete", bubbles: true, cancelable: true }));
    });
    expect(ctx.applied).toEqual([]);
    expect(input()).not.toBeNull();
  });

  it("모델 편집 권한이 없으면 열지 않고 이유를 알린다", async () => {
    const ctx = fakeCtx({ rights: { ...fakeCtx().rights, model: deny("공동 편집자가 아닙니다.") } });
    await mount(ctx);
    await dblclick('[data-testid="erd-node-t-1"] .erd-node__title');
    expect(input()).toBeNull();
    expect(ctx.notify).toHaveBeenCalledWith("공동 편집자가 아닙니다.", "warn");
  });
});
