// 계획 C2·C3 — 흐름 구조 해석 `flow-model.ts`(엔진 FlowParser·FlowTree 의 TS 짝). 문구·순서의 서버 동치 전체는 `rule-set-corpus.test.ts` 가 본다.
import { describe, expect, it } from "vitest";

import type { FlowEdge, FlowNode, FlowNodeKind, RuleSetFlow } from "../../../src/contract/engine-contract.generated";
import { catchesOf, flowRuleIds, linearFlow, parseFlow, type FlowIssue } from "../../../pages/dme/ruleSetEdit/flow-model";

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
          branches: [
            { edgeId: "e2", cond: "A = 1", otherwise: false, label: null, body: { type: "SEQ", items: [{ type: "RULE", nodeId: "r1", ruleId: "R1" }] } },
            { edgeId: "e3", cond: null, otherwise: true, label: null, body: { type: "SEQ", items: [{ type: "RULE", nodeId: "r2", ruleId: "R2" }] } },
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
    expect(p.issues).toEqual([S(null, "시작 노드가 0개다. 정확히 1개여야 한다"), S("if1", "if1의 들어오는 선이 0개다. 1개여야 한다")]);
  });

  it("b2 끝 노드가 둘이다", () => {
    const p = parseFlow(flow([...ifNodes(), node("end2", "END")], ifEdges()));
    expect(p.issues).toEqual([S(null, "끝 노드가 2개다. 정확히 1개여야 한다"), S("end2", "end2의 들어오는 선이 0개다. 1개여야 한다")]);
  });

  it("c 없는 노드를 가리키는 선은 차수 계산에서 빠진다", () => {
    const p = parseFlow(flow(ifNodes(), withEdge(ifEdges(), "e6", { to: "nowhere" })));
    expect(p.issues).toEqual([
      S("nowhere", "선 e6가 없는 노드 nowhere를 가리킨다", "e6"),
      S("m1", "m1의 나가는 선이 0개다. 1개여야 한다"),
      S("end", "end의 들어오는 선이 0개다. 1개여야 한다"),
    ]);
  });

  it("d1·d2 차수 — 노드 배열 순서로 나간다·들어온다", () => {
    const p = parseFlow(flow(ifNodes(), [...ifEdges(), edge("e7", "r1", "r2")]));
    expect(p.issues).toEqual([S("r1", "r1의 나가는 선이 2개다. 1개여야 한다"), S("r2", "r2의 들어오는 선이 2개다. 1개여야 한다")]);
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

  it("f1·f2 합류의 짝 분기가 없으면 그 분기를 닫는 합류도 0개다", () => {
    expect(parseFlow(flow(withNode(ifNodes(), "m1", { splitId: "zz" }), ifEdges())).issues).toEqual([
      S("m1", "합류 m1의 짝 분기 zz가 없다"),
      S("if1", "분기 if1를 닫는 합류가 0개다. 정확히 1개여야 한다"),
    ]);
    expect(parseFlow(flow(withNode(ifNodes(), "m1", { splitId: null }), ifEdges())).issues).toEqual([
      S("m1", "합류 m1의 짝 분기 -가 없다"),
      S("if1", "분기 if1를 닫는 합류가 0개다. 정확히 1개여야 한다"),
    ]);
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
        rule: { type: "RULE", nodeId: "r1", ruleId: "R_A" },
        normal: { type: "SEQ", items: [] },
        handlers: [
          { catchNodeId: "c1", kinds: ["NO_RESULT"], body: { type: "SEQ", items: [{ type: "RULE", nodeId: "r9", ruleId: "R_C" }] }, ends: false },
          { catchNodeId: "c2", kinds: ["INPUT_ERROR", "EVAL_ERROR"], body: { type: "SEQ", items: [] }, ends: true },
        ],
        mergeId: "mr",
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
      C("c0", "받는 노드 c0가 붙은 룰 zz가 없다"),
      C("c1", "받는 노드 c1는 룰 노드에만 붙일 수 있다(t1는 TASK)"),
      C("c2", "받는 노드 c2에 받을 예외 종류가 없다"),
      C("c3", "받는 노드 c3의 예외 종류 BOOM를 모른다"),
      C("c3", "받는 노드 c3에 예외 종류 NO_RESULT가 겹친다"),
      C("c4", "룰 노드 r1에서 예외 종류 NO_RESULT를 c3와 c4가 함께 받는다"),
    ]);
  });

  it("받는 노드가 있으면 END 는 들어오는 선이 여럿이어도 된다", () => {
    const f = flow(
      [node("start", "START"), node("r1", "RULE", { ruleId: "R_A" }), cnode("c1", "r1", "NO_RESULT"), node("end", "END")],
      [edge("e1", "start", "r1"), edge("e2", "r1", "end"), edge("e3", "c1", "end")],
    );
    expect(parseFlow(f).issues).toEqual([]);
  });

  it("돌아오는 합류는 하나까지, 처리 갈래가 다른 합류로 가거나 처리 갈래 안 IF 갈래가 END 로 가면 멈춘다", () => {
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
    expect(parseFlow(jump).issues).toEqual([S("m9", "처리 갈래 c1가 끝에 닿지 않고 m9로 나간다")]);
    const nested = flow(
      [node("start", "START"), node("r1", "RULE", { ruleId: "R_A" }), cnode("c1", "r1", "NO_RESULT"), node("if1", "IF"),
        node("m2", "MERGE", { splitId: "if1" }), node("mr", "MERGE", { splitId: "r1" }), node("end", "END")],
      [edge("e1", "start", "r1"), edge("e2", "r1", "mr"), edge("e3", "c1", "if1"), edge("b1", "if1", "end", { order: 1, cond: "X > 0" }),
        edge("b2", "if1", "m2", { order: 2, cond: "X > 1" }), edge("bo", "if1", "m2", { otherwise: true }), edge("e4", "m2", "mr"), edge("e5", "mr", "end")],
    );
    expect(parseFlow(nested).issues).toEqual([S("end", "갈래가 m2에서 닫히지 않고 end로 나간다")]);
  });
});
