import { beforeEach, describe, expect, it } from "vitest";

import type { FlowEdge, FlowNode, FlowNodeKind, RuleSetFlow } from "../../../src/contract/engine-contract.generated";
import { toEditFlow } from "../../../pages/dme/ruleSetEdit/flow-edit";
import { NODE_SIZE, autoLayout, catchSlots, catchSpot, clearLayoutCache, drawnPositions } from "../../../pages/dme/ruleSetEdit/flow-layout";
import { parseFlow } from "../../../pages/dme/ruleSetEdit/flow-model";

const nd = (id: string, kind: FlowNodeKind, over: Partial<FlowNode> = {}): FlowNode => ({ id, kind, ruleId: null, splitId: null, label: null, ...over });
const ed = (id: string, from: string, to: string, over: Partial<FlowEdge> = {}): FlowEdge => ({ id, from, to, order: null, cond: null, otherwise: false, label: null, ...over });
const cx = (p: { x: number }, w: number) => p.x + w / 2;

/** start → r1 → n1 → mr → end. c1 → h1 → mr, c2 → h2 → end. */
const guarded = (): RuleSetFlow => ({
  version: 1,
  nodes: [
    nd("start", "START"), nd("r1", "RULE", { ruleId: "R1" }), nd("n1", "RULE", { ruleId: "N1" }),
    nd("c1", "CATCH", { attachTo: "r1", catches: ["NO_RESULT"] }), nd("h1", "RULE", { ruleId: "H1" }),
    nd("c2", "CATCH", { attachTo: "r1", catches: ["EVAL_ERROR"] }), nd("h2", "RULE", { ruleId: "H2" }),
    nd("mr", "MERGE", { splitId: "r1" }), nd("end", "END"),
  ],
  edges: [ed("e1", "start", "r1"), ed("e2", "r1", "n1"), ed("e3", "n1", "mr"), ed("e4", "c1", "h1"), ed("e5", "h1", "mr"),
    ed("e6", "c2", "h2"), ed("e7", "h2", "end"), ed("e8", "mr", "end")],
});

/** start → r1 → r2 → end. c1(attachTo 는 인자) → h1 → end — 끝내는 처리 갈래라 합류가 없어 r1·r2 어느 쪽에 붙여도 선은 같다. */
const reattach = (attachTo: string): RuleSetFlow => ({
  version: 1,
  nodes: [
    nd("start", "START"), nd("r1", "RULE", { ruleId: "R1" }), nd("r2", "RULE", { ruleId: "R2" }),
    nd("c1", "CATCH", { attachTo, catches: ["NO_RESULT"] }), nd("h1", "RULE", { ruleId: "H1" }), nd("end", "END"),
  ],
  edges: [ed("e1", "start", "r1"), ed("e2", "r1", "r2"), ed("e3", "r2", "end"), ed("e4", "c1", "h1"), ed("e5", "h1", "end")],
});

beforeEach(() => clearLayoutCache());

