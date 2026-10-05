// 계획 C2·C3 — 흐름 구조 해석 `flow-model.ts`(엔진 FlowParser·FlowTree 의 TS 짝). 문구·순서의 서버 동치 전체는 `rule-set-corpus.test.ts` 가 본다.
import { describe, expect, it } from "vitest";

import type { FlowEdge, FlowNode, FlowNodeKind, RuleSetFlow } from "../../../src/contract/engine-contract.generated";
import {
  CATCHABLE,
  CATCH_KINDS,
  CATCH_NAMES,
  catchKindsFor,
  catchesOf,
  endingBranches,
  flowRuleIds,
  flowSetIds,
  handlerTarget,
  joinOf,
  linearFlow,
  parseFlow,
  returnOf,
  type FlowIssue,
} from "../../../pages/dme/ruleSetEdit/flow-model";

const node = (id: string, kind: FlowNodeKind, over: Partial<FlowNode> = {}): FlowNode => ({
  id,
  kind,
  ruleId: null,
  splitId: null,
  label: null,
  ...over,
});
const edge = (id: string, from: string, to: string, over: Partial<FlowEdge> = {}): FlowEdge => ({
  id,
  from,
  to,
  order: null,
  cond: null,
  otherwise: false,
  label: null,
  ...over,
});
const flow = (nodes: FlowNode[], edges: FlowEdge[]): RuleSetFlow => ({ version: 1, nodes, edges });
const S = (nodeId: string | null, message: string, edgeId: string | null = null): FlowIssue => ({ code: "FLOW_STRUCTURE", nodeId, edgeId, message });
const E = (nodeId: string | null, message: string, edgeId: string | null = null): FlowIssue => ({ code: "FLOW_IF_ELSE", nodeId, edgeId, message });

/** start → if1 ─e2(1, A = 1)→ r1 ─┐, if1 ─e3(그 외)→ r2 ─┤ m1 → end */
function ifNodes(): FlowNode[] {
  return [
    node("start", "START"),
    node("if1", "IF"),
    node("r1", "RULE", { ruleId: "R1" }),
    node("r2", "RULE", { ruleId: "R2" }),
    node("m1", "MERGE", { splitId: "if1" }),
    node("end", "END"),
  ];
}
function ifEdges(): FlowEdge[] {
  return [
    edge("e1", "start", "if1"),
    edge("e2", "if1", "r1", { order: 1, cond: "A = 1" }),
    edge("e3", "if1", "r2", { otherwise: true }),
    edge("e4", "r1", "m1"),
    edge("e5", "r2", "m1"),
    edge("e6", "m1", "end"),
  ];
}
/** start → p1 ─e2(1)→ r1 ─┐, p1 ─e3(2)→ r2 ─┤ m1 → end */
function parNodes(): FlowNode[] {
  return [
    node("start", "START"),
    node("p1", "PARALLEL"),
    node("r1", "RULE", { ruleId: "R1" }),
    node("r2", "RULE", { ruleId: "R2" }),
    node("m1", "MERGE", { splitId: "p1" }),
    node("end", "END"),
  ];
}
function parEdges(): FlowEdge[] {
  return [
    edge("e1", "start", "p1"),
    edge("e2", "p1", "r1", { order: 1 }),
    edge("e3", "p1", "r2", { order: 2 }),
    edge("e4", "r1", "m1"),
    edge("e5", "r2", "m1"),
    edge("e6", "m1", "end"),
  ];
}
const withEdge = (edges: FlowEdge[], id: string, over: Partial<FlowEdge>) => edges.map((e) => (e.id === id ? { ...e, ...over } : e));
const withNode = (nodes: FlowNode[], id: string, over: Partial<FlowNode>) => nodes.map((n) => (n.id === id ? { ...n, ...over } : n));

describe("parseFlow — 정상 흐름과 블록 트리", () => {
  it("IF 흐름은 갈래 두 개짜리 Split 하나이고 그 외 갈래가 마지막이다", () => {
    const p = parseFlow(flow(ifNodes(), ifEdges()));
    expect(p.issues).toEqual([]);
    expect(p.tree!.root).toEqual({
      type: "SEQ",
      items: [
        {
          type: "SPLIT",
          nodeId: "if1",
          kind: "IF",
          mergeId: "m1",
          joinId: "m1",
          branches: [
            { edgeId: "e2", cond: "A = 1", otherwise: false, label: null, body: { type: "SEQ", items: [{ type: "RULE", nodeId: "r1", ruleId: "R1" }] }, ends: false },
            { edgeId: "e3", cond: null, otherwise: true, label: null, body: { type: "SEQ", items: [{ type: "RULE", nodeId: "r2", ruleId: "R2" }] }, ends: false },
          ],
        },
      ],
    });
    expect(p.tree!.ruleIds()).toEqual(["R1", "R2"]);
    expect(p.tree!.branched()).toBe(true);
  });

  it("IF 갈래는 order 오름차순 뒤 그 외 순서다(선 배열 순서와 무관)", () => {
    const nodes = [...ifNodes(), node("r3", "RULE", { ruleId: "R3" })];
    const edges = [
      edge("e1", "start", "if1"),
      edge("e3", "if1", "r2", { otherwise: true }),
      edge("e2", "if1", "r1", { order: 2, cond: "A = 2" }),
      edge("e7", "if1", "r3", { order: 1, cond: "A = 1" }),
      edge("e4", "r1", "m1"),
      edge("e5", "r2", "m1"),
      edge("e8", "r3", "m1"),
      edge("e6", "m1", "end"),
    ];
    const p = parseFlow(flow(nodes, edges));
    expect(p.issues).toEqual([]);
    const split = p.tree!.root.items[0];
    expect(split.type === "SPLIT" && split.branches.map((b) => b.edgeId)).toEqual(["e7", "e2", "e3"]);
    expect(p.tree!.ruleIds()).toEqual(["R3", "R1", "R2"]);
  });

  it("빈 갈래(분기에서 합류로 바로)는 빈 Seq 이고 정상이다 — 그 외 빈 갈래 포함", () => {
    const nodes = ifNodes().filter((n) => n.id !== "r2");
    const edges = [edge("e1", "start", "if1"), edge("e2", "if1", "r1", { order: 1, cond: "A = 1" }), edge("e3", "if1", "m1", { otherwise: true }), edge("e4", "r1", "m1"), edge("e6", "m1", "end")];
    const p = parseFlow(flow(nodes, edges));
    expect(p.issues).toEqual([]);
    const split = p.tree!.root.items[0];
    expect(split.type === "SPLIT" && split.branches[1].body).toEqual({ type: "SEQ", items: [] });
  });

  it("같은 룰이 두 갈래에 있으면 ruleIds 는 중복 없이 한 번, ruleSteps 는 노드마다", () => {
    const nodes = withNode(ifNodes(), "r2", { ruleId: "R1" });
    const p = parseFlow(flow(nodes, ifEdges()));
    expect(p.tree!.ruleIds()).toEqual(["R1"]);
    expect(p.tree!.ruleSteps().map((s) => s.nodeId)).toEqual(["r1", "r2"]);
  });

  it("분기가 없으면 branched=false", () => {
    expect(parseFlow(linearFlow(["A", "B"])).tree!.branched()).toBe(false);
  });
});

