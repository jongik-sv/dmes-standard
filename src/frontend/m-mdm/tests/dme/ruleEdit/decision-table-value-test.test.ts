/** @vitest-environment happy-dom */

// TSK-08-04 design §2.5 ①~④·I26·I33 — 의사결정표 카드와 카드 공유 상태(RuleWorkbenchContext). 표 카드가 편집 중인 표를 올리고(rev),
// 이 표가 보이는 정의의 값 테스트 결과만 칠하며(BODY 결과 뒤 표가 바뀌면 지우고 안내), 저장 거부 때 메시지를 보이고 편집을 유지하고,
// 서버 저장 검사 이슈는 동치 배지와 따로 보인다. 그리드 칸 클래스는 순수 함수 테스트(value-test-marks)가 보고, 여기서는 그리드 밖만 본다.
import { createElement, act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import type { RuleEditCardProps } from "../../../pages/dme/ruleEdit/cards";
import { DecisionTableCard } from "../../../pages/dme/ruleEdit/decision-table/DecisionTableCard";
import { RuleWorkbenchProvider, useRuleWorkbench, type RuleWorkbench } from "../../../pages/dme/ruleEdit/state/workbench-context";
import type { RuleEditView, ValueTestResult } from "../../../pages/dme/ruleEdit/types";
import type { TestRunView } from "../../../pages/dme/ruleEdit/value-test/test-marks";
import { RBAC_STORE_KEY, findButton, flush, installDomStorage, jsonResponse, visibleText } from "../helpers/render";
import { draftView } from "./fixtures";

let container: HTMLDivElement;
let root: Root | null = null;
const originalFetch = globalThis.fetch;
let saveResponse: unknown;
let wb: RuleWorkbench;
let errors: string[] = [];

function Probe(): ReactNode {
  wb = useRuleWorkbench();
  return null;
}

function propsOf(view: RuleEditView): RuleEditCardProps {
  return {
    view,
    me: view.me,
    editable: view.editable,
    reload: async () => {},
    selectVer: async () => {},
    notify: () => {},
    // useRuleEdit.runWrite 와 같게 — 실패하면 오류를 남기고 undefined(다시 불러오지 않는다).
    runWrite: async (fn) => {
      try {
        return await fn();
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
        return undefined;
      }
    },
    setDirty: () => {},
    canDo: () => true,
    busy: false,
  };
}

async function render(view: RuleEditView) {
  await act(async () => {
    root!.render(
      createElement(DmesUiProvider, null, createElement(RuleWorkbenchProvider, null, createElement(DecisionTableCard, propsOf(view)), createElement(Probe))),
    );
  });
  await flush();
}

function result(over: Partial<ValueTestResult> = {}): ValueTestResult {
  return {
    target: "BODY",
    ver: 2,
    evalTs: "2026-09-26 10:00:00",
    outcome: "OK",
    results: { QLTY_GRD: "A" },
    hits: [{ rowId: 1, seq: 1, groupChoices: {} }],
    defaultApplied: false,
    trace: [{ rowId: 1, seq: 1, evaluated: true, hit: true, firstFalseVarId: null }],
    ...over,
  };
}

function runOf(over: Partial<TestRunView> = {}): TestRunView {
  return { ruleId: "QLTY_GRD_JDG", target: "BODY", ver: 2, rowVersion: 3, rev: wb.tableDraft!.rev, result: result(), ...over };
}

async function click(label: string) {
  await act(async () => {
    findButton(container, label).click();
  });
  await flush();
}

describe("DecisionTableCard × 카드 공유 상태", () => {
  beforeEach(() => {
    installDomStorage();
    errors = [];
    saveResponse = { meta: { success: true }, data: { result: { part: "TABLE", rowVersion: 4, rowIdMap: {}, issues: [], rows: [] } } };
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/oasis/ruleEdit/save")) return jsonResponse(saveResponse);
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

  it("편집 중인 표를 저장 형태로 올리고, 편집하면 rev 가 오르고 dirty 가 켜진다", async () => {
    await render(draftView("e2e_mdm_steward"));
    const first = wb.tableDraft!;
    expect(first).toMatchObject({ ruleId: "QLTY_GRD_JDG", ver: 2, hitPolicy: "FIRST", dirty: false });
    expect(first.rows.map((r) => r.rowId)).toEqual([1, 2, 3, 4]);
    await click("행 추가");
    expect(wb.tableDraft!.dirty).toBe(true);
    expect(wb.tableDraft!.rev).toBe(first.rev + 1);
    expect(wb.tableDraft!.rows.map((r) => r.rowId)).toEqual([1, 2, 3, -1, 4]);
  });

  it("BODY 결과(같은 rev)는 표에 칠하고, 표를 고치면 지우고 다시 돌리라고 안내한다", async () => {
    await render(draftView("e2e_mdm_steward"));
    await act(async () => wb.setTestRun(runOf()));
    expect(container.querySelector('[data-testid="dt-test-shown"]')).not.toBeNull();
    await click("행 추가");
    expect(wb.testRun).toBeNull();
    expect(container.querySelector('[data-testid="dt-test-shown"]')).toBeNull();
    expect(visibleText(container)).toContain("표가 바뀌어 값 테스트 결과를 지웠습니다. 다시 돌리세요.");
  });

  it("VERSION 결과는 같은 버전·row_version 이고 변경이 없을 때만 칠하고, 표를 고쳐도 결과는 남는다", async () => {
    await render(draftView("e2e_mdm_steward"));
    await act(async () => wb.setTestRun(runOf({ target: "VERSION", rev: null })));
    expect(visibleText(container)).toContain("값 테스트 결과(버전 2)를 표에 칠했습니다");
    await click("행 추가");
    expect(container.querySelector('[data-testid="dt-test-shown"]')).toBeNull();
    expect(container.querySelector('[data-testid="dt-test-stale"]')).toBeNull();
    expect(wb.testRun?.target).toBe("VERSION");
    await act(async () => wb.setTestRun(runOf({ target: "VERSION", ver: 1, rev: null })));
    await click("되돌리기");
    expect(container.querySelector('[data-testid="dt-test-shown"]')).toBeNull();
  });

  it("view 를 다시 불러와도 표 정의가 같으면 편집을 지우지 않고, row_version 이 바뀌면 새로 불러온다", async () => {
    const view = draftView("e2e_mdm_steward");
    await render(view);
    await click("행 추가");
    await render({ ...view, testCases: [{ caseId: 1, caseName: "새 케이스", inputJson: "{}", rowVersion: 0 }] });
    expect(visibleText(container)).toContain("저장 안 한 변경");
    expect(wb.tableDraft!.rows.map((r) => r.rowId)).toEqual([1, 2, 3, -1, 4]);
    await render({ ...view, versions: view.versions.map((v) => (v.ver === 2 ? { ...v, rowVersion: 4 } : v)) });
    expect(visibleText(container)).not.toContain("저장 안 한 변경");
    expect(wb.tableDraft!.rows.map((r) => r.rowId)).toEqual([1, 2, 3, 4]);
  });

  it("저장이 거부되면 거부 메시지를 표 아래에 보이고 편집 상태를 그대로 둔다. 다시 고치면 메시지가 사라진다", async () => {
    saveResponse = { meta: { success: false, code: "MDM021", message: "룰 저장 거부: OVERLAP[행 1·행 2] 두 행이 겹친다" } };
    await render(draftView("e2e_mdm_steward"));
    await click("행 추가");
    await click("표 저장");
    const msg = container.querySelector('[data-testid="dt-save-rejected"]');
    expect(msg?.textContent).toContain("룰 저장 거부: OVERLAP");
    expect(errors).toHaveLength(1);
    expect(visibleText(container)).toContain("저장 안 한 변경");
    expect(wb.tableDraft!.dirty).toBe(true);
    await click("되돌리기");
    expect(container.querySelector('[data-testid="dt-save-rejected"]')).toBeNull();
  });

  it("row_version 충돌은 저장 거부 메시지로 남기지 않는다(다시 불러오기 안내는 useRuleEdit 몫)", async () => {
    saveResponse = { meta: { success: false, code: "MDM001", message: "다른 사용자가 수정했습니다" } };
    await render(draftView("e2e_mdm_steward"));
    await click("행 추가");
    await click("표 저장");
    expect(container.querySelector('[data-testid="dt-save-rejected"]')).toBeNull();
    expect(errors).toHaveLength(1);
  });

  it("서버 저장 검사 이슈가 더 있어도 화면·서버 검사 일치이고, 그 이슈는 '서버 저장 검사' 로 따로 보인다", async () => {
    saveResponse = {
      meta: { success: true },
      data: {
        result: {
          part: "TABLE",
          rowVersion: 4,
          rowIdMap: { "-1": 5 },
          issues: [
            { code: "ALL_NA_ROW", severity: "ERROR", rowIds: [5], message: "x" },
            { code: "NULL_GAP", severity: "WARNING", rowIds: [], varId: 1, message: "y" },
            { code: "NULL_GAP", severity: "WARNING", rowIds: [], varId: 3, message: "z" },
            { code: "CODE_VALUE_MISSING", severity: "WARNING", rowIds: [2], varId: 3, message: "행 2·표면등급: 코드 값 B 가 없다" },
          ],
          rows: [],
        },
      },
    };
    await render(draftView("e2e_mdm_steward"));
    await click("행 추가");
    await click("표 저장");
    expect(visibleText(container)).toContain("화면·서버 검사 일치");
    const server = container.querySelector('[data-testid="dt-server-checks"]');
    expect(server?.textContent).toContain("서버 저장 검사");
    expect(server?.textContent).toContain("CODE_VALUE_MISSING");
    expect(server?.textContent).not.toContain("NULL_GAP");
  });
});
