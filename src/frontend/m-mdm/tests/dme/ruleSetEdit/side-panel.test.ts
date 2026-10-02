/** @vitest-environment happy-dom */

// 4단계 Task 8(P1) — 오른쪽 머리글(종류 아이콘·종류 이름·이름), 접는 섹션(여러 개 펼침·종류별 기억), 「룰 목록」/「룰 지정」 섹션.
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

import { panelTargetOf } from "../../../pages/dme/ruleSetEdit/panels/PanelHeader";
import { addGroup, addNote, insertSplit, toEditFlow, type EditFlow, type EditResult } from "../../../pages/dme/ruleSetEdit/flow-edit";
import type { RuleIo, RuleSetView } from "../../../pages/dme/ruleSetEdit/types";
import { flush, typeInto, visibleText } from "../helpers/render";
import { byTestId, calls, canvasNodeIds, click, installServer, ok, openSet, q, settle, srv, uninstallServer } from "../helpers/rule-set-page";

function must(r: EditResult): EditFlow {
  if (!r.ok) throw new Error(r.reason);
  return r.flow;
}
const io = (ruleId: string, extra: Partial<RuleIo> = {}): RuleIo => ({
  ruleId, ruleName: `${ruleId} 이름`, ruleKind: "DECISION", status: "INUSE", exists: true, releasedVer: 1, hitPolicy: "FIRST", conds: [], results: [], ...extra,
});
/** start → r1 → r2 → if1{e4 갈래 1 → r3(빈 단계) / e5 그 외} → end, 메모 n1, 그룹 g1(r1). 선 e1 start→r1, e2 r1→r2, e3 r2→if1, e6 r3→end(implicit-join §8.2). */
function richFlow(): EditFlow {
  let f = toEditFlow(null, ["SP_A", "SP_B"]);
  f = must(insertSplit(f, "e3", "IF"));
  f = addNote(f, { x: 600, y: 40 }, null).flow;
  return must(addGroup(f, ["r1"], "묶음"));
}
function viewOf(setId: string, flow: EditFlow | null = richFlow()): RuleSetView {
  return {
    set: { setId, setName: "섹션 세트", description: null, status: "INUSE", rowVersion: 1, ruleIds: ["SP_A", "SP_B"], flow, branched: true },
    rules: [io("SP_A"), io("SP_B")], checks: [], condIo: {}, editable: true, restorable: false, cases: [],
  } as RuleSetView;
}
const header = () => [byTestId("flow-panel-kind").textContent, byTestId("flow-panel-name").textContent];
/** 오른쪽 패널의 섹션 ID(위에서부터). */
const sectionIds = () =>
  Array.from(byTestId("flow-side").querySelectorAll('[data-testid^="flow-section-"]:not([data-testid$="-head"])')).map((e) =>
    e.getAttribute("data-testid")!.slice("flow-section-".length),
  );
