/** @vitest-environment happy-dom */

// 룰 세트 편집 화면 렌더 테스트 — 2단계 계획 Task 10(캔버스 통합). 넘겨받은 setId 로 view(I22 받는 쪽), 캔버스 노드·보기/편집 모드,
// 팔레트로 IF 끼우기 → 검사 패널·저장 막기(P-D4), 조건식 IO 디바운스(validate 400ms)·늦은 응답 버리기(Review Focus 5),
// 저장 flowJson 모양(grids 없음), 룰 박스 선택과 링크 아이콘, 속성 패널 읽기 전용, 룰 지우기·dirty 확인, 검사 항목 이동,
// 분기 세트 편집, 구성 지침 적용(P-D5), 폐기 두 단계·되살리기·MDM001·RBAC(1단계 동작 그대로).
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

const mocks = vi.hoisted(() => ({
  openRuleEdit: vi.fn(),
  openMdmPage: vi.fn(),
  grid: { current: null as Record<string, unknown> | null },
}));

vi.mock("@/dme/rule-handoff", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/dme/rule-handoff")>()),
  openRuleEdit: (...args: unknown[]) => mocks.openRuleEdit(...args),
}));

vi.mock("@/shell", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shell")>()),
  openMdmPage: (...args: unknown[]) => mocks.openMdmPage(...args),
}));

// 그리드(rowKey=ruleId)의 props 를 잡아 두고 실제 그리드를 그린다(1단계 목 그대로 — 캔버스에서는 룰 목록 그리드가 없다).
vi.mock("@dk-oasis/shared/grid", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dk-oasis/shared/grid")>();
  const react = await import("react");
  return {
    ...actual,
    AgDataGrid: (props: Record<string, unknown>) => {
      if (props.rowKey === "ruleId") mocks.grid.current = props;
      return react.createElement(actual.AgDataGrid as unknown as React.ComponentType<Record<string, unknown>>, props);
    },
  };
});

import { useRuleSetEdit } from "../../../pages/dme/ruleSetEdit/state/useRuleSetEdit";
import { setPositions, insertSplit } from "../../../pages/dme/ruleSetEdit/flow-edit";
import type { CondIo, RuleIo, RuleSetView } from "../../../pages/dme/ruleSetEdit/types";
import type { RuleSetFlow } from "../../../src/contract/engine-contract.generated";

import { findButton, flush, typeInto, visibleText } from "../helpers/render";
import {
  byTestId,
  calls,
  canvasNodeIds,
  click,
  clickFake,
  handoff,
  inDoc,
  installServer,
  ok,
  pageContainer,
  q,
  renderPage,
  settle,
  srv,
  uninstallServer,
  unmountPage,
} from "../helpers/rule-set-page";

type Src = "DICT" | "PROG" | "NONE";

const ioName = (n: string, source: Src | null) => ({ name: n, source, label: null, dataType: null, scale: null, dateString: false, maruCodeId: null });

function io(ruleId: string, conds: Array<[string, Src]>, results: string[], extra: Partial<RuleIo> = {}): RuleIo {
  return {
    ruleId,
    ruleName: `${ruleId} 이름`,
    ruleKind: "DECISION",
    status: "INUSE",
    exists: true,
    releasedVer: 1,
    hitPolicy: "FIRST",
    conds: conds.map(([n, s]) => ioName(n, s)),
    results: results.map((r) => ioName(r, null)),
    ...extra,
  };
}

const GRD = io("E2S_GRD", [["SET_THK", "DICT"], ["SET_SURF", "DICT"]], ["S_GRD"]);
const FCT = io("E2S_FCT", [["S_GRD", "NONE"], ["SET_WID", "DICT"]], ["S_FCT"]);
const SPD = io("E2S_SPD", [["S_FCT", "NONE"]], ["S_SPD"], { ruleKind: "DERIVE", hitPolicy: null });
const DUP = io("E2S_DUP", [["SET_WID", "DICT"]], ["S_GRD"]);

function chainView(over: Partial<RuleSetView> = {}, rowVersion = 3): RuleSetView {
  return {
    set: { setId: "E2S_CHAIN", setName: "사슬", description: null, status: "INUSE", rowVersion, ruleIds: ["E2S_GRD", "E2S_FCT", "E2S_SPD"], flow: null, branched: false },
    rules: [GRD, FCT, SPD],
    checks: [],
    condIo: {},
    editable: true,
    restorable: false,
    ...over,
  };
}

/** GRD → IF { S_GRD = "A": FCT ; 그 외: (빈 갈래) } → SPD — 분기가 있는 세트. */
const BRANCHED_FLOW: RuleSetFlow = {
  version: 1,
  nodes: [
    { id: "start", kind: "START", ruleId: null, splitId: null, label: null },
    { id: "r1", kind: "RULE", ruleId: "E2S_GRD", splitId: null, label: null },
    { id: "if1", kind: "IF", ruleId: null, splitId: null, label: "등급" },
    { id: "r2", kind: "RULE", ruleId: "E2S_FCT", splitId: null, label: null },
    { id: "m1", kind: "MERGE", ruleId: null, splitId: "if1", label: null },
    { id: "r3", kind: "RULE", ruleId: "E2S_SPD", splitId: null, label: null },
    { id: "end", kind: "END", ruleId: null, splitId: null, label: null },
  ],
  edges: [
    { id: "e1", from: "start", to: "r1", order: null, cond: null, otherwise: false, label: null },
    { id: "e2", from: "r1", to: "if1", order: null, cond: null, otherwise: false, label: null },
    { id: "e3", from: "if1", to: "r2", order: 1, cond: 'S_GRD = "A"', otherwise: false, label: "A 등급" },
    { id: "e4", from: "if1", to: "m1", order: null, cond: null, otherwise: true, label: "그 외" },
    { id: "e5", from: "r2", to: "m1", order: null, cond: null, otherwise: false, label: null },
    { id: "e6", from: "m1", to: "r3", order: null, cond: null, otherwise: false, label: null },
    { id: "e7", from: "r3", to: "end", order: null, cond: null, otherwise: false, label: null },
  ],
};

