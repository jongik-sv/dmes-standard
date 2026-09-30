/** @vitest-environment happy-dom */

// 룰 세트 편집 3단계 이음새(계획 Task 0 Step 13) — 모드 셋과 패널 배치, 디버그 모드의 [변수 흐름]·아래 탭, 선 [+]·우클릭 메뉴,
// 캔버스 단축키(입력 칸은 가로채지 않음), Delete 로 선 지우기, 선 밖 드롭 거부(A1), 미니맵 켜고 끄기(localStorage).
import { createElement, act } from "react";
import { createRoot } from "react-dom/client";
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

// 디버그 툴바는 Task 10 이 채우는 슬롯이다 — 받은 selectedId 를 보이게 바꿔 끼운다(고침 1회차 사례).
vi.mock("../../../pages/dme/ruleSetEdit/debugger/DebugToolbar", async () => {
  const react = await import("react");
  return {
    DebugToolbar: (p: { selectedId: string | null; canRun: boolean }) =>
      react.createElement("div", { "data-testid": "dbg-toolbar", "data-selected": p.selectedId ?? "", "data-can-run": String(p.canRun) }),
  };
});

import { FlowCanvas, PALETTE_MIME, type FlowCanvasProps } from "../../../pages/dme/ruleSetEdit/canvas/FlowCanvas";
import { useRuleSetEdit, type RuleSetEditState } from "../../../pages/dme/ruleSetEdit/state/useRuleSetEdit";
import { addNote, toEditFlow } from "../../../pages/dme/ruleSetEdit/flow-edit";
import type { RuleIo, RuleSetView } from "../../../pages/dme/ruleSetEdit/types";
import { flush, typeInto, visibleText } from "../helpers/render";
import { byTestId, calls, canvasNodeIds, click, handoff, installServer, ok, openSet, q, settle, srv, uninstallServer } from "../helpers/rule-set-page";

type Src = "DICT" | "PROG" | "NONE";
const ioName = (n: string, source: Src | null) => ({ name: n, source, label: null, dataType: null, scale: null, dateString: false, maruCodeId: null });
function io(ruleId: string, conds: Array<[string, Src]>, results: string[]): RuleIo {
  return {
    ruleId, ruleName: `${ruleId} 이름`, ruleKind: "DECISION", status: "INUSE", exists: true, releasedVer: 1, hitPolicy: "FIRST",
    conds: conds.map(([n, s]) => ioName(n, s)), results: results.map((r) => ioName(r, null)),
  };
}

/** 한 줄 세트 start → r1 → r2 → r3 → end(선 e1..e4). */
function chainView(): RuleSetView {
  return {
    set: { setId: "E2S_CHAIN", setName: "사슬", description: null, status: "INUSE", rowVersion: 3, ruleIds: ["E2S_GRD", "E2S_FCT", "E2S_SPD"], flow: null, branched: false },
    rules: [io("E2S_GRD", [["SET_THK", "DICT"]], ["S_GRD"]), io("E2S_FCT", [["S_GRD", "NONE"]], ["S_FCT"]), io("E2S_SPD", [["S_FCT", "NONE"]], ["S_SPD"])],
    checks: [],
    condIo: {},
    editable: true,
    restorable: false,
    cases: [],
  };
}

const pressed = (id: string) => byTestId(id).getAttribute("aria-pressed");
const edgeEl = (id: string) => q(`rf__edge-${id}`);

async function key(el: Element, init: KeyboardEventInit): Promise<KeyboardEvent> {
  const ev = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  await act(async () => {
    el.dispatchEvent(ev);
  });
  await flush();
  return ev;
}

/** 캔버스 틀에 드롭 — dataTransfer·좌표는 이벤트 속성으로 준다(happy-dom 은 DragEvent 를 만들지 않는다). */
async function drop(data: Record<string, string>, x: number, y: number) {
  const ev = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperties(ev, {
    dataTransfer: { value: { types: Object.keys(data), getData: (t: string) => data[t] ?? "" } },
    clientX: { value: x },
    clientY: { value: y },
  });
  await act(async () => {
    byTestId("flow-canvas").dispatchEvent(ev);
  });
  await flush();
}