describe("받는 노드 배치(받는 노드 spec §8, Ruling R15)", () => {
  it("받는 노드는 룰 아래 테두리에 걸쳐 왼쪽부터 순번대로 놓인다", () => {
    expect(catchSpot({ x: 100, y: 200 }, { w: 232, h: 68 }, 0)).toEqual({ x: 116, y: 254 });
    expect(catchSpot({ x: 100, y: 200 }, { w: 232, h: 68 }, 1)).toEqual({ x: 152, y: 254 });
    expect([...catchSlots(guarded())]).toEqual([["c1", { attachTo: "r1", k: 0 }], ["c2", { attachTo: "r1", k: 1 }]]);
  });

  it("붙은 노드가 없거나 받을 수 없는 종류면 자리 목록에서 빠진다", () => {
    const f = guarded();
    f.nodes!.push(nd("c3", "CATCH", { attachTo: "nope", catches: ["NO_RESULT"] }), nd("c4", "CATCH", { attachTo: "mr", catches: ["NO_RESULT"] }),
      nd("c5", "CATCH", { catches: ["NO_RESULT"] }));
    expect([...catchSlots(f).keys()]).toEqual(["c1", "c2"]);
  });

  it("자동 배치 — 정상 갈래는 룰 아래, 처리 갈래는 그 오른쪽 순서대로", () => {
    const pos = autoLayout(guarded());
    const W = NODE_SIZE.RULE.w;
    expect(cx(pos.n1, W)).toBeCloseTo(cx(pos.r1, W), 0);
    expect(pos.h1.x).toBeGreaterThanOrEqual(pos.n1.x + W);
    expect(pos.h2.x).toBeGreaterThanOrEqual(pos.h1.x + W);
    expect(pos.n1.y).toBeGreaterThan(pos.r1.y);
    expect(pos.h1.y).toBeGreaterThan(pos.r1.y + NODE_SIZE.RULE.h); // 처리 갈래는 룰 아래 층(가상 선 룰 → 받는 노드)
    expect(pos.c1).toEqual(catchSpot(pos.r1, NODE_SIZE.RULE, 0));
    expect(pos.c2).toEqual(catchSpot(pos.r1, NODE_SIZE.RULE, 1));
  });

  it("그린 위치에서 받는 노드는 저장 위치가 있는 룰을 따라가고, 받는 노드의 저장 위치(옛 값)는 무시한다", () => {
    const f = toEditFlow({ ...guarded(), view: { positions: { r1: { x: 500, y: 40 }, c1: { x: 0, y: 0 } } } } as never, []);
    const pos = drawnPositions(f);
    expect(pos.r1).toEqual({ x: 500, y: 40 });
    expect(pos.c1).toEqual({ x: 516, y: 94 });
    expect(pos.c2).toEqual({ x: 552, y: 94 });
  });

  it("받는 노드를 다른 룰로 옮겨 붙이면(그 밖은 같다) 캐시된 옛 배치가 아니라 새 배치가 나온다", () => {
    const fresh1 = autoLayout(reattach("r1"));
    clearLayoutCache();
    const fresh2 = autoLayout(reattach("r2"));
    expect(fresh2.h1).not.toEqual(fresh1.h1); // 가상 선이 달라 처리 갈래 층이 다르다
    clearLayoutCache();
    expect(autoLayout(reattach("r1"))).toEqual(fresh1);
    const again = autoLayout(reattach("r2")); // 캐시에 r1 배치가 있는 채로
    expect(again).toEqual(fresh2);
    expect(again.c1).toEqual(catchSpot(again.r2, NODE_SIZE.RULE, 0));
  });

  it("받는 노드 없는 흐름의 자동 배치는 그대로다", () => {
    const plain: RuleSetFlow = { version: 1, nodes: [nd("start", "START"), nd("r1", "RULE", { ruleId: "R1" }), nd("end", "END")],
      edges: [ed("e1", "start", "r1"), ed("e2", "r1", "end")] };
    expect(Object.keys(autoLayout(plain))).toEqual(["start", "r1", "end"]);
    expect(catchSlots(plain).size).toBe(0);
    // 갈래 있는 흐름의 자리 — 받는 노드 처리를 넣기 전(6c433334) 값에서 합류 막대 크기(200×14)만 바뀐다.
    // 2026-10-02: 짧은 갈래(a2)는 합류 쪽으로 처지지 않고 분기 바로 아래 층에 붙는다(BRANCH_HEAD_WEIGHT, y 400 → 286).
    const ifFlow: RuleSetFlow = {
      version: 1,
      nodes: [nd("start", "START"), nd("r1", "RULE", { ruleId: "R1" }), nd("if1", "IF"), nd("a1", "RULE", { ruleId: "A1" }),
        nd("a2", "RULE", { ruleId: "A2" }), nd("a3", "RULE", { ruleId: "A3" }), nd("m1", "MERGE", { splitId: "if1" }), nd("end", "END")],
      edges: [ed("e1", "start", "r1"), ed("e2", "r1", "if1"), ed("e3", "if1", "a1", { order: 1, cond: "x > 1" }), ed("e4", "if1", "a2", { otherwise: true }),
        ed("e5", "a1", "a3"), ed("e6", "a3", "m1"), ed("e7", "a2", "m1"), ed("e8", "m1", "end")],
    };
    expect(autoLayout(ifFlow)).toEqual({
      start: { x: 192, y: 0 }, r1: { x: 136, y: 82 }, if1: { x: 164, y: 196 }, a1: { x: 0, y: 286 },
      a2: { x: 272, y: 286 }, a3: { x: 0, y: 400 }, m1: { x: 152, y: 514 }, end: { x: 192, y: 574 },
    });
  });
});

