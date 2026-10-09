/** @vitest-environment happy-dom */
// 하위 세트 spec §10 — 편집 화면 안 세트 탭(ui:7): 포털 파라미터·고르기로 탭 열기, 상한, dirty 닫기 확인, 탭마다 따로인 상태,
// 숨은 탭 위험(⌘Z·캔버스 키·도움말 Esc·오류 창·자동 저장·선점·beforeunload)과 쓰기 알림(onWritten).
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

const mocks = vi.hoisted(() => ({ openRuleEdit: vi.fn(), openMdmPage: vi.fn() }));
/** 탭 틀 컨텍스트의 확정 안 한 세트를 읽는 시험용 소비자의 마지막 값 — 편집기 아래 늘 그리는 ChecksPanel 을 감싸 읽는다. */
const probe = vi.hoisted(() => ({ unconfirmed: null as ReadonlySet<string> | null, dirty: null as ReadonlySet<string> | null }));

vi.mock("../../../pages/dme/ruleSetEdit/panels/ChecksPanel", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../pages/dme/ruleSetEdit/panels/ChecksPanel")>();
  const react = await import("react");
  const ctx = await import("../../../pages/dme/ruleSetEdit/tabs-context");
  return {
    ...actual,
    ChecksPanel: (props: Parameters<typeof actual.ChecksPanel>[0]) => {
      const api = react.useContext(ctx.RuleSetTabsContext);
      probe.unconfirmed = api.unconfirmedSetIds;
      probe.dirty = api.dirtySetIds;
      return react.createElement(actual.ChecksPanel, props);
    },
  };
});

vi.mock("@/dme/rule-handoff", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/dme/rule-handoff")>()),
  openRuleEdit: (...args: unknown[]) => mocks.openRuleEdit(...args),
}));

vi.mock("@/shell", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shell")>()),
  openMdmPage: (...args: unknown[]) => mocks.openMdmPage(...args),
}));

import { AUTO_SAVE_DELAY_MS } from "../../../pages/dme/ruleSetEdit/state/useAutoSave";
import { useRuleSetEdit, type RuleSetEditState } from "../../../pages/dme/ruleSetEdit/state/useRuleSetEdit";
import type { RuleIo, RuleSetVersionRow, RuleSetView } from "../../../pages/dme/ruleSetEdit/types";
import { flush, typeInto } from "../helpers/render";
import { byTestId, calls, click, handoff, installServer, ok, openSet, q, renderPage, settle, srv, uninstallServer } from "../helpers/rule-set-page";
import { activateTab, activeKey, clickIn, inPanel, pickInActive, qPanel, tabKeys } from "./set-tabs-helpers";

// 이 파일의 시험은 탭을 여러 개 열고(8개 상한 시험은 한가할 때도 약 5초, 자동 저장 시험도 5초 안팎) 부하가 있으면 기본 5초를 넘는다.
// 시간 초과가 나면 그 시험의 남은 비동기 작업이 다음 시험의 화면과 겹쳐 뒤 시험들이 연쇄로 실패하므로 파일 전체 제한을 늘린다.
vi.setConfig({ testTimeout: 30_000 });

const ioName = (n: string) => ({ name: n, source: "DICT" as const, label: null, dataType: null, scale: null, dateString: false, maruCodeId: null });
const rule = (ruleId: string, cond: string, result: string): RuleIo => ({
  ruleId, ruleName: `${ruleId} 이름`, ruleKind: "DECISION", status: "INUSE", exists: true, releasedVer: "1.000", hitPolicy: "FIRST",
  conds: [ioName(cond)], results: [{ ...ioName(result), source: null }],
});

function viewOf(setId: string): RuleSetView {
  return {
    set: { setId, setName: `${setId} 세트`, description: null, status: "INUSE", rowVersion: 3, ruleIds: ["E2S_GRD", "E2S_FCT"], flow: null, branched: false },
    rules: [rule("E2S_GRD", "SET_THK", "S_GRD"), rule("E2S_FCT", "S_GRD", "S_FCT")],
    checks: [],
    condIo: {},
    editable: true,
    restorable: false,
    cases: [],
  };
}