describe("parseFlow — 1단계 구조 오류(C3, 모두 모은다)", () => {
  it("a 노드 ID 가 겹친다 — 뒤 노드만 보고하고 첫 노드로 계속 본다", () => {
    const p = parseFlow(flow([...ifNodes(), node("r1", "RULE", { ruleId: "R9" })], ifEdges()));
    expect(p.tree).toBeNull();
    expect(p.issues).toEqual([S("r1", "노드 ID r1가 겹친다")]);
  });

  it("b1 시작 노드가 없으면 개수 오류 다음에 차수 오류", () => {
    const p = parseFlow(flow(ifNodes().filter((n) => n.id !== "start"), ifEdges().filter((e) => e.id !== "e1")));
    expect(p.issues).toEqual([S(null, "시작 노드가 0개다. 정확히 1개여야 한다"), S("if1", "if1의 들어오는 선이 0개다. 1개 이상이어야 한다")]);
  });

  it("b2 끝 노드가 둘이다", () => {
    const p = parseFlow(flow([...ifNodes(), node("end2", "END")], ifEdges()));
    expect(p.issues).toEqual([S(null, "끝 노드가 2개다. 정확히 1개여야 한다"), S("end2", "end2의 들어오는 선이 0개다. 1개 이상이어야 한다")]);
  });

  it("c 없는 노드를 가리키는 선은 차수 계산에서 빠진다", () => {
    const p = parseFlow(flow(ifNodes(), withEdge(ifEdges(), "e6", { to: "nowhere" })));
    expect(p.issues).toEqual([
      S("nowhere", "선 e6가 없는 노드 nowhere를 가리킨다", "e6"),
      S("m1", "m1의 나가는 선이 0개다. 1개여야 한다"),
      S("end", "end의 들어오는 선이 0개다. 1개 이상이어야 한다"),
    ]);
  });

  it("d1·d2 차수 — 노드 배열 순서로 나간다·들어온다(룰의 들어오는 선은 1개 이상이면 된다)", () => {
    const p = parseFlow(flow(ifNodes(), [...ifEdges(), edge("e7", "r1", "r2")]));
    expect(p.issues).toEqual([S("r1", "r1의 나가는 선이 2개다. 1개여야 한다")]);
  });

  it("d 분기의 나가는 선이 하나면 2개 이상이어야 한다", () => {
    const nodes = ifNodes().filter((n) => n.id !== "r2");
    const edges = [edge("e1", "start", "if1"), edge("e3", "if1", "r1", { otherwise: true }), edge("e4", "r1", "m1"), edge("e6", "m1", "end")];
    const p = parseFlow(flow(nodes, edges));
    expect(p.issues).toEqual([S("if1", "if1의 나가는 선이 1개다. 2개 이상이어야 한다"), S("m1", "m1의 들어오는 선이 1개다. 2개 이상이어야 한다")]);
  });

  it("e 룰 노드에 룰 ID 가 없다", () => {
    const p = parseFlow(flow(withNode(ifNodes(), "r1", { ruleId: " " }), ifEdges()));
    expect(p.issues).toEqual([S("r1", "룰 노드 r1에 룰 ID가 없다")]);
  });

  it("f1 합류의 짝 분기가 없으면 보고하고, IF 는 합류 0개가 맞다", () => {
    expect(parseFlow(flow(withNode(ifNodes(), "m1", { splitId: "zz" }), ifEdges())).issues).toEqual([S("m1", "합류 m1의 짝 분기 zz가 없다")]);
    expect(parseFlow(flow(withNode(ifNodes(), "m1", { splitId: null }), ifEdges())).issues).toEqual([S("m1", "합류 m1의 짝 분기 -가 없다")]);
  });

  it("g1·g2·g4 그 외 갈래가 없으면 IF_ELSE 둘 다음 순서 없음", () => {
    const p = parseFlow(flow(ifNodes(), withEdge(ifEdges(), "e3", { otherwise: false })));
    expect(p.issues).toEqual([
      E("if1", 'IF if1에 "그 외" 갈래가 0개다. 정확히 1개여야 한다'),
      E("if1", "IF if1의 갈래 e3에 조건식이 없다", "e3"),
      S("if1", "분기 if1의 갈래 e3에 순서가 없다", "e3"),
    ]);
  });

  it("g2 조건식이 공백이다", () => {
    expect(parseFlow(flow(ifNodes(), withEdge(ifEdges(), "e2", { cond: "  " }))).issues).toEqual([E("if1", "IF if1의 갈래 e2에 조건식이 없다", "e2")]);
  });

  it("g3 병렬 갈래에는 조건·그 외를 둘 수 없다", () => {
    expect(parseFlow(flow(parNodes(), withEdge(parEdges(), "e3", { cond: "A = 1" }))).issues).toEqual([
      S("p1", "병렬 분기 p1의 갈래 e3에는 조건을 둘 수 없다", "e3"),
    ]);
  });

  it("g4 병렬 갈래 순서가 없다", () => {
    expect(parseFlow(flow(parNodes(), withEdge(parEdges(), "e3", { order: null }))).issues).toEqual([S("p1", "분기 p1의 갈래 e3에 순서가 없다", "e3")]);
  });

  it("g5 갈래 순서가 겹친다 — 두 번째 선부터", () => {
    expect(parseFlow(flow(parNodes(), withEdge(parEdges(), "e3", { order: 1 }))).issues).toEqual([S("p1", "분기 p1의 갈래 순서 1가 겹친다", "e3")]);
  });
});

