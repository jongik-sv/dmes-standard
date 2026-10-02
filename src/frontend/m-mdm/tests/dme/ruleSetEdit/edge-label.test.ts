/** @vitest-environment happy-dom */

// 선(화살표) 위 라벨(Task 9) — 일반 선 라벨 그리기·오른쪽 패널 「연결선」 섹션·우클릭 「라벨 편집」·라벨 칩 두 번 누르기·저장 JSON.
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import { FlowCanvas, type FlowCanvasProps } from "../../../pages/dme/ruleSetEdit/canvas/FlowCanvas";
import { flowJsonOf, insertSplit, setLabelOffset, toEditFlow, updateEdge, type EditFlow, type EditResult } from "../../../pages/dme/ruleSetEdit/flow-edit";
import { RSF_CSS } from "../../../pages/dme/ruleSetEdit/rsf-styles";
import type { RuleIo, RuleSetView } from "../../../pages/dme/ruleSetEdit/types";
import { flush, typeInto } from "../helpers/render";
import { byTestId, click, installServer, openSet, q as pq, uninstallServer } from "../helpers/rule-set-page";

function ok(r: EditResult): EditFlow {
  if (!r.ok) throw new Error(r.reason);
  return r.flow;
}
const rio = (ruleId: string): RuleIo => ({
  ruleId, ruleName: `${ruleId} 이름`, ruleKind: "DECISION", status: "INUSE", exists: true, releasedVer: "1.000", hitPolicy: "FIRST", conds: [], results: [],
});
/** start → r1 → r2 → end. 선 e1 start→r1, e2 r1→r2, e3 r2→end. */
const chain = () => toEditFlow(null, ["EL_A", "EL_B"]);
const labeled = () => ok(updateEdge(chain(), "e2", { label: "합격" }));
/** start → r1 → if1{e4 조건 / e5 그 외} → m1 → r2 → end. */
const ifFlow = () => {
  const f = ok(insertSplit(chain(), "e2", "IF"));
  return ok(updateEdge(f, f.edges.find((e) => e.from === "if1" && !e.otherwise)!.id, { cond: "true", label: "큰 값" }));
};
function viewOf(setId: string, flow: EditFlow | null, editable = true): RuleSetView {
  return {
    set: { setId, setName: "라벨 세트", description: null, status: "INUSE", rowVersion: 1, ruleIds: ["EL_A", "EL_B"], flow, branched: false },
    rules: [rio("EL_A"), rio("EL_B")], checks: [], condIo: {}, editable, restorable: false, cases: [],
  } as RuleSetView;
}
const q = <T extends Element = HTMLElement>(id: string) => document.querySelector(`[data-testid="${id}"]`) as T | null;
const labelEl = (id: string) => q(`flow-edge-label-${id}`);
const input = (id: string) => q<HTMLInputElement>(`flow-edge-label-input-${id}`);
/** 편집 모드로 세트를 연다(수정 가능 세트). */
async function openEdit(id: string, view: RuleSetView) {
  await openSet(id, view);
  await click("flow-mode-edit");
}
async function ctxEdge(id: string) {
  await act(async () => {
    q(`rf__edge-${id}`)!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 200, clientY: 100 }));
  });
  await flush();
}
async function clickEdge(id: string) {
  await act(async () => {
    q(`rf__edge-${id}`)!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flush();
}
async function dbl(el: Element) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
  });
  await flush();
}
async function keyOn(el: Element, init: KeyboardEventInit) {
  await act(async () => {
    el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
  });
  await flush();
}
const menuIds = () =>
  Array.from(document.querySelectorAll('[data-testid^="flow-menu-item-"]')).map((e) => e.getAttribute("data-testid")!.slice("flow-menu-item-".length));
const panelInput = () => pq<HTMLInputElement>("flow-prop-edge-label");

describe("선 라벨 — 저장 JSON", () => {
  it("label 이 선에 \"label\" 로 저장되고, 지우면 사라진다", () => {
    const f = labeled();
    expect(flowJsonOf(f)).toContain('"label":"합격"');
    expect(flowJsonOf(JSON.parse(flowJsonOf(f)) && toEditFlow(JSON.parse(flowJsonOf(f)), []))).toBe(flowJsonOf(f));
    const cleared = ok(updateEdge(f, "e2", { label: null }));
    expect(flowJsonOf(cleared)).not.toContain("합격");
  });
});

