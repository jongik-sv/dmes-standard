/** @vitest-environment happy-dom */

// 외관 옵션(S1) Task 6 — 색은 노드 우클릭 메뉴 「색상」(붓)에서 고른다(C1). 메뉴 제공자(순수)·메뉴 그리기·화면(편집 한 번 = 되돌리기 한 칸, 다중 선택 C4).
import { createElement, act } from "react";
import { createRoot } from "react-dom/client";
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

import { ContextMenu } from "../../../pages/dme/ruleSetEdit/canvas/ContextMenu";
import { buildMenu, type CanvasActions, type MenuContext, type MenuItem, type MenuTarget } from "../../../pages/dme/ruleSetEdit/canvas/context-menu";
import { MENU_PROVIDERS } from "../../../pages/dme/ruleSetEdit/canvas/menus";
import { insertSplit, insertTask, setNodeStyle, toEditFlow, type EditFlow, type EditResult } from "../../../pages/dme/ruleSetEdit/flow-edit";
import type { FlowMode } from "../../../pages/dme/ruleSetEdit/state/useRuleSetEdit";
import type { RuleIo, RuleSetView } from "../../../pages/dme/ruleSetEdit/types";
import { MENU_CSS } from "../../../pages/dme/ruleSetEdit/styles/menu";
import { flush, installDomStorage } from "../helpers/render";
import { byTestId, calls, click, installServer, ok, openSet, q, settle, srv, uninstallServer } from "../helpers/rule-set-page";

function must(r: EditResult): EditFlow {
  if (!r.ok) throw new Error(r.reason);
  return r.flow;
}
/** start → r1 → r2 → r3(빈 단계) … 가운데 IF: start → r1 → if1{…} → m1 → r2 → r3 → end 와 비슷하게 만든다. */
function flowOf(): EditFlow {
  let f = toEditFlow(null, ["CM_A", "CM_B"]); // start → r1 → r2 → end (e1 e2 e3)
  f = must(insertTask(f, "e3")); // r2 → r3(빈 단계) → end
  return must(insertSplit(f, "e1", "IF")); // start → if1 → … → r1
}
const ids = (items: MenuItem[]) => items.map((i) => i.id);

function actions(): CanvasActions {
  return {
    openRule: vi.fn(), fit: vi.fn(), autoLayout: vi.fn(), addNote: vi.fn(), pickRuleFor: vi.fn(), insertSplitAt: vi.fn(),
    removeNode: vi.fn(), removeEdge: vi.fn(), resetRoute: vi.fn(), addBranch: vi.fn(), editCond: vi.fn(), copy: vi.fn(), paste: vi.fn(),
    duplicate: vi.fn(), openRuleAssign: vi.fn(), changeSplitKind: vi.fn(), dissolveSplit: vi.fn(), toggleCollapse: vi.fn(),
    toggleBreakpoint: vi.fn(), runTo: vi.fn(), align: vi.fn(), distribute: vi.fn(), setNodeColor: vi.fn(),
  };
}
function ctx(mode: FlowMode, flow: EditFlow, selection?: string[]): MenuContext {
  return { flow, rules: {}, mode, hasClipboard: false, selectedEdgeId: null, collapsed: new Set(), breakpoints: new Set(), canRun: true, selection, act: actions() };
}
const menuOf = (c: MenuContext, nodeId: string) => buildMenu(MENU_PROVIDERS, { kind: "node", nodeId }, c);
const colorItem = (items: MenuItem[]) => items.find((i) => i.id === "color");

