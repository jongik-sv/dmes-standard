/** @vitest-environment happy-dom */

// 외관 옵션(S1) Task 4 — 화면에서 손잡이: 하나만 고른 노드에만, 놓을 때 편집 한 번(되돌리기 한 칸).
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

import { setPositions, toEditFlow, type EditFlow } from "../../../pages/dme/ruleSetEdit/flow-edit";
import type { RuleIo, RuleSetView } from "../../../pages/dme/ruleSetEdit/types";
import { flush, installDomStorage } from "../helpers/render";
import { byTestId, calls, click, installServer, openSet, uninstallServer } from "../helpers/rule-set-page";

const io = (ruleId: string): RuleIo => ({
  ruleId, ruleName: `${ruleId} 이름`, ruleKind: "DECISION", status: "INUSE", exists: true, releasedVer: "1.000", hitPolicy: "FIRST", conds: [], results: [],
});
const flow = (): EditFlow => setPositions(toEditFlow(null, ["NS_A", "NS_B"]), { r1: { x: 0, y: 100 }, r2: { x: 0, y: 300 } });
function viewOf(setId: string): RuleSetView {
  return {
    set: { setId, setName: "손잡이", description: null, status: "INUSE", rowVersion: 1, ruleIds: ["NS_A", "NS_B"], flow: flow(), branched: false },
    rules: [io("NS_A"), io("NS_B")], checks: [], condIo: {}, editable: true, restorable: false, cases: [],
  } as RuleSetView;
}
const shift = (type: "keydown" | "keyup") =>
  act(async () => {
    document.dispatchEvent(new KeyboardEvent(type, { key: "Shift", bubbles: true }));
  });
const fire = async (el: Element | Window, type: string, init: MouseEventInit = {}) =>
  act(async () => { el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init })); });
const grips = (id: string) => document.querySelectorAll(`[data-testid^="flow-node-grip-${id}-"]`).length;
const width = (id: string) => parseFloat((document.querySelector(`.react-flow__node[data-id="${id}"]`) as HTMLElement).style.width);
/** r1 의 오른쪽 변 손잡이를 화면 100px 끈다. */
async function dragE() {
  await fire(byTestId("flow-node-grip-r1-e"), "pointerdown", { clientX: 0, clientY: 0, button: 0 });
  await fire(window, "pointermove", { clientX: 100, clientY: 0, buttons: 1 });
  await fire(window, "pointerup", { clientX: 100, clientY: 0 });
  await flush();
}

describe("화면 — 노드 크기 손잡이", () => {
  beforeEach(() => {
    installDomStorage();
    installServer();
    localStorage.clear();
  });
  afterEach(() => uninstallServer());

  it("하나만 고른 노드에만 뜨고, 여럿 고르면 사라진다(계획 Ruling 17)", async () => {
    await openSet("NZ_1", viewOf("NZ_1"));
    await click("flow-mode-edit");
    await click("flow-node-r1");
    expect(grips("r1")).toBe(3);
    await shift("keydown");
    await click("flow-node-r2");
    await shift("keyup");
    expect(grips("r1")).toBe(0);
    expect(grips("r2")).toBe(0);
  });

  it("놓으면 편집 한 번 — 되돌리기 한 번에 제 크기로 돌아간다", async () => {
    await openSet("NZ_2", viewOf("NZ_2"));
    await click("flow-mode-edit");
    await click("flow-node-r1");
    await dragE();
    expect(width("r1")).toBeGreaterThan(232);
    await click("flow-undo");
    expect((byTestId("flow-undo") as HTMLButtonElement).disabled).toBe(true);
    expect(width("r1")).toBe(232);
  });

  it("저장 JSON 에 크기와 그린 위치 전부가 실린다(S-D6)", async () => {
    await openSet("NZ_3", viewOf("NZ_3"));
    await click("flow-mode-edit");
    await click("flow-node-r1");
    await dragE();
    await click("set-save");
    const saved = JSON.parse(String((calls("save").at(-1)!.body.params as Record<string, unknown>).flowJson)) as EditFlow;
    expect(saved.view.styles?.r1?.w).toBeGreaterThan(232);
    expect(Object.keys(saved.view.positions).sort()).toEqual(["end", "r1", "r2", "start"]);
  });
});
