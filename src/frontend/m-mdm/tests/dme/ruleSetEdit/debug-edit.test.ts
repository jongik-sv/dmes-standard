/** @vitest-environment happy-dom */

// 룰 세트 디버거 값 고쳐 이어 실행 화면(4단계 계획 Task 11, 스펙 §2.4) — 변수 표 값 칸 편집·타입 거절(칸 되돌림)·[변수 추가]·[비우기]·
// [고침 취소]·툴바 문구·고친 지점 노드 표시·[지금 입력 저장] 기대값 막기·[처음부터]. execute 응답은 Task 4 골든 IF_FIRST_TRUE 에 edits 를 붙여 준다.
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ openRuleEdit: vi.fn(), openMdmPage: vi.fn(), varGrid: { current: null as Record<string, unknown> | null } }));

vi.mock("@/dme/rule-handoff", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/dme/rule-handoff")>()),
  openRuleEdit: (...args: unknown[]) => mocks.openRuleEdit(...args),
}));

vi.mock("@/shell", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shell")>()),
  openMdmPage: (...args: unknown[]) => mocks.openMdmPage(...args),
}));

// 변수 표(ariaLabel "커서 자리 변수")의 props 를 잡아 두고 실제 그리드를 그린다. 칸 편집은 AG Grid 가 행 객체를 먼저 바꾼 뒤
// onCellValueChanged 를 부르는 순서를 손으로 재현한다(happy-dom 에서 편집기를 띄우지 않는다).
vi.mock("@dk-oasis/shared/grid", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dk-oasis/shared/grid")>();
  const react = await import("react");
  return {
    ...actual,
    AgDataGrid: (props: Record<string, unknown>) => {
      if (props.ariaLabel === "커서 자리 변수") mocks.varGrid.current = props;
      return react.createElement(actual.AgDataGrid as unknown as React.ComponentType<Record<string, unknown>>, props);
    },
  };
});

import type { RunTrace, TraceEdit } from "../../../src/contract/engine-contract.generated";
import type { RuleIo, RuleSetView } from "../../../pages/dme/ruleSetEdit/types";
import { EDITED_EXPECTED_TITLE, NUMBER_REJECT, catchEditText } from "../../../pages/dme/ruleSetEdit/debugger/debug-model";
import { ADD_EXISTS_TEXT } from "../../../pages/dme/ruleSetEdit/debugger/VariablePanel";
import { EDITED_NODE_TITLE } from "../../../pages/dme/ruleSetEdit/canvas/nodes";
import { flush, selectValue, typeInto, visibleText } from "../helpers/render";
import { golden } from "../helpers/rule-set-golden";
import { byTestId, calls, click, inDoc, installServer, ok, openSet, q, settle, srv, uninstallServer } from "../helpers/rule-set-page";

type Src = "DICT" | "PROG" | "NONE";
const ioName = (n: string, source: Src | null, dataType: string | null = null) => ({ name: n, source, label: null, dataType, scale: null, dateString: false, maruCodeId: null });
function io(ruleId: string, conds: Array<[string, Src, string?]>, results: string[]): RuleIo {
  return {
    ruleId, ruleName: `${ruleId} 이름`, ruleKind: "DECISION", status: "INUSE", exists: true, releasedVer: 1, hitPolicy: "FIRST",
    conds: conds.map(([n, s, t]) => ioName(n, s, t ?? null)), results: results.map((r) => ioName(r, null, "STRING")),
  };
}
// GT_THK 는 NUMBER 로 선언한다(debug-mode.test.ts 와 같다). 폼이 글자로 보내므로 기록 값은 STRING 이고 편집 타입도 글자다.
const RULES: RuleIo[] = [io("GT_GRADE", [["GT_THK", "DICT", "NUMBER"]], ["GT_G"]), io("GT_FAST", [["GT_G", "NONE"]], ["GT_F"]), io("GT_SLOW", [["GT_G", "NONE"]], ["GT_S"])];
/** IF 갈래 e3 조건식 IO — 없으면 "조건식 정보 없음" 거부 검사로 세트 저장이 꺼진다. */
const COND_IO = { e3: { ok: true, message: null, vars: [ioName("GT_G", "NONE")] } };
const FIRST = golden("IF_FIRST_TRUE"); // start(1) r1(2) if1(3) r2(4) m1(5) end(6)

