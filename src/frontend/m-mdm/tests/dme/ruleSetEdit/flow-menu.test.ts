/** @vitest-environment happy-dom */

// 룰 세트 흐름 우클릭 메뉴·복사/붙여넣기/복제·룰 바꾸기·분기 바꾸기/풀기·찾기·단축키 도움말(3단계 Task 8, B6·B7·B8·B9·C11·C12·D15).
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ openRuleEdit: vi.fn(), openMdmPage: vi.fn(), expandFor: vi.fn() }));

vi.mock("@/dme/rule-handoff", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/dme/rule-handoff")>()),
  openRuleEdit: (...args: unknown[]) => mocks.openRuleEdit(...args),
}));

vi.mock("@/shell", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shell")>()),
  openMdmPage: (...args: unknown[]) => mocks.openMdmPage(...args),
}));

// 접기 본문은 Task 11 이다 — 찾기가 펴기를 부르는지만 본다.
vi.mock("../../../pages/dme/ruleSetEdit/state/useCollapse", () => {
  const none = new Set<string>();
  return { useCollapse: () => ({ collapsed: none, toggle: () => {}, expandFor: mocks.expandFor }) };
});

import { NODE_LIMIT_MESSAGE, insertRule, insertSplit, toEditFlow, type EditFlow } from "../../../pages/dme/ruleSetEdit/flow-edit";
import type { RuleIo, RuleSetView } from "../../../pages/dme/ruleSetEdit/types";
import { flush, typeInto, visibleText } from "../helpers/render";
import { byTestId, canvasNodeIds, click, hoverEdge, inDoc, installServer, ok, openSet, q, settle, srv, uninstallServer } from "../helpers/rule-set-page";
import { pickInActive } from "./set-tabs-helpers";

const ioName = (n: string) => ({ name: n, source: "DICT" as const, label: null, dataType: null, scale: null, dateString: false, maruCodeId: null });
const rule = (ruleId: string, cond: string, result: string, name = `${ruleId} 이름`): RuleIo => ({
  ruleId, ruleName: name, ruleKind: "DECISION", status: "INUSE", exists: true, releasedVer: "1.000", hitPolicy: "FIRST",
  conds: [ioName(cond)], results: [{ ...ioName(result), source: null }],
});
const RULES = [rule("E2S_GRD", "SET_THK", "S_GRD"), rule("E2S_FCT", "S_GRD", "S_FCT"), rule("E2S_SPD", "S_FCT", "S_SPD")];

function viewOf(setId: string, flow: EditFlow | null, ruleIds = ["E2S_GRD", "E2S_FCT", "E2S_SPD"], rules = RULES): RuleSetView {
  return {
    set: { setId, setName: "이름", description: null, status: "INUSE", rowVersion: 3, ruleIds, flow, branched: false },
    rules, checks: [], condIo: {}, editable: true, restorable: false, cases: [],
  };
}
const chainView = (setId = "E2S_CHAIN") => viewOf(setId, null);

/** r1 → IF(갈래 1: r4 → r3(빈 단계), 갈래 2(그 외): 빈) → r2(모이는 자리, implicit-join §8.2). */
function ifFlow(): EditFlow {
  const base = toEditFlow(null, ["E2S_GRD", "E2S_FCT"]);
  const s = insertSplit(base, "e2", "IF");
  if (!s.ok) throw new Error(s.reason);
  const branch = s.flow.edges.find((e) => e.from === "if1" && !e.otherwise)!;
  const r = insertRule(s.flow, branch.id, "E2S_SPD");
  if (!r.ok) throw new Error(r.reason);
  return r.flow;
}
const ifView = () => viewOf("E2S_IF", ifFlow());

