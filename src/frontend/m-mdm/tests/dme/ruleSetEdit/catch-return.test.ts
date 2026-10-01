// 처리 갈래 돌아오기(받는 노드 spec §8 「돌아오기」) — 정상 다음 노드로 잇기·다시 잇기가 돌아오는 합류로 가고, 받는 노드 우클릭 「흐름으로 돌아오기」.
// 자동 배치 고침(browser-check 추가 1) — 룰과 처리 갈래 사이 빈 층 없음, 끝내는 처리 갈래 선이 다른 노드 상자를 지나지 않음.
import { beforeEach, describe, expect, it } from "vitest";

import type { FlowEdge, FlowNode, FlowNodeKind, RuleSetFlow } from "../../../src/contract/engine-contract.generated";
import {
  RETURN_ALREADY, RETURN_NO_EXIT, addCatch, connect, flowJsonOf, insertRule, reconnectEdge, returnCatch, setRoute, toEditFlow,
  type EditFlow, type EditResult, type FlowPos,
} from "../../../pages/dme/ruleSetEdit/flow-edit";
import { NODE_SIZE, autoLayout, clearLayoutCache, drawnPositions, endingRoutes } from "../../../pages/dme/ruleSetEdit/flow-layout";
import { parseFlow, type Guarded } from "../../../pages/dme/ruleSetEdit/flow-model";
import { smoothStepPoints } from "../../../pages/dme/ruleSetEdit/canvas/route-path";
import { editMenu } from "../../../pages/dme/ruleSetEdit/canvas/menus/edit-menu";
import type { CanvasActions, MenuContext } from "../../../pages/dme/ruleSetEdit/canvas/context-menu";

function ok(r: EditResult): EditFlow {
  if (!r.ok) throw new Error(r.reason);
  return r.flow;
}
const reason = (r: EditResult) => (r.ok ? null : r.reason);
const ids = (f: EditFlow) => f.nodes.map((n) => n.id);
const pairs = (f: EditFlow) => f.edges.map((x) => `${x.id}:${x.from}>${x.to}`);
const merges = (f: EditFlow) => f.nodes.filter((n) => n.kind === "MERGE");

const nd = (id: string, kind: FlowNodeKind, over: Partial<FlowNode> = {}): FlowNode => ({ id, kind, ruleId: null, splitId: null, label: null, ...over });
const ed = (id: string, from: string, to: string, over: Partial<FlowEdge> = {}): FlowEdge => ({ id, from, to, order: null, cond: null, otherwise: false, label: null, ...over });

/** start → r1 → r2 → end(e1 e2 e3) + 떨어진 룰 h1(들어오는·나가는 선 없음). c1 → h1(e4) — 처리 갈래 몸이 아직 열려 있다. */
const openHandler = (): EditFlow => {
  const f0 = toEditFlow(null, ["R_A", "R_B"]);
  return ok(addCatch({ ...f0, nodes: [...f0.nodes, nd("h1", "RULE", { ruleId: "R_H" })] }, "r1", "h1"));
};

/** start → r1 → r2 → end(e1 e2 e3), c1 → r3 → end(e4 e5) — 끝내는 처리 갈래(몸 룰 하나). */
const endingHandler = (): EditFlow => ok(insertRule(ok(addCatch(toEditFlow(null, ["R_A", "R_B"]), "r1", "end")), "e4", "R_C"));

/** 스펙 §2 모양을 편집 연산만으로 만든다 — 끝내는 처리 갈래를 정상 다음 노드로 다시 잇고(A), 끝내는 받는 노드를 하나 더 붙인다. */
const specFromScratch = (): EditFlow => ok(addCatch(ok(reconnectEdge(endingHandler(), "e5", { to: "r2" })), "r1", null));

