/** @vitest-environment happy-dom */
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ErdEditContext } from "../../../pages/dma/erdEdit/edit-context";
import { ColumnGrid, requestColumnFocus } from "../../../pages/dma/erdEdit/panels/ColumnGrid";
import { flush, selectValue, settleGrid, typeInto } from "../../dme/helpers/render";
import {
  APPLIED, NO_MODEL_RIGHTS, READ_ONLY, conflict, fakeCtx, inDoc, installStorage, key, mount, needsChoice, previewOf, stubOasis, wait,
  type Mounted,
} from "./grid-fixtures";
import { MENU_DIAGRAMS, column, menuModel, stateOf } from "./erd-fixtures";

const originalFetch = globalThis.fetch;
let view: Mounted | null = null;

beforeEach(() => installStorage());
afterEach(() => {
  view?.unmount();
  view = null;
  globalThis.fetch = originalFetch;
  vi.unstubAllGlobals();
});

async function open(ctx: ErdEditContext) {
  view = await mount(createElement(ColumnGrid, { ctx, tableId: "t-1" }));
  await settleGrid(inDoc("erd-columns")!);
}
const input = () => inDoc<HTMLInputElement>("erd-grid-input")!;
const cell = (rowId: string, colId: string) => view!.host.querySelector<HTMLElement>(`.ag-row[row-id="${rowId}"] [col-id="${colId}"]`);

/**
 * 칸 편집기를 연다 — ag-grid 기본(더블클릭, 안 되면 초점 칸의 F2). happy-dom 에서 어느 쪽이 도는지는 Step 10 이 정한다.
 * 둘 다 편집기를 열지 못하면 실패 문구로 알린다.
 */
async function openEditor(rowId: string, colId: string): Promise<HTMLInputElement> {
  await act(async () => {
    cell(rowId, colId)!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  });
  await flush();
  let editor = cell(rowId, colId)!.querySelector("input");
  if (!editor) {
    await act(async () => {
      cell(rowId, colId)!.focus();
      cell(rowId, colId)!.dispatchEvent(new KeyboardEvent("keydown", { key: "F2", bubbles: true }));
    });
    await flush();
    editor = cell(rowId, colId)!.querySelector("input");
  }
  expect(editor, "더블클릭·F2 둘 다 칸 편집기를 열지 못했다(Step 10)").not.toBeNull();
  return editor!;
}