async function ctxMenu(id: string, at = { x: 120, y: 80 }) {
  await act(async () => {
    byTestId(id).dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: at.x, clientY: at.y }));
  });
  await flush();
}
const edgeEl = (id: string) => q(`rf__edge-${id}`)!;
async function ctxEdge(id: string) {
  await act(async () => {
    edgeEl(id).dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 200, clientY: 100 }));
  });
  await flush();
}
async function ctxPane(at = { x: 120, y: 80 }) {
  const pane = byTestId("flow-canvas").querySelector(".react-flow__pane")!;
  await act(async () => {
    pane.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: at.x, clientY: at.y }));
  });
  await flush();
}
async function clickEdge(id: string) {
  await act(async () => {
    edgeEl(id).dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flush();
}
async function key(el: Element, init: KeyboardEventInit): Promise<KeyboardEvent> {
  const ev = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  await act(async () => {
    el.dispatchEvent(ev);
  });
  await flush();
  return ev;
}
const menuIds = () =>
  Array.from(document.querySelectorAll('[data-testid^="flow-menu-item-"]')).map((e) => e.getAttribute("data-testid")!.slice("flow-menu-item-".length));
const canvas = () => byTestId("flow-canvas");
const kindOf = (id: string) => byTestId(`flow-node-${id}`).getAttribute("data-kind");

describe("흐름 우클릭 메뉴·편집(3단계 Task 8)", () => {
  beforeEach(() => {
    installServer();
    localStorage.clear();
    mocks.expandFor.mockClear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    uninstallServer();
  });

  it("1. 룰 노드 우클릭 — 편집 모드는 바꾸기·복사·복제·색상·삭제 뒤 룰 편집 열기, 보기 모드는 룰 편집 열기만, 디버그 모드는 편집 항목 없음", async () => {
    await openSet("E2S_CHAIN", chainView());
    await ctxMenu("flow-node-r1");
    expect(menuIds()).toEqual(["open-rule"]);
    await key(byTestId("flow-menu"), { key: "Escape" });
    expect(q("flow-menu")).toBeNull();

    await click("flow-mode-edit");
    await ctxMenu("flow-node-r1");
    expect(menuIds()).toEqual(["rule-replace", "copy", "duplicate", "catch-add", "color", "delete", "open-rule"]);
    await key(byTestId("flow-menu"), { key: "Escape" });

    await click("flow-mode-debug");
    await ctxMenu("flow-node-r1");
    const ids = menuIds();
    for (const id of ["rule-replace", "copy", "duplicate", "delete"]) expect(ids).not.toContain(id);
    expect(ids).toContain("open-rule");
  });

  it("1b. 메뉴가 열리면 첫 항목에 초점이 간다", async () => {
    await openSet("E2S_CHAIN", chainView());
    await click("flow-mode-edit");
    await ctxMenu("flow-node-r1");
    expect(document.activeElement).toBe(byTestId("flow-menu-item-rule-replace"));
  });

  it("2. IF 노드 우클릭 — 병렬로 바꾸기·분기 풀기(갈래별)·갈래 더하기·블록 복사·블록 삭제. 종류 바꾸기는 PARALLEL 이 된다", async () => {
    await openSet("E2S_IF", ifView());
    await click("flow-mode-edit");
    expect(kindOf("if1")).toBe("IF");
    await ctxMenu("flow-node-if1");
    const ids = menuIds();
    expect(ids.filter((i) => !i.startsWith("dissolve-"))).toEqual(["split-kind", "dissolve", "add-branch", "copy", "delete", "collapse"]);
    expect(ids.filter((i) => i.startsWith("dissolve-"))).toHaveLength(2);
    expect(visibleText(byTestId("flow-menu-item-split-kind"))).toBe("병렬로 바꾸기");
    const labels = Array.from(document.querySelectorAll('[data-testid^="flow-menu-item-dissolve-"]')).map((e) => visibleText(e));
    expect(labels.filter((l) => l.includes("(빈 갈래)"))).toHaveLength(1);

    await click("flow-menu-item-split-kind");
    expect(kindOf("if1")).toBe("PARALLEL");
    await ctxMenu("flow-node-if1");
    expect(visibleText(byTestId("flow-menu-item-split-kind"))).toBe("IF로 바꾸기");
  });

  it("3. 조건 갈래를 남기고 풀면 분기가 사라지고 안쪽 룰이 남는다", async () => {
    await openSet("E2S_IF", ifView());
    await click("flow-mode-edit");
    const f = ifFlow();
    const keep = f.edges.find((e) => e.from === "if1" && !e.otherwise)!;
    await ctxMenu("flow-node-if1");
    await click(`flow-menu-item-dissolve-${keep.id}`);
    const ids = canvasNodeIds();
    expect(ids).not.toContain("if1");
    expect(ids.some((i) => i.startsWith("m"))).toBe(false);
    expect(ids).toContain("r3");
  });

  it("4. 선 우클릭 — 끼우기 셋·조건 편집·선 삭제(클립보드가 비면 붙여넣기 없음). [+] 는 앞 셋만", async () => {
    await openSet("E2S_IF", ifView());
    await click("flow-mode-edit");
    const f = ifFlow();
    const cond = f.edges.find((e) => e.from === "if1" && !e.otherwise)!;
    const other = f.edges.find((e) => e.from === "if1" && e.otherwise)!;
    await ctxEdge(cond.id);
    expect(menuIds()).toEqual(["insert-rule", "insert-set", "insert-if", "insert-par", "edit-cond", "edit-label", "edge-delete"]);
    await key(byTestId("flow-menu"), { key: "Escape" });
    await ctxEdge(other.id); // "그 외" 갈래는 조건 편집이 없다
    expect(menuIds()).toEqual(["insert-rule", "insert-set", "insert-if", "insert-par", "edit-label", "edge-delete"]);
    await key(byTestId("flow-menu"), { key: "Escape" });

    await hoverEdge(cond.id);
    await click(`flow-edge-add-${cond.id}`);
    expect(menuIds()).toEqual(["insert-rule", "insert-set", "insert-if", "insert-par"]);
  });

  it("5. 룰 복사 뒤 선 우클릭에 붙여넣기가 생기고 누르면 새 룰 노드가 들어간다. 다른 세트를 열어도 클립보드가 남는다", async () => {
    srv.views.E2S_OTHER = viewOf("E2S_OTHER", null, ["E2S_FCT"], [RULES[1]]); // 복사한 E2S_GRD 는 이 세트의 룰 정보에 없다
    await openSet("E2S_CHAIN", chainView(), { tabId: "tab-1" });
    await click("flow-mode-edit");
    await ctxMenu("flow-node-r1");
    await click("flow-menu-item-copy");
    await ctxEdge("e3");
    expect(menuIds()).toEqual(["insert-rule", "insert-set", "insert-if", "insert-par", "paste", "edit-label", "edge-delete"]);
    await click("flow-menu-item-paste");
    expect(canvasNodeIds()).toHaveLength(6); // start + r1..r3 + 새 룰 + end
    expect(canvasNodeIds()).toContain("r4");

    // 이 탭에서 다른 세트를 연다(툴바 세트 고르기) — 클립보드는 탭(편집기)마다 있다. 세트 탭(하위 세트 spec §10.3, ui:7) 뒤로 포털 넘김은 새 탭으로 연다.
    window.confirm = vi.fn(() => true);
    await pickInActive("E2S_OTHER");
    expect(byTestId("set-edit-current").textContent).toContain("E2S_OTHER");
    await click("flow-mode-edit");
    await ctxEdge("e2");
    expect(menuIds()).toContain("paste");
    await click("flow-menu-item-paste");
    // 조각이 룰 정보(IO)를 함께 들고 와서 대상 세트에 없던 룰도 이름으로 보인다.
    expect(canvasNodeIds()).toContain("r2");
    expect(visibleText(byTestId("flow-node-r2"))).toContain("E2S_GRD");
    expect(visibleText(byTestId("flow-node-r2"))).not.toContain("없는 룰");
  });

  it("6. 캔버스 Ctrl+C·Ctrl+V·Ctrl+D — 붙여넣기·복제, 선택 없이 Ctrl+V 는 안내, 노드가 가득 차면 상한 문구", async () => {
    await openSet("E2S_CHAIN", chainView());
    await click("flow-mode-edit");
    await click("flow-node-r1");
    const copy = await key(canvas(), { key: "c", ctrlKey: true });
    expect(copy.defaultPrevented).toBe(true);
    await clickEdge("e3");
    const paste = await key(canvas(), { key: "v", ctrlKey: true });
    expect(paste.defaultPrevented).toBe(true);
    expect(canvasNodeIds()).toContain("r4");

    await click("flow-node-r2");
    await key(canvas(), { key: "d", ctrlKey: true });
    expect(canvasNodeIds()).toContain("r5");

    // 선택 해제 후 Ctrl+V
    await act(async () => {
      canvas().focus();
    });
    await key(canvas(), { key: "Escape" });
    await key(canvas(), { key: "v", ctrlKey: true });
    expect(visibleText(byTestId("set-message"))).toContain("붙여 넣을 선을 먼저 고른다");
  });

  it("6b. 노드 200 개 흐름에서 붙여넣기는 상한 문구로 거부한다", async () => {
    const ids = Array.from({ length: 198 }, (_, i) => `R_${i}`);
    await openSet("E2S_BIG", viewOf("E2S_BIG", toEditFlow(null, ids), ids, []));
    await click("flow-mode-edit");
    await click("flow-node-r1");
    await key(canvas(), { key: "c", ctrlKey: true });
    await clickEdge("e2");
    await key(canvas(), { key: "v", ctrlKey: true });
    expect(visibleText(byTestId("set-message"))).toContain(NODE_LIMIT_MESSAGE);
    expect(canvasNodeIds()).toHaveLength(200);
  });

  it("7. 룰 바꾸기 — 「룰 지정」 섹션에서 고르면 노드 자리·선은 그대로 ruleId 만 바뀌고 IO 가 들어온다", async () => {
    const NEW = rule("E2S_NEW", "S_GRD", "S_NEW", "새 룰");
    srv.replies["search:RULE"] = ok({ rules: [NEW] });
    await openSet("E2S_CHAIN", chainView());
    await click("flow-mode-edit");
    await ctxMenu("flow-node-r2");
    await click("flow-menu-item-rule-replace");
    await typeInto(byTestId<HTMLInputElement>("flow-rule-panel-search"), "E2S_");
    await click("flow-rule-panel-find");
    await settle(20);
    await click("flow-rule-assign-E2S_NEW");
    expect(canvasNodeIds().sort()).toEqual(["end", "r1", "r2", "r3", "start"].sort());
    expect(visibleText(byTestId("flow-node-r2"))).toContain("E2S_NEW");
    expect(edgeEl("e2")).not.toBeNull();
    expect(edgeEl("e3")).not.toBeNull();
  });

  it("8. 빈 곳 우클릭 — 메모·자동 정렬·화면 맞춤, 선이 선택돼 있고 클립보드가 있으면 붙여넣기. 보기 모드는 화면 맞춤만", async () => {
    await openSet("E2S_CHAIN", chainView());
    await ctxPane();
    expect(menuIds()).toEqual(["fit"]);
    await key(byTestId("flow-menu"), { key: "Escape" });

    await click("flow-mode-edit");
    await ctxPane();
    expect(menuIds()).toEqual(["note-add", "auto-layout", "fit"]);
    await click("flow-menu-item-note-add");
    expect(byTestId("flow-canvas").querySelectorAll('[data-testid^="flow-note-"]').length).toBeGreaterThan(0);

    await ctxMenu("flow-node-r1");
    await click("flow-menu-item-copy");
    await ctxPane();
    expect(menuIds()).not.toContain("paste"); // 고른 선이 없다
    await key(byTestId("flow-menu"), { key: "Escape" });
    await clickEdge("e3");
    await ctxPane();
    expect(menuIds()).toEqual(["note-add", "paste", "auto-layout", "fit"]);
    await click("flow-menu-item-paste");
    expect(canvasNodeIds()).toContain("r4");
  });

  it("9. Esc — 메뉴가 열려 있으면 메뉴만 닫고, 닫혀 있으면 선택을 푼다", async () => {
    await openSet("E2S_CHAIN", chainView());
    await click("flow-mode-edit");
    await clickEdge("e2");
    expect(edgeEl("e2").classList.contains("selected")).toBe(true);
    await ctxPane();
    await key(byTestId("flow-menu-item-note-add"), { key: "Escape" });
    expect(q("flow-menu")).toBeNull();
    expect(edgeEl("e2").classList.contains("selected")).toBe(true);
    await act(async () => {
      canvas().focus();
    });
    await key(canvas(), { key: "Escape" });
    expect(edgeEl("e2").classList.contains("selected")).toBe(false);
  });

  it("10. 찾기 — Ctrl+F 가 찾기 위젯을 열고 입력 칸에 초점, GRD 는 1/2, Enter 로 다음 결과를 깜빡이며 접힌 블록을 펴고, 없으면 '결과 없음'. 찾기 칸 안 Ctrl+Z·Delete 는 막지 않는다", async () => {
    const rules = [rule("E2S_GRD", "SET_THK", "S_GRD"), rule("E2S_GRD_B", "S_GRD", "S_B"), rule("E2S_FCT", "S_B", "S_FCT")];
    await openSet("E2S_FIND", viewOf("E2S_FIND", null, ["E2S_GRD", "E2S_GRD_B", "E2S_FCT"], rules));
    await click("flow-mode-edit");
    expect(q("flow-find-widget")).toBeNull();
    const f = await key(canvas(), { key: "f", ctrlKey: true });
    expect(f.defaultPrevented).toBe(true);
    const find = byTestId<HTMLInputElement>("flow-find");
    expect(document.activeElement).toBe(find);

    await typeInto(find, "GRD");
    expect(byTestId("flow-find-count").textContent).toBe("1/2");
    // 글자만 쳐서는 고르지도 옮기지도 않는다.
    expect(mocks.expandFor).not.toHaveBeenCalled();
    expect(byTestId("flow-node-r1").getAttribute("data-selected")).toBe("false");
    await settle(50);
    expect(byTestId("flow-node-r1").className).not.toContain("rsf-flash");
    mocks.expandFor.mockClear();
    // 첫 Enter 는 첫 결과로, 둘째는 둘째 결과로, 셋째는 다시 첫 결과로.
    await key(find, { key: "Enter" });
    await settle(50);
    expect(byTestId("flow-find-count").textContent).toBe("1/2");
    expect(mocks.expandFor).toHaveBeenCalledWith("r1");
    expect(byTestId("flow-node-r1").getAttribute("data-selected")).toBe("true");
    expect(byTestId("flow-node-r1").className).toContain("rsf-flash");
    await key(find, { key: "Enter" });
    await settle(50);
    expect(byTestId("flow-find-count").textContent).toBe("2/2");
    expect(mocks.expandFor).toHaveBeenLastCalledWith("r2");
    expect(byTestId("flow-node-r2").className).toContain("rsf-flash");
    await click("flow-find-next");
    expect(byTestId("flow-find-count").textContent).toBe("1/2");
    expect(mocks.expandFor).toHaveBeenLastCalledWith("r1");

    const z = await key(find, { key: "z", ctrlKey: true });
    const del = await key(find, { key: "Delete" });
    expect(z.defaultPrevented).toBe(false);
    expect(del.defaultPrevented).toBe(false);

    await typeInto(find, "zzz");
    expect(byTestId("flow-find-count").textContent).toBe("결과 없음");
  });

  it("10b. Mac 에서는 Ctrl+Z 가 되돌리기가 아니고 Cmd+Z 가 되돌리기다", async () => {
    vi.spyOn(window.navigator, "platform", "get").mockReturnValue("MacIntel");
    await openSet("E2S_CHAIN", chainView());
    await click("flow-mode-edit");
    await click("flow-add-if");
    expect(canvasNodeIds()).toContain("if1");
    const ctrl = await key(canvas(), { key: "z", ctrlKey: true });
    expect(ctrl.defaultPrevented).toBe(false);
    expect(canvasNodeIds()).toContain("if1");
    const cmd = await key(canvas(), { key: "z", metaKey: true });
    expect(cmd.defaultPrevented).toBe(true);
    expect(canvasNodeIds()).not.toContain("if1");
  });

  it("10b. 찾기 칸 — 한글 조합 중 Enter(isComposing)는 다음 결과로 넘기지 않는다", async () => {
    const rules = [rule("E2S_GRD", "SET_THK", "S_GRD"), rule("E2S_GRD_B", "S_GRD", "S_B")];
    await openSet("E2S_FIND", viewOf("E2S_FIND", null, ["E2S_GRD", "E2S_GRD_B"], rules));
    await click("flow-mode-edit");
    await click("flow-find-open");
    const find = byTestId<HTMLInputElement>("flow-find");
    await typeInto(find, "GRD");
    mocks.expandFor.mockClear();
    const composing = await key(find, { key: "Enter", isComposing: true });
    await settle(50);
    expect(composing.defaultPrevented).toBe(false);
    expect(mocks.expandFor).not.toHaveBeenCalled();
    await key(find, { key: "Enter" });
    await settle(50);
    expect(mocks.expandFor).toHaveBeenCalledWith("r1");
  });

  it("11a. 도움말이 열려 있을 때 Esc 는 도움말만 닫고 선택은 그대로 둔다. 닫힌 뒤 Esc 는 선택을 푼다", async () => {
    await openSet("E2S_CHAIN", chainView());
    await click("flow-mode-edit");
    await clickEdge("e2");
    await click("flow-help");
    expect(q("flow-help-panel")).not.toBeNull();
    await act(async () => {
      canvas().focus();
    });
    await key(canvas(), { key: "Escape" });
    expect(q("flow-help-panel")).toBeNull();
    expect(edgeEl("e2").classList.contains("selected")).toBe(true);
    await key(canvas(), { key: "Escape" });
    expect(edgeEl("e2").classList.contains("selected")).toBe(false);
  });

  it("11. [?] — 모드별 단축키 목록. Mac 이면 ⌘ 표기와 fn 문구", async () => {
    await openSet("E2S_CHAIN", chainView());
    await click("flow-help");
    let text = visibleText(byTestId("flow-help-panel"));
    expect(text).toContain("노드 찾기");
    expect(text).not.toContain("되돌리기");
    expect(text).not.toContain("Ctrl+Z");
    await click("flow-mode-edit");
    text = visibleText(byTestId("flow-help-panel"));
    expect(text).toContain("Ctrl+Z");
    expect(text).toContain("되돌리기");
    expect(text).not.toContain("F10");
    await click("flow-mode-debug");
    expect(visibleText(byTestId("flow-help-panel"))).toContain("F10");
    await click("flow-help");
    expect(q("flow-help-panel")).toBeNull();
  });

  it("11b. Mac 이면 ⌘ 표기와 'F9·F10·F5 는 fn 과 함께' 문구", async () => {
    vi.spyOn(window.navigator, "platform", "get").mockReturnValue("MacIntel");
    await openSet("E2S_CHAIN", chainView());
    await click("flow-mode-edit");
    await click("flow-help");
    const text = visibleText(byTestId("flow-help-panel"));
    expect(text).toContain("⌘Z");
    expect(text).not.toContain("Ctrl+Z");
    expect(text).toContain("F9·F10·F5 는 fn 과 함께");
  });
});
