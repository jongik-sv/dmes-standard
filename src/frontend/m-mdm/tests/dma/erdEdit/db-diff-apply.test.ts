/** @vitest-environment happy-dom */
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  APPLY_LIMIT, DbDiffApply, applyBlockReason, applySummaryText, diffRows, orderedSelection, removingCount, rejectionLine, selectionSummary,
  staleIdsOf, withFkCompanions,
} from "../../../pages/dma/erdEdit/panels/DbDiffApply";
import type { ErdDbDiffView, ErdDiffApplyResult, ErdRejection } from "../../../pages/dma/erdEdit/types";
import { flush, settleGrid } from "../../dme/helpers/render";
import { ALL_RIGHTS, NO_MODEL_RIGHTS, READ_ONLY_SHORT, confirmButton, fakeCtx, inDoc, installStorage, mount, stubOasis, type Mounted } from "./grid-fixtures";

const COL = "COLUMN_CHANGED:TB_MCM_SEC_MENU.MENU_NM";
const DROP = "TABLE_REMOVED:TB_MCM_SEC_OBJ";
const FK = "FK_ADDED:TB_MCM_SEC_MENU(OBJECT_ID)>TB_MCM_SEC_OBJ(OBJECT_ID)";
const DIFF: ErdDbDiffView = {
  modelId: "mcm", rev: 3, schema: "MCMAPUSER",
  items: [
    { id: COL, kind: "COLUMN_CHANGED", table: "TB_MCM_SEC_MENU", column: "MENU_NM",
      before: { dataType: "VARCHAR2", length: 200, scale: null, notNull: false }, after: { dataType: "VARCHAR2", length: 300, scale: null, notNull: false } },
    { id: DROP, kind: "TABLE_REMOVED", table: "TB_MCM_SEC_OBJ", column: null, before: null, after: null },
    { id: FK, kind: "FK_ADDED", table: "TB_MCM_SEC_MENU", column: null, before: null, after: null },
  ],
};
const SUMMARY = { items: 2, tablesAdded: 0, tablesRemoved: 0, columnsAdded: 0, columnsRemoved: 0, columnsChanged: 1, relationsAdded: 0,
  dbFkSet: 1, dbFkCleared: 0, removedIds: [] as string[] };
const APPLY_OK: ErdDiffApplyResult = { applied: true, rev: 4, rowVersion: 2, changes: [], warnings: [], rejection: null, summary: SUMMARY };
const STALE: ErdRejection = { code: "INVALID", commandIndex: 0, message: "차이 목록에 없거나 함께 골라야 할 항목이 빠진 항목 1개가 있습니다",
  hint: "compare kind=DB_DIFF 로 차이를 다시 읽고 고르세요", elementId: COL, property: "itemsJson", byRev: null, bySession: null,
  byUserId: null, current: null, choices: [COL], ownerId: null, userHint: "차이를 다시 읽은 뒤 항목을 다시 고르세요." };

const originalFetch = globalThis.fetch;
let view: Mounted | null = null;

beforeEach(() => installStorage());
afterEach(() => {
  view?.unmount();
  view = null;
  globalThis.fetch = originalFetch;
  vi.unstubAllGlobals();
});

const runBtn = () => inDoc<HTMLButtonElement>("erd-diff-apply-run")!;
/** ag-grid 는 row-id 속성 값을 HTML 이스케이프해 단다(_escapeString: & < > " '). FK_ADDED id 의 `>` 가 `&gt;` 로 들어간다. */
const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const agRowId = (id: string) => id.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
const box = (id: string) => view!.host.querySelector<HTMLInputElement>(`.ag-row[row-id="${CSS.escape(agRowId(id))}"] .ag-selection-checkbox input`)!;
async function check(id: string) {
  await act(async () => box(id).click());
  await flush();
}
async function open(ctx: Parameters<typeof DbDiffApply>[0]["ctx"], onReload = vi.fn()) {
  view = await mount(createElement(DbDiffApply, { ctx, diff: DIFF, onReload }));
  await settleGrid(inDoc("erd-diff-apply")!);
  return onReload;
}

