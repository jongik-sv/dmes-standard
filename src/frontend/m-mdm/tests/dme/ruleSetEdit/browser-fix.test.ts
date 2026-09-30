/** @vitest-environment happy-dom */

// 3단계 브라우저 확인 결함 고침 — 저장 위치가 있는 흐름에 새 노드를 넣으면 겹치지 않는다(5번), 도움말 Esc 뒤 초점(8번 단서),
// 빈 갈래 둘인 IF 의 라벨 겹침·변수 칩 쌓임 순서(그 밖의 관찰).
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

import {
  copyFragment, duplicateNode, insertRule, insertSplit, pasteFragment, setPositions, toEditFlow,
  type EditFlow, type EditResult, type Fragment,
} from "../../../pages/dme/ruleSetEdit/flow-edit";
import { NODE_SIZE, autoLayout, placeNewNodes, positionsOf } from "../../../pages/dme/ruleSetEdit/flow-layout";
import { RSF_CSS } from "../../../pages/dme/ruleSetEdit/rsf-styles";
import type { RuleIo, RuleSetView } from "../../../pages/dme/ruleSetEdit/types";
import type { FlowNodeKind } from "@/contract/engine-contract.generated";
import { flush } from "../helpers/render";
import { byTestId, canvasNodeIds, click, installServer, openSet, q, uninstallServer } from "../helpers/rule-set-page";

const ioName = (n: string) => ({ name: n, source: "DICT" as const, label: null, dataType: null, scale: null, dateString: false, maruCodeId: null });
const rule = (ruleId: string, cond: string, result: string): RuleIo => ({
  ruleId, ruleName: `${ruleId} 이름`, ruleKind: "DECISION", status: "INUSE", exists: true, releasedVer: 1, hitPolicy: "FIRST",
  conds: [ioName(cond)], results: [{ ...ioName(result), source: null }],
});
const RULES = [rule("BF_A", "IN_A", "OUT_A"), rule("BF_B", "OUT_A", "OUT_B"), rule("BF_C", "OUT_B", "OUT_C")];
const IDS = RULES.map((r) => r.ruleId);

function viewOf(setId: string, flow: EditFlow): RuleSetView {
  return {
    set: { setId, setName: "이름", description: null, status: "INUSE", rowVersion: 1, ruleIds: IDS, flow, branched: false },
    rules: RULES, checks: [], condIo: {}, editable: true, restorable: false, cases: [],
  };
}
function ok(r: EditResult): EditFlow {
  if (!r.ok) throw new Error(r.reason);
  return r.flow;
}
/** start → r1 → r2 → r3 → end. 선 e1(start→r1) e2(r1→r2) e3(r2→r3) e4(r3→end). */
const chain = () => toEditFlow(null, IDS);

/**
 * 덫 — op 가 만들 새 노드(newId)가 자동 배치로 놓일 자리에 기존 노드 victim 의 저장 위치를 둔다(브라우저 확인 5번의 r3~m1 과 같은 모양).
 * 고치기 전에는 새 노드가 victim 과 같은 자리에 그려진다.
 */
function trap(op: (f: EditFlow) => EditFlow, newId: string, victim: string): EditFlow {
  const spot = autoLayout(op(chain()))[newId];
  return setPositions(chain(), { [victim]: spot });
}

interface Box { id: string; x1: number; y1: number; x2: number; y2: number }
const boxesOf = (f: EditFlow): Box[] => {
  const pos = positionsOf(f);
  return f.nodes.map((n) => {
    const p = pos[n.id];
    const s = NODE_SIZE[n.kind];
    return { id: n.id, x1: p.x, y1: p.y, x2: p.x + s.w, y2: p.y + s.h };
  });
};
const hit = (a: Box, b: Box) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
/** 새 노드마다 겹치는 다른 노드 ID 목록(비어야 한다). */
function clashes(boxes: Box[], fresh: readonly string[]): string[] {
  const out: string[] = [];
  for (const id of fresh) {
    const me = boxes.find((b) => b.id === id)!;
    for (const b of boxes) if (b.id !== id && !fresh.includes(b.id) && hit(me, b)) out.push(`${id}~${b.id}`);
  }
  return out;
}

/** 캔버스에 그려진 흐름 노드 상자(React Flow 노드 transform + 종류 크기). */
function renderedBoxes(): Box[] {
  return canvasNodeIds().map((id) => {
    const el = document.querySelector(`.react-flow__node[data-id="${id}"]`) as HTMLElement;
    const m = /translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(el.style.transform)!;
    const kind = byTestId(`flow-node-${id}`).getAttribute("data-kind") as FlowNodeKind;
    const x = Number(m[1]);
    const y = Number(m[2]);
    return { id, x1: x, y1: y, x2: x + NODE_SIZE[kind].w, y2: y + NODE_SIZE[kind].h };
  });
}

