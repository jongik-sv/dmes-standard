/** @vitest-environment happy-dom */

// 노드 찾기 위젯(2026-10-01, VS Code·Monaco 찾기 위젯 방식) — 캔버스 오른쪽 위 위젯을 Ctrl/Cmd+F·툴바 [노드 찾기] 로 열고,
// Enter·Shift+Enter 로 돌고, 옵션 셋(Aa·ab·.*)·잘못된 정규식·Esc/[닫기] 로 닫고 캔버스로 초점 복귀·다시 열면 글자와 옵션이 남는다.
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ expandFor: vi.fn() }));

// 접기 본문은 다른 테스트 몫이다 — 찾기가 펴기를 부르는지만 본다.
vi.mock("../../../pages/dme/ruleSetEdit/state/useCollapse", () => {
  const none = new Set<string>();
  return { useCollapse: () => ({ collapsed: none, toggle: () => {}, expandFor: mocks.expandFor }) };
});

import { SHORTCUT_HELP } from "../../../pages/dme/ruleSetEdit/canvas/shortcuts";
import type { RuleIo, RuleSetView } from "../../../pages/dme/ruleSetEdit/types";
import { flush, typeInto, visibleText } from "../helpers/render";
import { byTestId, click, installServer, openSet, q, settle, uninstallServer } from "../helpers/rule-set-page";