describe("룰 세트 편집 이음새(3단계 Task 0)", () => {
  beforeEach(() => {
    installServer();
    localStorage.clear();
    mocks.openRuleEdit.mockReset();
    mocks.openMdmPage.mockReset();
  });
  afterEach(() => {
    uninstallServer();
  });

  it("1. 세트를 열면 모드 단추 셋이 있고 보기 모드이며, 왼쪽 룰 패널에 팔레트가 없다", async () => {
    await openSet("E2S_CHAIN", chainView());
    for (const id of ["flow-mode-view", "flow-mode-edit", "flow-mode-debug"]) expect(q(id), id).not.toBeNull();
    expect(pressed("flow-mode-view")).toBe("true");
    expect(pressed("flow-mode-debug")).toBe("false");
    expect(byTestId("flow-canvas").getAttribute("data-mode")).toBe("view");
    expect(q("flow-rule-panel")).not.toBeNull();
    expect(q("flow-palette")).toBeNull();
    await click("flow-mode-edit");
    expect(byTestId("flow-rule-panel").querySelector('[data-testid="flow-palette"]')).not.toBeNull();
  });

  it("2. [디버그] — 왼쪽 입력·오른쪽 변수·툴바 아래 디버그 줄·아래 탭 셋, [변수 흐름] 켜짐. [보기] 로 오면 들어가기 전 값", async () => {
    await openSet("E2S_CHAIN", chainView());
    expect(pressed("flow-var-toggle")).toBe("false");
    await click("flow-mode-debug");
    expect(pressed("flow-mode-debug")).toBe("true");
    expect(byTestId("flow-canvas").getAttribute("data-mode")).toBe("debug");
    expect(q("dbg-inputs")).not.toBeNull();
    expect(q("flow-rule-panel")).toBeNull();
    expect(q("var-panel")).not.toBeNull();
    expect(q("dbg-toolbar")).not.toBeNull();
    for (const id of ["flow-tab-values", "flow-tab-compare", "flow-tab-checks"]) expect(q(id), id).not.toBeNull();
    expect(q("flow-tab-sim")).toBeNull();
    expect(byTestId("flow-bottom-body").getAttribute("data-tab")).toBe("values");
    expect(pressed("flow-var-toggle")).toBe("true");

    await click("flow-mode-view");
    expect(pressed("flow-var-toggle")).toBe("false");
    expect(q("dbg-toolbar")).toBeNull();
    expect(q("flow-tab-sim")).toBeNull();
    expect(byTestId("flow-bottom-body").getAttribute("data-tab")).toBe("checks");

    // 켜 둔 채 들어갔다 나오면 켜진 채로 돌아온다.
    await click("flow-var-toggle");
    await click("flow-mode-debug");
    await click("flow-mode-view");
    expect(pressed("flow-var-toggle")).toBe("true");
  });

  it("3. 편집 모드에서만 선에 [+] 가 있고, [+] 는 끼우기 메뉴를 연다(편집 메뉴, Task 8). 빈 곳 우클릭은 [화면 맞춤] 을 포함한 메뉴", async () => {
    await openSet("E2S_CHAIN", chainView());
    expect(q("flow-edge-add-e2")).toBeNull();
    await click("flow-mode-edit");
    expect(q("flow-edge-add-e2")).not.toBeNull();
    expect(byTestId("flow-edge-add-e2").getAttribute("aria-label")).toBe("선에 넣기");
    await click("flow-edge-add-e2");
    expect(q("flow-menu")).not.toBeNull();
    expect(byTestId("flow-menu-item-insert-rule")).not.toBeNull();
    await click("flow-menu-item-insert-rule");
    expect(q("flow-menu")).toBeNull();

    const pane = byTestId("flow-canvas").querySelector(".react-flow__pane")!;
    await act(async () => {
      pane.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 120, clientY: 80 }));
    });
    await flush();
    expect(q("flow-menu")).not.toBeNull();
    expect(visibleText(byTestId("flow-menu-item-fit"))).toBe("화면 맞춤");
    await click("flow-menu-item-fit");
    expect(q("flow-menu")).toBeNull();
  });

  it("4. 캔버스 초점의 Ctrl+Z 는 편집 모드에서 막고(되돌리기 손잡이), 세트명 입력 칸의 Ctrl+Z 는 막지 않는다", async () => {
    await openSet("E2S_CHAIN", chainView());
    const viewUndo = await key(byTestId("flow-canvas"), { key: "z", ctrlKey: true });
    expect(viewUndo.defaultPrevented).toBe(false); // 보기 모드에는 되돌리기 손잡이가 없다
    await click("flow-mode-edit");
    expect(byTestId<HTMLButtonElement>("flow-undo").disabled).toBe(true);
    const canvasUndo = await key(byTestId("flow-canvas"), { key: "z", ctrlKey: true });
    expect(canvasUndo.defaultPrevented).toBe(true);
    const inputUndo = await key(byTestId("set-name"), { key: "z", ctrlKey: true });
    expect(inputUndo.defaultPrevented).toBe(false);
  });

  it("5. 편집 모드에서 선을 고르고 캔버스에 Delete 면 선이 지워지고 dirty 다. 보기 모드 Delete 는 그대로", async () => {
    await openSet("E2S_CHAIN", chainView(), { tabId: "tab-1" });
    expect(edgeEl("e2")).not.toBeNull();
    await act(async () => {
      edgeEl("e2")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
    const viewDel = await key(byTestId("flow-canvas"), { key: "Delete" });
    expect(viewDel.defaultPrevented).toBe(false);
    expect(edgeEl("e2")).not.toBeNull();

    await click("flow-mode-edit");
    await act(async () => {
      edgeEl("e2")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
    const del = await key(byTestId("flow-canvas"), { key: "Delete" });
    expect(del.defaultPrevented).toBe(true);
    expect(edgeEl("e2")).toBeNull();

    // dirty — 다른 세트를 열려 하면 확인을 받는다.
    window.confirm = vi.fn(() => false);
    handoff("E2S_OTHER");
    await act(async () => {
      window.dispatchEvent(new CustomEvent("portal-tab-activated", { detail: { tabId: "tab-1" } }));
    });
    await flush();
    expect(window.confirm).toHaveBeenCalledWith("저장하지 않은 변경이 있습니다. 버리고 이동할까요?");
  });

  it("6. 팔레트 [IF] 를 선에서 먼 빈 곳에 떨어뜨리면 흐름은 그대로이고 '선 위에 놓아야 한다'", async () => {
    await openSet("E2S_CHAIN", chainView());
    await click("flow-mode-edit");
    const before = canvasNodeIds().sort();
    await drop({ [PALETTE_MIME]: "if" }, 50000, 50000);
    expect(canvasNodeIds().sort()).toEqual(before);
    expect(visibleText(byTestId("set-message"))).toContain("선 위에 놓아야 한다");
    expect(byTestId<HTMLButtonElement>("set-save").disabled).toBe(true);
  });

  it("8. 메뉴 단추에 초점이 있을 때 Delete 는 고른 선을 지우지 않고, Esc 는 메뉴만 닫는다(F27)", async () => {
    await openSet("E2S_CHAIN", chainView());
    await click("flow-mode-edit");
    await act(async () => {
      edgeEl("e2")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
    expect(edgeEl("e2")!.classList.contains("selected")).toBe(true);
    const pane = byTestId("flow-canvas").querySelector(".react-flow__pane")!;
    await act(async () => {
      pane.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 120, clientY: 80 }));
    });
    await flush();
    const item = byTestId("flow-menu-item-fit");
    item.focus();
    const del = await key(item, { key: "Delete" });
    expect(del.defaultPrevented).toBe(false);
    expect(edgeEl("e2")).not.toBeNull();
    expect(q("flow-menu")).not.toBeNull();
    await key(item, { key: "Escape" });
    expect(q("flow-menu")).toBeNull();
    expect(edgeEl("e2")!.classList.contains("selected")).toBe(true); // 선택은 그대로
  });

  it("고침 1 — 실행 권한이 없으면 디버그 모드 캔버스 F10·F5 가 execute 를 부르지 않고 막지도 않는다", async () => {
    srv.rbacRows = ["search", "view", "save", "delete", "restore", "validate"].map((action) => ({ objId: "ruleSetEdit", action, endpoint: "*", httpMethod: "*" }));
    await openSet("E2S_CHAIN", chainView());
    await click("flow-mode-debug");
    expect(byTestId("dbg-toolbar").getAttribute("data-can-run")).toBe("false");
    const f10 = await key(byTestId("flow-canvas"), { key: "F10" });
    const f5 = await key(byTestId("flow-canvas"), { key: "F5" });
    await settle(50);
    expect(f10.defaultPrevented).toBe(false);
    expect(f5.defaultPrevented).toBe(false);
    expect(calls("execute")).toHaveLength(0);
  });

  it("고침 1 — 실행 권한이 있으면 디버그 모드 캔버스 F10 이 실행한다", async () => {
    await openSet("E2S_CHAIN", chainView());
    await click("flow-mode-debug");
    const f10 = await key(byTestId("flow-canvas"), { key: "F10" });
    await settle(50);
    expect(f10.defaultPrevented).toBe(true);
    expect(calls("execute")).toHaveLength(1);
  });

  it("고침 2 — 디버그 툴바는 흐름 노드를 골랐을 때만 selectedId 를 받는다(메모·그룹은 null)", async () => {
    const base = toEditFlow(null, ["E2S_GRD", "E2S_FCT", "E2S_SPD"]);
    const withNote = addNote(base, { x: 600, y: 20 }, null).flow;
    const noteId = withNote.view.notes[0].id;
    const v = chainView();
    await openSet("E2S_CHAIN", { ...v, set: { ...v.set, flow: withNote } });
    await click("flow-mode-debug");
    await click(`flow-note-${noteId}`);
    expect(byTestId("dbg-toolbar").getAttribute("data-selected")).toBe("");
    await click("flow-node-r1");
    expect(byTestId("dbg-toolbar").getAttribute("data-selected")).toBe("r1");
  });

  it("7. [미니맵] 을 끄면 미니맵이 사라지고 localStorage 에 false 가 남는다", async () => {
    await openSet("E2S_CHAIN", chainView());
    expect(pressed("flow-minimap-toggle")).toBe("true");
    expect(byTestId("flow-canvas").querySelector(".react-flow__minimap")).not.toBeNull();
    await click("flow-minimap-toggle");
    expect(pressed("flow-minimap-toggle")).toBe("false");
    expect(byTestId("flow-canvas").querySelector(".react-flow__minimap")).toBeNull();
    expect(localStorage.getItem("rsf:minimap")).toBe("false");
  });

  it("미니맵을 끈 값은 다시 열어도 남는다", async () => {
    localStorage.setItem("rsf:minimap", "false");
    await openSet("E2S_CHAIN", chainView());
    expect(pressed("flow-minimap-toggle")).toBe("false");
    expect(byTestId("flow-canvas").querySelector(".react-flow__minimap")).toBeNull();
  });

  it("저장 뒤 다시 불러오기는 편집 모드를 두고, 폐기로 편집할 수 없게 되면 보기로 내린다(P1)", async () => {
    await openSet("E2S_CHAIN", chainView());
    await click("flow-mode-edit");
    await typeInto(byTestId<HTMLInputElement>("set-name"), "사슬(수정)");
    srv.replies.save = { meta: { success: true }, data: { result: { setId: "E2S_CHAIN", rowVersion: 4, checks: [] } } };
    srv.views.E2S_CHAIN = { ...chainView(), set: { ...chainView().set, setName: "사슬(수정)", rowVersion: 4 } };
    await click("set-save");
    expect(byTestId("flow-canvas").getAttribute("data-mode")).toBe("edit");

    srv.replies.delete = { meta: { success: true }, data: { result: { setId: "E2S_CHAIN", status: "DEPRECATED", rowVersion: 5, checks: [] } } };
    srv.views.E2S_CHAIN = { ...chainView(), set: { ...chainView().set, status: "DEPRECATED", rowVersion: 5 }, editable: false, restorable: true };
    await click("set-deprecate");
    await click("set-deprecate-confirm");
    expect(byTestId("flow-canvas").getAttribute("data-mode")).toBe("view");
    expect(pressed("flow-mode-view")).toBe("true");
  });
});

describe("FlowCanvas [+] 단추(3단계 Task 0)", () => {
  it("[+] 를 누르면 onContextMenu 를 {kind:edge, via:plus} 와 단추 화면 좌표로 부른다", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const noop = () => {};
    const onContextMenu = vi.fn();
    const onSelectEdge = vi.fn();
    const props: FlowCanvasProps = {
      flow: toEditFlow(null, ["R_A"]), rules: {}, checks: [], mode: "edit", varDisplay: "off", selectedId: null, selectedEdgeId: null,
      overlay: null, focusId: null, focusSeq: 0, breakpoints: new Set(), collapsed: new Set(), showMiniMap: false, editingCondEdgeId: null,
      onSelect: noop, onSelectEdge, onOpenRule: noop, onMove: noop, onMoveNode: noop, onConnect: noop, onDropPalette: noop, onDropRule: noop,
      onNoteChange: noop, onContextMenu, onEditCond: noop, onEditCondClose: noop, onToggleBreakpoint: noop,
    };
    await act(async () => {
      root.render(createElement(DmesUiProvider, null, createElement(FlowCanvas, props)));
    });
    const btn = host.querySelector('[data-testid="flow-edge-add-e2"]')!;
    expect(btn).not.toBeNull();
    await act(async () => {
      btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onContextMenu).toHaveBeenCalledWith({ kind: "edge", edgeId: "e2", via: "plus" }, { x: expect.any(Number), y: expect.any(Number) });
    expect(onSelectEdge).not.toHaveBeenCalled();
    act(() => root.unmount());
    host.remove();
  });
});

describe("useRuleSetEdit 3단계 서명(Task 0)", () => {
  let state: RuleSetEditState | null = null;
  const Probe = () => {
    state = useRuleSetEdit();
    return null;
  };

  beforeEach(() => {
    installServer();
  });
  afterEach(() => {
    uninstallServer();
  });

  it("viewEpoch 는 열기·[다시 불러오기] 때만 오르고 저장 뒤 다시 불러오기에서는 그대로다. 모드·이력 서명이 있다", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(createElement(DmesUiProvider, null, createElement(Probe)));
    });
    srv.views.E2S_CHAIN = chainView();
    const e0 = state!.viewEpoch;
    await act(async () => {
      await state!.open("E2S_CHAIN");
    });
    expect(state!.viewEpoch).toBe(e0 + 1);
    expect(state!.mode).toBe("view");
    expect(state!.canUndo).toBe(false);
    expect(state!.canRedo).toBe(false);

    await act(async () => {
      state!.setMode("edit");
      state!.setSetName("사슬(수정)");
    });
    srv.replies.save = ok({ setId: "E2S_CHAIN", rowVersion: 4, checks: [] });
    await act(async () => {
      await state!.save();
    });
    await settle(0);
    expect(state!.viewEpoch).toBe(e0 + 1); // 자기 쓰기 뒤 다시 불러오기는 올리지 않는다
    expect(state!.mode).toBe("edit");

    await act(async () => {
      await state!.reload();
    });
    expect(state!.viewEpoch).toBe(e0 + 2);
    expect(state!.mode).toBe("view");
    act(() => root.unmount());
    host.remove();
  });
});