describe("선 라벨 — 캔버스 그리기와 memo", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    installServer();
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
  const RULES = { EL_A: rio("EL_A"), EL_B: rio("EL_B") };
  const BP = new Set<string>();
  const COL = new Set<string>();
  function props(over: Partial<FlowCanvasProps> = {}): FlowCanvasProps {
    return {
      flow: labeled(), rules: RULES, checks: [], mode: "edit", varDisplay: "id", selectedId: null, selectedEdgeId: null,
      overlay: null, focusId: null, focusSeq: 0, onSelect: noop, onSelectEdge: noop, onOpenRule: noop, onMove: noop, onConnect: noop,
      onDropPalette: noop, onNoteChange: noop, breakpoints: BP, collapsed: COL, showMiniMap: false, editingCondEdgeId: null, onMoveNode: noop, onDropRule: noop,
      onContextMenu: noop, onEditCond: noop, onEditCondClose: noop, onToggleBreakpoint: noop, onRouteChange: noop, onLabelOffsetChange: noop, ...over,
    };
  }
  async function draw(p: FlowCanvasProps) {
    await act(async () => {
      root.render(createElement(DmesUiProvider, null, createElement("div", { style: { width: 800, height: 600 } }, createElement(FlowCanvas, p))));
    });
    await flush();
  }
  const tfOf = (id: string) => (labelEl(id)!.parentElement as HTMLElement).style.transform;

  it("일반 선에 label 이 있으면 칩이 보이고(전체 글자는 title), 없는 선에는 없다", async () => {
    await draw(props());
    const el = labelEl("e2")!;
    expect(el.textContent).toBe("합격");
    expect(el.getAttribute("title")).toContain("합격");
    expect(el.className).not.toContain("rsf-branch");
    expect(labelEl("e1")).toBeNull();
    expect(labelEl("e3")).toBeNull();
  });

  it("보기 모드에서도 표시만 한다", async () => {
    await draw(props({ mode: "view" }));
    expect(labelEl("e2")!.textContent).toBe("합격");
  });

  it("분기 선의 표시는 그대로 — 갈래 칩(rsf-branch)이고 일반 선 표시와 섞이지 않는다", async () => {
    await draw(props({ flow: ifFlow() }));
    const branch = ifFlow().edges.find((e) => e.from === "if1" && !e.otherwise)!;
    expect(labelEl(branch.id)!.className).toContain("rsf-branch");
    expect(labelEl(branch.id)!.textContent).toBe("큰 값");
  });

  it("긴 라벨은 저장은 그대로, 칩 글자만 말줄임 CSS 를 받고 title 이 전체를 보인다", async () => {
    const long = "아주 긴 라벨 ".repeat(20).trim();
    await draw(props({ flow: ok(updateEdge(chain(), "e2", { label: long })) }));
    expect(labelEl("e2")!.getAttribute("title")).toContain(long);
    expect(labelEl("e2")!.textContent).toBe(long);
    expect(RSF_CSS).toMatch(/\.rsf-edge-text\s*\{[^}]*max-width:\s*160px[^}]*text-overflow:\s*ellipsis/);
  });

  it("끌어 옮기기 오프셋(view.labels)이 일반 선 라벨에도 적용된다", async () => {
    const base = labeled();
    await draw(props({ flow: base }));
    const xy = (t: string) => {
      const m = /translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px\)\s*$/.exec(t)!;
      return { x: Number(m[1]), y: Number(m[2]) };
    };
    const before = xy(tfOf("e2"));
    await draw(props({ flow: ok(setLabelOffset(base, "e2", "label", { dx: 40, dy: 25 })) }));
    const after = xy(tfOf("e2"));
    expect(after.x - before.x).toBe(40);
    expect(after.y - before.y).toBe(25);
  });

  it("memo — label 만 바뀐 흐름에서 선이 다시 그려진다(다른 prop 은 같은 참조)", async () => {
    const a = chain();
    await draw(props({ flow: a }));
    expect(labelEl("e2")).toBeNull();
    await draw(props({ flow: ok(updateEdge(a, "e2", { label: "새 라벨" })) }));
    expect(labelEl("e2")!.textContent).toBe("새 라벨");
    await draw(props({ flow: ok(updateEdge(ok(updateEdge(a, "e2", { label: "새 라벨" })), "e2", { label: "바뀐 라벨" })) }));
    expect(labelEl("e2")!.textContent).toBe("바뀐 라벨");
  });
});