function viewOf(): RuleSetView {
  return {
    set: { setId: "GT_SET", setName: "골든", description: null, status: "INUSE", rowVersion: 1, ruleIds: ["GT_GRADE", "GT_FAST", "GT_SLOW"], flow: FIRST.flow, branched: true },
    rules: RULES,
    checks: [],
    condIo: COND_IO,
    editable: true,
    restorable: false,
    cases: [],
  };
}

type Row = Record<string, unknown>;
interface VarGridProps {
  data: Row[];
  columns: Array<{ key: string; editable?: boolean | ((r: Row) => boolean) }>;
  onCellValueChanged: (p: { rowKey: string; field: string; newValue: unknown; oldValue: unknown; row: Row }) => void;
}
const grid = () => mocks.varGrid.current as unknown as VarGridProps;
const gridRowOf = (name: string) => grid().data.find((r) => r.name === name);
const canEditCell = (name: string, over: Row = {}) => {
  const c = grid().columns.find((x) => x.key === "value")!;
  const row = { ...gridRowOf(name)!, ...over };
  return typeof c.editable === "function" ? c.editable(row) : !!c.editable;
};
/** AG Grid 처럼 행 객체의 값을 먼저 바꾸고 onCellValueChanged 를 부른다. 바꾼 행 객체를 돌려준다. */
async function editCell(name: string, text: string): Promise<Row> {
  const row = gridRowOf(name)!;
  const old = row.value;
  row.value = text;
  await act(async () => {
    grid().onCellValueChanged({ rowKey: name, field: "value", newValue: text, oldValue: old, row });
  });
  await flush();
  return row;
}

const status = () => visibleText(byTestId("dbg-status")).trim();
const lastExecute = () => calls("execute").at(-1)!.body.params as Record<string, unknown>;
const EDIT_IF1: TraceEdit[] = [{ beforeSeq: 3, nodeId: "if1", values: { GT_G: { type: "STRING", value: "B" } } }];
/** 골든 IF_FIRST_TRUE 에 edits 를 붙인 응답(서버가 받은 edit 를 그대로 되돌려 준다 — 스펙 §2.3). */
function editedReply(edits: TraceEdit[]) {
  const t = JSON.parse(JSON.stringify(FIRST.trace)) as RunTrace;
  return ok({ trace: { ...t, edits }, warnings: [] });
}

async function run(id: string) {
  await click(id);
  await settle(50);
}
async function openDebug() {
  srv.replies.execute = ok(FIRST.response);
  srv.replies.validate = ok({ condIo: COND_IO });
  await openSet("GT_SET", viewOf());
  await click("flow-mode-debug");
}
/** GT_THK=12 로 첫 [한 단계] 뒤 k 칸 더(서버 호출 1번). */
async function stepTo(k: number) {
  await openDebug();
  await typeInto(byTestId<HTMLInputElement>("dbg-input-GT_THK"), "12");
  await run("dbg-step");
  for (let i = 0; i < k; i++) await run("dbg-step");
}

beforeEach(() => {
  installServer();
  localStorage.clear();
  mocks.openRuleEdit.mockReset();
  mocks.openMdmPage.mockReset();
  mocks.varGrid.current = null;
});

afterEach(() => {
  uninstallServer();
});