/** DRAFT 2.000 을 연 view(owner 가 null 이면 아무도 선점하지 않은 DRAFT). */
function draftView(setId: string, owner: string | null): RuleSetView {
  const versions: RuleSetVersionRow[] = [
    { ver: "2.000", verKind: "MAJOR", verLabel: "v2.000", status: "DRAFT", applyFrom: null, applyTo: null, ownerId: owner, rowVersion: 0, cancelConfirmable: false },
    { ver: "1.000", verKind: "MAJOR", verLabel: "v1.000", status: "RELEASED", applyFrom: "2026-01-01 00:00:00", applyTo: "9999-12-31 00:00:00", ownerId: null, rowVersion: 3, cancelConfirmable: false },
  ];
  const v = viewOf(setId);
  return {
    ...v,
    editable: owner === "tester",
    set: { ...v.set, rowVersion: 0, ver: "2.000", verKind: "MAJOR", verLabel: "v2.000", verStatus: "DRAFT", ownerId: owner },
    versions,
    flags: { canNewMajor: false, canNewMinor: false, nextMajor: null, nextMinor: null, unappliedCount: 1, currentVer: "1.000", canDeprecate: false },
    me: "tester",
  };
}

/** 포털이 세트를 넘기고 이 화면 탭을 다시 고른 것처럼 연다. */
async function openLink(setId: string, view: RuleSetView = viewOf(setId)): Promise<void> {
  srv.views[setId] = view;
  handoff(setId);
  await activateTab("T1");
}

async function key(target: EventTarget, init: KeyboardEventInit): Promise<KeyboardEvent> {
  const ev = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  await act(async () => {
    target.dispatchEvent(ev);
  });
  await flush();
  return ev;
}

