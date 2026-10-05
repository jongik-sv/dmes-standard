/** @vitest-environment happy-dom */
// 세트 탭 — body 로 포털하는 대화 상자(테스트 케이스 편집 창)는 탭이 숨으면 새 탭 위에 남지 않고, 탭을 다시 고르면 작성 중이던 칸 그대로 이어진다.
// 오류 창(ErrorModal)의 같은 처리는 set-tabs.test.ts 의 「숨은 탭의 오류」가 본다.
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

import type { RuleIo, RuleSetView } from "../../../pages/dme/ruleSetEdit/types";
import { flush, typeInto } from "../helpers/render";
import { golden } from "../helpers/rule-set-golden";
import { byTestId, click, handoff, inDoc, installServer, ok, openSet, settle, srv, uninstallServer } from "../helpers/rule-set-page";
import { activateTab, activeKey, tabKeys } from "./set-tabs-helpers";

const ioName = (n: string, source: "DICT" | "NONE", dataType: string | null = null) => ({ name: n, source, label: null, dataType, scale: null, dateString: false, maruCodeId: null });
const rule = (ruleId: string, cond: [string, "DICT" | "NONE", string?], result: string): RuleIo => ({
  ruleId, ruleName: `${ruleId} 이름`, ruleKind: "DECISION", status: "INUSE", exists: true, releasedVer: "1.000", hitPolicy: "FIRST",
  conds: [ioName(cond[0], cond[1], cond[2] ?? null)], results: [{ ...ioName(result, "NONE", "STRING"), source: null }],
});
const RULES: RuleIo[] = [rule("GT_GRADE", ["GT_THK", "DICT", "NUMBER"], "GT_G"), rule("GT_FAST", ["GT_G", "NONE"], "GT_F"), rule("GT_SLOW", ["GT_G", "NONE"], "GT_S")];
const COND_IO = { e3: { ok: true, message: null, vars: [ioName("GT_G", "NONE")] } };
const FIRST = golden("IF_FIRST_TRUE");

function viewOf(setId: string): RuleSetView {
  return {
    set: { setId, setName: `${setId} 세트`, description: null, status: "INUSE", rowVersion: 1, ruleIds: ["GT_GRADE", "GT_FAST", "GT_SLOW"], flow: FIRST.flow, branched: true },
    rules: RULES,
    checks: [],
    condIo: COND_IO,
    editable: true,
    restorable: false,
    cases: [],
  };
}

const modalIn = () => document.querySelector('[data-testid="case-modal"]');

describe("세트 탭 — 포털 대화 상자", () => {
  beforeEach(() => {
    installServer();
    localStorage.clear();
  });
  afterEach(() => uninstallServer());

  it("테스트 케이스 편집 창은 탭이 숨으면 사라지고, 탭을 다시 고르면 쓰던 칸 그대로 다시 뜬다", async () => {
    srv.replies.execute = ok(FIRST.response);
    srv.replies.validate = ok({ condIo: COND_IO });
    await openSet("S1", viewOf("S1"), { tabId: "T1" });
    await click("flow-mode-debug");
    await typeInto(byTestId<HTMLInputElement>("dbg-input-GT_THK"), "12");
    await click("dbg-step");
    await settle(50);
    await click("case-save-current");
    expect(modalIn()).not.toBeNull();
    await typeInto(inDoc<HTMLInputElement>("case-modal-name"), "작성 중인 이름");

    // 포털이 다른 세트를 넘겨 새 탭이 열린다 — S1 탭이 숨고 그 탭의 창은 새 탭 위에 남지 않는다
    srv.views.S2 = viewOf("S2");
    handoff("S2");
    await activateTab("T1");
    expect(tabKeys()).toHaveLength(2);
    expect(activeKey()).not.toBe("t1");
    expect(modalIn()).toBeNull();

    // S1 탭을 다시 고르면 창이 다시 뜨고 쓰던 칸이 그대로다
    await click("set-tab-t1");
    await flush();
    expect(modalIn()).not.toBeNull();
    expect(inDoc<HTMLInputElement>("case-modal-name").value).toBe("작성 중인 이름");

    // 닫으면(취소) 창이 없어진다 — 숨은 상태에서 열린 채 남는 일이 없다
    await act(async () => {
      inDoc("case-modal-cancel").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
    expect(modalIn()).toBeNull();
  });
});
