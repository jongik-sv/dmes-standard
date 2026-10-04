/** @vitest-environment happy-dom */

// TSK-08-05 design.md §3.3 — ruleConfirm 렌더: handoff 진입(P1), 검사 표와 확정 버튼(P2·P6·P8), 경고 확인 대화상자(P3·P4),
// 서버 futureApplyFrom 기준 미래 경고(P5), 서버 거부 message(P7), 저장 시 검사 거부일 때 계약 영역 문구(P9).
// 서버는 globalThis.fetch mock 이다(§6.5 모양, B3 서비스와 같은 봉투).
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import { openMdmPage, takeMdmPageParams } from "@/shell";

import RuleConfirmPage from "../../../pages/dme/ruleConfirm/page";
import { pickDateTime } from "../../helpers/datetime-picker";
import { RBAC_STORE_KEY, flush, installDomStorage, jsonResponse, typeInto, visibleText } from "../helpers/render";

const ITEMS = ["SAVE_CHECKS", "NOT_EMPTY", "TEST_CASES", "RESULT_VAR_RELEASED"] as const;

type Issue = { severity: string; code: string; message: string; field: string | null; itemKey: string | null };
type Item = { item: string; status: string; issues: Issue[] };

let container: HTMLDivElement;
let root: Root | null = null;
const originalFetch = globalThis.fetch;
const calls: { action: string; params: Record<string, unknown> }[] = [];

function ok(result: unknown) {
  return { meta: { success: true }, data: { result } };
}

function viewResult(overrides: Record<string, unknown> = {}, version: Record<string, unknown> = {}) {
  return {
    rule: { maruRuleId: "QLTY_GRD_JDG", maruRuleName: "품질 등급 판정", ruleKind: "DECISION", status: "INUSE", sourceKind: "MDM" },
    version: {
      ver: "2.000", status: "DRAFT", ownerId: "tester", rowVersion: 3, hitPolicy: "FIRST", baseVer: "1.000",
      applyFrom: null, applyTo: null, requestedBy: null, releasedAt: null, ...version,
    },
    previous: { ver: "1.000", hitPolicy: "FIRST", applyFrom: "2026-01-01 00:00:00", applyTo: "9999-12-31 00:00:00" },
    firstVersion: false,
    diff: [
      { rowId: 1, kind: "SAME", oldSeq: 1, newSeq: 1, oldCells: '{"1":{"val":"A"}}', newCells: '{"1":{"val":"A"}}', changedVarIds: [] },
      { rowId: 2, kind: "CHANGED", oldSeq: 2, newSeq: 2, oldCells: '{"1":{"left":"1000"}}', newCells: '{"1":{"left":"1500"}}',
        changedVarIds: [1] },
      { rowId: 3, kind: "REMOVED", oldSeq: 3, newSeq: null, oldCells: '{"1":{"val":"C"}}', newCells: null, changedVarIds: [] },
      { rowId: 5, kind: "ADDED", oldSeq: null, newSeq: 4, oldCells: null, newCells: '{"1":{"val":"D"}}', changedVarIds: [] },
    ],
    diffCounts: { ADDED: 1, REMOVED: 1, CHANGED: 1, SAME: 1 },
    vars: [{ varId: 1, varKind: "COND", label: "두께", varName: "COIL_THK" }],
    serverNow: "2026-09-26 10:00:00",
    ...overrides,
  };
}

function items(patch: Partial<Record<(typeof ITEMS)[number], Partial<Item>>> = {}): Item[] {
  return ITEMS.map((item) => ({ item, status: "PASSED", issues: [], ...patch[item] }));
}

function validateResult(its: Item[], extra: Record<string, unknown> = {}) {
  return {
    items: its,
    applyFromCheck: { status: "PASSED", previousApplyFrom: "2026-01-01 00:00:00", message: null },
    contractWarnings: [],
    caseSummary: { total: 2, withExpected: 1, passed: 1, failed: 0 },
    rejectedCount: its.filter((i) => i.status === "REJECTED").length,
    warnedCount: its.filter((i) => i.status === "WARNED").length,
    applyFrom: "2026-10-01 00:00:00",
    futureApplyFrom: false,
    serverNow: "2026-09-26 10:00:00",
    ...extra,
  };
}

