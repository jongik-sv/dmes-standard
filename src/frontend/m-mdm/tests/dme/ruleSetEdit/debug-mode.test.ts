/** @vitest-environment happy-dom */

// 룰 세트 디버그 모드 화면(3단계 계획 Task 10 Step 2) — 단계 실행 툴바(E1)·중단점 메뉴(E2)·입력 패널·변수 표·조사식(E3)·식 평가(E5)·
// 테스트 케이스(E6)·실행 비교(E7)·값 표 탭·노드 상세. execute 응답은 Task 4 골든(IF_FIRST_TRUE → IF_NULL_ELSE)을 경로로 읽어 돌려준다.
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ openRuleEdit: vi.fn(), openMdmPage: vi.fn() }));

vi.mock("@/dme/rule-handoff", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/dme/rule-handoff")>()),
  openRuleEdit: (...args: unknown[]) => mocks.openRuleEdit(...args),
}));

vi.mock("@/shell", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shell")>()),
  openMdmPage: (...args: unknown[]) => mocks.openMdmPage(...args),
}));

import type { AstNode, RunTrace } from "../../../src/contract/engine-contract.generated";
import type { CaseRunResult, RuleIo, RuleSetCaseView, RuleSetView } from "../../../pages/dme/ruleSetEdit/types";
import { flush, selectValue, typeInto, visibleText } from "../helpers/render";
import { golden } from "../helpers/rule-set-golden";
import { byTestId, calls, click, inDoc, installServer, ok, openSet, pageContainer, q, settle, srv, uninstallServer } from "../helpers/rule-set-page";

type Src = "DICT" | "PROG" | "NONE";
const ioName = (n: string, source: Src | null, dataType: string | null = null) => ({ name: n, source, label: null, dataType, scale: null, dateString: false, maruCodeId: null });
function io(ruleId: string, conds: Array<[string, Src, string?]>, results: string[]): RuleIo {
  return {
    ruleId, ruleName: `${ruleId} 이름`, ruleKind: "DECISION", status: "INUSE", exists: true, releasedVer: 1, hitPolicy: "FIRST",
    conds: conds.map(([n, s, t]) => ioName(n, s, t ?? null)), results: results.map((r) => ioName(r, null, "STRING")),
  };
}
// GT_THK 는 NUMBER 로 선언한다 — 식 평가가 선언 타입으로 바꿔 `GT_THK > 10` 을 참으로 본다(declaredTypes).
const RULES: RuleIo[] = [io("GT_GRADE", [["GT_THK", "DICT", "NUMBER"]], ["GT_G"]), io("GT_FAST", [["GT_G", "NONE"]], ["GT_F"]), io("GT_SLOW", [["GT_G", "NONE"]], ["GT_S"])];

/** IF 갈래 e3 조건식 IO — 없으면 "조건식 정보 없음" 거부 검사로 세트 저장이 꺼진다. */
const COND_IO = { e3: { ok: true, message: null, vars: [ioName("GT_G", "NONE")] } };

const FIRST = golden("IF_FIRST_TRUE");
const SECOND = golden("IF_NULL_ELSE");

function viewOf(cases: RuleSetCaseView[] = []): RuleSetView {
  return {
    set: { setId: "GT_SET", setName: "골든", description: null, status: "INUSE", rowVersion: 1, ruleIds: ["GT_GRADE", "GT_FAST", "GT_SLOW"], flow: FIRST.flow, branched: true },
    rules: RULES,
    checks: [],
    condIo: COND_IO,
    editable: true,
    restorable: false,
    cases,
  };
}

const CASE_A: RuleSetCaseView = { caseId: 1, caseName: "케이스 1", inputJson: '{"GT_THK":"3"}', evalTs: null, expectedJson: '{\n  "GT_G": "A"\n}', description: "얇은 판", rowVersion: 0 };
const CASE_B: RuleSetCaseView = { caseId: 2, caseName: "케이스 2", inputJson: '{"GT_THK":12}', evalTs: null, expectedJson: null, description: null, rowVersion: 0 };

/** 식 `GT_THK > 10` 의 AST — Task 6 expr-eval 테스트와 같은 모양. */
const GT_AST: AstNode = { type: "INFIX_OPERATOR", value: ">", params: [{ type: "VARIABLE_OR_CONSTANT", value: "GT_THK" }, { type: "NUMBER_LITERAL", value: "10" }] } as AstNode;
const EXPR_OK = { condIo: {}, expr: { ast: GT_AST, refVars: ["GT_THK"], supported: true, problems: [] } };

