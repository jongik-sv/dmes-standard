/** @vitest-environment happy-dom */

// 카드 ⑥ [경계값 생성] — 버튼 켬·끔, 후보 계산 인자(서버 안 부름), 막힘 사유, 선택 실행(동시 4건·중단·판정 오류),
// 선택 저장(한 건씩 차례로·실패해도 계속·다시 불러오기 1회), 실행하지 않은 선택 안내, 닫으면 다음 요청을 보내지 않음.
// 생성기(`planBoundaryCases`)와 api(`runValueTest`·`saveTestCase`)는 mock 한다.
import { act, createElement, useEffect, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import type { RuleEditCardProps } from "../../../pages/dme/ruleEdit/cards";
import { TestCaseCard } from "../../../pages/dme/ruleEdit/cards/TestCaseCard";
import { RuleWorkbenchProvider, useRuleWorkbench, type ValueTestInput } from "../../../pages/dme/ruleEdit/state/workbench-context";
import type { RuleEditView, ValueTestResult } from "../../../pages/dme/ruleEdit/types";
import type { BoundaryCandidate, BoundaryPlan } from "../../../pages/dme/ruleEdit/value-test/boundary-cases";
import { emptyResultInputs, runOutcome, runPool, saveSequential } from "../../../pages/dme/ruleEdit/value-test/boundary-run";
import { clearVersionViewCache } from "../../../pages/dme/ruleEdit/value-test/run-request";
import { RBAC_STORE_KEY, findButton, flush, installDomStorage, jsonResponse, visibleText } from "../helpers/render";
import { SAMPLE_VARS, draftView } from "./fixtures";

const mocks = vi.hoisted(() => ({
  plan: vi.fn(),
  run: vi.fn(),
  save: vi.fn(),
}));

vi.mock("../../../pages/dme/ruleEdit/value-test/boundary-cases", async (importOriginal) => {
  const m = await importOriginal<typeof import("../../../pages/dme/ruleEdit/value-test/boundary-cases")>();
  return { ...m, planBoundaryCases: mocks.plan };
});

vi.mock("../../../pages/dme/ruleEdit/api", async (importOriginal) => {
  const m = await importOriginal<typeof import("../../../pages/dme/ruleEdit/api")>();
  return { ...m, runValueTest: mocks.run, saveTestCase: mocks.save };
});

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function okResult(over: Partial<ValueTestResult> = {}): ValueTestResult {
  return {
    target: "BODY",
    ver: "2.000",
    evalTs: "2026-10-02 10:00:00",
    outcome: "OK",
    results: { QLTY_GRD: "A", PRC_FCT: "1.05" },
    hits: [{ rowId: 1, seq: 1, groupChoices: {} }],
    defaultApplied: false,
    ...over,
  };
}

function candidate(i: number): BoundaryCandidate {
  return {
    key: `c${i}`,
    caseName: `1행 COIL_THK 점${i}`,
    description: "경계값 자동 생성",
    inputJson: `{"COIL_THK":"${i}","COIL_WID":"1200","SURF_GRD":"A"}`,
    rowId: 1,
    seq: 1,
    varId: 1,
    point: "아래끝",
  };
}

function planOf(n: number, over: Partial<BoundaryPlan> = {}): BoundaryPlan {
  return { candidates: Array.from({ length: n }, (_, i) => candidate(i + 1)), skipped: [], truncated: 0, blocked: null, ...over };
}

const CASES: NonNullable<RuleEditView["testCases"]> = [
  { caseId: 1, caseName: "A급 광폭", inputJson: '{"COIL_THK":"2.0","COIL_WID":"1200","SURF_GRD":"A"}', expectedJson: null, rowVersion: 0 },
];

let container: HTMLDivElement;
let root: Root | null = null;
const originalFetch = globalThis.fetch;
let writes = 0;
let consoleErrors: unknown[][] = [];

function propsOf(view: RuleEditView, over: Partial<RuleEditCardProps> = {}): RuleEditCardProps {
  return {
    view,
    me: view.me,
    editable: view.editable,
    reload: async () => {},
    selectVer: async () => {},
    notify: () => {},
    // 카드의 쓰기 한 번 = 성공 뒤 view 다시 불러오기 한 번(useRuleEdit.runWrite).
    runWrite: async (fn) => {
      const r = await fn();
      writes += 1;
      return r;
    },
    setDirty: () => {},
    canDo: () => true,
    busy: false,
    ...over,
  };
}

/** 카드 ④ 대신 값 테스트 대상·입력·입력 줄을 올린다. */
function InputProbe({ input }: { input: ValueTestInput }): ReactNode {
  const { publishValueTestInput } = useRuleWorkbench();
  useEffect(() => publishValueTestInput(input), [publishValueTestInput, input]);
  return null;
}

async function render(view: RuleEditView, over: Partial<RuleEditCardProps> = {}, input?: ValueTestInput) {
  const children = [
    ...(input ? [createElement(InputProbe, { key: "p", input })] : []),
    createElement(TestCaseCard, { key: "c", ...propsOf(view, over) }),
  ];
  await act(async () => {
    root!.render(createElement(DmesUiProvider, null, createElement(RuleWorkbenchProvider, null, ...children)));
  });
  await flush();
}

function q<T extends Element = HTMLElement>(id: string): T | null {
  return document.querySelector(`[data-testid="${id}"]`) as T | null;
}

function boundaryButton(): HTMLButtonElement {
  return q<HTMLButtonElement>("tc-boundary")!;
}

async function clickEl(el: HTMLElement) {
  await act(async () => {
    el.click();
  });
  await flush();
}

async function openModal(view = draftView("e2e_mdm_steward", undefined, { testCases: CASES })) {
  await render(view);
  await clickEl(boundaryButton());
}

/** 후보 표의 행(row-id = 후보 key). */
function candRow(key: string): HTMLElement | null {
  return document.querySelector(`[data-testid="bc-modal"] .ag-center-cols-container .ag-row[row-id="${key}"]`);
}

function checkOf(key: string): HTMLInputElement {
  return candRow(key)!.querySelector("[col-id='checked'] input") as HTMLInputElement;
}

function statusOf(key: string): string {
  return (candRow(key)?.querySelector("[col-id='status']")?.textContent ?? "").trim();
}

async function settle(fn: () => void) {
  await act(async () => {
    fn();
  });
  await flush();
  await flush();
}

describe("카드 ⑥ 경계값 생성", { timeout: 30_000 }, () => {
  beforeEach(() => {
    installDomStorage();
    clearVersionViewCache();
    mocks.plan.mockReset();
    mocks.run.mockReset();
    mocks.save.mockReset();
    writes = 0;
    consoleErrors = [];
    vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => {
      consoleErrors.push(a);
    });
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/auth/me")) return jsonResponse({ user: { id: "tester" } });
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
    vi.restoreAllMocks();
  });

  it("버튼은 쓰기가 되고 대상이 있을 때만 켜진다(케이스가 없어도 켠다)", async () => {
    await render(draftView("e2e_mdm_steward", undefined, { testCases: [] }));
    expect(boundaryButton().textContent).toBe("경계값 생성");
    expect(boundaryButton().disabled).toBe(false);

    await render(draftView("e2e_mdm_steward", undefined, { testCases: CASES }), { canDo: (a) => a !== "save" });
    expect(boundaryButton().disabled).toBe(true);

    await render(draftView("e2e_mdm_steward", undefined, { testCases: CASES }), { busy: true });
    expect(boundaryButton().disabled).toBe(true);

    const legacy = draftView("e2e_mdm_steward", undefined, { testCases: CASES });
    await render({ ...legacy, rule: { ...legacy.rule, sourceKind: "LEGACY" } as RuleEditView["rule"] });
    expect(boundaryButton().disabled).toBe(true);

    // 실행 권한이 없으면 후보는 만들지만 [선택 실행] 은 끈다.
    mocks.plan.mockReturnValue(planOf(2));
    await render(draftView("e2e_mdm_steward", undefined, { testCases: CASES }), { canDo: (a) => a !== "execute" });
    expect(boundaryButton().disabled).toBe(false);
    await clickEl(boundaryButton());
    expect(q<HTMLButtonElement>("bc-run")!.disabled).toBe(true);
    await clickEl(findButton(document.querySelector(".cm-modal")!, "닫기"));

    // 버전이 없으면 실행 대상이 없다.
    await render(draftView("e2e_mdm_steward", undefined, { testCases: CASES, versions: [], editable: false }));
    expect(boundaryButton().disabled).toBe(true);
  });

  it("누르면 대상 표·변수·④ 입력·저장된 케이스 입력으로 후보를 만들고 서버는 부르지 않는다", async () => {
    mocks.plan.mockReturnValue(planOf(2));
    const view = draftView("e2e_mdm_steward", undefined, { testCases: CASES });
    await openModal(view);
    expect(mocks.plan).toHaveBeenCalledTimes(1);
    const arg = mocks.plan.mock.calls[0][0];
    expect(arg.vars).toBe(view.vars);
    expect(arg.rows).toBe(view.rows);
    expect(arg.baseInput).toEqual({});
    expect(arg.existingInputs).toEqual([CASES[0].inputJson]);
    expect(mocks.run).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(q("bc-modal")).not.toBeNull();
    expect(candRow("c1")?.textContent).toContain("1행 COIL_THK 점1");
    expect(statusOf("c1")).toBe("대기");
    expect(q("bc-count")?.textContent).toContain("후보 2건");
    // 표는 후보 수와 관계없이 남는 세로 공간을 채운다 — 표 칸(flex:1) 안의 절대 위치 칸과 부모 높이 100% 그리드.
    // flex 로 늘어난 칸만으로는 그리드의 height:100% 가 0px 로 접힌다(브라우저 확인).
    const box = q("bc-grid")!;
    expect(box.style.minHeight).toBe("200px");
    expect(box.style.position).toBe("relative");
    const fill = box.firstElementChild as HTMLElement;
    expect(fill.style.position).toBe("absolute");
    expect((fill.firstElementChild as HTMLElement).style.height).toBe("100%");
  });

  it("후보를 처음엔 모두 고르고, 고름을 끈 후보는 실행하지 않는다", async () => {
    mocks.plan.mockReturnValue(planOf(3));
    mocks.run.mockResolvedValue(okResult());
    await openModal();
    expect([1, 2, 3].map((i) => checkOf(`c${i}`).checked)).toEqual([true, true, true]);
    expect(q("bc-count")?.textContent).toContain("고른 후보 3건");
    await clickEl(checkOf("c2"));
    expect(checkOf("c2").checked).toBe(false);
    expect(q("bc-count")?.textContent).toContain("고른 후보 2건");
    await clickEl(q<HTMLButtonElement>("bc-run")!);
    expect(mocks.run.mock.calls.map((c) => c[0].inputJson)).toEqual([candidate(1).inputJson, candidate(3).inputJson]);
    expect(statusOf("c2")).toBe("대기");
    // 고르지 않은 후보는 "실행하지 않은 N건" 에 세지 않는다.
    expect(q("bc-unrun")).toBeNull();
  });

  it("생성기가 던지면 카드에 사유를 보이고 팝업을 열지 않는다", async () => {
    mocks.plan.mockImplementation(() => {
      throw new Error("not implemented");
    });
    await openModal();
    expect(q("bc-modal")).toBeNull();
    expect(q("tc-boundary-error")?.textContent).toContain("경계값 후보를 만들지 못했습니다. not implemented");
  });

  it("blocked 면 사유 문장만 보이고 실행·저장을 끈다", async () => {
    mocks.plan.mockReturnValue(planOf(0, { blocked: "저장하지 않은 행이 있어 후보를 만들 수 없습니다. 표를 먼저 저장하세요." }));
    await openModal();
    expect(q("bc-blocked")?.textContent).toBe("저장하지 않은 행이 있어 후보를 만들 수 없습니다. 표를 먼저 저장하세요.");
    expect(document.querySelector('[data-testid="bc-modal"] .ag-root')).toBeNull();
    expect(q<HTMLButtonElement>("bc-run")!.disabled).toBe(true);
    expect(q<HTMLButtonElement>("bc-save")!.disabled).toBe(true);
  });

  it("상한으로 뺀 건수와 후보를 못 만든 행을 보인다", async () => {
    mocks.plan.mockReturnValue(
      planOf(2, { truncated: 7, skipped: [{ rowId: 3, seq: 3, reason: "SURF_GRD 칸이 CONTAINS 라 대표값을 정하지 못합니다" }] }),
    );
    await openModal();
    expect(q("bc-truncated")?.textContent).toBe("상한 100건을 넘어 7건을 뺐습니다");
    expect(visibleText(q("bc-skipped")!)).toContain("3행 · SURF_GRD 칸이 CONTAINS 라 대표값을 정하지 못합니다");
  });

  it("선택 실행은 같은 대상 요청을 동시 4건까지 보내고, 중단하면 남은 후보를 보내지 않는다", async () => {
    mocks.plan.mockReturnValue(planOf(6));
    const pending: Deferred<ValueTestResult>[] = [];
    mocks.run.mockImplementation(() => {
      const d = deferred<ValueTestResult>();
      pending.push(d);
      return d.promise;
    });
    const view = draftView("e2e_mdm_steward", undefined, { testCases: CASES });
    await openModal(view);
    await clickEl(q<HTMLButtonElement>("bc-run")!);
    expect(mocks.run).toHaveBeenCalledTimes(4);
    expect(q("bc-progress")?.textContent).toContain("실행 0 / 6");
    expect(statusOf("c1")).toBe("실행 중");
    expect(statusOf("c5")).toBe("대기");
    // 요청은 "모두 실행" 과 같은 대상·행·적중 정책·버전이고, 입력만 후보 입력이다. 케이스 실행·판정은 싣지 않는다.
    const req = mocks.run.mock.calls[0][0];
    expect(req).toMatchObject({ ruleId: "QLTY_GRD_JDG", target: "BODY", ver: "2.000", hitPolicy: "FIRST", inputJson: candidate(1).inputJson });
    expect(req.rows).toHaveLength(view.rows.length);
    expect(req.runCases).toBe(false);
    expect(req.caseIds).toBeUndefined();
    expect(req.judge).toBeUndefined();

    await clickEl(q<HTMLButtonElement>("bc-stop")!);
    await settle(() => pending.forEach((d) => d.resolve(okResult())));
    expect(mocks.run).toHaveBeenCalledTimes(4);
    expect(q("bc-progress")?.textContent).toContain("실행 4 / 6");
    expect(statusOf("c1")).toBe("실행됨");
    expect(candRow("c1")?.querySelector("[col-id='result']")?.textContent).toBe("QLTY_GRD=A · PRC_FCT=1.05 · hit 1");
    expect(statusOf("c5")).toBe("대기");
    // 실행하지 않은 고른 후보는 저장하지 않는다고 알린다.
    expect(q("bc-unrun")?.textContent).toBe("실행하지 않은 2건은 저장하지 않습니다");
    expect(q<HTMLButtonElement>("bc-save")!.disabled).toBe(false);
  });

  it("판정 오류 후보는 '판정 오류' 로 보이고 기대값 없이 저장한다", async () => {
    mocks.plan.mockReturnValue(planOf(1));
    mocks.run.mockResolvedValue(
      okResult({ outcome: "ERROR", results: undefined, hits: [], errors: [{ stage: "INPUT_CHECK", code: "MISSING_KEY", message: "입력에 COIL_WID 값이 없습니다." }] }),
    );
    mocks.save.mockResolvedValue({ part: "CASE", caseId: 10, rowVersion: 0 });
    await openModal();
    await clickEl(q<HTMLButtonElement>("bc-run")!);
    expect(statusOf("c1")).toBe("판정 오류");
    expect(candRow("c1")?.textContent).toContain("입력에 COIL_WID 값이 없습니다.");
    expect(q("bc-unrun")).toBeNull();
    await clickEl(q<HTMLButtonElement>("bc-save")!);
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.save.mock.calls[0][1]).toEqual({
      caseName: candidate(1).caseName,
      description: "경계값 자동 생성",
      inputJson: candidate(1).inputJson,
      expectedJson: null,
    });
    expect(statusOf("c1")).toBe("저장됨");
  });

  it("선택 저장은 한 건씩 차례로 보내고, 실패해도 나머지를 저장하며, 다시 불러오기는 한 번이다", async () => {
    mocks.plan.mockReturnValue(planOf(3));
    mocks.run.mockImplementation(async () => okResult({ hits: [], defaultApplied: true, results: { QLTY_GRD: "C", PRC_FCT: "0.90" } }));
    const saves: Deferred<unknown>[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    mocks.save.mockImplementation(() => {
      const d = deferred<unknown>();
      saves.push(d);
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return d.promise.finally(() => {
        inFlight -= 1;
      });
    });
    await openModal();
    await clickEl(q<HTMLButtonElement>("bc-run")!);
    expect(statusOf("c3")).toBe("실행됨");
    await clickEl(q<HTMLButtonElement>("bc-save")!);
    expect(mocks.save).toHaveBeenCalledTimes(1);
    // 기본 행 적용이면 hit 은 대상 표의 DEFAULT 행(rowId 4)이다. 숫자 결과는 JSON 숫자로 싣는다.
    expect(mocks.save.mock.calls[0][1].expectedJson).toBe('{"QLTY_GRD":"C","PRC_FCT":0.90,"hit":4}');
    await settle(() => saves[0].resolve({}));
    expect(mocks.save).toHaveBeenCalledTimes(2);
    await settle(() => saves[1].reject(new Error("이름이 너무 깁니다")));
    expect(mocks.save).toHaveBeenCalledTimes(3);
    expect(writes).toBe(0);
    await settle(() => saves[2].resolve({}));
    expect(maxInFlight).toBe(1);
    expect(writes).toBe(1);
    expect(statusOf("c1")).toBe("저장됨");
    expect(statusOf("c2")).toBe("저장 실패(이름이 너무 깁니다)");
    expect(statusOf("c3")).toBe("저장됨");
    // 다시 저장하면 실패한 건만 보낸다.
    mocks.save.mockResolvedValue({});
    await clickEl(q<HTMLButtonElement>("bc-save")!);
    expect(mocks.save).toHaveBeenCalledTimes(4);
    expect(mocks.save.mock.calls[3][1].caseName).toBe(candidate(2).caseName);
    expect(writes).toBe(2);
    expect(statusOf("c2")).toBe("저장됨");
  });

  it("실행 요청이 실패하면 '실행 실패' 이고 저장하지 않는다", async () => {
    mocks.plan.mockReturnValue(planOf(1));
    mocks.run.mockRejectedValue(new Error("서버에 연결하지 못했습니다"));
    await openModal();
    await clickEl(q<HTMLButtonElement>("bc-run")!);
    expect(statusOf("c1")).toBe("실행 실패(서버에 연결하지 못했습니다)");
    expect(q("bc-unrun")?.textContent).toBe("실행하지 않은 1건은 저장하지 않습니다");
    expect(q<HTMLButtonElement>("bc-save")!.disabled).toBe(true);
  });

  it("팝업이 열린 채 룰이 바뀌면 팝업을 닫고, 저장은 후보를 만든 룰로만 하며 남은 저장을 보내지 않는다", async () => {
    mocks.plan.mockReturnValue(planOf(3));
    mocks.run.mockResolvedValue(okResult());
    const saves: Deferred<unknown>[] = [];
    mocks.save.mockImplementation(() => {
      const d = deferred<unknown>();
      saves.push(d);
      return d.promise;
    });
    const view = draftView("e2e_mdm_steward", undefined, { testCases: CASES });
    await openModal(view);
    await clickEl(q<HTMLButtonElement>("bc-run")!);
    await clickEl(q<HTMLButtonElement>("bc-save")!);
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.save.mock.calls[0][0]).toBe("QLTY_GRD_JDG");
    // 룰 고르기·대상 이벤트로 다른 룰이 열린다(같은 카드가 새 view 를 받는다).
    await render({ ...view, rule: { ...view.rule, maruRuleId: "OTHER_RULE" } });
    expect(q("bc-modal")).toBeNull();
    await settle(() => saves[0].resolve({}));
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.save.mock.calls.every((c) => c[0] === "QLTY_GRD_JDG")).toBe(true);
    expect(consoleErrors.filter((a) => String(a[0]).includes("unmounted"))).toEqual([]);
  });

  it("결과 계산에 쓰는 입력이 ④ 에서 비어 있으면 표 위에 경고하고, 실행은 막지 않는다", async () => {
    mocks.plan.mockReturnValue(planOf(2));
    const view = draftView("e2e_mdm_steward", undefined, { testCases: CASES });
    const fields = ["COIL_THK", "COIL_WID", "SURF_GRD", "BASE_FCT"].map((name) => ({ name, label: null, typeBadge: "String", contractBadge: "" }));
    const input: ValueTestInput = {
      ruleId: "QLTY_GRD_JDG", target: "BODY", ver: "2.000", fields,
      inputJson: '{"COIL_THK":null,"COIL_WID":null,"SURF_GRD":null,"BASE_FCT":null}',
    };
    await render(view, {}, input);
    await clickEl(boundaryButton());
    // 조건 열(COIL_THK 등)은 생성기가 채우므로 경고하지 않는다.
    expect(q("bc-empty-inputs")?.textContent).toBe(
      "결과 계산에 쓰는 입력 BASE_FCT 이(가) 비어 있습니다. 값 테스트 카드에 값을 넣고 다시 [경계값 생성] 을 누르면 판정 오류가 줄어듭니다.",
    );
    expect(q<HTMLButtonElement>("bc-run")!.disabled).toBe(false);
    await clickEl(findButton(document.querySelector(".cm-modal")!, "닫기"));

    await render(view, {}, { ...input, inputJson: '{"COIL_THK":null,"BASE_FCT":"1.2"}' });
    await clickEl(boundaryButton());
    expect(q("bc-modal")).not.toBeNull();
    expect(q("bc-empty-inputs")).toBeNull();
    expect(mocks.plan.mock.calls.at(-1)![0].baseInput).toEqual({ COIL_THK: null, BASE_FCT: "1.2" });
  });

  it("팝업을 닫으면 남은 실행 요청을 보내지 않고 늦게 온 응답으로 상태를 바꾸지 않는다", async () => {
    mocks.plan.mockReturnValue(planOf(6));
    const pending: Deferred<ValueTestResult>[] = [];
    mocks.run.mockImplementation(() => {
      const d = deferred<ValueTestResult>();
      pending.push(d);
      return d.promise;
    });
    await openModal();
    await clickEl(q<HTMLButtonElement>("bc-run")!);
    expect(mocks.run).toHaveBeenCalledTimes(4);
    await clickEl(findButton(document.querySelector('[data-testid="bc-modal"]')!.closest(".cm-modal")!, "닫기"));
    expect(q("bc-modal")).toBeNull();
    await settle(() => pending.forEach((d) => d.resolve(okResult())));
    expect(mocks.run).toHaveBeenCalledTimes(4);
    expect(consoleErrors.filter((a) => String(a[0]).includes("unmounted"))).toEqual([]);
  });
});