const GAP: Issue = { severity: "WARNING", code: "NULL_GAP", message: "COIL_THK 에 빈틈이 있습니다", field: "SAVE_CHECKS", itemKey: "VAR:1" };
const CONTRACT: Issue = {
  severity: "WARNING", code: "CONTRACT_CHANGED", message: "필수 조건 변수 COIL_WID 가 추가되었습니다", field: "SAVE_CHECKS", itemKey: "VAR:2",
};
const CASE_FAILED: Issue = {
  severity: "ERROR", code: "CASE_FAILED", message: "케이스 3 광폭: QLTY_GRD A → B", field: "TEST_CASES", itemKey: "CASE:3",
};
const CELL_ERROR: Issue = { severity: "ERROR", code: "RANGE_REVERSED", message: "경계가 역순입니다", field: "SAVE_CHECKS", itemKey: "ROW:2" };

let nextView: () => unknown;
let nextValidate: () => unknown;
let confirmResponse: unknown;
let rbacRows: { objId: string; action: string; endpoint: string; httpMethod: string }[];

async function render(props: Record<string, unknown> = {}) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(DmesUiProvider, null,
      createElement(RuleConfirmPage, { tabId: "t1", snapshot: null, onSnapshotChange: () => {}, ...props })));
  });
  await flush();
  await flush();
}

function byTestId(id: string): HTMLElement | null {
  return document.body.querySelector(`[data-testid="${id}"]`);
}

/** AgDataGrid 행(ag-row) 을 row-id(rowKey 값)로 찾는다. */
function gridRow(gridTestId: string, rowId: string): HTMLElement | null {
  return document.body.querySelector(`[data-testid="${gridTestId}"] .ag-center-cols-container .ag-row[row-id="${rowId}"]`);
}

async function click(el: Element | null | undefined) {
  expect(el).toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
  await flush();
}

async function typeTestId(testId: string, value: string) {
  const el = byTestId(testId) as HTMLInputElement;
  expect(el, testId).toBeTruthy();
  await typeInto(el, value);
}

const actions = (name: string) => calls.filter((c) => c.action === name);
const confirmButton = () => byTestId("rc-confirm") as HTMLButtonElement;
const okButton = () => byTestId("rc-modal-ok") as HTMLButtonElement;

/** 희망 적용 시작 일시를 넣는다 — 달력 + 24시간제 시·분·초 칸(`datetime-local` 이 아니다). */
async function pickApplyFrom(value: string) {
  await pickDateTime(() => byTestId("rc-apply-from") as HTMLElement, value);
}

/** 핸드오프로 QLTY_GRD_JDG 2 를 열고 apply_from 을 넣어 검사까지 한다. */
async function openAndValidate(applyFrom = "2026-10-01 00:00:00") {
  openMdmPage("dme/ruleConfirm", { maruRuleId: "QLTY_GRD_JDG", ver: "2" });
  await render();
  await pickApplyFrom(applyFrom);
  await click(byTestId("rc-validate"));
}