describe("컬럼 그리드 편집", () => {
  it("그리드에서 Ctrl+Enter 는 입력 칸으로 초점을 옮기고, 논리명을 넣고 Enter 하면 addColumn 한 건을 보낸다", async () => {
    stubOasis({ "erdEdit/compare": () => previewOf("MENU_DESC") });
    const f = fakeCtx();
    await open(f.ctx);
    await key(inDoc("erd-columns")!, { key: "Enter", ctrlKey: true });
    expect(document.activeElement).toBe(input());
    expect(f.apply).not.toHaveBeenCalled();
    await typeInto(input(), "메뉴설명");
    await key(input(), { key: "Enter" });
    await flush();
    expect(f.apply).toHaveBeenCalledTimes(1);
    const [commands, label] = f.apply.mock.calls[0];
    expect(label).toBe("컬럼 추가");
    expect(commands).toEqual([{ op: "addColumn", id: expect.stringMatching(/^c-/), table: "t-1", logical: "메뉴설명" }]);
    expect(input().value).toBe("");
    expect(document.activeElement).toBe(input()); // 이어서 다음 컬럼을 넣는다
  });

  it("Ctrl+Shift+Enter 는 [addColumn, setPrimaryKey] 한 묶음을 같은 새 id 로 보낸다", async () => {
    stubOasis({ "erdEdit/compare": () => previewOf("MENU_SEQ") });
    const f = fakeCtx();
    await open(f.ctx);
    await typeInto(input(), "메뉴순번");
    await key(input(), { key: "Enter", ctrlKey: true, shiftKey: true });
    await flush();
    const [commands, label] = f.apply.mock.calls[0];
    expect(label).toBe("PK 컬럼 추가");
    expect(commands).toEqual([
      { op: "addColumn", id: expect.stringMatching(/^c-/), table: "t-1", logical: "메뉴순번", position: 1 },
      { op: "setPrimaryKey", table: "t-1", columns: ["c-1", commands[0].id] },
    ]);
  });

  it("NEEDS_CHOICE 면 토막 고르기 창을 띄우고, 고른 약어로 phys·추천 도메인을 넣어 같은 묶음을 다시 보낸다", async () => {
    const calls = stubOasis({
      "erdEdit/compare": (p) => (p.phys === "MENU_EXPL" ? previewOf("MENU_EXPL", { recommendedDomainId: 7, status: "OK" }) : previewOf("MENU_DESC")),
    });
    let n = 0;
    const f = fakeCtx({}, (commands) => (n++ === 0 ? needsChoice(String(commands[0].id)) : APPLIED));
    await open(f.ctx);
    await typeInto(input(), "메뉴설명");
    await key(input(), { key: "Enter" });
    await flush();
    expect(inDoc("erd-token-choice")).not.toBeNull();
    expect(inDoc<HTMLButtonElement>("erd-token-apply")!.disabled).toBe(true); // 둘째 토막을 아직 고르지 않았다
    await selectValue(inDoc<HTMLSelectElement>("erd-token-2")!, "EXPL");
    expect(inDoc("erd-token-phys")!.textContent).toBe("MENU_EXPL");
    await act(async () => inDoc<HTMLButtonElement>("erd-token-apply")!.click());
    await flush();
    await flush();
    expect(calls.some((c) => c.action === "compare" && c.params.phys === "MENU_EXPL")).toBe(true);
    expect(f.apply).toHaveBeenCalledTimes(2);
    const first = f.apply.mock.calls[0][0];
    expect(f.apply.mock.calls[1][0]).toEqual([{ ...first[0], phys: "MENU_EXPL", domainId: 7 }]);
    expect(inDoc("erd-token-choice")).toBeNull();
  });

  it("미리보기는 입력이 300ms 멈춘 뒤 한 번 부르고, 늦게 온 옛 응답은 버린다", async () => {
    let release: (() => void) | null = null;
    const calls = stubOasis({
      "erdEdit/compare": (p) =>
        p.logical === "메뉴"
          ? new Promise((r) => { release = () => r(previewOf("MENU", { logicalName: "메뉴" })); })
          : previewOf("MENU_NM"),
    });
    await open(fakeCtx().ctx);
    const compares = () => calls.filter((c) => c.action === "compare").map((c) => c.params.logical);
    await typeInto(input(), "메");
    await wait(100);
    await typeInto(input(), "메뉴");
    await wait(400);
    expect(compares()).toEqual(["메뉴"]);
    await typeInto(input(), "메뉴명");
    await wait(400);
    expect(compares()).toEqual(["메뉴", "메뉴명"]);
    expect(inDoc("erd-grid-phys")!.textContent).toBe("MENU_NM");
    await act(async () => release!());
    await wait(20);
    expect(inDoc("erd-grid-phys")!.textContent).toBe("MENU_NM");
  });

  it("고른 컬럼의 논리명을 바꾸면서 미리보기 물리명도 함께 바꾼다", async () => {
    stubOasis({ "erdEdit/compare": () => previewOf("MENU_NAME", { logicalName: "메뉴 이름" }) });
    const f = fakeCtx();
    await open(f.ctx);
    await act(async () => requestColumnFocus("c-4"));
    await flush();
    expect(inDoc("erd-grid-target")!.textContent).toBe("MENU_NM");
    await typeInto(input(), "메뉴이름");
    await wait(400);
    await act(async () => inDoc<HTMLButtonElement>("erd-grid-rename")!.click());
    await flush();
    expect(f.apply).toHaveBeenCalledWith([{ op: "updateColumn", id: "c-4", set: { logical: "메뉴이름", phys: "MENU_NAME" } }], "논리명 바꾸기");
  });

  it("편집 문맥의 고른 컬럼(nav.selectColumn 결과)을 따라 그 행을 고른다", async () => {
    stubOasis({});
    await open(fakeCtx({ selectedColumnId: "c-4" }).ctx);
    await flush();
    expect(inDoc("erd-grid-target")!.textContent).toBe("MENU_NM");
  });

  it("도메인 칸에 도메인명을 넣고 Enter 하면 룰 편집 도메인 검색으로 찾아 applyDomain 을 보낸다", async () => {
    const calls = stubOasis({
      "ruleEdit/search": () => ({ rows: [{ domainId: 7, stdName: "NM_100", domainName: "이름100", dataType: "STRING", length: 100 }] }),
    });
    const f = fakeCtx();
    await open(f.ctx);
    await act(async () => requestColumnFocus("c-4"));
    await flush();
    const dom = inDoc<HTMLInputElement>("erd-grid-domain")!;
    await typeInto(dom, "이름100");
    await key(dom, { key: "Enter" });
    await flush();
    await flush();
    expect(calls.find((c) => c.service === "ruleEdit")?.params).toEqual({ target: "DOMAIN", keyword: "이름100" });
    expect(f.apply).toHaveBeenCalledWith([{ op: "applyDomain", id: "c-4", domainId: 7 }], "도메인 적용");
  });

  it("모델을 고칠 수 없으면 입력 칸을 막고 이유를 보이며, Ctrl+Enter 가 아무것도 보내지 않는다", async () => {
    stubOasis({});
    const f = fakeCtx({ rights: NO_MODEL_RIGHTS });
    await open(f.ctx);
    expect(input().disabled).toBe(true);
    expect(inDoc("erd-grid-reason")!.textContent).toBe(READ_ONLY);
    await key(inDoc("erd-columns")!, { key: "Enter", ctrlKey: true });
    expect(f.apply).not.toHaveBeenCalled();
  });

  it("거절된 칸 편집은 원래 값으로 돌아오고, 마지막 거절 칸에 서버 문구를 단다", async () => {
    stubOasis({});
    const f = fakeCtx({}, () => conflict("c-4", "logical"));
    await open(f.ctx);
    const editor = await openEditor("c-4", "logical");
    await typeInto(editor, "메뉴이름");
    await key(editor, { key: "Enter" });
    await flush();
    await flush();
    expect(f.apply).toHaveBeenCalledWith([{ op: "updateColumn", id: "c-4", set: { logical: "메뉴이름" } }], "논리명 편집");
    expect(cell("c-4", "logical")!.textContent).toBe("메뉴명");
    // FE1 의 apply 는 거절 칸을 ctx.highlight 로 올린다 — 그 문맥으로 다시 그린다.
    await view!.rerender(createElement(ColumnGrid, {
      ctx: { ...f.ctx, highlight: { code: "CONFLICT", elementId: "c-4", property: "logical", message: "다른 세션이 먼저 바꾼 값입니다", mine: "메뉴이름" } },
      tableId: "t-1",
    }));
    await flush();
    expect(cell("c-4", "logical")!.classList.contains("cell-mdm-invalid")).toBe(true);
  });
});

