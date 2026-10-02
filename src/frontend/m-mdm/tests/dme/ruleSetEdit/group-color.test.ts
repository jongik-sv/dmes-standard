/** @vitest-environment happy-dom */

// 그룹 색 — 노드 색(C1·C4)과 같은 6색·같은 「색상」 격자를 그룹 우클릭에도 둔다. FlowGroup.color 코덱·연산, 메뉴 제공자, 그리기 CSS, 화면.
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

import { buildMenu, type CanvasActions, type MenuContext, type MenuItem } from "../../../pages/dme/ruleSetEdit/canvas/context-menu";
import { MENU_PROVIDERS } from "../../../pages/dme/ruleSetEdit/canvas/menus";
import {
  addGroup, flowJsonOf, removeGroup, removeNode, setGroupPad, setGroupsColor, setPositions, toEditFlow, updateGroup,
  type EditFlow, type EditResult, type FlowPos,
} from "../../../pages/dme/ruleSetEdit/flow-edit";
import type { NodeColor } from "../../../pages/dme/ruleSetEdit/node-style";
import type { FlowMode } from "../../../pages/dme/ruleSetEdit/state/useRuleSetEdit";
import { BASE_CSS } from "../../../pages/dme/ruleSetEdit/styles/base";
import type { RuleIo, RuleSetView } from "../../../pages/dme/ruleSetEdit/types";
import { flush, installDomStorage } from "../helpers/render";
import { byTestId, calls, click, installServer, ok, openSet, q, settle, srv, uninstallServer } from "../helpers/rule-set-page";

function must(r: EditResult): EditFlow {
  if (!r.ok) throw new Error(r.reason);
  return r.flow;
}
const P = (x: number, y: number): FlowPos => ({ x, y });
/** start → r1 → r2 → r3 → end. 그룹 g1 = r1·r2 "묶음", g2 = r3 "둘". */
function grouped(): EditFlow {
  const base = setPositions(toEditFlow(null, ["R_A", "R_B", "R_C"]), { r1: P(0, 0), r2: P(0, 200), r3: P(0, 400) });
  const a = must(addGroup(base, ["r1", "r2"], "묶음"));
  return must(addGroup(a, ["r3"], "둘"));
}
const groupOf = (f: EditFlow, id: string) => f.view.groups.find((g) => g.id === id)!;

describe("FlowGroup.color 코덱", () => {
  it("읽기 — 목록에 있는 색만 남기고 기본·모르는 값·문자열이 아닌 값은 키를 두지 않는다", () => {
    const base = grouped();
    const raw = {
      ...base,
      view: {
        ...base.view,
        groups: [
          { id: "g1", title: "a", nodeIds: ["r1"], color: "red" },
          { id: "g2", title: "b", nodeIds: ["r2"], color: "default" },
          { id: "g3", title: "c", nodeIds: ["r3"], color: "yellow" },
          { id: "g4", title: "d", nodeIds: ["r3"], color: 3 },
          { id: "g5", title: "e", nodeIds: ["r3"], color: null },
        ],
      },
    };
    const f = toEditFlow(raw as never, []);
    expect(f.view.groups[0].color).toBe("red");
    for (const g of f.view.groups.slice(1)) expect("color" in g).toBe(false);
  });

  it("저장 글자 — 색 없는 그룹은 예전과 같고, 색은 그룹의 마지막 키(pad 뒤)다", () => {
    const f = grouped();
    expect(flowJsonOf(f)).toContain('"groups":[{"id":"g1","title":"묶음","nodeIds":["r1","r2"]},{"id":"g2","title":"둘","nodeIds":["r3"]}]');
    const red = setGroupsColor(f, ["g1"], "red");
    expect(flowJsonOf(red)).toContain('{"id":"g1","title":"묶음","nodeIds":["r1","r2"],"color":"red"}');
    const padded = setGroupsColor(must(setGroupPad(f, "g1", { l: 1, t: 2, r: 3, b: 4 })), ["g1"], "blue");
    expect(flowJsonOf(padded)).toContain('{"id":"g1","title":"묶음","nodeIds":["r1","r2"],"pad":{"l":1,"t":2,"r":3,"b":4},"color":"blue"}');
  });

  it("왕복 — flowJsonOf → toEditFlow → flowJsonOf 가 같다", () => {
    const s = flowJsonOf(setGroupsColor(must(setGroupPad(grouped(), "g2", { l: 5, t: 0, r: 0, b: 0 })), ["g1", "g2"], "purple"));
    expect(flowJsonOf(toEditFlow(JSON.parse(s), []))).toBe(s);
  });
});

