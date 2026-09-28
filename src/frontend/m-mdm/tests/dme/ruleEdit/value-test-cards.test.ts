/** @vitest-environment happy-dom */

// TSK-08-04 design §3.3·§6.7·I34 — 카드 ④ 값 테스트·⑤ 테스트 결과·⑥ 테스트 케이스 렌더. 카드 순서, 편집본 대상은 editable 일 때만,
// "돌리기" 가 execute 요청 본문(target·grids.rows·inputJson)을 만들고, 결과 카드가 결과 변수·적중 행을 보이며, 다른 버전 결과는 그 버전의
// 표를 따로 그린다. 케이스 빈 상태, "케이스로 저장"(part CASE), "모두 돌리기" 배지, "불러오기", 서버 오류 표시.
import { createElement, act, useEffect, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import { RULE_EDIT_CARDS, cardSegments, type RuleEditCardProps } from "../../../pages/dme/ruleEdit/cards";
import { TestCaseCard } from "../../../pages/dme/ruleEdit/cards/TestCaseCard";
import { TestResultCard } from "../../../pages/dme/ruleEdit/cards/TestResultCard";
import { ValueTestCard } from "../../../pages/dme/ruleEdit/cards/ValueTestCard";
import { DecisionTableCard } from "../../../pages/dme/ruleEdit/decision-table/DecisionTableCard";
import { RuleWorkbenchProvider, useRuleWorkbench } from "../../../pages/dme/ruleEdit/state/workbench-context";
import type { RuleEditView, ValueTestResult } from "../../../pages/dme/ruleEdit/types";
import { clearVersionViewCache } from "../../../pages/dme/ruleEdit/value-test/run-request";
import { RBAC_STORE_KEY, findButton, flush, installDomStorage, jsonResponse, selectValue, typeInto, visibleText } from "../helpers/render";
import { ast } from "../../helpers/parse-expr";
import { draftView, releasedView } from "./fixtures";

let container: HTMLDivElement;
let root: Root | null = null;
const originalFetch = globalThis.fetch;
let requests: Array<{ action: string; body: Record<string, unknown> }> = [];
let responses: Record<string, unknown> = {};
let versionView: RuleEditView;
let writes = 0;
let errors: string[] = [];

const CASES: NonNullable<RuleEditView["testCases"]> = [
  { caseId: 1, caseName: "A급 광폭", inputJson: '{"COIL_THK":"2.0","COIL_WID":"1200","SURF_GRD":"A"}', expectedJson: '{"QLTY_GRD":"A","PRC_FCT":1.05,"hit":1}', rowVersion: 0 },
  { caseId: 2, caseName: "폭 없음", inputJson: '{"COIL_THK":"2.0","SURF_GRD":null}', expectedJson: null, rowVersion: 3 },
];

function ok(result: unknown) {
  return { meta: { success: true }, data: { result } };
}

function okResult(over: Partial<ValueTestResult> = {}): ValueTestResult {
  return {
    target: "BODY",
    ver: 2,
    evalTs: "2026-09-26 10:00:00",
    outcome: "OK",
    results: { QLTY_GRD: "A", PRC_FCT: "1.05" },
    hits: [{ rowId: 1, seq: 1, groupChoices: {} }],
    defaultApplied: false,
    trace: [
      { rowId: 1, seq: 1, evaluated: true, hit: true, firstFalseVarId: null },
      { rowId: 2, seq: 2, evaluated: true, hit: false, firstFalseVarId: 3 },
    ],
    errors: [],
    warnings: [],
    cellErrors: [],
    skippedRows: [],
    ...over,
  };
}

function propsOf(view: RuleEditView, over: Partial<RuleEditCardProps> = {}): RuleEditCardProps {
  return {
    view,
    me: view.me,
    editable: view.editable,
    reload: async () => {},
    selectVer: async () => {},
    notify: () => {},
    runWrite: async (fn) => {
      try {
        const r = await fn();
        writes += 1;
        return r;
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
        return undefined;
      }
    },
    setDirty: () => {},
    canDo: () => true,
    busy: false,
    ...over,
  };
}

/** 열 설정 섹션 대신 열 초안 dirty 를 올린다. */
function ColDirtyProbe(): ReactNode {
  const { setColDirty } = useRuleWorkbench();
  useEffect(() => setColDirty(true), [setColDirty]);
  return null;
}

async function render(view: RuleEditView, over: Partial<RuleEditCardProps> = {}, withTable = true, colDirty = false) {
  const props = propsOf(view, over);
  const cards = [
    ...(colDirty ? [createElement(ColDirtyProbe, { key: "p" })] : []),
    ...(withTable ? [createElement(DecisionTableCard, { key: "t", ...props })] : []),
    createElement(ValueTestCard, { key: "v", ...props }),
    createElement(TestResultCard, { key: "r", ...props }),
    createElement(TestCaseCard, { key: "c", ...props }),
  ];
  await act(async () => {
    root!.render(createElement(DmesUiProvider, null, createElement(RuleWorkbenchProvider, null, ...cards)));
  });
  await flush();
}

function byTestId<T extends Element>(id: string): T | null {
  return container.querySelector(`[data-testid="${id}"]`) as T | null;
}

function last(action: string) {
  return requests.filter((r) => r.action === action).at(-1)?.body as
    | { params: Record<string, unknown>; grids?: { rows: { rows: Array<Record<string, unknown>> } } }
    | undefined;
}

async function click(scope: ParentNode, label: string) {
  await act(async () => {
    findButton(scope, label).click();
  });
  await flush();
}

async function setKeySent(name: string, on: boolean) {
  const box = byTestId(`vt-key-${name}`)!.querySelector("input") as HTMLInputElement;
  if (box.checked !== on) {
    await act(async () => {
      box.click();
    });
  }
}

// ag-grid 를 둘 그리는 렌더라 다른 스위트와 함께 돌 때 한 사례가 5초를 넘긴 적이 있다(실측 5.2초) — 선례(engine-contract)처럼 늘린다.
describe("값 테스트·테스트 결과·테스트 케이스 카드", { timeout: 30_000 }, () => {
  beforeEach(() => {
    installDomStorage();
    clearVersionViewCache();
    requests = [];
    responses = {};
    writes = 0;
    errors = [];
    versionView = { ...draftView(null), editable: false, headerEditable: false, selectedVer: 1, rows: draftView(null).rows.slice(0, 2).concat(draftView(null).rows[3]) };
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const m = url.match(/\/oasis\/ruleEdit\/(\w+)/);
      if (m) {
        requests.push({ action: m[1], body });
        if (m[1] === "view") return jsonResponse(ok(versionView));
        return jsonResponse(responses[m[1]] ?? ok({}));
      }
      if (url.includes("/api/auth/me")) return jsonResponse({ user: { id: "tester" } });
      return jsonResponse({}, 404);
    }) as typeof fetch;
    delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    globalThis.fetch = originalFetch;
  });

  it("카드 순서는 header·versions·table·valueTest·testResult·testCases·usage 다(I34, 06:749)", () => {
    expect(RULE_EDIT_CARDS.map((c) => c.id)).toEqual(["header", "versions", "table", "valueTest", "testResult", "testCases", "usage"]);
  });

  it("① 헤더·② 버전, ④ 값 테스트·⑤ 테스트 결과는 각각 한 덩어리로 접힌다", () => {
    const segs = cardSegments(RULE_EDIT_CARDS).map((s) => (s.kind === "group" ? `${s.id}[${s.slots.map((c) => c.id).join(",")}]` : s.slot.id));
    expect(segs).toEqual(["headerVersions[header,versions]", "table", "valueTests[valueTest,testResult]", "testCases", "usage"]);
  });

  it("편집본 대상은 editable 이고 DRAFT 일 때만 맨 앞 기본값이고, 아니면 버전만 고른다(I34)", async () => {
    await render(draftView("e2e_mdm_steward"));
    const sel = byTestId<HTMLSelectElement>("vt-target")!;
    expect(Array.from(sel.options).map((o) => o.textContent)).toEqual(["편집본 · 버전 2 저장 전", "버전 2 · DRAFT", "버전 1 · RELEASED"]);
    expect(sel.value).toBe("BODY");
    expect(byTestId("vt-mode")?.textContent).toContain("본문 정의");

    await render(draftView("someone_else"));
    const other = byTestId<HTMLSelectElement>("vt-target")!;
    expect(Array.from(other.options).map((o) => o.textContent)).toEqual(["버전 2 · DRAFT", "버전 1 · RELEASED"]);
    expect(other.value).toBe("V:2");
    expect(byTestId("vt-mode")?.textContent).toContain("저장된 버전");

    // 선택 버전이 DRAFT 가 아니면 editable 이어도 편집본이 없다.
    await render(releasedView("e2e_mdm_steward", { editable: true }));
    expect(Array.from(byTestId<HTMLSelectElement>("vt-target")!.options).map((o) => o.textContent)).toEqual(["버전 1 · RELEASED"]);
  });

  it("열 조건 식 파싱을 기다리는 동안 표가 바뀌어도 응답을 버리지 않아 조건 식이 읽는 변수의 입력 칸이 생긴다", async () => {
    const gates: Array<() => void> = [];
    const answer = globalThis.fetch;
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (!String(input).includes("/oasis/ruleEdit/validate")) return answer(input, init);
      const text = String((JSON.parse(String(init?.body ?? "{}")) as { params?: { text?: string } }).params?.text ?? "");
      return new Promise<Response>((res) => gates.push(() => res(jsonResponse(ok({ ast: ast(text), refVars: [], supported: true, problems: [] })))));
    }) as typeof fetch;
    const view = draftView("e2e_mdm_steward", "e2e_mdm_steward", {
      varMeta: [
        { varId: 4, resGrp: "G1", grpCond: 'TOP_RESIN_CD == "F"' },
        { varId: 5, resGrp: "G2", grpCond: 'COAT_SIDE == "1"' },
      ],
    });
    await render(view);
    expect(byTestId("vt-pending")?.textContent).toContain('TOP_RESIN_CD == "F"');
    await click(container, "행 추가"); // 편집본 대상의 계약 원본(src)이 바뀐다
    while (gates.length > 0) {
      await act(async () => gates.shift()!());
      await flush();
    }
    expect(byTestId("vt-field-TOP_RESIN_CD")).not.toBeNull();
    expect(byTestId("vt-field-COAT_SIDE")).not.toBeNull();
    expect(byTestId("vt-pending")).toBeNull();
  });

  it("입력 줄은 입력 계약 이름이고, 돌리기는 편집본 행을 grids.rows 로 싣고 키 보냄 끔 = 키 없음, 빈 칸 = null 로 보낸다", async () => {
    responses.execute = ok(okResult());
    await render(draftView("e2e_mdm_steward"));
    expect(byTestId("vt-field-COIL_THK")?.textContent).toContain("조건·키 필수");
    expect(byTestId("vt-field-COIL_THK")?.textContent).toContain("두께");
    await typeInto(byTestId<HTMLInputElement>("vt-input-COIL_THK")!, "2.0");
    await typeInto(byTestId<HTMLInputElement>("vt-input-SURF_GRD")!, "A");
    await setKeySent("COIL_WID", false);
    await click(container, "행 추가");
    await click(byTestId("rule-card-value-test")!, "돌리기");

    const req = last("execute")!;
    expect(req.params).toMatchObject({ maruRuleId: "QLTY_GRD_JDG", target: "BODY", ver: 2, hitPolicy: "FIRST" });
    expect(JSON.parse(String(req.params.inputJson))).toEqual({ COIL_THK: "2.0", SURF_GRD: "A" });
    expect(req.grids!.rows.rows.map((r) => r.rowId)).toEqual([1, 2, 3, -1, 4]);

    await setKeySent("COIL_WID", true);
    await typeInto(byTestId<HTMLInputElement>("vt-input-SURF_GRD")!, "");
    await click(byTestId("rule-card-value-test")!, "돌리기");
    expect(JSON.parse(String(last("execute")!.params.inputJson))).toEqual({ COIL_THK: "2.0", COIL_WID: null, SURF_GRD: null });
  });

  it("결과 카드는 결과 변수·적중 행을 보이고, 편집본 결과는 표에 칠했다고 알린다", async () => {
    responses.execute = ok(okResult({ warnings: [{ code: "MISSING_CELL_AS_NA", rowId: -1, varId: 1, message: "행 -1·두께: 셀이 없어 NA 로 보았다" }] }));
    await render(draftView("e2e_mdm_steward"));
    expect(byTestId("vt-result-empty")).not.toBeNull();
    await click(byTestId("rule-card-value-test")!, "돌리기");
    const values = byTestId("vt-result-values")!.textContent!;
    expect(values).toContain("판정등급");
    expect(values).toContain("QLTY_GRD");
    expect(values).toContain("1.05");
    expect(byTestId("vt-result-hits")?.textContent).toContain("1행 (row_id 1)");
    expect(byTestId("vt-result-warnings")?.textContent).toContain("MISSING_CELL_AS_NA");
    expect(byTestId("vt-result-on-table")).not.toBeNull();
    expect(byTestId("vt-result-table")).toBeNull();
    expect(byTestId("dt-test-shown")).not.toBeNull();
  });

  it("기본 행이 적용되면 적중 행에 기본 행을 적고, 판정 오류는 단계·코드·메시지로 보인다", async () => {
    responses.execute = ok(okResult({ hits: [], defaultApplied: true, results: { QLTY_GRD: "C", PRC_FCT: "0.90" } }));
    await render(draftView("e2e_mdm_steward"));
    await click(byTestId("rule-card-value-test")!, "돌리기");
    expect(byTestId("vt-result-hits")?.textContent).toContain("어느 행도 참이 아니어서 기본 행 (row_id 4)");

    responses.execute = ok({
      target: "BODY",
      ver: 2,
      evalTs: "2026-09-26 10:00:00",
      outcome: "ERROR",
      errors: [{ stage: "INPUT_CHECK", code: "MISSING_KEY", rowId: null, name: "COIL_WID", message: "키가 없다" }],
    });
    await click(byTestId("rule-card-value-test")!, "돌리기");
    const errs = byTestId("vt-result-errors")!.textContent!;
    expect(errs).toContain("INPUT_CHECK");
    expect(errs).toContain("MISSING_KEY");
    expect(errs).toContain("키가 없다");
  });

  it("다른 버전을 대상으로 돌리면 그 버전 정의를 받아 입력 줄을 만들고, 결과 카드에 그 버전 표를 따로 그린다", async () => {
    responses.execute = ok(okResult({ target: "VERSION", ver: 1 }));
    await render(draftView("e2e_mdm_steward"));
    await selectValue(byTestId<HTMLSelectElement>("vt-target")!, "V:1");
    await flush();
    expect(last("view")?.params).toMatchObject({ maruRuleId: "QLTY_GRD_JDG", ver: 1 });
    await click(byTestId("rule-card-value-test")!, "돌리기");
    expect(last("execute")!.params).toMatchObject({ target: "VERSION", ver: 1 });
    expect(last("execute")!.grids).toBeUndefined();
    expect(byTestId("vt-result-target")?.textContent).toContain("버전 1");
    expect(byTestId("vt-result-table")).not.toBeNull();
    expect(byTestId("vt-result-on-table")).toBeNull();
    expect(byTestId("dt-test-shown")).toBeNull();
  });

  it("서버가 거부하면(상한 초과 등) 값 테스트 카드에 서버 메시지를 보인다", async () => {
    responses.execute = { meta: { success: false, code: "MDM021", message: "입력이 올바르지 않습니다: inputJson 길이 16385 > 16384" } };
    await render(draftView("e2e_mdm_steward"));
    await click(byTestId("rule-card-value-test")!, "돌리기");
    expect(byTestId("vt-error")?.textContent).toContain("inputJson 길이 16385");
    expect(byTestId("vt-result-empty")).not.toBeNull();
  });

  it("케이스가 없으면 빈 상태 문구를 보이고 모두 돌리기를 끈다", async () => {
    await render(draftView("e2e_mdm_steward", undefined, { testCases: [] }));
    expect(byTestId("tc-empty")?.textContent).toBe("테스트 케이스가 없습니다");
    expect(findButton(byTestId("rule-card-test-cases")!, "모두 실행").disabled).toBe(true);
  });

  it("케이스로 저장은 part CASE 로 이름·입력·방금 결과의 기대값을 보내고, 결과가 없으면 기대값 없이 보낸다", async () => {
    responses.execute = ok(okResult());
    responses.save = ok({ part: "CASE", rowVersion: 0, caseId: 3 });
    await render(draftView("e2e_mdm_steward"));
    await typeInto(byTestId<HTMLInputElement>("vt-input-COIL_THK")!, "2.0");
    const save = () => findButton(byTestId("rule-card-value-test")!, "케이스로 저장");
    expect(save().disabled).toBe(true);
    await typeInto(byTestId<HTMLInputElement>("vt-case-name")!, "새 케이스");
    await click(byTestId("rule-card-value-test")!, "케이스로 저장");
    let p = last("save")!.params;
    expect(p).toMatchObject({ part: "CASE", maruRuleId: "QLTY_GRD_JDG", caseName: "새 케이스" });
    expect(p.expectedJson).toBeUndefined();
    expect(p.caseId).toBeUndefined();
    expect(JSON.parse(String(p.inputJson))).toEqual({ COIL_THK: "2.0", COIL_WID: null, SURF_GRD: null });

    await click(byTestId("rule-card-value-test")!, "돌리기");
    await typeInto(byTestId<HTMLInputElement>("vt-case-name")!, "결과 있는 케이스");
    await click(byTestId("rule-card-value-test")!, "케이스로 저장");
    p = last("save")!.params;
    expect(p.expectedJson).toBe('{"QLTY_GRD":"A","PRC_FCT":1.05,"hit":1}');

    // 돌린 뒤 입력을 바꾸면 그 결과는 이 입력의 결과가 아니다 — 기대값 없이 저장한다.
    await typeInto(byTestId<HTMLInputElement>("vt-input-COIL_THK")!, "3.0");
    await typeInto(byTestId<HTMLInputElement>("vt-case-name")!, "입력 바꾼 케이스");
    await click(byTestId("rule-card-value-test")!, "케이스로 저장");
    expect(last("save")!.params.expectedJson).toBeUndefined();
    expect(writes).toBe(3);
  });

  it("모두 돌리기는 값 테스트 카드의 대상·입력에 runCases 를 싣고, 케이스마다 결과 배지를 보인다", async () => {
    responses.execute = ok(
      okResult({
        cases: [
          { caseId: 1, caseName: "A급 광폭", outcome: "OK", pass: true, mismatches: [], results: { QLTY_GRD: "A", PRC_FCT: "1.05" }, hit: 1 },
          { caseId: 2, caseName: "폭 없음", outcome: "OK", pass: null, mismatches: [], results: { QLTY_GRD: "C", PRC_FCT: "0.90" }, hit: 4 },
        ],
      }),
    );
    await render(draftView("e2e_mdm_steward", undefined, { testCases: CASES }));
    expect(byTestId("tc-row-1")?.textContent).toContain("A급 광폭");
    expect(byTestId("tc-row-2")?.textContent).toContain("(기대값 없음)");
    await typeInto(byTestId<HTMLInputElement>("vt-input-COIL_THK")!, "3.0");
    await click(byTestId("rule-card-test-cases")!, "모두 실행");
    const req = last("execute")!;
    expect(req.params).toMatchObject({ target: "BODY", ver: 2, runCases: true });
    expect(JSON.parse(String(req.params.inputJson))).toMatchObject({ COIL_THK: "3.0" });
    expect(byTestId("tc-badge-1")?.textContent).toBe("통과");
    expect(byTestId("tc-badge-2")?.textContent).toBe("돌려 보기만");
    expect(byTestId("rule-card-test-cases")!.textContent).toContain("결과(편집본)");

    responses.execute = ok(
      okResult({
        cases: [
          { caseId: 1, caseName: "A급 광폭", outcome: "OK", pass: false, mismatches: [{ key: "PRC_FCT", expected: 1.05, actual: "1.00" }], results: {}, hit: 2 },
          { caseId: 2, caseName: "폭 없음", outcome: "ERROR", pass: null, mismatches: [], errors: [{ stage: "INPUT_CHECK", code: "MISSING_KEY", message: "키가 없다" }] },
        ],
      }),
    );
    await click(byTestId("rule-card-test-cases")!, "모두 실행");
    expect(byTestId("tc-badge-1")?.textContent).toBe("실패 · PRC_FCT");
    expect(byTestId("tc-row-1")?.textContent).toContain("PRC_FCT 1.05 ≠ 1.00");
    expect(byTestId("tc-row-2")?.textContent).toContain("MISSING_KEY");
  });

  it("불러오기는 케이스 입력을 값 테스트 칸에 채우고, 케이스에 없는 키는 키 보냄을 끈다", async () => {
    responses.execute = ok(okResult());
    await render(draftView("e2e_mdm_steward", undefined, { testCases: CASES }));
    await click(byTestId("tc-row-2")!, "불러오기");
    expect(byTestId<HTMLInputElement>("vt-input-COIL_THK")!.value).toBe("2.0");
    expect(byTestId<HTMLInputElement>("vt-input-SURF_GRD")!.value).toBe("");
    expect((byTestId("vt-key-COIL_WID")!.querySelector("input") as HTMLInputElement).checked).toBe(false);
    await click(byTestId("rule-card-value-test")!, "돌리기");
    expect(JSON.parse(String(last("execute")!.params.inputJson))).toEqual({ COIL_THK: "2.0", SURF_GRD: null });
  });

  it("기대값 갱신은 마지막 케이스 결과로 기대 JSON 을 고치고(rowVersion 조건), 삭제는 두 번 눌러야 보낸다", async () => {
    responses.execute = ok(
      okResult({ cases: [{ caseId: 2, caseName: "폭 없음", outcome: "OK", pass: null, mismatches: [], results: { QLTY_GRD: "C", PRC_FCT: "0.90" }, hit: 4 }] }),
    );
    responses.save = ok({ part: "CASE", rowVersion: 4, caseId: 2 });
    await render(draftView("e2e_mdm_steward", undefined, { testCases: CASES }));
    const row2 = () => byTestId("tc-row-2")!;
    expect(findButton(row2(), "기대값 갱신").disabled).toBe(true);
    await click(byTestId("rule-card-test-cases")!, "모두 실행");
    await click(row2(), "기대값 갱신");
    expect(last("save")!.params).toMatchObject({
      part: "CASE",
      caseId: 2,
      rowVersion: 3,
      caseName: "폭 없음",
      inputJson: CASES[1].inputJson,
      expectedJson: '{"QLTY_GRD":"C","PRC_FCT":0.90,"hit":4}',
    });

    await click(row2(), "삭제");
    expect(requests.filter((r) => r.action === "save")).toHaveLength(1);
    await click(row2(), "삭제 확인");
    expect(last("save")!.params).toEqual({ part: "CASE", maruRuleId: "QLTY_GRD_JDG", caseId: 2, rowVersion: 3, caseDeleted: true });
  });

  it("수정은 팝업에서 이름·설명·입력·기대 JSON 을 고쳐 rowVersion 조건으로 저장하고, JSON 이 틀리면 보내지 않는다", async () => {
    responses.save = ok({ part: "CASE", rowVersion: 4, caseId: 2 });
    await render(draftView("e2e_mdm_steward", undefined, { testCases: CASES }));
    await act(async () => byTestId<HTMLButtonElement>("tc-edit-2")!.click());
    await flush();
    const inModal = <T extends Element>(id: string) => document.querySelector(`[data-testid="${id}"]`) as T;
    expect(inModal<HTMLInputElement>("tc-edit-name").value).toBe("폭 없음");
    // 저장된 케이스에는 없지만 지금 계약에 있는 키는 null 로 채워 보여준다 — 룰에 컬럼이
    // 새로 들어온 경우를 그대로 드러내는 것이 목적이다(기존 값·키 순서는 보존).
    expect(JSON.parse(inModal<HTMLTextAreaElement>("tc-edit-input").value)).toEqual({
      COIL_THK: "2.0",
      SURF_GRD: null,
      COIL_WID: null,
    });
    await typeInto(inModal<HTMLTextAreaElement>("tc-edit-input"), "{");
    await act(async () => inModal<HTMLButtonElement>("tc-edit-save").click());
    await flush();
    expect(inModal("tc-edit-error").textContent).toContain("입력 JSON 을 읽지 못했습니다");
    expect(requests.filter((r) => r.action === "save")).toHaveLength(0);

    await typeInto(inModal<HTMLInputElement>("tc-edit-name"), "폭 있음");
    await typeInto(inModal<HTMLInputElement>("tc-edit-desc"), "광폭");
    await typeInto(inModal<HTMLTextAreaElement>("tc-edit-input"), '{"COIL_THK":"2.0","COIL_WID":"1500","SURF_GRD":"A"}');
    await typeInto(inModal<HTMLTextAreaElement>("tc-edit-expected"), '{"QLTY_GRD":"A","hit":1}');
    await act(async () => inModal<HTMLButtonElement>("tc-edit-save").click());
    await flush();
    expect(last("save")!.params).toEqual({
      part: "CASE",
      maruRuleId: "QLTY_GRD_JDG",
      caseId: 2,
      rowVersion: 3,
      caseName: "폭 있음",
      inputJson: '{"COIL_THK":"2.0","COIL_WID":"1500","SURF_GRD":"A"}',
      expectedJson: '{"QLTY_GRD":"A","hit":1}',
      description: "광폭",
    });
    expect(document.querySelector('[data-testid="tc-edit-modal"]')).toBeNull();
  });

  it("권한이 없으면 버튼을 숨기지 않고 끈다(§6.7.0)", async () => {
    await render(draftView("e2e_mdm_steward", undefined, { testCases: CASES }), { canDo: () => false });
    expect(findButton(byTestId("rule-card-value-test")!, "돌리기").disabled).toBe(true);
    expect(findButton(byTestId("rule-card-test-cases")!, "모두 실행").disabled).toBe(true);
    expect(findButton(byTestId("tc-row-1")!, "삭제").disabled).toBe(true);
    expect(findButton(byTestId("tc-row-1")!, "수정").disabled).toBe(true);
    expect(findButton(byTestId("tc-row-1")!, "불러오기").disabled).toBe(false);
  });

  it("열 설정 초안이 dirty 면 편집본 대상 옆에 반영하지 않는다고 알린다(D4)", async () => {
    await render(draftView("e2e_mdm_steward"), {}, false);
    expect(byTestId("vt-col-draft")).toBeNull();
    await render(draftView("e2e_mdm_steward"), {}, false, true);
    expect(visibleText(byTestId("rule-card-value-test")!)).toContain("열 설정 초안은 반영하지 않습니다");
    await selectValue(byTestId<HTMLSelectElement>("vt-target")!, "V:2");
    expect(byTestId("vt-col-draft")).toBeNull();
  });
});
