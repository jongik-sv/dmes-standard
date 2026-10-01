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

  it("자동 배치 — 정상 갈래는 룰 아래, 처리 갈래는 그 오른쪽 순서대로, 돌아오는 합류는 룰 가운데 아래", () => {
    const pos = autoLayout(guarded());
    const W = NODE_SIZE.RULE.w;
    expect(cx(pos.n1, W)).toBeCloseTo(cx(pos.r1, W), 0);
    expect(cx(pos.mr, NODE_SIZE.MERGE.w)).toBeCloseTo(cx(pos.r1, W), 0);
    expect(pos.h1.x).toBeGreaterThanOrEqual(pos.n1.x + W);
    expect(pos.h2.x).toBeGreaterThanOrEqual(pos.h1.x + W);
    expect(pos.n1.y).toBeGreaterThan(pos.r1.y);
    expect(pos.h1.y).toBeGreaterThan(pos.r1.y + NODE_SIZE.RULE.h); // 처리 갈래는 룰 아래 층(가상 선 룰 → 받는 노드)
    expect(pos.c1).toEqual(catchSpot(pos.r1, NODE_SIZE.RULE, 0));
    expect(pos.c2).toEqual(catchSpot(pos.r1, NODE_SIZE.RULE, 1));
  });

  it("그린 위치에서 받는 노드는 저장 위치가 있는 룰을 따라가고, 받는 노드의 저장 위치(옛 값)는 무시한다", () => {
    // 노드는 원본 배열로 둔다 — 이 태스크는 flow-edit 를 고치지 않으므로 copyNode 의 attachTo 보존(Task 6)에 기대지 않는다.
    const raw = guarded();
    const f = { ...toEditFlow({ ...raw, view: { positions: { r1: { x: 500, y: 40 }, c1: { x: 0, y: 0 } } } } as never, []), nodes: raw.nodes! };
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
    // 갈래 있는 흐름의 자리 — 받는 노드 처리를 넣기 전(6c433334) 값 그대로다.
    const ifFlow: RuleSetFlow = {
      version: 1,
      nodes: [nd("start", "START"), nd("r1", "RULE", { ruleId: "R1" }), nd("if1", "IF"), nd("a1", "RULE", { ruleId: "A1" }),
        nd("a2", "RULE", { ruleId: "A2" }), nd("a3", "RULE", { ruleId: "A3" }), nd("m1", "MERGE", { splitId: "if1" }), nd("end", "END")],
      edges: [ed("e1", "start", "r1"), ed("e2", "r1", "if1"), ed("e3", "if1", "a1", { order: 1, cond: "x > 1" }), ed("e4", "if1", "a2", { otherwise: true }),
        ed("e5", "a1", "a3"), ed("e6", "a3", "m1"), ed("e7", "a2", "m1"), ed("e8", "m1", "end")],
    };
    expect(autoLayout(ifFlow)).toEqual({
      start: { x: 192, y: 0 }, r1: { x: 136, y: 82 }, if1: { x: 164, y: 196 }, a1: { x: 0, y: 286 },
      a2: { x: 272, y: 400 }, a3: { x: 0, y: 400 }, m1: { x: 238, y: 514 }, end: { x: 192, y: 588 },
    });
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