describe("돌아오기 A — 정상 다음 노드로 잇기·다시 잇기", () => {
  it("처리 갈래 노드에서 룰의 정상 다음 노드로 이으면 돌아오는 합류를 만들어 그 합류로 잇는다", () => {
    const f = ok(connect(openHandler(), "h1", "r2"));
    expect(merges(f)).toEqual([nd("m1", "MERGE", { splitId: "r1" })]);
    expect(ids(f)).toEqual(["start", "r1", "c1", "m1", "r2", "end", "h1"]); // 합류는 정상 다음 노드 바로 앞
    // 룰의 나가는 선(e2)은 ID 를 지킨 채 합류로 가고, 합류 출구(e5)는 그 바로 뒤, 새 선(e6)은 끝.
    expect(pairs(f)).toEqual(["e1:start>r1", "e2:r1>m1", "e5:m1>r2", "e3:r2>end", "e4:c1>h1", "e6:h1>m1"]);
    expect(parseFlow(f).issues).toEqual([]);
  });

  it("룰의 나가는 선에 있던 꺾는 점은 합류를 끼우면서 버린다", () => {
    const f0 = ok(setRoute(openHandler(), "e2", [{ x: 1, y: 2 }]));
    expect(ok(connect(f0, "h1", "r2")).view.routes).toEqual({});
  });

  it("돌아오는 합류가 이미 있으면 합류 출구 도착으로 잇는 선을 그 합류로 보낸다(새 합류 없음)", () => {
    const f0 = specFromScratch(); // r1 → m1 → r2, c1 → r3 → m1, c2 → end
    const f1: EditFlow = { ...f0, nodes: [...f0.nodes, nd("h9", "RULE", { ruleId: "R_H" })] };
    const f = ok(connect(ok(addCatch(f1, "r1", "h9")), "h9", "r2"));
    expect(merges(f).map((m) => m.id)).toEqual(["m1"]);
    expect(f.edges.at(-1)).toMatchObject({ from: "h9", to: "m1" });
    expect(parseFlow(f).issues).toEqual([]);
  });

  it("돌아오는 합류로 바로 잇는 것은 지금과 같다", () => {
    const f0 = specFromScratch();
    const f1: EditFlow = { ...f0, nodes: [...f0.nodes, nd("h9", "RULE", { ruleId: "R_H" })] };
    const g = ok(addCatch(f1, "r1", "h9"));
    const f = ok(connect(g, "h9", "m1"));
    expect(f.edges).toEqual([...g.edges, ed(f.edges.at(-1)!.id, "h9", "m1")]);
  });

  it("처리 갈래가 아닌 노드의 잇기는 글자 하나 다르지 않다", () => {
    const f0 = toEditFlow(null, ["R_A", "R_B"]);
    const g: EditFlow = { ...f0, nodes: [...f0.nodes, nd("x1", "RULE", { ruleId: "R_X" })] };
    const f = ok(connect(g, "x1", "r2"));
    expect(flowJsonOf(f)).toBe(flowJsonOf({ ...g, edges: [...g.edges, ed("e4", "x1", "r2")] }));
  });

  it("정상 다음 노드가 끝이면 끝으로 잇는다(끝내는 처리 갈래 — 합류를 만들지 않는다)", () => {
    // start → r1 → end, c1 → h1
    const f0 = toEditFlow(null, ["R_A"]);
    const g = ok(addCatch({ ...f0, nodes: [...f0.nodes, nd("h1", "RULE", { ruleId: "R_H" })] }, "r1", "h1"));
    const f = ok(connect(g, "h1", "end"));
    expect(merges(f)).toEqual([]);
    expect(f.edges.at(-1)).toMatchObject({ from: "h1", to: "end" });
    expect(parseFlow(f).issues).toEqual([]);
  });

  it("돌아오는 합류의 출구가 끝이어도 다른 받는 노드의 처리 갈래는 끝으로 이을 수 있다", () => {
    // start → r1 → end, c1 → end 를 돌아오게 한 뒤(r1 → m1 → end, c1 → m1), c2 → h2 를 끝으로 잇는다
    const f0 = ok(returnCatch(ok(addCatch(toEditFlow(null, ["R_A"]), "r1", null)), "c1"));
    const f1 = ok(addCatch({ ...f0, nodes: [...f0.nodes, nd("h2", "RULE", { ruleId: "R_H" })] }, "r1", "h2"));
    const f = ok(connect(f1, "h2", "end"));
    expect(f.edges.at(-1)).toMatchObject({ from: "h2", to: "end" });
    expect(parseFlow(f).issues).toEqual([]);
  });

  it("끝내는 처리 갈래의 끝 선을 정상 다음 노드로 다시 이으면 합류를 만들어 그 합류로 간다(선 ID·경로)", () => {
    const f0 = ok(setRoute(endingHandler(), "e5", [{ x: 5, y: 5 }]));
    const f = ok(reconnectEdge(f0, "e5", { to: "r2" }));
    expect(pairs(f)).toEqual(["e1:start>r1", "e2:r1>m1", "e6:m1>r2", "e3:r2>end", "e4:c1>r3", "e5:r3>m1"]);
    expect(f.view.routes).toEqual({});
    expect(parseFlow(f).issues).toEqual([]);
  });

  it("빈 처리 갈래(받는 노드 → 끝)의 첫 선을 정상 다음 노드로 옮기면 합류로 간다", () => {
    const f0 = ok(addCatch(toEditFlow(null, ["R_A", "R_B"]), "r1", null)); // c1 → end(e4)
    const f = ok(reconnectEdge(f0, "e4", { to: "r2" }));
    expect(f.edges.find((x) => x.id === "e4")).toMatchObject({ from: "c1", to: "m1" });
    expect(parseFlow(f).issues).toEqual([]);
  });

  it("예외 연결점을 정상 다음 노드에 놓아도(addCatch) 돌아오는 합류로 잇는다", () => {
    const r = addCatch(toEditFlow(null, ["R_A", "R_B"]), "r1", "r2");
    const f = ok(r);
    expect(r.ok && r.id).toBe("c1");
    expect(pairs(f)).toEqual(["e1:start>r1", "e2:r1>m1", "e4:m1>r2", "e3:r2>end", "e5:c1>m1"]);
    expect(parseFlow(f).issues).toEqual([]);
  });

  it("스펙 §2 모양을 편집 연산으로 처음부터 만들면 구조 검사가 깨끗하고 돌아오는·끝내는 처리 갈래가 하나씩이다", () => {
    const f = specFromScratch();
    const p = parseFlow(f);
    expect(p.issues).toEqual([]);
    const g = p.tree!.root.items.find((b) => b.type === "GUARDED") as Guarded;
    expect(g.mergeId).toBe("m1");
    expect(g.handlers.map((h) => [h.catchNodeId, h.ends])).toEqual([["c1", false], ["c2", true]]);
  });
});