describe("선 라벨 — 화면(패널·메뉴·두 번 누르기)", () => {
  beforeEach(() => installServer());
  afterEach(() => {
    vi.restoreAllMocks();
    uninstallServer();
  });
  const undoDisabled = () => (byTestId("flow-undo") as HTMLButtonElement).disabled;

  it("패널 — 선을 고르면 「연결선」 섹션에 라벨 칸·출발→도착 이름이 있고, 입력이 편집·빈 값은 지움이며 되돌리기 한 번에 원래대로", async () => {
    await openEdit("EL_P", viewOf("EL_P", chain()));
    await clickEdge("e2");
    expect(byTestId("flow-section-edge-basic")).toBeTruthy();
    expect(byTestId("flow-section-edge-basic-head").textContent).toContain("연결선");
    expect(byTestId("flow-prop-edge-from").textContent).toContain("EL_A");
    expect(byTestId("flow-prop-edge-to").textContent).toContain("EL_B");
    expect(panelInput()!.value).toBe("");
    await typeInto(panelInput()!, "합격");
    expect(labelEl("e2")!.textContent).toBe("합격");
    await typeInto(panelInput()!, "합격선");
    expect(labelEl("e2")!.textContent).toBe("합격선");
    await typeInto(panelInput()!, "");
    expect(labelEl("e2")).toBeNull();
    await click("flow-undo");
    expect(undoDisabled()).toBe(true); // 같은 선의 입력은 한 칸으로 합쳐져 한 번에 처음으로
    expect(labelEl("e2")).toBeNull();
  });

  it("패널 — 보기 모드에서는 고칠 수 없다", async () => {
    await openSet("EL_V", viewOf("EL_V", labeled(), false));
    await clickEdge("e2");
    expect(panelInput()!.value).toBe("합격");
    expect(panelInput()!.readOnly || panelInput()!.disabled).toBe(true);
  });

  it("패널 — 분기 선이면 이 칸이 곧 분기 「갈래」 섹션의 갈래 이름과 같은 값이다", async () => {
    const f = ifFlow();
    const branch = f.edges.find((e) => e.from === "if1" && !e.otherwise)!;
    await openEdit("EL_I", viewOf("EL_I", f));
    await clickEdge(branch.id);
    expect(panelInput()!.value).toBe("큰 값");
    await typeInto(panelInput()!, "작은 값");
    expect(labelEl(branch.id)!.textContent).toBe("작은 값");
    await act(async () => {
      byTestId("flow-node-if1").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
    expect((byTestId(`flow-prop-branch-${branch.id}-label`) as HTMLInputElement).value).toBe("작은 값");
  });

  it("메뉴 — 편집 모드 선 우클릭에 「라벨 편집」이 있고, 누르면 즉석 칸이 열려 Enter 로 저장한다", async () => {
    await openEdit("EL_M", viewOf("EL_M", chain()));
    await ctxEdge("e2");
    expect(menuIds()).toContain("edit-label");
    expect(byTestId("flow-menu-item-edit-label").textContent).toContain("라벨 편집");
    await click("flow-menu-item-edit-label");
    expect(input("e2")).not.toBeNull();
    expect(document.activeElement).toBe(input("e2"));
    await typeInto(input("e2")!, "통과");
    await keyOn(input("e2")!, { key: "Enter" });
    expect(input("e2")).toBeNull();
    expect(labelEl("e2")!.textContent).toBe("통과");
    await click("flow-undo");
    expect(labelEl("e2")).toBeNull();
  });

  it("메뉴 — Esc 는 취소, 같은 값 Enter 는 편집 없음, 빈 값은 지움, 조합 중 Enter 는 무시", async () => {
    await openEdit("EL_K", viewOf("EL_K", labeled()));
    await ctxEdge("e2");
    await click("flow-menu-item-edit-label");
    expect(input("e2")!.value).toBe("합격");
    await typeInto(input("e2")!, "다른 값");
    await keyOn(input("e2")!, { key: "Escape" });
    expect(input("e2")).toBeNull();
    expect(labelEl("e2")!.textContent).toBe("합격");
    expect(undoDisabled()).toBe(true);

    await ctxEdge("e2");
    await click("flow-menu-item-edit-label");
    await keyOn(input("e2")!, { key: "Enter" }); // 같은 값
    expect(input("e2")).toBeNull();
    expect(undoDisabled()).toBe(true);

    await ctxEdge("e2");
    await click("flow-menu-item-edit-label");
    await typeInto(input("e2")!, "조합중");
    await keyOn(input("e2")!, { key: "Enter", isComposing: true });
    expect(input("e2")).not.toBeNull(); // 조합 중 Enter 무시
    await typeInto(input("e2")!, "");
    await keyOn(input("e2")!, { key: "Enter" });
    expect(labelEl("e2")).toBeNull();
    expect(undoDisabled()).toBe(false);
  });

  it("메뉴 — 칸 밖을 누르면 저장한다(Esc 만 취소)", async () => {
    await openEdit("EL_O", viewOf("EL_O", chain()));
    await ctxEdge("e2");
    await click("flow-menu-item-edit-label");
    await typeInto(input("e2")!, "밖 저장");
    await act(async () => {
      document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    await flush();
    expect(input("e2")).toBeNull();
    expect(labelEl("e2")!.textContent).toBe("밖 저장");
  });

  it("메뉴 — 보기 모드에는 「라벨 편집」이 없다", async () => {
    await openSet("EL_N", viewOf("EL_N", labeled(), false));
    await ctxEdge("e2");
    expect(menuIds()).not.toContain("edit-label");
  });

  it("두 번 누르기 — 일반 선 라벨 칩을 두 번 누르면 즉석 칸이 열린다", async () => {
    await openEdit("EL_D", viewOf("EL_D", labeled()));
    await dbl(labelEl("e2")!);
    expect(input("e2")).not.toBeNull();
    expect(input("e2")!.value).toBe("합격");
  });

  it("두 번 누르기 — 분기 선의 라벨 두 번 누르기는 그대로 조건식 편집이다", async () => {
    const f = ifFlow();
    const branch = f.edges.find((e) => e.from === "if1" && !e.otherwise)!;
    await openEdit("EL_C", viewOf("EL_C", f));
    await dbl(labelEl(branch.id)!);
    expect(q(`flow-edge-cond-input-${branch.id}`)).not.toBeNull();
    expect(input(branch.id)).toBeNull();
  });
});