/** 입력 GT_THK 를 바꾼 IF_FIRST_TRUE 기록 — 케이스 [디버그로 열기] 의 변수 표가 새 입력 기준인지 본다. */
function traceWithInput(thk: string): { trace: RunTrace; warnings: [] } {
  const t = JSON.parse(JSON.stringify(FIRST.trace)) as RunTrace;
  t.input = { GT_THK: { type: "STRING", value: thk } };
  return { trace: t, warnings: [] };
}

const caseResult = (caseId: number, over: Partial<CaseRunResult> = {}): CaseRunResult => ({
  caseId, caseName: `케이스 ${caseId}`, outcome: "OK", pass: true, mismatches: [], finalValues: { GT_G: "A" }, errors: [], ...over,
});

const status = () => visibleText(byTestId("dbg-status")).trim();
const nodeState = (id: string) => byTestId(`flow-node-${id}`).getAttribute("data-state");
const pressed = (id: string) => byTestId(id).getAttribute("aria-pressed");
const disabled = (id: string) => byTestId<HTMLButtonElement>(id).disabled;
const gridRow = (grid: string, rowId: string | number) =>
  pageContainer().querySelector<HTMLElement>(`[data-testid="${grid}"] .ag-center-cols-container .ag-row[row-id="${rowId}"]`);
const gridRowIds = (grid: string) =>
  Array.from(pageContainer().querySelectorAll(`[data-testid="${grid}"] .ag-center-cols-container .ag-row`)).map((r) => r.getAttribute("row-id"));
const lastExecute = () => calls("execute").at(-1)!.body.params as Record<string, unknown>;

async function clickEl(el: Element | null) {
  if (!el) throw new Error("누를 요소가 없다");
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flush();
}

/** 팝업(body 로 포털) 안 단추 누르기. */
async function clickDoc(id: string) {
  await clickEl(inDoc(id));
}

async function clickCell(grid: string, rowId: string | number, colId: string) {
  await clickEl(gridRow(grid, rowId)?.querySelector(`[col-id="${colId}"]`) ?? null);
}

async function key(el: Element, init: KeyboardEventInit): Promise<KeyboardEvent> {
  const ev = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  await act(async () => {
    el.dispatchEvent(ev);
  });
  await flush();
  return ev;
}

/** 편집 모드에서 노드를 골라 속성 패널을 연다. */
async function editNode(id: string) {
  await click("flow-mode-edit");
  await click(`flow-node-${id}`);
}

async function nodeMenu(id: string) {
  await act(async () => {
    byTestId(`flow-node-${id}`).dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 200, clientY: 120 }));
  });
  await flush();
}

/** 디버그 실행을 부르는 단추 — 응답을 기다린다. */
async function run(id: string) {
  await click(id);
  await settle(50);
}

async function openDebug(cases: RuleSetCaseView[] = []) {
  srv.replies.execute = ok(FIRST.response);
  srv.replies.validate = ok({ condIo: COND_IO });
  await openSet("GT_SET", viewOf(cases));
  await click("flow-mode-debug");
}

/** 디버그 모드에서 GT_THK=12 로 첫 [한 단계] 까지. */
async function firstStep(cases: RuleSetCaseView[] = []) {
  await openDebug(cases);
  await typeInto(byTestId<HTMLInputElement>("dbg-input-GT_THK"), "12");
  await run("dbg-step");
}

beforeEach(() => {
  installServer();
  localStorage.clear();
  mocks.openRuleEdit.mockReset();
  mocks.openMdmPage.mockReset();
});

afterEach(() => {
  uninstallServer();
});

