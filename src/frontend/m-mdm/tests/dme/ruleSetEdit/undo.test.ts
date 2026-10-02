/** @vitest-environment happy-dom */

// 룰 세트 편집 되돌리기·다시 하기·떠나기 확인(3단계 Task 3) — 화면 단추·단축키·입력 합치기, 저장·다른 세트 열기와 이력, flowVersion, beforeunload.
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

const mocks = vi.hoisted(() => ({ openRuleEdit: vi.fn(), openMdmPage: vi.fn() }));

vi.mock("@/dme/rule-handoff", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/dme/rule-handoff")>()),
  openRuleEdit: (...args: unknown[]) => mocks.openRuleEdit(...args),
}));

vi.mock("@/shell", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shell")>()),
  openMdmPage: (...args: unknown[]) => mocks.openMdmPage(...args),
}));

import { insertSplit, setPositions, toEditFlow, type EditFlow } from "../../../pages/dme/ruleSetEdit/flow-edit";
import { useRuleSetEdit } from "../../../pages/dme/ruleSetEdit/state/useRuleSetEdit";
import type { RuleIo, RuleSetView } from "../../../pages/dme/ruleSetEdit/types";
import { flush, typeInto } from "../helpers/render";
import { byTestId, canvasNodeIds, click, clickFake, installServer, ok, openSet, settle, srv, uninstallServer, unmountPage } from "../helpers/rule-set-page";

const ioName = (n: string) => ({ name: n, source: "DICT" as const, label: null, dataType: null, scale: null, dateString: false, maruCodeId: null });
const rule = (ruleId: string, cond: string, result: string): RuleIo => ({
  ruleId, ruleName: `${ruleId} 이름`, ruleKind: "DECISION", status: "INUSE", exists: true, releasedVer: "1.000", hitPolicy: "FIRST",
  conds: [ioName(cond)], results: [{ ...ioName(result), source: null }],
});

function chainView(setId = "E2S_CHAIN"): RuleSetView {
  return {
    set: { setId, setName: "사슬", description: null, status: "INUSE", rowVersion: 3, ruleIds: ["E2S_GRD", "E2S_FCT"], flow: null, branched: false },
    rules: [rule("E2S_GRD", "SET_THK", "S_GRD"), rule("E2S_FCT", "S_GRD", "S_FCT")],
    checks: [],
    condIo: {},
    editable: true,
    restorable: false,
    cases: [],
  };
}

const undoBtn = () => byTestId<HTMLButtonElement>("flow-undo");
const redoBtn = () => byTestId<HTMLButtonElement>("flow-redo");