describe("다시 가져오기 반영 — 순수 함수", () => {
  it("차이 행은 단계 1 과 같다", () => {
    expect(diffRows({ ...DIFF, items: [DIFF.items[0]] })).toEqual([
      { id: COL, kind: "컬럼 다름", table: "TB_MCM_SEC_MENU", column: "MENU_NM", before: "VARCHAR2(200)", after: "VARCHAR2(300)" },
    ]);
    expect(diffRows(null)).toEqual([]);
    const order = { id: "COLUMN_ORDER:TB_MCM_SEC_MENU", kind: "COLUMN_ORDER" as const, table: "TB_MCM_SEC_MENU", column: null, before: null, after: null };
    expect(diffRows({ ...DIFF, items: [order] })).toEqual([
      { id: order.id, kind: "컬럼 순서 다름", table: "TB_MCM_SEC_MENU", column: "", before: "", after: "" },
    ]);
  });

  it("고른 항목은 차이 목록 순서로 보내고, 종류별 수로 줄이고, 지우는 항목을 센다", () => {
    expect(orderedSelection(DIFF, [FK, "GONE:X", COL])).toEqual([COL, FK]);
    expect(selectionSummary(DIFF, [COL, FK])).toBe("컬럼 다름 1 · DB 에 생긴 FK 1");
    expect(removingCount(DIFF, [COL, DROP])).toBe(1);
    expect(orderedSelection(null, [COL])).toEqual([]);
  });

  it("FK_ADDED 를 고르면 차이 목록에 있는 부모 표 TABLE_ADDED 와 부모·자식 컬럼 COLUMN_ADDED 를 함께 보낸다", () => {
    const NEW_FK = "FK_ADDED:TB_A(P_ID,P_SEQ)>TB_NEW(ID,SEQ)";
    const v: ErdDbDiffView = { ...DIFF, items: [
      ...DIFF.items,
      { id: "COLUMN_ADDED:TB_A.P_SEQ", kind: "COLUMN_ADDED", table: "TB_A", column: "P_SEQ", before: null, after: null },
      { id: NEW_FK, kind: "FK_ADDED", table: "TB_A", column: null, before: null, after: null },
      { id: "TABLE_ADDED:TB_NEW", kind: "TABLE_ADDED", table: "TB_NEW", column: null, before: null, after: null },
      { id: "TABLE_ADDED:TB_OTHER", kind: "TABLE_ADDED", table: "TB_OTHER", column: null, before: null, after: null },
    ] };
    expect(withFkCompanions(v, [NEW_FK])).toEqual([NEW_FK, "TABLE_ADDED:TB_NEW", "COLUMN_ADDED:TB_A.P_SEQ"]);
    expect(orderedSelection(v, withFkCompanions(v, [NEW_FK]))).toEqual(["COLUMN_ADDED:TB_A.P_SEQ", NEW_FK, "TABLE_ADDED:TB_NEW"]);
    expect(withFkCompanions(v, [COL, FK])).toEqual([COL, FK]); // 부모 표가 이미 모델에 있으면 더할 것이 없다
    expect(withFkCompanions(null, [FK])).toEqual([FK]);
  });

  it("결과 요약은 0 이 아닌 칸만 적고, 지운 요소 수를 붙인다", () => {
    expect(applySummaryText(SUMMARY)).toBe("2건을 가져왔습니다 — 컬럼 바뀜 1 · DB FK 표시 1");
    expect(applySummaryText({ ...SUMMARY, items: 1, columnsChanged: 0, dbFkSet: 0, tablesRemoved: 1, removedIds: ["t-2", "c-3", "k-2"] }))
      .toBe("1건을 가져왔습니다 — 표 삭제 1 · 지운 요소 3개");
  });

  it("단추를 막는 이유는 권한 → 고른 수 → 상한 → 대기 묶음 순서다", () => {
    const none = new Set<string>();
    expect(applyBlockReason({ rights: NO_MODEL_RIGHTS, pendingIds: none }, 3)).toBe(`읽기 전용 — ${READ_ONLY_SHORT}`);
    expect(applyBlockReason({ rights: ALL_RIGHTS, pendingIds: none }, 0)).toBe("항목을 먼저 고르세요.");
    expect(applyBlockReason({ rights: ALL_RIGHTS, pendingIds: none }, APPLY_LIMIT + 1)).toBe("한 번에 500건까지 가져옵니다. 나눠서 고르세요.");
    expect(applyBlockReason({ rights: ALL_RIGHTS, pendingIds: new Set(["c-1"]) }, 1)).toBe("보내는 중인 변경이 끝난 뒤 가져오세요.");
    expect(applyBlockReason({ rights: ALL_RIGHTS, pendingIds: none }, 1)).toBeNull();
  });

  it("거절 문구는 message — userHint 이고 기계용 hint 는 보이지 않는다", () => {
    const r: ErdRejection = { ...STALE, hint: "getChangesSince(3) 로 다시 읽으세요", userHint: "화면이 낡았습니다. 새로 읽은 뒤 다시 하세요." };
    expect(rejectionLine(r)).toContain("화면이 낡았습니다");
    expect(rejectionLine(r)).not.toContain("getChangesSince");
  });

  it("거절 문구는 userHint 가 없으면 message 뿐이고, 낡은 항목 거절이면 낡은 id 를 꺼낸다", () => {
    expect(rejectionLine({ ...STALE, userHint: null })).toBe("차이 목록에 없거나 함께 골라야 할 항목이 빠진 항목 1개가 있습니다");
    expect(staleIdsOf(STALE)).toEqual([COL]);
    expect(staleIdsOf({ ...STALE, code: "CONFLICT" })).toEqual([]);
    expect(rejectionLine(null)).toBe("가져오기가 거절되었습니다.");
  });
});