describe("디버그 모드 — 단계 실행 툴바(E1)", () => {
  it("1. 기록 없음 문구 → [한 단계] 한 번 실행·커서 0, 두 번 더 → 3/6 if1 실행 전·변수 표 GT_G 새, F10 도 한 단계", async () => {
    await openDebug();
    expect(status()).toBe("아직 실행하지 않았다. [한 단계]·[계속]으로 시작한다");
    await typeInto(byTestId<HTMLInputElement>("dbg-input-GT_THK"), "12");
    await run("dbg-step");
    expect(calls("execute")).toHaveLength(1);
    expect(lastExecute().recordJson).toBe('{"GT_THK":"12"}');
    expect(status()).toBe("1/6 · start 실행 전");
    expect(nodeState("start")).toBe("current");
    expect(nodeState("r1")).toBe("next");

    await run("dbg-step");
    await run("dbg-step");
    expect(calls("execute")).toHaveLength(1);
    expect(status()).toBe("3/6 · if1 실행 전");
    const g = gridRow("var-grid", "GT_G");
    expect(g).not.toBeNull();
    expect(visibleText(g!)).toContain("새");

    const f10 = await key(byTestId("flow-canvas"), { key: "F10" });
    await settle(50);
    expect(f10.defaultPrevented).toBe(true);
    expect(status()).toBe("4/6 · r2 실행 전");
    await click("dbg-step-back");
    expect(status()).toBe("3/6 · if1 실행 전");
  });

  it("2. r2 우클릭 [중단점 켜기] → [처음부터] → [계속] 은 r2 에서 멈춘다. [끝내기] 는 완료 문구와 안 탄 r3 흐림", async () => {
    await firstStep();
    await click("flow-node-r2");
    await nodeMenu("r2");
    expect(visibleText(byTestId("flow-menu-item-bp-toggle"))).toBe("중단점 켜기");
    await click("flow-menu-item-bp-toggle");
    expect(localStorage.getItem("rsf:bp:GT_SET")).toBe('["r2"]');
    await nodeMenu("r2");
    expect(visibleText(byTestId("flow-menu-item-bp-toggle"))).toBe("중단점 끄기");
    await click("flow-menu-item-bp-toggle");
    await nodeMenu("r2");
    await click("flow-menu-item-bp-toggle");

    await run("dbg-restart");
    expect(status()).toBe("1/6 · start 실행 전");
    await run("dbg-continue");
    expect(status()).toBe("4/6 · r2 실행 전");
    await run("dbg-finish");
    expect(status()).toBe("완료 · 6단계 · 결과 변수 2개");
    expect(nodeState("r3")).toBe("dim");
    expect(calls("execute")).toHaveLength(1);
  });

  it("3. 지나지 않는 r3 에 [여기까지 실행] 이면 알림 — 툴바 [여기까지] 도 고른 노드 기준", async () => {
    await firstStep();
    await nodeMenu("r3");
    await click("flow-menu-item-run-to");
    await settle(50);
    expect(visibleText(byTestId("dbg-notice"))).toContain("이 입력으로는 이 노드를 지나지 않는다");
    expect(status()).toBe("1/6 · start 실행 전");

    expect(disabled("dbg-run-to")).toBe(true); // 고른 노드가 없다
    await click("flow-node-m1");
    expect(disabled("dbg-run-to")).toBe(false);
    await run("dbg-run-to");
    expect(status()).toBe("5/6 · m1 실행 전");
    expect(q("dbg-notice")).toBeNull();
  });

  it("4. 구조를 고치면 '지난 흐름 기준'·겹침 없음·옛 변수, [한 단계] 가 새로 실행하고 실행 비교에 경로 차이. 라벨만 고치면 배지 없음", async () => {
    await firstStep();
    await run("dbg-step");
    await run("dbg-step");
    expect(gridRow("var-grid", "GT_G")).not.toBeNull();

    // 라벨만 — 낡지 않는다(Review Focus 3).
    await editNode("if1");
    await typeInto(byTestId<HTMLInputElement>("flow-prop-label"), "등급 분기");
    await click("flow-mode-debug");
    expect(q("dbg-stale")).toBeNull();
    expect(nodeState("if1")).toBe("current");

    // 조건식 — 구조 키가 바뀐다.
    await editNode("if1");
    await typeInto(byTestId<HTMLTextAreaElement>("flow-prop-branch-e3-cond"), 'GT_G = "Z"');
    await settle(50);
    await click("flow-mode-debug");
    expect(visibleText(byTestId("dbg-stale"))).toContain("지난 흐름 기준");
    for (const id of ["start", "r1", "if1", "r2", "r3", "m1", "end"]) expect(nodeState(id), id).toBe("idle");
    expect(gridRow("var-grid", "GT_G")).not.toBeNull();

    srv.replies.execute = ok(SECOND.response);
    await run("dbg-step");
    expect(calls("execute")).toHaveLength(2);
    expect(q("dbg-stale")).toBeNull();
    expect(status()).toBe("1/6 · start 실행 전");

    await click("flow-tab-compare");
    const path = visibleText(byTestId("run-compare-path"));
    expect(visibleText(byTestId("run-compare-only-before"))).toContain("r2");
    expect(visibleText(byTestId("run-compare-only-after"))).toContain("r3");
    expect(path).toContain("이전에만");
    expect(path).toContain("지금만");
    expect(gridRowIds("run-compare-values")).toEqual(["GT_G", "GT_F", "GT_S"]);
    expect(gridRow("run-compare-values", "GT_F")!.className).toContain("rsf-cmp-diff");
  });

  it("실행 비교 탭 — 이전 실행이 없으면 안내 문구", async () => {
    await firstStep();
    await click("flow-tab-compare");
    expect(visibleText(byTestId("run-compare"))).toContain("이전 실행이 없다. 흐름을 고친 뒤 같은 입력으로 다시 돌리면 차이가 보인다");
  });
});

