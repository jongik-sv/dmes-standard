/** @vitest-environment happy-dom */
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { subscribeColumnFocus } from "../../../pages/dma/erdEdit/panels/ColumnGrid";
import { ColumnJump, JUMP_LIMIT, jumpRows } from "../../../pages/dma/erdEdit/panels/ColumnJump";
import { flush, typeInto } from "../../dme/helpers/render";
import { bigState, menuModel } from "./erd-fixtures";
import { fakeCtx, inDoc, installStorage, key, mount, stubOasis, type Mounted } from "./grid-fixtures";

const originalFetch = globalThis.fetch;
let view: Mounted | null = null;

beforeEach(() => {
  installStorage();
  stubOasis({});
});
afterEach(() => {
  view?.unmount();
  view = null;
  globalThis.fetch = originalFetch;
  vi.unstubAllGlobals();
});

describe("컬럼 점프(Ctrl/⌘+O·Alt+O)", () => {
  it("고른 표의 컬럼만, 표가 없으면 모든 표를 물리명 순으로 찾고, 상한을 넘으면 남은 수를 센다", () => {
    const m = menuModel();
    expect(jumpRows(m, "t-1", "메뉴").rows.map((r) => r.id)).toEqual(["c-1", "c-4"]);
    expect(jumpRows(m, "t-1", "object").rows.map((r) => r.id)).toEqual(["c-2"]);
    expect(jumpRows(m, null, "OBJECT_ID").rows.map((r) => [r.table, r.column])).toEqual([
      ["TB_MCM_SEC_MENU", "OBJECT_ID"], ["TB_MCM_SEC_OBJ", "OBJECT_ID"],
    ]);
    const big = jumpRows(bigState(3, 100).model, null, "");
    expect(big.rows).toHaveLength(JUMP_LIMIT);
    expect(big.more).toBe(300 - JUMP_LIMIT);
  });

  it("입력 칸에서 ↓ 로 고르고 Enter 하면 그 컬럼으로 가고, 그리드에 알리고, 창을 닫는다", async () => {
    const f = fakeCtx();
    const onClose = vi.fn();
    const heard: string[] = [];
    const off = subscribeColumnFocus((id) => heard.push(id));
    view = await mount(createElement(ColumnJump, { ctx: f.ctx, opened: true, onClose }));
    await flush();
    const box = inDoc<HTMLInputElement>("erd-jump-input")!;
    await typeInto(box, "메뉴");
    await key(box, { key: "ArrowDown" });
    await key(box, { key: "Enter" });
    off();
    expect(f.nav.selectColumn).toHaveBeenCalledWith("c-4");
    expect(heard).toEqual(["c-4"]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("닫혀 있으면 아무것도 그리지 않는다", async () => {
    view = await mount(createElement(ColumnJump, { ctx: fakeCtx().ctx, opened: false, onClose: () => {} }));
    expect(inDoc("erd-jump")).toBeNull();
  });
});