describe("감사 컬럼 보기 — 컬럼 그리드", () => {
  /** 메뉴 표에 감사 컬럼 하나(C_AT)를 끝에 더한 상태. */
  const auditState = () => {
    const m = menuModel();
    m.tables["t-1"].columnOrder.push("c-a1");
    m.columns["c-a1"] = column("t-1", "C_AT", "생성일시");
    return stateOf(m, MENU_DIAGRAMS);
  };
  const rowIds = () => [...view!.host.querySelectorAll(".ag-center-cols-container .ag-row")].map((r) => r.getAttribute("row-id"));

  it("숨김이 기본 — 감사 컬럼 행을 그리지 않는다. 켜면 보인다", async () => {
    const f = fakeCtx({ state: auditState(), audit: { show: false, setShow: vi.fn() } });
    await open(f.ctx);
    expect(rowIds()).toEqual(["c-1", "c-2", "c-4"]);
    await view!.rerender(createElement(ColumnGrid, { ctx: { ...f.ctx, audit: { show: true, setShow: vi.fn() } }, tableId: "t-1" }));
    await settleGrid(inDoc("erd-columns")!);
    expect(rowIds()).toEqual(["c-1", "c-2", "c-4", "c-a1"]);
  });

  it("숨긴 감사 컬럼이 있으면 제목 옆에 「감사 n 숨김」 힌트를 단다. 켜면 사라진다", async () => {
    const f = fakeCtx({ state: auditState(), audit: { show: false, setShow: vi.fn() } });
    await open(f.ctx);
    expect(inDoc("erd-audit-hint")?.textContent).toBe("감사 1 숨김");
    await view!.rerender(createElement(ColumnGrid, { ctx: { ...f.ctx, audit: { show: true, setShow: vi.fn() } }, tableId: "t-1" }));
    await settleGrid(inDoc("erd-columns")!);
    expect(inDoc("erd-audit-hint")).toBeNull();
  });

  it("감사 행에 초점이 있다가 보기를 끄면 초점을 풀어 입력 칸이 안 보이는 컬럼을 고치지 않는다", async () => {
    const f = fakeCtx({ state: auditState(), audit: { show: true, setShow: vi.fn() } });
    await open(f.ctx);
    await act(async () => requestColumnFocus("c-a1"));
    await flush();
    expect(inDoc("erd-grid-target")!.textContent).toBe("C_AT");
    await view!.rerender(createElement(ColumnGrid, { ctx: { ...f.ctx, audit: { show: false, setShow: vi.fn() } }, tableId: "t-1" }));
    await settleGrid(inDoc("erd-columns")!);
    await flush();
    expect(rowIds()).toEqual(["c-1", "c-2", "c-4"]);
    expect(inDoc("erd-grid-target")).toBeNull();
  });

  it("숨겨진 감사 컬럼으로 초점 요청이 오면(점프·새 컬럼·감사 이름으로 바꾼 칸) 보기를 켜고, 켜지면 그 행에 초점을 준다", async () => {
    const setShow = vi.fn();
    const f = fakeCtx({ state: auditState(), audit: { show: false, setShow } });
    await open(f.ctx);
    await act(async () => requestColumnFocus("c-a1"));
    await flush();
    expect(setShow).toHaveBeenCalledWith(true);
    expect(inDoc("erd-grid-target")).toBeNull(); // 아직 안 보이는 동안은 초점을 주지 않는다
    await view!.rerender(createElement(ColumnGrid, { ctx: { ...f.ctx, audit: { show: true, setShow } }, tableId: "t-1" }));
    await settleGrid(inDoc("erd-columns")!);
    await flush();
    expect(rowIds()).toContain("c-a1");
    expect(inDoc("erd-grid-target")!.textContent).toBe("C_AT");
  });

  it("다른 표의 컬럼 초점 요청은 보기를 켜지 않는다", async () => {
    const setShow = vi.fn();
    const m = menuModel();
    m.columns["c-b1"] = column("t-2", "U_AT", "수정일시");
    m.tables["t-2"].columnOrder.push("c-b1");
    const f = fakeCtx({ state: stateOf(m, MENU_DIAGRAMS), audit: { show: false, setShow } });
    await open(f.ctx);
    await act(async () => requestColumnFocus("c-b1"));
    await flush();
    expect(setShow).not.toHaveBeenCalled();
  });
});