/** 지금 탭(첫 패널이어야 한다)의 r1·r2 를 묶어 그룹을 만든다 — 되돌리기 한 칸이 생긴다. */
async function addGroup() {
  await click("flow-node-r1");
  await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift", bubbles: true })); });
  await click("flow-node-r2");
  await act(async () => { document.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift", bubbles: true })); });
  await click("flow-add-group");
}

const tabTexts = () => Array.from(byTestId("set-tabs").querySelectorAll('[role="tab"]')).map((t) => t.textContent ?? "");
const bodyHas = (text: string) => (document.body.textContent ?? "").includes(text);

describe("세트 탭", () => {
  beforeEach(() => {
    installServer();
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    uninstallServer();
  });

  it("포털 파라미터는 첫 빈 탭에서 열고, 두 번째부터 새 탭으로 열어 고른다. 숨은 패널은 hidden·display:none 이다", async () => {
    await openSet("S1", viewOf("S1"), { tabId: "T1" });
    expect(tabKeys()).toEqual(["t1"]);
    expect(byTestId("set-tab-t1").textContent).toContain("S1");
    expect(byTestId("set-tab-t1").getAttribute("title")).toBe("S1 세트");
    await openLink("S2");
    expect(tabTexts()).toEqual([expect.stringContaining("S1"), expect.stringContaining("S2")]);
    const second = tabKeys()[1];
    expect(activeKey()).toBe(second);
    expect(byTestId("set-tab-panel-t1").style.display).toBe("none");
    expect(byTestId("set-tab-panel-t1").hasAttribute("hidden")).toBe(true);
    expect(byTestId(`set-tab-panel-${second}`).hasAttribute("hidden")).toBe(false);
    expect(calls("view").map((r) => (r.body.params as Record<string, string>).setId)).toEqual(["S1", "S2"]);
    expect(byTestId("set-tabs").getAttribute("aria-label")).toBe("열린 룰 세트");
  });

  it("이미 열린 세트를 다시 넘기면 새로 불러오지 않고 그 탭으로 간다", async () => {
    await openSet("S1", viewOf("S1"), { tabId: "T1" });
    await openLink("S2");
    await openLink("S1");
    expect(tabKeys()).toHaveLength(2);
    expect(activeKey()).toBe("t1");
    expect(calls("view")).toHaveLength(2);
  });

  it("탭이 8개면 더 열지 않고 메시지를 보이며, 다른 탭을 고르면 메시지를 지운다", async () => {
    await openSet("S0", viewOf("S0"), { tabId: "T1" });
    for (let i = 1; i < 8; i++) await openLink(`S${i}`);
    expect(tabKeys()).toHaveLength(8);
    await openLink("S8");
    expect(tabKeys()).toHaveLength(8);
    expect(byTestId("set-tabs-message").textContent).toBe("세트 탭은 8개까지 연다. 다른 탭을 닫고 다시 연다");
    expect(calls("view").some((r) => (r.body.params as Record<string, string>).setId === "S8")).toBe(false);
    await click("set-tab-t1");
    expect(byTestId("set-tabs-message").textContent).toBe("");
  });

  it("저장하지 않은 변경이 있는 탭은 닫기 전에 확인하고, 마지막 탭에는 닫기 단추가 없다", async () => {
    await openSet("S1", viewOf("S1"), { tabId: "T1" });
    expect(q("set-tab-close-t1")).toBeNull();
    await openLink("S2");
    const second = tabKeys()[1];
    await click("set-tab-t1");
    await click("flow-mode-edit"); // t1 이 첫 패널·지금 탭
    await typeInto(inPanel<HTMLInputElement>("t1", "set-name"), "S1 고침");
    expect(q("set-tab-dirty-t1")).not.toBeNull();
    expect(q(`set-tab-dirty-${second}`)).toBeNull();
    window.confirm = vi.fn(() => false);
    await click("set-tab-close-t1");
    expect(window.confirm).toHaveBeenCalledWith("저장하지 않은 변경이 있다. 닫으면 변경을 버린다.");
    expect(q("set-tab-t1")).not.toBeNull();
    window.confirm = vi.fn(() => true);
    await click("set-tab-close-t1");
    expect(q("set-tab-t1")).toBeNull();
    expect(activeKey()).toBe(second);
    expect(q(`set-tab-close-${second}`)).toBeNull();
    // 저장하지 않은 변경이 없는 탭은 묻지 않고 닫는다
    await openLink("S3");
    window.confirm = vi.fn(() => true);
    await click(`set-tab-close-${second}`);
    expect(window.confirm).not.toHaveBeenCalled();
    expect(tabKeys()).toHaveLength(1);
  });

  it("탭마다 모드가 따로다", async () => {
    await openSet("S1", viewOf("S1"), { tabId: "T1" });
    await click("flow-mode-edit");
    await openLink("S2");
    const second = tabKeys()[1];
    expect(inPanel(second, "flow-mode-view").getAttribute("aria-pressed")).toBe("true");
    expect(inPanel("t1", "flow-mode-edit").getAttribute("aria-pressed")).toBe("true");
  });

  it("보는 사람 설정(미니맵·변수 표시)은 다른 탭이 따르고, 디버그 모드 탭은 변수 표시를 따르지 않는다", async () => {
    await openSet("S1", viewOf("S1"), { tabId: "T1" });
    await click("flow-mode-debug"); // t1 은 디버그 모드 — 들어가며 변수 표시를 켠다(P-D16)
    const t1Vars = inPanel("t1", "flow-var-toggle").getAttribute("data-mode");
    await openLink("S2");
    const second = tabKeys()[1];
    expect(inPanel(second, "flow-minimap-toggle").getAttribute("aria-pressed")).toBe("true");
    await clickIn(second, "flow-minimap-toggle");
    await clickIn(second, "flow-var-toggle"); // 꺼짐 → ID
    await clickIn(second, "flow-var-toggle"); // ID → 이름
    expect(inPanel(second, "flow-minimap-toggle").getAttribute("aria-pressed")).toBe("false");
    expect(inPanel(second, "flow-var-toggle").getAttribute("data-mode")).toBe("name");
    expect(inPanel("t1", "flow-minimap-toggle").getAttribute("aria-pressed")).toBe("false");
    expect(t1Vars).toBe("id");
    expect(inPanel("t1", "flow-var-toggle").getAttribute("data-mode")).toBe("id"); // 디버그 모드는 따르지 않는다
    // 디버그 모드가 아닌 탭은 따른다 — t1 을 보기 모드로 돌리면 들어가기 전 값(꺼짐)으로 돌아가고, 그 뒤 바뀐 값은 따른다
    await click("set-tab-t1");
    await click("flow-mode-view");
    await click(`set-tab-${second}`);
    await clickIn(second, "flow-var-toggle"); // 이름 → 꺼짐
    await clickIn(second, "flow-var-toggle"); // 꺼짐 → ID
    expect(inPanel("t1", "flow-var-toggle").getAttribute("data-mode")).toBe("id");
  });

  it("툴바 고르기는 다른 탭에 열린 세트면 그 탭으로 가고, 새 세트면 지금 탭에서 연다", async () => {
    await openSet("S1", viewOf("S1"), { tabId: "T1" });
    await openLink("S2");
    const second = tabKeys()[1];
    const viewsBefore = calls("view").length;
    // S2 탭의 고르기 칸에 S1 을 쳐서 고르면 S1 탭으로 가고, 시작한 S2 탭의 칸은 그 탭의 세트 ID(S2)로 돌아온다
    await pickInActive("S1");
    expect(activeKey()).toBe("t1");
    expect(calls("view")).toHaveLength(viewsBefore);
    expect(tabKeys()).toHaveLength(2);
    expect(inPanel<HTMLInputElement>(second, "set-pick-keyword").value).toBe("S2");
    expect(inPanel<HTMLInputElement>("t1", "set-pick-keyword").value).toBe("S1");

    srv.views.S3 = viewOf("S3");
    await click(`set-tab-${second}`);
    await pickInActive("S3");
    expect(activeKey()).toBe(second);
    expect(tabKeys()).toHaveLength(2);
    expect(byTestId(`set-tab-${second}`).textContent).toContain("S3");
    expect(calls("view").at(-1)!.body.params).toMatchObject({ setId: "S3" });
    expect(inPanel<HTMLInputElement>(second, "set-pick-keyword").value).toBe("S3"); // 이 탭에서 연 세트가 칸에 남는다
  });

  it("첫 빈 탭의 불러오기가 실패하면 그 탭은 빈 탭이다 — 포털 파라미터가 새 탭을 열지 않고 그 탭에서 다시 연다", async () => {
    handoff("S9"); // view 없음 → 불러오기 실패
    await renderPage({ tabId: "T1" });
    expect(bodyHas("룰 세트를 찾을 수 없습니다: S9")).toBe(true);
    expect(tabKeys()).toEqual(["t1"]);
    expect(tabTexts()).toEqual(["새 탭"]); // 머리에 못 연 ID 가 남지 않는다
    // 같은 세트를 다시 넘기면(이제 있다) 새 탭이 아니라 그 탭에서 다시 불러온다
    await openLink("S9");
    expect(tabKeys()).toEqual(["t1"]);
    expect(tabTexts()).toEqual([expect.stringContaining("S9")]);
    expect(calls("view").map((r) => (r.body.params as Record<string, string>).setId)).toEqual(["S9", "S9"]);
    // 이제 열린 탭이므로 한 번 더 넘기면 다시 불러오지 않고 그 탭으로 간다
    await openLink("S9");
    expect(calls("view")).toHaveLength(2);
    expect(tabKeys()).toEqual(["t1"]);
  });

  it("두 번째 탭에서 불러오기에 실패하면 그 탭을 빈 탭으로 두고, 같은 세트를 다시 넘기면 새 탭에서 연다(실패한 탭으로 가기만 하지 않는다)", async () => {
    await openSet("S1", viewOf("S1"), { tabId: "T1" });
    handoff("S2"); // view 없음
    await activateTab("T1");
    const failedKey = tabKeys()[1];
    expect(byTestId(`set-tab-${failedKey}`).textContent).toBe("새 탭");
    await openLink("S2"); // 이제 있다
    expect(tabKeys()).toHaveLength(3);
    expect(tabTexts().filter((t) => t.includes("S2"))).toHaveLength(1);
    expect(calls("view").map((r) => (r.body.params as Record<string, string>).setId)).toEqual(["S1", "S2", "S2"]);
    // 실패한 탭의 고르기로 열린 세트(S1)를 고르면 그 탭(S1)으로 간다
    await click(`set-tab-${failedKey}`);
    await pickInActive("S1");
    expect(activeKey()).toBe("t1");
  });

  it("DRAFT 버전을 연 탭의 세트는 탭 틀의 확정 안 한 세트에 들어가고, 저장 안 한 변경은 dirty 와 확정 안 한 세트 둘 다에 들어간다", async () => {
    await openSet("S1", viewOf("S1"), { tabId: "T1" });
    expect([...(probe.unconfirmed ?? [])]).toEqual([]); // 적용 중인 세트는 확정 안 한 것이 아니다
    await openLink("S2", draftView("S2", "tester"));
    expect([...(probe.unconfirmed ?? [])]).toEqual(["S2"]);
    expect([...(probe.dirty ?? [])]).toEqual([]); // DRAFT 만으로는 저장 안 한 변경이 아니다
    await click("set-tab-t1");
    await click("flow-mode-edit");
    await typeInto(inPanel<HTMLInputElement>("t1", "set-name"), "S1 고침");
    expect([...(probe.dirty ?? [])]).toEqual(["S1"]);
    expect([...(probe.unconfirmed ?? [])].sort()).toEqual(["S1", "S2"]);
  });

  it("숨은 탭의 흐름은 캔버스 밖 ⌘Z 로 되돌리지 않는다", async () => {
    await openSet("S1", viewOf("S1"), { tabId: "T1" });
    await click("flow-mode-edit");
    await addGroup();
    expect(inPanel<HTMLButtonElement>("t1", "flow-undo").disabled).toBe(false);
    expect(q("set-tab-dirty-t1")).not.toBeNull();
    await openLink("S2");
    const ev = await key(document.body, { key: "z", ctrlKey: true });
    expect(ev.defaultPrevented).toBe(false);
    expect(inPanel<HTMLButtonElement>("t1", "flow-undo").disabled).toBe(false);
    expect(q("set-tab-dirty-t1")).not.toBeNull();
    // 그 탭을 다시 고르면 같은 키가 되돌린다
    await click("set-tab-t1");
    const back = await key(document.body, { key: "z", ctrlKey: true });
    expect(back.defaultPrevented).toBe(true);
    expect(inPanel<HTMLButtonElement>("t1", "flow-undo").disabled).toBe(true);
  });

  it("숨은 탭은 캔버스 키(찾기)에 반응하지 않고, 숨은 탭에 열린 도움말이 지금 탭의 Esc 를 가로채지 않는다", async () => {
    await openSet("S1", viewOf("S1"), { tabId: "T1" });
    await click("flow-help");
    expect(qPanel("t1", "flow-help-panel")).not.toBeNull();
    await openLink("S2");
    const second = tabKeys()[1];
    // 숨은 t1 캔버스에 초점이 남은 것처럼 그 안에서 찾기 키를 낸다
    const find = await key(inPanel("t1", "flow-canvas"), { key: "f", ctrlKey: true });
    expect(find.defaultPrevented).toBe(false);
    expect(qPanel("t1", "flow-find-widget")).toBeNull();
    // 같은 키가 지금 탭에서는 찾기를 연다
    const shown = await key(inPanel(second, "flow-canvas"), { key: "f", ctrlKey: true });
    expect(shown.defaultPrevented).toBe(true);
    expect(qPanel(second, "flow-find-widget")).not.toBeNull();
    // Esc 는 문서 캡처에서 멈추지 않고 대상까지 간다
    const seen = vi.fn();
    document.body.addEventListener("keydown", seen);
    await key(document.body, { key: "Escape" });
    document.body.removeEventListener("keydown", seen);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(qPanel("t1", "flow-help-panel")).not.toBeNull();
  });

  it("숨은 탭의 오류는 지금 탭 위에 오류 창으로 뜨지 않고, 그 탭을 고르면 보인다", async () => {
    await openSet("S1", viewOf("S1"), { tabId: "T1" });
    // S2 view 응답을 붙잡아 두었다가 탭을 옮긴 뒤 실패로 푼다
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const mock = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/ruleSetEdit/view") && String(init?.body ?? "").includes('"S2"')) await gate;
      return mock(input, init);
    }) as typeof fetch;
    handoff("S2"); // srv.views.S2 없음 → "룰 세트를 찾을 수 없습니다: S2"
    await activateTab("T1");
    const second = tabKeys()[1];
    await click("set-tab-t1");
    await act(async () => {
      release();
    });
    await settle();
    expect(bodyHas("룰 세트를 찾을 수 없습니다: S2")).toBe(false);
    await click(`set-tab-${second}`);
    await settle(50);
    expect(bodyHas("룰 세트를 찾을 수 없습니다: S2")).toBe(true);
  });

  it("자동 저장은 탭마다 따로다 — 한 탭의 자동 저장이 다른 탭 세트로 요청을 보내지 않는다", async () => {
    srv.replies.save = ok({ rowVersion: 1, checks: [] });
    await openSet("S1", draftView("S1", "tester"), { tabId: "T1" });
    await click("flow-mode-edit");
    await click("set-autosave");
    await openLink("S2", draftView("S2", "tester"));
    const second = tabKeys()[1];
    await clickIn(second, "flow-mode-edit");
    expect(inPanel(second, "set-autosave").getAttribute("aria-pressed")).toBe("true"); // 보는 사람 설정을 따라 켜져 있다
    await typeInto(inPanel<HTMLInputElement>(second, "set-name"), "S2 고침");
    await settle(AUTO_SAVE_DELAY_MS + 200);
    expect(calls("save").map((r) => (r.body.params as Record<string, string>).setId)).toEqual(["S2"]);

    await click("set-tab-t1");
    await typeInto(inPanel<HTMLInputElement>("t1", "set-name"), "S1 고침");
    await settle(AUTO_SAVE_DELAY_MS + 200);
    expect(calls("save").map((r) => (r.body.params as Record<string, string>).setId)).toEqual(["S2", "S1"]);
    expect((calls("save")[1].body.params as Record<string, string>).setName).toBe("S1 고침");
  }, 15000);

  it("선점은 그 탭의 세트로만 보내고 그 탭만 다시 부른다", async () => {
    srv.replies.lock = ok({ setId: "S2", ver: "2.000", rowVersion: 1 });
    await openSet("S1", draftView("S1", "tester"), { tabId: "T1" });
    await openLink("S2", draftView("S2", null));
    const second = tabKeys()[1];
    const before = calls("view").length;
    await clickIn(second, "set-ver-lock");
    await settle();
    expect(calls("lock").map((r) => r.body.params)).toEqual([{ setId: "S2", ver: "2.000", rowVersion: 0 }]);
    expect(calls("view").slice(before).map((r) => (r.body.params as Record<string, string>).setId)).toEqual(["S2"]);
  });

  it("숨은 탭에 저장하지 않은 변경이 있어도 beforeunload 를 막는다", async () => {
    await openSet("S1", viewOf("S1"), { tabId: "T1" });
    await click("flow-mode-edit");
    await typeInto(inPanel<HTMLInputElement>("t1", "set-name"), "S1 고침");
    await openLink("S2");
    const ev = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });
});