describe("끝내는 처리 갈래 뒤 줄기 정렬(2026-10-02 DESIGN_KEY 자동 정렬)", () => {
  /** start → r1(c1 → h1 → end) → p1 → {b1 | b2 → b3} → m1 → r4 → end — 처리 갈래가 끝내고 정상 갈래가 비어 뒤 줄기가 바깥 몸에 있다. */
  const flow = (): RuleSetFlow => ({
    version: 1,
    nodes: [
      nd("start", "START"), nd("r1", "RULE", { ruleId: "R1" }), nd("p1", "PARALLEL"), nd("b1", "TASK"), nd("b2", "TASK"), nd("b3", "TASK"),
      nd("m1", "MERGE", { splitId: "p1" }), nd("c1", "CATCH", { attachTo: "r1", catches: ["NO_RESULT"] }), nd("h1", "TASK"), nd("r4", "TASK"), nd("end", "END"),
    ],
    edges: [ed("e1", "start", "r1"), ed("e2", "r1", "p1"), ed("e3", "p1", "b1", { order: 1 }), ed("e4", "b1", "m1"), ed("e5", "p1", "b2", { order: 2 }),
      ed("e6", "b2", "b3"), ed("e7", "b3", "m1"), ed("e8", "m1", "r4"), ed("e9", "r4", "end"), ed("e10", "c1", "h1"), ed("e11", "h1", "end")],
  });

  it("끝내는 몸이 뒤 줄기보다 길어도 END 는 모든 노드 아래에 선다(처리 갈래·끝내는 IF 갈래)", () => {
    const sizeOf = (f: RuleSetFlow, id: string) => NODE_SIZE[f.nodes!.find((n) => n.id === id)!.kind];
    const below = (f: RuleSetFlow) => {
      const pos = autoLayout(f);
      const bottom = Math.max(...f.nodes!.filter((n) => n.kind !== "END" && n.kind !== "CATCH").map((n) => pos[n.id].y + sizeOf(f, n.id).h));
      expect(pos.end.y, JSON.stringify(pos)).toBeGreaterThan(bottom);
      expect(overlapsOf(f, pos)).toEqual([]);
    };
    below({
      version: 1,
      nodes: [nd("start", "START"), nd("r1", "RULE", { ruleId: "R1" }), nd("c1", "CATCH", { attachTo: "r1", catches: ["NO_RESULT"] }),
        nd("h1", "TASK"), nd("h2", "TASK"), nd("h3", "TASK"), nd("end", "END")],
      edges: [ed("e1", "start", "r1"), ed("e2", "r1", "end"), ed("e3", "c1", "h1"), ed("e4", "h1", "h2"), ed("e5", "h2", "h3"), ed("e6", "h3", "end")],
    });
    below({
      version: 1,
      nodes: [nd("start", "START"), nd("if1", "IF"), nd("a1", "TASK"), nd("a2", "TASK"), nd("a3", "TASK"), nd("b1", "TASK"), nd("end", "END")],
      edges: [ed("e1", "start", "if1"), ed("e2", "if1", "a1", { order: 1, cond: "x > 1" }), ed("e3", "a1", "a2"), ed("e4", "a2", "a3"), ed("e5", "a3", "end"),
        ed("e6", "if1", "b1", { otherwise: true }), ed("e7", "b1", "end")],
    });
  });

  it("룰 앞뒤 줄기가 한 세로줄에 서고, 처리 갈래는 오른쪽에 비켜 서며, 짧은 갈래는 분기 바로 아래에 붙는다", () => {
    const f = flow();
    const pos = autoLayout(f);
    const w = (id: string) => NODE_SIZE[f.nodes!.find((n) => n.id === id)!.kind].w;
    const mid = cx(pos.r1, w("r1"));
    for (const id of ["start", "p1", "m1", "r4", "end"]) expect(cx(pos[id], w(id)), id).toBe(mid);
    expect(pos.b1.y).toBe(pos.b2.y);
    expect(pos.h1.x).toBeGreaterThan(Math.max(pos.b2.x, pos.b3.x) + w("b2"));
    expect(overlapsOf(f, pos)).toEqual([]);
  });
});