describe("돌아오기 B — 받는 노드 「흐름으로 돌아오기」(returnCatch)", () => {
  it("끝내는 처리 갈래의 끝 선을 합류를 만들어 그 합류로 옮긴다", () => {
    const f = ok(returnCatch(endingHandler(), "c1"));
    expect(pairs(f)).toEqual(["e1:start>r1", "e2:r1>m1", "e6:m1>r2", "e3:r2>end", "e4:c1>r3", "e5:r3>m1"]);
    expect(parseFlow(f).issues).toEqual([]);
  });

  it("빈 처리 갈래(받는 노드 → 끝)는 받는 노드에서 바로 합류로 간다", () => {
    const f = ok(returnCatch(ok(addCatch(toEditFlow(null, ["R_A", "R_B"]), "r1", null)), "c1"));
    expect(f.edges.find((x) => x.id === "e4")).toMatchObject({ from: "c1", to: "m1" });
    expect(parseFlow(f).issues).toEqual([]);
  });

  it("돌아오는 합류가 이미 있으면 그 합류를 쓰고, 정상 다음 노드가 끝이어도 돌아오게 할 수 있다", () => {
    const f = ok(returnCatch(specFromScratch(), "c2"));
    expect(merges(f).map((m) => m.id)).toEqual(["m1"]);
    expect(f.edges.find((x) => x.from === "c2")).toMatchObject({ to: "m1" });
    expect(parseFlow(f).issues).toEqual([]);
    const g = ok(returnCatch(ok(addCatch(toEditFlow(null, ["R_A"]), "r1", null)), "c1"));
    expect(pairs(g)).toEqual(["e1:start>r1", "e2:r1>m1", "e4:m1>end", "e3:c1>m1"]);
    expect(parseFlow(g).issues).toEqual([]);
  });

  it("이미 돌아오는 처리 갈래·받는 노드가 아닌 노드·나가는 선이 하나가 아닌 룰은 거부한다", () => {
    expect(reason(returnCatch(specFromScratch(), "c1"))).toBe(RETURN_ALREADY);
    expect(reason(returnCatch(specFromScratch(), "r1"))).toBe("받는 노드 r1를 찾지 못했다");
    const f0 = endingHandler();
    const noOut: EditFlow = { ...f0, edges: f0.edges.filter((x) => x.id !== "e2") };
    expect(reason(returnCatch(noOut, "c1"))).toBe(RETURN_NO_EXIT);
  });

  it("처리 갈래가 끝까지 이어지지 않으면 거부한다", () => {
    expect(reason(returnCatch(openHandler(), "c1"))).toBe("처리 갈래가 끝 노드까지 이어지지 않아 돌아오게 할 수 없다");
  });
});