describe("디버그 모드 — 테스트 케이스(E6)", () => {
  it("5. [지금 입력 저장] 은 기대를 결과로 채우고 part=CASE 로 저장한 뒤 view 로 목록만 받는다 — dirty·모드·되돌리기·커서 그대로", async () => {
    await firstStep();
    await run("dbg-step");
    // 흐름을 고쳐 dirty 로 둔다(라벨 — 기록은 낡지 않는다).
    await editNode("if1");
    await typeInto(byTestId<HTMLInputElement>("flow-prop-label"), "등급 분기");
    expect(disabled("set-save")).toBe(false);
    await click("flow-mode-debug");
    expect(status()).toBe("2/6 · r1 실행 전");

    await click("case-save-current");
    expect(inDoc<HTMLInputElement>("case-modal-name").value).toBe("케이스 1");
    expect(inDoc<HTMLTextAreaElement>("case-modal-input").value).toBe('{"GT_THK":"12"}');
    expect(JSON.parse(inDoc<HTMLTextAreaElement>("case-modal-expected").value)).toEqual({ GT_G: "A", GT_F: "1" });

    srv.replies.save = ok({ setId: "GT_SET", rowVersion: 0, caseId: 1, checks: [] });
    srv.views.GT_SET = viewOf([{ ...CASE_A, inputJson: '{"GT_THK":"12"}' }]);
    const viewsBefore = calls("view").length;
    await clickDoc("case-modal-save");
    await settle(50);
    const params = calls("save")[0].body.params as Record<string, unknown>;
    expect(params).toMatchObject({ part: "CASE", setId: "GT_SET", caseName: "케이스 1", inputJson: '{"GT_THK":"12"}' });
    expect(typeof params.expectedJson).toBe("string");
    expect(JSON.parse(params.expectedJson as string)).toEqual({ GT_G: "A", GT_F: "1" });
    expect(calls("view")).toHaveLength(viewsBefore + 1);
    expect(gridRowIds("case-grid")).toEqual(["1"]);
    expect(document.querySelector('[data-testid="case-modal"]')).toBeNull();

    // Review Focus 2 — 모드·커서·dirty·되돌리기 그대로.
    expect(pressed("flow-mode-debug")).toBe("true");
    expect(status()).toBe("2/6 · r1 실행 전");
    await click("flow-mode-edit");
    expect(disabled("set-save")).toBe(false);
    expect(disabled("flow-undo")).toBe(false);
    await editNode("if1");
    expect(byTestId<HTMLInputElement>("flow-prop-label").value).toBe("등급 분기");
  });

  it("기록이 낡았거나 입력이 바뀌었으면 새 케이스의 기대 칸은 비어 있고, 입력·기대 JSON 이 객체가 아니면 저장하지 않는다", async () => {
    await firstStep();
    await typeInto(byTestId<HTMLInputElement>("dbg-input-GT_THK"), "7");
    await click("case-save-current");
    expect(inDoc<HTMLTextAreaElement>("case-modal-input").value).toBe('{"GT_THK":"7"}');
    expect(inDoc<HTMLTextAreaElement>("case-modal-expected").value).toBe("");
    await typeInto(inDoc<HTMLTextAreaElement>("case-modal-expected"), "[1]");
    await clickDoc("case-modal-save");
    expect(calls("save")).toHaveLength(0);
    expect(visibleText(inDoc("case-modal"))).toContain("JSON 객체");
    await clickDoc("case-modal-cancel");
    expect(document.querySelector('[data-testid="case-modal"]')).toBeNull();
  });

  it("6. [모두 실행] 은 runCases 로 지금 흐름을 보내고 요약·차이 표를 보인다. [디버그로 열기] 는 입력이 다르면 다시 실행한다", async () => {
    await firstStep([CASE_A, CASE_B]);
    expect(gridRowIds("case-grid")).toEqual(["1", "2"]);
    srv.replies.execute = ok({ cases: [caseResult(1), caseResult(2, { pass: null })] });
    await run("case-run-all");
    const params = lastExecute();
    expect(params).toMatchObject({ setId: "GT_SET", runCases: true, caseIds: "" });
    expect(typeof params.flowJson).toBe("string");
    expect(visibleText(byTestId("case-summary"))).toBe("1/1 통과");
    expect(visibleText(gridRow("case-grid", 1)!)).toContain("통과");
    expect(visibleText(gridRow("case-grid", 2)!)).toContain("실행만");

    srv.replies.execute = ok({ cases: [caseResult(1, { pass: false, mismatches: [{ key: "GT_G", expected: "B", actual: "A" }] }), caseResult(2, { pass: null })] });
    await run("case-run-all");
    expect(visibleText(byTestId("case-summary"))).toBe("0/1 통과");
    await clickCell("case-grid", 1, "caseName");
    await settle(50);
    expect(gridRowIds("case-diff")).toEqual(["GT_G"]);
    const diff = visibleText(gridRow("case-diff", "GT_G")!);
    expect(diff).toContain("B");
    expect(diff).toContain("A");

    // 기록(입력 12)이 있고 낡지 않은데 케이스 입력(3)이 다르다 → 다시 실행하고 변수 표가 케이스 입력 기준이다(P-D9).
    const before = calls("execute").length;
    srv.replies.execute = ok(traceWithInput("3"));
    await run("case-debug");
    expect(calls("execute")).toHaveLength(before + 1);
    expect(lastExecute().recordJson).toBe('{"GT_THK":"3"}');
    expect(byTestId<HTMLInputElement>("dbg-input-GT_THK").value).toBe("3");
    expect(status()).toBe("1/6 · start 실행 전");
    expect(visibleText(gridRow("var-grid", "GT_THK")!)).toContain("3");
    // 같은 입력이면 다시 부르지 않는다.
    await run("dbg-step");
    await run("case-debug");
    expect(calls("execute")).toHaveLength(before + 1);
    expect(status()).toBe("1/6 · start 실행 전");

    // 숫자 값 입력(12)은 글자로 바꾸지 않고 그 JSON 그대로 보낸다.
    await clickCell("case-grid", 2, "caseName");
    srv.replies.execute = ok(FIRST.response);
    await run("case-debug");
    expect(lastExecute().recordJson).toBe('{"GT_THK":12}');
  });

  it("오류로 끝난 케이스는 차이 표 대신 오류 문장을 보이고 코드는 title 에 둔다", async () => {
    await firstStep([CASE_A]);
    srv.replies.execute = ok({
      cases: [caseResult(1, { outcome: "ERROR", pass: false, errors: [{ stage: "INPUT_CHECK", code: "INVALID_INPUT_JSON", rowId: null, name: null, message: "케이스 입력이 JSON 객체가 아니다", detail: null }] })],
    });
    await run("case-run-all");
    await clickCell("case-grid", 1, "caseName");
    const err = byTestId("case-diff-error-0");
    expect(visibleText(err)).toBe("케이스 입력이 JSON 객체가 아니다");
    expect(err.getAttribute("title")).toContain("INVALID_INPUT_JSON");
  });

  it("고침 1 — 차이 표는 결과 키가 있고 값이 null 이면 NULL, 키가 없으면 '결과에 없음'", async () => {
    await firstStep([CASE_A]);
    srv.replies.execute = ok({
      cases: [
        caseResult(1, {
          pass: false,
          finalValues: { GT_G: "A", gt_f: null },
          mismatches: [
            { key: "GT_F", expected: "1", actual: null },
            { key: "GT_X", expected: "1", actual: null },
          ],
        }),
      ],
    });
    await run("case-run-all");
    await clickCell("case-grid", 1, "caseName");
    await settle(50);
    expect(gridRowIds("case-diff")).toEqual(["GT_F", "GT_X"]);
    expect(visibleText(gridRow("case-diff", "GT_F")!.querySelector('[col-id="actual"]')!).trim()).toBe("NULL");
    expect(visibleText(gridRow("case-diff", "GT_X")!.querySelector('[col-id="actual"]')!).trim()).toBe("결과에 없음");
  });

  it("고침 1 — 숫자 값 케이스를 불러오면 JSON 칸이 이기므로 폼을 끄고 안내한다. JSON 칸을 비우면 폼을 다시 쓰고 바꾼 값으로 새로 실행한다", async () => {
    await firstStep([CASE_B]);
    await clickCell("case-grid", 2, "caseName");
    await click("case-load");
    expect(byTestId<HTMLTextAreaElement>("dbg-json").value).toBe('{"GT_THK":12}');
    expect(byTestId<HTMLInputElement>("dbg-input-GT_THK").disabled).toBe(true);
    expect(byTestId("dbg-send-GT_THK").querySelector("input")!.disabled).toBe(true);
    expect(visibleText(byTestId("dbg-json-active"))).toContain("JSON 입력을 보낸다. 폼을 쓰려면 JSON 칸을 비운다");

    // JSON 칸 입력이 기록 입력과 다르다 → 다음 [한 단계] 가 JSON 원문으로 새로 실행한다.
    const before = calls("execute").length;
    await run("dbg-step");
    expect(calls("execute")).toHaveLength(before + 1);
    expect(lastExecute().recordJson).toBe('{"GT_THK":12}');

    await typeInto(byTestId<HTMLTextAreaElement>("dbg-json"), "");
    expect(q("dbg-json-active")).toBeNull();
    const field = byTestId<HTMLInputElement>("dbg-input-GT_THK");
    expect(field.disabled).toBe(false);
    await typeInto(field, "7");
    await run("dbg-step");
    expect(calls("execute")).toHaveLength(before + 2);
    expect(lastExecute().recordJson).toBe('{"GT_THK":"7"}');
    expect(status()).toBe("1/6 · start 실행 전");
  });

  it("7. [삭제] 는 한 번 더 확인한 뒤 caseDeleted 로 보낸다", async () => {
    await firstStep([CASE_A]);
    await clickCell("case-grid", 1, "caseName");
    await click("case-delete");
    expect(calls("save")).toHaveLength(0);
    srv.replies.save = ok({ setId: "GT_SET", rowVersion: null, caseId: 1, checks: [] });
    srv.views.GT_SET = viewOf([]);
    await click("case-delete-confirm");
    await settle(50);
    expect(calls("save")[0].body.params).toMatchObject({ part: "CASE", setId: "GT_SET", caseId: 1, rowVersion: 0, caseDeleted: true });
    expect(gridRowIds("case-grid")).toEqual([]);
  });

  it("[고치기] 는 케이스 값을 팝업에 채우고 caseId·rowVersion 과 함께 저장한다. [불러오기] 는 폼에 넣기만 한다", async () => {
    await firstStep([CASE_A]);
    await clickCell("case-grid", 1, "caseName");
    await click("case-load");
    expect(byTestId<HTMLInputElement>("dbg-input-GT_THK").value).toBe("3");
    expect(calls("execute")).toHaveLength(1);

    await click("case-edit");
    expect(inDoc<HTMLInputElement>("case-modal-name").value).toBe("케이스 1");
    expect(inDoc<HTMLInputElement>("case-modal-desc").value).toBe("얇은 판");
    await typeInto(inDoc<HTMLInputElement>("case-modal-name"), "얇은 판 케이스");
    srv.replies.save = ok({ setId: "GT_SET", rowVersion: 1, caseId: 1, checks: [] });
    srv.views.GT_SET = viewOf([{ ...CASE_A, caseName: "얇은 판 케이스", rowVersion: 1 }]);
    await clickDoc("case-modal-save");
    await settle(50);
    expect(calls("save")[0].body.params).toMatchObject({ part: "CASE", caseId: 1, rowVersion: 0, caseName: "얇은 판 케이스" });
    expect(visibleText(gridRow("case-grid", 1)!)).toContain("얇은 판 케이스");
  });

  it("14. [다시 불러오기] 로 view 를 새로 받으면 목록을 바꾸고 결과를 비운다. 세트 저장 뒤 다시 불러오기는 그대로 둔다", async () => {
    await firstStep([CASE_A]);
    srv.replies.execute = ok({ cases: [caseResult(1)] });
    await run("case-run-all");
    expect(visibleText(byTestId("case-summary"))).toBe("1/1 통과");

    // 세트 저장(자기 쓰기 뒤 load) — 목록·결과 그대로.
    await editNode("if1");
    await typeInto(byTestId<HTMLInputElement>("flow-prop-label"), "등급 분기");
    srv.replies.save = ok({ setId: "GT_SET", rowVersion: 2, checks: [] });
    srv.views.GT_SET = viewOf([CASE_A, CASE_B, { ...CASE_B, caseId: 3 }]);
    await click("set-save");
    await settle(50);
    await click("flow-mode-debug");
    expect(gridRowIds("case-grid")).toEqual(["1"]);
    expect(visibleText(byTestId("case-summary"))).toBe("1/1 통과");

    // [다시 불러오기](세트 저장이 MDM001 로 거부되면 툴바에 뜬다) — view 를 새로 받아 목록을 바꾸고 결과를 비운다.
    await editNode("if1");
    await typeInto(byTestId<HTMLInputElement>("flow-prop-label"), "등급 분기 2");
    srv.replies.save = { meta: { success: false, code: "MDM001", message: "다른 사용자가 수정했습니다" } };
    await click("set-save");
    await settle(50);
    srv.views.GT_SET = viewOf([CASE_A, CASE_B]);
    await click("set-reload");
    await settle(50);
    await click("flow-mode-debug");
    expect(gridRowIds("case-grid")).toEqual(["1", "2"]);
    expect(q("case-summary")).toBeNull();
  });
});

