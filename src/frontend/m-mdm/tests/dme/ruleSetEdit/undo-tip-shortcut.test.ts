/** @vitest-environment happy-dom */

// Task 7 — 되돌리기·다시 하기 즉시 툴팁(data-tip)과 캔버스 밖 단축키(document keydown).
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

import { RSF_CSS } from "../../../pages/dme/ruleSetEdit/rsf-styles";
import { setPositions, toEditFlow, type EditFlow } from "../../../pages/dme/ruleSetEdit/flow-edit";
import type { RuleIo, RuleSetView } from "../../../pages/dme/ruleSetEdit/types";
import { flush, installDomStorage } from "../helpers/render";
import { byTestId, click, installServer, openSet, pageContainer, unmountPage, uninstallServer } from "../helpers/rule-set-page";

const ioName = (n: string) => ({ name: n, source: "DICT" as const, label: null, dataType: null, scale: null, dateString: false, maruCodeId: null });
const rule = (ruleId: string, cond: string, result: string): RuleIo => ({
  ruleId, ruleName: `${ruleId} 이름`, ruleKind: "DECISION", status: "INUSE", exists: true, releasedVer: "1.000", hitPolicy: "FIRST",
  conds: [ioName(cond)], results: [{ ...ioName(result), source: null }],
});
const RULES = [rule("UT_A", "IN_A", "OUT_A"), rule("UT_B", "OUT_A", "OUT_B")];
const flowOf = (): EditFlow => setPositions(toEditFlow(null, ["UT_A", "UT_B"]), { r1: { x: 0, y: 0 }, r2: { x: 300, y: 200 } });
function viewOf(setId: string): RuleSetView {
  return {
    set: { setId, setName: "이름", description: null, status: "INUSE", rowVersion: 1, ruleIds: ["UT_A", "UT_B"], flow: flowOf(), branched: false },
    rules: RULES, checks: [], condIo: {}, editable: true, restorable: false, cases: [],
  };
}
const canvas = () => byTestId("flow-canvas");
const noteCount = () => Array.from(pageContainer().querySelectorAll('[data-testid^="flow-note-"]')).filter((e) => !e.getAttribute("data-testid")!.startsWith("flow-note-text-")).length;
const undoDisabled = () => (byTestId("flow-undo") as HTMLButtonElement).disabled;
const redoDisabled = () => (byTestId("flow-redo") as HTMLButtonElement).disabled;
async function key(el: EventTarget, init: KeyboardEventInit): Promise<KeyboardEvent> {
  const ev = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  await act(async () => {
    el.dispatchEvent(ev);
  });
  await flush();
  return ev;
}
/** 편집 모드로 들어가 메모를 하나 더해 편집 하나를 만든다. */
async function editOnce() {
  await click("flow-mode-edit");
  const pane = canvas().querySelector(".react-flow__pane")!;
  await act(async () => {
    pane.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 120, clientY: 80 }));
  });
  await flush();
  await click("flow-menu-item-note-add");
  expect(noteCount()).toBe(1);
  await act(async () => (document.activeElement as HTMLElement | null)?.blur?.());
}