describe("받는 노드 우클릭 메뉴 「흐름으로 돌아오기」", () => {
  const calls: string[] = [];
  const actions = new Proxy({}, { get: (_t, k) => (...a: unknown[]) => calls.push(`${String(k)}:${a.join(",")}`) }) as unknown as CanvasActions;
  const ctx = (flow: EditFlow, mode: "edit" | "view" = "edit"): MenuContext => ({
    flow, rules: {}, mode, hasClipboard: false, selectedEdgeId: null, collapsed: new Set(), breakpoints: new Set(), canRun: true, act: actions,
  });

  it("끝내는 받는 노드에만 「삭제」 앞에 보이고 누르면 returnCatch 동작을 부른다", () => {
    const items = editMenu({ kind: "node", nodeId: "c1" }, ctx(endingHandler()));
    expect(items.map((i) => [i.id, i.label])).toEqual([["catch-return", "흐름으로 돌아오기"], ["delete", "삭제"]]);
    calls.length = 0;
    items[0].run!();
    expect(calls).toEqual(["returnCatch:c1"]);
  });

  it("이미 돌아오는 받는 노드에는 없고, 보기 모드에서는 메뉴가 없다", () => {
    expect(editMenu({ kind: "node", nodeId: "c1" }, ctx(specFromScratch())).map((i) => i.id)).toEqual(["delete"]);
    expect(editMenu({ kind: "node", nodeId: "c2" }, ctx(specFromScratch())).map((i) => i.id)).toEqual(["catch-return", "delete"]);
    expect(editMenu({ kind: "node", nodeId: "c1" }, ctx(endingHandler(), "view"))).toEqual([]);
  });
});

// ───────────────────────── 자동 배치 ─────────────────────────

const rule = (id: string) => nd(id, "RULE", { ruleId: id.toUpperCase() });
const catchOn = (id: string, attachTo: string, kind = "NO_RESULT") => nd(id, "CATCH", { attachTo, catches: [kind] });
const RANKSEP = 46;