const ioName = (n: string) => ({ name: n, source: "DICT" as const, label: null, dataType: null, scale: null, dateString: false, maruCodeId: null });
const rule = (ruleId: string, cond: string, result: string, name: string): RuleIo => ({
  ruleId, ruleName: name, ruleKind: "DECISION", status: "INUSE", exists: true, releasedVer: 1, hitPolicy: "FIRST",
  conds: [ioName(cond)], results: [{ ...ioName(result), source: null }],
});
// r1 E2S_GRD(등급 판정) → r2 E2S_FCT(Factor 계산) → r3 E2S_GRD2(등급 재판정)
const RULES = [rule("E2S_GRD", "SET_THK", "S_GRD", "등급 판정"), rule("E2S_FCT", "S_GRD", "S_FCT", "Factor 계산"), rule("E2S_GRD2", "S_FCT", "S_GRD2", "등급 재판정")];
function view(setId = "FW_SET"): RuleSetView {
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
const input = () => byTestId<HTMLInputElement>("flow-find");
const count = () => byTestId("flow-find-count").textContent;
const selected = (id: string) => byTestId(`flow-node-${id}`).getAttribute("data-selected") === "true";
const host = () => canvas().closest(".rsf-canvas-host")!;
async function focusCanvas() {
  await act(async () => {
    canvas().focus();
  });
}
async function openByShortcut() {
  await focusCanvas();
  return key(canvas(), { key: "f", ctrlKey: true });
}

describe("노드 찾기 위젯", () => {
  beforeEach(() => {
    installServer();
    localStorage.clear();
    mocks.expandFor.mockClear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    uninstallServer();
  });

  it("툴바에는 찾기 칸이 없고 [노드 찾기] 단추만 있다 — 툴팁은 플랫폼 단축키, 누르면 위젯이 열리고 입력 칸에 초점", async () => {
    await openSet("FW_SET", view());
    expect(q("flow-find-widget")).toBeNull();
    expect(q("flow-find")).toBeNull();
    const open = byTestId("flow-find-open");
    expect(byTestId("flow-toolbar").contains(open)).toBe(true);
    expect(open.getAttribute("aria-label")).toBe("노드 찾기");
    expect(open.parentElement!.getAttribute("data-tip")).toBe("노드 찾기 (Ctrl+F)");
    expect(open.getAttribute("aria-expanded")).toBe("false");
    await click("flow-find-open");
    const widget = byTestId("flow-find-widget");
    expect(host().contains(widget)).toBe(true); // 캔버스 감싸개 안(오른쪽 위에 뜬다)
    expect(byTestId("flow-toolbar").contains(widget)).toBe(false);
    expect(document.activeElement).toBe(input());
    expect(open.getAttribute("aria-expanded")).toBe("true");
    expect(host().hasAttribute("data-find-open")).toBe(true); // 미니맵을 위젯 아래로 내리는 표시
    for (const id of ["flow-find-case", "flow-find-word", "flow-find-regex", "flow-find-count", "flow-find-prev", "flow-find-next", "flow-find-close"])
      expect(widget.contains(byTestId(id)), id).toBe(true);
    expect(count()).toBe(""); // 글자가 비면 건수를 비운다
  });

  it("Mac 이면 툴팁이 ⌘F 이고 Cmd+F 로 연다", async () => {
    vi.spyOn(window.navigator, "platform", "get").mockReturnValue("MacIntel");
    await openSet("FW_SET", view());
    expect(byTestId("flow-find-open").parentElement!.getAttribute("data-tip")).toBe("노드 찾기 (⌘F)");
    await focusCanvas();
    const ev = await key(canvas(), { key: "f", metaKey: true });
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(input());
  });

  it("Ctrl+F — 위젯을 열고 입력 칸에 초점(브라우저 찾기는 막는다). 글이 있으면 전체 선택하고, 위젯 안에서 다시 눌러도 전체 선택한다", async () => {
    await openSet("FW_SET", view());
    const ev = await openByShortcut();
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(input());
    await typeInto(input(), "등급");
    // 커서를 끝으로 옮긴 뒤 위젯 안에서 Ctrl+F
    input().setSelectionRange(2, 2);
    const again = await key(input(), { key: "f", ctrlKey: true });
    expect(again.defaultPrevented).toBe(true);
    expect([input().selectionStart, input().selectionEnd]).toEqual([0, 2]);
    // 위젯 단추에 초점이 있어도 같다
    const next = byTestId("flow-find-next");
    await act(async () => {
      next.focus();
    });
    const onButton = await key(next, { key: "f", ctrlKey: true });
    expect(onButton.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(input());
    // 캔버스로 돌아가 Ctrl+F — 열린 위젯의 글을 다시 전체 선택한다
    await focusCanvas();
    input().setSelectionRange(1, 1);
    await key(canvas(), { key: "f", ctrlKey: true });
    expect(document.activeElement).toBe(input());
    expect([input().selectionStart, input().selectionEnd]).toEqual([0, 2]);
  });

  it("Enter 는 다음, Shift+Enter 는 이전 결과 — 노드를 고르고 옮긴다. 끝에서 처음·처음에서 끝으로 돈다. 첫 Shift+Enter 는 마지막 결과로", async () => {
    await openSet("FW_SET", view());
    await openByShortcut();
    await typeInto(input(), "등급");
    expect(count()).toBe("1/2");
    expect(mocks.expandFor).not.toHaveBeenCalled(); // 글자만 쳐서는 옮기지 않는다
    const sh = await key(input(), { key: "Enter", shiftKey: true });
    expect(sh.defaultPrevented).toBe(true);
    expect(count()).toBe("2/2");
    expect(mocks.expandFor).toHaveBeenLastCalledWith("r3");
    expect(selected("r3")).toBe(true);
    await key(input(), { key: "Enter" });
    expect(count()).toBe("1/2"); // 끝에서 처음으로
    expect(mocks.expandFor).toHaveBeenLastCalledWith("r1");
    expect(selected("r1")).toBe(true);
    await key(input(), { key: "Enter", shiftKey: true });
    expect(count()).toBe("2/2"); // 처음에서 끝으로
    await click("flow-find-prev");
    expect(count()).toBe("1/2");
    await click("flow-find-next");
    expect(count()).toBe("2/2");
    expect(document.activeElement).toBe(input()); // 단추를 눌러도 초점은 입력 칸
  });

  it("한글 조합 중(isComposing) Enter·Shift+Enter 는 무시한다", async () => {
    await openSet("FW_SET", view());
    await openByShortcut();
    await typeInto(input(), "등급");
    const a = await key(input(), { key: "Enter", isComposing: true });
    const b = await key(input(), { key: "Enter", shiftKey: true, isComposing: true });
    expect(a.defaultPrevented).toBe(false);
    expect(b.defaultPrevented).toBe(false);
    expect(mocks.expandFor).not.toHaveBeenCalled();
  });

  it("옵션 셋 — aria-pressed 로 켜고 끄며 일치 판정에 반영한다. 옵션을 바꾸면 순번만 처음으로 돌리고 옮기지 않는다", async () => {
    await openSet("FW_SET", view());
    await openByShortcut();
    await typeInto(input(), "grd");
    expect(count()).toBe("1/2");
    await key(input(), { key: "Enter" });
    await key(input(), { key: "Enter" });
    expect(count()).toBe("2/2");
    mocks.expandFor.mockClear();

    const caseBtn = byTestId("flow-find-case");
    expect(caseBtn.getAttribute("aria-pressed")).toBe("false");
    await click("flow-find-case");
    expect(caseBtn.getAttribute("aria-pressed")).toBe("true");
    expect(count()).toBe("결과 없음");
    await typeInto(input(), "GRD");
    expect(count()).toBe("1/2");
    await click("flow-find-case");
    expect(caseBtn.getAttribute("aria-pressed")).toBe("false");

    // 단어 단위 — 「판정」 은 r1(등급 판정)만 단어, r3(등급 재판정)은 붙어 있다
    await typeInto(input(), "판정");
    expect(count()).toBe("1/2");
    await click("flow-find-word");
    expect(byTestId("flow-find-word").getAttribute("aria-pressed")).toBe("true");
    expect(count()).toBe("1/1");
    await click("flow-find-word");

    // 정규식
    await typeInto(input(), "^E2S_GRD\\d$");
    expect(count()).toBe("결과 없음");
    await click("flow-find-regex");
    expect(byTestId("flow-find-regex").getAttribute("aria-pressed")).toBe("true");
    expect(count()).toBe("1/1");
    expect(mocks.expandFor).not.toHaveBeenCalled(); // 옵션·글자를 바꿔도 옮기지 않는다
    await key(input(), { key: "Enter" });
    expect(mocks.expandFor).toHaveBeenLastCalledWith("r3");
  });

  it("잘못된 정규식 — 입력 칸에 오류 테두리(form-error)·aria-invalid, 결과 0건, 예외 없음. 고치면 풀린다", async () => {
    await openSet("FW_SET", view());
    await openByShortcut();
    await click("flow-find-regex");
    await typeInto(input(), "E2S_(GRD");
    expect(input().classList.contains("form-error")).toBe(true);
    expect(input().getAttribute("aria-invalid")).toBe("true");
    expect(count()).toBe("결과 없음");
    expect(byTestId<HTMLButtonElement>("flow-find-next").disabled).toBe(true);
    expect(byTestId<HTMLButtonElement>("flow-find-prev").disabled).toBe(true);
    const ev = await key(input(), { key: "Enter" });
    expect(ev.defaultPrevented).toBe(true);
    expect(mocks.expandFor).not.toHaveBeenCalled();
    await typeInto(input(), "E2S_(GRD)");
    expect(input().classList.contains("form-error")).toBe(false);
    expect(input().getAttribute("aria-invalid")).toBe("false");
    expect(count()).toBe("1/2");
    // 정규식을 끄면 같은 글자도 잘못이 아니다(글자 그대로 찾는다)
    await typeInto(input(), "(");
    expect(input().classList.contains("form-error")).toBe(true);
    await click("flow-find-regex");
    expect(input().classList.contains("form-error")).toBe(false);
    expect(count()).toBe("결과 없음");
  });

  it("Esc — 위젯을 닫고 초점을 캔버스로 돌린다. 다시 열면 글자·옵션이 그대로다", async () => {
    await openSet("FW_SET", view());
    await openByShortcut();
    await typeInto(input(), "등급");
    await click("flow-find-word");
    await key(input(), { key: "Enter" });
    expect(selected("r1")).toBe(true);
    const esc = await key(input(), { key: "Escape" });
    expect(esc.defaultPrevented).toBe(true);
    expect(q("flow-find-widget")).toBeNull();
    expect(document.activeElement).toBe(canvas());
    expect(host().hasAttribute("data-find-open")).toBe(false);
    expect(selected("r1")).toBe(true); // 위젯만 닫고 선택은 그대로
    await key(canvas(), { key: "f", ctrlKey: true });
    expect(input().value).toBe("등급");
    expect([input().selectionStart, input().selectionEnd]).toEqual([0, 2]);
    expect(byTestId("flow-find-word").getAttribute("aria-pressed")).toBe("true");
    expect(count()).toBe("1/2");
  });

  it("[닫기] — 위젯을 닫고 초점을 캔버스로 돌린다", async () => {
    await openSet("FW_SET", view());
    await click("flow-find-open");
    await click("flow-find-close");
    expect(q("flow-find-widget")).toBeNull();
    expect(document.activeElement).toBe(canvas());
    expect(byTestId("flow-find-open").getAttribute("aria-expanded")).toBe("false");
  });

  it("위젯이 열려 있어도 캔버스의 Esc 는 예전처럼 선택 해제다(위젯은 그대로)", async () => {
    await openSet("FW_SET", view());
    await openByShortcut();
    await typeInto(input(), "등급");
    await key(input(), { key: "Enter" });
    expect(selected("r1")).toBe(true);
    await focusCanvas();
    await key(canvas(), { key: "Escape" });
    expect(q("flow-find-widget")).not.toBeNull();
    expect(selected("r1")).toBe(false);
  });

  it("위젯 단추에 초점이 있을 때의 키는 캔버스 단축키로 가지 않는다(Delete 가 고른 노드를 지우지 않는다)", async () => {
    await openSet("FW_SET", view());
    await click("flow-mode-edit");
    await openByShortcut();
    await typeInto(input(), "E2S_FCT");
    await key(input(), { key: "Enter" });
    expect(selected("r2")).toBe(true);
    const close = byTestId("flow-find-close");
    await act(async () => {
      close.focus();
    });
    const del = await key(close, { key: "Delete" });
    expect(del.defaultPrevented).toBe(false);
    expect(q("flow-node-r2")).not.toBeNull();
  });

  it("디버그 모드에서도 단축키로 열고 찾는다", async () => {
    await openSet("FW_SET", view());
    await click("flow-mode-debug");
    const ev = await openByShortcut();
    expect(ev.defaultPrevented).toBe(true);
    await typeInto(input(), "E2S_FCT");
    await key(input(), { key: "Enter" });
    await settle(20);
    expect(mocks.expandFor).toHaveBeenLastCalledWith("r2");
  });

  it("단축키 도움말 — Ctrl+F 는 위젯 열기, 위젯 안 Enter·Shift+Enter·Esc 가 보인다", async () => {
    expect(SHORTCUT_HELP.find((h) => h.id === "findNext")).toMatchObject({ win: "Enter · Shift+Enter" });
    expect(SHORTCUT_HELP.find((h) => h.id === "findClose")?.label).toContain("찾기 위젯 닫기");
    await openSet("FW_SET", view());
    await click("flow-help");
    const text = visibleText(byTestId("flow-help-panel"));
    expect(text).toContain("찾기 위젯을 연다");
    expect(text).toContain("Shift+Enter");
    expect(text).toContain("찾기 위젯 닫기");
  });
});
