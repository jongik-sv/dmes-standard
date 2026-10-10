/** @vitest-environment happy-dom */
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import type { ErdEditContext } from "../../../pages/dma/erdEdit/edit-context";
import { DiagramTree } from "../../../pages/dma/erdEdit/panels/DiagramTree";
import { DiagramWizard } from "../../../pages/dma/erdEdit/panels/DiagramWizard";
import { flush, typeInto } from "../../dme/helpers/render";
import { deny, fakeCtx } from "./erd-canvas-fixtures";
import { menuModel, stateOf } from "./erd-fixtures";

let host: HTMLDivElement;
let root: Root | null = null;

async function render(node: ReturnType<typeof h>) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(h(DmesUiProvider, null, node));
  });
  await flush();
}

const $ = <T extends Element = HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`없는 요소: ${sel}`);
  return el;
};

async function click(sel: string) {
  await act(async () => {
    $<HTMLElement>(sel).click();
  });
  await flush();
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
});

describe("다이어그램 마법사", () => {
  it("이름 → 표 고르기 → 격자 배치로 [addDiagram, placeTables] 한 묶음을 보내고 새 다이어그램을 연다", async () => {
    const ctx = fakeCtx();
    const onCreated = vi.fn();
    const onClose = vi.fn();
    await render(h(DiagramWizard, { open: true, ctx, onClose, onCreated }));
    expect($<HTMLButtonElement>('[data-testid="erd-wiz-next"]').disabled).toBe(true);
    await typeInto($<HTMLInputElement>('[data-testid="erd-wiz-area"]'), "보안");
    await typeInto($<HTMLInputElement>('[data-testid="erd-wiz-name"]'), "메뉴");
    await click('[data-testid="erd-wiz-next"]');
    await click('input[aria-label="TB_MCM_SEC_OBJ"]');
    expect($('[data-testid="erd-wiz-count"]').textContent).toBe("고른 표 1개");
    await click('[data-testid="erd-wiz-next"]');
    await click('input[type="radio"][value="grid"]');
    await click('[data-testid="erd-wiz-create"]');
    const [add, place] = ctx.applied[0].commands as Array<Record<string, unknown>>;
    expect(add).toMatchObject({ op: "addDiagram", areaName: "보안", diagramName: "메뉴", sortSeq: 1 });
    expect(String(add.id)).toMatch(/^d-[0-9a-zA-Z-]{1,48}$/);
    expect(place).toEqual({ op: "placeTables", diagram: add.id, nodes: [{ table: "t-2", x: 0, y: 0 }] });
    expect(ctx.applied[0].label).toBe("다이어그램 만들기");
    expect(onCreated).toHaveBeenCalledWith(add.id);
    expect(onClose).toHaveBeenCalled();
  });

  it("응답을 기다리는 동안 모델이 바뀌면 새 다이어그램을 열지 않는다(Local-Rules §37)", async () => {
    let resolve!: (v: { ok: true; rev: number; warnings: [] }) => void;
    const base = fakeCtx();
    const ctx = { ...base, apply: vi.fn(() => new Promise<{ ok: true; rev: number; warnings: [] }>((r) => { resolve = r; })) };
    const onCreated = vi.fn();
    const onClose = vi.fn();
    await render(h(DiagramWizard, { open: true, ctx, onClose, onCreated }));
    await typeInto($<HTMLInputElement>('[data-testid="erd-wiz-area"]'), "보안");
    await typeInto($<HTMLInputElement>('[data-testid="erd-wiz-name"]'), "메뉴");
    await click('[data-testid="erd-wiz-next"]');
    await click('[data-testid="erd-wiz-next"]');
    await click('[data-testid="erd-wiz-create"]');
    expect(ctx.apply).toHaveBeenCalledTimes(1);
    await act(async () => {
      root!.render(h(DmesUiProvider, null, h(DiagramWizard, { open: true, ctx: { ...ctx, modelId: "other" }, onClose, onCreated })));
    });
    await act(async () => {
      resolve({ ok: true, rev: 4, warnings: [] });
    });
    await flush();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("같은 업무영역·이름이 있으면 다음으로 가지 못한다", async () => {
    const ctx = fakeCtx();
    await render(h(DiagramWizard, { open: true, ctx, onClose: vi.fn(), onCreated: vi.fn() }));
    await typeInto($<HTMLInputElement>('[data-testid="erd-wiz-area"]'), "기본");
    await typeInto($<HTMLInputElement>('[data-testid="erd-wiz-name"]'), "전체");
    expect($<HTMLButtonElement>('[data-testid="erd-wiz-next"]').disabled).toBe(true);
    expect($('[data-testid="erd-wiz-error"]').textContent).toContain("같은 이름");
  });

  it("[다이어그램에 없는 표만]은 놓이지 않은 표만 보인다", async () => {
    const ctx = fakeCtx({
      state: stateOf(menuModel(), {
        diagrams: [{ id: "d-all", areaName: "기본", diagramName: "전체", sortSeq: 0 }],
        nodes: [{ diagram: "d-all", table: "t-1", x: 0, y: 0, foldMode: "NONE" }],
      }),
    });
    await render(h(DiagramWizard, { open: true, ctx, onClose: vi.fn(), onCreated: vi.fn() }));
    await typeInto($<HTMLInputElement>('[data-testid="erd-wiz-area"]'), "보안");
    await typeInto($<HTMLInputElement>('[data-testid="erd-wiz-name"]'), "새");
    await click('[data-testid="erd-wiz-next"]');
    expect(document.querySelectorAll('[data-testid="erd-wiz-row"]')).toHaveLength(2);
    await click('input[aria-label="다이어그램에 없는 표만"]');
    expect([...document.querySelectorAll('[data-testid="erd-wiz-row"]')].map((r) => r.getAttribute("data-table"))).toEqual(["t-2"]);
  });
});

describe("DiagramTree — 새 다이어그램 단추", () => {
  const props = (ctx: ErdEditContext | null) => ({
    state: ctx?.state ?? null, statuses: {}, activeDiagram: "d-all", onSelectDiagram: vi.fn(), onRevealTable: vi.fn(), findSeq: 0, ctx,
  });

  it("다이어그램 편집 권한이 없으면 막고 이유를 title 에 적는다", async () => {
    const ctx = fakeCtx({ rights: { ...fakeCtx().rights, diagram: deny("공동 편집자가 아닙니다.") } });
    await render(h(DiagramTree, props(ctx)));
    const b = $<HTMLButtonElement>('[data-testid="erd-diagram-new"]');
    expect(b.disabled).toBe(true);
    expect(b.getAttribute("title")).toBe("공동 편집자가 아닙니다.");
  });

  it("모델을 읽기 전(ctx 없음)에는 막는다. 권한이 있으면 눌러 마법사를 연다", async () => {
    await render(h(DiagramTree, props(null)));
    expect($<HTMLButtonElement>('[data-testid="erd-diagram-new"]').disabled).toBe(true);
    act(() => root?.unmount());
    await render(h(DiagramTree, props(fakeCtx())));
    await click('[data-testid="erd-diagram-new"]');
    expect(document.querySelector('[data-testid="erd-wiz-area"]')).not.toBeNull();
  });
});