describe("다시 가져오기 반영 — 화면", () => {
  it("고른 항목만 목록 순서로 APPLY_DIFF 로 보내고, 결과 요약을 보이고, 고르기를 비우고 차이를 다시 읽는다", async () => {
    const calls = stubOasis({ "erdEdit/import": () => APPLY_OK });
    const f = fakeCtx();
    const onReload = await open(f.ctx);
    expect(runBtn().disabled).toBe(true);
    expect(inDoc("erd-diff-apply-note")!.textContent).toBe("항목을 먼저 고르세요.");
    expect(runBtn().textContent).toBe("고른 항목 가져오기");
    expect(inDoc("erd-diff-apply-tip")!.title).toBe("항목을 먼저 고르세요.");
    await check(FK);
    await check(COL);
    expect(inDoc("erd-diff-apply-note")!.textContent).toBe("고른 2건: 컬럼 다름 1 · DB 에 생긴 FK 1");
    await act(async () => runBtn().click());
    await flush();
    await flush();
    const req = calls.find((c) => c.action === "import")!.params;
    expect(req).toMatchObject({ modelId: "mcm", kind: "APPLY_DIFF", baseRev: 3, session: "ui-test0001", source: "UI" });
    expect(JSON.parse(String(req.itemsJson))).toEqual([COL, FK]);
    expect(inDoc("erd-diff-apply-result")!.textContent).toBe("2건을 가져왔습니다 — 컬럼 바뀜 1 · DB FK 표시 1");
    expect(inDoc("erd-diff-apply-result")!.title).toBe("변경 번호 4");
    expect(onReload).toHaveBeenCalledTimes(1);
    expect(box(COL).checked).toBe(false);
  });

  it("표를 지우는 항목을 고르면 확인을 받은 뒤에만 보낸다", async () => {
    const calls = stubOasis({ "erdEdit/import": () => ({ ...APPLY_OK, summary: { ...SUMMARY, items: 1, columnsChanged: 0, dbFkSet: 0, tablesRemoved: 1 } }) });
    await open(fakeCtx().ctx);
    await check(DROP);
    await act(async () => runBtn().click());
    await flush();
    expect(calls.filter((c) => c.action === "import")).toHaveLength(0);
    expect(document.body.textContent).toContain("고른 항목 중 1건은 모델에서 표·컬럼을 지웁니다");
    await act(async () => confirmButton()!.click());
    await flush();
    await flush();
    expect(calls.filter((c) => c.action === "import")).toHaveLength(1);
  });

  it("확인창이 떠 있는 동안 단추를 막고, 취소하면 보내지 않고 다시 연다", async () => {
    const calls = stubOasis({ "erdEdit/import": () => APPLY_OK });
    await open(fakeCtx().ctx);
    await check(DROP);
    await act(async () => runBtn().click());
    await flush();
    expect(runBtn().disabled).toBe(true);
    const cancel = Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent?.trim() === "취소");
    await act(async () => cancel!.click());
    await flush();
    expect(runBtn().disabled).toBe(false);
    expect(calls.filter((c) => c.action === "import")).toHaveLength(0);
  });

  it("낡은 항목이면 서버 문구를 알리고, 낡은 건수를 보이고, 차이를 다시 읽는다", async () => {
    stubOasis({ "erdEdit/import": () => ({ applied: false, rev: 3, rowVersion: null, changes: [], warnings: [], summary: null, rejection: STALE }) });
    const f = fakeCtx();
    const onReload = await open(f.ctx);
    await check(COL);
    await act(async () => runBtn().click());
    await flush();
    await flush();
    expect(f.notify).toHaveBeenCalledWith("차이 목록에 없거나 함께 골라야 할 항목이 빠진 항목 1개가 있습니다 — 차이를 다시 읽은 뒤 항목을 다시 고르세요.", "error");
    expect(inDoc("erd-diff-apply-stale")!.textContent).toBe("고른 항목 중 1건을 넣을 수 없습니다(차이 목록에 없거나 함께 고를 항목이 빠짐). 차이를 다시 읽었으니 다시 고르세요.");
    expect(inDoc("erd-diff-apply-result")).toBeNull();
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it("보내는 중인 묶음이 있거나 모델을 고칠 수 없으면 단추를 막고 이유를 보인다", async () => {
    stubOasis({});
    await open(fakeCtx({ pendingIds: new Set(["c-1"]) }).ctx);
    await check(COL);
    expect(runBtn().disabled).toBe(true);
    expect(inDoc("erd-diff-apply-note")!.textContent).toBe("고른 1건: 컬럼 다름 1 — 보내는 중인 변경이 끝난 뒤 가져오세요.");
    view!.unmount();
    view = null;
    await open(fakeCtx({ rights: NO_MODEL_RIGHTS }).ctx);
    expect(runBtn().disabled).toBe(true);
    expect(inDoc("erd-diff-apply-note")!.textContent).toBe(`읽기 전용 — ${READ_ONLY_SHORT}`);
    expect(inDoc("erd-diff-apply-tip")!.title).toBe(`읽기 전용 — ${READ_ONLY_SHORT}`);
  });

  it("모델을 바꾼 뒤 늦게 온 응답은 버린다", async () => {
    let release: (() => void) | null = null;
    stubOasis({ "erdEdit/import": () => new Promise((r) => { release = () => r(APPLY_OK); }) });
    const f = fakeCtx();
    const onReload = await open(f.ctx);
    await check(COL);
    await act(async () => runBtn().click());
    await flush();
    await view!.rerender(createElement(DbDiffApply, { ctx: { ...f.ctx, modelId: "mdm" }, diff: DIFF, onReload }));
    await act(async () => release!());
    await flush();
    await flush();
    expect(inDoc("erd-diff-apply-result")).toBeNull();
    expect(onReload).not.toHaveBeenCalled();
    expect(f.notify).not.toHaveBeenCalled();
  });
});