/** 스펙 §2 예시(browser-check 의 ZZ_CATCH_CHECK_1 과 같은 모양). */
const spec2 = (): RuleSetFlow => ({
  version: 1,
  nodes: [nd("start", "START"), rule("r1"), catchOn("c1", "r1"), rule("r9"), catchOn("c2", "r1", "INPUT_ERROR"),
    nd("m1", "MERGE", { splitId: "r1" }), rule("r2"), nd("end", "END")],
  edges: [ed("e1", "start", "r1"), ed("e2", "r1", "m1"), ed("e3", "c1", "r9"), ed("e4", "r9", "m1"), ed("e5", "c2", "end"),
    ed("e6", "m1", "r2"), ed("e7", "r2", "end")],
});

/** browser-check 의 끝내는 갈래만 있는 세트 — start → r1 → r2 → r3 → r4 → end, c1(r2) → end. */
const endingOnly = (): RuleSetFlow => ({
  version: 1,
  nodes: [nd("start", "START"), rule("r1"), rule("r2"), catchOn("c1", "r2"), rule("r3"), rule("r4"), nd("end", "END")],
  edges: [ed("e1", "start", "r1"), ed("e2", "r1", "r2"), ed("e3", "r2", "r3"), ed("e4", "r3", "r4"), ed("e5", "r4", "end"), ed("e6", "c1", "end")],
});

/** 끝내는 처리 갈래에 몸이 있는 세트 — start → r1 → r2 → r3 → end, c1(r1) → h1 → end. */
const endingBody = (): RuleSetFlow => ({
  version: 1,
  nodes: [nd("start", "START"), rule("r1"), catchOn("c1", "r1"), rule("h1"), rule("r2"), rule("r3"), nd("end", "END")],
  edges: [ed("e1", "start", "r1"), ed("e2", "r1", "r2"), ed("e3", "r2", "r3"), ed("e4", "r3", "end"), ed("e5", "c1", "h1"), ed("e6", "h1", "end")],
});

beforeEach(() => clearLayoutCache());

describe("룰과 처리 갈래 사이에 빈 층이 없다(browser-check 추가 1 (a))", () => {
  it("돌아오는 처리 갈래의 첫 노드는 룰 바로 아래 층", () => {
    const pos = autoLayout(spec2());
    expect(pos.r9.y - (pos.r1.y + NODE_SIZE.RULE.h)).toBe(RANKSEP);
  });

  it("끝내는 처리 갈래의 첫 노드도 룰 바로 아래 층", () => {
    const pos = autoLayout(endingBody());
    expect(pos.h1.y).toBe(pos.r2.y);
    expect(pos.h1.y - (pos.r1.y + NODE_SIZE.RULE.h)).toBe(RANKSEP);
  });
});

/** 캔버스가 그리는 선 양 끝 — 나가는 연결점은 아래 가운데(8px 손잡이 아래 끝), 들어오는 연결점은 위 가운데(손잡이 위 끝). */
function ends(f: RuleSetFlow, pos: Record<string, FlowPos>, e: FlowEdge): [FlowPos, FlowPos] {
  const kind = (id: string) => f.nodes!.find((n) => n.id === id)!.kind;
  const s = NODE_SIZE[kind(e.from)];
  const t = NODE_SIZE[kind(e.to)];
  return [{ x: pos[e.from].x + s.w / 2, y: pos[e.from].y + s.h + 4 }, { x: pos[e.to].x + t.w / 2, y: pos[e.to].y - 4 }];
}
/** 그려지는 꺾은선 전체 — 경로가 있으면 양 끝 + 경로, 없으면 자동 꺾은선(getSmoothStepPath 와 같은 점). */
function polyline(f: RuleSetFlow, pos: Record<string, FlowPos>, e: FlowEdge, route: readonly FlowPos[] | undefined): FlowPos[] {
  const [s, t] = ends(f, pos, e);
  if (route && route.length > 0) return [s, ...route, t];
  return smoothStepPoints({ sourceX: s.x, sourceY: s.y, sourcePosition: "bottom", targetX: t.x, targetY: t.y, targetPosition: "top" });
}
/** 꺾은선(가로·세로 선분)이 지나는 노드 상자(양 끝 노드·받는 노드 제외). 상자 테두리에 닿기만 하는 것은 지나는 것으로 보지 않는다. */
function crossed(f: RuleSetFlow, pos: Record<string, FlowPos>, e: FlowEdge, pts: readonly FlowPos[]): string[] {
  const out: string[] = [];
  for (const n of f.nodes!) {
    if (n.id === e.from || n.id === e.to || n.kind === "CATCH") continue;
    const s = NODE_SIZE[n.kind];
    const [x1, y1, x2, y2] = [pos[n.id].x, pos[n.id].y, pos[n.id].x + s.w, pos[n.id].y + s.h];
    const hit = pts.slice(1).some((b, i) => {
      const a = pts[i];
      const [lx, hx, ly, hy] = [Math.min(a.x, b.x), Math.max(a.x, b.x), Math.min(a.y, b.y), Math.max(a.y, b.y)];
      return lx < x2 && x1 < hx + (lx === hx ? 1 : 0) && ly < y2 && y1 < hy + (ly === hy ? 1 : 0) && (lx !== hx || x1 < lx) && (ly !== hy || y1 < ly);
    });
    if (hit) out.push(n.id);
  }
  return out;
}