describe("parseFlow — 2단계 구조 오류(첫 오류에서 멈춤)", () => {
  it("갈래가 짝 합류가 아닌 다른 합류로 나간다", () => {
    // if1 의 e2 갈래 안에 if2 가 있고, if2 의 첫 갈래(r1)가 m2 가 아닌 m1 로 간다. 차수는 모두 맞다.
    const nodes = [
      node("start", "START"),
      node("if1", "IF"),
      node("if2", "IF"),
      node("r1", "RULE", { ruleId: "R1" }),
      node("r2", "RULE", { ruleId: "R2" }),
      node("r3", "RULE", { ruleId: "R3" }),
      node("m2", "MERGE", { splitId: "if2" }),
      node("m1", "MERGE", { splitId: "if1" }),
      node("end", "END"),
    ];
    const edges = [
      edge("e1", "start", "if1"),
      edge("e2", "if1", "if2", { order: 1, cond: "A = 1" }),
      edge("e3", "if1", "r3", { otherwise: true }),
      edge("e5", "if2", "r1", { order: 1, cond: "B = 1" }),
      edge("e6", "if2", "r2", { otherwise: true }),
      edge("e7", "r1", "m1"),
      edge("e8", "r2", "m2"),
      edge("e9", "r3", "m2"),
      edge("e10", "m2", "m1"),
      edge("e11", "m1", "end"),
    ];
    const p = parseFlow(flow(nodes, edges));
    expect(p.tree).toBeNull();
    expect(p.issues).toEqual([S("m1", "갈래가 m2에서 닫히지 않고 m1로 나간다")]);
  });

  it("시작에서 닿지 않는 노드(섬 순환)는 도달할 수 없다", () => {
    const nodes = [node("start", "START"), node("r1", "RULE", { ruleId: "R1" }), node("end", "END"), node("r2", "RULE", { ruleId: "R2" }), node("r3", "RULE", { ruleId: "R3" })];
    const edges = [edge("e1", "start", "r1"), edge("e2", "r1", "end"), edge("e3", "r2", "r3"), edge("e4", "r3", "r2")];
    expect(parseFlow(flow(nodes, edges)).issues).toEqual([S("r2", "r2에 도달할 수 없다")]);
  });
});

describe("FlowTree.relation — 같은 경로·IF 형제·병렬 형제", () => {
  // start → r0 → if1 { e2(1): p1 { ea(1): ra, eb(2): rb } mp ; e3(그 외): rc } m1 → rz → end
  const nodes = [
    node("start", "START"),
    node("r0", "RULE", { ruleId: "R0" }),
    node("if1", "IF"),
    node("p1", "PARALLEL"),
    node("ra", "RULE", { ruleId: "RA" }),
    node("rb", "RULE", { ruleId: "RB" }),
    node("mp", "MERGE", { splitId: "p1" }),
    node("rc", "RULE", { ruleId: "RC" }),
    node("m1", "MERGE", { splitId: "if1" }),
    node("rz", "RULE", { ruleId: "RZ" }),
    node("end", "END"),
  ];
  const edges = [
    edge("e1", "start", "r0"),
    edge("e1b", "r0", "if1"),
    edge("e2", "if1", "p1", { order: 1, cond: "X = 1" }),
    edge("e3", "if1", "rc", { otherwise: true }),
    edge("ea", "p1", "ra", { order: 1 }),
    edge("eb", "p1", "rb", { order: 2 }),
    edge("ea2", "ra", "mp"),
    edge("eb2", "rb", "mp"),
    edge("emp", "mp", "m1"),
    edge("ec", "rc", "m1"),
    edge("em1", "m1", "rz"),
    edge("ez", "rz", "end"),
  ];
  const tree = parseFlow(flow(nodes, edges)).tree!;

  it("깊이 우선 순서는 R0, RA, RB, RC, RZ 다", () => {
    expect(tree.ruleSteps().map((s) => s.ruleId)).toEqual(["R0", "RA", "RB", "RC", "RZ"]);
  });

  it.each([
    ["ra", "ra", "SAME"],
    ["r0", "ra", "BEFORE"],
    ["rz", "r0", "AFTER"],
    ["ra", "rb", "PARALLEL"],
    ["rb", "ra", "PARALLEL"],
    ["ra", "rc", "EXCLUSIVE"],
    ["rc", "rz", "BEFORE"],
    ["p1", "ra", "BEFORE"],
    ["if1", "rz", "BEFORE"],
    ["p1", "rc", "EXCLUSIVE"],
  ] as const)("relation(%s, %s) = %s", (a, b, want) => {
    expect(tree.relation(a, b)).toBe(want);
  });

  it("흐름에 없는 노드면 예외", () => {
    expect(() => tree.relation("ra", "nope")).toThrow("흐름 트리에 없는 노드: nope");
  });
});

describe("linearFlow·flowRuleIds", () => {
  it("한 줄 흐름의 노드·선 ID 는 start, r1..rN, end / e1..e(N+1) 이다", () => {
    expect(linearFlow(["A", "B"])).toEqual({
      version: 1,
      nodes: [node("start", "START"), node("r1", "RULE", { ruleId: "A" }), node("r2", "RULE", { ruleId: "B" }), node("end", "END")],
      edges: [edge("e1", "start", "r1"), edge("e2", "r1", "r2"), edge("e3", "r2", "end")],
    });
    expect(linearFlow([])).toEqual({ version: 1, nodes: [node("start", "START"), node("end", "END")], edges: [edge("e1", "start", "end")] });
  });

  it("구조 오류가 있으면 RULE 노드의 룰 ID 를 노드 배열 순서로 중복 없이", () => {
    const nodes = [...withNode(ifNodes(), "r2", { ruleId: "R1" }), node("rx", "RULE", { ruleId: "RX" })];
    expect(flowRuleIds(flow(nodes, ifEdges()))).toEqual(["R1", "RX"]);
  });

  it("노드 200개로 만들 수 있는 가장 깊은 중첩 IF(99단)도 오류 없이 트리를 만든다", () => {
    const depth = 99;
    const nodes: FlowNode[] = [node("start", "START")];
    const edges: FlowEdge[] = [edge("e0", "start", "if1")];
    for (let i = 1; i <= depth; i++) {
      nodes.push(node(`if${i}`, "IF"), node(`m${i}`, "MERGE", { splitId: `if${i}` }));
    }
    nodes.push(node("end", "END"));
    for (let i = 1; i <= depth; i++) {
      edges.push(
        edge(`a${i}`, `if${i}`, i < depth ? `if${i + 1}` : `m${i}`, { order: 1, cond: `X = ${i}` }),
        edge(`b${i}`, `if${i}`, `m${i}`, { otherwise: true }),
        edge(`c${i}`, `m${i}`, i > 1 ? `m${i - 1}` : "end"),
      );
    }
    expect(nodes).toHaveLength(200);
    const parsed = parseFlow(flow(nodes, edges));
    expect(parsed.issues).toEqual([]);
    expect(parsed.tree).not.toBeNull();
  });
});