describe("useRuleSetEdit onWritten", () => {
  let state: RuleSetEditState | null = null;
  const written = vi.fn();
  const Probe = () => {
    state = useRuleSetEdit({ onWritten: written });
    return null;
  };

  beforeEach(() => {
    installServer();
    written.mockClear();
  });
  afterEach(() => uninstallServer());

  it("저장·버전 조작이 성공하면 그 세트 ID 로 한 번 부르고, 조용한 저장·거부는 부르지 않는다", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(createElement(DmesUiProvider, null, createElement(Probe)));
    });
    srv.views.S1 = draftView("S1", "tester");
    await act(async () => {
      await state!.open("S1");
    });
    expect(written).not.toHaveBeenCalled();

    await act(async () => {
      state!.setMode("edit");
      state!.setSetName("S1 고침");
    });
    srv.replies.save = ok({ setId: "S1", rowVersion: 1, checks: [] });
    await act(async () => {
      await state!.saveQuiet();
    });
    expect(calls("save")).toHaveLength(1);
    expect(written).not.toHaveBeenCalled(); // 자동 저장 경로는 알리지 않는다

    await act(async () => {
      state!.setSetName("S1 다시 고침");
    });
    await act(async () => {
      await state!.save();
    });
    expect(written.mock.calls).toEqual([["S1"]]);

    await act(async () => {
      await state!.versionWrite(async () => ({ ver: "2.000" }), { next: "same", done: "선점했다" });
    });
    expect(written.mock.calls).toEqual([["S1"], ["S1"]]);

    srv.replies.save = { meta: { success: false, message: "거부" } };
    await act(async () => {
      state!.setSetName("S1 세 번째");
    });
    await act(async () => {
      await state!.save();
    });
    expect(written).toHaveBeenCalledTimes(2);

    act(() => root.unmount());
    host.remove();
  });
});