/** 겹친 노드 쌍(받는 노드 제외 — 룰 테두리에 걸치는 것이 정상이다). 맞닿는 것은 겹침으로 보지 않는다. */
function overlapsOf(f: RuleSetFlow, pos: Record<string, { x: number; y: number }>): string[] {
  const ns = (f.nodes ?? []).filter((n) => n.kind !== "CATCH");
  const out: string[] = [];
  for (let i = 0; i < ns.length; i++) {
    for (let j = i + 1; j < ns.length; j++) {
      const [a, b] = [ns[i], ns[j]];
      const [sa, sb, A, B] = [NODE_SIZE[a.kind], NODE_SIZE[b.kind], pos[a.id], pos[b.id]];
      if (A.x < B.x + sb.w && B.x < A.x + sa.w && A.y < B.y + sb.h && B.y < A.y + sa.h) out.push(`${a.id}-${b.id}`);
    }
  }
  return out;
}
const rule = (id: string) => nd(id, "RULE", { ruleId: id.toUpperCase() });
const catchOn = (id: string, attachTo: string, kind = "NO_RESULT") => nd(id, "CATCH", { attachTo, catches: [kind] });

describe("중첩된 받는 룰의 처리 갈래는 이웃 갈래와 겹치지 않는다(고침 1회차 — 안쪽부터 폭을 정한다)", () => {
  it("IF 갈래 안의 받는 룰 — 처리 갈래가 형제 갈래(그 외)와 겹치지 않는다", () => {
    const f: RuleSetFlow = {
      version: 1,
      nodes: [nd("start", "START"), rule("r0"), nd("if1", "IF"), rule("r1"), catchOn("c1", "r1"), rule("h1"), rule("n1"),
        nd("mr", "MERGE", { splitId: "r1" }), rule("a2"), rule("a3"), rule("a4"), nd("m1", "MERGE", { splitId: "if1" }), nd("end", "END")],
      edges: [ed("e1", "start", "r0"), ed("e2", "r0", "if1"), ed("e3", "if1", "r1", { order: 1, cond: "x > 1" }), ed("e4", "if1", "a2", { otherwise: true }),
        ed("e5", "r1", "n1"), ed("e6", "n1", "mr"), ed("e7", "c1", "h1"), ed("e8", "h1", "mr"), ed("e9", "mr", "m1"),
        ed("e10", "a2", "a3"), ed("e11", "a3", "a4"), ed("e12", "a4", "m1"), ed("e13", "m1", "end")],
    };
    expect(parseFlow(f).tree).toBeTruthy();
    const pos = autoLayout(f);
    expect(overlapsOf(f, pos)).toEqual([]);
    expect(pos.h1.x).toBeGreaterThanOrEqual(pos.n1.x + NODE_SIZE.RULE.w); // 처리 갈래는 여전히 정상 갈래 오른쪽
    expect(pos.a3.x).toBeGreaterThanOrEqual(pos.h1.x + NODE_SIZE.RULE.w); // 그 외 갈래는 받는 룰 블록 전체의 오른쪽
  });

  it("받는 룰의 정상 갈래 안에 또 받는 룰 — 안쪽 처리 갈래가 바깥 처리 갈래와 겹치지 않는다", () => {
    const f: RuleSetFlow = {
      version: 1,
      nodes: [nd("start", "START"), rule("r1"), catchOn("c1", "r1"), rule("h1"), rule("h1b"), rule("h1c"),
        rule("r2"), catchOn("c2", "r2"), rule("h2"), rule("h2b"), rule("n2"), nd("m2", "MERGE", { splitId: "r2" }),
        nd("m1", "MERGE", { splitId: "r1" }), nd("end", "END")],
      edges: [ed("e1", "start", "r1"), ed("e2", "r1", "r2"), ed("e3", "r2", "n2"), ed("e4", "n2", "m2"), ed("e5", "c2", "h2"), ed("e6", "h2", "h2b"),
        ed("e7", "h2b", "m2"), ed("e8", "m2", "m1"), ed("e9", "c1", "h1"), ed("e10", "h1", "h1b"), ed("e11", "h1b", "h1c"), ed("e12", "h1c", "m1"),
        ed("e13", "m1", "end")],
    };
    expect(parseFlow(f).tree).toBeTruthy();
    const pos = autoLayout(f);
    expect(overlapsOf(f, pos)).toEqual([]);
    expect(pos.h2.x).toBeGreaterThanOrEqual(pos.n2.x + NODE_SIZE.RULE.w);
    expect(pos.h1.x).toBeGreaterThanOrEqual(pos.h2.x + NODE_SIZE.RULE.w); // 바깥 처리 갈래는 안쪽 블록 전체의 오른쪽
  });

  it("처리 갈래 몸 안의 받는 룰 — 안쪽 처리 갈래가 다음 처리 갈래와 겹치지 않는다", () => {
    const f: RuleSetFlow = {
      version: 1,
      nodes: [nd("start", "START"), rule("r1"), rule("n1"), catchOn("c1", "r1"), rule("h1"), catchOn("c2", "h1"), rule("g1"), rule("g1b"),
        rule("hn"), nd("mh", "MERGE", { splitId: "h1" }), catchOn("c3", "r1", "EVAL_ERROR"), rule("h3"), rule("h3b"), rule("h3c"),
        nd("m1", "MERGE", { splitId: "r1" }), nd("end", "END")],
      edges: [ed("e1", "start", "r1"), ed("e2", "r1", "n1"), ed("e3", "n1", "m1"), ed("e4", "c1", "h1"), ed("e5", "h1", "hn"), ed("e6", "hn", "mh"),
        ed("e7", "c2", "g1"), ed("e8", "g1", "g1b"), ed("e9", "g1b", "mh"), ed("e10", "mh", "m1"), ed("e11", "c3", "h3"), ed("e12", "h3", "h3b"),
        ed("e13", "h3b", "h3c"), ed("e14", "h3c", "m1"), ed("e15", "m1", "end")],
    };
    expect(parseFlow(f).tree).toBeTruthy();
    const pos = autoLayout(f);
    expect(overlapsOf(f, pos)).toEqual([]);
    expect(pos.g1.x).toBeGreaterThanOrEqual(pos.hn.x + NODE_SIZE.RULE.w);
    expect(pos.h3.x).toBeGreaterThanOrEqual(pos.g1.x + NODE_SIZE.RULE.w); // 다음 처리 갈래는 앞 처리 갈래 블록 전체의 오른쪽
  });
});