describe("RuleConfirmPage", () => {
  beforeEach(() => {
    installDomStorage();
    calls.length = 0;
    nextView = () => viewResult();
    nextValidate = () => validateResult(items());
    confirmResponse = ok({ ...viewResult({}, { status: "RELEASED", applyFrom: "2026-10-01 00:00:00" }),
      confirmed: { ver: "2.000", rowVersion: 4 }, closedPreviousVer: "1.000", warnings: [] });
    rbacRows = [{ objId: "*", action: "*", endpoint: "*", httpMethod: "*" }];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const m = url.match(/\/oasis\/ruleConfirm\/(\w+)/);
      if (m) {
        calls.push({ action: m[1], params: body.params ?? {} });
        if (m[1] === "search") {
          return jsonResponse(ok({ rows: [{ maruRuleId: "QLTY_GRD_JDG", maruRuleName: "품질 등급 판정", ruleKind: "DECISION",
            ver: "2.000", ownerId: "tester", ruleStatus: "INUSE" }] }));
        }
        if (m[1] === "view") return jsonResponse(ok(nextView()));
        if (m[1] === "validate") return jsonResponse(ok(nextValidate()));
        if (m[1] === "confirm") return jsonResponse(confirmResponse);
      }
      if (url.includes("/api/auth/me")) return jsonResponse({ user: { id: "tester" } });
      if (url.includes("/api/mcm/oasis/secUser/myButtonEndpoints")) {
        return jsonResponse({ grids: { buttons: { rows: rbacRows } } });
      }
      return jsonResponse({}, 404);
    }) as typeof fetch;
    delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
    takeMdmPageParams("dme/ruleConfirm");
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    container?.remove();
    globalThis.fetch = originalFetch;
    delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
    document.body.innerHTML = "";
  });

  it("확정 대기 목록을 서버에서 받아 행으로 보이고, 행을 누르면 그 룰·버전(문자열)으로 view 를 부른다", async () => {
    await render();
    expect(actions("search")).toHaveLength(1);
    expect(actions("view")).toHaveLength(0);
    await click(byTestId("rc-row-QLTY_GRD_JDG-2.000"));
    expect(actions("view").map((c) => c.params)).toEqual([{ maruRuleId: "QLTY_GRD_JDG", ver: "2.000" }]);
    expect(gridRow("rc-list", "QLTY_GRD_JDG-2.000")?.classList.contains("ag-row-highlighted")).toBe(true);
  });

  it("목록이 비면 빈 상태 문구를 보인다", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/oasis/ruleConfirm/search")) {
        calls.push({ action: "search", params: JSON.parse(String(init?.body)).params });
        return jsonResponse(ok({ rows: [] }));
      }
      if (url.includes("/api/auth/me")) return jsonResponse({ user: { id: "tester" } });
      return jsonResponse({ grids: { buttons: { rows: rbacRows } } });
    }) as typeof fetch;
    await render();
    await typeTestId("rc-keyword", "NO_SUCH");
    await click(byTestId("rc-search"));
    expect(actions("search").at(-1)?.params).toEqual({ keyword: "NO_SUCH" });
    expect(byTestId("rc-list-empty")?.textContent).toContain("확정할 DRAFT 가 없습니다");
  });

  it("목록이 0건이 됐다가 다시 N건이 되어도 그리드를 다시 마운트하지 않는다(같은 DOM 노드 유지)", async () => {
    const base = globalThis.fetch;
    let empty = false;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (empty && String(input).includes("/oasis/ruleConfirm/search")) {
        calls.push({ action: "search", params: JSON.parse(String(init?.body)).params });
        return jsonResponse(ok({ rows: [] }));
      }
      return base(input, init);
    }) as typeof fetch;
    await render();
    const gridRoot = () => document.body.querySelector('[data-testid="rc-list"] .ag-root-wrapper');
    const first = gridRoot();
    expect(first).toBeTruthy();
    expect(byTestId("rc-row-QLTY_GRD_JDG-2.000")).not.toBeNull();

    empty = true;
    await click(byTestId("rc-search"));
    await vi.waitFor(() => expect(byTestId("rc-list-empty")?.textContent).toContain("확정할 DRAFT 가 없습니다"));
    expect(gridRoot()).toBe(first);

    empty = false;
    await click(byTestId("rc-search"));
    await vi.waitFor(() => expect(byTestId("rc-row-QLTY_GRD_JDG-2.000")).not.toBeNull());
    expect(byTestId("rc-list-empty")).toBeNull();
    expect(gridRoot()).toBe(first);
  });

  it("P1 핸드오프 {maruRuleId, ver: \"2\"} 로 열면 ver 를 \"2.000\" 으로 맞춰 view 를 부르고 snapshot 에 남긴다", async () => {
    const snapshots: unknown[] = [];
    openMdmPage("dme/ruleConfirm", { maruRuleId: "QLTY_GRD_JDG", ver: "2" });
    await render({ snapshot: { maruRuleId: "OTHER", ver: 9 }, onSnapshotChange: (s: unknown) => snapshots.push(s) });
    expect(actions("view").map((c) => c.params)).toEqual([{ maruRuleId: "QLTY_GRD_JDG", ver: "2.000" }]);
    expect(snapshots).toContainEqual({ maruRuleId: "QLTY_GRD_JDG", ver: "2.000" });
    expect(byTestId("rc-target")?.textContent).toBe("QLTY_GRD_JDG 버전 v2.000 · DECISION");
    expect(visibleText(byTestId("rc-previous")!)).toContain("버전 v1.000 · 2026-01-01 00:00:00");
  });

  it("P1 minor 버전(ver \"1.001\")을 넘겨받으면 소수부를 지키고 대상 버전을 v1.001 로 보인다(D-144)", async () => {
    nextView = () => viewResult({}, { ver: "1.001", baseVer: "1.000" });
    openMdmPage("dme/ruleConfirm", { maruRuleId: "QLTY_GRD_JDG", ver: "1.001" });
    await render();
    expect(actions("view").map((c) => c.params)).toEqual([{ maruRuleId: "QLTY_GRD_JDG", ver: "1.001" }]);
    expect(byTestId("rc-target")?.textContent).toBe("QLTY_GRD_JDG 버전 v1.001 · DECISION");
  });

  it("P1 형식이 깨진 ver 는 버리고 ver 없이 부른다(서버가 DRAFT 를 고른다)", async () => {
    openMdmPage("dme/ruleConfirm", { maruRuleId: "QLTY_GRD_JDG", ver: "1.0001" });
    await render();
    expect(actions("view").map((c) => c.params)).toEqual([{ maruRuleId: "QLTY_GRD_JDG" }]);
  });

  it("P1 ver 없이 넘겨받으면 ver 파라미터를 보내지 않는다(null 은 빼고 보낸다)", async () => {
    openMdmPage("dme/ruleConfirm", { maruRuleId: "QLTY_GRD_JDG" });
    await render();
    const params = actions("view")[0].params;
    expect(params).toEqual({ maruRuleId: "QLTY_GRD_JDG" });
    expect("ver" in params).toBe(false);
  });

  it("핸드오프가 없으면 snapshot 의 룰·버전을 불러온다(옛 snapshot 의 숫자 ver 도 \"2.000\" 으로 읽는다)", async () => {
    await render({ snapshot: { maruRuleId: "QLTY_GRD_JDG", ver: 2 } });
    expect(actions("view").map((c) => c.params)).toEqual([{ maruRuleId: "QLTY_GRD_JDG", ver: "2.000" }]);
  });

  it("snapshot 의 minor 버전 문자열은 그대로 불러온다", async () => {
    await render({ snapshot: { maruRuleId: "QLTY_GRD_JDG", ver: "1.001" } });
    expect(actions("view").map((c) => c.params)).toEqual([{ maruRuleId: "QLTY_GRD_JDG", ver: "1.001" }]);
  });

  it("diff 는 건수 요약을 보이고 같은 행은 접었다가 토글로 편다. 바뀐 칸은 변수 라벨로 보인다", async () => {
    openMdmPage("dme/ruleConfirm", { maruRuleId: "QLTY_GRD_JDG", ver: "2" });
    await render();
    expect(byTestId("rc-diff-counts")?.textContent).toBe("추가 1 · 삭제 1 · 수정 1 · 같음 1");
    expect(visibleText(gridRow("rc-diff", "2")!)).toContain("수정");
    expect(visibleText(gridRow("rc-diff", "2")!)).toContain("두께");
    expect(visibleText(gridRow("rc-diff", "3")!)).toContain("삭제");
    expect(visibleText(gridRow("rc-diff", "5")!)).toContain("추가");
    expect(gridRow("rc-diff", "1")).toBeNull();
    await click(byTestId("rc-diff-show-same")?.querySelector("input"));
    expect(visibleText(gridRow("rc-diff", "1")!)).toContain("같음");
  });

  it("모든 행이 같으면 바뀐 행이 없다는 문구를 보인다", async () => {
    nextView = () => viewResult({
      diff: [{ rowId: 1, kind: "SAME", oldSeq: 1, newSeq: 1, oldCells: "{}", newCells: "{}", changedVarIds: [] }],
      diffCounts: { ADDED: 0, REMOVED: 0, CHANGED: 0, SAME: 1 },
    });
    openMdmPage("dme/ruleConfirm", { maruRuleId: "QLTY_GRD_JDG", ver: "2" });
    await render();
    expect(byTestId("rc-diff-empty")?.textContent).toContain("바뀐 행이 없습니다");
  });

  it("최초 버전이면 직전 RELEASED 자리에 면제 안내를, 계약 영역에 최초 버전을 보인다", async () => {
    nextView = () => viewResult({ previous: null, firstVersion: true });
    openMdmPage("dme/ruleConfirm", { maruRuleId: "QLTY_GRD_JDG", ver: "2" });
    await render();
    expect(visibleText(byTestId("rc-previous")!)).toContain("최초 버전 — 적용 순서 검사를 하지 않습니다");
    expect(visibleText(byTestId("rc-contract")!)).toContain("최초 버전");
  });

  it("P2 검사 결과 5행(항목 4 + 적용 순서)을 표로 그리고, 거부가 없으면 확정 버튼이 활성이다(apply_from 은 초 단위 문자열)", async () => {
    await openAndValidate();
    expect(actions("validate").map((c) => c.params)).toEqual([
      { maruRuleId: "QLTY_GRD_JDG", ver: "2.000", applyFrom: "2026-10-01 00:00:00" },
    ]);
    for (const item of [...ITEMS, "APPLY_FROM"]) expect(gridRow("rc-checks", item), item).toBeTruthy();
    expect(byTestId("rc-check-status-SAVE_CHECKS")?.textContent).toBe("통과");
    expect(byTestId("rc-check-status-APPLY_FROM")?.textContent).toBe("통과");
    expect(visibleText(gridRow("rc-checks", "TEST_CASES")!)).toContain("전체 2 · 기대값 있음 1 · 통과 1 · 실패 0");
    expect(confirmButton().disabled).toBe(false);
  });

  it("P2 REJECTED 항목이 하나라도 있으면 확정 버튼이 비활성이고 거부 행을 강조한다", async () => {
    nextValidate = () => validateResult(items({ TEST_CASES: { status: "REJECTED", issues: [CASE_FAILED] } }));
    await openAndValidate();
    expect(byTestId("rc-check-status-TEST_CASES")?.textContent).toBe("거부");
    expect(byTestId("rc-check-status-TEST_CASES")?.getAttribute("data-rejected")).toBe("true");
    // 거부 행은 행 전체를 오류 배경(ag-row-error)으로 칠한다.
    expect(gridRow("rc-checks", "TEST_CASES")?.classList.contains("ag-row-error")).toBe(true);
    expect(visibleText(gridRow("rc-checks", "TEST_CASES")!)).toContain("케이스 3 광폭: QLTY_GRD A → B (CASE:3)");
    expect(confirmButton().disabled).toBe(true);
  });

  it("P2 적용 순서가 REJECTED 면 항목이 모두 통과여도 확정 버튼이 비활성이다", async () => {
    nextValidate = () => validateResult(items(), {
      applyFromCheck: { status: "REJECTED", previousApplyFrom: "2026-10-01 00:00:00", message: "직전 RELEASED 보다 뒤여야 합니다" },
    });
    await openAndValidate();
    expect(byTestId("rc-check-status-APPLY_FROM")?.textContent).toBe("거부");
    expect(visibleText(gridRow("rc-checks", "APPLY_FROM")!)).toContain("직전 RELEASED 보다 뒤여야 합니다");
    expect(confirmButton().disabled).toBe(true);
  });

  it("검사 전에는 확정 버튼이 비활성이다", async () => {
    openMdmPage("dme/ruleConfirm", { maruRuleId: "QLTY_GRD_JDG", ver: "2" });
    await render();
    expect(confirmButton().disabled).toBe(true);
  });

  it("DRAFT 소유자가 아니면 거부가 없어도 확정 버튼이 비활성이다", async () => {
    nextView = () => viewResult({}, { ownerId: "other" });
    await openAndValidate();
    expect(confirmButton().disabled).toBe(true);
  });

  it("P3 일반 경고만 있으면 rc-ack 체크 전에는 확인이 비활성이고, 체크하고 누르면 warningsAcknowledged=true 로 확정한다", async () => {
    nextValidate = () => validateResult(items({ SAVE_CHECKS: { status: "WARNED", issues: [GAP] } }));
    await openAndValidate();
    expect(confirmButton().disabled).toBe(false);
    await click(confirmButton());
    expect(visibleText(document.body)).toContain("COIL_THK 에 빈틈이 있습니다");
    expect(byTestId("rc-contract-ack")).toBeNull();
    expect(okButton().disabled).toBe(true);
    await click(okButton());
    expect(actions("confirm")).toHaveLength(0);

    await click(byTestId("rc-ack")?.querySelector("input"));
    expect(okButton().disabled).toBe(false);
    await click(okButton());
    expect(actions("confirm").map((c) => c.params)).toEqual([{
      maruRuleId: "QLTY_GRD_JDG", ver: "2.000", rowVersion: 3, applyFrom: "2026-10-01 00:00:00", warningsAcknowledged: true,
    }]);
  });

  it("P3 경고가 없으면 체크 없이 warningsAcknowledged=false 로 확정하고, 성공하면 view·search 를 다시 부른다", async () => {
    await openAndValidate();
    await click(confirmButton());
    expect(byTestId("rc-ack")).toBeNull();
    expect(byTestId("rc-contract-ack")).toBeNull();
    nextView = () => viewResult({}, { status: "RELEASED", applyFrom: "2026-10-01 00:00:00", applyTo: "9999-12-31 00:00:00" });
    await click(okButton());
    expect(actions("confirm").map((c) => c.params)).toEqual([{
      maruRuleId: "QLTY_GRD_JDG", ver: "2.000", rowVersion: 3, applyFrom: "2026-10-01 00:00:00", warningsAcknowledged: false,
    }]);
    await flush();
    expect(visibleText(document.body)).toContain("확정했습니다");
    expect(actions("view").length).toBeGreaterThanOrEqual(2);
    expect(actions("search").length).toBeGreaterThanOrEqual(2);
    expect(visibleText(byTestId("rc-released")!)).toContain("직전 버전 v1.000 의 적용을 닫았습니다");
  });

  it("P4 계약 변경 경고가 있으면 계약 영역을 보이고, rc-contract-ack 와 rc-ack 를 모두 체크해야 확인이 켜진다", async () => {
    nextValidate = () => validateResult(items({ SAVE_CHECKS: { status: "WARNED", issues: [GAP, CONTRACT] } }),
      { contractWarnings: [CONTRACT] });
    await openAndValidate();
    const area = visibleText(byTestId("rc-contract")!);
    expect(area).toContain("필수 조건 변수 COIL_WID 가 추가되었습니다");
    expect(area).toContain("적용 시점부터 이 키를 보내지 않거나 NULL 을 보내는 호출은 판정 오류가 됩니다");

    await click(confirmButton());
    const modal = visibleText(byTestId("rc-modal-contract")!);
    expect(modal.split("필수 조건 변수 COIL_WID 가 추가되었습니다")).toHaveLength(2);
    expect(visibleText(byTestId("rc-modal-warnings")!)).not.toContain("COIL_WID");
    expect(okButton().disabled).toBe(true);
    await click(byTestId("rc-ack")?.querySelector("input"));
    expect(okButton().disabled).toBe(true);
    await click(byTestId("rc-contract-ack")?.querySelector("input"));
    expect(okButton().disabled).toBe(false);
    await click(byTestId("rc-ack")?.querySelector("input"));
    expect(okButton().disabled).toBe(true);
    await click(okButton());
    expect(actions("confirm")).toHaveLength(0);
    await click(byTestId("rc-ack")?.querySelector("input"));
    await click(okButton());
    expect(actions("confirm").map((c) => c.params.warningsAcknowledged)).toEqual([true]);
  });

  it("P4 계약 변경 경고만 있으면 rc-contract-ack 하나만 체크하면 된다", async () => {
    nextValidate = () => validateResult(items({ SAVE_CHECKS: { status: "WARNED", issues: [CONTRACT] } }),
      { contractWarnings: [CONTRACT] });
    await openAndValidate();
    await click(confirmButton());
    expect(byTestId("rc-ack")).toBeNull();
    expect(okButton().disabled).toBe(true);
    await click(byTestId("rc-contract-ack")?.querySelector("input"));
    await click(okButton());
    expect(actions("confirm").map((c) => c.params.warningsAcknowledged)).toEqual([true]);
  });

  it("P4 대화상자를 다시 열면 확인란이 모두 풀려 있다", async () => {
    nextValidate = () => validateResult(items({ SAVE_CHECKS: { status: "WARNED", issues: [GAP, CONTRACT] } }),
      { contractWarnings: [CONTRACT] });
    await openAndValidate();
    await click(confirmButton());
    await click(byTestId("rc-ack")?.querySelector("input"));
    await click(byTestId("rc-contract-ack")?.querySelector("input"));
    expect(okButton().disabled).toBe(false);
    await click(byTestId("rc-modal-cancel"));
    await click(confirmButton());
    expect(okButton().disabled).toBe(true);
  });

  it("P5 서버가 futureApplyFrom=true 를 주면 과거 일시라도 미래 적용 경고를 보인다", async () => {
    nextValidate = () => validateResult(items(), { applyFrom: "2026-01-01 00:00:00", futureApplyFrom: true });
    await openAndValidate("2026-01-01 00:00:00");
    await click(confirmButton());
    const warning = byTestId("rc-future-warning")?.textContent ?? "";
    // D8 — 경고는 철회 불가 안내가 아니라 확정 취소 안내가 된다.
    expect(warning).toContain("적용 시작 일시가 미래입니다");
    expect(warning).toContain("확정 취소로 작성 중인 상태로 되돌릴 수 있습니다");
    expect(warning).not.toContain("철회 없음");
  });

  it("P5 확정 취소의 부작용(06 교차 효과)을 안내한다 — 룰 세트와 다른 룰의 확정이 잠시 막힘(D8-10)", async () => {
    nextValidate = () => validateResult(items(), { applyFrom: "2026-01-01 00:00:00", futureApplyFrom: true });
    await openAndValidate("2026-01-01 00:00:00");
    await click(confirmButton());
    const body = visibleText(document.body);
    expect(body).toContain("룰 세트");
    expect(body).toContain("다른 룰의 확정이 잠시 막힙니다");
    expect(body).toContain("다시 확정하면 풀립니다");
  });

  it("P5 서버가 futureApplyFrom=false 를 주면 먼 미래 일시라도 미래 경고를 보이지 않는다", async () => {
    nextValidate = () => validateResult(items(), { applyFrom: "2075-01-01 00:00:00", futureApplyFrom: false });
    await openAndValidate("2075-01-01 00:00:00");
    await click(confirmButton());
    expect(okButton()).toBeTruthy();
    expect(byTestId("rc-future-warning")).toBeNull();
    expect(visibleText(document.body)).not.toContain("적용 시작 일시가 미래입니다");
  });

  it("P6 confirm 권한이 없으면(validate 는 있음) 거부가 없어도 확정 버튼이 비활성이다", async () => {
    rbacRows = ["search", "view", "validate"].map((action) => ({
      objId: "ruleConfirm", action, endpoint: `/api/mdm/oasis/ruleConfirm/${action}`, httpMethod: "POST",
    }));
    await openAndValidate();
    expect(actions("validate")).toHaveLength(1);
    expect(confirmButton().disabled).toBe(true);
  });

  it("P6 표준 관리자처럼 search·view 권한만 있으면 검사·확정 버튼이 모두 비활성이다", async () => {
    rbacRows = ["search", "view"].map((action) => ({
      objId: "ruleConfirm", action, endpoint: `/api/mdm/oasis/ruleConfirm/${action}`, httpMethod: "POST",
    }));
    openMdmPage("dme/ruleConfirm", { maruRuleId: "QLTY_GRD_JDG", ver: "2" });
    await render();
    expect((byTestId("rc-validate") as HTMLButtonElement).disabled).toBe(true);
    expect(confirmButton().disabled).toBe(true);
  });

  it("P7 서버가 meta.success=false 를 주면 그 message 를 오류 영역에 그대로 보인다", async () => {
    confirmResponse = { meta: { success: false, message: "다른 사용자가 수정했습니다. 다시 불러오세요" } };
    await openAndValidate();
    await click(confirmButton());
    await click(okButton());
    expect(byTestId("rc-error")?.textContent).toBe("다른 사용자가 수정했습니다. 다시 불러오세요");
  });

  it("P8 검사 뒤 apply_from 을 바꾸면 확정 버튼이 다시 비활성이 된다", async () => {
    await openAndValidate();
    expect(confirmButton().disabled).toBe(false);
    await pickApplyFrom("2026-10-02 00:00:00");
    expect(confirmButton().disabled).toBe(true);
    await pickApplyFrom("2026-10-01 00:00:00");
    expect(confirmButton().disabled).toBe(false);
  });

  it("희망 적용 시작 일시는 입력 칸에 직접 칠 수 있다 — 24시간제·초가 그대로 실린다", async () => {
    openMdmPage("dme/ruleConfirm", { maruRuleId: "QLTY_GRD_JDG", ver: "2" });
    await render();
    const input = byTestId("rc-apply-from") as HTMLInputElement;
    // datetime-local 이 아니라 직접 칠 수 있는 text 입력이다.
    expect(input.tagName).toBe("INPUT");
    expect(input.getAttribute("type")).toBeNull();
    expect(input.placeholder).toBe("YYYY-MM-DD HH:mm:ss");

    await typeTestId("rc-apply-from", "2026-10-01 21:45:37");
    expect(input.value).toBe("2026-10-01 21:45:37");
    await click(byTestId("rc-validate"));
    // 초까지 서버로 간다(I38).
    expect(actions("validate").map((c) => c.params)).toEqual([
      { maruRuleId: "QLTY_GRD_JDG", ver: "2.000", applyFrom: "2026-10-01 21:45:37" },
    ]);
    expect(confirmButton().disabled).toBe(false);
  });

  it("입력 칸에 못 읽는 형식을 치면 값은 그대로이고, 포커스를 벗어나면 원래 값으로 되돌린다", async () => {
    await openAndValidate();
    const input = byTestId("rc-apply-from") as HTMLInputElement;
    expect(input.value).toBe("2026-10-01 00:00:00");

    await typeTestId("rc-apply-from", "2026-10-01 25:00:00");
    // 값은 바뀌지 않았다(검사한 값과 같아 확정 버튼은 그대로 켜져 있다).
    expect(actions("validate")).toHaveLength(1);
    expect(confirmButton().disabled).toBe(false);
    // 포커스를 벗어나면 원래 값으로 되돌린다.
    await act(async () => {
      input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    await flush();
    expect(input.value).toBe("2026-10-01 00:00:00");

    // 유효한 값을 직접 치면 '지금 입력값' 이 바뀐다 — 검사한 값과 달라져 확정 버튼은 꺼진다(I34).
    await typeTestId("rc-apply-from", "2026-10-01 09:30:15");
    expect(confirmButton().disabled).toBe(true);
    await click(byTestId("rc-validate"));
    expect(actions("validate").at(-1)?.params).toEqual({
      maruRuleId: "QLTY_GRD_JDG", ver: "2.000", applyFrom: "2026-10-01 09:30:15",
    });
    expect(confirmButton().disabled).toBe(false);
    await click(confirmButton());
    await click(okButton());
    expect(actions("confirm").map((c) => c.params.applyFrom)).toEqual(["2026-10-01 09:30:15"]);
  });

  it("달력·시분초 패널로 고른 값도 24시간제·초까지 입력 칸에 보인다", async () => {
    openMdmPage("dme/ruleConfirm", { maruRuleId: "QLTY_GRD_JDG", ver: "2" });
    await render();
    const input = byTestId("rc-apply-from") as HTMLElement;
    expect(input.textContent).toBe("");
    await pickApplyFrom("2026-10-01 21:45:37");
    // 트리거 표기가 24시간제(오후 표시 없음) + 초.
    expect((input as HTMLInputElement).value).toBe("2026-10-01 21:45:37");
    // 시·분·초 세 칸만 있고 오전/오후 select 는 없다.
    await act(async () => {
      input.click();
    });
    await flush();
    const panel = document.body.querySelector("[data-dates-dropdown]")!;
    expect(panel.querySelectorAll('input[aria-label="시"], input[aria-label="분"], input[aria-label="초"]')).toHaveLength(3);
    // select 은 달력의 연·월 2개뿐 — 오전/오후 select 는 없다(24시간제).
    expect(panel.querySelectorAll("select")).toHaveLength(2);
    expect(panel.textContent).not.toMatch(/AM|PM/);

    await click(byTestId("rc-validate"));
    // 초까지 서버로 간다(I38).
    expect(actions("validate").map((c) => c.params)).toEqual([
      { maruRuleId: "QLTY_GRD_JDG", ver: "2.000", applyFrom: "2026-10-01 21:45:37" },
    ]);
    expect(confirmButton().disabled).toBe(false);
  });

  it("P9 저장 시 검사가 거부면 계약 영역에 '보지 못했다' 문구를 보이고 '변경 없음' 으로 단정하지 않는다", async () => {
    nextValidate = () => validateResult(items({ SAVE_CHECKS: { status: "REJECTED", issues: [CELL_ERROR] } }));
    await openAndValidate();
    const area = visibleText(byTestId("rc-contract")!);
    expect(area).toContain("저장 시 검사 오류가 있어 계약 변경을 보지 못했습니다");
    expect(area).not.toContain("입력 계약 변경 없음");
  });

  it("검사를 통과했고 계약 경고가 없으면 계약 영역에 변경 없음을 보인다", async () => {
    await openAndValidate();
    expect(visibleText(byTestId("rc-contract")!)).toContain("직전 RELEASED 대비 입력 계약 변경 없음");
  });

  it("DRAFT 가 아닌 버전은 읽기 전용이고 확정 결과(적용 구간·확정자)를 보인다", async () => {
    nextView = () => viewResult({}, {
      status: "RELEASED", applyFrom: "2026-01-01 00:00:00", applyTo: "9999-12-31 00:00:00", requestedBy: "kim",
      releasedAt: "2026-09-03 00:00:00",
    });
    openMdmPage("dme/ruleConfirm", { maruRuleId: "QLTY_GRD_JDG", ver: "2" });
    await render();
    expect(byTestId("rc-apply-from")).toBeNull();
    expect((byTestId("rc-validate") as HTMLButtonElement | null)?.disabled ?? true).toBe(true);
    const released = visibleText(byTestId("rc-released")!);
    expect(released).toContain("2026-01-01 00:00:00 ~ 9999-12-31 00:00:00");
    expect(released).toContain("kim");
  });
});
