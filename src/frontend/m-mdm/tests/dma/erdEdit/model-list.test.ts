/** @vitest-environment happy-dom */
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import { ModelListModal, modelListRows } from "../../../pages/dma/erdEdit/panels/ModelListModal";
import type { ErdModelRow } from "../../../pages/dma/erdEdit/types";
import { flush, settleGrid, typeInto } from "../../dme/helpers/render";

const MODELS: ErdModelRow[] = [
  { modelId: "mcm", moduleId: "mcm", schemaName: "MCMAPUSER", modelName: "MCM 스키마", rev: 12, draftVer: "1.001", ownerId: "kim",
    status: "DRAFT", releasedVer: "1.000", createdBy: "lee" },
  { modelId: "mls", moduleId: "mls", schemaName: "MLSAPUSER", modelName: "MLS 스키마", rev: 3, draftVer: null, ownerId: null,
    status: "RELEASED", releasedVer: "2.000", createdBy: "park" },
  { modelId: "old", moduleId: "old", schemaName: "OLD", modelName: "옛 서버", rev: 1, draftVer: null, ownerId: null },
];

describe("모델 목록 행(p2)", () => {
  it("상태 글·소유자(없으면 만든 사람)·확정본을 칸에 담고, 옛 서버 행은 빈 칸이다", () => {
    expect(modelListRows(MODELS)).toEqual([
      { id: "mcm", name: "MCM 스키마", moduleId: "mcm", schemaName: "MCMAPUSER", status: "작성 중", ownerId: "kim", rev: 12, released: "1.000" },
      { id: "mls", name: "MLS 스키마", moduleId: "mls", schemaName: "MLSAPUSER", status: "확정", ownerId: "park", rev: 3, released: "2.000" },
      { id: "old", name: "옛 서버", moduleId: "old", schemaName: "OLD", status: "", ownerId: "", rev: 1, released: "" },
    ]);
  });
});

describe("모델 관리 창(p2)", () => {
  let host: HTMLDivElement;
  let root: Root | null = null;
  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    host?.remove();
  });
  const $ = <T extends Element = HTMLElement>(sel: string): T | null => document.querySelector<T>(sel);
  const click = async (sel: string) => {
    await act(async () => {
      $<HTMLElement>(sel)!.click();
    });
    await flush();
  };
  async function render(props: Partial<Parameters<typeof ModelListModal>[0]> = {}) {
    const p = {
      opened: true, models: MODELS, currentModelId: "mcm", onClose: vi.fn(), onOpenModel: vi.fn(),
      onDelete: vi.fn(async () => ({ ok: true as const })), ...props,
    };
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(h(DmesUiProvider, null, h(ModelListModal, p)));
    });
    await settleGrid($('[data-testid="erd-models"]')!);
    return p;
  }
  const pickRow = async (id: string) => {
    await act(async () => {
      $<HTMLElement>(`.ag-row[row-id="${id}"] [col-id="name"]`)!.click();
    });
    await flush();
  };

  it("행을 고르기 전에는 [열기]·[삭제] 가 꺼져 있고, 고르면 켜진다. [열기] 는 모델을 열고 창을 닫는다", async () => {
    const p = await render();
    expect($<HTMLButtonElement>('[data-testid="erd-models-open"]')!.disabled).toBe(true);
    expect($<HTMLButtonElement>('[data-testid="erd-models-delete"]')!.disabled).toBe(true);
    await pickRow("mls");
    await click('[data-testid="erd-models-open"]');
    expect(p.onOpenModel).toHaveBeenCalledWith("mls");
    expect(p.onClose).toHaveBeenCalled();
  });

  it("[삭제] 는 모델 ID 를 입력해야 켜지고, 입력하면 onDelete 를 부른다", async () => {
    const p = await render();
    await pickRow("mcm");
    await click('[data-testid="erd-models-delete"]');
    expect($('[data-testid="erd-model-delete"]')!.textContent).toContain("되돌릴 수 없습니다");
    expect($('[data-testid="erd-model-delete"]')!.textContent).toContain("시작 화면");
    const ok = () => $<HTMLButtonElement>('[data-testid="erd-model-delete-ok"]')!;
    expect(ok().disabled).toBe(true);
    await typeInto($<HTMLInputElement>('[data-testid="erd-model-delete-input"]')!, "mc");
    expect(ok().disabled).toBe(true);
    await typeInto($<HTMLInputElement>('[data-testid="erd-model-delete-input"]')!, "mcm");
    expect(ok().disabled).toBe(false);
    await click('[data-testid="erd-model-delete-ok"]');
    expect(p.onDelete).toHaveBeenCalledWith("mcm");
  });

  it("거절되면 서버 문구를 그대로 보이고 확인 창을 닫지 않는다", async () => {
    const onDelete = vi.fn(async () => ({ ok: false as const, message: "확정본이 있어 작성자만으로는 지울 수 없습니다." }));
    await render({ onDelete });
    await pickRow("mls");
    await click('[data-testid="erd-models-delete"]');
    await typeInto($<HTMLInputElement>('[data-testid="erd-model-delete-input"]')!, "mls");
    await click('[data-testid="erd-model-delete-ok"]');
    expect($('[data-testid="erd-model-delete-error"]')!.textContent).toBe("확정본이 있어 작성자만으로는 지울 수 없습니다.");
    expect($('[data-testid="erd-model-delete"]')).not.toBeNull();
  });
});