describe("빈 단계(TASK) — 4단계 spec §1.1", () => {
  /** start → t1(TASK) → r1(R1) → end */
  const taskFlow = (): RuleSetFlow =>
    flow(
      [node("start", "START"), node("t1", "TASK", { label: "빈 단계" }), node("r1", "RULE", { ruleId: "R1" }), node("end", "END")],
      [edge("e1", "start", "t1"), edge("e2", "t1", "r1"), edge("e3", "r1", "end")],
    );

  it("TASK 는 블록 트리의 TASK 칸이 되고 룰 목록에는 들지 않는다", () => {
    const p = parseFlow(taskFlow());
    expect(p.issues).toEqual([]);
    expect(p.tree!.root.items).toEqual([
      { type: "TASK", nodeId: "t1" },
      { type: "RULE", nodeId: "r1", ruleId: "R1" },
    ]);
    expect(p.tree!.ruleIds()).toEqual(["R1"]);
    expect(flowRuleIds(taskFlow())).toEqual(["R1"]);
    expect(p.tree!.relation("t1", "r1")).toBe("BEFORE");
  });

  it("IF 갈래 안의 TASK 는 그 갈래 본문이고 다른 갈래와 EXCLUSIVE 다", () => {
    const f = flow(
      [node("start", "START"), node("if1", "IF"), node("t1", "TASK"), node("r2", "RULE", { ruleId: "R2" }), node("m1", "MERGE", { splitId: "if1" }), node("end", "END")],
      [
        edge("e1", "start", "if1"),
        edge("e2", "if1", "t1", { order: 1, cond: "A = 1" }),
        edge("e3", "if1", "r2", { otherwise: true }),
        edge("e4", "t1", "m1"),
        edge("e5", "r2", "m1"),
        edge("e6", "m1", "end"),
      ],
    );
    const p = parseFlow(f);
    expect(p.issues).toEqual([]);
    const split = p.tree!.root.items[0];
    expect(split.type).toBe("SPLIT");
    if (split.type !== "SPLIT") return;
    expect(split.branches[0].body.items).toEqual([{ type: "TASK", nodeId: "t1" }]);
    expect(p.tree!.relation("t1", "r2")).toBe("EXCLUSIVE");
  });

  it("TASK 는 나가는 선이 하나여야 한다", () => {
    const f = flow(
      [node("start", "START"), node("t1", "TASK"), node("r1", "RULE", { ruleId: "R1" }), node("r2", "RULE", { ruleId: "R2" }), node("end", "END")],
      [edge("e1", "start", "t1"), edge("e2", "t1", "r1"), edge("e3", "t1", "r2"), edge("e4", "r1", "end"), edge("e5", "r2", "end")],
    );
    expect(parseFlow(f).issues).toContainEqual(S("t1", "t1의 나가는 선이 2개다. 1개여야 한다"));
  });
});

