/** @vitest-environment happy-dom */

// Task 8 — 룰 노드에 사용자 이름(label): 그리기·두 번 누르기 편집·패널 「이름」·assignRule 유지·찾기·복사.
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

import { FlowCanvas, type FlowCanvasProps } from "../../../pages/dme/ruleSetEdit/canvas/FlowCanvas";
import {
  assignRule, copyFragment, duplicateNode, flowJsonOf, insertTask, pasteFragment, toEditFlow, updateNodeLabel, type EditFlow, type EditResult,
} from "../../../pages/dme/ruleSetEdit/flow-edit";
import { panelTargetOf } from "../../../pages/dme/ruleSetEdit/panels/PanelHeader";
import { findNodes } from "../../../pages/dme/ruleSetEdit/state/useFind";
import type { RuleIo, RuleSetView } from "../../../pages/dme/ruleSetEdit/types";
import { flush, installDomStorage, typeInto } from "../helpers/render";
import { byTestId, calls, click, installServer, openSet, ok as okReply, settle, srv, uninstallServer } from "../helpers/rule-set-page";

function must(r: EditResult): EditFlow {
  if (!r.ok) throw new Error(r.reason);
  return r.flow;
}
const io = (ruleId: string, ruleName: string | null = `${ruleId} 이름`, exists = true): RuleIo => ({
  ruleId, ruleName, ruleKind: "DECISION", status: "INUSE", exists, releasedVer: 1, hitPolicy: "FIRST", conds: [], results: [],
});
const labelOf = (f: EditFlow, id: string) => f.nodes.find((n) => n.id === id)?.label;

describe("assignRule — 라벨 유지(N3)", () => {
  it("빈 단계에 붙은 사용자 제목은 룰 노드 이름으로 남고, 기본 제목(빈 단계)·라벨 없음은 null", () => {
    const base = toEditFlow(null, ["R_A", "R_B"]);
    const named = must(insertTask(base, "e2", "검사 자리"));
    expect(labelOf(must(assignRule(named, "r3", "R_Z")), "r3")).toBe("검사 자리");
    const dflt = must(insertTask(base, "e2")); // 기본 제목 「빈 단계」
    expect(labelOf(must(assignRule(dflt, "r3", "R_Z")), "r3")).toBeNull();
    const none = must(updateNodeLabel(dflt, "r3", null));
    expect(labelOf(must(assignRule(none, "r3", "R_Z")), "r3")).toBeNull();
  });

  it("룰 노드의 룰 바꾸기도 라벨을 지우지 않는다. 저장 JSON 에 label 이 실린다", () => {
    const f = must(updateNodeLabel(toEditFlow(null, ["R_A", "R_B"]), "r1", "내 이름"));
    const g = must(assignRule(f, "r1", "R_Y"));
    expect(labelOf(g, "r1")).toBe("내 이름");
    const json = JSON.parse(flowJsonOf(g)) as EditFlow;
    expect(json.nodes.find((n) => n.id === "r1")).toEqual({ id: "r1", kind: "RULE", ruleId: "R_Y", splitId: null, label: "내 이름" });
  });

  it("복사·붙여넣기·복제는 라벨을 함께 옮긴다", () => {
    const f = must(updateNodeLabel(toEditFlow(null, ["R_A", "R_B"]), "r1", "내 이름"));
    const dup = must(duplicateNode(f, "r1"));
    expect(dup.nodes.filter((n) => n.kind === "RULE").map((n) => n.label)).toEqual(["내 이름", "내 이름", null]);
    const frag = copyFragment(f, "r1");
    if (typeof frag === "string") throw new Error(frag);
    const pasted = must(pasteFragment(f, "e3", frag));
    expect(pasted.nodes.filter((n) => n.label === "내 이름")).toHaveLength(2);
  });

  it("찾기는 룰 노드 라벨로도 찾고, 패널 머리글 이름은 라벨을 먼저 쓴다(N4·N5)", () => {
    const f = must(updateNodeLabel(toEditFlow(null, ["R_A", "R_B"]), "r2", "마감 검증"));
    const rules = { R_A: io("R_A"), R_B: io("R_B") };
    expect(findNodes(f, rules, "마감")).toEqual(["r2"]);
    expect(panelTargetOf(f, rules, "r2", null, "세트").name).toBe("마감 검증");
    expect(panelTargetOf(f, rules, "r1", null, "세트").name).toBe("R_A 이름");
    expect(panelTargetOf(must(updateNodeLabel(f, "r2", null)), rules, "r2", null, "세트").name).toBe("R_B 이름");
  });
});

