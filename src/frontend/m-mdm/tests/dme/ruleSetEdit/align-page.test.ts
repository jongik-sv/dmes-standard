/** @vitest-environment happy-dom */

// A1 — 화면(page)에서 정렬·간격·화살표 옮기기: 단축키 → 편집 한 번 → 되돌리기 한 칸, 우클릭 「정렬」 메뉴.
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

import { addNote, setPositions, toEditFlow, type EditFlow, type FlowPos } from "../../../pages/dme/ruleSetEdit/flow-edit";
import type { RuleIo, RuleSetView } from "../../../pages/dme/ruleSetEdit/types";
import { flush, installDomStorage } from "../helpers/render";
import { byTestId, click, installServer, openSet, q, uninstallServer } from "../helpers/rule-set-page";

const ioName = (n: string) => ({ name: n, source: "DICT" as const, label: null, dataType: null, scale: null, dateString: false, maruCodeId: null });
const rule = (ruleId: string, cond: string, result: string): RuleIo => ({
  ruleId, ruleName: `${ruleId} 이름`, ruleKind: "DECISION", status: "INUSE", exists: true, releasedVer: "1.000", hitPolicy: "FIRST",
  conds: [ioName(cond)], results: [{ ...ioName(result), source: null }],
});
const RULES = [rule("AL_A", "IN_A", "OUT_A"), rule("AL_B", "OUT_A", "OUT_B"), rule("AL_C", "OUT_B", "OUT_C")];
/** start → r1 → r2 → r3 → end. r1(0,0) r2(300,200) r3(120,500) 로 흩어 둔다. */
function scattered(): EditFlow {
  return setPositions(toEditFlow(null, ["AL_A", "AL_B", "AL_C"]), { r1: { x: 0, y: 0 }, r2: { x: 300, y: 200 }, r3: { x: 120, y: 500 } });
}
function viewOf(setId: string, flow: EditFlow): RuleSetView {
  return {
    set: { setId, setName: "이름", description: null, status: "INUSE", rowVersion: 1, ruleIds: RULES.map((r) => r.ruleId), flow, branched: false },
    rules: RULES, checks: [], condIo: {}, editable: true, restorable: false, cases: [],
  };
}
const nodeEl = (id: string) => document.querySelector(`.react-flow__node[data-id="${id}"]`) as HTMLElement;
const at = (id: string): FlowPos => {
  const m = /translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(nodeEl(id).style.transform)!;
  return { x: Math.round(Number(m[1])), y: Math.round(Number(m[2])) };
};
const canvas = () => byTestId("flow-canvas");
async function key(el: Element, init: KeyboardEventInit): Promise<KeyboardEvent> {
  const ev = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  await act(async () => {
    el.dispatchEvent(ev);
  });
  await flush();
  return ev;
}
const shift = (type: "keydown" | "keyup") =>
  act(async () => {
    document.dispatchEvent(new KeyboardEvent(type, { key: "Shift", bubbles: true }));
  });
/** 첫 노드를 누르고 Shift 를 누른 채 나머지를 눌러 여럿 고른다. */
const tid = (id: string) => (id.startsWith("n") ? `flow-note-${id}` : `flow-node-${id}`);
async function pick(...ids: string[]) {
  await click(tid(ids[0]));
  await shift("keydown");
  for (const id of ids.slice(1)) await click(tid(id));
  await shift("keyup");
  await act(async () => canvas().focus());
}
const undoDisabled = () => (byTestId("flow-undo") as HTMLButtonElement).disabled;
const menuIds = () =>
  Array.from(document.querySelectorAll('[data-testid^="flow-menu-item-"]')).map((e) => e.getAttribute("data-testid")!.slice("flow-menu-item-".length));

