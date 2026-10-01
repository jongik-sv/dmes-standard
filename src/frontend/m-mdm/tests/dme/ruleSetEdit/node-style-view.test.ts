/** @vitest-environment happy-dom */

// 외관 옵션(S1) Task 2 — 노드 그리기: 색·모양·아이콘·표시 항목·제목 여러 줄, 상태 표시가 색보다 우선(S-D3).
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import { FlowCanvas, type FlowCanvasProps } from "../../../pages/dme/ruleSetEdit/canvas/FlowCanvas";
import { titleLines } from "../../../pages/dme/ruleSetEdit/canvas/nodes";
import { insertTask, setNodeStyle, toEditFlow, type EditFlow, type EditResult } from "../../../pages/dme/ruleSetEdit/flow-edit";
import { RSF_CSS } from "../../../pages/dme/ruleSetEdit/rsf-styles";
import { BASE_CSS } from "../../../pages/dme/ruleSetEdit/styles/base";
import { NODE_STYLE_CSS } from "../../../pages/dme/ruleSetEdit/styles/node-style";
import type { RuleIo } from "../../../pages/dme/ruleSetEdit/types";
import { flush, installDomStorage } from "../helpers/render";

function ok(r: EditResult): EditFlow {
  if (!r.ok) throw new Error(r.reason);
  return r.flow;
}
const io = (ruleId: string): RuleIo => ({
  ruleId, ruleName: `${ruleId} 이름`, ruleKind: "DECISION", status: "INUSE", exists: true, releasedVer: 1, hitPolicy: "FIRST", conds: [], results: [],
});
const RULES = { NV_A: io("NV_A"), NV_B: io("NV_B") };
const base = () => toEditFlow(null, ["NV_A", "NV_B"]);
const styled = (f: EditFlow, id: string, s: Parameters<typeof setNodeStyle>[2]) => ok(setNodeStyle(f, id, s));

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
  document.body.innerHTML = "";
});
const noop = () => {};
function props(over: Partial<FlowCanvasProps> = {}): FlowCanvasProps {
  return {
    flow: base(), rules: RULES, checks: [], mode: "edit", varDisplay: "off", selectedId: null, selectedEdgeId: null,
    overlay: null, focusId: null, focusSeq: 0, onSelect: noop, onSelectEdge: noop, onOpenRule: noop, onMove: noop, onConnect: noop,
    onDropPalette: noop, onNoteChange: noop, breakpoints: new Set(), collapsed: new Set(), showMiniMap: false, editingCondEdgeId: null,
    onMoveNode: noop, onDropRule: noop, onContextMenu: noop, onEditCond: noop, onEditCondClose: noop, onToggleBreakpoint: noop,
    onRouteChange: noop, ...over,
  };
}
async function draw(p: FlowCanvasProps) {
  await act(async () => {
    root.render(createElement(DmesUiProvider, null, createElement("div", { style: { width: 800, height: 600 } }, createElement(FlowCanvas, p))));
  });
  await flush();
}
const node = (id: string) => document.querySelector(`[data-testid="flow-node-${id}"]`) as HTMLElement;
const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;

