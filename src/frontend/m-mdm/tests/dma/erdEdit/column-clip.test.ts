/** @vitest-environment happy-dom */
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearClip, readClip, writeClip } from "../../../pages/dma/erdEdit/canvas/erd-clipboard";
import { ColumnGrid } from "../../../pages/dma/erdEdit/panels/ColumnGrid";
import { copyColumns, pasteColumnsPlan } from "../../../pages/dma/erdEdit/state/column-clip";
import { flush, settleGrid } from "../../dme/helpers/render";
import { menuModel } from "./erd-fixtures";
import { fakeCtx, inDoc, installStorage, key, mount, type Mounted } from "./grid-fixtures";

let n = 0;
const newId = () => `c-new${++n}`;

describe("컬럼 복사·붙이기 순수 함수(p7)", () => {
  it("표 안 순서대로 복사하고, 다른 표의 컬럼·없는 컬럼은 뺀다", () => {
    const clip = copyColumns(menuModel(), "mcm", "t-1", ["c-4", "c-1", "c-3", "zz"]);
    expect(clip?.columns.map((c) => c.id)).toEqual(["c-1", "c-4"]);
    expect(clip).toMatchObject({ kind: "columns", modelId: "mcm", table: "t-1" });
    expect(copyColumns(menuModel(), "mcm", "t-1", [])).toBeNull();
  });

  it("같은 표에 붙이면 물리명 _COPY·논리명 「… 복사」, 고른 컬럼 바로 뒤 자리", () => {
    const m = menuModel();
    const clip = copyColumns(m, "mcm", "t-1", ["c-1", "c-2"])!;
    n = 0;
    const plan = pasteColumnsPlan({ model: m, modelId: "mcm", tableId: "t-1", clip, afterColumnId: "c-1", newId });
    expect(plan.error).toBeNull();
    expect(plan.columnIds).toEqual(["c-new1", "c-new2"]);
    expect(plan.commands).toMatchObject([
      { op: "addColumn", id: "c-new1", table: "t-1", phys: "MENU_ID_COPY", logical: "메뉴아이디 복사", position: 1, notNull: true },
      { op: "addColumn", id: "c-new2", table: "t-1", phys: "OBJECT_ID_COPY", logical: "오브젝트아이디 복사", position: 2, length: 50 },
    ]);
  });

  it("다른 표에는 이름이 비어 있으면 원래 이름 그대로 붙이고, 자리를 모르면 position 을 두지 않는다", () => {
    const m = menuModel();
    const clip = copyColumns(m, "mcm", "t-1", ["c-4"])!;
    const plan = pasteColumnsPlan({ model: m, modelId: "mcm", tableId: "t-2", clip, afterColumnId: null, newId });
    expect(plan.commands).toHaveLength(1);
    const cmd = plan.commands[0] as Record<string, unknown>;
    expect(cmd).toMatchObject({ op: "addColumn", table: "t-2", phys: "MENU_NM", logical: "메뉴명" });
    expect("position" in cmd).toBe(false);
  });

  it("거절 — 클립 없음·표 묶음·다른 모델·표 없음", () => {
    const m = menuModel();
    const base = { model: m, modelId: "mcm", tableId: "t-1", afterColumnId: null, newId };
    expect(pasteColumnsPlan({ ...base, clip: null }).error).toContain("복사한 컬럼이 없습니다");
    expect(pasteColumnsPlan({ ...base, clip: { kind: "tables", modelId: "mcm", tables: [], relations: [] } }).error).toContain("표는 캔버스");
    const other = copyColumns(m, "other", "t-1", ["c-1"])!;
    expect(pasteColumnsPlan({ ...base, clip: other }).error).toContain("다른 모델");
    const ok = copyColumns(m, "mcm", "t-1", ["c-1"])!;
    expect(pasteColumnsPlan({ ...base, tableId: "nope", clip: ok }).error).toContain("표를 먼저");
  });
});

describe("컬럼 그리드 ⌘/Ctrl+C·V(p7)", () => {
  let view: Mounted | null = null;
  beforeEach(() => {
    installStorage();
    clearClip();
  });
  afterEach(() => {
    view?.unmount();
    view = null;
    clearClip();
    vi.unstubAllGlobals();
  });
  const cell = (rowId: string, colId: string) => view!.host.querySelector<HTMLElement>(`.ag-row[row-id="${rowId}"] [col-id="${colId}"]`)!;

  it("행을 고르고 Ctrl+C 로 복사하고, Ctrl+V 로 같은 표에 addColumn 한 묶음을 보낸다", async () => {
    const f = fakeCtx();
    view = await mount(createElement(ColumnGrid, { ctx: f.ctx, tableId: "t-1" }));
    await settleGrid(inDoc("erd-columns")!);
    await act(async () => {
      cell("c-4", "phys").click();
    });
    await flush();
    await key(cell("c-4", "phys"), { key: "c", ctrlKey: true });
    expect(readClip()).toMatchObject({ kind: "columns", table: "t-1", columns: [{ id: "c-4" }] });
    expect(f.notify).toHaveBeenCalledWith(expect.stringContaining("복사했습니다"));
    await key(cell("c-4", "phys"), { key: "v", ctrlKey: true });
    await flush();
    expect(f.apply).toHaveBeenCalledTimes(1);
    const [commands, label] = f.apply.mock.calls[0];
    expect(label).toBe("컬럼 붙여넣기");
    expect(commands).toMatchObject([{ op: "addColumn", table: "t-1", phys: "MENU_NM_COPY", logical: "메뉴명 복사" }]);
  });

  it("복사한 것이 없으면 붙이지 않고 알린다. 행을 안 골랐으면 복사하지 않는다", async () => {
    const f = fakeCtx();
    view = await mount(createElement(ColumnGrid, { ctx: f.ctx, tableId: "t-1" }));
    await settleGrid(inDoc("erd-columns")!);
    await key(inDoc("erd-columns")!, { key: "c", metaKey: true });
    expect(f.notify).toHaveBeenLastCalledWith(expect.stringContaining("먼저 고르세요"), "warn");
    expect(readClip()).toBeNull();
    await key(inDoc("erd-columns")!, { key: "v", metaKey: true });
    expect(f.apply).not.toHaveBeenCalled();
    writeClip({ kind: "tables", modelId: "mcm", tables: [], relations: [] });
    await key(inDoc("erd-columns")!, { key: "v", metaKey: true });
    expect(f.apply).not.toHaveBeenCalled();
  });
});