describe("메뉴 제공자 — 「색상」(C1·C4)", () => {
  it("편집 모드의 RULE·TASK 노드에 있다 — 「삭제」 바로 앞, 붓 아이콘, 견본 6개(기본·파랑·주황·초록·빨강·보라)", () => {
    for (const id of ["r1", "r3"]) {
      const items = menuOf(ctx("edit", flowOf()), id);
      const i = ids(items).indexOf("color");
      expect(i).toBeGreaterThan(-1);
      expect(ids(items)[i + 1]).toBe("delete");
      const c = colorItem(items)!;
      expect(c.label).toBe("색상");
      expect(c.icon).toBe("brush");
      expect(c.swatches!.map((s) => s.color)).toEqual(["default", "blue", "orange", "green", "red", "purple"]);
      expect(c.swatches!.map((s) => s.label)).toEqual(["기본", "파랑", "주황", "초록", "빨강", "보라"]);
    }
  });

  it("보기·디버그 모드, 분기·시작·끝, 선, 빈 곳에는 없다", () => {
    const f = flowOf();
    for (const mode of ["view", "debug"] as const) expect(colorItem(menuOf(ctx(mode, f), "r1"))).toBeUndefined();
    for (const id of ["if1", "start", "end"]) expect(colorItem(menuOf(ctx("edit", f), id))).toBeUndefined();
    const edge: MenuTarget = { kind: "edge", edgeId: "e2", via: "context" };
    expect(colorItem(buildMenu(MENU_PROVIDERS, edge, ctx("edit", f)))).toBeUndefined();
    expect(colorItem(buildMenu(MENU_PROVIDERS, { kind: "pane", at: { x: 0, y: 0 } }, ctx("edit", f)))).toBeUndefined();
  });

  it("우클릭한 노드 하나만 칠한다 — 선택이 없거나 선택 밖이거나 선택 안 RULE·TASK 가 하나뿐이면", () => {
    const f = flowOf();
    for (const selection of [undefined, [], ["r1"], ["r2"], ["r1", "if1"]]) {
      const c = ctx("edit", f, selection);
      colorItem(menuOf(c, "r1"))!.swatches!.find((s) => s.color === "red")!.run();
      expect(c.act.setNodeColor).toHaveBeenCalledTimes(1);
      expect(c.act.setNodeColor).toHaveBeenCalledWith(["r1"], "red");
    }
  });

  it("우클릭한 노드가 다중 선택 안이고 선택 안 RULE·TASK 가 둘 이상이면 그 전부(분기 등은 뺀다)", () => {
    const f = flowOf();
    const c = ctx("edit", f, ["r1", "if1", "r3", "start"]);
    colorItem(menuOf(c, "r3"))!.swatches!.find((s) => s.color === "green")!.run();
    expect(c.act.setNodeColor).toHaveBeenCalledWith(["r1", "r3"], "green");
    const d = ctx("edit", f, ["r1", "r2"]);
    colorItem(menuOf(d, "r2"))!.swatches!.find((s) => s.color === "default")!.run();
    expect(d.act.setNodeColor).toHaveBeenCalledWith(["r1", "r2"], "default");
  });

  it("고른 칸(active)은 우클릭한 노드의 지금 색 — 없으면 기본", () => {
    const f = must(setNodeStyle(must(setNodeStyle(flowOf(), "r1", { color: "blue" })), "r2", { color: "red" }));
    const actives = (nodeId: string, selection?: string[]) =>
      colorItem(menuOf(ctx("edit", f, selection), nodeId))!.swatches!.filter((s) => s.active).map((s) => s.color);
    expect(actives("r1")).toEqual(["blue"]);
    expect(actives("r2")).toEqual(["red"]);
    expect(actives("r3")).toEqual(["default"]);
    expect(actives("r1", ["r1", "r2"])).toEqual(["blue"]); // 다중 선택이어도 우클릭한 노드 기준
  });
});