describe("경계값 실행 도우미", () => {
  it("runPool 은 동시 limit 건까지만 돌리고 중단 뒤에는 새로 시작하지 않는다", async () => {
    const started: number[] = [];
    const ds = new Map<number, Deferred<number>>();
    const ctl = new AbortController();
    const done = runPool([1, 2, 3, 4, 5, 6], 4, (n) => {
      started.push(n);
      const d = deferred<number>();
      ds.set(n, d);
      return d.promise;
    }, {}, ctl.signal);
    expect(started).toEqual([1, 2, 3, 4]);
    ds.get(1)!.resolve(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(started).toEqual([1, 2, 3, 4, 5]);
    ctl.abort();
    for (const n of [2, 3, 4, 5]) ds.get(n)!.resolve(n);
    await done;
    expect(started).toEqual([1, 2, 3, 4, 5]);
  });

  it("saveSequential 은 실패한 건의 사유를 알리고 다음 건을 계속 저장한다", async () => {
    const seen: Array<[number, string | null]> = [];
    const saved = await saveSequential(
      [1, 2, 3],
      async (n) => {
        if (n === 2) throw new Error("충돌");
      },
      (n, err) => seen.push([n, err]),
    );
    expect(saved).toBe(2);
    expect(seen).toEqual([
      [1, null],
      [2, "충돌"],
      [3, null],
    ]);
  });

  it("emptyResultInputs 는 조건 열이 아닌 입력 중 값이 없거나 null·빈 글자인 이름을 낸다", () => {
    const names = ["COIL_THK", "BASE_FCT", "ADJ", "MEMO", "RATE"];
    expect(emptyResultInputs(names, SAMPLE_VARS, { COIL_THK: null, base_fct: null, ADJ: "", MEMO: "x" })).toEqual(["BASE_FCT", "ADJ", "RATE"]);
  });

  it("runOutcome 은 결과로 기대 JSON 을 만들고 판정 오류면 기대값이 없다", () => {
    const ok = runOutcome(okResult(), SAMPLE_VARS, 4);
    expect(ok).toEqual({ error: false, expectedJson: '{"QLTY_GRD":"A","PRC_FCT":1.05,"hit":1}', summary: "QLTY_GRD=A · PRC_FCT=1.05 · hit 1" });
    const err = runOutcome(okResult({ outcome: "ERROR", errors: [{ stage: "EVAL", code: "X", message: "판정하지 못했습니다" }] }), SAMPLE_VARS, 4);
    expect(err).toEqual({ error: true, expectedJson: null, summary: "판정하지 못했습니다" });
  });
});
