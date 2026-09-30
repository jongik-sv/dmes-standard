/** @vitest-environment happy-dom */

// TSK-08-06 design §2.3·§6.9·§6.10 — ruleSetEdit 렌더 테스트. 넘겨받은 setId 로 view(I22 받는 쪽), 목록·의존 룰·입출력 표,
// ▲▼✕·드래그·룰 추가·지침 적용 뒤 서버 호출 없는 즉시 재계산(I21), 화면 검사가 저장을 막지 않음(D9), 저장 grids 모양,
// 거부·경고·MDM001 표시, 폐기 두 단계(I14 화면 쪽), DEPRECATED·비담당자·RBAC 없음의 비활성, 룰 링크.
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

// 룰 목록 그리드(rowKey=ruleId)의 props 를 잡아 두고 실제 그리드를 그린다 — 드래그는 onRowOrderChange 호출로 모사한다.
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

import RuleSetEditPage from "../../../pages/dme/ruleSetEdit/page";
import { useRuleSetEdit } from "../../../pages/dme/ruleSetEdit/state/useRuleSetEdit";
import type { RuleIo, RuleSetView } from "../../../pages/dme/ruleSetEdit/types";
import type { RuleSetFlow } from "../../../src/contract/engine-contract.generated";

import { RBAC_STORE_KEY, findButton, flush, installDomStorage, jsonResponse, typeInto, visibleText } from "../helpers/render";

type Src = "DICT" | "PROG" | "NONE";

function io(ruleId: string, conds: Array<[string, Src]>, results: string[], extra: Partial<RuleIo> = {}): RuleIo {
  const name = (n: string, source: Src | null) => ({ name: n, source, label: null, dataType: null, scale: null, dateString: false, maruCodeId: null });
  return {
    ruleId,
    ruleName: `${ruleId} 이름`,
    ruleKind: "DECISION",
    status: "INUSE",
    exists: true,
    releasedVer: 1,
    hitPolicy: "FIRST",
    conds: conds.map(([n, s]) => name(n, s)),
    results: results.map((r) => name(r, null)),
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
    editable: true,
    restorable: false,
    ...over,
  };
}

const ORDER_MSG = "E2S_FCT가 뒤에 도는 E2S_GRD의 결과 변수 S_GRD를 읽는다. E2S_GRD를 E2S_FCT 앞으로 옮긴다";

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

const PARTIAL_MSG = "E2S_SPD가 읽는 S_FCT는 IF 의 일부 갈래에서만 만들어진다. 다른 갈래를 타면 판정 오류다";

let container: HTMLDivElement;
let root: Root | null = null;
const originalFetch = globalThis.fetch;
const originalConfirm = window.confirm;
let requests: Array<{ action: string; body: Record<string, unknown> }> = [];
let views: Record<string, RuleSetView> = {};
let replies: Record<string, unknown> = {};
let rbacRows: Array<Record<string, string>> = [];

const ok = (result: unknown) => ({ meta: { success: true }, data: { result } });
const setEditCalls = () => requests.length;
const calls = (action: string) => requests.filter((r) => r.action === action);

function handoff(setId: string) {
  const g = globalThis as Record<string, unknown>;
  const store = (g.__mdmPageHandoff__ ??= {}) as Record<string, Record<string, string>>;
  store["mdm:dme/ruleSetEdit"] = { setId };
}

async function settle(ms = 300) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

async function render(props: { tabId?: string } = {}) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(DmesUiProvider, null, createElement(RuleSetEditPage, props)));
  });
  await flush();
  await settle();
}

function q<T extends Element = HTMLElement>(id: string): T | null {
  return container.querySelector(`[data-testid="${id}"]`) as T | null;
}

function byTestId<T extends Element = HTMLElement>(id: string): T {
  const el = q<T>(id);
  if (!el) throw new Error(`data-testid ${id} 없음`);
  return el;
}

