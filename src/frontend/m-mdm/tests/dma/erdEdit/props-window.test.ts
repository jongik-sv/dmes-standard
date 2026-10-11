/** @vitest-environment happy-dom */
import { act, createElement as h, useMemo } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { ReactFlow, ReactFlowProvider, useReactFlow, type NodeTypes } from "@dk-oasis/shared/react-flow";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import { ErdTableNode } from "../../../pages/dma/erdEdit/canvas/ErdTableNode";
import { buildFlow, type ErdFlowEdge, type ErdFlowNode } from "../../../pages/dma/erdEdit/canvas/erd-flow";
import { draftOf, propsCommands } from "../../../pages/dma/erdEdit/canvas/erd-props";
import { useCanvasEditing } from "../../../pages/dma/erdEdit/canvas/useCanvasEditing";
import type { ErdEditContext } from "../../../pages/dma/erdEdit/edit-context";
import { flush, polyfillLayout, settleGrid, typeInto } from "../../dme/helpers/render";
import { deny, fakeCtx, type FakeCtx } from "./erd-canvas-fixtures";
import { menuModel } from "./erd-fixtures";

describe("propsCommands(c4)", () => {
  const ids = () => {
    let n = 0;
    return () => `k-new-${++n}`;
  };

  it("고친 것이 없으면 명령 없음", () => {
    const m = menuModel();
    expect(propsCommands(m, draftOf(m, "t-1")!, draftOf(m, "t-1")!, ids())).toEqual({ commands: [], error: null });
  });

  it("순서 = 표 → 컬럼 → PK → 키 → 관계(확정)", () => {
    const m = menuModel();
    const d = draftOf(m, "t-1")!;
    d.logical = "메뉴 목록";
    d.columns = d.columns.map((c) => (c.id === "c-4" ? { ...c, logical: "메뉴 이름", notNull: true } : c.id === "c-2" ? { ...c, pk: true } : c));
    d.keys = [...d.keys, { id: null, kind: "UK", name: "UK_MENU_NM", columns: ["c-4"], deleted: false }];
    d.relations = d.relations.map((r) => (r.id === "r-1" ? { ...r, decision: "confirm" } : r));
    expect(propsCommands(m, draftOf(m, "t-1")!, d, ids()).commands.map((c) => c.op)).toEqual([
      "updateTable", "updateColumn", "setPrimaryKey", "addKey", "confirmRelation",
    ]);
    const plan = propsCommands(m, draftOf(m, "t-1")!, d, ids());
    expect(plan.commands[2]).toEqual({ op: "setPrimaryKey", table: "t-1", columns: ["c-1", "c-2"] });
    expect(plan.commands[3]).toEqual({ op: "addKey", id: "k-new-1", table: "t-1", kind: "UK", name: "UK_MENU_NM", columns: ["c-4"] });
  });

  it("물리명 겹침·틀린 키는 보내기 전에 막는다", () => {
    const m = menuModel();
    const d = draftOf(m, "t-1")!;
    expect(propsCommands(m, d, { ...d, phys: "TB_MCM_SEC_OBJ" }, ids()).error).toBe("같은 물리명의 표가 이미 있습니다: TB_MCM_SEC_OBJ");
    const bad = { ...d, keys: [...d.keys, { id: null, kind: "IX" as const, name: "IX_A", columns: [], deleted: false }] };
    expect(propsCommands(m, d, bad, ids())).toEqual({ commands: [], error: "키 IX_A 에 컬럼을 하나 이상 고르세요." });
  });

  it("연 뒤 남이 바꾼 칸은 덮지 않는다. 내가 고친 칸을 남도 바꿨으면 막는다", () => {
    const m = menuModel();
    const base = draftOf(m, "t-1")!;
    const d = { ...base, comment: "설명" };
    m.tables["t-1"].logical = "남이 바꾼 메뉴";
    m.columns["c-4"].phys = "MENU_NAME";
    expect(propsCommands(m, base, d, ids())).toEqual({ commands: [{ op: "updateTable", id: "t-1", set: { comment: "설명" } }], error: null });
    expect(propsCommands(m, base, { ...d, logical: "내 메뉴" }, ids()).error).toBe("표 논리명을(를) 다른 사람이 먼저 바꿨습니다. 창을 닫고 다시 여세요.");
  });

  it("PK 를 바꿀 때 지금 PK 순서를 지키고 켠 컬럼은 뒤에 붙인다(남이 더한 PK 도 유지)", () => {
    const m = menuModel();
    const base = draftOf(m, "t-1")!;
    m.keys["k-1"].columns = ["c-4", "c-1"]; // 연 뒤 남이 c-4 를 PK 앞에 더함
    const d = { ...base, columns: base.columns.map((c) => (c.id === "c-2" ? { ...c, pk: true } : c)) };
    expect(propsCommands(m, base, d, ids()).commands).toEqual([{ op: "setPrimaryKey", table: "t-1", columns: ["c-4", "c-1", "c-2"] }]);
  });

  it("이름 맞바꾸기는 막고, 손대지 않은 행의 옛 이름은 다른 칸 고치기를 막지 않는다", () => {
    const m = menuModel();
    m.columns["c-2"].phys = "object_id"; // 가져온 옛 이름(형식 틀림)
    const base = draftOf(m, "t-1")!;
    const swap = { ...base, columns: base.columns.map((c) => (c.id === "c-1" ? { ...c, phys: "MENU_NM" } : c.id === "c-4" ? { ...c, phys: "MENU_ID" } : c)) };
    expect(propsCommands(m, base, swap, ids()).error).toBe("컬럼 물리명 MENU_NM 를 한 번에 맞바꿀 수 없습니다. 하나씩 적용하세요.");
    expect(propsCommands(m, base, { ...base, logical: "메뉴 목록" }, ids()).error).toBeNull();
  });
});