describe("툴바 — 되돌리기·다시 하기 즉시 툴팁", () => {
  beforeEach(() => {
    installDomStorage();
    installServer();
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    uninstallServer();
  });

  it("윈도우: data-tip 이 Ctrl 형식이고 title 은 없고 aria-label 은 있다(꺼진 상태에서도)", async () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("Win32");
    await openSet("UT_TIP", viewOf("UT_TIP"));
    for (const [id, tip, label] of [["flow-undo", "되돌리기 (Ctrl+Z)", "되돌리기"], ["flow-redo", "다시 하기 (Ctrl+Shift+Z)", "다시 하기"]] as const) {
      const b = byTestId<HTMLButtonElement>(id);
      expect(b.disabled).toBe(true); // 보기 모드 — 꺼짐
      const wrap = b.parentElement!; // 툴팁은 단추(overflow:hidden)가 아니라 감싼 span 이 그린다
      expect(wrap.classList.contains("rsf-tip")).toBe(true);
      expect(wrap.getAttribute("data-tip")).toBe(tip);
      expect(b.hasAttribute("data-tip")).toBe(false);
      expect(b.hasAttribute("title")).toBe(false);
      expect(b.getAttribute("aria-label")).toBe(label);
    }
  });

  it("맥: ⌘Z·⌘⇧Z", async () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    await openSet("UT_TIP2", viewOf("UT_TIP2"));
    expect(byTestId("flow-undo").parentElement!.getAttribute("data-tip")).toBe("되돌리기 (⌘Z)");
    expect(byTestId("flow-redo").parentElement!.getAttribute("data-tip")).toBe("다시 하기 (⌘⇧Z)");
  });

  it("도움말 [?] 도 래퍼가 툴팁을 그리고, 열리면 숨긴다", async () => {
    await openSet("UT_TIP3", viewOf("UT_TIP3"));
    const wrap = byTestId("flow-help").parentElement!;
    expect(wrap.classList.contains("rsf-tip")).toBe(true);
    expect(wrap.getAttribute("data-tip")).toBe("단축키 도움말");
    expect(byTestId("flow-help").getAttribute("aria-label")).toBe("단축키 도움말");
    await click("flow-help");
    expect(wrap.hasAttribute("data-tip-off")).toBe(true);
  });

  it("툴팁을 그리는 요소는 단추 안이 아니다(단추 루트 overflow:hidden 에 잘리지 않음)", async () => {
    await openSet("UT_TIP4", viewOf("UT_TIP4"));
    for (const id of ["flow-undo", "flow-redo", "flow-help"]) {
      const b = byTestId(id);
      expect(b.closest("[data-tip]")).toBe(b.parentElement); // 가장 가까운 data-tip 은 단추가 아닌 래퍼
      expect(b.closest("[data-tip]")).not.toBe(b);
      expect(b.querySelector("[data-tip]")).toBeNull();
    }
    expect(RSF_CSS).not.toMatch(/button\[data-tip\]|\.form-button\[data-tip\]/);
  });

  it("CSS — 래퍼 툴팁 규칙: hover·focus-within, 아래쪽, 꺼진 단추도 뜸, 16진수 색 없음", () => {
    const css = (RSF_CSS.match(/\.rsf-tip[^{]*\{[^}]*\}/g) ?? []).join("\n");
    expect(css).toMatch(/\.rsf-tip:hover::after/);
    expect(css).toMatch(/\.rsf-tip:focus-within::after/);
    expect(css).toMatch(/top:\s*calc\(100% \+/);
    expect(css).toMatch(/content:\s*attr\(data-tip\)/);
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(/);
    expect(RSF_CSS).toMatch(/\.rsf-tip\s*\{[^}]*position:\s*relative/);
    expect(RSF_CSS).toMatch(/\.rsf-tip\[data-tip-off\]::after\s*\{\s*display:\s*none/);
    expect(RSF_CSS).not.toMatch(/\.rsf-tip[^{]*:not\(:disabled\)/);
  });
});

describe("화면 — 되돌리기·다시 하기 단축키는 캔버스 밖에서도 동작한다", () => {
  beforeEach(() => {
    installDomStorage();
    installServer();
    localStorage.clear();
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
  });
  afterEach(() => {
    vi.restoreAllMocks();
    uninstallServer();
  });

  it("초점이 body 일 때 Meta+Z 로 되돌리고 Meta+Shift+Z·Meta+Y 로 다시 한다(기본 동작 막음)", async () => {
    await openSet("UT_BODY", viewOf("UT_BODY"));
    await editOnce();
    let ev = await key(document.body, { key: "z", metaKey: true });
    expect(ev.defaultPrevented).toBe(true);
    expect(noteCount()).toBe(0);
    expect(redoDisabled()).toBe(false);
    ev = await key(document.body, { key: "z", metaKey: true, shiftKey: true });
    expect(ev.defaultPrevented).toBe(true);
    expect(noteCount()).toBe(1);
    await key(document.body, { key: "z", metaKey: true });
    expect(noteCount()).toBe(0);
    await key(document.body, { key: "y", metaKey: true });
    expect(noteCount()).toBe(1);
  });

  it("오른쪽 패널·툴바 단추 위에서도 되돌린다", async () => {
    await openSet("UT_BTN", viewOf("UT_BTN"));
    await editOnce();
    await key(byTestId("flow-fit"), { key: "z", metaKey: true });
    expect(noteCount()).toBe(0);
  });

  it("윈도우 판정: Ctrl+Z · Ctrl+Y", async () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("Win32");
    await openSet("UT_WIN", viewOf("UT_WIN"));
    await editOnce();
    await key(document.body, { key: "z", ctrlKey: true });
    expect(noteCount()).toBe(0);
    await key(document.body, { key: "y", ctrlKey: true });
    expect(noteCount()).toBe(1);
  });

  it("되돌릴 것이 없으면 아무 일 없이 기본 동작만 막는다", async () => {
    await openSet("UT_NONE", viewOf("UT_NONE"));
    await click("flow-mode-edit");
    expect(undoDisabled()).toBe(true);
    const ev = await key(document.body, { key: "z", metaKey: true });
    expect(ev.defaultPrevented).toBe(true);
    expect(undoDisabled()).toBe(true);
  });

  it("입력 칸(찾기 칸)에 초점이 있으면 흐름을 되돌리지 않는다", async () => {
    await openSet("UT_INPUT", viewOf("UT_INPUT"));
    await editOnce();
    await click("flow-find-open");
    const ev = await key(byTestId("flow-find"), { key: "z", metaKey: true });
    expect(ev.defaultPrevented).toBe(false);
    expect(noteCount()).toBe(1);
  });

  it("캔버스 안에서 누르면 한 번만 되돌려진다", async () => {
    await openSet("UT_ONCE", viewOf("UT_ONCE"));
    await editOnce();
    // 편집을 하나 더 만든다(메모 둘) — 한 번만 되돌려지면 하나가 남는다
    const pane = canvas().querySelector(".react-flow__pane")!;
    await act(async () => {
      pane.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 300, clientY: 300 }));
    });
    await flush();
    await click("flow-menu-item-note-add");
    expect(noteCount()).toBe(2);
    await act(async () => canvas().focus());
    // 캔버스 처리기는 preventDefault·stopPropagation 을 부른다. 그 둘에 가려지면 감싸개 제외 조건이 없어도 통과하므로
    // 이 이벤트에서는 둘을 아무 일 없게 바꿔 document 리스너까지 그대로 닿게 한다 — 감싸개 안이면 document 쪽은 건너뛰어야 한다.
    const ev = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "z", metaKey: true });
    let prevented = 0;
    Object.defineProperty(ev, "preventDefault", { value: () => void prevented++ });
    Object.defineProperty(ev, "stopPropagation", { value: () => undefined });
    await act(async () => {
      canvas().dispatchEvent(ev);
    });
    await flush();
    expect(prevented).toBe(1); // 캔버스 처리기 한 번만
    expect(noteCount()).toBe(1);
  });

  it("보기 모드에서는 되돌리지 않는다", async () => {
    await openSet("UT_VIEW", viewOf("UT_VIEW"));
    await editOnce();
    await click("flow-mode-view");
    const ev = await key(document.body, { key: "z", metaKey: true });
    expect(ev.defaultPrevented).toBe(false);
    expect(noteCount()).toBe(1);
  });

  it("열린 대화 상자·메뉴 안에서 온 키는 무시한다", async () => {
    await openSet("UT_DLG", viewOf("UT_DLG"));
    await editOnce();
    const dlg = document.createElement("div");
    dlg.setAttribute("role", "dialog");
    const btn = document.createElement("button");
    dlg.appendChild(btn);
    document.body.appendChild(dlg);
    const ev = await key(btn, { key: "z", metaKey: true });
    dlg.remove();
    expect(ev.defaultPrevented).toBe(false);
    expect(noteCount()).toBe(1);
  });

  it("우클릭 메뉴(role=menu) 안에서 온 키는 무시한다", async () => {
    await openSet("UT_MENU", viewOf("UT_MENU"));
    await editOnce();
    const menu = document.createElement("div");
    menu.setAttribute("role", "menu");
    const item = document.createElement("button");
    menu.appendChild(item);
    document.body.appendChild(menu);
    const ev = await key(item, { key: "z", metaKey: true });
    menu.remove();
    expect(ev.defaultPrevented).toBe(false);
    expect(noteCount()).toBe(1);
  });

  it("디버그 모드에서는 되돌리지 않고 기본 동작도 막지 않는다", async () => {
    await openSet("UT_DEBUG", viewOf("UT_DEBUG"));
    await editOnce();
    await click("flow-mode-debug");
    expect(byTestId("flow-mode-debug").getAttribute("aria-pressed")).toBe("true");
    const ev = await key(document.body, { key: "z", metaKey: true });
    expect(ev.defaultPrevented).toBe(false);
    expect(noteCount()).toBe(1);
  });

  it("화면이 숨으면(포털의 고르지 않은 탭 — 조상 display:none) 되돌리지 않고 기본 동작도 막지 않는다, 다시 보이면 된다", async () => {
    await openSet("UT_HIDDEN", viewOf("UT_HIDDEN"));
    await editOnce();
    expect(pageContainer().contains(byTestId("flow-canvas"))).toBe(true);
    pageContainer().style.display = "none";
    let ev = await key(document.body, { key: "z", metaKey: true });
    expect(ev.defaultPrevented).toBe(false);
    expect(noteCount()).toBe(1);
    pageContainer().style.display = "";
    ev = await key(document.body, { key: "z", metaKey: true });
    expect(ev.defaultPrevented).toBe(true);
    expect(noteCount()).toBe(0);
  });

  it("화면을 떠나면 리스너가 사라진다", async () => {
    await openSet("UT_UNMOUNT", viewOf("UT_UNMOUNT"));
    await editOnce();
    const add = vi.spyOn(document, "addEventListener");
    const remove = vi.spyOn(document, "removeEventListener");
    unmountPage();
    const ev = await key(document.body, { key: "z", metaKey: true });
    expect(ev.defaultPrevented).toBe(false);
    // 고른 메모의 패널 편집기(shared MarkdownEditor, Tiptap)는 내릴 때 ProseMirror 가 selectionchange 를 잠깐 다시 걸었다가
    // 편집기를 지우며 뗀다(@tiptap/react EditorContent.componentWillUnmount → view.setProps). 남는 리스너가 없어야 한다.
    await new Promise((r) => setTimeout(r, 50));
    const removed = remove.mock.calls.map(([, h]) => h);
    expect(add.mock.calls.filter(([t]) => t !== "selectionchange")).toEqual([]);
    expect(add.mock.calls.filter(([, h]) => !removed.includes(h))).toEqual([]);
    expect(remove.mock.calls.some(([t]) => t === "keydown")).toBe(true);
  });
});