/** 세트 입출력 그리드의 변수 한 행(AgDataGrid 행 id = 변수 이름). */
function ioRowOrNull(kind: "inputs" | "results", name: string): HTMLElement | null {
  return container.querySelector(`[data-testid="set-io-${kind}"] .ag-row[row-id="${name}"]`);
}

function ioRow(kind: "inputs" | "results", name: string): HTMLElement {
  const el = ioRowOrNull(kind, name);
  if (!el) throw new Error(`set-io-${kind} 행 ${name} 없음`);
  return el;
}

async function click(id: string) {
  await act(async () => {
    byTestId<HTMLElement>(id).click();
  });
  await flush();
}

async function openChain(view = chainView()) {
  views.E2S_CHAIN = view;
  handoff("E2S_CHAIN");
  await render();
}

describe("RuleSetEditPage", () => {
  beforeEach(() => {
    installDomStorage();
    requests = [];
    views = {};
    replies = {};
    rbacRows = [{ objId: "*", action: "*", endpoint: "*", httpMethod: "*" }];
    mocks.openRuleEdit.mockReset();
    mocks.openMdmPage.mockReset();
    mocks.grid.current = null;
    window.confirm = vi.fn(() => true);
    delete (globalThis as Record<string, unknown>).__mdmPageHandoff__;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const m = url.match(/\/oasis\/ruleSetEdit\/(\w+)/);
      if (m) {
        const action = m[1];
        requests.push({ action, body });
        const params = (body.params ?? {}) as Record<string, string>;
        if (action === "view") {
          const v = views[params.setId];
          return jsonResponse(v ? ok(v) : { meta: { success: false, message: `룰 세트를 찾을 수 없습니다: ${params.setId}` } });
        }
        const key = action === "search" ? `search:${params.target ?? "SET"}` : action;
        return jsonResponse(replies[key] ?? ok({}));
      }
      if (url.includes("/api/auth/me")) return jsonResponse({ user: { id: "tester" } });
      if (url.includes("/api/mcm/oasis/secUser/myButtonEndpoints")) return jsonResponse({ grids: { buttons: { rows: rbacRows } } });
      return jsonResponse({}, 404);
    }) as typeof fetch;
    delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    globalThis.fetch = originalFetch;
    window.confirm = originalConfirm;
    delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
    delete (globalThis as Record<string, unknown>).__mdmPageHandoff__;
  });

  it("세트를 고르기 전에는 빈 상태이고, 찾기 → 후보를 누르면 그 세트를 view 로 연다", async () => {
    views.E2S_CHAIN = chainView();
    replies["search:SET"] = ok({ sets: [{ setId: "E2S_CHAIN", setName: "사슬", status: "INUSE" }] });
    await render();
    expect(visibleText(container)).toContain("세트를 골라 편집한다. 새 세트는 룰 세트 화면에서 등록한다");
    expect(calls("view")).toHaveLength(0);
    await typeInto(byTestId<HTMLInputElement>("set-pick-keyword"), "E2S_");
    await act(async () => {
      findButton(container, "찾기").click();
    });
    await flush();
    expect(calls("search").at(-1)!.body.params).toEqual({ target: "SET", keyword: "E2S_" });
    expect(calls("search").at(-1)!.body.meta).toEqual({ menuId: "ruleSetEdit" });
    await click("set-pick-E2S_CHAIN");
    await settle();
    expect(calls("view").at(-1)!.body.params).toEqual({ setId: "E2S_CHAIN" });
    expect(byTestId("set-edit-current").textContent).toContain("E2S_CHAIN");
  });

  it("넘겨받은 setId 로 view 를 요청하고 목록·의존 룰·입출력 표·검사 통과를 보인다(I22 받는 쪽)", async () => {
    await openChain();
    expect(calls("view")).toHaveLength(1);
    expect(calls("view")[0].body.params).toEqual({ setId: "E2S_CHAIN" });
    expect(byTestId("set-status").textContent).toContain("INUSE");
    expect(visibleText(container)).toContain("row_version 3");
    expect(visibleText(container)).toContain("버전·승인 없음");
    expect(byTestId<HTMLInputElement>("set-name").value).toBe("사슬");
    expect(byTestId("set-rule-link-E2S_GRD")).toBeTruthy();
    expect(byTestId("set-rule-link-E2S_SPD")).toBeTruthy();
    expect(q("set-dep-later-E2S_FCT-E2S_GRD")).toBeNull();
    expect(visibleText(byTestId("set-checks"))).toContain("통과");

    const inputs = visibleText(byTestId("set-io-inputs"));
    expect(inputs).toContain("입력 변수 3개");
    for (const n of ["SET_THK", "SET_SURF", "SET_WID"]) expect(visibleText(ioRow("inputs", n))).toContain("컬럼 사전");
    const results = visibleText(byTestId("set-io-results"));
    expect(results).toContain("결과 변수 3개 · 최종 1개, 중간 2개");
    expect(visibleText(ioRow("results", "S_SPD"))).toContain("최종");
    expect(visibleText(ioRow("results", "S_GRD"))).toContain("중간");
    expect(visibleText(ioRow("results", "S_FCT"))).toContain("중간");
  });

  it("탭이 다시 활성화될 때 넘겨받은 세트로 바꾸고, 저장하지 않은 변경이 있으면 확인을 받는다", async () => {
    views.E2S_CHAIN = chainView();
    views.E2S_OTHER = chainView({ set: { ...chainView().set, setId: "E2S_OTHER", setName: "다른 세트" } });
    handoff("E2S_CHAIN");
    await render({ tabId: "tab-9" });
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
  });

  it("▼·▲·✕ 는 서버를 부르지 않고 뒤에 있음·입력 변수 출처·검사 목록을 바로 다시 계산한다(I21)", async () => {
    await openChain();
    const before = setEditCalls();

    await click("set-rule-down-E2S_GRD");
    await settle();
    expect(byTestId("set-dep-later-E2S_FCT-E2S_GRD").textContent).toContain("뒤에 있음");
    expect(visibleText(ioRow("inputs", "S_GRD"))).toContain("어디에도 없음");
    expect(visibleText(byTestId("set-checks"))).toContain(ORDER_MSG);
    expect(visibleText(byTestId("set-checks"))).toContain("거부");

    await click("set-rule-up-E2S_GRD");
    await settle();
    expect(q("set-dep-later-E2S_FCT-E2S_GRD")).toBeNull();
    expect(ioRowOrNull("inputs", "S_GRD")).toBeNull();
    expect(visibleText(byTestId("set-checks"))).toContain("통과");

    await click("set-rule-remove-E2S_SPD");
    await settle();
    expect(q("set-rule-link-E2S_SPD")).toBeNull();
    expect(ioRowOrNull("results", "S_SPD")).toBeNull();
    expect(visibleText(ioRow("results", "S_FCT"))).toContain("최종");
    expect(setEditCalls()).toBe(before);
  });

  it("행을 끌어 놓으면(onRowOrderChange) 서버 호출 없이 다시 계산한다", async () => {
    await openChain();
    const before = setEditCalls();
    const onRowOrderChange = mocks.grid.current?.onRowOrderChange as (keys: string[]) => void;
    expect(mocks.grid.current?.rowDragField).toBe("seqNo");
    expect(typeof onRowOrderChange).toBe("function");
    await act(async () => {
      onRowOrderChange(["E2S_FCT", "E2S_GRD", "E2S_SPD"]);
    });
    await settle();
    expect(visibleText(byTestId("set-checks"))).toContain(ORDER_MSG);
    expect(byTestId("set-dep-later-E2S_FCT-E2S_GRD")).toBeTruthy();
    expect(setEditCalls()).toBe(before);
  });

  it("화면 검사에 거부가 있어도 세트 저장은 막지 않고 서버에 보낸다(D9)", async () => {
    await openChain();
    await click("set-rule-down-E2S_GRD");
    expect(visibleText(byTestId("set-checks"))).toContain(ORDER_MSG);
    const save = byTestId<HTMLButtonElement>("set-save");
    expect(save.disabled).toBe(false);
    await click("set-save");
    expect(calls("save")).toHaveLength(1);
  });

  it("룰 추가 — RULE 후보를 누르면 목록 끝에 더하고(서버 호출 없이 재계산) 이미 담은 룰은 막는다", async () => {
    replies["search:RULE"] = ok({ rules: [DUP, GRD] });
    await openChain();
    await typeInto(byTestId<HTMLInputElement>("set-rule-add-keyword"), "E2S_");
    await click("set-rule-add-find");
    expect(calls("search").at(-1)!.body.params).toEqual({ target: "RULE", keyword: "E2S_" });
    const afterSearch = setEditCalls();

    await click("set-rule-cand-E2S_DUP");
    await settle();
    expect(byTestId("set-rule-link-E2S_DUP")).toBeTruthy();
    expect(visibleText(byTestId("set-checks"))).toContain("E2S_GRD와 E2S_DUP가 같은 결과 변수 S_GRD에 대입한다");
    expect(visibleText(byTestId("set-checks"))).toContain("경고");
    expect(visibleText(ioRow("results", "S_GRD"))).toContain("덮어씀");

    await click("set-rule-cand-E2S_GRD");
    expect(visibleText(container)).toContain("이미 담은 룰이다");
    expect(setEditCalls()).toBe(afterSearch);
  });

  it("세트 저장은 params 에 세트명·rowVersion, grids.rules.rows 에 룰 순서를 보내고 경고와 새 row_version 을 보인다", async () => {
    replies.save = ok({ setId: "E2S_CHAIN", rowVersion: 4, checks: [{ code: "DUP_RESULT", severity: "WARN", ruleId: "E2S_SPD", otherRuleId: "E2S_GRD", varName: "S_GRD", message: "경고 문장" }] });
    await openChain();
    expect(byTestId<HTMLButtonElement>("set-save").disabled).toBe(true);
    await typeInto(byTestId<HTMLInputElement>("set-name"), "사슬(수정)");
    await click("set-rule-down-E2S_FCT");
    views.E2S_CHAIN = chainView({ set: { ...chainView().set, setName: "사슬(수정)", rowVersion: 4, ruleIds: ["E2S_GRD", "E2S_SPD", "E2S_FCT"] } });
    await click("set-save");
    await settle();
    const save = calls("save")[0].body;
    expect(save.params).toEqual({ setId: "E2S_CHAIN", setName: "사슬(수정)", rowVersion: 3 });
    expect(save.grids).toEqual({ rules: { rows: [{ ruleId: "E2S_GRD" }, { ruleId: "E2S_SPD" }, { ruleId: "E2S_FCT" }] } });
    expect(calls("view")).toHaveLength(2);
    const msg = visibleText(byTestId("set-message"));
    expect(msg).toContain("저장 · row_version 4");
    expect(msg).toContain("경고 문장");
    expect(visibleText(container)).toContain("row_version 4");
  });

  it("서버가 저장을 거부하면 meta.message 를 보이고 편집 중 목록을 그대로 둔다", async () => {
    replies.save = { meta: { success: false, code: "MDM024", message: "룰 세트 저장 검사를 통과하지 못했습니다: E2S_GRD[S_GRD] CYCLE 순환" } };
    await openChain();
    await click("set-rule-remove-E2S_SPD");
    await click("set-save");
    await settle();
    expect(visibleText(byTestId("set-message"))).toContain("룰 세트 저장 검사를 통과하지 못했습니다: E2S_GRD[S_GRD] CYCLE 순환");
    expect(calls("view")).toHaveLength(1);
    expect(q("set-rule-link-E2S_SPD")).toBeNull();
    expect(byTestId<HTMLButtonElement>("set-save").disabled).toBe(false);
  });

  it("row_version 충돌(MDM001)이면 안내와 다시 불러오기를 보이고 누르면 view 를 다시 요청한다", async () => {
    replies.save = { meta: { success: false, code: "MDM001", message: "다른 사용자가 수정했습니다. 다시 불러오세요" } };
    await openChain();
    await typeInto(byTestId<HTMLInputElement>("set-name"), "사슬2");
    await click("set-save");
    expect(visibleText(container)).toContain("다른 창에서 바뀌었습니다. 다시 불러오세요");
    await act(async () => {
      findButton(container, "다시 불러오기").click();
    });
    await flush();
    expect(calls("view")).toHaveLength(2);
    expect(byTestId<HTMLInputElement>("set-name").value).toBe("사슬");
  });

  it("폐기는 두 단계다 — 폐기는 확인 문구만 보이고, 폐기 확인에서만 delete 를 보낸다(I14 화면 쪽)", async () => {
    replies.delete = ok({ setId: "E2S_CHAIN", status: "DEPRECATED", rowVersion: 4, checks: [] });
    await openChain();
    await click("set-deprecate");
    expect(calls("delete")).toHaveLength(0);
    expect(visibleText(byTestId("set-message"))).toContain("폐기하면 이 세트를 부르는 호출은 판정 오류가 난다.");
    await act(async () => {
      findButton(container, "취소").click();
    });
    expect(q("set-deprecate-confirm")).toBeNull();
    expect(calls("delete")).toHaveLength(0);

    await click("set-deprecate");
    views.E2S_CHAIN = chainView({ set: { ...chainView().set, status: "DEPRECATED", rowVersion: 4 }, editable: false, restorable: true });
    await click("set-deprecate-confirm");
    await settle();
    expect(calls("delete")).toHaveLength(1);
    expect(calls("delete")[0].body.params).toEqual({ setId: "E2S_CHAIN", rowVersion: 3 });
    expect(visibleText(byTestId("set-message"))).toContain("폐기 · row_version 4. 행은 남기고 되살릴 수 있다");
    expect(byTestId("set-status").textContent).toContain("DEPRECATED");
  });

  it("DEPRECATED 세트는 입력·그리드·룰 추가·저장이 비활성이고 되살리기만 된다", async () => {
    replies.restore = ok({ setId: "E2S_CHAIN", status: "INUSE", rowVersion: 5, checks: [] });
    await openChain(chainView({ set: { ...chainView().set, status: "DEPRECATED" }, editable: false, restorable: true }));
    expect(byTestId<HTMLInputElement>("set-name").disabled).toBe(true);
    expect(byTestId<HTMLTextAreaElement>("set-desc").disabled).toBe(true);
    expect(byTestId<HTMLButtonElement>("set-rule-add-find").disabled).toBe(true);
    expect(byTestId<HTMLButtonElement>("set-save").disabled).toBe(true);
    expect(q("set-rule-up-E2S_GRD")).toBeNull();
    expect(q("set-rule-remove-E2S_GRD")).toBeNull();
    expect(mocks.grid.current?.onRowOrderChange).toBeUndefined();
    expect(mocks.grid.current?.rowDragField).toBeUndefined();
    expect(q("set-deprecate")).toBeNull();

    views.E2S_CHAIN = chainView({}, 5);
    await click("set-restore");
    await settle();
    expect(calls("restore")[0].body.params).toEqual({ setId: "E2S_CHAIN", rowVersion: 3 });
    expect(visibleText(byTestId("set-message"))).toContain("되살림 · row_version 5");
    expect(byTestId("set-status").textContent).toContain("INUSE");
  });

  it("비담당자(editable=false)면 쓰기 버튼·목록 편집·지침 적용이 비활성이다", async () => {
    replies["search:GUIDE"] = ok({ target: "S_SPD", order: ["E2S_GRD"], ambiguous: [], error: null, rules: [GRD] });
    await openChain(chainView({ editable: false }));
    expect(byTestId<HTMLButtonElement>("set-deprecate").disabled).toBe(true);
    expect(byTestId<HTMLButtonElement>("set-save").disabled).toBe(true);
    expect(byTestId<HTMLButtonElement>("set-rule-add-find").disabled).toBe(true);
    expect(q("set-rule-down-E2S_GRD")).toBeNull();
    expect(mocks.grid.current?.onRowOrderChange).toBeUndefined();
    await typeInto(byTestId<HTMLInputElement>("set-guide-var"), "S_SPD");
    await click("set-guide-run");
    expect(byTestId<HTMLButtonElement>("set-guide-apply").disabled).toBe(true);
  });

  it("RBAC 가 없으면 담당자여도 저장·폐기·룰 추가가 비활성이다", async () => {
    rbacRows = [];
    await openChain();
    await settle();
    expect(byTestId<HTMLButtonElement>("set-deprecate").disabled).toBe(true);
    expect(byTestId<HTMLButtonElement>("set-rule-add-find").disabled).toBe(true);
    expect(q("set-rule-down-E2S_GRD")).toBeNull();
    await typeInto(byTestId<HTMLInputElement>("set-name"), "사슬3");
    expect(byTestId<HTMLButtonElement>("set-save").disabled).toBe(true);
  });

  it("구성 지침 — 제안 순서·고르기를 보이고 적용하면 서버 호출 없이 목록을 바꾸고 dirty 가 된다", async () => {
    replies["search:GUIDE"] = ok({
      target: "S_SPD",
      order: ["E2S_DUP", "E2S_FCT", "E2S_SPD"],
      ambiguous: [{ varName: "S_GRD", ruleIds: ["E2S_DUP", "E2S_GRD"] }],
      error: null,
      rules: [DUP, FCT, SPD],
    });
    await openChain();
    await typeInto(byTestId<HTMLInputElement>("set-guide-var"), "S_SPD");
    await click("set-guide-run");
    expect(calls("search").at(-1)!.body.params).toEqual({ target: "GUIDE", resultVar: "S_SPD" });
    const order = visibleText(byTestId("set-guide-order"));
    expect(order).toContain("1. E2S_DUP → 2. E2S_FCT → 3. E2S_SPD");
    expect(order).toContain("S_GRD: E2S_DUP, E2S_GRD");
    const afterGuide = setEditCalls();
    expect(byTestId<HTMLButtonElement>("set-save").disabled).toBe(true);

    await click("set-guide-apply");
    await settle();
    expect(byTestId("set-rule-link-E2S_DUP")).toBeTruthy();
    expect(q("set-rule-link-E2S_GRD")).toBeNull();
    expect(visibleText(ioRow("inputs", "SET_WID"))).toContain("컬럼 사전");
    expect(ioRowOrNull("inputs", "SET_THK")).toBeNull();
    expect(byTestId<HTMLButtonElement>("set-save").disabled).toBe(false);
    expect(setEditCalls()).toBe(afterGuide);
  });

  it("구성 지침 오류는 문구로 보인다", async () => {
    replies["search:GUIDE"] = ok({ target: "S_CYA", order: [], ambiguous: [], error: "순환이 있다(E2S_CYA). 룰 A의 조건이 B의 결과이고 B의 조건이 A의 결과인 경우다", rules: [] });
    await openChain();
    await typeInto(byTestId<HTMLInputElement>("set-guide-var"), "S_CYA");
    await click("set-guide-run");
    expect(byTestId("set-guide-error").textContent).toContain("순환이 있다(E2S_CYA)");
    expect(q("set-guide-apply")).toBeNull();
  });

  it("룰 ID 링크는 openRuleEdit 를, 컬럼 사전 변수는 컬럼 화면을 연다(§6.10)", async () => {
    await openChain();
    await click("set-rule-link-E2S_GRD");
    expect(mocks.openRuleEdit).toHaveBeenCalledWith("E2S_GRD");
    await click("set-var-link-SET_THK");
    expect(mocks.openMdmPage).toHaveBeenCalledWith("dma/columnMng");
    mocks.openRuleEdit.mockReset();
    await click("set-var-link-S_GRD");
    expect(mocks.openRuleEdit).toHaveBeenCalledWith("E2S_GRD");
  });

  it("분기가 있는 세트는 목록 편집·저장·지침 적용을 막고 안내와 서버 검사를 보인다(FLOW_READONLY 화면 쪽)", async () => {
    const partial = {
      code: "FLOW_PARTIAL" as const,
      severity: "WARN" as const,
      ruleId: "E2S_SPD",
      otherRuleId: null,
      varName: "S_FCT",
      message: PARTIAL_MSG,
      nodeId: "r3",
      edgeId: null,
    };
    replies["search:GUIDE"] = ok({ target: "S_SPD", order: ["E2S_GRD"], ambiguous: [], error: null, rules: [GRD] });
    await openChain(chainView({ set: { ...chainView().set, flow: BRANCHED_FLOW, branched: true }, checks: [partial] }));

    expect(byTestId("set-branched-notice").textContent).toContain("분기가 있는 세트는 흐름도 편집기(준비 중)에서 편집한다");
    expect(byTestId<HTMLInputElement>("set-name").disabled).toBe(true);
    expect(byTestId<HTMLTextAreaElement>("set-desc").disabled).toBe(true);
    expect(byTestId<HTMLButtonElement>("set-rule-add-find").disabled).toBe(true);
    expect(q("set-rule-down-E2S_GRD")).toBeNull();
    expect(q("set-rule-remove-E2S_GRD")).toBeNull();
    expect(mocks.grid.current?.onRowOrderChange).toBeUndefined();
    expect(byTestId<HTMLButtonElement>("set-save").disabled).toBe(true);

    // 화면 즉시 계산(한 줄)이면 "통과"지만 분기 세트는 서버 흐름 검사를 그대로 보인다.
    const checks = visibleText(byTestId("set-checks"));
    expect(checks).toContain(PARTIAL_MSG);
    expect(checks).toContain("경고");
    expect(checks).not.toContain("통과");

    expect(byTestId<HTMLButtonElement>("set-deprecate").disabled).toBe(false);
    await typeInto(byTestId<HTMLInputElement>("set-guide-var"), "S_SPD");
    await click("set-guide-run");
    expect(byTestId<HTMLButtonElement>("set-guide-apply").disabled).toBe(true);

    await click("set-rule-link-E2S_FCT");
    expect(mocks.openRuleEdit).toHaveBeenCalledWith("E2S_FCT");
    expect(calls("save")).toHaveLength(0);
  });

  it("분기 세트에서는 상태 훅의 applyGuide 도 목록을 바꾸지 않는다(save 와 같은 가드)", async () => {
    let state: ReturnType<typeof useRuleSetEdit> | null = null;
    const Probe = () => {
      state = useRuleSetEdit();
      return null;
    };
    views.E2S_CHAIN = chainView({ set: { ...chainView().set, flow: BRANCHED_FLOW, branched: true } });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(createElement(DmesUiProvider, null, createElement(Probe)));
    });
    await act(async () => {
      await state!.open("E2S_CHAIN");
    });
    await settle();
    const before = [...state!.ids];
    expect(before).toEqual(["E2S_GRD", "E2S_FCT", "E2S_SPD"]);
    await act(async () => {
      state!.applyGuide(["E2S_GRD"], [GRD]);
    });
    expect(state!.ids).toEqual(before);
  });

  it("분기가 없는 세트에는 분기 안내가 없다", async () => {
    await openChain();
    expect(q("set-branched-notice")).toBeNull();
  });
});