describe("메뉴 그리기 — 색상 격자", () => {
  const SWATCHES = (run: () => void) =>
    (["default", "blue", "orange", "green", "red", "purple"] as const).map((color) => ({ id: `swatch-${color}`, label: `이름-${color}`, color, active: color === "blue", run }));
  async function mount(items: MenuItem[], onClose = vi.fn()) {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(createElement(ContextMenu, { items, at: { x: 10, y: 20 }, onClose }));
    });
    return { host, onClose, done: () => { act(() => root.unmount()); host.remove(); } };
  }
  const el = (host: Element, id: string) => host.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

  it("「색상」을 누르면 메뉴 안에 3열 격자가 펼쳐지고 메뉴는 닫히지 않는다. 다시 누르면 접힌다", async () => {
    const run = vi.fn();
    const m = await mount([{ id: "color", label: "색상", icon: "brush", swatches: SWATCHES(run) }, { id: "delete", label: "삭제", run: vi.fn() }]);
    const head = el(m.host, "flow-menu-item-color") as HTMLButtonElement;
    expect(head.tagName).toBe("BUTTON");
    expect(head.textContent).toContain("색상");
    expect(head.querySelector("svg")).not.toBeNull(); // 붓 아이콘
    expect(head.getAttribute("aria-expanded")).toBe("false");
    expect(m.host.querySelector('[role="group"][aria-label="색상"]')).toBeNull();
    await act(async () => head.click());
    expect(m.onClose).not.toHaveBeenCalled();
    expect(el(m.host, "flow-menu")).not.toBeNull();
    expect(head.getAttribute("aria-expanded")).toBe("true");
    const grid = m.host.querySelector('[role="group"][aria-label="색상"]')!;
    expect(grid.querySelectorAll("button")).toHaveLength(6);
    await act(async () => head.click());
    expect(m.host.querySelector('[role="group"][aria-label="색상"]')).toBeNull();
    m.done();
  });

  it("견본 단추 — aria-label·title·aria-pressed·testid, 누르면 run 한 번 뒤 닫는다", async () => {
    const run = vi.fn();
    const m = await mount([{ id: "color", label: "색상", icon: "brush", swatches: SWATCHES(run) }]);
    await act(async () => el(m.host, "flow-menu-item-color")!.click());
    const blue = el(m.host, "flow-menu-swatch-blue") as HTMLButtonElement;
    expect(blue.type).toBe("button");
    expect(blue.getAttribute("aria-label")).toBe("이름-blue");
    expect(blue.title).toBe("이름-blue");
    expect(blue.getAttribute("aria-pressed")).toBe("true");
    expect(el(m.host, "flow-menu-swatch-red")!.getAttribute("aria-pressed")).toBe("false");
    expect(blue.tabIndex).toBeGreaterThanOrEqual(0); // 키보드로 초점이 간다
    await act(async () => el(m.host, "flow-menu-swatch-red")!.click());
    expect(run).toHaveBeenCalledOnce();
    expect(m.onClose).toHaveBeenCalledOnce();
    m.done();
  });

  it("격자 안 Esc 도 메뉴를 닫는다", async () => {
    const m = await mount([{ id: "color", label: "색상", icon: "brush", swatches: SWATCHES(vi.fn()) }]);
    await act(async () => el(m.host, "flow-menu-item-color")!.click());
    await act(async () => {
      el(m.host, "flow-menu-swatch-blue")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });
    expect(m.onClose).toHaveBeenCalledOnce();
    m.done();
  });

  it("CSS — 견본은 노드 색 토큰으로 칠하고(기본은 --color-bg·--color-border-strong) 16진수·rgb() 가 없다", () => {
    const css = MENU_CSS.replace(/\s+/g, " ");
    for (const c of ["blue", "orange", "green", "red", "purple"]) {
      expect(css).toMatch(new RegExp(`\\.rsf-menu-swatch\\[data-color="${c}"\\] \\{[^}]*background: var\\(--rsf-c-${c}-bg\\)[^}]*border-color: var\\(--rsf-c-${c}-border\\)`));
    }
    expect(css).toMatch(/\.rsf-menu-swatch\[data-color="default"\] \{[^}]*var\(--color-bg\)[^}]*var\(--color-border-strong\)/);
    expect(css).toMatch(/\.rsf-menu-swatch\[aria-pressed="true"\] \{[^}]*var\(--color-bg-hover\)/);
    expect(css).toMatch(/\.rsf-menu-swatches \{[^}]*grid-template-columns: repeat\(3,/);
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
  });
});

// ───────────────────────── 화면 ─────────────────────────
const io = (ruleId: string): RuleIo => ({
  ruleId, ruleName: `${ruleId} 이름`, ruleKind: "DECISION", status: "INUSE", exists: true, releasedVer: 1, hitPolicy: "FIRST", conds: [], results: [],
});
function viewOf(setId: string): RuleSetView {
  return {
    set: { setId, setName: "색 세트", description: null, status: "INUSE", rowVersion: 1, ruleIds: ["CM_A", "CM_B"], flow: toEditFlow(null, ["CM_A", "CM_B"]), branched: false },
    rules: [io("CM_A"), io("CM_B")], checks: [], condIo: {}, editable: true, restorable: false, cases: [],
  } as RuleSetView;
}
const undoDisabled = () => (byTestId("flow-undo") as HTMLButtonElement).disabled;
const colorOf = (id: string) => byTestId(`flow-node-${id}`).getAttribute("data-color");
async function ctxMenu(id: string) {
  await act(async () => {
    byTestId(`flow-node-${id}`).dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 120, clientY: 80 }));
  });
  await flush();
}
async function paint(nodeId: string, color: string) {
  await ctxMenu(nodeId);
  await click("flow-menu-item-color");
  await click(`flow-menu-swatch-${color}`);
}
const shift = (type: "keydown" | "keyup") =>
  act(async () => {
    document.dispatchEvent(new KeyboardEvent(type, { key: "Shift", bubbles: true }));
  });