describe("노드 외관 그리기", () => {
  it("색·모양은 data 속성, 기본이면 속성이 없다 — 보기·디버그 모드도", async () => {
    const f = styled(styled(base(), "r1", { color: "blue", shape: "pill" }), "r2", { shape: "square" });
    for (const mode of ["edit", "view", "debug"] as const) {
      await draw(props({ flow: f, mode }));
      expect(node("r1").getAttribute("data-color"), mode).toBe("blue");
      expect(node("r1").getAttribute("data-shape")).toBe("pill");
      expect(node("r2").hasAttribute("data-color")).toBe(false);
      expect(node("r2").getAttribute("data-shape")).toBe("square");
      expect(node("start").hasAttribute("data-color")).toBe(false);
    }
  });

  it("아이콘은 제목 왼쪽에 16px — data-icon·title 이름", async () => {
    await draw(props({ flow: styled(base(), "r1", { icon: "truck" }) }));
    const icon = q('[data-testid="flow-node-icon-r1"]')!;
    expect(icon.getAttribute("data-icon")).toBe("truck");
    expect(icon.getAttribute("title")).toBe("물류");
    expect(icon.querySelector("svg")!.getAttribute("width")).toBe("16");
    expect(icon.nextElementSibling!.classList.contains("rsf-title")).toBe(true);
    expect(q('[data-testid="flow-node-icon-r2"]')).toBeNull();
  });

  it("표시 항목 — 룰은 sub·id·open 을 숨기고 제목·검사 점은 늘 보인다", async () => {
    const f = styled(base(), "r1", { hide: ["sub", "id", "open"] });
    await draw(props({ flow: f, checks: [{ code: "SET_ORDER", severity: "WARN", message: "m", nodeId: "r1" } as never] }));
    const r1 = node("r1");
    expect(r1.querySelector(".rsf-sub")).toBeNull();
    expect(r1.querySelector(".rsf-id")).toBeNull();
    expect(q('[data-testid="flow-rule-open-r1"]')).toBeNull();
    expect(r1.getAttribute("data-no-open")).toBe("true");
    expect(r1.querySelector(".rsf-title")!.textContent).toBe("NV_A 이름");
    expect(q('[data-testid="flow-node-mark-r1"]')).not.toBeNull();
    expect(node("r2").querySelector(".rsf-sub")).not.toBeNull();
    expect(q('[data-testid="flow-rule-open-r2"]')).not.toBeNull();
  });

  it("빈 단계는 sub(안내 줄)만 숨길 수 있다 — 저장된 id·open 은 해가 없다", async () => {
    let f = ok(insertTask(base(), "e2"));
    const id = f.edges.find((e) => e.id === "e2")!.to;
    f = styled(f, id, { hide: ["sub", "id", "open"], color: "green" });
    await draw(props({ flow: f }));
    expect(node(id).querySelector(".rsf-sub")).toBeNull();
    expect(node(id).getAttribute("data-color")).toBe("green");
    expect(node(id).classList.contains("rsf-task")).toBe(true); // 점선 테두리 그대로
  });

  it("titleLines — 기본 높이는 1줄, 높으면 남는 높이만큼(작은 줄 수를 뺀다)", () => {
    expect(titleLines(68, 2)).toBe(1);
    expect(titleLines(68, 0)).toBe(1); // 기본 높이에서는 숨겨도 한 줄
    expect(titleLines(100, 2)).toBe(3); // (100 - 12 - 30) / 16 = 3.6
    expect(titleLines(100, 0)).toBe(5);
    expect(titleLines(70, 2)).toBe(1);
  });

  it("높이를 키운 노드는 제목이 여러 줄(data-lines·--rsf-lines), 기본 높이는 그대로 한 줄", async () => {
    await draw(props({ flow: styled(base(), "r1", { h: 100 }) }));
    const t = node("r1").querySelector(".rsf-title") as HTMLElement;
    expect(t.getAttribute("data-lines")).toBe("3");
    expect(t.style.getPropertyValue("--rsf-lines")).toBe("3");
    expect(node("r2").querySelector(".rsf-title")!.hasAttribute("data-lines")).toBe(false);
  });

  it("상태 표시가 색보다 우선 — 디버그 current 와 색이 함께 있으면 두 표시가 다 붙는다(DOM)", async () => {
    const overlay = { nodes: { r1: { state: "current" as const, seq: 1, chip: null } }, edges: {} };
    await draw(props({ flow: styled(base(), "r1", { color: "red" }), mode: "debug", overlay }));
    expect(node("r1").getAttribute("data-color")).toBe("red");
    expect(node("r1").classList.contains("rsf-node-current")).toBe(true);
  });
});