describe("끝내는 처리 갈래는 같은 높이의 다른 노드와 겹치지 않는다(고침 2회차)", () => {
  it("끝내는 처리 갈래가 길어도 받는 룰 뒤의 IF 블록과 겹치지 않는다", () => {
    const f: RuleSetFlow = {
      version: 1,
      nodes: [nd("start", "START"), rule("r1"), catchOn("c1", "r1"), rule("h1"), rule("h1b"), rule("h1c"), rule("h1d"), nd("if1", "IF"),
        rule("a1"), rule("a1b"), rule("a2"), rule("a2b"), nd("m1", "MERGE", { splitId: "if1" }), nd("end", "END")],
      edges: [ed("e1", "start", "r1"), ed("e2", "r1", "if1"), ed("e3", "if1", "a1", { order: 1, cond: "x > 1" }), ed("e4", "if1", "a2", { otherwise: true }),
        ed("e5", "a1", "a1b"), ed("e6", "a1b", "m1"), ed("e7", "a2", "a2b"), ed("e8", "a2b", "m1"), ed("e9", "m1", "end"),
        ed("e10", "c1", "h1"), ed("e11", "h1", "h1b"), ed("e12", "h1b", "h1c"), ed("e13", "h1c", "h1d"), ed("e14", "h1d", "end")],
    };
    expect(parseFlow(f).tree).toBeTruthy();
    const pos = autoLayout(f);
    expect(overlapsOf(f, pos)).toEqual([]);
    expect(pos.h1.x).toBeGreaterThanOrEqual(pos.a2.x + NODE_SIZE.RULE.w); // 처리 갈래는 IF 블록 전체의 오른쪽
    expect(pos.c1).toEqual(catchSpot(pos.r1, NODE_SIZE.RULE, 0));
  });

  it("같은 룰의 끝내는 처리 갈래 둘이 넓은 IF 블록을 모두 피하고 받는 노드 순서대로 왼쪽→오른쪽에 선다", () => {
    const f: RuleSetFlow = {
      version: 1,
      nodes: [nd("start", "START"), rule("r1"), catchOn("c1", "r1"), rule("h1"), rule("h1b"), rule("h1c"),
        catchOn("c2", "r1", "EVAL_ERROR"), rule("h2"), rule("h2b"), rule("h2c"), nd("if1", "IF"),
        rule("a1"), rule("a1b"), rule("a2"), rule("a2b"), rule("a3"), rule("a3b"), nd("m1", "MERGE", { splitId: "if1" }), nd("end", "END")],
      edges: [ed("e1", "start", "r1"), ed("e2", "r1", "if1"), ed("e3", "if1", "a1", { order: 1, cond: "x > 1" }), ed("e4", "if1", "a2", { order: 2, cond: "x > 2" }),
        ed("e5", "if1", "a3", { otherwise: true }), ed("e6", "a1", "a1b"), ed("e7", "a1b", "m1"), ed("e8", "a2", "a2b"), ed("e9", "a2b", "m1"),
        ed("e10", "a3", "a3b"), ed("e11", "a3b", "m1"), ed("e12", "m1", "end"),
        ed("e13", "c1", "h1"), ed("e14", "h1", "h1b"), ed("e15", "h1b", "h1c"), ed("e16", "h1c", "end"),
        ed("e17", "c2", "h2"), ed("e18", "h2", "h2b"), ed("e19", "h2b", "h2c"), ed("e20", "h2c", "end")],
    };
    expect(parseFlow(f).tree).toBeTruthy();
    const pos = autoLayout(f);
    expect(overlapsOf(f, pos)).toEqual([]);
    const ifRight = Math.max(...["if1", "a1", "a1b", "a2", "a2b", "a3", "a3b"].map((id) => pos[id].x + NODE_SIZE[id === "if1" ? "IF" : "RULE"].w));
    expect(pos.h1.x).toBeGreaterThanOrEqual(ifRight);
    expect(pos.h2.x).toBeGreaterThanOrEqual(pos.h1.x + NODE_SIZE.RULE.w); // 순서 유지
    expect(pos.c2).toEqual(catchSpot(pos.r1, NODE_SIZE.RULE, 1));
  });
});

