/** @vitest-environment happy-dom */

// 4단계 Task 7(P1) — 떠 있는 도구 상자(아이콘·툴팁·aria-label), 도구 모드([손]·[영역 선택]·[공간]·Esc), 왼쪽 분할 칸 없애기, 미니맵 자리.
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ openRuleEdit: vi.fn(), openMdmPage: vi.fn(), rfProps: [] as Record<string, unknown>[] }));
vi.mock("@/dme/rule-handoff", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/dme/rule-handoff")>()),
  openRuleEdit: (...args: unknown[]) => mocks.openRuleEdit(...args),
}));
vi.mock("@/shell", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shell")>()),
  openMdmPage: (...args: unknown[]) => mocks.openMdmPage(...args),
}));
// React Flow 에 넘긴 props 를 적어 둔다(그리기는 진짜 ReactFlow 가 한다) — space-canvas.test.ts 와 같은 방식.
vi.mock("../../../pages/dme/ruleSetEdit/canvas/react-flow", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../pages/dme/ruleSetEdit/canvas/react-flow")>();
  const Spy = (p: Record<string, unknown>) => {
    mocks.rfProps.push(p);
    return createElement(real.ReactFlow as never, p as never);
  };
  return { ...real, ReactFlow: Spy };
});

import { FlowToolbox, defaultTool, type CanvasTool } from "../../../pages/dme/ruleSetEdit/canvas/FlowToolbox";
import { PALETTE_MIME } from "../../../pages/dme/ruleSetEdit/canvas/FlowCanvas";
import { SHORTCUT_HELP } from "../../../pages/dme/ruleSetEdit/canvas/shortcuts";
import type { FlowMode } from "../../../pages/dme/ruleSetEdit/state/useRuleSetEdit";
import type { RuleIo, RuleSetView } from "../../../pages/dme/ruleSetEdit/types";
import { flush, installDomStorage } from "../helpers/render";
import { byTestId, click, installServer, openSet, q, uninstallServer } from "../helpers/rule-set-page";

const io = (ruleId: string): RuleIo => ({
  ruleId, ruleName: `${ruleId} 이름`, ruleKind: "DECISION", status: "INUSE", exists: true, releasedVer: 1, hitPolicy: "FIRST", conds: [], results: [],
});
function viewOf(setId: string): RuleSetView {
  return {
    set: { setId, setName: "도구 세트", description: null, status: "INUSE", rowVersion: 1, ruleIds: ["TB_A", "TB_B"], flow: null, branched: false },
    rules: [io("TB_A"), io("TB_B")], checks: [], condIo: {}, editable: true, restorable: false, cases: [],
  } as RuleSetView;
}
const NAMES: Record<string, string> = {
  "flow-tool-hand": "손", "flow-tool-select": "영역 선택", "flow-space-tool": "공간",
  "flow-add-rule": "룰", "flow-add-if": "IF 분기", "flow-add-par": "병렬 분기", "flow-add-note": "메모", "flow-add-group": "그룹",
};
const lastRf = () => mocks.rfProps[mocks.rfProps.length - 1];
const pressed = (id: string) => byTestId(id).getAttribute("aria-pressed");
async function esc() {
  const canvas = byTestId("flow-canvas");
  await act(async () => {
    canvas.focus();
  });
  await act(async () => {
    canvas.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  });
  await flush();
}