describe("룰 노드 이름 — 그리기와 즉석 편집", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    installDomStorage();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => { act(() => root.unmount()); host.remove(); document.body.innerHTML = ""; });
  const noop = () => {};
  async function draw(over: Partial<FlowCanvasProps>, rules: Record<string, RuleIo>, flow = toEditFlow(null, Object.keys(rules))) {
    const p: FlowCanvasProps = {
      flow, rules, checks: [], mode: "view", varDisplay: "off", selectedId: null, selectedEdgeId: null,
      overlay: null, focusId: null, focusSeq: 0, onSelect: noop, onSelectEdge: noop, onOpenRule: noop, onMove: noop, onConnect: noop,
      onDropPalette: noop, onNoteChange: noop, breakpoints: new Set(), collapsed: new Set(), showMiniMap: false, editingCondEdgeId: null,
      onMoveNode: noop, onDropRule: noop, onContextMenu: noop, onEditCond: noop, onEditCondClose: noop, onToggleBreakpoint: noop, ...over,
    };
    await act(async () => {
      root.render(createElement(DmesUiProvider, null, createElement("div", { style: { width: 800, height: 600 } }, createElement(FlowCanvas, p))));
    });
    await flush();
  }
  const rows = () => Array.from(document.querySelectorAll(".rsf-rule")).map((n) => [n.querySelector(".rsf-title")?.textContent, n.querySelector(".rsf-id")?.textContent ?? null]);
  const rulesA = { R_A: io("R_A", "가 룰") };
  const named = (name: string | null, ids = ["R_A"]) => must(updateNodeLabel(toEditFlow(null, ids), "r1", name));

  it("라벨이 있으면 제목=라벨, 작은 줄=지금 제목이던 값(이름 모드 룰명·ID 모드 룰 ID). 라벨 없으면 예전 그대로", async () => {
    await draw({ varDisplay: "name" }, rulesA, named("내 이름"));
    expect(rows()).toEqual([["내 이름", "가 룰"]]);
    await draw({ varDisplay: "id" }, rulesA, named("내 이름"));
    expect(rows()).toEqual([["내 이름", "R_A"]]);
    await draw({ varDisplay: "name" }, rulesA, named(null));
    expect(rows()).toEqual([["가 룰", "R_A"]]);
    await draw({ varDisplay: "id" }, rulesA, named(null));
    expect(rows()).toEqual([["R_A", "가 룰"]]);
  });

  it("룰명이 없으면 이름 모드 작은 줄은 룰 ID, 없는 룰이어도 제목은 라벨이고 부제는 그대로", async () => {
    await draw({ varDisplay: "name" }, { R_B: io("R_B", null) }, named("내 이름", ["R_B"]));
    expect(rows()).toEqual([["내 이름", "R_B"]]);
    await draw({ varDisplay: "id" }, { R_C: io("R_C", null, false) }, named("내 이름", ["R_C"]));
    expect(rows()).toEqual([["내 이름", "R_C"]]);
    expect(document.querySelector(".rsf-rule .rsf-sub")?.textContent).toBe("룰 정보를 찾지 못했다");
  });

  it("memo — 라벨만 바뀐 흐름에서도 다시 그려진다(다른 props 는 같은 참조)", async () => {
    const same = { checks: [], breakpoints: new Set<string>(), collapsed: new Set<string>() };
    await draw({ ...same, varDisplay: "name" }, rulesA, named("처음"));
    expect(rows()).toEqual([["처음", "가 룰"]]);
    await draw({ ...same, varDisplay: "name" }, rulesA, named("나중"));
    expect(rows()).toEqual([["나중", "가 룰"]]);
    await draw({ ...same, varDisplay: "name" }, rulesA, named(null));
    expect(rows()).toEqual([["가 룰", "R_A"]]);
  });

  const dbl = async () => {
    await act(async () => {
      document.querySelector('[data-testid="flow-rule-title-r1"]')!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    await flush();
  };
  const input = () => document.querySelector<HTMLInputElement>('[data-testid="flow-rule-title-input-r1"]');
  const key = async (k: string, extra: KeyboardEventInit = {}) => {
    await act(async () => {
      input()!.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...extra }));
    });
    await flush();
  };

  it("편집 모드: 두 번 누르기 → 칸(보이는 제목) → Enter 로 onRenameTask 한 번, 초점은 캔버스로", async () => {
    const onRenameTask = vi.fn();
    await draw({ mode: "edit", onRenameTask }, rulesA, named(null));
    await dbl();
    expect(input()!.value).toBe("가 룰");
    await typeInto(input()!, "내 이름");
    await key("Enter");
    expect(onRenameTask).toHaveBeenCalledTimes(1);
    expect(onRenameTask).toHaveBeenCalledWith("r1", "내 이름");
    expect(input()).toBeNull();
    expect(document.activeElement).toBe(document.querySelector('[data-testid="flow-canvas"]'));
  });

  it("Esc 는 취소, 빈 값은 null(라벨 지우기), 보이는 값 그대로면 편집 없음, IME 조합 중 Enter 는 무시", async () => {
    const onRenameTask = vi.fn();
    await draw({ mode: "edit", onRenameTask }, rulesA, named("내 이름"));
    await dbl();
    await typeInto(input()!, "버림");
    await key("Escape");
    expect(input()).toBeNull();
    expect(onRenameTask).not.toHaveBeenCalled();
    await dbl();
    await key("Enter"); // 값 그대로
    expect(onRenameTask).not.toHaveBeenCalled();
    await dbl();
    await typeInto(input()!, "조합중");
    await key("Enter", { isComposing: true });
    expect(input()).not.toBeNull();
    expect(onRenameTask).not.toHaveBeenCalled();
    await typeInto(input()!, "   ");
    await key("Enter");
    expect(onRenameTask).toHaveBeenCalledWith("r1", null);
  });

  it("라벨이 없을 때 룰명 그대로 닫으면 편집 없음. 칸 밖(blur)은 저장", async () => {
    const onRenameTask = vi.fn();
    await draw({ mode: "edit", onRenameTask }, rulesA, named(null));
    await dbl();
    await key("Enter");
    expect(onRenameTask).not.toHaveBeenCalled();
    await dbl();
    await typeInto(input()!, "밖에서");
    await act(async () => {
      input()!.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    await flush();
    expect(onRenameTask).toHaveBeenCalledWith("r1", "밖에서");
  });

  it("보기 모드에서는 칸이 열리지 않고, 열기 단추는 그대로", async () => {
    await draw({ mode: "view" }, rulesA, named("내 이름"));
    await dbl();
    expect(input()).toBeNull();
    await draw({ mode: "edit", onRenameTask: vi.fn() }, rulesA, named("내 이름"));
    expect(document.querySelector('[data-testid="flow-rule-open-r1"]')).not.toBeNull();
  });
});