describe("받는 노드(CATCH) — 받는 노드 spec §3", () => {
  const cnode = (id: string, attachTo: string, ...catches: string[]) => node(id, "CATCH", { attachTo, catches });
  const C = (nodeId: string, message: string) => ({ code: "FLOW_CATCH", nodeId, edgeId: null, message });
  /** start → r1(R_A) → mr → r2(R_B) → end. c1(NO_RESULT) → r9(R_C) → mr, c2(INPUT_ERROR·EVAL_ERROR) → end. */
  const guardedFlow = (): RuleSetFlow =>
    flow(
      [node("start", "START"), node("r1", "RULE", { ruleId: "R_A" }), cnode("c1", "r1", "NO_RESULT"), node("r9", "RULE", { ruleId: "R_C" }),
        cnode("c2", "r1", "INPUT_ERROR", "EVAL_ERROR"), node("mr", "MERGE", { splitId: "r1" }), node("r2", "RULE", { ruleId: "R_B" }), node("end", "END")],
      [edge("e1", "start", "r1"), edge("e2", "r1", "mr"), edge("e3", "c1", "r9"), edge("e4", "r9", "mr"), edge("e5", "c2", "end"),
        edge("e6", "mr", "r2"), edge("e7", "r2", "end")],
    );

  it("받는 룰은 GUARDED 블록이고 처리 갈래는 돌아옴과 끝냄을 안다", () => {
    const p = parseFlow(guardedFlow());
    expect(p.issues).toEqual([]);
    expect(p.tree!.root.items).toEqual([
      {
        type: "GUARDED",
        step: { type: "RULE", nodeId: "r1", ruleId: "R_A" },
        normal: { type: "SEQ", items: [] },
        handlers: [
          { catchNodeId: "c1", kinds: ["NO_RESULT"], body: { type: "SEQ", items: [{ type: "RULE", nodeId: "r9", ruleId: "R_C" }] }, ends: false },
          { catchNodeId: "c2", kinds: ["INPUT_ERROR", "EVAL_ERROR"], body: { type: "SEQ", items: [] }, ends: true },
        ],
        mergeId: "mr",
        joinId: "mr",
      },
      { type: "RULE", nodeId: "r2", ruleId: "R_B" },
    ]);
    expect(p.tree!.ruleIds()).toEqual(["R_A", "R_C", "R_B"]);
    expect(p.tree!.relation("r1", "r9")).toBe("BEFORE");
    expect(p.tree!.relation("r9", "r2")).toBe("BEFORE");
    expect(p.tree!.branched()).toBe(false);
    expect(catchesOf(guardedFlow(), "r1").map((n) => n.id)).toEqual(["c1", "c2"]);
  });

  it("정상 갈래와 처리 갈래는 EXCLUSIVE, 처리 갈래 안 룰의 받는 노드는 안쪽 GUARDED 다", () => {
    const f = flow(
      [node("start", "START"), node("r1", "RULE", { ruleId: "R_A" }), node("n1", "RULE", { ruleId: "R_B" }), cnode("c1", "r1", "NO_RESULT"),
        node("h1", "RULE", { ruleId: "R_C" }), cnode("c9", "h1", "EVAL_ERROR"), node("mr", "MERGE", { splitId: "r1" }), node("end", "END")],
      [edge("e1", "start", "r1"), edge("e2", "r1", "n1"), edge("e3", "n1", "mr"), edge("e4", "c1", "h1"), edge("e5", "h1", "mr"),
        edge("e6", "c9", "end"), edge("e7", "mr", "end")],
    );
    const p = parseFlow(f);
    expect(p.issues).toEqual([]);
    expect(p.tree!.relation("n1", "h1")).toBe("EXCLUSIVE");
    expect(p.tree!.ruleIds()).toEqual(["R_A", "R_B", "R_C"]);
    const g = p.tree!.root.items[0];
    if (g.type !== "GUARDED") throw new Error("GUARDED 가 아니다");
    const inner = g.handlers[0].body.items[0];
    expect(inner.type).toBe("GUARDED");
  });

  it("받는 노드 오류는 FLOW_CATCH 로 모두 모은다(Java 와 같은 순서·문구)", () => {
    const f = flow(
      [node("start", "START"), node("r1", "RULE", { ruleId: "R_A" }), node("t1", "TASK"), cnode("c0", "zz", "NO_RESULT"), cnode("c1", "t1", "NO_RESULT"),
        cnode("c2", "r1"), cnode("c3", "r1", "NO_RESULT", "BOOM", "NO_RESULT"), cnode("c4", "r1", "NO_RESULT"), node("end", "END")],
      [edge("e1", "start", "r1"), edge("e2", "r1", "t1"), edge("e3", "t1", "end"), edge("e4", "c0", "end"), edge("e5", "c1", "end"),
        edge("e6", "c2", "end"), edge("e7", "c3", "end"), edge("e8", "c4", "end")],
    );
    expect(parseFlow(f).issues).toEqual([
      C("c0", "받는 노드 c0가 붙은 노드 zz가 없다"),
      C("c2", "받는 노드 c2에 받을 예외 종류가 없다"),
      C("c3", "받는 노드 c3의 예외 종류 BOOM를 모른다"),
      C("c3", "받는 노드 c3에 예외 종류 NO_RESULT가 겹친다"),
      C("c4", "룰 노드 r1에서 예외 종류 NO_RESULT를 c3와 c4가 함께 받는다"),
    ]);
  });

  it("END 는 들어오는 선이 여럿이어도 되고 룰은 들어오는 선이 없으면 거부한다", () => {
    const f = flow(
      [node("start", "START"), node("r1", "RULE", { ruleId: "R_A" }), cnode("c1", "r1", "NO_RESULT"), node("end", "END")],
      [edge("e1", "start", "r1"), edge("e2", "r1", "end"), edge("e3", "c1", "end")],
    );
    expect(parseFlow(f).issues).toEqual([]);
    const orphan = flow(
      [node("start", "START"), node("r1", "RULE", { ruleId: "R_A" }), node("r2", "RULE", { ruleId: "R_B" }), node("end", "END")],
      [edge("e1", "start", "r1"), edge("e2", "r1", "end"), edge("e3", "r2", "end")],
    );
    expect(parseFlow(orphan).issues).toEqual([S("r2", "r2의 들어오는 선이 0개다. 1개 이상이어야 한다")]);
  });

  it("돌아오는 합류는 하나까지, 처리 갈래가 둘러싼 IF 의 옛 합류로 돌아오면 받고, 처리 갈래 안 옛 형식 IF 갈래가 END 로 가면 멈춘다", () => {
    const two = flow(
      [node("start", "START"), node("r1", "RULE", { ruleId: "R_A" }), cnode("c1", "r1", "NO_RESULT"), node("m1", "MERGE", { splitId: "r1" }),
        node("m2", "MERGE", { splitId: "r1" }), node("end", "END")],
      [edge("e1", "start", "r1"), edge("e2", "r1", "m1"), edge("e3", "c1", "m1"), edge("e4", "m1", "m2"), edge("e5", "c1", "m2"), edge("e6", "m2", "end")],
    );
    expect(parseFlow(two).issues).toContainEqual(S("r1", "룰 r1로 돌아오는 합류가 2개다. 1개까지 둔다"));
    const jump = flow(
      [node("start", "START"), node("if9", "IF"), node("r1", "RULE", { ruleId: "R_A" }), cnode("c1", "r1", "NO_RESULT"),
        node("m9", "MERGE", { splitId: "if9" }), node("end", "END")],
      [edge("e0", "start", "if9"), edge("b1", "if9", "r1", { order: 1, cond: "X > 0" }), edge("bo", "if9", "m9", { otherwise: true }),
        edge("e1", "r1", "m9"), edge("e2", "c1", "m9"), edge("e3", "m9", "end")],
    );
    const pj = parseFlow(jump);
    expect(pj.issues).toEqual([]);
    const sj = pj.tree!.root.items[0];
    if (sj.type !== "SPLIT") throw new Error("SPLIT 아님");
    const gj = sj.branches[0].body.items[0];
    expect(gj.type === "GUARDED" && { joinId: gj.joinId, mergeId: gj.mergeId, normal: gj.normal.items }).toEqual({ joinId: "m9", mergeId: null, normal: [] });
    const nested = flow(
      [node("start", "START"), node("r1", "RULE", { ruleId: "R_A" }), cnode("c1", "r1", "NO_RESULT"), node("if1", "IF"),
        node("m2", "MERGE", { splitId: "if1" }), node("mr", "MERGE", { splitId: "r1" }), node("end", "END")],
      [edge("e1", "start", "r1"), edge("e2", "r1", "mr"), edge("e3", "c1", "if1"), edge("b1", "if1", "end", { order: 1, cond: "X > 0" }),
        edge("b2", "if1", "m2", { order: 2, cond: "X > 1" }), edge("bo", "if1", "m2", { otherwise: true }), edge("e4", "m2", "mr"), edge("e5", "mr", "end")],
    );
    expect(parseFlow(nested).issues).toEqual([S("end", "갈래가 m2에서 닫히지 않고 end로 나간다")]);
  });
});