describe("CSS — 상태 표시가 색보다 우선(S-D3, Review Focus 4)", () => {
  it("색 규칙은 .rsf-node:where([data-color]) 로 base 뒤, !important·box-shadow·border-width·--rsf-border 없음", () => {
    const css = NODE_STYLE_CSS.replace(/\s+/g, " ");
    const colorRules = css.match(/[^{}]*\[data-color=[^{}]*\{[^}]*\}/g) ?? [];
    expect(colorRules).toHaveLength(5);
    for (const r of colorRules) {
      expect(r.trim().startsWith('.rsf-node:where([data-color="')).toBe(true);
      expect(r).not.toMatch(/!important|box-shadow|border-width|border-style|--rsf-border:/);
      // 제목 글자·아이콘도 진한 색(C3) — 글자색은 pending 규칙(0,2,0)이 이긴다.
      const c = /data-color="(\w+)"/.exec(r)![1];
      expect(r).toContain(`color: var(--rsf-c-${c}-border)`);
    }
    expect(css).toMatch(/\.rsf-node:where\(\[data-color\]\) \.rsf-node-icon \{[^}]*color: inherit/);
    expect(RSF_CSS.indexOf(NODE_STYLE_CSS)).toBeGreaterThan(RSF_CSS.indexOf(BASE_CSS));
    const all = RSF_CSS.replace(/\s+/g, " ");
    expect(all).toMatch(/\.rsf-node\.rsf-node-current \{[^}]*border-color: var\(--color-primary\)/);
    expect(all).toMatch(/\.rsf-node\[data-state="error"\] \{[^}]*border-color: var\(--color-danger\)/);
    // 선택(C5) — 색 없는 노드만 테두리를 파랑으로, 색 칠한 노드는 노드 색 테두리를 두고 바깥 고리(box-shadow)만 준다. 둘 다 0,2,0.
    expect(all).toMatch(/\.rsf-node\[data-selected="true"\] \{[^}]*box-shadow: 0 0 0 3px var\(--rsf-ring\)/);
    expect(all).toMatch(/\.rsf-node\[data-selected="true"\]:where\(:not\(\[data-color\]\)\) \{[^}]*border-color: var\(--color-primary\)/);
    expect(all).not.toMatch(/\.rsf-node\[data-selected="true"\] \{[^}]*border-color/);
    expect(all).toMatch(/\.rsf-node\.rsf-node-pending \{[^}]*border-color: var\(--rsf-border\)/);
  });

  it("알약 + 열기 단추 숨김 — 오른쪽 여백이 10px 로 줄지 않고 16px(Ruling 19), 규칙은 숨김 규칙 뒤에 있다", () => {
    const css = NODE_STYLE_CSS.replace(/\s+/g, " ");
    const hidden = css.indexOf('.rsf-node.rsf-rule[data-no-open="true"] {');
    const pillHidden = css.indexOf('.rsf-node.rsf-rule[data-no-open="true"]:where([data-shape="pill"]) {');
    expect(hidden).toBeGreaterThan(-1);
    expect(pillHidden).toBeGreaterThan(hidden);
    expect(css.slice(pillHidden)).toMatch(/^[^{]*\{[^}]*padding-right: 16px/);
  });

  it("모양 규칙도 낮은 우선순위, 제목 여러 줄은 줄바꿈 말줄임, 16진수·rgb() 없음", () => {
    const css = NODE_STYLE_CSS.replace(/\s+/g, " ");
    expect(css).toMatch(/\.rsf-node:where\(\[data-shape="square"\]\) \{[^}]*border-radius: 0/);
    expect(css).toMatch(/\.rsf-node:where\(\[data-shape="pill"\]\) \{[^}]*border-radius: 999px/);
    expect(css).toMatch(/\.rsf-title\[data-lines\] \{[^}]*white-space: normal[^}]*-webkit-box-orient: vertical[^}]*-webkit-line-clamp: var\(--rsf-lines\)/);
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|!important/);
  });
});
