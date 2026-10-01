/** @vitest-environment happy-dom */

// 4단계 Task 9(T1) — 화면: [룰]·[+] 「룰 넣기」 는 빈 단계를 놓고 「룰 지정」 을 연다, 제목 두 번 눌러 고치기, [지정]·노드 위 끌어 놓기로 룰 지정
// (선·ID 유지, 되돌리기 한 번), 우클릭 [룰 지정…], 보기 모드 읽기 전용, 디버그 중단점, 제목 칸 memo 의존성(Local-Rules §19), 끄는 동안 배치(dagre) 안 늘어남.
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ openRuleEdit: vi.fn(), openMdmPage: vi.fn(), layoutCalls: 0 }));
// dagre 배치 호출 수를 센다(space-canvas.test.ts 와 같은 방식) — 룰 줄을 끄는 동안 늘지 않아야 한다.
vi.mock("@dagrejs/dagre", async (importOriginal) => {
  const real = await importOriginal<typeof import("@dagrejs/dagre")>();
  const inner = real.default ?? real;
  const wrapped = new Proxy(inner, {
    get: (t, k, r) => (k === "layout" ? (...a: Parameters<typeof inner.layout>) => (mocks.layoutCalls++, t.layout(...a)) : Reflect.get(t, k, r)),
  });
  return { ...real, default: wrapped };
});
vi.mock("@/dme/rule-handoff", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/dme/rule-handoff")>()),
  openRuleEdit: (...args: unknown[]) => mocks.openRuleEdit(...args),
}));
vi.mock("@/shell", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shell")>()),
  openMdmPage: (...args: unknown[]) => mocks.openMdmPage(...args),
}));

import { FlowCanvas, RULE_MIME, type FlowCanvasProps } from "../../../pages/dme/ruleSetEdit/canvas/FlowCanvas";
import { insertTask, setPositions, toEditFlow, updateNodeLabel, type EditFlow, type EditResult, type FlowPos } from "../../../pages/dme/ruleSetEdit/flow-edit";
import { positionsOf } from "../../../pages/dme/ruleSetEdit/flow-layout";
import type { RuleIo, RuleSetView } from "../../../pages/dme/ruleSetEdit/types";
import { flush, installDomStorage, typeInto, visibleText } from "../helpers/render";
import { byTestId, calls, canvasNodeIds, click, hoverEdge, installServer, ok, openSet, q, settle, srv, uninstallServer } from "../helpers/rule-set-page";

function must(r: EditResult): EditFlow {
  if (!r.ok) throw new Error(r.reason);
  return r.flow;
}
const io = (ruleId: string): RuleIo => ({
  ruleId, ruleName: `${ruleId} 이름`, ruleKind: "DECISION", status: "INUSE", exists: true, releasedVer: 1, hitPolicy: "FIRST", conds: [], results: [],
});
function viewOf(setId: string, flow: EditFlow | null): RuleSetView {
  return {
    set: { setId, setName: "빈 단계 세트", description: null, status: "INUSE", rowVersion: 1, ruleIds: ["TK_A", "TK_B"], flow, branched: false },
    rules: [io("TK_A"), io("TK_B")], checks: [], condIo: {}, editable: true, restorable: false, cases: [],
  } as RuleSetView;
}
/** start → r1(TK_A) → r3(TASK) → r2(TK_B) → end, 모든 노드 위치 고정(그린 자리 = positionsOf). */
function taskFlow(): { flow: EditFlow; pos: Record<string, FlowPos> } {
  const f = must(insertTask(toEditFlow(null, ["TK_A", "TK_B"]), "e2"));
  const pos = positionsOf(f);
  return { flow: setPositions(f, pos), pos };
}
const header = () => [byTestId("flow-panel-kind").textContent, byTestId("flow-panel-name").textContent];
const kindOf = (id: string) => byTestId(`flow-node-${id}`).getAttribute("data-kind");
const menuIds = () =>
  Array.from(document.querySelectorAll('[data-testid^="flow-menu-item-"]')).map((e) => e.getAttribute("data-testid")!.slice("flow-menu-item-".length));