const isOpen = (id: string) => byTestId(`flow-section-${id}`).getAttribute("data-open") === "true";
async function clickEdge(id: string) {
  await act(async () => {
    q(`rf__edge-${id}`)!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flush();
}
async function clickPane() {
  await act(async () => {
    byTestId("flow-canvas").querySelector(".react-flow__pane")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flush();
}
async function findRules(text: string) {
  await typeInto(byTestId<HTMLInputElement>("flow-rule-panel-search"), text);
  await click("flow-rule-panel-find");
  await settle(20);
}
async function dbl(id: string) {
  await act(async () => {
    byTestId(id).dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  });
  await flush();
}

describe("오른쪽 머리글·섹션(4단계 Task 8)", () => {
  beforeEach(() => {
    installServer();
    localStorage.clear();
    srv.replies["search:RULE"] = ok({ rules: [io("SP_NEW"), io("SP_DRAFT", { releasedVer: null })] });
  });
  afterEach(() => uninstallServer());

  it("머리글 — 고른 것마다 종류 아이콘·종류 이름·이름", async () => {
    await openSet("SP_1", viewOf("SP_1"));
    expect(header()).toEqual(["룰 세트", "섹션 세트"]);
    expect(byTestId("flow-panel-header").getAttribute("data-kind")).toBe("SET");
    expect(byTestId("flow-panel-header").querySelector("svg")).not.toBeNull();
    await click("flow-node-r1");
    expect(header()).toEqual(["룰", "SP_A 이름"]);
    await click("flow-node-if1");
    expect(header()).toEqual(["IF 분기", "조건"]);
    await clickEdge("e2");
    expect(header()).toEqual(["연결선", "r1 → r2"]);
    await click("flow-note-n1");
    expect(header()).toEqual(["메모", "n1"]);
    await clickPane();
    expect(header()).toEqual(["룰 세트", "섹션 세트"]);
  });

  it("섹션 — 기본은 모두 펼침, 여러 개를 함께 펼치고, 접은 상태는 종류별로 기억한다(다른 종류는 그대로)", async () => {
    await openSet("SP_2", viewOf("SP_2"));
    expect(sectionIds()).toEqual(["set-basic", "set-io", "set-guide", "rules"]);
    expect(["set-basic", "set-io", "set-guide", "rules"].every(isOpen)).toBe(true);
    await click("flow-node-r1");
    expect(sectionIds()).toEqual(["rule-basic", "rule-inputs", "rule-results", "rules"]); // 보기 모드 — 룰 목록은 맨 아래
    await click("flow-section-rule-inputs-head");
    expect(isOpen("rule-inputs")).toBe(false);
    expect(byTestId("flow-section-rule-inputs-head").getAttribute("aria-expanded")).toBe("false");
    expect(isOpen("rule-basic")).toBe(true);
    await click("flow-node-if1");
    expect(sectionIds()).toEqual(["split-basic", "split-branches"]); // IF — 룰 목록 없음
    expect(isOpen("split-basic") && isOpen("split-branches")).toBe(true);
    await click("flow-node-r2"); // 같은 종류(RULE)는 접은 상태가 남는다
    expect(isOpen("rule-inputs")).toBe(false);
    await click("flow-section-rule-inputs-head");
    expect(isOpen("rule-inputs")).toBe(true);
  });

  it("머리글 이름 — START·END 는 종류 이름, MERGE 는 「병렬 {분기} 합류」 (노드 ID 를 보이지 않는다)", () => {
    const f = richFlow();
    const name = (id: string) => panelTargetOf(f, {}, id, null, "세트").name;
    expect(name("start")).toBe("시작");
    expect(name("end")).toBe("끝");
    // 합류는 병렬에만 있다(implicit-join §8.2).
    const par = must(insertSplit(toEditFlow(null, ["SP_A"]), "e2", "PARALLEL"));
    expect(panelTargetOf(par, {}, "m1", null, "세트").name).toBe("병렬 par1 합류");
  });

  it("머리글 — 병렬 합류를 고르면 「병렬 합류」 와 분기 이름이다", async () => {
    await openSet("SP_M", viewOf("SP_M", must(insertSplit(toEditFlow(null, ["SP_A"]), "e2", "PARALLEL"))));
    await click("flow-node-m1");
    expect(header()).toEqual(["병렬 합류", "병렬 par1 합류"]);
  });

  it("섹션 aria-controls — 펼친 동안만 있고 실제 본문 id 를 가리키며, 접으면 없다", async () => {
    await openSet("SP_AC", viewOf("SP_AC"));
    const head = byTestId("flow-section-set-basic-head");
    const target = head.getAttribute("aria-controls");
    expect(target).toBeTruthy();
    expect(document.getElementById(target!)).not.toBeNull();
    await click("flow-section-set-basic-head");
    expect(byTestId("flow-section-set-basic-head").hasAttribute("aria-controls")).toBe(false);
    for (const el of Array.from(byTestId("flow-side").querySelectorAll(".rsf-section-head[aria-controls]"))) expect(document.getElementById(el.getAttribute("aria-controls")!)).not.toBeNull();
  });

  it("속성 섹션 안 기존 testid 가 그대로다(편집 입력·지우기·갈래)", async () => {
    await openSet("SP_3", viewOf("SP_3"));
    await click("flow-mode-edit");
    await click("flow-node-if1");
    expect(q("flow-prop-if")).not.toBeNull();
    expect(q("flow-prop-label")).not.toBeNull();
    expect(q("flow-prop-add-branch")).not.toBeNull();
    expect(q("flow-prop-delete")).not.toBeNull();
    await click("flow-node-r1");
    expect(visibleText(byTestId("flow-prop-rule"))).toContain("SP_A");
    expect(q("flow-prop-rule-open")).not.toBeNull();
  });

  it("「룰 목록」 — 고른 것 없음·선: 맨 아래, 두 번 누르면 고른 선(없으면 END 앞 선)에 끼우고 새 룰에서 나가는 선을 고른다", async () => {
    await openSet("SP_4", viewOf("SP_4", null)); // start → r1 → r2 → end (e1 e2 e3)
    await click("flow-mode-edit");
    await findRules("SP_");
    expect(q("flow-rule-row-SP_NEW")).not.toBeNull();
    expect(q("flow-rule-row-SP_DRAFT")).toBeNull();
    expect(byTestId("flow-section-rules-head").textContent).toContain("룰 목록");
    expect(q("flow-rule-assign-SP_NEW")).toBeNull();
    await dbl("flow-rule-row-SP_NEW"); // 고른 선 없음 → END 앞 선(e3)
    expect(canvasNodeIds()).toContain("r3");
    expect(header()[0]).toBe("연결선"); // 새 룰에서 나가는 선을 골랐다 — 「룰 목록」 이 그대로라 다음 두 번 누르기가 그 뒤에 잇는다
    expect(byTestId("flow-section-rules-head").textContent).toContain("룰 목록");
    await dbl("flow-rule-row-SP_NEW");
    expect(canvasNodeIds()).toContain("r4");
    await clickEdge("e1"); // 고른 선 e1(start→r1) 에 끼운다
    await dbl("flow-rule-row-SP_NEW");
    expect(canvasNodeIds()).toContain("r5");
    expect(q("rf__edge-e1")).not.toBeNull();
  });

  it("「룰 지정」 — 편집 모드에서 룰 노드를 고르면 맨 위·펼침·줄마다 [지정]. [지정]·두 번 누르기는 그 노드의 룰만 바꾸고 되돌리기 한 번에 돌아간다", async () => {
    await openSet("SP_5", viewOf("SP_5", null));
    await click("flow-mode-edit");
    await findRules("SP_");
    await click("flow-node-r1");
    expect(sectionIds()[0]).toBe("rules");
    expect(byTestId("flow-section-rules-head").textContent).toContain("룰 지정");
    expect(isOpen("rules")).toBe(true);
    await click("flow-rule-assign-SP_NEW");
    expect(visibleText(byTestId("flow-node-r1"))).toContain("SP_NEW");
    expect(canvasNodeIds().sort()).toEqual(["end", "r1", "r2", "start"]);
    expect(header()).toEqual(["룰", "SP_NEW 이름"]);
    await click("flow-undo");
    expect(visibleText(byTestId("flow-node-r1"))).toContain("SP_A");
    expect((byTestId("flow-undo") as HTMLButtonElement).disabled).toBe(true);
    await dbl("flow-rule-row-SP_NEW");
    expect(visibleText(byTestId("flow-node-r1"))).toContain("SP_NEW");
  });

  it("보기 모드 — 룰 노드를 골라도 「룰 목록」(맨 아래), 줄은 끌 수 없고 [지정]·두 번 누르기가 없다", async () => {
    await openSet("SP_6", viewOf("SP_6", null));
    await findRules("SP_");
    await click("flow-node-r1");
    expect(byTestId("flow-section-rules-head").textContent).toContain("룰 목록");
    expect(sectionIds().at(-1)).toBe("rules");
    expect(byTestId("flow-rule-row-SP_NEW").getAttribute("draggable")).toBe("false");
    expect(q("flow-rule-assign-SP_NEW")).toBeNull();
    await dbl("flow-rule-row-SP_NEW");
    expect(visibleText(byTestId("flow-node-r1"))).toContain("SP_A");
    expect(calls("save")).toHaveLength(0);
  });

  it("「룰 목록」 보임·숨김 — 고른 것과 쓰임이 있을 때만(세트·선·룰·빈 단계 보임 / 시작·끝·IF·병렬·합류·받는 노드·메모·그룹 숨김)", async () => {
    let f = toEditFlow(null, ["SP_A", "SP_B"]);
    f = must(insertSplit(f, "e3", "IF")); // r3(빈 단계)·if1
    f = must(insertSplit(f, "e1", "PARALLEL")); // par·m 합류
    f = must(addGroup(f, ["r1"], "묶음"));
    f = addNote(f, { x: 600, y: 40 }, null).flow;
    const mergeId = f.nodes.find((n) => n.kind === "MERGE")!.id;
    const parId = f.nodes.find((n) => n.kind === "PARALLEL")!.id;
    const taskId = f.nodes.find((n) => n.kind === "TASK")!.id;
    await openSet("SP_K", viewOf("SP_K", f));
    const hasList = () => q("flow-section-rules") !== null && q("flow-rule-panel-search") !== null;
    const noteId = f.view.notes[0].id;
    const groupId = f.view.groups[0].id;
    const nodeOrView = (id: string) => (id === noteId ? `flow-note-${id}` : id === groupId ? `flow-group-${id}` : `flow-node-${id}`);
    const cases: Array<[string, string | null, boolean]> = [
      ["SET", null, true],
      ["RULE", "r1", true],
      ["TASK", taskId, true],
      ["START", "start", false],
      ["END", "end", false],
      ["IF", "if1", false],
      ["PARALLEL", parId, false],
      ["MERGE", mergeId, false],
      ["NOTE", noteId, false],
      ["GROUP", groupId, false],
    ];
    for (const mode of ["flow-mode-edit", "flow-mode-view"]) {
      await click(mode);
      for (const [kind, id, shown] of cases) {
        if (id) await click(nodeOrView(id));
        else await clickPane();
        expect(byTestId("flow-side").getAttribute("data-kind"), `${mode} ${id}`).toBe(kind);
        expect(hasList(), `${mode} ${kind}`).toBe(shown);
      }
    }
    await click("flow-mode-edit");
    await clickEdge("e2");
    expect(byTestId("flow-side").getAttribute("data-kind")).toBe("EDGE");
    expect(hasList()).toBe(true); // 선 — 두 번 누르면 그 선에 끼운다
  });

  it("찾은 줄은 섹션을 접었다 펴도, 「룰 목록」↔「룰 지정」 으로 자리가 바뀌어도 남는다", async () => {
    await openSet("SP_7", viewOf("SP_7", null));
    await click("flow-mode-edit");
    await findRules("SP_");
    await click("flow-section-rules-head");
    expect(q("flow-rule-row-SP_NEW")).toBeNull();
    await click("flow-section-rules-head");
    expect(q("flow-rule-row-SP_NEW")).not.toBeNull();
    await click("flow-node-r1");
    expect(q("flow-rule-row-SP_NEW")).not.toBeNull();
    expect(byTestId<HTMLInputElement>("flow-rule-panel-search").value).toBe("SP_");
  });

  it("우클릭 [룰 바꾸기…] — 그 노드를 고르고 「룰 지정」 섹션을 펴고 찾기 칸에 초점을 둔다(접어 두었어도)", async () => {
    await openSet("SP_8", viewOf("SP_8", null));
    await click("flow-mode-edit");
    await click("flow-node-r2");
    await click("flow-section-rules-head"); // 접어 둔다
    expect(isOpen("rules")).toBe(false);
    await click("flow-node-r1");
    await act(async () => {
      byTestId("flow-node-r1").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 120, clientY: 80 }));
    });
    await flush();
    expect(visibleText(byTestId("flow-menu-item-rule-replace"))).toBe("룰 바꾸기…");
    await click("flow-menu-item-rule-replace");
    await settle(10);
    expect(header()).toEqual(["룰", "SP_A 이름"]);
    expect(isOpen("rules")).toBe(true);
    expect(document.activeElement).toBe(byTestId("flow-rule-panel-search"));
  });
});