describe("setGroupsColor·그룹 연산", () => {
  it("고른 그룹들에 칠하고 「기본」은 색 키를 지운다. 입력은 바뀌지 않는다", () => {
    const f = grouped();
    const before = flowJsonOf(f);
    const g = setGroupsColor(f, ["g1", "g2"], "green");
    expect(groupOf(g, "g1").color).toBe("green");
    expect(groupOf(g, "g2").color).toBe("green");
    expect(flowJsonOf(f)).toBe(before);
    const cleared = setGroupsColor(g, ["g1"], "default");
    expect("color" in groupOf(cleared, "g1")).toBe(false);
    expect(groupOf(cleared, "g2").color).toBe("green");
    expect(flowJsonOf(setGroupsColor(g, ["g1", "g2"], "default"))).toBe(before); // 예전 글자로 돌아간다(dirty 아님)
  });

  it("바뀌는 것이 없으면(이미 그 색·없는 그룹·노드 ID) 같은 흐름 객체를 돌려준다", () => {
    const f = setGroupsColor(grouped(), ["g1"], "red");
    expect(setGroupsColor(f, ["g1"], "red")).toBe(f);
    expect(setGroupsColor(f, ["g2"], "default")).toBe(f);
    expect(setGroupsColor(f, ["nope", "r1"], "blue")).toBe(f);
  });

  it("모르는 색은 칠하지 않는다", () => {
    const f = grouped();
    expect(setGroupsColor(f, ["g1"], "yellow" as NodeColor)).toBe(f);
  });

  it("크기(pad)와 색은 서로 지우지 않는다 — 크기를 바꿔도 색이, 색을 바꿔도 크기가 남는다", () => {
    const pad = { l: 10, t: 20, r: 30, b: 40 };
    const red = setGroupsColor(grouped(), ["g1"], "red");
    const sized = must(setGroupPad(red, "g1", pad));
    expect(groupOf(sized, "g1")).toEqual({ id: "g1", title: "묶음", nodeIds: ["r1", "r2"], pad, color: "red" });
    expect(groupOf(must(setGroupPad(sized, "g1", null)), "g1").color).toBe("red");
    const recolored = setGroupsColor(sized, ["g1"], "blue");
    expect(groupOf(recolored, "g1").pad).toEqual(pad);
  });

  it("제목·구성 노드 고치기(속성 패널)와 소속 노드 지우기는 색을 남기고, 그룹이 비거나 풀리면 색도 함께 사라진다", () => {
    const red = setGroupsColor(grouped(), ["g1", "g2"], "red");
    expect(groupOf(updateGroup(red, "g1", { title: "새 이름", nodeIds: ["r1"] }), "g1").color).toBe("red");
    expect(groupOf(must(removeNode(red, "r1")), "g1").color).toBe("red");
    const empty = must(removeNode(red, "r3")); // g2 의 유일한 노드
    expect(empty.view.groups.map((g) => g.id)).toEqual(["g1"]);
    const ungrouped = removeGroup(red, "g1");
    expect(ungrouped.view.groups.map((g) => g.id)).toEqual(["g2"]);
    expect(flowJsonOf(ungrouped)).not.toContain('"g1"');
  });

  it("새로 묶은 그룹은 색이 없다(예전 그룹 색을 물려받지 않는다)", () => {
    const red = setGroupsColor(grouped(), ["g1"], "red");
    const again = must(addGroup(removeGroup(red, "g1"), ["r1", "r2"], "다시"));
    expect(again.view.groups.every((g) => !("color" in g))).toBe(true);
  });
});

