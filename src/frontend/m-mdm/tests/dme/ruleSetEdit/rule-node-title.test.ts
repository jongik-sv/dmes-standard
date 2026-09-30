/** @vitest-environment happy-dom */

// 추가 Task V2 — 룰 노드 제목도 표시 토글(ID·이름)을 따른다.
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import { FlowCanvas, type FlowCanvasProps } from "../../../pages/dme/ruleSetEdit/canvas/FlowCanvas";
import { toEditFlow } from "../../../pages/dme/ruleSetEdit/flow-edit";
import type { RuleIo } from "../../../pages/dme/ruleSetEdit/types";
import { installDomStorage } from "../helpers/render";

function ruleIo(ruleId: string, ruleName: string | null, exists = true): RuleIo {
  return { ruleId, ruleName, ruleKind: "DECISION", status: "INUSE", exists, releasedVer: 1, hitPolicy: "FIRST", conds: [], results: [] };
}

describe("룰 노드 제목 — 표시 토글", () => {
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
  async function draw(over: Partial<FlowCanvasProps>, rules: Record<string, RuleIo>) {
    const p: FlowCanvasProps = {
      flow: toEditFlow(null, Object.keys(rules)), rules, checks: [], mode: "view", varDisplay: "off", selectedId: null, selectedEdgeId: null,
      overlay: null, focusId: null, focusSeq: 0, onSelect: noop, onSelectEdge: noop, onOpenRule: noop, onMove: noop, onConnect: noop,
      onDropPalette: noop, onNoteChange: noop, breakpoints: new Set(), collapsed: new Set(), showMiniMap: false, editingCondEdgeId: null,
      onMoveNode: noop, onDropRule: noop, onContextMenu: noop, onEditCond: noop, onEditCondClose: noop, onToggleBreakpoint: noop, ...over,
    };
    await act(async () => {
      root.render(createElement(DmesUiProvider, null, createElement("div", { style: { width: 800, height: 600 } }, createElement(FlowCanvas, p))));
    });
  }
  const rows = () => Array.from(document.querySelectorAll(".rsf-rule")).map((n) => [n.querySelector(".rsf-title")?.textContent, n.querySelector(".rsf-id")?.textContent ?? null]);

  it("id 모드는 제목=룰 ID, 작은 줄=룰명", async () => {
    await draw({ varDisplay: "id" }, { R_A: ruleIo("R_A", "가 룰") });
    expect(rows()).toEqual([["R_A", "가 룰"]]);
  });

  it("name·off 모드는 제목=룰명, 작은 줄=ID", async () => {
    await draw({ varDisplay: "name" }, { R_A: ruleIo("R_A", "가 룰") });
    expect(rows()).toEqual([["가 룰", "R_A"]]);
    await draw({ varDisplay: "off" }, { R_A: ruleIo("R_A", "가 룰") });
    expect(rows()).toEqual([["가 룰", "R_A"]]);
  });

  it("룰명이 없으면 id 모드에서 작은 줄을 생략하고, 다른 모드는 제목=ID", async () => {
    await draw({ varDisplay: "id" }, { R_B: ruleIo("R_B", null) });
    expect(rows()).toEqual([["R_B", null]]);
    await draw({ varDisplay: "name" }, { R_B: ruleIo("R_B", null) });
    expect(rows()).toEqual([["R_B", "R_B"]]);
  });

  it("같은 흐름·룰에서 토글만 바꿔도 제목이 바로 바뀐다", async () => {
    // 토글 값 말고는 모든 prop 을 같은 참조로 둔다 — 노드 memo 가 varDisplay 에 묶였는지를 본다.
    const rules = { R_A: ruleIo("R_A", "가 룰") };
    const same = { flow: toEditFlow(null, ["R_A"]), checks: [], breakpoints: new Set<string>(), collapsed: new Set<string>() };
    await draw({ ...same, varDisplay: "name" }, rules);
    expect(rows()).toEqual([["가 룰", "R_A"]]);
    await draw({ ...same, varDisplay: "id" }, rules);
    expect(rows()).toEqual([["R_A", "가 룰"]]);
  });

  it("없는 룰은 모드와 관계없이 그대로", async () => {
    await draw({ varDisplay: "id" }, { R_C: ruleIo("R_C", null, false) });
    expect(rows()).toEqual([["(없는 룰)", "R_C"]]);
  });
});