async function addGroup() {
  await click("flow-node-r1");
  await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift", bubbles: true })); });
  await click("flow-node-r2");
  await act(async () => { document.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift", bubbles: true })); });
  await click("flow-add-group");
}

async function key(el: Element, init: KeyboardEventInit): Promise<KeyboardEvent> {
  const ev = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  await act(async () => {
    el.dispatchEvent(ev);
  });
  await flush();
  return ev;
}

describe("편집 되돌리기·다시 하기(3단계 Task 3)", () => {
  beforeEach(() => {
    installServer();
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    uninstallServer();
  });

  it("1. [IF] 끼우기 → 되돌리기로 IF 가 사라지고 dirty 가 풀리며, 다시 하기로 돌아온다", async () => {
    await openSet("E2S_CHAIN", chainView());
    await click("flow-mode-edit");
    expect(undoBtn().disabled).toBe(true);
    await click("flow-add-if");
    expect(canvasNodeIds()).toContain("if1");
    expect(undoBtn().disabled).toBe(false);
    expect(redoBtn().disabled).toBe(true);
    await click("flow-undo");
    expect(canvasNodeIds()).not.toContain("if1");
    expect(byTestId<HTMLButtonElement>("set-save").disabled).toBe(true);
    expect(undoBtn().disabled).toBe(true);
    expect(redoBtn().disabled).toBe(false);
    await click("flow-redo");
    expect(canvasNodeIds()).toContain("if1");
  });

  it("2. 캔버스 초점의 Ctrl+Z·Ctrl+Shift+Z 가 같은 일을 하고, Mac 에서는 Cmd+Z 다", async () => {
    await openSet("E2S_CHAIN", chainView());
    await click("flow-mode-edit");
    await click("flow-add-if");
    await key(byTestId("flow-canvas"), { key: "z", ctrlKey: true });
    expect(canvasNodeIds()).not.toContain("if1");
    await key(byTestId("flow-canvas"), { key: "Z", ctrlKey: true, shiftKey: true });
    expect(canvasNodeIds()).toContain("if1");

    const platform = vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    try {
      unmountPage();
      await openSet("E2S_CHAIN", chainView());
      await click("flow-mode-edit");
      await click("flow-add-if");
      const ctrl = await key(byTestId("flow-canvas"), { key: "z", ctrlKey: true });
      expect(ctrl.defaultPrevented).toBe(false);
      expect(canvasNodeIds()).toContain("if1");
      await key(byTestId("flow-canvas"), { key: "z", metaKey: true });
      expect(canvasNodeIds()).not.toContain("if1");
    } finally {
      platform.mockRestore();
    }
  });

  it("3. 조건식 입력 3번(300ms 간격)은 한 번에 되돌려지고, 입력 칸의 Ctrl+Z 는 가로채지 않는다", async () => {
    await openSet("E2S_CHAIN", chainView());
    await click("flow-mode-edit");
    await click("flow-add-if");
    await click("flow-node-if1");
    const cond = () => byTestId<HTMLTextAreaElement>("flow-prop-branch-e4-cond");
    vi.useFakeTimers();
    await typeInto(cond(), "A");
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    await typeInto(cond(), "AB");
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    await typeInto(cond(), "ABC");
    const inTextarea = new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true, cancelable: true });
    await act(async () => { cond().dispatchEvent(inTextarea); });
    expect(inTextarea.defaultPrevented).toBe(false);
    expect(cond().value).toBe("ABC");
    await clickFake("flow-undo");
    expect(cond().value).toBe("");
    vi.useRealTimers();
  });

  it("4. 저장 뒤에도 되돌리기가 켜져 있고, 다른 세트를 열면 꺼진다", async () => {
    srv.views.E2S_OTHER = chainView("E2S_OTHER");
    srv.replies.save = ok({ rowVersion: 4, checks: [] });
    await openSet("E2S_CHAIN", chainView(), { tabId: "tab-1" });
    await click("flow-mode-edit");
    await addGroup();
    expect(undoBtn().disabled).toBe(false);
    await click("set-save");
    await settle(0);
    expect(undoBtn().disabled).toBe(false);
    // 다른 세트 열기(portal 탭 활성화 넘김)
    const g = globalThis as Record<string, unknown>;
    ((g.__mdmPageHandoff__ ??= {}) as Record<string, Record<string, string>>)["mdm:dme/ruleSetEdit"] = { setId: "E2S_OTHER" };
    await act(async () => {
      window.dispatchEvent(new CustomEvent("portal-tab-activated", { detail: { tabId: "tab-1" } }));
    });
    await flush();
    await click("flow-mode-edit");
    expect(undoBtn().disabled).toBe(true);
  });

  it("6. 바뀐 게 있으면 beforeunload 가 막히고, 저장하면 풀린다", async () => {
    srv.replies.save = ok({ rowVersion: 4, checks: [] });
    await openSet("E2S_CHAIN", chainView());
    const fire = () => {
      const ev = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(ev);
      return ev.defaultPrevented;
    };
    expect(fire()).toBe(false);
    await click("flow-mode-edit");
    await addGroup();
    expect(fire()).toBe(true);
    await click("set-save");
    await settle(0);
    expect(fire()).toBe(false);
  });
});