describe("화면 — 정렬·간격·화살표 옮기기(A1)", () => {
  beforeEach(() => {
    installDomStorage();
    installServer();
    localStorage.clear();
  });
  afterEach(() => uninstallServer());

  it("Alt+A(Mac 에서 e.key 가 'å')는 e.code 로 판정해 왼쪽 맞춤 — 편집 한 번, 되돌리기 한 칸", async () => {
    await openSet("AL_1", viewOf("AL_1", scattered()));
    await click("flow-mode-edit");
    await pick("r1", "r2", "r3");
    const before = { r1: at("r1"), r2: at("r2"), r3: at("r3") };
    expect(before.r2).toEqual({ x: 300, y: 200 });
    const ev = await key(canvas(), { key: "å", code: "KeyA", altKey: true });
    expect(ev.defaultPrevented).toBe(true);
    expect(at("r1")).toEqual({ x: 0, y: 0 });
    expect(at("r2")).toEqual({ x: 0, y: 200 });
    expect(at("r3")).toEqual({ x: 0, y: 500 });
    await click("flow-undo");
    expect(at("r2")).toEqual(before.r2);
    expect(at("r3")).toEqual(before.r3);
    expect(undoDisabled()).toBe(true); // 한 칸
  });

  it("Alt+Shift+V 세로 간격 고르게 — 양 끝(r1·r3)은 그대로, 가운데 r2 만 옮긴다", async () => {
    await openSet("AL_2", viewOf("AL_2", scattered()));
    await click("flow-mode-edit");
    await pick("r1", "r2", "r3");
    await key(canvas(), { key: "◊", code: "KeyV", altKey: true, shiftKey: true });
    expect(at("r1")).toEqual({ x: 0, y: 0 });
    expect(at("r3")).toEqual({ x: 120, y: 500 });
    expect(at("r2")).toEqual({ x: 300, y: 250 }); // 간격 (568 - 3*68) / 2 = 182 → 68 + 182
  });

  it("하나만 골랐으면 정렬 키는 아무것도 바꾸지 않는다(이력 없음)", async () => {
    await openSet("AL_3", viewOf("AL_3", scattered()));
    await click("flow-mode-edit");
    await click("flow-node-r2");
    await act(async () => canvas().focus());
    const ev = await key(canvas(), { key: "å", code: "KeyA", altKey: true });
    expect(at("r2")).toEqual({ x: 300, y: 200 });
    expect(undoDisabled()).toBe(true);
    expect(ev.defaultPrevented).toBe(false); // 키를 쓰지 않아 브라우저 단축키(Alt+D 등)를 막지 않는다
  });

  it("고른 것이 2개뿐이면 간격 키도, 아무것도 안 골랐으면 정렬 키도 preventDefault 하지 않는다. 이미 맞아 있어도 마찬가지", async () => {
    await openSet("AL_3B", viewOf("AL_3B", scattered()));
    await click("flow-mode-edit");
    await act(async () => canvas().focus());
    expect((await key(canvas(), { key: "∂", code: "KeyD", altKey: true })).defaultPrevented).toBe(false); // 선택 없음
    // 테스트 도구는 keyup 을 보내지 않으므로 직접 보낸다(React Flow 가 눌린 키를 기억한다).
    await act(async () => document.dispatchEvent(new KeyboardEvent("keyup", { key: "∂", code: "KeyD", altKey: true, bubbles: true })));
    await pick("r1", "r2");
    expect((await key(canvas(), { key: "˙", code: "KeyH", altKey: true, shiftKey: true })).defaultPrevented).toBe(false); // 간격은 3개 이상
    await act(async () => document.dispatchEvent(new KeyboardEvent("keyup", { key: "˙", code: "KeyH", altKey: true, shiftKey: true, bubbles: true })));
    expect((await key(canvas(), { key: "å", code: "KeyA", altKey: true })).defaultPrevented).toBe(true);
    expect((await key(canvas(), { key: "å", code: "KeyA", altKey: true })).defaultPrevented).toBe(false); // 이미 맞음
    expect(undoDisabled()).toBe(false);
  });

  // 16개 핸들러를 하나씩 — 방향·크기·축 오타를 잡는다. r1(0,0) r2(300,200) r3(120,500), 크기 232×68.
  const all3 = { r1: { x: 0, y: 0 }, r2: { x: 300, y: 200 }, r3: { x: 120, y: 500 } };
  const aligned: [string, string, boolean, Record<string, FlowPos>][] = [
    ["alignLeft", "KeyA", false, { r1: { x: 0, y: 0 }, r2: { x: 0, y: 200 }, r3: { x: 0, y: 500 } }],
    ["alignRight", "KeyD", false, { r1: { x: 300, y: 0 }, r2: { x: 300, y: 200 }, r3: { x: 300, y: 500 } }],
    ["alignTop", "KeyW", false, { r1: { x: 0, y: 0 }, r2: { x: 300, y: 0 }, r3: { x: 120, y: 0 } }],
    ["alignBottom", "KeyS", false, { r1: { x: 0, y: 500 }, r2: { x: 300, y: 500 }, r3: { x: 120, y: 500 } }],
    ["alignHCenter", "KeyH", false, { r1: { x: 150, y: 0 }, r2: { x: 150, y: 200 }, r3: { x: 150, y: 500 } }],
    ["alignVCenter", "KeyV", false, { r1: { x: 0, y: 250 }, r2: { x: 300, y: 250 }, r3: { x: 120, y: 250 } }],
    ["distributeH", "KeyH", true, { r1: { x: 0, y: 0 }, r2: { x: 300, y: 200 }, r3: { x: 150, y: 500 } }],
    ["distributeV", "KeyV", true, { r1: { x: 0, y: 0 }, r2: { x: 300, y: 250 }, r3: { x: 120, y: 500 } }],
  ];
  it.each(aligned)("%s (%s, shift=%s)", async (_id, code, shiftKey, expected) => {
    await openSet(`AL_T_${_id}`, viewOf(`AL_T_${_id}`, scattered()));
    await click("flow-mode-edit");
    await pick("r1", "r2", "r3");
    expect((await key(canvas(), { key: "†", code, altKey: true, shiftKey })).defaultPrevented).toBe(true);
    for (const [id, p] of Object.entries(expected)) expect(at(id), `${_id} ${id}`).toEqual(p);
    await click("flow-undo");
    for (const [id, p] of Object.entries(all3)) expect(at(id), `undo ${id}`).toEqual(p);
    expect(undoDisabled()).toBe(true);
  });

  const nudges: [string, KeyboardEventInit, FlowPos][] = [
    ["nudgeLeft", { key: "ArrowLeft" }, { x: 299, y: 200 }],
    ["nudgeRight", { key: "ArrowRight" }, { x: 301, y: 200 }],
    ["nudgeUp", { key: "ArrowUp" }, { x: 300, y: 199 }],
    ["nudgeDown", { key: "ArrowDown" }, { x: 300, y: 201 }],
    ["nudgeLeftBig", { key: "ArrowLeft", shiftKey: true }, { x: 290, y: 200 }],
    ["nudgeRightBig", { key: "ArrowRight", shiftKey: true }, { x: 310, y: 200 }],
    ["nudgeUpBig", { key: "ArrowUp", shiftKey: true }, { x: 300, y: 190 }],
    ["nudgeDownBig", { key: "ArrowDown", shiftKey: true }, { x: 300, y: 210 }],
  ];
  it.each(nudges)("%s", async (id, init, expected) => {
    await openSet(`AL_N_${id}`, viewOf(`AL_N_${id}`, scattered()));
    await click("flow-mode-edit");
    await click("flow-node-r2");
    await act(async () => canvas().focus());
    await key(canvas(), init);
    expect(at("r2")).toEqual(expected);
  });

  it("자동 배치 세로 사슬(저장 위치 없음)에서 Alt+W — 고른 모두의 y 가 같고 기준 노드가 겹침 해소로 밀리지 않는다", async () => {
    await openSet("AL_CHAIN", viewOf("AL_CHAIN", toEditFlow(null, ["AL_A", "AL_B", "AL_C"])));
    await click("flow-mode-edit");
    await pick("r1", "r2", "r3");
    const x1 = at("r1").x;
    await key(canvas(), { key: "∑", code: "KeyW", altKey: true });
    const ys = ["r1", "r2", "r3"].map((id) => at(id).y);
    expect(new Set(ys).size).toBe(1);
    expect(at("r1").x).toBe(x1);
  });

  it("화살표 1px·Shift+화살표 10px. 연속 입력은 한 칸으로 합쳐 되돌리기 한 번에 돌아간다", async () => {
    await openSet("AL_4", viewOf("AL_4", scattered()));
    await click("flow-mode-edit");
    await click("flow-node-r2");
    await act(async () => canvas().focus());
    const ev = await key(canvas(), { key: "ArrowRight" });
    expect(ev.defaultPrevented).toBe(true);
    expect(at("r2")).toEqual({ x: 301, y: 200 });
    await key(canvas(), { key: "ArrowDown", shiftKey: true });
    expect(at("r2")).toEqual({ x: 301, y: 210 });
    await key(canvas(), { key: "ArrowLeft" });
    await key(canvas(), { key: "ArrowUp" });
    expect(at("r2")).toEqual({ x: 300, y: 209 });
    await click("flow-undo");
    expect(at("r2")).toEqual({ x: 300, y: 200 }); // 1초 안 연속 입력 = 한 칸
    expect(undoDisabled()).toBe(true);
  });

  it("여럿을 고르면 모두 같이 움직인다", async () => {
    await openSet("AL_5", viewOf("AL_5", scattered()));
    await click("flow-mode-edit");
    await pick("r1", "r3");
    await key(canvas(), { key: "ArrowLeft", shiftKey: true });
    expect(at("r1")).toEqual({ x: -10, y: 0 });
    expect(at("r3")).toEqual({ x: 110, y: 500 });
    expect(at("r2")).toEqual({ x: 300, y: 200 });
  });

  it("선택이 없으면 화살표는 아무 일 없고 preventDefault 도 하지 않는다", async () => {
    await openSet("AL_6", viewOf("AL_6", scattered()));
    await click("flow-mode-edit");
    await act(async () => canvas().focus());
    const ev = await key(canvas(), { key: "ArrowRight" });
    expect(ev.defaultPrevented).toBe(false);
    expect(undoDisabled()).toBe(true);
  });

  it("입력 칸에서는 화살표·정렬 키를 무시한다", async () => {
    await openSet("AL_7", viewOf("AL_7", scattered()));
    await click("flow-mode-edit");
    await click("flow-node-r2");
    const input = document.createElement("input");
    canvas().appendChild(input);
    const a = await key(input, { key: "ArrowRight" });
    const b = await key(input, { key: "å", code: "KeyA", altKey: true });
    expect(a.defaultPrevented || b.defaultPrevented).toBe(false);
    expect(at("r2")).toEqual({ x: 300, y: 200 });
    input.remove();
  });

  it("보기 모드에서는 키가 아무 일도 하지 않는다", async () => {
    await openSet("AL_8", viewOf("AL_8", scattered()));
    await act(async () => canvas().focus());
    const ev = await key(canvas(), { key: "ArrowRight" });
    expect(ev.defaultPrevented).toBe(false);
  });

  it("메모도 함께 맞춘다 — 메모 위치는 view.notes", async () => {
    const n = addNote(scattered(), { x: 700, y: 300 }, null);
    await openSet("AL_9", viewOf("AL_9", n.flow));
    await click("flow-mode-edit");
    await pick("r1", n.id);
    await key(canvas(), { key: "å", code: "KeyA", altKey: true });
    expect(at(n.id)).toEqual({ x: 0, y: 300 });
    expect(at("r1")).toEqual({ x: 0, y: 0 });
  });

  it("고른 노드를 우클릭하면 「정렬」 묶음이 뜨고, 항목을 누르면 편집 한 번(간격은 3개 미만이면 꺼짐)", async () => {
    await openSet("AL_10", viewOf("AL_10", scattered()));
    await click("flow-mode-edit");
    await pick("r1", "r2");
    await act(async () => {
      byTestId("flow-node-r1").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 50, clientY: 50 }));
    });
    await flush();
    expect(menuIds()).toEqual(expect.arrayContaining([
      "align", "align-left", "align-hcenter", "align-right", "align-top", "align-vcenter", "align-bottom", "distribute-h", "distribute-v",
    ]));
    expect((document.querySelector('[data-testid="flow-menu-item-distribute-h"]') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => {
      (document.querySelector('[data-testid="flow-menu-item-align-left"]') as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
    expect(at("r2")).toEqual({ x: 0, y: 200 });
    await click("flow-undo");
    expect(at("r2")).toEqual({ x: 300, y: 200 });
    expect(undoDisabled()).toBe(true);
  });

  it("하나만 고른 노드를 우클릭하면 정렬 묶음이 없다", async () => {
    await openSet("AL_11", viewOf("AL_11", scattered()));
    await click("flow-mode-edit");
    await click("flow-node-r1");
    await act(async () => {
      byTestId("flow-node-r1").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 50, clientY: 50 }));
    });
    await flush();
    expect(q("flow-menu")).not.toBeNull();
    expect(menuIds()).not.toContain("align");
  });
});
