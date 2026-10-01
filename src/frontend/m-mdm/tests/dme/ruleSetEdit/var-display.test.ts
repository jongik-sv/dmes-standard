/** @vitest-environment happy-dom */

// 추가 Task V1 — [변수 흐름] 세 상태(끔·ID·이름): 순환·aria/data-mode·글자, 이름 모드 칩·툴팁, 저장소 기억, 디버그 진입/이탈 규칙.
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
import { loadVarDisplay, storeKeys } from "../../../pages/dme/ruleSetEdit/debugger/local-store";
import { insertSplit, toEditFlow } from "../../../pages/dme/ruleSetEdit/flow-edit";
import { varLabelsOf } from "../../../pages/dme/ruleSetEdit/set-model";
import type { RuleIo, RuleSetView } from "../../../pages/dme/ruleSetEdit/types";
import { installDomStorage } from "../helpers/render";
import { byTestId, click, installServer, openSet, q, uninstallServer } from "../helpers/rule-set-page";

const nm = (n: string, label: string | null) => ({ name: n, source: null, label, dataType: null, scale: null, dateString: false, maruCodeId: null });
function io(ruleId: string, conds: Array<[string, string | null]>, results: Array<[string, string | null]>): RuleIo {
  return {
    ruleId, ruleName: `${ruleId} 이름`, ruleKind: "DECISION", status: "INUSE", exists: true, releasedVer: 1, hitPolicy: "FIRST",
    conds: conds.map(([n, l]) => nm(n, l)), results: results.map(([n, l]) => nm(n, l)),
  };
}
function chainView(): RuleSetView {
  return {
    set: { setId: "V1S", setName: "사슬", description: null, status: "INUSE", rowVersion: 1, ruleIds: ["V1_A", "V1_B"], flow: null, branched: false },
    rules: [io("V1_A", [["SET_THK", "설정 두께"]], [["S_GRD", "등급"]]), io("V1_B", [["S_GRD", null]], [["S_NOLABEL", null]])],
    checks: [], condIo: {}, editable: true, restorable: false, cases: [],
  };
}
const attr = (id: string, a: string) => byTestId(id).getAttribute(a);
const chipTexts = () => Array.from(document.querySelectorAll('[data-testid^="flow-edge-chips-"] .rsf-vchip')).map((c) => c.textContent);

describe("varLabelsOf — 이름 → 표시명 표", () => {
  it("조건·결과의 표시명을 모으고, 표시명이 없는 이름은 뺀다", () => {
    const rules = { V1_A: chainView().rules[0], V1_B: chainView().rules[1] };
    expect(varLabelsOf(rules)).toEqual({ SET_THK: "설정 두께", S_GRD: "등급" });
  });
});

describe("local-store loadVarDisplay", () => {
  beforeEach(() => { installDomStorage(); localStorage.clear(); });
  it("저장된 값이 id·name 이면 그대로, 이상하면 off", () => {
    expect(loadVarDisplay()).toBe("off");
    localStorage.setItem(storeKeys.varDisplay, JSON.stringify("name"));
    expect(loadVarDisplay()).toBe("name");
    localStorage.setItem(storeKeys.varDisplay, JSON.stringify("zzz"));
    expect(loadVarDisplay()).toBe("off");
    localStorage.setItem(storeKeys.varDisplay, "{깨진");
    expect(loadVarDisplay()).toBe("off");
  });
});

describe("FlowCanvas 변수 칩 — 이름 모드", () => {
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
  async function draw(over: Partial<FlowCanvasProps>) {
    const r = insertSplit(toEditFlow(null, ["V1_A"]), "e2", "IF");
    if (!r.ok) throw new Error(r.reason);
    const p: FlowCanvasProps = {
      flow: r.flow, rules: { V1_A: io("V1_A", [], [["S_GRD", "등급"], ["S_X", null]]) }, checks: [], mode: "view", varDisplay: "id", selectedId: null, selectedEdgeId: null,
      overlay: null, focusId: null, focusSeq: 0, onSelect: noop, onSelectEdge: noop, onOpenRule: noop, onMove: noop, onConnect: noop,
      onDropPalette: noop, onNoteChange: noop, breakpoints: new Set(), collapsed: new Set(), showMiniMap: false, editingCondEdgeId: null,
      onMoveNode: noop, onDropRule: noop, onContextMenu: noop, onEditCond: noop, onEditCondClose: noop, onToggleBreakpoint: noop, ...over,
    };
    await act(async () => {
      root.render(createElement(DmesUiProvider, null, createElement("div", { style: { width: 800, height: 600 } }, createElement(FlowCanvas, p))));
    });
  }
  const labels = { S_GRD: "등급" };
  const titles = () => Array.from(document.querySelectorAll('[data-testid^="flow-edge-chips-"] .rsf-vchip')).map((c) => c.getAttribute("title"));

  it("ID 모드는 ID, 이름 모드는 표시명 — 표시명이 없으면 ID", async () => {
    await draw({ varDisplay: "id", varLabels: labels });
    expect(chipTexts()).toEqual(expect.arrayContaining(["S_GRD", "S_X"]));
    await draw({ varDisplay: "name", varLabels: labels });
    expect(chipTexts()).toEqual(expect.arrayContaining(["등급", "S_X"]));
    expect(chipTexts()).not.toContain("S_GRD");
  });

  it("툴팁은 모드와 관계없이 '표시명 (ID)', 표시명이 없으면 없다(디버그 밖)", async () => {
    await draw({ varDisplay: "id", varLabels: labels });
    expect(titles()).toEqual(expect.arrayContaining(["등급 (S_GRD)", null]));
    await draw({ varDisplay: "name", varLabels: labels });
    expect(titles()).toEqual(expect.arrayContaining(["등급 (S_GRD)", null]));
  });

  it("디버그 값이 있으면 '표시명 (ID) = 값' · 없으면 'ID = 값' · 아직이면 '· 아직 없음'", async () => {
    const valueOf = (n: string) => (n === "S_GRD" ? { type: "STRING", value: "A" } : n === "S_X" ? { type: "STRING", value: "Z" } : undefined);
    await draw({ varDisplay: "name", varLabels: labels, mode: "debug", valueAt: valueOf as unknown as FlowCanvasProps["valueAt"] });
    expect(titles()).toEqual(expect.arrayContaining(["등급 (S_GRD) = A", "S_X = Z"]));
    await draw({ varDisplay: "id", varLabels: labels, mode: "debug", valueAt: (() => undefined) as unknown as FlowCanvasProps["valueAt"] });
    expect(titles()).toEqual(expect.arrayContaining(["등급 (S_GRD) · 아직 없음", "S_X · 아직 없음"]));
  });
});