describe("useRuleSetEdit 이력(3단계 Task 3)", () => {
  let state: ReturnType<typeof useRuleSetEdit> | null = null;
  const Probe = () => {
    state = useRuleSetEdit();
    return null;
  };
  let host: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    installServer();
  });
  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    host?.remove();
    uninstallServer();
  });

  it("5. 되돌리면 flowVersion 이 오르고, 위치만 고친 편집은 오르지 않는다", async () => {
    srv.views.E2S_CHAIN = chainView();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(createElement(DmesUiProvider, null, createElement(Probe)));
    });
    await act(async () => {
      await state!.open("E2S_CHAIN");
    });
    await act(async () => state!.setMode("edit"));
    const v0 = state!.flowVersion;
    await act(async () => {
      state!.edit((f) => setPositions(f, { r1: { x: 5, y: 5 } }));
    });
    expect(state!.flowVersion).toBe(v0);
    expect(state!.canUndo).toBe(true);
    await act(async () => {
      state!.edit((f) => {
        const r = f.nodes.find((n) => n.kind === "RULE")!;
        return { ...f, nodes: f.nodes.filter((n) => n.id !== r.id) };
      });
    });
    expect(state!.flowVersion).toBe(v0 + 1);
    await act(async () => state!.undo());
    expect(state!.flowVersion).toBe(v0 + 2);
    await act(async () => state!.undo());
    expect(state!.flowVersion).toBe(v0 + 2); // 위치만 되돌린 것
    expect(state!.canUndo).toBe(false);
  });
});

describe("선 경로(Task 15, C14) — page 수준", () => {
  beforeEach(() => {
    installServer();
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    uninstallServer();
  });

  it("routes 가 없는 옛 저장본을 열어도 [세트 저장] 은 꺼져 있다(dirty 아님)", async () => {
    const v = chainView();
    v.set.flow = JSON.parse(JSON.stringify({ ...toEditFlow(null, ["E2S_GRD", "E2S_FCT"]), view: { positions: {}, notes: [], groups: [] } }));
    await openSet("E2S_CHAIN", v);
    expect(byTestId<HTMLButtonElement>("set-save").disabled).toBe(true);
    await click("flow-mode-edit");
    expect(byTestId<HTMLButtonElement>("set-save").disabled).toBe(true);
  });

  it("선을 두 번 눌러 더한 꺾는 점은 되돌리기로 사라지고 다시 하기로 돌아온다, 점이 생기면 dirty 다", async () => {
    await openSet("E2S_CHAIN", chainView());
    await click("flow-mode-edit");
    await click("rf__edge-e2");
    const dbl = async () => act(async () => {
      byTestId("rf__edge-e2").querySelector("path")!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
    });
    await dbl();
    await flush();
    expect(document.querySelectorAll('[data-testid^="flow-route-handle-e2-"]').length).toBe(1);
    expect(byTestId<HTMLButtonElement>("set-save").disabled).toBe(false);
    await click("flow-undo");
    expect(document.querySelectorAll('[data-testid^="flow-route-handle-e2-"]').length).toBe(0);
    expect(byTestId<HTMLButtonElement>("set-save").disabled).toBe(true);
    await click("flow-redo");
    expect(document.querySelectorAll('[data-testid^="flow-route-handle-e2-"]').length).toBe(1);
  });

  it("손잡이를 고른 채 Delete 는 그 점만 빼고, 손잡이가 없으면 고른 선을 지운다", async () => {
    await openSet("E2S_CHAIN", chainView());
    await click("flow-mode-edit");
    await click("rf__edge-e2");
    await act(async () => {
      byTestId("rf__edge-e2").querySelector("path")!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
    });
    await flush();
    const h = byTestId("flow-route-handle-e2-0");
    await act(async () => { h.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, clientX: 10, clientY: 10 })); });
    await act(async () => { window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 10, clientY: 10 })); });
    await key(byTestId("flow-canvas"), { key: "Delete" });
    expect(document.querySelectorAll('[data-testid^="flow-route-handle-e2-"]').length).toBe(0);
    expect(document.querySelector('[data-testid="rf__edge-e2"]')).not.toBeNull(); // 선은 남는다
    await key(byTestId("flow-canvas"), { key: "Delete" }); // 손잡이 없음 → 원래 선택 삭제
    expect(document.querySelector('[data-testid="rf__edge-e2"]')).toBeNull();
  });
});