describe("빈 처리 갈래 판정(implicit-join spec §9)", () => {
  const N = (id: string, kind: "START" | "END" | "RULE" | "IF") => ({ id, kind, ruleId: kind === "RULE" ? id.toUpperCase() : null, splitId: null, label: null });
  const E = (id: string, from: string, to: string, over: { order?: number; cond?: string; otherwise?: boolean } = {}) =>
    ({ id, from, to, order: over.order ?? null, cond: over.cond ?? null, otherwise: over.otherwise ?? false, label: null });
  /** start → i(IF) [r1 → x → n](조건 갈래) [a → n](그 외) → end. r1 에 붙은 빈 CATCH c1 은 IF 뒤 모이는 노드 n 으로 돌아온다. */
  const build = (withCatch: boolean) => {
    const nodes = [N("start", "START"), N("i", "IF"), N("r1", "RULE"), N("x", "RULE"), N("a", "RULE"), N("n", "RULE"), N("end", "END")];
    const edges = [E("e1", "start", "i"), E("e2", "i", "r1", { order: 1, cond: "X>0" }), E("e3", "r1", "x"), E("e4", "x", "n"),
      E("e5", "i", "a", { otherwise: true }), E("e6", "a", "n"), E("e7", "n", "end")];
    if (!withCatch) return toEditFlow({ version: 1, nodes, edges }, []);
    return toEditFlow({ version: 1, nodes: [...nodes, { ...N("c1", "RULE"), kind: "CATCH" as const, ruleId: null, attachTo: "r1", catches: ["NO_RESULT"] }],
      edges: [...edges, E("e8", "c1", "n")] }, []);
  };
  it("IF 뒤 모이는 노드로 바로 돌아오는 빈 처리 갈래는 가상 선을 넣지 않아 받는 노드 없는 흐름과 배치가 같다", () => {
    clearLayoutCache();
    const a = autoLayout(build(false));
    clearLayoutCache();
    const b = autoLayout(build(true));
    for (const id of ["start", "i", "r1", "x", "a", "n", "end"]) expect(b[id], id).toEqual(a[id]);
  });

  it("돌아오는 노드는 바깥 순차 노드라 dagre 자리 그대로다 — 정상 갈래 아래 층에 오고 갈래 위에서 가운데로 모인다", () => {
    clearLayoutCache();
    const pos = autoLayout(build(true));
    expect(pos.n.y).toBeGreaterThan(pos.x.y);
    expect(pos.n.y).toBeGreaterThan(pos.a.y);
  });
});