describe("끝내는 처리 갈래 선은 다른 노드 상자를 지나지 않는다(browser-check 추가 1 (b))", () => {
  const cases: [string, () => RuleSetFlow, string][] = [
    ["스펙 §2 — 빈 끝내는 갈래 c2 → end 가 합류·다음 룰 위를 지난다", spec2, "e5"],
    ["끝내는 갈래만 있는 세트 — c1 → end 가 정상 갈래 룰 위를 지난다", endingOnly, "e6"],
    ["끝내는 갈래 몸의 마지막 선 h1 → end", endingBody, "e6"],
  ];
  for (const [name, make, edgeId] of cases) {
    it(name, () => {
      const f = toEditFlow({ ...make() } as never, []);
      const pos = drawnPositions(f);
      const e = f.edges.find((x) => x.id === edgeId)!;
      const routes = endingRoutes(f, pos);
      expect(crossed(f, pos, e, polyline(f, pos, e, undefined))).not.toEqual([]); // 고치기 전 모양(전제)
      expect(crossed(f, pos, e, polyline(f, pos, e, routes[edgeId]))).toEqual([]);
      for (const x of f.edges) if (x.id !== edgeId) expect(routes[x.id]).toBeUndefined(); // 끝내는 갈래의 끝 선만
    });
  }

  it("빈 끝내는 갈래가 있어도 정상 갈래는 룰 가운데 아래 한 줄로 선다(고치기 전에는 r3·r4 가 옆으로 85 밀렸다)", () => {
    // 몸 있는 끝내는 갈래(endingBody)는 고치기 전·후 모두 정상 갈래가 옆으로 밀린다 — 보고서 우려 항목.
    const mid = (p: FlowPos, w: number) => p.x + w / 2;
    const pos = autoLayout(endingOnly());
    for (const id of ["r2", "r3", "r4"]) expect(mid(pos[id], NODE_SIZE.RULE.w)).toBe(mid(pos.r1, NODE_SIZE.RULE.w));
    expect(mid(pos.end, NODE_SIZE.END.w)).toBe(mid(pos.r1, NODE_SIZE.RULE.w));
  });

  it("돌아오는 선·평범한 선에는 경로를 만들지 않고, 받는 노드 없는 흐름은 빈 결과다", () => {
    const f = toEditFlow({ ...spec2() } as never, []);
    expect(Object.keys(endingRoutes(f, drawnPositions(f)))).toEqual(["e5"]);
    const plain = toEditFlow(null, ["R_A", "R_B"]);
    expect(endingRoutes(plain, drawnPositions(plain))).toEqual({});
  });
});