// ───────────────────────── 메뉴 제공자 ─────────────────────────
function actions(): CanvasActions {
  return {
    openRule: vi.fn(), fit: vi.fn(), autoLayout: vi.fn(), addNote: vi.fn(), pickRuleFor: vi.fn(), insertSplitAt: vi.fn(),
    removeNode: vi.fn(), removeEdge: vi.fn(), resetRoute: vi.fn(), addBranch: vi.fn(), editCond: vi.fn(), editLabel: vi.fn(), copy: vi.fn(),
    paste: vi.fn(), duplicate: vi.fn(), addCatch: vi.fn(), returnCatch: vi.fn(), openRuleAssign: vi.fn(), changeSplitKind: vi.fn(),
    dissolveSplit: vi.fn(), toggleCollapse: vi.fn(), toggleBreakpoint: vi.fn(), runTo: vi.fn(), align: vi.fn(), distribute: vi.fn(),
    setNodeColor: vi.fn(), setGroupColor: vi.fn(),
  };
}
function ctx(mode: FlowMode, flow: EditFlow, selection?: string[]): MenuContext {
  return { flow, rules: {}, mode, hasClipboard: false, selectedEdgeId: null, collapsed: new Set(), breakpoints: new Set(), canRun: true, selection, act: actions() };
}
const groupMenu = (c: MenuContext, groupId: string) => buildMenu(MENU_PROVIDERS, { kind: "pane", at: P(0, 0), groupId }, c);
const colorItem = (items: MenuItem[]) => items.find((i) => i.id === "color");
const ids = (items: MenuItem[]) => items.map((i) => i.id);

describe("메뉴 제공자 — 그룹 「색상」", () => {
  it("편집 모드 그룹 우클릭 — 맨 앞에 노드와 같은 「색상」(붓, 6색 견본), 빈 곳 항목은 그대로 뒤에 남는다", () => {
    const items = groupMenu(ctx("edit", grouped()), "g1");
    expect(ids(items)[0]).toBe("color");
    expect(ids(items)).toEqual(expect.arrayContaining(["note-add", "auto-layout", "fit"]));
    const c = colorItem(items)!;
    expect(c.label).toBe("색상");
    expect(c.icon).toBe("brush");
    expect(c.swatches!.map((s) => s.color)).toEqual(["default", "blue", "orange", "green", "red", "purple"]);
    expect(c.swatches!.map((s) => s.label)).toEqual(["기본", "파랑", "주황", "초록", "빨강", "보라"]);
    expect(c.swatches!.map((s) => s.id)).toEqual(["color-default", "color-blue", "color-orange", "color-green", "color-red", "color-purple"]);
  });

  it("보기·디버그 모드, 그룹 아닌 빈 곳, 없는 그룹에는 없다", () => {
    const f = grouped();
    for (const mode of ["view", "debug"] as const) expect(colorItem(groupMenu(ctx(mode, f), "g1"))).toBeUndefined();
    expect(colorItem(buildMenu(MENU_PROVIDERS, { kind: "pane", at: P(0, 0) }, ctx("edit", f)))).toBeUndefined();
    expect(colorItem(groupMenu(ctx("edit", f), "nope"))).toBeUndefined();
  });

  it("우클릭한 그룹 하나만 칠한다 — 선택이 없거나 선택 밖이거나 선택 안 그룹이 하나뿐이면(노드는 세지 않는다)", () => {
    const f = grouped();
    for (const selection of [undefined, [], ["g1"], ["g2"], ["g1", "r1", "r3"], ["g2", "r1"]]) {
      const c = ctx("edit", f, selection);
      colorItem(groupMenu(c, "g1"))!.swatches!.find((s) => s.color === "red")!.run();
      expect(c.act.setGroupColor).toHaveBeenCalledTimes(1);
      expect(c.act.setGroupColor).toHaveBeenCalledWith(["g1"], "red");
      expect(c.act.setNodeColor).not.toHaveBeenCalled();
    }
  });

  it("우클릭한 그룹이 다중 선택 안이고 선택 안 그룹이 둘 이상이면 그 전부(노드는 뺀다, C4 와 같은 규칙)", () => {
    const c = ctx("edit", grouped(), ["r1", "g2", "g1"]);
    colorItem(groupMenu(c, "g1"))!.swatches!.find((s) => s.color === "green")!.run();
    expect(c.act.setGroupColor).toHaveBeenCalledWith(["g2", "g1"], "green");
    expect(c.act.setNodeColor).not.toHaveBeenCalled();
  });

  it("노드 우클릭 「색상」은 선택 안 그룹을 칠하지 않는다", () => {
    const c = ctx("edit", grouped(), ["r1", "r2", "g1"]);
    buildMenu(MENU_PROVIDERS, { kind: "node", nodeId: "r1" }, c).find((i) => i.id === "color")!.swatches!.find((s) => s.color === "red")!.run();
    expect(c.act.setNodeColor).toHaveBeenCalledWith(["r1", "r2"], "red");
    expect(c.act.setGroupColor).not.toHaveBeenCalled();
  });

  it("고른 칸(active)은 우클릭한 그룹의 지금 색 — 없으면 기본", () => {
    const f = setGroupsColor(grouped(), ["g1"], "orange");
    const active = (groupId: string, selection?: string[]) =>
      colorItem(groupMenu(ctx("edit", f, selection), groupId))!.swatches!.filter((s) => s.active).map((s) => s.color);
    expect(active("g1")).toEqual(["orange"]);
    expect(active("g2")).toEqual(["default"]);
    expect(active("g2", ["g1", "g2"])).toEqual(["default"]);
  });
});