describe("도구 상자(단위)", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    installDomStorage();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });
  const draw = (mode: FlowMode, tool: CanvasTool, onTool = vi.fn(), onPick = vi.fn()) =>
    act(async () => {
      root.render(createElement(DmesUiProvider, null, createElement(FlowToolbox, { mode, tool, onTool, onPick, disabled: false })));
    });
  const inHost = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`);

  it("편집 모드 — 도구 셋·구분선·요소 다섯. 아이콘만 있고 이름은 aria-label 과 오른쪽 툴팁(data-tip)이 같다", async () => {
    await draw("edit", "select");
    for (const [id, name] of Object.entries(NAMES)) {
      const b = inHost(id);
      expect(b, id).not.toBeNull();
      expect(b!.getAttribute("aria-label"), id).toBe(name);
      expect(b!.getAttribute("data-tip"), id).toBe(name);
      expect((b!.textContent ?? "").trim(), id).toBe("");
    }
    const box = inHost("flow-toolbox")!;
    expect(box.getAttribute("role")).toBe("toolbar");
    expect(box.getAttribute("aria-orientation")).toBe("vertical");
    expect(box.querySelector('[role="separator"]')).not.toBeNull();
    expect(inHost("flow-tool-select")!.getAttribute("aria-pressed")).toBe("true");
    expect(inHost("flow-tool-hand")!.getAttribute("aria-pressed")).toBe("false");
    expect(inHost("flow-space-tool")!.getAttribute("aria-pressed")).toBe("false");
  });

  it("보기·디버그 모드 — [손]·[영역 선택] 만 있고 [공간]·요소·구분선이 없다", async () => {
    for (const mode of ["view", "debug"] as const) {
      await draw(mode, "hand");
      expect(inHost("flow-tool-hand"), mode).not.toBeNull();
      expect(inHost("flow-tool-select"), mode).not.toBeNull();
      expect(inHost("flow-space-tool"), mode).toBeNull();
      expect(inHost("flow-palette"), mode).toBeNull();
      expect(inHost("flow-toolbox")!.querySelector('[role="separator"]'), mode).toBeNull();
      expect(inHost("flow-tool-hand")!.getAttribute("aria-pressed"), mode).toBe("true");
    }
  });

  it("도구 누르기는 onTool, 요소 누르기는 onPick, 요소 끌기는 PALETTE_MIME 에 항목을 싣는다", async () => {
    const onTool = vi.fn();
    const onPick = vi.fn();
    await draw("edit", "select", onTool, onPick);
    await act(async () => {
      inHost("flow-tool-hand")!.click();
    });
    expect(onTool).toHaveBeenLastCalledWith("hand");
    await act(async () => {
      inHost("flow-space-tool")!.click();
    });
    expect(onTool).toHaveBeenLastCalledWith("space");
    await act(async () => {
      inHost("flow-add-if")!.click();
    });
    expect(onPick).toHaveBeenLastCalledWith("if");
    const data: Record<string, string> = {};
    const ev = new Event("dragstart", { bubbles: true, cancelable: true });
    Object.defineProperty(ev, "dataTransfer", { value: { setData: (k: string, v: string) => (data[k] = v), effectAllowed: "" } });
    await act(async () => {
      inHost("flow-add-note")!.dispatchEvent(ev);
    });
    expect(data[PALETTE_MIME]).toBe("note");
  });

  it("도구 단추는 mousedown 기본 동작(초점 옮기기)을 막고, 요소 단추는 HTML5 끌기를 살리려고 막지 않는다", async () => {
    await draw("edit", "select");
    const down = (id: string) => {
      const ev = new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 });
      inHost(id)!.dispatchEvent(ev);
      return ev.defaultPrevented;
    };
    expect(down("flow-tool-hand")).toBe(true);
    expect(down("flow-space-tool")).toBe(true);
    expect(down("flow-add-rule")).toBe(false);
  });

  it("defaultTool — 편집은 영역 선택, 보기·디버그는 손(3단계 동작 그대로)", () => {
    expect(defaultTool("edit")).toBe("select");
    expect(defaultTool("view")).toBe("hand");
    expect(defaultTool("debug")).toBe("hand");
  });

  it("도움말 표 — [공간] 은 도구 상자, [손] 끌기 줄이 모든 모드에 있다", () => {
    expect(SHORTCUT_HELP.find((h) => h.id === "spaceDrag")?.label).toContain("도구 상자 [공간]");
    const hand = SHORTCUT_HELP.find((h) => h.id === "handDrag");
    expect(hand?.modes).toEqual(["view", "edit", "debug"]);
  });
});

describe("화면 — 도구 상자·도구 모드·미니맵 자리", () => {
  beforeEach(() => {
    installServer();
    localStorage.clear();
    mocks.rfProps = [];
  });
  afterEach(() => uninstallServer());

  it("왼쪽 분할 칸이 없다 — 도구 상자는 캔버스 감싸개 안, 룰 목록은 오른쪽 패널 아래(임시 자리). 디버그만 왼쪽 입력 패널", async () => {
    await openSet("TB_1", viewOf("TB_1"));
    const host = document.querySelector(".rsf-canvas-host")!;
    expect(host.querySelector('[data-testid="flow-toolbox"]')).not.toBeNull();
    expect(byTestId("flow-props").querySelector('[data-testid="flow-rule-panel"]')).not.toBeNull();
    expect(q("flow-palette")).toBeNull();
    expect(q("dbg-inputs")).toBeNull();
    expect(pressed("flow-tool-hand")).toBe("true");

    await click("flow-mode-edit");
    expect(byTestId("flow-toolbox").querySelector('[data-testid="flow-palette"]')).not.toBeNull();
    expect(byTestId("flow-toolbar").querySelector('[data-testid="flow-space-tool"]')).toBeNull(); // 툴바에서 빠졌다
    expect(pressed("flow-tool-select")).toBe("true");

    await click("flow-mode-debug");
    expect(q("dbg-inputs")).not.toBeNull();
    expect(q("flow-rule-panel")).toBeNull();
    expect(q("flow-space-tool")).toBeNull();
    expect(pressed("flow-tool-hand")).toBe("true");
  });

  it("편집 [손] — 끌기 = 화면 이동(영역 선택 없음), 초점은 캔버스. Esc 는 [영역 선택] 으로만 돌리고 선택은 그대로, 다음 Esc 가 선택을 푼다", async () => {
    await openSet("TB_2", viewOf("TB_2"));
    await click("flow-mode-edit");
    expect(lastRf()).toMatchObject({ selectionOnDrag: true, panOnDrag: [1], panOnScroll: true });
    await click("flow-tool-hand");
    expect(pressed("flow-tool-hand")).toBe("true");
    expect(byTestId("flow-canvas").getAttribute("data-drag-tool")).toBe("hand");
    expect(lastRf()).toMatchObject({ selectionOnDrag: false, panOnDrag: true, panOnScroll: true, selectionKeyCode: "Shift" });
    expect(document.activeElement).toBe(byTestId("flow-canvas"));
    await click("flow-node-r1");
    await esc();
    expect(pressed("flow-tool-select")).toBe("true");
    expect(byTestId("flow-node-r1").getAttribute("data-selected")).toBe("true");
    await esc();
    expect(byTestId("flow-node-r1").getAttribute("data-selected")).toBe("false");
  });

  it("마우스로 요소 아이콘을 누른 뒤에도 초점은 캔버스 — 이어지는 Esc 가 [손] 을 [영역 선택] 으로 돌린다", async () => {
    await openSet("TB_2F", viewOf("TB_2F"));
    await click("flow-mode-edit");
    await click("flow-tool-hand");
    expect(pressed("flow-tool-hand")).toBe("true");
    await act(async () => {
      byTestId("flow-add-if").focus(); // 마우스 누름이 단추에 초점을 옮긴다
    });
    await act(async () => {
      // 마우스 클릭 = detail > 0 (키보드 Enter·Space 는 0)
      byTestId("flow-add-if").dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    });
    await flush();
    expect(document.activeElement).toBe(byTestId("flow-canvas"));
    await act(async () => {
      document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });
    await flush();
    expect(pressed("flow-tool-select")).toBe("true");
  });

  it("보기 [영역 선택] — 끌기 = 영역 선택, 휠은 그대로 확대. Esc 는 보기 기본 [손] 으로", async () => {
    await openSet("TB_3", viewOf("TB_3"));
    expect(lastRf()).toMatchObject({ selectionOnDrag: false, panOnDrag: true, panOnScroll: false });
    await click("flow-tool-select");
    expect(byTestId("flow-canvas").getAttribute("data-drag-tool")).toBe("select");
    expect(lastRf()).toMatchObject({ selectionOnDrag: true, panOnDrag: [1], panOnScroll: false, selectionKeyCode: null });
    await esc();
    expect(pressed("flow-tool-hand")).toBe("true");
  });

  it("모드를 바꾸면 그 모드의 기본 도구로 돌아간다(편집 [손] → 디버그 → 편집 = [영역 선택])", async () => {
    await openSet("TB_4", viewOf("TB_4"));
    await click("flow-mode-edit");
    await click("flow-tool-hand");
    await click("flow-mode-debug");
    expect(pressed("flow-tool-hand")).toBe("true");
    await click("flow-mode-edit");
    expect(pressed("flow-tool-select")).toBe("true");
  });

  it("[공간] 은 한 번 누르면 켜지고 다시 누르면 [영역 선택] 으로 돌아간다. 다른 도구를 고르면 꺼진다", async () => {
    await openSet("TB_5", viewOf("TB_5"));
    await click("flow-mode-edit");
    await click("flow-space-tool");
    expect(pressed("flow-space-tool")).toBe("true");
    expect(byTestId("flow-canvas").getAttribute("data-space-tool")).toBe("true");
    await click("flow-space-tool");
    expect(pressed("flow-tool-select")).toBe("true");
    await click("flow-space-tool");
    await click("flow-tool-hand");
    expect(pressed("flow-space-tool")).toBe("false");
    expect(byTestId("flow-canvas").getAttribute("data-space-tool")).toBeNull();
  });

  it("미니맵은 오른쪽 위, 확대·축소 단추는 오른쪽 아래", async () => {
    await openSet("TB_6", viewOf("TB_6"));
    const mini = byTestId("flow-canvas").querySelector(".react-flow__minimap")!;
    expect([...mini.classList]).toEqual(expect.arrayContaining(["top", "right"]));
    const ctl = byTestId("flow-canvas").querySelector(".react-flow__controls")!;
    expect([...ctl.classList]).toEqual(expect.arrayContaining(["bottom", "right"]));
  });
});