async function key(el: Element, init: KeyboardEventInit): Promise<KeyboardEvent> {
  const ev = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  await act(async () => {
    el.dispatchEvent(ev);
  });
  await flush();
  return ev;
}
const canvas = () => byTestId("flow-canvas");
async function focusCanvas() {
  await act(async () => {
    canvas().focus();
  });
}
async function clickEdge(id: string) {
  await act(async () => {
    q(`rf__edge-${id}`)!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flush();
}
const transformOf = (el: Element) => (el as HTMLElement).style.transform;

describe("저장 위치가 있는 흐름에 새 노드 넣기(브라우저 확인 5번)", () => {
  beforeEach(() => {
    installServer();
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    uninstallServer();
  });

  it("덫 확인 — 고치기 전 연산 결과(위치 없음)는 새 노드가 저장 위치 노드와 겹친다", () => {
    const f = trap((g) => ok(duplicateNode(g, "r1")), "r4", "r3");
    expect(clashes(boxesOf(ok(duplicateNode(f, "r1"))), ["r4"])).toEqual(["r4~r3"]);
  });

  it("placeNewNodes — 저장 위치가 없으면 결과를 그대로 돌려주고(자동 배치가 푼다), 있으면 새 노드 위치만 적는다", () => {
    const plain = chain();
    const after = ok(duplicateNode(plain, "r1"));
    expect(placeNewNodes(plain, after)).toBe(after);

    const f = trap((g) => ok(duplicateNode(g, "r1")), "r4", "r3");
    const placed = placeNewNodes(f, ok(duplicateNode(f, "r1")));
    expect(Object.keys(placed.view.positions).sort()).toEqual(["r3", "r4"]);
    expect(clashes(boxesOf(placed), ["r4"])).toEqual([]);
  });

  it("placeNewNodes — 분기 블록 붙여넣기는 조각 모양(분기·안쪽·합류)을 지키며 통째로 비켜 놓는다", () => {
    const withIf = ok(insertSplit(chain(), "e3", "IF"));
    const frag = copyFragment(withIf, "if1") as Fragment;
    const op = (g: EditFlow) => ok(pasteFragment(g, "e1", frag));
    const spot = autoLayout(op(withIf)).if2;
    const f = setPositions(withIf, { r3: spot });
    const after = op(f);
    const placed = placeNewNodes(f, after);
    expect(clashes(boxesOf(placed), ["if2", "m2"])).toEqual([]);
    const dag = autoLayout(after);
    const p = placed.view.positions;
    // 분기와 합류의 상대 위치는 자동 배치 그대로
    expect(p.m2.x - p.if2.x).toBe(dag.m2.x - dag.if2.x);
    expect(p.m2.y - p.if2.y).toBe(dag.m2.y - dag.if2.y);
  });

  it("placeNewNodes — 보고 재현 모양: 옮겨 둔 IF 블록이 있는 흐름에서 다른 IF 의 '그 외' 선에 룰을 끼워도 겹치지 않는다", () => {
    let g = ok(insertSplit(chain(), "e2", "IF")); // if1·m1
    g = ok(insertSplit(g, g.edges.find((e) => e.to === "r3")!.id, "IF")); // if2·m2
    const other = g.edges.find((e) => e.from === "if2" && e.otherwise)!.id;
    const spot = autoLayout(ok(insertRule(g, other, "BF_A"))).r4;
    const moved = positionsOf(g);
    // if1 블록을 옮겨 두되 합류 m1 을 새 룰의 자동 배치 자리에 둔다(보고의 r3~m1).
    const dx = spot.x - moved.m1.x;
    const dy = spot.y - moved.m1.y;
    const f = setPositions(g, Object.fromEntries(["if1", "r2", "m1"].map((id) => [id, { x: moved[id].x + dx, y: moved[id].y + dy }])));
    const after = ok(insertRule(f, other, "BF_A"));
    expect(clashes(boxesOf(after), ["r4"]).length).toBeGreaterThan(0); // 고치기 전 모양
    expect(clashes(boxesOf(placeNewNodes(f, after)), ["r4"])).toEqual([]);
  });

  it("복제(Ctrl+D) — 새 노드가 다른 모든 노드와 겹치지 않고, 되돌리기 한 번에 원래 흐름으로 돌아간다", async () => {
    const f = trap((g) => ok(duplicateNode(g, "r1")), "r4", "r3");
    await openSet("BF_DUP", viewOf("BF_DUP", f));
    await click("flow-mode-edit");
    const before = renderedBoxes();
    await click("flow-node-r1");
    await focusCanvas();
    await key(canvas(), { key: "d", ctrlKey: true });
    expect(canvasNodeIds()).toContain("r4");
    expect(clashes(renderedBoxes(), ["r4"])).toEqual([]);

    await key(canvas(), { key: "z", ctrlKey: true });
    expect(canvasNodeIds()).not.toContain("r4");
    expect(renderedBoxes()).toEqual(before);
  });

  it("[+] → IF 넣기 — 새 분기·합류가 다른 노드와 겹치지 않는다", async () => {
    const f = trap((g) => ok(insertSplit(g, "e3", "IF")), "if1", "r1");
    await openSet("BF_IF", viewOf("BF_IF", f));
    await click("flow-mode-edit");
    await click("flow-edge-add-e3");
    await click("flow-menu-item-insert-if");
    expect(canvasNodeIds()).toEqual(expect.arrayContaining(["if1", "m1"]));
    expect(clashes(renderedBoxes(), ["if1", "m1"])).toEqual([]);
  });

  it("붙여넣기 — 복사한 룰을 선에 붙이면 새 노드가 다른 노드와 겹치지 않는다", async () => {
    const f = trap((g) => ok(pasteFragment(g, "e4", copyFragment(g, "r1") as Fragment)), "r4", "r2");
    await openSet("BF_PASTE", viewOf("BF_PASTE", f));
    await click("flow-mode-edit");
    await click("flow-node-r1");
    await focusCanvas();
    await key(canvas(), { key: "c", ctrlKey: true });
    await clickEdge("e4");
    await key(canvas(), { key: "v", ctrlKey: true });
    expect(canvasNodeIds()).toContain("r4");
    expect(clashes(renderedBoxes(), ["r4"])).toEqual([]);
  });
});

describe("도움말 Esc 뒤 초점(브라우저 확인 8번 단서)", () => {
  beforeEach(() => {
    installServer();
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    uninstallServer();
  });

  it("[?] 에 초점이 있는 채 Esc 로 도움말을 닫으면 초점이 캔버스로 가고, 다음 Esc 가 선택을 푼다", async () => {
    await openSet("BF_HELP", viewOf("BF_HELP", chain()));
    await click("flow-mode-edit");
    await clickEdge("e2");
    await click("flow-help");
    const help = byTestId("flow-help");
    await act(async () => {
      help.focus();
    });
    await key(help, { key: "Escape" });
    expect(q("flow-help-panel")).toBeNull();
    expect(document.activeElement).toBe(canvas());
    expect(q("rf__edge-e2")!.classList.contains("selected")).toBe(true); // 첫 Esc 는 도움말만 닫는다
    await key(document.activeElement!, { key: "Escape" });
    expect(q("rf__edge-e2")!.classList.contains("selected")).toBe(false);
  });

  it("[?] 를 다시 눌러(마우스) 닫으면 초점을 옮기지 않는다", async () => {
    await openSet("BF_HELP2", viewOf("BF_HELP2", chain()));
    await click("flow-help");
    const help = byTestId("flow-help");
    await act(async () => {
      help.focus();
    });
    await click("flow-help");
    expect(q("flow-help-panel")).toBeNull();
    expect(document.activeElement).toBe(help);
  });
});

describe("선 라벨·변수 칩(그 밖의 관찰)", () => {
  beforeEach(() => {
    installServer();
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    uninstallServer();
  });

  it("빈 갈래가 둘인 IF — '갈래 1' 과 '그 외' 라벨, 두 [+] 가 서로 다른 자리에 그려진다", async () => {
    const f = ok(insertSplit(chain(), "e2", "IF")); // if1 → m1 빈 갈래 둘
    const branches = f.edges.filter((e) => e.from === "if1").map((e) => e.id);
    expect(branches).toHaveLength(2);
    await openSet("BF_LABEL", viewOf("BF_LABEL", f));
    await click("flow-mode-edit");
    const [a, b] = branches;
    const labelA = transformOf(byTestId(`flow-edge-label-${a}`).parentElement!);
    const labelB = transformOf(byTestId(`flow-edge-label-${b}`).parentElement!);
    expect(labelA).not.toBe(labelB);
    expect(transformOf(byTestId(`flow-edge-add-${a}`))).not.toBe(transformOf(byTestId(`flow-edge-add-${b}`)));
  });

  it("변수 칩은 노드 위에 그려진다 — 칩 층에 쌓임 순서 클래스가 붙고 CSS 가 z-index 를 준다", async () => {
    await openSet("BF_CHIP", viewOf("BF_CHIP", chain()));
    await click("flow-var-toggle");
    const chips = q("flow-edge-chips-e2") ?? q("flow-edge-chips-e1");
    expect(chips).not.toBeNull();
    expect(chips!.parentElement!.classList.contains("rsf-elabel-chips")).toBe(true);
    expect(RSF_CSS).toMatch(/\.rsf-elabel-chips\s*\{[^}]*z-index:\s*1\b/);
  });
});