describe("디버거 값 고치기(4단계 E4)", () => {
  it("1. 값 칸을 고치면 고침 대기 — [한 단계] 가 editsJson 과 함께 다시 실행하고 '고침'·툴바 문구·노드 표시", async () => {
    await stepTo(2);
    expect(status()).toBe("3/6 · if1 실행 전");
    expect(canEditCell("GT_G")).toBe(true);
    expect(byTestId("var-edit-note")).not.toBeNull();
    await editCell("GT_G", "B");
    expect(gridRowOf("GT_G")).toMatchObject({ value: "B", state: "고침 대기" });
    expect(status()).toBe("3/6 · if1 실행 전 · 고침 대기 1건");
    expect(byTestId("dbg-step").parentElement!.getAttribute("data-tip")).toBe("고친 값으로 처음부터 다시 실행한 뒤 한 단계 (F10)");
    expect(calls("execute")).toHaveLength(1);

    srv.replies.execute = editedReply(EDIT_IF1);
    await run("dbg-step");
    expect(calls("execute")).toHaveLength(2);
    expect(lastExecute().recordJson).toBe('{"GT_THK":"12"}');
    expect(lastExecute().editsJson).toBe('[{"beforeSeq":3,"nodeId":"if1","values":{"GT_G":"B"}}]');
    expect(status()).toBe("4/6 · r2 실행 전 · 고친 값 1건");
    expect(gridRowOf("GT_G")).toMatchObject({ value: "B", state: "고침" });
    expect(byTestId("flow-node-edited-if1").getAttribute("title")).toBe(EDITED_NODE_TITLE);
    expect(q("flow-node-edited-r1")).toBeNull();
    expect(q("var-edit-cancel")).toBeNull();

    await run("dbg-finish"); // 대기가 없으므로 서버를 부르지 않는다
    expect(calls("execute")).toHaveLength(2);
    expect(canEditCell("GT_G")).toBe(false); // 끝(k = n)
    expect(byTestId<HTMLButtonElement>("var-add").disabled).toBe(true);
    expect(q("var-clear-GT_G")).toBeNull();
  });

  it("2. 원래 타입에 맞지 않는 값은 칸에서 거절하고 칸을 원래 값으로 되돌린다. NUMBER 는 글자 그대로 보낸다. LIST 는 고칠 수 없다", async () => {
    await stepTo(4); // m1 실행 전 — GT_F NUMBER 1
    const bad = await editCell("GT_F", "abc");
    expect(visibleText(byTestId("var-edit-error"))).toBe(NUMBER_REJECT);
    expect(gridRowOf("GT_F")).not.toBe(bad); // 새 행 객체로 다시 그려 AG Grid 가 원래 값을 보인다
    expect(gridRowOf("GT_F")).toMatchObject({ value: "1", state: "새" }); // r2 가 만든 값 — 거절 뒤 그대로
    await editCell("GT_F", "2.50");
    expect(q("var-edit-error")).toBeNull();
    expect(gridRowOf("GT_F")).toMatchObject({ value: "2.50", state: "고침 대기" });
    expect(canEditCell("GT_F", { editKind: null })).toBe(false); // LIST 줄은 editKind 가 null
    srv.replies.execute = editedReply([{ beforeSeq: 5, nodeId: "m1", values: { GT_F: { type: "NUMBER", value: "2.50" } } }]);
    await run("dbg-step");
    expect(lastExecute().editsJson).toBe('[{"beforeSeq":5,"nodeId":"m1","values":{"GT_F":2.50}}]');
  });

  it("3-1. [변수 추가] 는 레코드 입력이 막는 예약 이름(상수·EVAL_TS·_ 접두)을 같은 문구로 거절한다", async () => {
    await stepTo(2);
    await click("var-add");
    for (const name of ["EVAL_TS", "pi", "_hidden"]) {
      await typeInto(byTestId<HTMLInputElement>("var-add-name"), name);
      await click("var-add-ok");
      expect(visibleText(byTestId("var-edit-error"))).toBe(`예약된 레코드 키: ${name}`);
      expect(q("var-add-form")).not.toBeNull();
    }
    expect(status()).toBe("3/6 · if1 실행 전");
  });

  it("3-2. 받는 노드가 넣는 CATCH_* 는 고치지 않는다 — 칸 편집이 와도 고침 대기가 생기지 않고, [변수 추가] 는 대소문자 무시로 거절한다(Ruling 3)", async () => {
    await stepTo(2);
    await act(async () => {
      grid().onCellValueChanged({ rowKey: "CATCH_KIND", field: "value", newValue: "X", oldValue: "NO_RESULT", row: { name: "CATCH_KIND", value: "X", editKind: "STRING" } });
    });
    await flush();
    expect(status()).toBe("3/6 · if1 실행 전");
    expect(q("var-edit-cancel")).toBeNull();
    await click("var-add");
    await typeInto(byTestId<HTMLInputElement>("var-add-name"), "catch_msg");
    await click("var-add-ok");
    expect(visibleText(byTestId("var-edit-error"))).toBe(catchEditText("catch_msg"));
    expect(status()).toBe("3/6 · if1 실행 전");
  });

  it("3. [변수 추가]·[비우기]·[되돌리기]·[고침 취소]", async () => {
    await stepTo(2);
    await click("var-add");
    await typeInto(byTestId<HTMLInputElement>("var-add-name"), "gt_g");
    await selectValue(byTestId<HTMLSelectElement>("var-add-type"), "NUMBER");
    await typeInto(byTestId<HTMLInputElement>("var-add-value"), "007");
    await click("var-add-ok");
    expect(visibleText(byTestId("var-edit-error"))).toBe(ADD_EXISTS_TEXT);
    await typeInto(byTestId<HTMLInputElement>("var-add-name"), "GT_NEW");
    await click("var-add-ok");
    expect(q("var-add-form")).toBeNull();
    expect(gridRowOf("GT_NEW")).toMatchObject({ value: "7", state: "고침 대기" });

    await click("var-clear-GT_G");
    expect(gridRowOf("GT_G")).toMatchObject({ value: "NULL", state: "고침 대기" });
    expect(status()).toBe("3/6 · if1 실행 전 · 고침 대기 2건");
    await click("var-edit-undo-GT_G");
    expect(gridRowOf("GT_G")).toMatchObject({ value: "A", state: "새" });
    await click("var-edit-cancel");
    expect(gridRowOf("GT_NEW")).toBeUndefined();
    expect(q("var-edit-cancel")).toBeNull();
    expect(status()).toBe("3/6 · if1 실행 전");
    expect(calls("execute")).toHaveLength(1);
  });

  it("4. 추가·비우기를 함께 보내면 값 모양은 recordJson 과 같다(NUMBER 숫자·NULL null)", async () => {
    await stepTo(2);
    await click("var-add");
    await typeInto(byTestId<HTMLInputElement>("var-add-name"), "GT_NEW");
    await selectValue(byTestId<HTMLSelectElement>("var-add-type"), "NUMBER");
    await typeInto(byTestId<HTMLInputElement>("var-add-value"), "007");
    await click("var-add-ok");
    await click("var-clear-GT_G");
    await run("dbg-continue");
    expect(JSON.parse(lastExecute().editsJson as string)).toEqual([{ beforeSeq: 3, nodeId: "if1", values: { GT_NEW: 7, GT_G: null } }]);
    expect(lastExecute().editsJson as string).toContain('"GT_NEW":7');
  });

  it("5. 고친 값이 든 기록은 새 케이스 기대값을 채우지 않는다. [처음부터] 는 edit 없이 다시 실행한다", async () => {
    await stepTo(2);
    await editCell("GT_G", "B");
    srv.replies.execute = editedReply(EDIT_IF1);
    await run("dbg-step");
    expect(byTestId("case-save-current").getAttribute("title")).toBe(EDITED_EXPECTED_TITLE);
    await click("case-save-current");
    expect(inDoc<HTMLTextAreaElement>("case-modal-input").value).toBe('{"GT_THK":"12"}');
    expect(inDoc<HTMLTextAreaElement>("case-modal-expected").value).toBe("");
    await act(async () => {
      inDoc("case-modal-cancel").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    srv.replies.execute = ok(FIRST.response);
    await run("dbg-restart");
    expect(calls("execute")).toHaveLength(3);
    expect(lastExecute().editsJson).toBeUndefined();
    expect(status()).toBe("1/6 · start 실행 전");
    expect(q("flow-node-edited-if1")).toBeNull();
    expect(byTestId("case-save-current").getAttribute("title")).toBe("지금 입력을 케이스로 저장한다");
  });

  it("6. 입력을 바꾸면 고칠 수 없고 대기가 사라진다", async () => {
    await stepTo(2);
    await editCell("GT_G", "B");
    await typeInto(byTestId<HTMLInputElement>("dbg-input-GT_THK"), "13");
    expect(canEditCell("GT_G")).toBe(false);
    expect(gridRowOf("GT_G")).toMatchObject({ value: "A" });
    expect(q("var-edit-note")).toBeNull();
    expect(byTestId<HTMLButtonElement>("var-add").disabled).toBe(true);
  });
});