describe("그리기 CSS — 그룹 색", () => {
  const css = BASE_CSS.replace(/\s+/g, " ");
  it("색마다 그룹 배경·테두리 변수를 노드 색 토큰(--rsf-c-{색}-bg·-border)으로 바꾼다. 기본은 규칙이 없다", () => {
    for (const c of ["blue", "orange", "green", "red", "purple"]) {
      expect(css).toContain(`.rsf-group:where([data-color="${c}"]) { --rsf-group-bg: var(--rsf-c-${c}-bg); --rsf-group-border: var(--rsf-c-${c}-border); }`);
    }
    expect(css).not.toContain('.rsf-group:where([data-color="default"])');
  });

  it("고른 그룹은 지금처럼 실선 파랑 테두리 — 색 규칙(:where, 0,1,0)보다 선택 규칙(0,2,0)이 이긴다", () => {
    expect(css).toMatch(/\.rsf-group\[data-selected="true"\] \{ border-style: solid; border-color: var\(--color-primary\); \}/);
    expect(css).toMatch(/\.rsf-group \{[^}]*border: 1px dashed var\(--rsf-group-border\); background: var\(--rsf-group-bg\)/);
  });

  it("그룹 규칙에 16진수·rgb() 가 없다", () => {
    const group = css.match(/\.rsf-group[^{]*\{[^}]*\}/g)!.join(" ");
    expect(group).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
  });
});

// ───────────────────────── 화면 ─────────────────────────
const io = (ruleId: string): RuleIo => ({
  ruleId, ruleName: `${ruleId} 이름`, ruleKind: "DECISION", status: "INUSE", exists: true, releasedVer: "1.000", hitPolicy: "FIRST", conds: [], results: [],
});
function viewOf(setId: string, flow: EditFlow = grouped()): RuleSetView {
  return {
    set: { setId, setName: "그룹 색 세트", description: null, status: "INUSE", rowVersion: 1, ruleIds: ["R_A", "R_B", "R_C"], flow, branched: false },
    rules: [io("R_A"), io("R_B"), io("R_C")], checks: [], condIo: {}, editable: true, restorable: false, cases: [],
  } as RuleSetView;
}
const undoDisabled = () => (byTestId("flow-undo") as HTMLButtonElement).disabled;
const groupColor = (id: string) => byTestId(`flow-group-${id}`).getAttribute("data-color");
const titleOf = (id: string) => byTestId(`flow-group-${id}`).querySelector(".rsf-group-title") as HTMLElement;
async function ctxMenu(groupId: string) {
  await act(async () => {
    titleOf(groupId).dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 120, clientY: 80 }));
  });
  await flush();
}
async function paint(groupId: string, color: string) {
  await ctxMenu(groupId);
  await click("flow-menu-item-color");
  await click(`flow-menu-swatch-${color}`);
}
async function pressTitle(groupId: string) {
  await act(async () => {
    titleOf(groupId).dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, view: window }));
  });
  await flush();
}
const shift = (type: "keydown" | "keyup") =>
  act(async () => {
    document.dispatchEvent(new KeyboardEvent(type, { key: "Shift", bubbles: true }));
  });
