/** @vitest-environment happy-dom */

// 룰 세트 편집 자동 저장 — 화면 테스트. 툴바 [자동 저장] 단추의 표시 조건(편집 모드만), 보는 사람 설정 기억, 상태 글(시각·경고 건수·title),
// 자동 저장 중 수동 쓰기 단추 막기.
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

import { storeKeys } from "../../../pages/dme/ruleSetEdit/debugger/local-store";
import type { RuleIo, RuleSetView } from "../../../pages/dme/ruleSetEdit/types";
import { typeInto, visibleText } from "../helpers/render";
import { byTestId, calls, click, clickFake, installServer, ok, openSet, q, srv, uninstallServer, unmountPage } from "../helpers/rule-set-page";

const ioName = (n: string) => ({ name: n, source: "DICT" as const, label: null, dataType: null, scale: null, dateString: false, maruCodeId: null });
const rule = (ruleId: string, cond: string, result: string): RuleIo => ({
  ruleId, ruleName: `${ruleId} 이름`, ruleKind: "DECISION", status: "INUSE", exists: true, releasedVer: 1, hitPolicy: "FIRST",
  conds: [ioName(cond)], results: [{ ...ioName(result), source: null }],
});

function chainView(): RuleSetView {
  return {
    set: { setId: "E2S_CHAIN", setName: "사슬", description: null, status: "INUSE", rowVersion: 3, ruleIds: ["E2S_GRD", "E2S_FCT"], flow: null, branched: false },
    rules: [rule("E2S_GRD", "SET_THK", "S_GRD"), rule("E2S_FCT", "S_GRD", "S_FCT")],
    checks: [],
    condIo: {},
    editable: true,
    restorable: false,
    cases: [],
  };
}

const toggle = () => byTestId<HTMLButtonElement>("set-autosave");
const status = () => q<HTMLElement>("set-autosave-status");
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("자동 저장 단추·상태 글", () => {
  beforeEach(() => {
    installServer();
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    uninstallServer();
  });

  it("1. 보기·디버그 모드에서는 보이지 않고 편집 모드에서만 보이며 기본은 꺼짐이다", async () => {
    await openSet("E2S_CHAIN", chainView());
    expect(q("set-autosave")).toBeNull();
    await click("flow-mode-debug");
    expect(q("set-autosave")).toBeNull();
    await click("flow-mode-edit");
    expect(toggle().getAttribute("aria-pressed")).toBe("false");
    expect(toggle().getAttribute("aria-label")).toBe("자동 저장");
    expect(status()).toBeNull();
  });

  it("2. 편집 권한이 없는 세트(담당자 아님)에서는 편집 모드가 없어 단추도 없다", async () => {
    await openSet("E2S_CHAIN", { ...chainView(), editable: false });
    await click("flow-mode-edit");
    expect(q("set-autosave")).toBeNull();
  });

  it("3. 켜고 끈 값을 보는 사람 설정으로 기억한다", async () => {
    await openSet("E2S_CHAIN", chainView());
    await click("flow-mode-edit");
    await click("set-autosave");
    expect(toggle().getAttribute("aria-pressed")).toBe("true");
    expect(localStorage.getItem(storeKeys.autoSave)).toBe("true");

    unmountPage();
    await openSet("E2S_CHAIN", chainView());
    await click("flow-mode-edit");
    expect(toggle().getAttribute("aria-pressed")).toBe("true");
    await click("set-autosave");
    expect(localStorage.getItem(storeKeys.autoSave)).toBe("false");
  });

  it("4. 켜 두면 세트명을 고친 2초 뒤 저장하고, 서버를 다시 부르지 않고 시각·경고 건수를 상태 글에 보인다", async () => {
    srv.replies.save = ok({
      setId: "E2S_CHAIN",
      rowVersion: 4,
      checks: [{ code: "DUP_RESULT", severity: "WARN", ruleId: "E2S_FCT", otherRuleId: null, varName: "S_GRD", message: "경고 문장", nodeId: null, edgeId: null }],
    });
    await openSet("E2S_CHAIN", chainView());
    await click("flow-mode-edit");
    await click("set-autosave");
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 1, 9, 5, 7));
    await typeInto(byTestId<HTMLInputElement>("set-name"), "사슬(자동)");
    await advance(1999);
    expect(calls("save")).toHaveLength(0);
    await advance(1);
    expect(calls("save")).toHaveLength(1);
    expect(calls("save")[0].body.params).toMatchObject({ setId: "E2S_CHAIN", setName: "사슬(자동)", rowVersion: 3 });
    await advance(50);
    expect(calls("view")).toHaveLength(1);
    expect(visibleText(byTestId("set-row-version"))).toBe("row_version 4");
    expect(visibleText(status()!)).toBe("자동 저장됨 09:05:09 · 경고 1건");
    expect(status()!.getAttribute("title")).toBe("경고 문장");
    expect(q("set-message")).toBeNull();
    expect(byTestId<HTMLButtonElement>("set-save").disabled).toBe(true);
    expect(byTestId<HTMLInputElement>("set-name").value).toBe("사슬(자동)");
  });

  it("5. 자동 저장이 진행 중이면 상태 글이 '저장 중' 이고 [세트 저장]·[폐기] 를 누를 수 없다", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    srv.replies.save = ok({ setId: "E2S_CHAIN", rowVersion: 4, checks: [] });
    await openSet("E2S_CHAIN", chainView());
    await click("flow-mode-edit");
    await click("set-autosave");
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/ruleSetEdit/save")) await gate;
      return realFetch(input, init);
    }) as typeof fetch;
    vi.useFakeTimers();
    await typeInto(byTestId<HTMLInputElement>("set-name"), "사슬(자동)");
    await advance(2000);
    expect(visibleText(status()!)).toBe("저장 중");
    await typeInto(byTestId<HTMLInputElement>("set-name"), "사슬(자동2)");
    expect(byTestId<HTMLButtonElement>("set-save").disabled).toBe(true);
    expect(byTestId<HTMLButtonElement>("set-deprecate").disabled).toBe(true);
    // 저장 중에도 편집은 막지 않는다.
    expect(byTestId<HTMLInputElement>("set-name").disabled).toBe(false);
    release();
    await advance(50);
    expect(calls("save")).toHaveLength(1);
    expect(byTestId<HTMLInputElement>("set-name").value).toBe("사슬(자동2)");
    expect(byTestId<HTMLButtonElement>("set-save").disabled).toBe(false);
    await advance(2000);
    await advance(50);
    expect(calls("save")).toHaveLength(2);
    expect(calls("save")[1].body.params).toMatchObject({ setName: "사슬(자동2)", rowVersion: 4 });
    globalThis.fetch = realFetch;
  });

  it("6. 자동 저장이 꺼져 있으면 저장하지 않고, 수동 [세트 저장] 은 지금처럼 동작한다", async () => {
    srv.replies.save = ok({ setId: "E2S_CHAIN", rowVersion: 4, checks: [] });
    await openSet("E2S_CHAIN", chainView());
    await click("flow-mode-edit");
    await typeInto(byTestId<HTMLInputElement>("set-name"), "사슬(수동)");
    vi.useFakeTimers();
    await advance(5000);
    expect(calls("save")).toHaveLength(0);
    srv.views.E2S_CHAIN = { ...chainView(), set: { ...chainView().set, setName: "사슬(수동)", rowVersion: 4 } };
    await clickFake("set-save");
    await advance(50);
    expect(calls("save")).toHaveLength(1);
    expect(calls("view")).toHaveLength(2);
    expect(visibleText(byTestId("set-message"))).toContain("저장 · row_version 4");
  });
});