async function findRules(text: string) {
  await typeInto(byTestId<HTMLInputElement>("flow-rule-panel-search"), text);
  await click("flow-rule-panel-find");
  await settle(20);
}
async function dblTitle(id: string) {
  await act(async () => {
    document.querySelector(`[data-testid="flow-task-title-${id}"]`)!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  });
  await flush();
}
async function keyOn(el: Element, key: string) {
  await act(async () => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
  await flush();
}
/** flow-drag.test.ts 의 dnd 와 같다 — 화면 좌표 = 흐름 좌표(happy-dom 의 기본 viewport). */
function dnd(type: string, target: Element, data: Record<string, string>, at: FlowPos) {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(ev, {
    dataTransfer: { value: { types: Object.keys(data), getData: (t: string) => data[t] ?? "", setData: () => {}, dropEffect: "none", effectAllowed: "all" } },
    clientX: { value: at.x },
    clientY: { value: at.y },
    relatedTarget: { value: null },
  });
  return act(async () => {
    target.dispatchEvent(ev);
  });
}

describe("빈 단계 화면(4단계 Task 9)", () => {
  beforeEach(() => {
    installServer();
    localStorage.clear();
    srv.replies["search:RULE"] = ok({ rules: [io("TK_NEW"), io("TK_A")] });
  });
  afterEach(() => uninstallServer());

  it("[룰] 은 룰 찾기 창 없이 END 앞 선에 빈 단계를 놓고, 그 노드를 고른 채 「룰 지정」 섹션을 펴고 찾기 칸에 초점을 둔다", async () => {
    await openSet("TK_1", viewOf("TK_1", null)); // start → r1 → r2 → end
    await click("flow-mode-edit");
    await click("flow-add-rule");
    await settle(10);
    expect(document.querySelector('[data-testid="flow-rule-search-keyword"]')).toBeNull();
    expect(kindOf("r3")).toBe("TASK");
    expect(visibleText(byTestId("flow-node-r3"))).toContain("빈 단계");
    expect(q("rf__edge-e3")).not.toBeNull();
    expect(header()).toEqual(["빈 단계", "빈 단계"]);
    expect(byTestId("flow-section-rules-head").textContent).toContain("룰 지정");
    expect(q("flow-prop-task")).not.toBeNull();
    expect(document.activeElement).toBe(byTestId("flow-rule-panel-search"));
  });

  it("저장 JSON 에 TASK·제목이 있다. 흐름에 있는 룰은 룰 목록 줄에 「사용 중」", async () => {
    await openSet("TK_2", viewOf("TK_2", null));
    await click("flow-mode-edit");
    await click("flow-add-rule");
    await findRules("TK_");
    expect(q("flow-rule-used-TK_A")).not.toBeNull();
    expect(q("flow-rule-used-TK_NEW")).toBeNull();
    await click("set-save");
    const params = calls("save").at(-1)!.body.params as Record<string, unknown>;
    const saved = JSON.parse(String(params.flowJson)) as EditFlow;
    expect(saved.nodes.find((n) => n.id === "r3")).toEqual({ id: "r3", kind: "TASK", ruleId: null, splitId: null, label: "빈 단계" });
  });

  it("[지정] — 빈 단계가 같은 ID·선의 룰 노드가 되고, 되돌리기 한 번에 빈 단계로 돌아간다", async () => {
    await openSet("TK_3", viewOf("TK_3", null));
    await click("flow-mode-edit");
    await click("flow-add-rule");
    await findRules("TK_");
    await click("flow-rule-assign-TK_NEW");
    expect(kindOf("r3")).toBe("RULE");
    expect(visibleText(byTestId("flow-node-r3"))).toContain("TK_NEW");
    expect(q("rf__edge-e3")).not.toBeNull();
    expect(q("rf__edge-e4")).not.toBeNull();
    expect(header()).toEqual(["룰", "TK_NEW 이름"]);
    await click("flow-undo");
    expect(kindOf("r3")).toBe("TASK");
    await click("flow-undo");
    expect(q("flow-node-r3")).toBeNull();
  });

  it("제목 두 번 눌러 고치기 — Enter 는 저장(되돌리기 한 칸), Esc 는 취소, 보기 모드는 열리지 않는다", async () => {
    const { flow } = taskFlow();
    await openSet("TK_4", viewOf("TK_4", flow));
    await click("flow-mode-edit");
    await dblTitle("r3");
    const input = byTestId<HTMLInputElement>("flow-task-title-input-r3");
    expect(input.value).toBe("빈 단계");
    await typeInto(input, "검사 자리");
    await keyOn(input, "Enter");
    expect(byTestId("flow-task-title-r3").textContent).toBe("검사 자리");
    await click("flow-undo");
    expect(byTestId("flow-task-title-r3").textContent).toBe("빈 단계");
    expect((byTestId("flow-undo") as HTMLButtonElement).disabled).toBe(true);
    await dblTitle("r3");
    await typeInto(byTestId<HTMLInputElement>("flow-task-title-input-r3"), "버림");
    await keyOn(byTestId("flow-task-title-input-r3"), "Escape");
    expect(q("flow-task-title-input-r3")).toBeNull();
    expect(byTestId("flow-task-title-r3").textContent).toBe("빈 단계");
    await click("flow-mode-view");
    await dblTitle("r3");
    expect(q("flow-task-title-input-r3")).toBeNull();
  });

  it("Enter·Esc 로 닫으면 초점이 캔버스로 돌아오고, 다른 입력 칸으로 나가면 그 칸에 남는다. 바뀐 게 없으면 편집이 생기지 않는다", async () => {
    const { flow } = taskFlow();
    await openSet("TK_9", viewOf("TK_9", flow));
    await click("flow-mode-edit");
    await dblTitle("r3");
    await keyOn(byTestId("flow-task-title-input-r3"), "Enter"); // 라벨이 null 이 아니라 "빈 단계" 라 같은 제목 — 편집 없음
    expect(document.activeElement).toBe(byTestId("flow-canvas"));
    expect((byTestId("flow-undo") as HTMLButtonElement).disabled).toBe(true);
    await dblTitle("r3");
    await typeInto(byTestId<HTMLInputElement>("flow-task-title-input-r3"), "버림");
    await keyOn(byTestId("flow-task-title-input-r3"), "Escape");
    expect(document.activeElement).toBe(byTestId("flow-canvas"));
    await dblTitle("r3");
    const other = byTestId<HTMLInputElement>("flow-rule-panel-search");
    await act(async () => {
      other.focus();
    });
    await flush();
    expect(q("flow-task-title-input-r3")).toBeNull();
    expect(document.activeElement).toBe(other);
  });

  it("라벨 없는 빈 단계를 열었다 그대로 닫아도 편집이 생기지 않고, 룰 지정은 사용자 제목을 룰 노드 이름으로 남기며 되돌리면 빈 단계 제목이 돌아온다", async () => {
    const f = must(insertTask(toEditFlow(null, ["TK_A", "TK_B"]), "e2", "검사 자리"));
    const pos = positionsOf(f);
    await openSet("TK_10", viewOf("TK_10", setPositions(f, pos)));
    await click("flow-mode-edit");
    await click("flow-node-r3");
    await findRules("TK_");
    await click("flow-rule-assign-TK_NEW");
    await click("set-save");
    const saved = JSON.parse(String((calls("save").at(-1)!.body.params as Record<string, unknown>).flowJson)) as EditFlow;
    expect(saved.nodes.find((n) => n.id === "r3")).toEqual({ id: "r3", kind: "RULE", ruleId: "TK_NEW", splitId: null, label: "검사 자리" });
    await click("flow-undo");
    expect(kindOf("r3")).toBe("TASK");
    expect(visibleText(byTestId("flow-node-r3"))).toContain("검사 자리");
  });

  it("룰 줄을 빈 단계 노드 위에 끌면 노드가 강조되고, 놓으면 지정된다(새 노드 없음). 빈 곳은 그대로 「선 위에 놓아야 한다」", async () => {
    const { flow, pos } = taskFlow();
    await openSet("TK_5", viewOf("TK_5", flow));
    await click("flow-mode-edit");
    await findRules("TK_");
    const at = { x: pos.r3.x + 20, y: pos.r3.y + 20 };
    const layoutsBefore = mocks.layoutCalls;
    await dnd("dragover", byTestId("flow-canvas"), { [RULE_MIME]: "TK_NEW" }, at);
    await dnd("dragover", byTestId("flow-canvas"), { [RULE_MIME]: "TK_NEW" }, { x: at.x + 5, y: at.y + 5 });
    expect(byTestId("flow-node-r3").classList.contains("rsf-node-drop")).toBe(true);
    expect(q("flow-edge-drop-e2")).toBeNull();
    expect(mocks.layoutCalls).toBe(layoutsBefore); // 끄는 동안 배치(dagre)가 다시 돌지 않는다
    await dnd("drop", byTestId("flow-canvas"), { [RULE_MIME]: "TK_NEW" }, at);
    await settle(20);
    expect(kindOf("r3")).toBe("RULE");
    expect(visibleText(byTestId("flow-node-r3"))).toContain("TK_NEW");
    expect(canvasNodeIds().sort()).toEqual(["end", "r1", "r2", "r3", "start"]);
    expect(byTestId("flow-node-r3").classList.contains("rsf-node-drop")).toBe(false);
  });

  it("우클릭 — 빈 단계는 [룰 지정…]·복사·복제·색상·삭제. [룰 지정…] 은 그 노드를 고르고 「룰 지정」 을 펴고 찾기 칸에 초점", async () => {
    const { flow } = taskFlow();
    await openSet("TK_6", viewOf("TK_6", flow));
    await click("flow-mode-edit");
    await click("flow-node-r1");
    await act(async () => {
      byTestId("flow-node-r3").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 120, clientY: 80 }));
    });
    await flush();
    expect(menuIds()).toEqual(["rule-assign", "copy", "duplicate", "color", "delete"]);
    expect(visibleText(byTestId("flow-menu-item-rule-assign"))).toBe("룰 지정…");
    await click("flow-menu-item-rule-assign");
    await settle(10);
    expect(header()).toEqual(["빈 단계", "빈 단계"]);
    expect(byTestId("flow-section-rules").getAttribute("data-open")).toBe("true");
    expect(document.activeElement).toBe(byTestId("flow-rule-panel-search"));
  });

  it("선 [+] 「룰 넣기」 도 그 선에 빈 단계를 놓고 「룰 지정」 을 연다", async () => {
    await openSet("TK_7", viewOf("TK_7", null));
    await click("flow-mode-edit");
    await hoverEdge("e2");
    await click("flow-edge-add-e2");
    await click("flow-menu-item-insert-rule");
    await settle(10);
    expect(kindOf("r3")).toBe("TASK");
    expect(header()[0]).toBe("빈 단계");
    expect(document.querySelector('[data-testid="flow-rule-search-keyword"]')).toBeNull();
  });

  it("보기 모드 — 빈 단계를 골라도 「룰 목록」 이고 속성은 읽기 전용. 디버그 모드에서 빈 단계에 중단점을 걸 수 있다", async () => {
    const { flow } = taskFlow();
    await openSet("TK_8", viewOf("TK_8", flow));
    await click("flow-node-r3");
    expect(header()).toEqual(["빈 단계", "빈 단계"]);
    expect(byTestId("flow-section-rules-head").textContent).toContain("룰 목록");
    expect(byTestId<HTMLInputElement>("flow-prop-task-title").readOnly).toBe(true);
    await click("flow-mode-debug");
    expect(q("flow-bp-r3")).not.toBeNull();
  });
});