describe("모이는 자리·돌아오는 자리(implicit-join spec §2) — Java FlowParserTest 짝", () => {
  const R = (id: string, ruleId: string) => node(id, "RULE", { ruleId });
  const br = (id: string, from: string, to: string, order: number, cond: string) => edge(id, from, to, { order, cond });
  const other = (id: string, from: string, to: string) => edge(id, from, to, { otherwise: true });
  const pe = (id: string, from: string, to: string, order: number) => edge(id, from, to, { order });
  const catchN = (id: string, attachTo: string, ...catches: string[]) => node(id, "CATCH", { attachTo, catches });
  const firstSplit = (f: RuleSetFlow) => {
    const p = parseFlow(f);
    expect(p.issues).toEqual([]);
    const s = p.tree!.root.items[0];
    if (s.type !== "SPLIT") throw new Error("SPLIT 아님");
    return s;
  };
  const msgs = (f: RuleSetFlow) => parseFlow(f).issues.map((i) => `${i.code}|${i.nodeId}|${i.edgeId}|${i.message}`);

  it("새 형식 IF 는 합류 없이 모이고 끝내는 갈래는 END 로 간다(§1 둘째 예)", () => {
    const s = firstSplit(
      flow(
        [node("start", "START"), node("if1", "IF"), R("r8", "L"), R("r2", "M"), node("end", "END")],
        [edge("e0", "start", "if1"), br("e3", "if1", "r8", 1, "PRICE = NULL"), edge("e4", "r8", "end"), other("e5", "if1", "r2"), edge("e6", "r2", "end")],
      ),
    );
    expect(s.mergeId).toBeNull();
    expect(s.joinId).toBe("r2");
    expect(s.branches.map((b) => b.ends)).toEqual([true, false]);
  });

  it("그 외가 END 로 바로 가면 조건 갈래가 이어진다(N20)", () => {
    const s = firstSplit(
      flow([node("start", "START"), node("if1", "IF"), R("a", "A"), node("end", "END")], [edge("e0", "start", "if1"), br("b1", "if1", "a", 1, "X > 0"), other("bo", "if1", "end"), edge("ea", "a", "end")]),
    );
    expect(s.joinId).toBe("a");
    expect(s.branches.map((b) => b.ends)).toEqual([false, true]);
  });

  it("다른 갈래와 노드를 함께 지나면 이어지는 갈래다(N24)", () => {
    const s = firstSplit(
      flow(
        [node("start", "START"), node("if1", "IF"), R("a", "A"), R("b", "B"), R("c", "C"), R("s", "S"), node("end", "END")],
        [edge("e0", "start", "if1"), br("b1", "if1", "a", 1, "X > 0"), br("b2", "if1", "b", 2, "X > 1"), other("bo", "if1", "c"), edge("ea", "a", "s"), edge("eb", "b", "s"), edge("ec", "c", "end"), edge("es", "s", "end")],
      ),
    );
    expect(s.joinId).toBe("s");
    expect(s.branches.map((b) => b.ends)).toEqual([false, false, true]);
  });

  it("f4·S6·S7·S8·S9 셋째·S5 문구가 Java 와 같다", () => {
    expect(msgs(flow([node("start", "START"), node("if1", "IF"), R("a", "A"), node("end", "END")], [edge("e1", "start", "if1"), br("e2", "if1", "a", 1, "X > 0"), other("e3", "if1", "a"), edge("e4", "a", "end")]))).toEqual([
      "FLOW_STRUCTURE|if1|e3|IF if1의 갈래 e3가 갈래 e2와 같은 노드 a로 간다. 같은 노드로 가는 갈래는 하나만 둔다",
    ]);
    expect(
      msgs(flow([node("start", "START"), R("r1", "A"), node("if1", "IF"), R("a", "B"), node("end", "END")], [edge("e1", "start", "r1"), edge("e2", "r1", "if1"), br("b1", "if1", "a", 1, "X > 0"), other("bo", "if1", "end"), edge("ea", "a", "r1")])),
    ).toEqual(["FLOW_STRUCTURE|if1|null|if1를 두 번 지난다. 순환이 있거나 갈래가 모이는 자리 밖에서 만난다"]);
    expect(
      msgs(
        flow(
          [node("start", "START"), R("r1", "A"), R("x", "B"), R("y", "C"), catchN("c1", "r1", "NO_RESULT"), R("h1", "D"), catchN("c2", "r1", "EVAL_ERROR"), node("end", "END")],
          [edge("e1", "start", "r1"), edge("e2", "r1", "x"), edge("e3", "x", "y"), edge("e4", "y", "end"), edge("e5", "c1", "h1"), edge("e6", "h1", "x"), edge("e7", "c2", "y")],
        ),
      ),
    ).toEqual(["FLOW_STRUCTURE|c2|null|r1의 처리 갈래 c2가 y로 돌아온다. 앞 처리 갈래 c1처럼 x로 돌아와야 한다"]);
    expect(
      msgs(
        flow(
          [node("start", "START"), R("r1", "A"), R("n1", "B"), R("n2", "C"), catchN("c1", "r1", "NO_RESULT"), node("if1", "IF"), R("h1", "D"), R("h2", "E"), node("end", "END")],
          [edge("e1", "start", "r1"), edge("e2", "r1", "n1"), edge("e3", "n1", "n2"), edge("e4", "n2", "end"), edge("e5", "c1", "if1"), br("b1", "if1", "h1", 1, "X > 0"), other("bo", "if1", "h2"), edge("e6", "h1", "n1"), edge("e7", "h2", "n2")],
        ),
      ),
    ).toEqual(["FLOW_STRUCTURE|n1|null|처리 갈래 c1가 r1의 정상 갈래 노드 n1로 들어간다. 처리 갈래는 한 노드로 돌아오거나 끝 노드로 가야 한다"]);
    expect(
      msgs(
        flow(
          [node("start", "START"), node("if1", "IF"), R("r1", "A"), catchN("c1", "r1", "NO_RESULT"), R("h", "B"), node("p3", "PARALLEL"), R("a", "C"), node("pm3", "MERGE", { splitId: "p3" }), R("j", "D"), node("end", "END")],
          [edge("e1", "start", "if1"), br("b1", "if1", "r1", 1, "X > 0"), other("bo", "if1", "p3"), edge("e2", "r1", "j"), edge("ec", "c1", "h"), edge("eh", "h", "pm3"), pe("pa", "p3", "a", 1), pe("pb", "p3", "pm3", 2), edge("ea", "a", "pm3"), edge("ep", "pm3", "j"), edge("ej", "j", "end")],
        ),
      ),
    ).toEqual(["FLOW_STRUCTURE|pm3|null|처리 갈래 c1가 돌아올 자리 j나 끝에 닿지 않고 pm3로 나간다"]);
    expect(
      msgs(
        flow(
          [node("start", "START"), R("r1", "A"), node("p1", "PARALLEL"), R("a", "B"), R("b", "C"), node("pm", "MERGE", { splitId: "p1" }), R("x", "D"), catchN("c1", "r1", "NO_RESULT"), R("h", "E"), node("end", "END")],
          [edge("e1", "start", "r1"), edge("e2", "r1", "p1"), pe("pa", "p1", "a", 1), pe("pb", "p1", "b", 2), edge("ea", "a", "pm"), edge("eb", "b", "pm"), edge("ep", "pm", "x"), edge("ex", "x", "end"), edge("ec", "c1", "h"), edge("eh", "h", "pm")],
        ),
      ),
    ).toEqual(["FLOW_STRUCTURE|end|null|갈래가 pm에서 닫히지 않고 end로 나간다"]);
  });

  it("빈 단계에 붙은 받는 노드는 TASK step 의 GUARDED 다", () => {
    const p = parseFlow(
      flow(
        [node("start", "START"), node("t1", "TASK", { label: "빈 단계" }), catchN("c1", "t1", "NO_RESULT"), R("h", "H"), catchN("c2", "t1", "EVAL_ERROR"), R("n", "F"), node("end", "END")],
        [edge("e1", "start", "t1"), edge("e2", "t1", "n"), edge("e3", "c1", "h"), edge("e4", "h", "n"), edge("e5", "c2", "end"), edge("e6", "n", "end")],
      ),
    );
    expect(p.issues).toEqual([]);
    const g = p.tree!.root.items[0];
    expect(g.type === "GUARDED" && { step: g.step, joinId: g.joinId, ends: g.handlers.map((h) => h.ends) }).toEqual({ step: { type: "TASK", nodeId: "t1" }, joinId: "n", ends: [false, true] });
    expect(p.tree!.ruleIds()).toEqual(["H", "F"]);
  });

  it("관대한 도우미 — joinOf·endingBranches·handlerTarget·returnOf, 깨진 흐름은 null", () => {
    const f = flow(
      [node("start", "START"), R("r1", "G"), catchN("c1", "r1", "NO_RESULT"), node("if1", "IF"), R("e", "E"), R("h", "H"), catchN("c2", "r1", "EVAL_ERROR"), R("n", "F"), node("end", "END")],
      [edge("e1", "start", "r1"), edge("e2", "r1", "n"), edge("e3", "c1", "if1"), br("b1", "if1", "e", 1, "X > 0"), other("bo", "if1", "h"), edge("ee", "e", "end"), edge("eh", "h", "n"), edge("e5", "c2", "end"), edge("en", "n", "end")],
    );
    expect(joinOf(f, "if1")).toBe("h");
    expect(endingBranches(f, "if1")).toEqual(["b1"]);
    expect(handlerTarget(f, "c1")).toBe("n");
    expect(handlerTarget(f, "c2")).toBe("end");
    expect(returnOf(f, "r1")).toBe("n");
    expect(joinOf(flow(ifNodes(), ifEdges()), "if1")).toBe("m1");
    expect(endingBranches(flow(ifNodes(), ifEdges()), "if1")).toEqual([]);
    expect(joinOf(flow(parNodes(), parEdges()), "p1")).toBe("m1");
    expect(joinOf(f, "r1")).toBeNull();
    // 순환(a → c → a)이면 모이는 자리를 정하지 못한다.
    const loop = flow(
      [node("start", "START"), node("if1", "IF"), R("a", "A"), R("c", "C"), R("b", "B"), node("end", "END")],
      [edge("e0", "start", "if1"), br("b1", "if1", "a", 1, "X > 0"), other("bo", "if1", "b"), edge("ea", "a", "c"), edge("ec", "c", "a"), edge("eb", "b", "end")],
    );
    expect(joinOf(loop, "if1")).toBeNull();
    expect(endingBranches(loop, "if1")).toBeNull();
    // 받는 노드가 붙은 노드가 없거나 나가는 선이 없으면 null.
    expect(handlerTarget(flow([node("start", "START"), catchN("c9", "zz", "NO_RESULT"), node("end", "END")], [edge("e1", "start", "end")]), "c9")).toBeNull();
    expect(returnOf(f, "n")).toBeNull();
  });
});