describe("룰 노드 이름 — 오른쪽 패널 「이름」", () => {
  beforeEach(() => {
    installDomStorage();
    installServer();
    srv.replies.validate = okReply({ condIo: {} });
    localStorage.clear();
  });
  afterEach(() => uninstallServer());
  const viewOf = (setId: string): RuleSetView => ({
    set: { setId, setName: "이름 세트", description: null, status: "INUSE", rowVersion: 1, ruleIds: ["LB_A", "LB_B"], flow: toEditFlow(null, ["LB_A", "LB_B"]), branched: false },
    rules: [io("LB_A"), io("LB_B")], checks: [], condIo: {}, editable: true, restorable: false, cases: [],
  }) as RuleSetView;
  const field = () => byTestId<HTMLInputElement>("flow-prop-rule-label");
  const undoDisabled = () => (byTestId("flow-undo") as HTMLButtonElement).disabled;

  it("편집 모드에서 룰 노드를 고르면 「이름」 칸(placeholder=룰명) — 입력이 편집이고 되돌리기 한 칸, 저장 JSON 에 label", async () => {
    await openSet("LB_1", viewOf("LB_1"));
    await click("flow-mode-edit");
    await click("flow-node-r1");
    expect(field().placeholder).toBe("LB_A 이름");
    expect(field().readOnly).toBe(false);
    await typeInto(field(), "마");
    await typeInto(field(), "마감");
    expect(byTestId("flow-rule-title-r1").textContent).toBe("마감");
    expect(byTestId("flow-panel-name").textContent).toBe("마감");
    await click("flow-undo");
    expect(undoDisabled()).toBe(true); // 같은 칸 연속 입력은 한 칸
    expect(byTestId("flow-rule-title-r1").textContent).toBe("LB_A 이름");
    await click("flow-redo");
    await settle(500);
    await click("set-save");
    await settle();
    const saved = JSON.parse(String((calls("save").at(-1)!.body.params as Record<string, unknown>).flowJson)) as EditFlow;
    expect(saved.nodes.find((n) => n.id === "r1")?.label).toBe("마감");
    expect(saved.nodes.find((n) => n.id === "r2")?.label).toBeNull();
  });

  it("보기 모드에서는 읽기 전용", async () => {
    await openSet("LB_2", viewOf("LB_2"));
    await click("flow-node-r1");
    expect(field().readOnly).toBe(true);
  });
});