describe("디버그 모드 — 변수·조사식·식 평가·입력", () => {
  it("8. 식 평가 — validate 에 exprText 만 보내고 커서 ctx 로 참. 화면에서 못 푸는 식은 문구만, 최근 식을 누르면 칸에 채운다", async () => {
    await firstStep();
    await run("dbg-step");
    srv.replies.validate = ok(EXPR_OK);
    const input = byTestId<HTMLInputElement>("expr-input");
    await typeInto(input, "GT_THK > 10");
    await key(input, { key: "Enter" });
    await settle(50);
    const exprCalls = calls("validate").filter((c) => (c.body.params as Record<string, unknown>).exprText !== undefined);
    expect(exprCalls).toHaveLength(1);
    expect(exprCalls[0].body.params).toEqual({ exprText: "GT_THK > 10" });
    expect(visibleText(byTestId("expr-result")).trim()).toBe("참");
    expect(visibleText(byTestId("var-panel"))).toContain("참고용이다. 실행 판정은 서버가 한다");

    const executes = calls("execute").length;
    srv.replies.validate = ok({ condIo: {}, expr: { ...EXPR_OK.expr, supported: false } });
    await typeInto(input, "MASTER_AT(GT_THK)");
    await key(input, { key: "Enter" });
    await settle(50);
    expect(visibleText(byTestId("expr-result")).trim()).toBe("화면에서 계산할 수 없는 식이다");
    expect(calls("execute")).toHaveLength(executes);

    expect(visibleText(byTestId("expr-recent-0"))).toBe("MASTER_AT(GT_THK)");
    expect(visibleText(byTestId("expr-recent-1"))).toBe("GT_THK > 10");
    await click("expr-recent-1");
    expect(byTestId<HTMLInputElement>("expr-input").value).toBe("GT_THK > 10");
    expect(JSON.parse(localStorage.getItem("rsf:expr:GT_SET")!)).toEqual(["MASTER_AT(GT_THK)", "GT_THK > 10"]);
  });

  it("9. 조사식 — 변수 표 핀 칸을 누르면 고정되고, 흐름에 없는 이름은 '없는 변수'. 빼기로 푼다", async () => {
    localStorage.setItem("rsf:watch:GT_SET", JSON.stringify(["NOPE"]));
    await firstStep();
    await run("dbg-step");
    await run("dbg-step");
    expect(byTestId("var-watch-NOPE").getAttribute("data-missing")).toBe("true");
    expect(visibleText(byTestId("var-watch-NOPE"))).toContain("없는 변수");
    await clickCell("var-grid", "GT_G", "pin");
    const w = byTestId("var-watch-GT_G");
    expect(w.getAttribute("data-missing")).toBe("false");
    expect(visibleText(w)).toContain("A");
    expect(JSON.parse(localStorage.getItem("rsf:watch:GT_SET")!)).toEqual(["NOPE", "GT_G"]);
    await click("var-watch-remove-GT_G");
    expect(q("var-watch-GT_G")).toBeNull();
    // 이름 칸을 누르면 핀이 바뀌지 않는다.
    await clickCell("var-grid", "GT_G", "name");
    expect(q("var-watch-GT_G")).toBeNull();
  });

  it("10. 최근 입력 — 실행한 입력이 목록에 있고 고르면 폼에 채운다", async () => {
    await firstStep();
    await typeInto(byTestId<HTMLInputElement>("dbg-input-GT_THK"), "99");
    const sel = byTestId<HTMLSelectElement>("dbg-recent");
    const labels = Array.from(sel.options).map((o) => o.textContent ?? "");
    expect(labels.some((l) => l.includes('{"GT_THK":"12"}'))).toBe(true);
    await selectValue(sel, "0");
    expect(byTestId<HTMLInputElement>("dbg-input-GT_THK").value).toBe("12");
  });

  it("13. 노드 상세 — 커서 앞에서 실행된 노드는 기록 상세, 아직 실행하지 않은 노드는 문구", async () => {
    await firstStep();
    await run("dbg-step");
    await run("dbg-step");
    expect(status()).toBe("3/6 · if1 실행 전");
    await click("flow-node-r1");
    expect(q("sim-detail-reads")).not.toBeNull();
    await click("flow-node-if1");
    expect(visibleText(byTestId("sim-detail"))).toContain("아직 실행하지 않은 노드다");
    await click("flow-node-r3");
    expect(visibleText(byTestId("sim-detail"))).toContain("아직 실행하지 않은 노드다");
  });

  it("기록이 없으면 변수 자리에 '실행하면 커서 시점 값이 보인다'", async () => {
    await openDebug();
    expect(visibleText(byTestId("var-panel"))).toContain("실행하면 커서 시점 값이 보인다");
    expect(q("var-grid")).toBeNull();
  });

  it("11. 권한이 view·search 뿐이면 [디버그] 는 들어가지만 실행·케이스 쓰기·식 평가가 꺼져 있고 title 로 이유를 보인다", async () => {
    srv.rbacRows = ["search", "view"].map((action) => ({ objId: "ruleSetEdit", action, endpoint: "*", httpMethod: "*" }));
    await openDebug([CASE_A]);
    expect(pressed("flow-mode-debug")).toBe("true");
    for (const id of ["dbg-continue", "dbg-step", "dbg-restart", "dbg-finish", "case-run-all"]) {
      expect(disabled(id), id).toBe(true);
      expect(byTestId(id).getAttribute("title"), id).toBe("디버거는 편집 권한이 있어야 쓸 수 있다");
    }
    expect(disabled("case-save-current")).toBe(true);
    const expr = byTestId<HTMLInputElement>("expr-input");
    expect(expr.disabled).toBe(true);
    expect(expr.getAttribute("title")).toBe("식 평가는 편집 권한이 있어야 쓸 수 있다");
    await nodeMenu("r2");
    const runTo = byTestId<HTMLButtonElement>("flow-menu-item-run-to");
    expect(runTo.disabled).toBe(true);
    expect(runTo.getAttribute("title")).toBe("디버거는 편집 권한이 있어야 쓸 수 있다");
  });

  it("12. 아래 탭은 값 표·실행 비교·검사 결과이고 값 표 탭 안에 sim-values 가 있다", async () => {
    await firstStep();
    for (const id of ["flow-tab-values", "flow-tab-compare", "flow-tab-checks"]) expect(q(id), id).not.toBeNull();
    expect(byTestId("flow-bottom-body").querySelector('[data-testid="sim-values"]')).not.toBeNull();
    expect(q("flow-tab-sim")).toBeNull();
  });

  it("실행 응답의 경고는 값 표 탭에 코드 배지와 문구로 보인다", async () => {
    await openDebug();
    srv.replies.execute = ok({ ...FIRST.response, warnings: [{ code: "TEST_WARN", ruleId: "GT_GRADE", message: "경고 문구" }] });
    await typeInto(byTestId<HTMLInputElement>("dbg-input-GT_THK"), "12");
    await run("dbg-step");
    const w = visibleText(byTestId("flow-bottom-body").querySelector('[data-testid="sim-warnings"]') as HTMLElement);
    expect(w).toContain("TEST_WARN");
    expect(w).toContain("GT_GRADE");
    expect(w).toContain("경고 문구");
  });

  it("경고가 없는 응답에는 sim-warnings 가 없다", async () => {
    await firstStep();
    expect(q("sim-warnings")).toBeNull();
  });
});
