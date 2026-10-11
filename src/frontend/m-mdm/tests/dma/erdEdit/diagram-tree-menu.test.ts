/** @vitest-environment happy-dom */
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import { DiagramTree } from "../../../pages/dma/erdEdit/panels/DiagramTree";
import {
  copyDefaultName, copyDiagramCommand, deleteDiagramCommand, diagramNameError, renameDiagramCommand,
} from "../../../pages/dma/erdEdit/panels/DiagramTreeMenu";
import type { ErdDiagram } from "../../../pages/dma/erdEdit/types";
import { flush, typeInto } from "../../dme/helpers/render";
import { deny, fakeCtx } from "./erd-canvas-fixtures";

const D: Record<string, ErdDiagram> = {
  "d-1": { id: "d-1", areaName: "보안", diagramName: "메뉴", sortSeq: 0 },
  "d-2": { id: "d-2", areaName: "보안", diagramName: "메뉴 복사", sortSeq: 1 },
  "d-3": { id: "d-3", areaName: "공통", diagramName: "코드", sortSeq: 2 },
};

describe("다이어그램 목록 메뉴 명령(p1)", () => {
  it("이름 바꾸기·지우기·복사 명령 모양", () => {
    expect(renameDiagramCommand("d-1", "새 이름")).toEqual({ op: "updateDiagram", id: "d-1", set: { diagramName: "새 이름" } });
    expect(deleteDiagramCommand("d-1")).toEqual({ op: "deleteDiagram", id: "d-1" });
    expect(copyDiagramCommand("d-1", "d-9", "보안", "메뉴 복사 2")).toEqual({ op: "copyDiagram", from: "d-1", id: "d-9", areaName: "보안", diagramName: "메뉴 복사 2" });
  });

  it("복사 기본 이름은 「<이름> 복사」, 겹치면 번호를 붙인다", () => {
    expect(copyDefaultName(D, "공통", "코드")).toBe("코드 복사");
    expect(copyDefaultName(D, "보안", "메뉴")).toBe("메뉴 복사 2");
  });

  it("같은 업무영역 이름 중복·빈 이름을 막고, 자기 이름은 허용한다", () => {
    expect(diagramNameError(D, "보안", "  ", "d-1")).toBe("이름을 넣으세요.");
    expect(diagramNameError(D, "보안", "메뉴 복사", "d-1")).toContain("같은 이름");
    expect(diagramNameError(D, "보안", "메뉴", "d-1")).toBeNull();
    expect(diagramNameError(D, "공통", "메뉴 복사", "d-3")).toBeNull();
  });
});

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

async function rightClick(sel: string) {
  await act(async () => {
    $<HTMLElement>(sel).dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 20, clientY: 30 }));
  });
  await flush();
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
});

describe("다이어그램 목록 오른쪽 클릭 메뉴(p1 렌더)", () => {
  const props = (ctx: ReturnType<typeof fakeCtx>, over: Record<string, unknown> = {}) => ({
    state: ctx.state, statuses: {}, showAudit: false, activeDiagram: "d-all", onSelectDiagram: vi.fn(), onRevealTable: vi.fn(), findSeq: 0, ctx, ...over,
  });

  it("이름 바꾸기 → updateDiagram 한 묶음을 보낸다", async () => {
    const ctx = fakeCtx();
    await render(h(DiagramTree, props(ctx)));
    await rightClick('[data-testid="erd-diagram-d-all"]');
    await click('[data-testid="erd-diagram-menu-item-rename"]');
    await typeInto($<HTMLInputElement>('[data-testid="erd-diagram-dialog-name"]'), "새 이름");
    await click('[data-testid="erd-diagram-dialog-ok"]');
    expect(ctx.applied).toEqual([{ commands: [{ op: "updateDiagram", id: "d-all", set: { diagramName: "새 이름" } }], label: "다이어그램 이름 바꾸기" }]);
  });

  it("지우기 → 확인 창 → deleteDiagram, 뒤이어 [되돌리기] 가 그 rev 로 onUndo 를 부른다", async () => {
    const ctx = fakeCtx();
    ctx.outcomes.push({ ok: true, rev: 7, warnings: [] });
    const onUndo = vi.fn();
    await render(h(DiagramTree, props(ctx, { onUndo })));
    await rightClick('[data-testid="erd-diagram-d-all"]');
    await click('[data-testid="erd-diagram-menu-item-delete"]');
    expect($('[data-testid="erd-diagram-delete-text"]').textContent).toContain("전체");
    expect(ctx.applied).toHaveLength(0);
    await click('[data-testid="erd-diagram-dialog-ok"]');
    expect(ctx.applied[0].commands).toEqual([{ op: "deleteDiagram", id: "d-all" }]);
    expect($('[data-testid="erd-diagram-undo-offer"]').textContent).toContain("전체");
    await click('[data-testid="erd-diagram-undo"]');
    expect(onUndo).toHaveBeenCalledWith(7);
    expect(document.querySelector('[data-testid="erd-diagram-undo-offer"]')).toBeNull();
  });

  it("복사 → 기본 이름 「<이름> 복사」 → copyDiagram 한 묶음, 끝나면 새 다이어그램을 연다", async () => {
    const ctx = fakeCtx();
    ctx.outcomes.push({ ok: true, rev: 8, warnings: [] });
    const onSelectDiagram = vi.fn();
    await render(h(DiagramTree, props(ctx, { onSelectDiagram })));
    await rightClick('[data-testid="erd-diagram-d-all"]');
    await click('[data-testid="erd-diagram-menu-item-copy"]');
    expect($<HTMLInputElement>('[data-testid="erd-diagram-dialog-name"]').value).toBe("전체 복사");
    await click('[data-testid="erd-diagram-dialog-ok"]');
    expect(ctx.applied).toHaveLength(1);
    expect(ctx.applied[0].label).toBe("다이어그램 복사");
    const cmd = ctx.applied[0].commands[0] as { op: string; from: string; id: string; diagramName: string };
    expect(cmd).toMatchObject({ op: "copyDiagram", from: "d-all", diagramName: "전체 복사" });
    expect(onSelectDiagram).toHaveBeenCalledWith(cmd.id);
  });

  it("권한이 없으면 이름 바꾸기·지우기·복사 항목이 모두 꺼진다", async () => {
    const ctx = fakeCtx({ rights: { ...fakeCtx().rights, diagram: deny("공동 편집자가 아닙니다.") } });
    await render(h(DiagramTree, props(ctx)));
    await rightClick('[data-testid="erd-diagram-d-all"]');
    expect($<HTMLButtonElement>('[data-testid="erd-diagram-menu-item-rename"]').disabled).toBe(true);
    expect($<HTMLButtonElement>('[data-testid="erd-diagram-menu-item-delete"]').disabled).toBe(true);
    expect($<HTMLButtonElement>('[data-testid="erd-diagram-menu-item-copy"]').disabled).toBe(true);
  });
});