const S_GRD_OK: CondIo = { ok: true, message: null, vars: [ioName("S_GRD", "NONE")] };

function branchedView(over: Partial<RuleSetView> = {}): RuleSetView {
  return chainView({ set: { ...chainView().set, flow: BRANCHED_FLOW, branched: true }, condIo: { e3: S_GRD_OK }, ...over });
}

const PARTIAL_MSG = "E2S_SPD가 읽는 S_FCT는 IF 의 일부 갈래에서만 만들어진다. 다른 갈래를 타면 판정 오류다";

function deferred() {
  let resolve!: (v: unknown) => void;
  const promise = new Promise<unknown>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function ioRowOrNull(kind: "inputs" | "results", name: string): HTMLElement | null {
  return pageContainer().querySelector(`[data-testid="set-io-${kind}"] .ag-row[row-id="${name}"]`);
}

function ioRow(kind: "inputs" | "results", name: string): HTMLElement {
  const el = ioRowOrNull(kind, name);
  if (!el) throw new Error(`set-io-${kind} 행 ${name} 없음`);
  return el;
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

const saveButton = () => byTestId<HTMLButtonElement>("set-save");

async function openChain(view = chainView()) {
  srv.views.E2S_CHAIN = view;
  handoff("E2S_CHAIN");
  await renderPage();
}

/** 편집 모드로 바꾸고 팔레트 [IF] 로 END 앞 선에 IF 를 끼운 뒤, IF 를 골라 첫 갈래 조건식에 글을 넣는다. */
async function insertIfAndType(cond: string, opts: { editing?: boolean } = {}) {
  if (!opts.editing) await click("flow-mode-edit");
  await click("flow-add-if");
  await click("flow-node-if1");
  await typeInto(byTestId<HTMLTextAreaElement>("flow-prop-branch-e5-cond"), cond);
}

describe("RuleSetEditPage", () => {
  beforeEach(() => {
    installServer();
    mocks.openRuleEdit.mockReset();
    mocks.openMdmPage.mockReset();
    mocks.grid.current = null;
  });

  afterEach(() => {
    vi.useRealTimers();
    uninstallServer();
  });

  it("세트를 고르기 전에는 빈 상태이고, 찾기 → 후보를 누르면 그 세트를 view 로 연다", async () => {
    srv.views.E2S_CHAIN = chainView();
    srv.replies["search:SET"] = ok({ sets: [{ setId: "E2S_CHAIN", setName: "사슬", status: "INUSE" }] });
    await renderPage();
    expect(visibleText(pageContainer())).toContain("세트를 골라 편집한다. 새 세트는 룰 세트 화면에서 등록한다");
    expect(calls("view")).toHaveLength(0);
    await typeInto(byTestId<HTMLInputElement>("set-pick-keyword"), "E2S_");
    await act(async () => {
      findButton(pageContainer(), "찾기").click();
    });
    await flush();
    expect(calls("search").at(-1)!.body.params).toEqual({ target: "SET", keyword: "E2S_" });
    expect(calls("search").at(-1)!.body.meta).toEqual({ menuId: "ruleSetEdit" });
    await click("set-pick-E2S_CHAIN");
    await settle();
    expect(calls("view").at(-1)!.body.params).toEqual({ setId: "E2S_CHAIN" });
    expect(byTestId("set-edit-current").textContent).toContain("E2S_CHAIN");
  });

  it("넘겨받은 setId 로 view 를 요청하고 툴바·세트 패널(세트명·입출력 표)·검사 통과를 보인다(I22 받는 쪽)", async () => {
    await openChain();
    expect(calls("view")).toHaveLength(1);
    expect(calls("view")[0].body.params).toEqual({ setId: "E2S_CHAIN" });
    expect(byTestId("set-card-id").textContent).toBe("E2S_CHAIN");
    expect(byTestId("set-status").textContent).toContain("INUSE");
    expect(visibleText(byTestId("flow-toolbar"))).toContain("row_version 3");
    expect(visibleText(pageContainer())).toContain("버전·승인 없음");
    expect(byTestId<HTMLInputElement>("set-name").value).toBe("사슬");
    expect(visibleText(byTestId("set-checks"))).toContain("통과");
    expect(visibleText(byTestId("flow-tab-checks"))).toContain("검사 결과 0");
    expect(q("flow-tab-sim")).not.toBeNull();

    const inputs = visibleText(byTestId("set-io-inputs"));
    expect(inputs).toContain("입력 변수 3개");
    for (const n of ["SET_THK", "SET_SURF", "SET_WID"]) expect(visibleText(ioRow("inputs", n))).toContain("컬럼 사전");
    expect(visibleText(byTestId("set-io-results"))).toContain("결과 변수 3개 · 최종 1개, 중간 2개");
    expect(visibleText(ioRow("results", "S_SPD"))).toContain("최종");
  });

  // 1
  it("한 줄 세트(flow null)를 열면 캔버스 노드 5개, 보기 모드, 팔레트 없음, 세트 저장 꺼짐", async () => {
    await openChain();
    expect(q("flow-canvas")).not.toBeNull();
    expect(canvasNodeIds().sort()).toEqual(["end", "r1", "r2", "r3", "start"]);
    expect(byTestId("flow-canvas").getAttribute("data-mode")).toBe("view");
    expect(byTestId("flow-mode-view").getAttribute("aria-pressed")).toBe("true");
    expect(q("flow-palette")).toBeNull();
    expect(saveButton().disabled).toBe(true);
    expect(visibleText(byTestId("flow-node-r2"))).toContain("E2S_FCT");
  });

  // 2
  it("[편집] → 팔레트가 보이고, [IF] 를 누르면 END 로 들어가는 선에 IF 가 끼워져 FLOW_IF_ELSE 거부가 보이고 저장이 꺼진다(P-D4)", async () => {
    await openChain();
    await click("flow-mode-edit");
    expect(q("flow-palette")).not.toBeNull();
    expect(byTestId("flow-canvas").getAttribute("data-mode")).toBe("edit");
    await click("flow-add-if");
    expect(canvasNodeIds().sort()).toEqual(["end", "if1", "m1", "r1", "r2", "r3", "start"]);
    const checks = visibleText(byTestId("set-checks"));
    expect(checks).toContain("IF if1의 갈래 e5에 조건식이 없다");
    expect(checks).toContain("거부");
    expect(visibleText(byTestId("flow-tab-checks"))).toContain("검사 결과 1");
    expect(saveButton().disabled).toBe(true);
  });

  // 3
  it("조건식을 넣으면 400ms 뒤 validate 를 한 번 부르고, 응답 전에는 저장이 꺼져 있다가 응답 뒤 거부가 없어지면 켜진다", async () => {
    await openChain();
    await click("flow-mode-edit");
    vi.useFakeTimers();
    const reply = deferred();
    srv.validateQueue.push(reply.promise);
    await clickFake("flow-add-if");
    await clickFake("flow-node-if1");
    expect(q("flow-prop-if")).not.toBeNull();
    await typeInto(byTestId<HTMLTextAreaElement>("flow-prop-branch-e5-cond"), 'S_GRD = "A"');
    await advance(399);
    expect(calls("validate")).toHaveLength(0);
    expect(saveButton().disabled).toBe(true);
    await advance(1);
    expect(calls("validate")).toHaveLength(1);
    const sent = calls("validate")[0].body.params as Record<string, unknown>;
    expect(typeof sent.flowJson).toBe("string");
    expect(JSON.parse(sent.flowJson as string).edges.find((e: { id: string }) => e.id === "e5").cond).toBe('S_GRD = "A"');
    expect(saveButton().disabled).toBe(true);

    await act(async () => {
      reply.resolve(ok({ condIo: { e5: S_GRD_OK } }));
      await vi.advanceTimersByTimeAsync(0);
    });
    await advance(0);
    expect(visibleText(byTestId("set-checks"))).not.toContain("거부");
    expect(saveButton().disabled).toBe(false);
    expect(calls("validate")).toHaveLength(1);
  });

  // 4
  it("[세트 저장] 은 params 에 flowJson 문자열을 싣고 grids 는 보내지 않는다 — 흐름에 IF·MERGE 가 있다. 저장 뒤에도 편집 모드가 유지된다(P1)", async () => {
    srv.replies.validate = ok({ condIo: { e5: S_GRD_OK } });
    srv.replies.save = ok({ setId: "E2S_CHAIN", rowVersion: 4, checks: [{ code: "DUP_RESULT", severity: "WARN", ruleId: "E2S_SPD", otherRuleId: "E2S_GRD", varName: "S_GRD", message: "경고 문장" }] });
    await openChain();
    await click("flow-mode-edit");
    await typeInto(byTestId<HTMLInputElement>("set-name"), "사슬(수정)");
    await insertIfAndType('S_GRD = "A"', { editing: true });
    await settle(500);
    expect(calls("validate")).toHaveLength(1);
    expect(saveButton().disabled).toBe(false);

    srv.views.E2S_CHAIN = chainView({ set: { ...chainView().set, setName: "사슬(수정)", rowVersion: 4 } });
    await click("set-save");
    await settle();
    expect(calls("save")).toHaveLength(1);
    const body = calls("save")[0].body;
    expect(body.grids).toBeUndefined();
    const params = body.params as Record<string, unknown>;
    expect(params).toMatchObject({ setId: "E2S_CHAIN", setName: "사슬(수정)", rowVersion: 3 });
    expect(Object.keys(params).sort()).toEqual(["flowJson", "rowVersion", "setId", "setName"]);
    expect(typeof params.flowJson).toBe("string");
    const flow = JSON.parse(params.flowJson as string) as RuleSetFlow & { view: unknown };
    const kinds = flow.nodes.map((n) => n.kind);
    expect(kinds).toContain("IF");
    expect(kinds).toContain("MERGE");
    expect(flow.view).toEqual({ positions: {}, notes: [], groups: [] });
    expect(calls("view")).toHaveLength(2);
    const msg = visibleText(byTestId("set-message"));
    expect(msg).toContain("저장 · row_version 4");
    expect(msg).toContain("경고 문장");
    expect(visibleText(byTestId("flow-toolbar"))).toContain("row_version 4");
    // 자기 쓰기(저장) 뒤 다시 불러오기는 모드를 그대로 둔다(3단계 P1 — 세트를 열거나 [다시 불러오기] 할 때만 보기 모드).
    expect(byTestId("flow-canvas").getAttribute("data-mode")).toBe("edit");
    expect(saveButton().disabled).toBe(true); // 서버 값과 같아져 dirty 가 풀렸다
  });

  // 5
  it("조건식을 빠르게 두 번 바꿔 첫 validate 응답이 두 번째보다 늦게 오면 첫 응답은 버린다(Review Focus 5)", async () => {
    const first = deferred();
    const second = deferred();
    srv.validateQueue.push(first.promise, second.promise);
    await openChain();
    await insertIfAndType("S_GRD = 1");
    await settle(450);
    expect(calls("validate")).toHaveLength(1);
    await typeInto(byTestId<HTMLTextAreaElement>("flow-prop-branch-e5-cond"), 'S_GRD = "A"');
    await settle(450);
    expect(calls("validate")).toHaveLength(2);

    await act(async () => {
      second.resolve(ok({ condIo: { e5: S_GRD_OK } }));
    });
    await flush();
    expect(saveButton().disabled).toBe(false);
    await act(async () => {
      first.resolve(ok({ condIo: { e5: { ok: false, message: "첫 응답(버려야 함)", vars: [] } } }));
    });
    await flush();
    expect(visibleText(byTestId("set-checks"))).not.toContain("첫 응답(버려야 함)");
    expect(visibleText(byTestId("set-checks"))).toContain("통과");
    expect(saveButton().disabled).toBe(false);
  });

  // 6
  it("룰 박스 링크 아이콘은 openRuleEdit 를 부르고, 박스를 누르면 속성 패널만 연다", async () => {
    await openChain();
    await click("flow-rule-open-r2");
    expect(mocks.openRuleEdit).toHaveBeenCalledWith("E2S_FCT");
    expect(mocks.openRuleEdit).toHaveBeenCalledTimes(1);
    expect(q("flow-prop-rule")).toBeNull();
    await click("flow-node-r2");
    expect(q("flow-prop-rule")).not.toBeNull();
    expect(mocks.openRuleEdit).toHaveBeenCalledTimes(1);
    const prop = visibleText(byTestId("flow-prop-rule"));
    expect(prop).toContain("E2S_FCT");
    expect(prop).toContain("v1");
    // 입력 변수 S_GRD 는 앞 경로의 E2S_GRD 결과, SET_WID 는 컬럼 사전
    expect(visibleText(byTestId("flow-prop-input-S_GRD"))).toContain("E2S_GRD");
    expect(visibleText(byTestId("flow-prop-input-SET_WID"))).toContain("컬럼 사전");
    await click("flow-prop-rule-open");
    expect(mocks.openRuleEdit).toHaveBeenLastCalledWith("E2S_FCT");
  });

  // 7
  it("보기 모드에서 노드를 고르면 속성 패널은 읽기 전용이고 지우기·갈래 편집 버튼이 없다", async () => {
    await openChain(branchedView());
    await click("flow-node-r1");
    expect(q("flow-prop-rule")).not.toBeNull();
    expect(q("flow-prop-delete")).toBeNull();

    await click("flow-node-if1");
    expect(q("flow-prop-if")).not.toBeNull();
    const cond = byTestId<HTMLTextAreaElement>("flow-prop-branch-e3-cond");
    expect(cond.value).toBe('S_GRD = "A"');
    expect(cond.readOnly || cond.disabled).toBe(true);
    expect(byTestId<HTMLInputElement>("flow-prop-label").readOnly || byTestId<HTMLInputElement>("flow-prop-label").disabled).toBe(true);
    expect(q("flow-prop-branch-e4-cond")).toBeNull();
    expect(q("flow-prop-branch-e3-up")).toBeNull();
    expect(q("flow-prop-branch-e3-remove")).toBeNull();
    expect(q("flow-prop-add-branch")).toBeNull();
    expect(q("flow-prop-delete")).toBeNull();
  });

  // 8
  it("편집 모드에서 룰을 지우면 앞뒤 선이 이어지고 dirty 가 되어, 다른 세트를 열려 하면 확인을 받는다", async () => {
    srv.views.E2S_OTHER = chainView({ set: { ...chainView().set, setId: "E2S_OTHER", setName: "다른 세트" } });
    srv.replies["search:SET"] = ok({ sets: [{ setId: "E2S_OTHER", setName: "다른 세트", status: "INUSE" }] });
    await openChain();
    await click("flow-mode-edit");
    await click("flow-node-r3");
    await click("flow-prop-delete");
    expect(canvasNodeIds().sort()).toEqual(["end", "r1", "r2", "start"]);
    expect(q("flow-prop-rule")).toBeNull();
    expect(saveButton().disabled).toBe(false);

    window.confirm = vi.fn(() => false);
    await typeInto(byTestId<HTMLInputElement>("set-pick-keyword"), "E2S_O");
    await act(async () => {
      findButton(pageContainer(), "찾기").click();
    });
    await flush();
    await click("set-pick-E2S_OTHER");
    await settle();
    expect(window.confirm).toHaveBeenCalledWith("저장하지 않은 변경이 있습니다. 버리고 이동할까요?");
    expect(calls("view")).toHaveLength(1);
    expect(byTestId("set-edit-current").textContent).toContain("E2S_CHAIN");

    srv.replies.save = ok({ setId: "E2S_CHAIN", rowVersion: 4, checks: [] });
    await click("set-save");
    await settle();
    const flow = JSON.parse((calls("save")[0].body.params as Record<string, string>).flowJson) as RuleSetFlow;
    expect(flow.nodes.map((n) => n.id)).toEqual(["start", "r1", "r2", "end"]);
    expect(flow.edges.map((e) => `${e.from}>${e.to}`)).toEqual(["start>r1", "r1>r2", "r2>end"]);
  });

  // 9
  it("검사 항목을 누르면 그 노드를 고른다", async () => {
    await openChain(branchedView());
    const checks = visibleText(byTestId("set-checks"));
    expect(checks).toContain(PARTIAL_MSG);
    expect(checks).toContain("경고");
    expect(visibleText(byTestId("set-check-0"))).toContain("r3");
    expect(byTestId("flow-node-r3").getAttribute("data-selected")).toBe("false");
    await click("set-check-0");
    expect(byTestId("flow-node-r3").getAttribute("data-selected")).toBe("true");
    expect(visibleText(byTestId("flow-prop-rule"))).toContain("E2S_SPD");
    // 속성 패널: 이 노드·변수에 걸린 검사 문구
    expect(visibleText(byTestId("flow-prop-input-S_FCT"))).toContain(PARTIAL_MSG);
  });

  // 10
  it("분기 세트를 열면 흐름 그대로 그리고 편집할 수 있다(분기 안내 없음)", async () => {
    await openChain(branchedView());
    expect(canvasNodeIds().sort()).toEqual(["end", "if1", "m1", "r1", "r2", "r3", "start"]);
    expect(q("set-branched-notice")).toBeNull();
    expect(byTestId<HTMLButtonElement>("flow-mode-edit").disabled).toBe(false);
    await click("flow-mode-edit");
    expect(q("flow-palette")).not.toBeNull();
    await click("flow-node-if1");
    await click("flow-prop-add-branch");
    expect(q("flow-prop-branch-e8-cond")).not.toBeNull();
    expect(saveButton().disabled).toBe(true); // 새 갈래 조건식이 비어 거부
    expect(visibleText(byTestId("set-checks"))).toContain("IF if1의 갈래 e8에 조건식이 없다");
  });

  // 11
  it("구성 지침 — 한 줄 세트에서 적용하면 노드 순서가 제안 순서로 바뀌고, 분기 세트에서는 적용 버튼이 꺼진다", async () => {
    srv.replies["search:GUIDE"] = ok({
      target: "S_SPD",
      order: ["E2S_DUP", "E2S_FCT", "E2S_SPD"],
      ambiguous: [{ varName: "S_GRD", ruleIds: ["E2S_DUP", "E2S_GRD"] }],
      error: null,
      rules: [DUP, FCT, SPD],
    });
    await openChain();
    await click("flow-mode-edit");
    await typeInto(byTestId<HTMLInputElement>("set-guide-var"), "S_SPD");
    await click("set-guide-run");
    expect(calls("search").at(-1)!.body.params).toEqual({ target: "GUIDE", resultVar: "S_SPD" });
    const order = visibleText(byTestId("set-guide-order"));
    expect(order).toContain("1. E2S_DUP → 2. E2S_FCT → 3. E2S_SPD");
    expect(order).toContain("S_GRD: E2S_DUP, E2S_GRD");
    const before = srv.requests.length;
    expect(saveButton().disabled).toBe(true);

    await click("set-guide-apply");
    await settle();
    expect(visibleText(byTestId("flow-node-r1"))).toContain("E2S_DUP");
    expect(visibleText(byTestId("flow-node-r2"))).toContain("E2S_FCT");
    expect(visibleText(byTestId("flow-node-r3"))).toContain("E2S_SPD");
    expect(visibleText(ioRow("inputs", "SET_WID"))).toContain("컬럼 사전");
    expect(ioRowOrNull("inputs", "SET_THK")).toBeNull();
    expect(saveButton().disabled).toBe(false);
    expect(srv.requests.length).toBe(before);

    unmountPage();
    srv.replies["search:GUIDE"] = ok({ target: "S_SPD", order: ["E2S_GRD"], ambiguous: [], error: null, rules: [GRD] });
    await openChain(branchedView());
    await click("flow-mode-edit");
    await typeInto(byTestId<HTMLInputElement>("set-guide-var"), "S_SPD");
    await click("set-guide-run");
    expect(byTestId<HTMLButtonElement>("set-guide-apply").disabled).toBe(true);
  });

  // 12
  it("save 권한이 없으면(READ·폐기만 허용) 담당자여도 [편집] 이 꺼지고, 허용된 폐기는 켜진다", async () => {
    srv.rbacRows = ["search", "view", "delete"].map((action) => ({ objId: "ruleSetEdit", action, endpoint: "*", httpMethod: "*" }));
    await openChain();
    await settle();
    expect(byTestId<HTMLButtonElement>("flow-mode-edit").disabled).toBe(true);
    expect(byTestId<HTMLButtonElement>("set-deprecate").disabled).toBe(false);
    expect(saveButton().disabled).toBe(true);
    expect(byTestId<HTMLInputElement>("set-name").disabled).toBe(true);
  });

  it("RBAC 가 없으면 담당자여도 [편집]·폐기가 꺼져 있다", async () => {
    srv.rbacRows = [];
    await openChain();
    await settle();
    expect(byTestId<HTMLButtonElement>("flow-mode-edit").disabled).toBe(true);
    expect(byTestId<HTMLButtonElement>("set-deprecate").disabled).toBe(true);
    expect(saveButton().disabled).toBe(true);
  });

  it("팔레트 [룰] → 룰 찾기에서 고르면 END 앞 선에 끼운다", async () => {
    srv.replies["search:RULE"] = ok({ rules: [DUP] });
    await openChain();
    await click("flow-mode-edit");
    await click("flow-add-rule");
    await typeInto(inDoc<HTMLInputElement>("flow-rule-search-keyword"), "E2S_");
    await act(async () => {
      inDoc("flow-rule-search-find").click();
    });
    await flush();
    await act(async () => {
      inDoc("flow-rule-cand-E2S_DUP").click();
    });
    await flush();
    expect(canvasNodeIds()).toContain("r4");
    expect(visibleText(byTestId("flow-node-r4"))).toContain("E2S_DUP");
    expect(visibleText(byTestId("set-checks"))).toContain("E2S_GRD와 E2S_DUP가 같은 결과 변수 S_GRD에 대입한다");
  });

  it("그룹 — Shift 로 여럿 고른 뒤 [그룹] 이면 두 노드를 담고, [빼기] 로 하나씩 빼며 마지막을 빼면 그룹이 없어진다(Ruling 11)", async () => {
    const shift = (type: "keydown" | "keyup") =>
      act(async () => {
        document.dispatchEvent(new KeyboardEvent(type, { key: "Shift", bubbles: true }));
      });
    await openChain();
    await click("flow-mode-edit");
    await click("flow-node-r1");
    await shift("keydown");
    await click("flow-node-r2");
    await shift("keyup");
    await click("flow-add-group");
    expect(q("flow-group-g1")).not.toBeNull();
    expect(q("flow-prop-group")).not.toBeNull();
    expect(q("flow-prop-group-member-r1")).not.toBeNull();
    expect(q("flow-prop-group-member-r2")).not.toBeNull();
    expect(saveButton().disabled).toBe(false);

    await click("flow-prop-group-remove-r1");
    expect(q("flow-prop-group-member-r1")).toBeNull();
    expect(q("flow-prop-group-member-r2")).not.toBeNull();

    await click("flow-prop-group-remove-r2");
    expect(q("flow-group-g1")).toBeNull();
    expect(q("flow-prop-group")).toBeNull();
    expect(q("flow-prop-set")).not.toBeNull();
  });

  it("그룹 — 캔버스에서 노드를 더 고른 뒤 그룹을 누르면 [선택 노드 더하기] 로 넣는다", async () => {
    srv.replies.save = ok({ setId: "E2S_CHAIN", rowVersion: 4, checks: [] });
    await openChain();
    await click("flow-mode-edit");
    await click("flow-node-r1");
    await click("flow-add-group");
    expect(q("flow-prop-group-member-r1")).not.toBeNull();
    expect(q("flow-prop-group-add")).toBeNull();

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift", bubbles: true }));
    });
    await click("flow-node-r3");
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift", bubbles: true }));
    });
    await click("flow-group-g1");
    expect(q("flow-prop-group")).not.toBeNull();
    await click("flow-prop-group-add");
    expect(q("flow-prop-group-member-r3")).not.toBeNull();
    expect(q("flow-prop-group-add")).toBeNull();

    await click("set-save");
    await settle();
    const saved = JSON.parse((calls("save")[0].body.params as Record<string, string>).flowJson) as { view: { groups: unknown[] } };
    expect(saved.view.groups).toEqual([{ id: "g1", title: "그룹", nodeIds: ["r1", "r3"] }]);
  });

  it("노드 상한 — 200개면 [룰]·[IF] 를 끼우지 않고 메시지 줄에 문구를 보인다", async () => {
    const ids = Array.from({ length: 198 }, (_, i) => `E2S_R${i + 1}`);
    await openChain(chainView({ set: { ...chainView().set, ruleIds: ids }, rules: [] }));
    await click("flow-mode-edit");
    expect(canvasNodeIds()).toHaveLength(200);
    await click("flow-add-if");
    expect(visibleText(byTestId("set-message"))).toContain("노드는 흐름 하나에 200개까지 둔다");
    expect(byTestId("set-message").style.color).toBe("var(--color-danger)");
    expect(canvasNodeIds()).toHaveLength(200);
    await click("flow-add-rule");
    expect(document.querySelector('[data-testid="flow-rule-search-keyword"]')).toBeNull();
    expect(canvasNodeIds()).toHaveLength(200);
  });

  it("탭이 다시 활성화될 때 넘겨받은 세트로 바꾸고, 저장하지 않은 변경이 있으면 확인을 받는다", async () => {
    srv.views.E2S_CHAIN = chainView();
    srv.views.E2S_OTHER = chainView({ set: { ...chainView().set, setId: "E2S_OTHER", setName: "다른 세트" } });
    handoff("E2S_CHAIN");
    await renderPage({ tabId: "tab-9" });
    await click("flow-mode-edit");
    await typeInto(byTestId<HTMLInputElement>("set-name"), "사슬(고침)");

    window.confirm = vi.fn(() => false);
    handoff("E2S_OTHER");
    await act(async () => {
      window.dispatchEvent(new CustomEvent("portal-tab-activated", { detail: { tabId: "tab-9" } }));
    });
    await flush();
    expect(window.confirm).toHaveBeenCalledWith("저장하지 않은 변경이 있습니다. 버리고 이동할까요?");
    expect(calls("view").map((r) => r.body.params)).toEqual([{ setId: "E2S_CHAIN" }]);

    window.confirm = vi.fn(() => true);
    handoff("E2S_OTHER");
    await act(async () => {
      window.dispatchEvent(new CustomEvent("portal-tab-activated", { detail: { tabId: "tab-9" } }));
    });
    await flush();
    expect(calls("view").at(-1)!.body.params).toEqual({ setId: "E2S_OTHER" });
    expect(byTestId("set-edit-current").textContent).toContain("E2S_OTHER");
    expect(byTestId("flow-canvas").getAttribute("data-mode")).toBe("view");
  });

  it("서버가 저장을 거부하면 meta.message 를 보이고 편집 중 흐름을 그대로 둔다", async () => {
    srv.replies.save = { meta: { success: false, code: "MDM024", message: "룰 세트 저장 검사를 통과하지 못했습니다: E2S_GRD[S_GRD] CYCLE 순환" } };
    await openChain();
    await click("flow-mode-edit");
    await click("flow-node-r3");
    await click("flow-prop-delete");
    await click("set-save");
    await settle();
    expect(visibleText(byTestId("set-message"))).toContain("룰 세트 저장 검사를 통과하지 못했습니다: E2S_GRD[S_GRD] CYCLE 순환");
    expect(calls("view")).toHaveLength(1);
    expect(q("flow-node-r3")).toBeNull();
    expect(saveButton().disabled).toBe(false);
  });

  it("row_version 충돌(MDM001)이면 안내와 다시 불러오기를 보이고 누르면 view 를 다시 요청한다", async () => {
    srv.replies.save = { meta: { success: false, code: "MDM001", message: "다른 사용자가 수정했습니다. 다시 불러오세요" } };
    await openChain();
    await click("flow-mode-edit");
    await typeInto(byTestId<HTMLInputElement>("set-name"), "사슬2");
    await click("set-save");
    expect(visibleText(pageContainer())).toContain("다른 창에서 바뀌었습니다. 다시 불러오세요");
    await click("set-reload");
    await settle();
    expect(calls("view")).toHaveLength(2);
    expect(byTestId<HTMLInputElement>("set-name").value).toBe("사슬");
    expect(q("set-reload")).toBeNull();
  });

  it("폐기는 두 단계다 — 폐기는 확인 문구만 보이고, 폐기 확인에서만 delete 를 보낸다(I14 화면 쪽)", async () => {
    srv.replies.delete = ok({ setId: "E2S_CHAIN", status: "DEPRECATED", rowVersion: 4, checks: [] });
    await openChain();
    await click("set-deprecate");
    expect(calls("delete")).toHaveLength(0);
    expect(visibleText(byTestId("set-message"))).toContain("폐기하면 이 세트를 부르는 호출은 판정 오류가 난다.");
    await act(async () => {
      findButton(pageContainer(), "취소").click();
    });
    expect(q("set-deprecate-confirm")).toBeNull();
    expect(calls("delete")).toHaveLength(0);

    await click("set-deprecate");
    srv.views.E2S_CHAIN = chainView({ set: { ...chainView().set, status: "DEPRECATED", rowVersion: 4 }, editable: false, restorable: true });
    await click("set-deprecate-confirm");
    await settle();
    expect(calls("delete")).toHaveLength(1);
    expect(calls("delete")[0].body.params).toEqual({ setId: "E2S_CHAIN", rowVersion: 3 });
    expect(visibleText(byTestId("set-message"))).toContain("폐기 · row_version 4. 행은 남기고 되살릴 수 있다");
    expect(byTestId("set-status").textContent).toContain("DEPRECATED");
  });

  it("DEPRECATED 세트는 [편집]·입력·저장이 비활성이고 되살리기만 된다", async () => {
    srv.replies.restore = ok({ setId: "E2S_CHAIN", status: "INUSE", rowVersion: 5, checks: [] });
    await openChain(chainView({ set: { ...chainView().set, status: "DEPRECATED" }, editable: false, restorable: true }));
    expect(byTestId<HTMLInputElement>("set-name").disabled).toBe(true);
    expect(byTestId<HTMLTextAreaElement>("set-desc").disabled).toBe(true);
    expect(byTestId<HTMLButtonElement>("flow-mode-edit").disabled).toBe(true);
    expect(saveButton().disabled).toBe(true);
    expect(q("flow-palette")).toBeNull();
    expect(q("set-deprecate")).toBeNull();

    srv.views.E2S_CHAIN = chainView({}, 5);
    await click("set-restore");
    await settle();
    expect(calls("restore")[0].body.params).toEqual({ setId: "E2S_CHAIN", rowVersion: 3 });
    expect(visibleText(byTestId("set-message"))).toContain("되살림 · row_version 5");
    expect(byTestId("set-status").textContent).toContain("INUSE");
  });

  it("비담당자(editable=false)면 [편집]·쓰기 버튼·지침 적용이 비활성이다", async () => {
    srv.replies["search:GUIDE"] = ok({ target: "S_SPD", order: ["E2S_GRD"], ambiguous: [], error: null, rules: [GRD] });
    await openChain(chainView({ editable: false }));
    expect(byTestId<HTMLButtonElement>("flow-mode-edit").disabled).toBe(true);
    expect(byTestId<HTMLButtonElement>("set-deprecate").disabled).toBe(true);
    expect(saveButton().disabled).toBe(true);
    await typeInto(byTestId<HTMLInputElement>("set-guide-var"), "S_SPD");
    await click("set-guide-run");
    expect(byTestId<HTMLButtonElement>("set-guide-apply").disabled).toBe(true);
  });

  it("구성 지침 오류는 문구로 보인다", async () => {
    srv.replies["search:GUIDE"] = ok({ target: "S_CYA", order: [], ambiguous: [], error: "순환이 있다(E2S_CYA). 룰 A의 조건이 B의 결과이고 B의 조건이 A의 결과인 경우다", rules: [] });
    await openChain();
    await typeInto(byTestId<HTMLInputElement>("set-guide-var"), "S_CYA");
    await click("set-guide-run");
    expect(byTestId("set-guide-error").textContent).toContain("순환이 있다(E2S_CYA)");
    expect(q("set-guide-apply")).toBeNull();
  });

  it("입출력 표의 컬럼 사전 변수는 컬럼 화면을, 결과 변수는 만드는 룰 화면을 연다(§6.10)", async () => {
    await openChain();
    await click("set-var-link-SET_THK");
    expect(mocks.openMdmPage).toHaveBeenCalledWith("dma/columnMng");
    await click("set-var-link-S_GRD");
    expect(mocks.openRuleEdit).toHaveBeenCalledWith("E2S_GRD");
  });

  it("화면 스타일은 React <style precedence> 로 문서에 한 번만 넣는다 — 포털은 dist 의 page.css 를 불러오지 않는다", async () => {
    const injected = () => Array.from(document.querySelectorAll('style[data-href="rsf-flow-styles"]'));
    // React 는 언마운트해도 넣은 style 을 지우지 않고 문서별로 기억한다(손으로 지우면 다시 넣지 않는다). 앞 테스트가 넣었어도 하나여야 한다.
    await openChain();
    unmountPage();
    await openChain(); // 두 번째 렌더(새 루트)
    const styles = injected();
    expect(styles).toHaveLength(1);
    const css = styles[0].textContent ?? "";
    for (const rule of [".rsf-canvas {", ".rsf-node {", ".rsf-bottom-body {", ".rsf-toolbar {", ".rsim {", ".rsim-stepper {"]) expect(css, rule).toContain(rule);
  });

  it("아래 패널은 접고 펼 수 있고, 시뮬레이션 탭 자리가 있다", async () => {
    await openChain();
    expect(q("set-checks")).not.toBeNull();
    await click("flow-tab-sim");
    expect(q("set-checks")).toBeNull();
    expect(q("flow-sim-slot")).not.toBeNull();
    await click("flow-bottom-toggle");
    expect(q("flow-sim-slot")).toBeNull();
    expect(q("flow-tab-sim")).not.toBeNull();
    await click("flow-bottom-toggle");
    expect(q("flow-sim-slot")).not.toBeNull();
  });
});