describe("FlowCanvas — 빈 단계 제목 칸은 onRenameTask 하나만 바뀌어도 따른다(Local-Rules §19)", () => {
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
  const noop = () => {};
  const draw = async (p: FlowCanvasProps) => {
    await act(async () => {
      root.render(createElement(DmesUiProvider, null, createElement("div", { style: { width: 800, height: 600 } }, createElement(FlowCanvas, p))));
    });
    await flush();
  };

  it("처음엔 없어 두 번 눌러도 칸이 없고, onRenameTask 만 넣어 다시 그리면 칸이 열려 Enter 로 부른다", async () => {
    const flow = must(insertTask(toEditFlow(null, ["R_A"]), "e2")); // start → r1 → r2(TASK) → end
    const base: FlowCanvasProps = {
      flow, rules: {}, checks: [], mode: "edit", varDisplay: "off", selectedId: null, selectedEdgeId: null, overlay: null, focusId: null, focusSeq: 0,
      onSelect: noop, onSelectEdge: noop, onOpenRule: noop, onMove: noop, onConnect: noop, onDropPalette: noop, onNoteChange: noop,
      breakpoints: new Set(), collapsed: new Set(), showMiniMap: false, editingCondEdgeId: null, onMoveNode: noop, onDropRule: noop,
      onContextMenu: noop, onEditCond: noop, onEditCondClose: noop, onToggleBreakpoint: noop,
    };
    await draw(base);
    await dblTitle("r2");
    expect(document.querySelector('[data-testid="flow-task-title-input-r2"]')).toBeNull();
    const onRenameTask = vi.fn();
    await draw({ ...base, onRenameTask });
    await dblTitle("r2");
    const input = document.querySelector<HTMLInputElement>('[data-testid="flow-task-title-input-r2"]')!;
    expect(input).not.toBeNull();
    await typeInto(input, "새 제목");
    await keyOn(input, "Enter");
    expect(onRenameTask).toHaveBeenCalledWith("r2", "새 제목");
  });
  it("라벨이 null 인 빈 단계를 열었다 바꾸지 않고 닫으면 onRenameTask 를 부르지 않는다", async () => {
    const f = must(updateNodeLabel(must(insertTask(toEditFlow(null, ["R_A"]), "e2")), "r2", null));
    const onRenameTask = vi.fn();
    const noop = () => {};
    await draw({
      flow: f, rules: {}, checks: [], mode: "edit", varDisplay: "off", selectedId: null, selectedEdgeId: null, overlay: null, focusId: null, focusSeq: 0,
      onSelect: noop, onSelectEdge: noop, onOpenRule: noop, onMove: noop, onConnect: noop, onDropPalette: noop, onNoteChange: noop,
      breakpoints: new Set(), collapsed: new Set(), showMiniMap: false, editingCondEdgeId: null, onMoveNode: noop, onDropRule: noop,
      onContextMenu: noop, onEditCond: noop, onEditCondClose: noop, onToggleBreakpoint: noop, onRenameTask,
    });
    await dblTitle("r2");
    await keyOn(document.querySelector('[data-testid="flow-task-title-input-r2"]')!, "Enter");
    expect(onRenameTask).not.toHaveBeenCalled();
  });
});