describe("[변수 흐름] 단추 — 세 상태", () => {
  beforeEach(() => {
    installServer();
    localStorage.clear();
    mocks.openRuleEdit.mockReset();
    mocks.openMdmPage.mockReset();
  });
  afterEach(() => uninstallServer());
  const mode = () => attr("flow-var-toggle", "data-mode");
  // 아이콘 단추라 글자 대신 aria-label 로 상태를 보인다(한 줄 툴바).
  const text = () => byTestId("flow-var-toggle").getAttribute("aria-label");
  const stored = () => localStorage.getItem(storeKeys.varDisplay);

  it("누를 때마다 off → id → name → off, 글자·aria-pressed·data-mode·저장소가 따라간다", async () => {
    await openSet("V1S", chainView());
    expect([mode(), attr("flow-var-toggle", "aria-pressed"), text()]).toEqual(["off", "false", "표시: 끔"]);
    expect(byTestId("flow-var-toggle").parentElement!.getAttribute("data-tip")).toBe("표시: 끔 — 선 변수 칩과 룰 노드 제목을 ID·이름으로 바꾼다. 끄면 변수 칩을 숨긴다");
    await click("flow-var-toggle");
    expect([mode(), attr("flow-var-toggle", "aria-pressed"), text()]).toEqual(["id", "true", "표시: ID"]);
    expect(chipTexts()).toContain("S_GRD");
    expect(stored()).toBe('"id"');
    await click("flow-var-toggle");
    expect([mode(), attr("flow-var-toggle", "aria-pressed"), text()]).toEqual(["name", "true", "표시: 이름"]);
    expect(chipTexts()).toContain("등급");
    expect(chipTexts()).toContain("S_NOLABEL");
    expect(stored()).toBe('"name"');
    await click("flow-var-toggle");
    expect([mode(), attr("flow-var-toggle", "aria-pressed"), text()]).toEqual(["off", "false", "표시: 끔"]);
    expect(byTestId("flow-var-toggle").parentElement!.getAttribute("data-tip")).toBe("표시: 끔 — 선 변수 칩과 룰 노드 제목을 ID·이름으로 바꾼다. 끄면 변수 칩을 숨긴다");
    expect(q("flow-edge-chips-e2")).toBeNull();
    expect(stored()).toBe('"off"');
  });

  it("저장된 마지막 선택으로 시작하고, 이상한 값이면 off", async () => {
    localStorage.setItem(storeKeys.varDisplay, JSON.stringify("name"));
    await openSet("V1S", chainView());
    expect(mode()).toBe("name");
  });
  it("이상한 저장값은 off", async () => {
    localStorage.setItem(storeKeys.varDisplay, JSON.stringify(7));
    await openSet("V1S", chainView());
    expect(mode()).toBe("off");
  });

  it("디버그 진입: off 면 마지막으로 켠 표시(처음이면 id)로 켜고, 나오면 들어가기 전 값(off)으로 돌아온다 — 저장값은 안 바뀐다", async () => {
    await openSet("V1S", chainView());
    await click("flow-mode-debug");
    expect(mode()).toBe("id");
    expect(stored()).toBeNull();
    await click("flow-mode-view");
    expect(mode()).toBe("off");
  });

  it("디버그 진입: 마지막으로 켠 표시가 name 이었으면 name 으로 켠다. 켜 둔 채면 그대로, 나와도 그대로", async () => {
    await openSet("V1S", chainView());
    await click("flow-var-toggle");
    await click("flow-var-toggle"); // name
    await click("flow-var-toggle"); // off
    await click("flow-mode-debug");
    expect(mode()).toBe("name");
    await click("flow-mode-view");
    expect(mode()).toBe("off");
    await click("flow-var-toggle"); // id
    await click("flow-mode-debug");
    expect(mode()).toBe("id");
    await click("flow-mode-view");
    expect(mode()).toBe("id");
  });
});