describe("useRuleSetEdit", () => {
  let state: ReturnType<typeof useRuleSetEdit> | null = null;
  const Probe = () => {
    state = useRuleSetEdit();
    return null;
  };

  let probeContainer: HTMLDivElement | null = null;
  let probeRoot: Root | null = null;

  beforeEach(() => {
    installServer();
  });

  afterEach(() => {
    act(() => {
      probeRoot?.unmount();
    });
    probeRoot = null;
    probeContainer?.remove();
    uninstallServer();
  });

  async function mountProbe(setId: string) {
    probeContainer = document.createElement("div");
    document.body.appendChild(probeContainer);
    probeRoot = createRoot(probeContainer);
    await act(async () => {
      probeRoot!.render(createElement(DmesUiProvider, null, createElement(Probe)));
    });
    await act(async () => {
      await state!.open(setId);
    });
    await settle(0);
  }

  it("열면 흐름·condIo·보기 모드를 두고, 분기 세트에서는 applyGuide 가 흐름을 바꾸지 않는다", async () => {
    srv.views.E2S_CHAIN = branchedView();
    await mountProbe("E2S_CHAIN");
    expect(state!.mode).toBe("view");
    expect(state!.flow!.nodes.map((n) => n.id)).toEqual(BRANCHED_FLOW.nodes.map((n) => n.id));
    expect(state!.condIo).toEqual({ e3: S_GRD_OK });
    expect(state!.dirty).toBe(false);
    const before = state!.flow;
    await act(async () => {
      state!.applyGuide(["E2S_GRD"], [GRD]);
    });
    expect(state!.flow).toBe(before);
    expect(state!.dirty).toBe(false);
  });

  it("flowVersion 은 nodes·edges 가 바뀔 때만 오르고, 위치만 바꾸면 그대로다(dirty 는 된다)", async () => {
    srv.views.E2S_CHAIN = chainView();
    await mountProbe("E2S_CHAIN");
    const v0 = state!.flowVersion;
    let reason: string | null = "x";
    await act(async () => {
      reason = state!.edit((f) => setPositions(f, { r1: { x: 10, y: 20 } }));
    });
    expect(reason).toBeNull();
    expect(state!.flowVersion).toBe(v0);
    expect(state!.dirty).toBe(true);
    await act(async () => {
      reason = state!.edit((f) => insertSplit(f, "e4", "PARALLEL"));
    });
    expect(reason).toBeNull();
    expect(state!.flowVersion).toBe(v0 + 1);
    await act(async () => {
      reason = state!.edit((f) => insertSplit(f, "없는선", "IF"));
    });
    expect(reason).toBe("선 없는선를 찾지 못했다");
    expect(state!.flowVersion).toBe(v0 + 1);
    expect(state!.message).toEqual({ kind: "error", text: "선 없는선를 찾지 못했다" });
  });
});