// 하위 세트 계획 Task 2(TS 짝, ui:5t) — 엔진 `FlowParser`·`FlowTree` 의 SET 처리와 같은지. 문구·순서의 서버 동치 전체는 코퍼스 러너가 본다.
describe("parseFlow — SET 노드(하위 세트 호출)", () => {
  const set = (id: string, setId: string | null | undefined) => node(id, "SET", setId === undefined ? {} : { setId });
  const cat = (id: string, attachTo: string, catches: string[]) => node(id, "CATCH", { attachTo, catches });

  it("한 줄 흐름의 SET 은 SetStep 이고 setSteps·setIds·relation 이 SET 을 다룬다(ruleSteps·ruleIds 는 RULE 만)", () => {
    const f = flow(
      [node("start", "START"), node("r1", "RULE", { ruleId: "R1" }), set("s1", "SP"), set("s2", "SP"), node("end", "END")],
      [edge("e1", "start", "r1"), edge("e2", "r1", "s1"), edge("e3", "s1", "s2"), edge("e4", "s2", "end")],
    );
    const { tree, issues } = parseFlow(f);
    expect(issues).toEqual([]);
    expect(tree!.root.items).toEqual([
      { type: "RULE", nodeId: "r1", ruleId: "R1" },
      { type: "SET", nodeId: "s1", setId: "SP" },
      { type: "SET", nodeId: "s2", setId: "SP" },
    ]);
    expect(tree!.setSteps().map((s) => s.nodeId)).toEqual(["s1", "s2"]);
    expect(tree!.setIds()).toEqual(["SP"]);
    expect(tree!.ruleIds()).toEqual(["R1"]);
    expect(flowRuleIds(f)).toEqual(["R1"]);
    expect(flowSetIds(f)).toEqual(["SP"]);
    expect(tree!.relation("r1", "s1")).toBe("BEFORE");
    expect(tree!.relation("s2", "s1")).toBe("AFTER");
  });

  it("빈·빠진 setId 는 구조 오류가 아니다 — SetStep.setId 는 null·공백 그대로, setIds 는 뺀다", () => {
    const f = flow(
      [node("start", "START"), set("s1", undefined), set("s2", "  "), set("s3", "SQ"), node("end", "END")],
      [edge("e1", "start", "s1"), edge("e2", "s1", "s2"), edge("e3", "s2", "s3"), edge("e4", "s3", "end")],
    );
    const { tree, issues } = parseFlow(f);
    expect(issues).toEqual([]);
    expect(tree!.setSteps()).toEqual([
      { type: "SET", nodeId: "s1", setId: null },
      { type: "SET", nodeId: "s2", setId: "  " },
      { type: "SET", nodeId: "s3", setId: "SQ" },
    ]);
    expect(tree!.setIds()).toEqual(["SQ"]);
  });

  it("IF 두 갈래가 SET 으로 모인다 — SET 의 들어오는 선 2개는 정상(d1 은 1개 이상)", () => {
    const f = flow(
      [node("start", "START"), node("if1", "IF"), node("r1", "RULE", { ruleId: "R1" }), node("r2", "RULE", { ruleId: "R2" }), set("s1", "SP"), node("end", "END")],
      [
        edge("e1", "start", "if1"),
        edge("e2", "if1", "r1", { order: 1, cond: "A = 1" }),
        edge("e3", "if1", "r2", { otherwise: true }),
        edge("e4", "r1", "s1"),
        edge("e5", "r2", "s1"),
        edge("e6", "s1", "end"),
      ],
    );
    const { tree, issues } = parseFlow(f);
    expect(issues).toEqual([]);
    expect(tree!.relation("r1", "s1")).toBe("BEFORE");
    expect(tree!.relation("r1", "r2")).toBe("EXCLUSIVE");
  });

  it("d1 — SET 의 들어오는 선이 0개면 1개 이상이어야 한다, 나가는 선은 1개여야 한다", () => {
    const f = flow(
      [node("start", "START"), node("r1", "RULE", { ruleId: "R1" }), set("s1", "SP"), node("end", "END")],
      [edge("e1", "start", "r1"), edge("e2", "r1", "end"), edge("e3", "s1", "end"), edge("e4", "s1", "r1")],
    );
    expect(parseFlow(f).issues).toEqual([
      S("s1", "s1의 들어오는 선이 0개다. 1개 이상이어야 한다"),
      S("s1", "s1의 나가는 선이 2개다. 1개여야 한다"),
    ]);
  });

  it("받는 노드는 SET 에도 붙고(SUBSET_ENDED 는 아는 종류) Guarded.step 이 SetStep 이다", () => {
    const f = flow(
      [node("start", "START"), set("s1", "SP"), cat("c1", "s1", ["SUBSET_ENDED", "INPUT_ERROR"]), node("r1", "RULE", { ruleId: "R1" }), node("end", "END")],
      [edge("e1", "start", "s1"), edge("e2", "s1", "r1"), edge("e3", "c1", "end"), edge("e4", "r1", "end")],
    );
    const { tree, issues } = parseFlow(f);
    expect(issues).toEqual([]);
    const g = tree!.root.items[0];
    expect(g.type).toBe("GUARDED");
    if (g.type !== "GUARDED") return;
    expect(g.step).toEqual({ type: "SET", nodeId: "s1", setId: "SP" });
    expect(g.handlers).toEqual([{ catchNodeId: "c1", kinds: ["SUBSET_ENDED", "INPUT_ERROR"], body: { type: "SEQ", items: [] }, ends: true }]);
    expect(tree!.setSteps().map((s) => s.nodeId)).toEqual(["s1"]);
    expect(catchesOf(f, "s1").map((c) => c.id)).toEqual(["c1"]);
    expect(handlerTarget(f, "c1")).toBe("end");
  });

  it("h2 — 받는 노드를 붙일 수 없는 노드면 엔진 FlowParser 와 같은 문구(룰·빈 단계·룰 세트)", () => {
    const f = flow(
      [node("start", "START"), cat("c1", "start", ["INPUT_ERROR"]), node("r1", "RULE", { ruleId: "R1" }), node("end", "END")],
      [edge("e1", "start", "r1"), edge("e2", "r1", "end"), edge("e3", "c1", "end")],
    );
    expect(parseFlow(f).issues).toContainEqual({ code: "FLOW_CATCH", nodeId: "c1", edgeId: null, message: "받는 노드 c1는 룰·빈 단계·룰 세트 노드에만 붙일 수 있다(start는 START)" });
  });

  it("옛 형식 돌아오는 MERGE 의 splitId 가 SET 이면 짝 분기가 없다(implicit-join spec §13 — SET 은 옛 형식이 없다)", () => {
    const f = flow(
      [node("start", "START"), set("s1", "SP"), cat("c1", "s1", ["INPUT_ERROR"]), node("r9", "RULE", { ruleId: "R9" }), node("m1", "MERGE", { splitId: "s1" }), node("end", "END")],
      [edge("e1", "start", "s1"), edge("e2", "s1", "m1"), edge("e3", "c1", "r9"), edge("e4", "r9", "m1"), edge("e5", "m1", "end")],
    );
    expect(parseFlow(f).issues).toContainEqual(S("m1", "합류 m1의 짝 분기 s1가 없다"));
  });

  it("flowSetIds — 구조 오류면 SET 노드의 세트 ID 를 노드 배열 순서로 중복 없이(빈 ID 제외, 겹친 노드 ID 는 첫 노드)", () => {
    const f = flow([set("s1", "SB"), set("s2", ""), set("s3", "SA"), set("s1", "SC"), set("s4", "SB")], []);
    expect(parseFlow(f).tree).toBeNull();
    expect(flowSetIds(f)).toEqual(["SB", "SA"]);
  });

  it("상수 — CATCHABLE 은 RULE·TASK·SET, CATCH_NAMES 는 CATCH_SET 까지 다섯, CATCH_KINDS 끝에 SUBSET_ENDED, 고를 수 있는 종류는 노드 종류별", () => {
    expect([...CATCHABLE]).toEqual(["RULE", "TASK", "SET"]);
    expect(CATCH_NAMES).toEqual(["CATCH_KIND", "CATCH_RULE", "CATCH_CODE", "CATCH_MSG", "CATCH_SET"]);
    expect(CATCH_KINDS).toEqual(["NO_RESULT", "INPUT_ERROR", "EVAL_ERROR", "HIT_CONFLICT", "SUBSET_ENDED"]);
    expect(catchKindsFor("RULE")).toEqual(["NO_RESULT", "INPUT_ERROR", "EVAL_ERROR", "HIT_CONFLICT"]);
    expect(catchKindsFor("TASK")).toEqual(["NO_RESULT", "INPUT_ERROR", "EVAL_ERROR", "HIT_CONFLICT"]);
    expect(catchKindsFor("SET")).toEqual(["INPUT_ERROR", "EVAL_ERROR", "HIT_CONFLICT", "SUBSET_ENDED"]);
  });
});