const NODE_TYPES: NodeTypes = { erdTable: ErdTableNode };
let host: HTMLDivElement;
let root: Root | null = null;

function Harness({ ctx, selected }: { ctx: ErdEditContext; selected: readonly string[] }) {
  const rf = useReactFlow<ErdFlowNode, ErdFlowEdge>();
  const e = useCanvasEditing(ctx, rf);
  const flow = useMemo(
    () => buildFlow({
      state: ctx.state, diagramId: ctx.diagramId, mode: "logical", preset: "basic", namesOnly: false, showAudit: true,
      statuses: {}, domains: {}, selected: new Set(selected), mySession: ctx.session,
    }),
    [ctx.state, ctx.diagramId, ctx.session, selected],
  );
  return h("div", { tabIndex: 0, "data-testid": "erd-host", onKeyDown: e.onKeyDown, style: { position: "relative", width: 1200, height: 800 } },
    h(ReactFlow<ErdFlowNode, ErdFlowEdge>, {
      nodes: e.decorateNodes(flow.nodes), edges: flow.edges, nodeTypes: NODE_TYPES,
      onNodesChange: e.onNodesChange, ...e.flowProps, fitView: false, defaultViewport: { x: 0, y: 0, zoom: 1 },
    }),
    e.overlay);
}

async function mount(ctx: FakeCtx, selected: readonly string[]) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(h(DmesUiProvider, null, h(ReactFlowProvider, null, h(Harness, { ctx, selected }))));
  });
  await flush();
}

async function space() {
  const el = host.querySelector<HTMLElement>('[data-testid="erd-host"]')!;
  await act(async () => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true, cancelable: true }));
  });
  await flush();
}

const win = () => document.querySelector<HTMLElement>('[data-testid="erd-props"]');

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
});