async function pick(...nodeIds: string[]) {
  await click(`flow-node-${nodeIds[0]}`);
  await shift("keydown");
  for (const id of nodeIds.slice(1)) await click(`flow-node-${id}`);
  await shift("keyup");
}
async function saved() {
  await settle(500);
  await click("set-save");
  await settle();
  return JSON.parse(String((calls("save").at(-1)!.body.params as Record<string, unknown>).flowJson)) as EditFlow;
}

describe("화면 — 노드 우클릭 → 색상(C1·C4)", () => {
  beforeEach(() => {
    installDomStorage();
    installServer();
    srv.replies.validate = ok({ condIo: {} });
    localStorage.clear();
  });
  afterEach(() => uninstallServer());

  it("우클릭 → 「색상」 → 빨강 — data-color=red, 메뉴 닫힘, 되돌리기 한 번에 원래대로, 저장 JSON 에 color 만(위치는 늘지 않는다)", async () => {
    await openSet("CM_1", viewOf("CM_1"));
    await click("flow-mode-edit");
    expect(undoDisabled()).toBe(true);
    await ctxMenu("r1");
    expect(q("flow-menu-item-color")).not.toBeNull();
    expect(q("flow-menu-swatch-red")).toBeNull(); // 누르기 전에는 접혀 있다
    await click("flow-menu-item-color");
    expect(q("flow-menu")).not.toBeNull();
    await click("flow-menu-swatch-red");
    expect(q("flow-menu")).toBeNull();
    expect(colorOf("r1")).toBe("red");
    expect(colorOf("r2")).toBeNull();
    await click("flow-undo");
    expect(colorOf("r1")).toBeNull();
    expect(undoDisabled()).toBe(true); // 한 칸
    await paint("r1", "red");
    const json = await saved();
    expect(json.view.styles).toEqual({ r1: { color: "red" } });
    expect(json.view.positions).toEqual({});
  });

  it("지금 색을 다시 고르거나 기본으로 칠하면 — 같은 색은 편집을 만들지 않고, 기본은 칸을 지운다", async () => {
    await openSet("CM_2", viewOf("CM_2"));
    await click("flow-mode-edit");
    await paint("r1", "blue");
    await click("flow-undo");
    await paint("r1", "blue");
    await ctxMenu("r1");
    await click("flow-menu-item-color");
    expect(byTestId("flow-menu-swatch-blue").getAttribute("aria-pressed")).toBe("true");
    await click("flow-menu-swatch-blue"); // 이미 파랑 — 되돌리기 칸이 늘지 않는다
    await click("flow-undo");
    expect(colorOf("r1")).toBeNull();
    expect(undoDisabled()).toBe(true);
    await click("flow-redo");
    expect(colorOf("r1")).toBe("blue");
    await paint("r1", "default");
    expect(colorOf("r1")).toBeNull();
    await settle(500);
    expect((byTestId("set-save") as HTMLButtonElement).disabled).toBe(true); // 예전과 같은 글자로 돌아가 바뀐 것이 없다
  });

  it("다중 선택 둘 — 우클릭한 노드가 선택 안이면 둘 다 칠해지고 편집 한 번(되돌리기 한 칸)", async () => {
    await openSet("CM_3", viewOf("CM_3"));
    await click("flow-mode-edit");
    await pick("r1", "r2");
    await paint("r2", "green");
    expect(colorOf("r1")).toBe("green");
    expect(colorOf("r2")).toBe("green");
    await click("flow-undo");
    expect(colorOf("r1")).toBeNull();
    expect(colorOf("r2")).toBeNull();
    expect(undoDisabled()).toBe(true);
  });

  it("보기 모드 우클릭에는 「색상」이 없다", async () => {
    await openSet("CM_4", viewOf("CM_4"));
    await ctxMenu("r1");
    expect(q("flow-menu-item-color")).toBeNull();
  });
});
