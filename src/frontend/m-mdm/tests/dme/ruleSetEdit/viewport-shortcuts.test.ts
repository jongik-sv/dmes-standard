/** @vitest-environment happy-dom */
// 화면 길잡이 단축키(D-153) — page 의 캔버스 키 처리에 Shift+1 화면 맞춤·Shift+2 고른 것으로 이동이 세 모드 모두 이어졌는지,
// 고른 것이 없으면 키를 쓰지 않는지, 입력 칸(찾기 위젯)에서는 받지 않는지, 툴바 툴팁·도움말 표에 적혔는지 본다.
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RuleIo, RuleSetView } from "../../../pages/dme/ruleSetEdit/types";
import { flush } from "../helpers/render";
import { byTestId, click, installServer, openSet, uninstallServer } from "../helpers/rule-set-page";

const ioName = (n: string) => ({ name: n, source: "DICT" as const, label: null, dataType: null, scale: null, dateString: false, maruCodeId: null });
const rule = (ruleId: string, cond: string, result: string, name: string): RuleIo => ({
  ruleId, ruleName: name, ruleKind: "DECISION", status: "INUSE", exists: true, releasedVer: "1.000", hitPolicy: "FIRST",
  conds: [ioName(cond)], results: [{ ...ioName(result), source: null }],
});
const RULES = [rule("VP_A", "SET_THK", "S_GRD", "등급 판정"), rule("VP_B", "S_GRD", "S_FCT", "Factor 계산")];
function view(setId = "VP_SET"): RuleSetView {
  return {
    set: { setId, setName: "이름", description: null, status: "INUSE", rowVersion: 3, ruleIds: RULES.map((r) => r.ruleId), flow: null, branched: false },
    rules: RULES, checks: [], condIo: {}, editable: true, restorable: false, cases: [],
  };
}

async function key(el: Element, init: KeyboardEventInit): Promise<KeyboardEvent> {
  const ev = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  await act(async () => {
    el.dispatchEvent(ev);
  });
  await flush();
  return ev;
}
const canvas = () => byTestId("flow-canvas");
const shift1 = () => key(canvas(), { key: "!", code: "Digit1", shiftKey: true });
const shift2 = () => key(canvas(), { key: "@", code: "Digit2", shiftKey: true });

describe("화면 길잡이 단축키", () => {
  beforeEach(() => {
    installServer();
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    uninstallServer();
  });

  it("Shift+1 은 보기·편집·디버그 모드 모두에서 키를 쓴다(화면 맞춤)", async () => {
    await openSet("VP_SET", view());
    for (const mode of ["view", "edit", "debug"] as const) {
      await click(`flow-mode-${mode}`);
      expect((await shift1()).defaultPrevented).toBe(true);
    }
  });

  it("Shift+2 는 고른 것이 없으면 키를 쓰지 않고, 노드를 고르면 쓴다", async () => {
    await openSet("VP_SET", view());
    await click("flow-mode-edit");
    expect((await shift2()).defaultPrevented).toBe(false);
    await click("flow-node-r1");
    expect((await shift2()).defaultPrevented).toBe(true);
    await click("flow-mode-view");
    expect((await shift2()).defaultPrevented).toBe(true); // 보기 모드에서도 고른 것으로 이동
  });

  it("찾기 위젯 입력 칸에서 Shift+1 은 글자 입력이다", async () => {
    await openSet("VP_SET", view());
    await click("flow-find-open");
    const input = byTestId<HTMLInputElement>("flow-find");
    expect((await key(input, { key: "!", code: "Digit1", shiftKey: true })).defaultPrevented).toBe(false);
  });

  it("툴바 [화면 맞춤] 툴팁과 도움말 표에 단축키가 있다", async () => {
    await openSet("VP_SET", view());
    expect(byTestId("flow-fit").parentElement!.getAttribute("data-tip")).toBe("화면 맞춤 (Shift+1)");
    await click("flow-help");
    const help = byTestId("flow-help-panel").textContent ?? "";
    expect(help).toContain("Shift+1");
    expect(help).toContain("고른 것으로 이동");
  });
});