describe("Space 속성 창(c4)", () => {
  it("Space 로 고른 표 창을 열고 [적용] 한 번 = 명령 한 묶음, 받아들이면 닫는다", async () => {
    const ctx = fakeCtx({ selectedTableId: "t-1" });
    await mount(ctx, ["t-1"]);
    await space();
    expect(win()).not.toBeNull();
    await typeInto(document.querySelector<HTMLInputElement>('[data-testid="erd-props-logical"]')!, "메뉴 목록");
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-testid="erd-props-ok"]')!.click();
    });
    await flush();
    expect(ctx.applied).toEqual([{ commands: [{ op: "updateTable", id: "t-1", set: { logical: "메뉴 목록" } }], label: "표 속성 바꾸기: TB_MCM_SEC_MENU" }]);
    expect(win()).toBeNull();
  });

  it("거절되면 창을 열어 두고 문구를 보인다", async () => {
    const ctx = fakeCtx({ selectedTableId: "t-1" });
    ctx.outcomes.push({ ok: false, notice: { kind: "error", message: "다른 사람이 먼저 바꿨습니다." } as never });
    await mount(ctx, ["t-1"]);
    await space();
    await typeInto(document.querySelector<HTMLInputElement>('[data-testid="erd-props-logical"]')!, "메뉴 목록");
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-testid="erd-props-ok"]')!.click();
    });
    await flush();
    expect(win()).not.toBeNull();
    expect(document.querySelector('[data-testid="erd-props-error"]')?.textContent).toBe("다른 사람이 먼저 바꿨습니다.");
  });

  it("고른 표가 없으면 열지 않고 알린다. 권한이 없으면 읽기 전용으로 연다", async () => {
    const none = fakeCtx();
    await mount(none, []);
    await space();
    expect(win()).toBeNull();
    expect(none.notify).toHaveBeenCalledWith("표를 먼저 고르세요.", "info");
    act(() => root?.unmount());
    host.remove();

    const ro = fakeCtx({ selectedTableId: "t-1", rights: { ...fakeCtx().rights, model: deny("공동 편집자가 아닙니다.") } });
    await mount(ro, ["t-1"]);
    await space();
    expect(win()?.textContent).toContain("공동 편집자가 아닙니다.");
    expect(document.querySelector<HTMLInputElement>('[data-testid="erd-props-logical"]')?.disabled).toBe(true);
  });

  it("컬럼 그리드 칸에 글자를 쳐도 입력 칸이 그대로이고, [적용] 은 updateColumn 을 보낸다", async () => {
    polyfillLayout();
    const ctx = fakeCtx({ selectedTableId: "t-1" });
    await mount(ctx, ["t-1"]);
    await space();
    await settleGrid(win()!);
    const logical = () => document.querySelector<HTMLInputElement>('[row-id="c-4"] input[aria-label="논리명"]');
    const first = logical();
    expect(first).not.toBeNull();
    expect(document.querySelector('[data-testid="erd-props-col-c-4"]')).not.toBeNull();
    await typeInto(first!, "메뉴 이름");
    await typeInto(logical()!, "메뉴 이름2");
    await flush();
    expect(logical()).toBe(first); // 칸이 다시 만들어지지 않았다(초점 유지)
    expect(first!.value).toBe("메뉴 이름2");
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-testid="erd-props-ok"]')!.click();
    });
    await flush();
    expect(ctx.applied[0].commands).toEqual([{ op: "updateColumn", id: "c-4", set: { logical: "메뉴 이름2" } }]);
  });
});

describe("속성 창 키 컬럼 고르기(f2)", () => {
  it("[키 추가] 뒤 컬럼 고르기 목록은 그리드 칸 밖에 열리고, 고른 컬럼으로 addKey 를 보낸다", async () => {
    polyfillLayout();
    const ctx = fakeCtx({ selectedTableId: "t-1" });
    await mount(ctx, ["t-1"]);
    await space();
    await settleGrid(win()!);
    expect(document.querySelector('[data-testid="erd-props-key-picker"]')).toBeNull();
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-testid="erd-props-add-key"]')!.click();
    });
    await settleGrid(win()!);
    const picker = document.querySelector<HTMLElement>('[data-testid="erd-props-key-picker"]');
    expect(picker).not.toBeNull();
    const input = picker!.querySelector<HTMLInputElement>('input[aria-label="키 컬럼"]');
    expect(input).not.toBeNull();
    // 그리드 칸(overflow:hidden)이 목록을 자르지 않도록 그리드 밖에 둔다.
    expect(input!.closest(".ag-root-wrapper, .ag-cell, [role=\"grid\"]")).toBeNull();
    await act(async () => {
      input!.focus();
      input!.click();
    });
    await flush();
    const option = picker!.querySelector<HTMLElement>('[role="option"]');
    expect(option).not.toBeNull();
    await act(async () => {
      option!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      option!.click();
    });
    await flush();
    const name = document.querySelector<HTMLInputElement>('input[aria-label="키 이름"]')!;
    await typeInto(name, "uk_f2");
    await flush();
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-testid="erd-props-ok"]')!.click();
    });
    await flush();
    const add = ctx.applied[0]?.commands.find((c) => c.op === "addKey");
    expect(add).toMatchObject({ op: "addKey", table: "t-1", kind: "UK", name: "UK_F2" });
    expect((add as { columns: string[] }).columns).toHaveLength(1);
  });
});