async function saved() {
  await settle(500);
  await click("set-save");
  await settle();
  return JSON.parse(String((calls("save").at(-1)!.body.params as Record<string, unknown>).flowJson)) as EditFlow;
}

describe("화면 — 그룹 우클릭 → 색상", () => {
  beforeEach(() => {
    installDomStorage();
    installServer();
    srv.replies.validate = ok({ condIo: {} });
    localStorage.clear();
  });
  afterEach(() => uninstallServer());

  it("그룹 제목 우클릭 → 「색상」 → 빨강 — data-color=red, 메뉴 닫힘, 되돌리기 한 칸, 저장 JSON 그룹에 color", async () => {
    await openSet("GC_1", viewOf("GC_1"));
    await click("flow-mode-edit");
    expect(groupColor("g1")).toBeNull();
    await ctxMenu("g1");
    expect(q("flow-menu-item-color")).not.toBeNull();
    expect(q("flow-menu-item-note-add")).not.toBeNull(); // 빈 곳 항목도 남는다
    await click("flow-menu-item-color");
    await click("flow-menu-swatch-red");
    expect(q("flow-menu")).toBeNull();
    expect(groupColor("g1")).toBe("red");
    expect(groupColor("g2")).toBeNull();
    await click("flow-undo");
    expect(groupColor("g1")).toBeNull();
    expect(undoDisabled()).toBe(true);
    await paint("g1", "red");
    const json = await saved();
    expect(json.view.groups).toEqual([
      { id: "g1", title: "묶음", nodeIds: ["r1", "r2"], color: "red" },
      { id: "g2", title: "둘", nodeIds: ["r3"] },
    ]);
    expect(json.view.styles).toBeUndefined();
  });

  it("같은 색은 편집을 만들지 않고, 「기본」은 색을 지워 바뀐 것이 없게 된다", async () => {
    await openSet("GC_2", viewOf("GC_2"));
    await click("flow-mode-edit");
    await paint("g1", "blue");
    await paint("g1", "blue");
    await click("flow-undo");
    expect(groupColor("g1")).toBeNull();
    expect(undoDisabled()).toBe(true);
    await click("flow-redo");
    await paint("g1", "default");
    expect(groupColor("g1")).toBeNull();
    await settle(500);
    expect((byTestId("set-save") as HTMLButtonElement).disabled).toBe(true);
  });

  it("그룹 둘을 Shift 로 고르고 하나를 우클릭하면 둘 다 칠해지고 편집 한 번", async () => {
    await openSet("GC_3", viewOf("GC_3"));
    await click("flow-mode-edit");
    await pressTitle("g1");
    await shift("keydown");
    await pressTitle("g2");
    await shift("keyup");
    await paint("g2", "green");
    expect(groupColor("g1")).toBe("green");
    expect(groupColor("g2")).toBe("green");
    await click("flow-undo");
    expect(groupColor("g1")).toBeNull();
    expect(groupColor("g2")).toBeNull();
    expect(undoDisabled()).toBe(true);
  });

  it("보기 모드 — 저장된 색은 보이고 우클릭에는 「색상」이 없다", async () => {
    await openSet("GC_4", viewOf("GC_4", setGroupsColor(grouped(), ["g2"], "purple")));
    expect(groupColor("g2")).toBe("purple");
    expect(groupColor("g1")).toBeNull();
    await ctxMenu("g2");
    expect(q("flow-menu-item-color")).toBeNull();
  });
});