describe("선 이름표 옮기기(L1) — page 수준", () => {
  beforeEach(() => {
    installServer();
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    uninstallServer();
  });

  /** start → r1 → if1{e4 "갈래 1" / e5 그 외} → m1 → r2 → end. */
  const ifFlow = (): EditFlow => {
    const r = insertSplit(toEditFlow(null, ["E2S_GRD", "E2S_FCT"]), "e2", "IF");
    if (!r.ok) throw new Error(r.reason);
    return r.flow;
  };
  const ifView = (flow: unknown) => {
    const v = chainView();
    v.set.flow = JSON.parse(JSON.stringify(flow));
    v.set.branched = true;
    return v;
  };
  const labelAt = () => (byTestId("flow-edge-label-e4").parentElement as HTMLElement).style.transform;
  /** dirty — beforeunload 가 막히는가(IF 흐름은 구조 검사 거부로 [세트 저장] 이 늘 꺼져 있어 단추로는 못 본다). */
  const isDirty = () => {
    const ev = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(ev);
    return ev.defaultPrevented;
  };
  const fire = (el: Element | Window, type: string, init: MouseEventInit = {}) =>
    act(async () => {
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...init }));
    });

  it("labels 가 없는 옛 저장본(경로는 있음)을 열어도 dirty 가 아니다", async () => {
    const f = ifFlow();
    await openSet("E2S_CHAIN", ifView({ ...f, view: { positions: {}, notes: [], groups: [], routes: { e1: [{ x: 5, y: 5 }] } } }));
    expect(isDirty()).toBe(false);
    await click("flow-mode-edit");
    expect(isDirty()).toBe(false);
  });

  it("라벨을 끌어 놓으면 편집 한 번(dirty) — 되돌리기 한 번에 원래 자리·기록 없음, 다시 하기로 돌아온다", async () => {
    await openSet("E2S_CHAIN", ifView(ifFlow()));
    await click("flow-mode-edit");
    const before = labelAt();
    expect(undoBtn().disabled).toBe(true);
    await fire(byTestId("flow-edge-label-e4"), "pointerdown", { clientX: 100, clientY: 100 });
    await fire(window, "pointermove", { clientX: 130, clientY: 100, buttons: 1 });
    await fire(window, "pointermove", { clientX: 160, clientY: 110, buttons: 1 });
    expect(undoBtn().disabled).toBe(true); // 끄는 동안은 기록이 없다
    await fire(window, "pointerup", { clientX: 160, clientY: 110 });
    await flush();
    const moved = labelAt();
    expect(moved).not.toBe(before);
    expect(isDirty()).toBe(true);
    await click("flow-undo");
    expect(labelAt()).toBe(before);
    expect(undoBtn().disabled).toBe(true); // 한 칸이었다
    expect(isDirty()).toBe(false);
    await click("flow-redo");
    expect(labelAt()).toBe(moved);
  });

  it("임계값 미만의 누르기는 기록이 없고 두 번 누르기로 조건식 칸이 열린다", async () => {
    await openSet("E2S_CHAIN", ifView(ifFlow()));
    await click("flow-mode-edit");
    const label = byTestId("flow-edge-label-e4");
    await fire(label, "pointerdown", { clientX: 100, clientY: 100 });
    await fire(window, "pointermove", { clientX: 102, clientY: 101, buttons: 1 });
    await fire(window, "pointerup", { clientX: 102, clientY: 101 });
    await fire(label, "click");
    await fire(label, "dblclick");
    await flush();
    expect(undoBtn().disabled).toBe(true);
    expect(document.querySelector('[data-testid="flow-edge-cond-input-e4"]')).not.toBeNull();
  });
});
