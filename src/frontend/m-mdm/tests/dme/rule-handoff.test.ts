/** @vitest-environment happy-dom */

// TSK-08-02 design §6.9·I28 — 룰 조회 → 룰 화면 이동(handoff). sessionStorage 에 대상을 쓰고 두 이벤트를 순서대로 보낸다.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  RULE_EDIT_PAGE_ID,
  RULE_EDIT_TARGET_EVENT,
  RULE_EDIT_TARGET_KEY,
  openRuleEdit,
  takeRuleEditTarget,
} from "../../src/dme/rule-handoff";

describe("rule-handoff", () => {
  const events: Array<{ type: string; detail: unknown }> = [];
  const listener = (e: Event) => events.push({ type: e.type, detail: (e as CustomEvent).detail });

  beforeEach(() => {
    events.length = 0;
    window.sessionStorage.clear();
    window.addEventListener(RULE_EDIT_TARGET_EVENT, listener);
    window.addEventListener("portal-open-tab", listener);
  });

  afterEach(() => {
    window.removeEventListener(RULE_EDIT_TARGET_EVENT, listener);
    window.removeEventListener("portal-open-tab", listener);
  });

  it("상수는 설계 값 그대로다", () => {
    expect(RULE_EDIT_TARGET_KEY).toBe("mdm.dme.ruleEdit.target");
    expect(RULE_EDIT_TARGET_EVENT).toBe("mdm-rule-edit-target");
    expect(RULE_EDIT_PAGE_ID).toBe("mdm:dme/ruleEdit");
  });

  it("openRuleEdit 은 sessionStorage 에 대상을 쓴다", () => {
    openRuleEdit("QLTY_GRD_JDG", 2);
    const stored = JSON.parse(window.sessionStorage.getItem(RULE_EDIT_TARGET_KEY) ?? "null");
    expect(stored.ruleId).toBe("QLTY_GRD_JDG");
    expect(stored.ver).toBe(2);
    expect(typeof stored.at).toBe("number");
  });

  it("대상 이벤트를 먼저, 포털 탭 열기를 다음에 보낸다", () => {
    openRuleEdit("QLTY_GRD_JDG");
    expect(events.map((e) => e.type)).toEqual([RULE_EDIT_TARGET_EVENT, "portal-open-tab"]);
    expect((events[0].detail as { ruleId: string }).ruleId).toBe("QLTY_GRD_JDG");
    expect(events[1].detail).toEqual({ pageId: "mdm:dme/ruleEdit" });
  });

  it("takeRuleEditTarget 은 한 번 읽고 지운다", () => {
    openRuleEdit("E2E_NEW_JDG", 1);
    const first = takeRuleEditTarget();
    expect(first?.ruleId).toBe("E2E_NEW_JDG");
    expect(first?.ver).toBe(1);
    expect(window.sessionStorage.getItem(RULE_EDIT_TARGET_KEY)).toBeNull();
    expect(takeRuleEditTarget()).toBeNull();
  });

  it("ver 를 주지 않으면 ver 칸이 없다", () => {
    openRuleEdit("A_RULE");
    expect(takeRuleEditTarget()).toEqual(expect.not.objectContaining({ ver: expect.anything() }));
  });

  it("저장된 값이 깨져 있으면 null 이고 지운다", () => {
    window.sessionStorage.setItem(RULE_EDIT_TARGET_KEY, "{broken");
    expect(takeRuleEditTarget()).toBeNull();
    expect(window.sessionStorage.getItem(RULE_EDIT_TARGET_KEY)).toBeNull();
  });
});
