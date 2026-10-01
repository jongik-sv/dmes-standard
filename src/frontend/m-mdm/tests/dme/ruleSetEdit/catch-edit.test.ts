// 받는 노드(CATCH) 편집 연산 — 보존·만들기·종류·지우기·블록 걷기·복사 거부·위치 미저장·선 제한(받는 노드 spec §8).
import { describe, expect, it } from "vitest";

import type { FlowNode, RuleSetFlow } from "../../../src/contract/engine-contract.generated";
import {
  CATCH_BAD_TARGET, CATCH_FULL, CATCH_KINDS_EMPTY, CATCH_NO_IN, CATCH_ONE_OUT, CATCH_TAKEN, MOVE_GUARDED, NO_COPY_CATCH, NO_COPY_CATCH_NODE,
  RETURN_MERGE_NOT_ONE, RETURN_MERGE_STUCK, addCatch, addGroup, blockMembers, connect, copyFragment, dissolveSplit, duplicateNode, flowJsonOf, insertRule, moveExcludedEdges,
  moveNode, reconnectEdge, removeNode, setCatchKinds, setPositions, toEditFlow, updateGroup, updateNodeDesc, type EditFlow, type EditResult,
} from "../../../pages/dme/ruleSetEdit/flow-edit";
import { parseFlow } from "../../../pages/dme/ruleSetEdit/flow-model";

function ok(r: EditResult): EditFlow {
  if (!r.ok) throw new Error(r.reason);
  return r.flow;
}
const reason = (r: EditResult) => (r.ok ? null : r.reason);
const ids = (f: EditFlow) => f.nodes.map((n) => n.id);
const catchOf = (f: EditFlow, id: string) => f.nodes.find((n) => n.id === id) as FlowNode;

/** start → r1(R_A) → end. */
const base = () => toEditFlow(null, ["R_A"]);

const n = (id: string, kind: FlowNode["kind"], ruleId: string | null = null): FlowNode => ({ id, kind, ruleId, splitId: null, label: null });
const c = (id: string, attachTo: string, catches: FlowNode["catches"]): FlowNode => ({ ...n(id, "CATCH"), attachTo, catches });
const e = (id: string, from: string, to: string) => ({ id, from, to, order: null, cond: null, otherwise: false, label: null });

/** 스펙 §2 예시: start → r1 → m1(splitId=r1) → r2 → end, c1 → r9 → m1, c2 → end. */
const specFlow = (): EditFlow =>
  toEditFlow(
    {
      version: 1,
      nodes: [
        n("start", "START"), n("r1", "RULE", "R_A"), c("c1", "r1", ["NO_RESULT"]), n("r9", "RULE", "R_C"), c("c2", "r1", ["INPUT_ERROR", "EVAL_ERROR"]),
        { ...n("m1", "MERGE"), splitId: "r1" }, n("r2", "RULE", "R_B"), n("end", "END"),
      ],
      edges: [e("e1", "start", "r1"), e("e2", "r1", "m1"), e("e3", "c1", "r9"), e("e4", "r9", "m1"), e("e5", "c2", "end"), e("e6", "m1", "r2"), e("e7", "r2", "end")],
    },
    [],
  );

describe("받는 노드 편집 연산(받는 노드 spec §8)", () => {
  it("addCatch 는 끝으로 가는 처리 갈래를 만들고 첫 빈 종류를 받으며 룰 바로 뒤에 놓인다", () => {
    const f = ok(addCatch(base(), "r1", null));
    expect(ids(f)).toEqual(["start", "r1", "c1", "end"]);
    expect(catchOf(f, "c1")).toEqual({ id: "c1", kind: "CATCH", ruleId: null, splitId: null, label: null, attachTo: "r1", catches: ["NO_RESULT"] });
    expect(f.edges.at(-1)).toMatchObject({ from: "c1", to: "end" });
    expect(parseFlow(f).issues).toEqual([]);
    const g = ok(addCatch(f, "r1", "end"));
    expect(ids(g)).toEqual(["start", "r1", "c1", "c2", "end"]);
    expect(catchOf(g, "c2").catches).toEqual(["INPUT_ERROR"]);
  });

  it("addCatch 는 새 받는 노드 ID 를 돌려준다", () => {
    const r = addCatch(base(), "r1", null);
    expect(r.ok && r.id).toBe("c1");
  });

  it("네 종류를 모두 받으면 더 붙이지 못하고, 룰이 아닌 노드·시작·자기 룰로는 만들지 않는다", () => {
    let f = base();
    for (let i = 0; i < 4; i++) f = ok(addCatch(f, "r1", null));
    expect(reason(addCatch(f, "r1", null))).toBe(CATCH_FULL);
    expect(reason(addCatch(base(), "end", null))).toBe("룰 노드에만 예외 받기를 붙인다");
    expect(reason(addCatch(base(), "r1", "start"))).toBe(CATCH_BAD_TARGET);
    expect(reason(addCatch(base(), "r1", "r1"))).toBe(CATCH_BAD_TARGET);
  });

  it("정규 JSON 은 CATCH 노드에만 attachTo·catches 를 label 뒤에 쓰고 다시 읽어도 같다", () => {
    const f = ok(addCatch(base(), "r1", null));
    const json = flowJsonOf(f);
    expect(json).toContain('{"id":"r1","kind":"RULE","ruleId":"R_A","splitId":null,"label":null},');
    expect(json).toContain('{"id":"c1","kind":"CATCH","ruleId":null,"splitId":null,"label":null,"attachTo":"r1","catches":["NO_RESULT"]}');
    expect(flowJsonOf(toEditFlow(JSON.parse(json), []))).toBe(json);
    expect(flowJsonOf(base())).not.toContain("attachTo");
  });

  it("정규 JSON 의 nodes·edges 글자는 서버 RuleSetFlowJson.canonical 과 같다(RuleSetFlowJsonTest 받는 노드 사례, Ruling R11)", () => {
    const raw = JSON.parse(
      '{"version":1,"nodes":[{"id":"start","kind":"START"},{"id":"r1","kind":"RULE","ruleId":"A"},' +
        '{"id":"c1","kind":"CATCH","attachTo":"r1","catches":["NO_RESULT","BOOM"],"label":"단가 없음"},{"id":"end","kind":"END"}],' +
        '"edges":[{"id":"e1","from":"start","to":"r1"},{"id":"e2","from":"r1","to":"end"},{"id":"e3","from":"c1","to":"end"}]}',
    ) as RuleSetFlow;
    const server =
      '{"version":1,"nodes":[{"id":"start","kind":"START","ruleId":null,"splitId":null,"label":null},' +
      '{"id":"r1","kind":"RULE","ruleId":"A","splitId":null,"label":null},' +
      '{"id":"c1","kind":"CATCH","ruleId":null,"splitId":null,"label":"단가 없음","attachTo":"r1","catches":["NO_RESULT","BOOM"]},' +
      '{"id":"end","kind":"END","ruleId":null,"splitId":null,"label":null}],' +
      '"edges":[{"id":"e1","from":"start","to":"r1","order":null,"cond":null,"otherwise":false,"label":null},' +
      '{"id":"e2","from":"r1","to":"end","order":null,"cond":null,"otherwise":false,"label":null},' +
      '{"id":"e3","from":"c1","to":"end","order":null,"cond":null,"otherwise":false,"label":null}],"view":';
    const json = flowJsonOf(toEditFlow(raw, []));
    expect(json.startsWith(server)).toBe(true);
    // 자동 저장 기준점: 보낸 글자를 다시 읽어 쓰면 같은 글자다(useRuleSetEdit baseJson).
    expect(flowJsonOf(toEditFlow(JSON.parse(json), []))).toBe(json);
    // attachTo 가 없고 catches 가 null 이면 서버처럼 두 칸을 null 로 쓴다(putNull).
    const bare = JSON.parse('{"version":1,"nodes":[{"id":"c1","kind":"CATCH","catches":null}],"edges":[]}') as RuleSetFlow;
    expect(flowJsonOf(toEditFlow(bare, []))).toContain('{"id":"c1","kind":"CATCH","ruleId":null,"splitId":null,"label":null,"attachTo":null,"catches":null}');
  });

  it("setCatchKinds 는 정해진 순서로 정렬하고, 비거나 같은 룰의 다른 받는 노드가 받는 종류면 거부한다", () => {
    const f = ok(addCatch(ok(addCatch(base(), "r1", null)), "r1", null)); // c1: NO_RESULT, c2: INPUT_ERROR
    expect(catchOf(ok(setCatchKinds(f, "c1", ["HIT_CONFLICT", "NO_RESULT", "NO_RESULT"])), "c1").catches).toEqual(["NO_RESULT", "HIT_CONFLICT"]);
    expect(reason(setCatchKinds(f, "c1", []))).toBe(CATCH_KINDS_EMPTY);
    expect(reason(setCatchKinds(f, "c1", ["INPUT_ERROR"]))).toBe(CATCH_TAKEN("INPUT_ERROR", "c2"));
  });

  it("룰을 지우면 붙은 받는 노드와 그 선이 함께 지워지고 처리 갈래 안 노드는 남는다", () => {
    const f = ok(addCatch(toEditFlow(null, ["R_A", "R_B"]), "r1", "r2")); // c1 → r2(뒤 룰을 처리 갈래 첫 노드로)
    const g = ok(removeNode(f, "r1"));
    expect(ids(g)).toEqual(["start", "r2", "end"]);
    expect(g.edges.some((e) => e.from === "c1")).toBe(false);
  });

  it("돌아오는 처리 갈래가 있는 룰을 지우면 돌아오는 합류를 걷어 정상 쪽을 잇고, 처리 갈래에만 있던 노드는 끊긴 채 남아 검사가 알린다", () => {
    const f = specFlow();
    expect(parseFlow(f).issues).toEqual([]);
    const g = ok(removeNode(f, "r1"));
    expect(ids(g)).toEqual(["start", "r9", "r2", "end"]);
    expect(g.edges.map((e) => [e.id, e.from, e.to])).toEqual([
      ["e1", "start", "r2"],
      ["e7", "r2", "end"],
    ]);
    // 지운 룰을 가리키는 합류가 남지 않는다
    expect(g.nodes.some((n) => n.kind === "MERGE")).toBe(false);
    expect(parseFlow(g).issues.map((i) => i.nodeId)).toContain("r9");
  });

  it("남은 처리 갈래 룰(들어오는 선 0개)은 지울 수 있고, 새로 끼운 룰이 지운 룰의 ID 를 다시 받아도 그 ID 를 가리키는 합류가 없다", () => {
    const g = ok(removeNode(specFlow(), "r1"));
    const h = ok(removeNode(g, "r9"));
    expect(ids(h)).toEqual(["start", "r2", "end"]);
    expect(parseFlow(h).issues).toEqual([]);
    const k = ok(insertRule(h, "e1", "R_N"));
    expect(ids(k)).toEqual(["start", "r1", "r2", "end"]);
    const nodeIds = new Set(k.nodes.map((n) => n.id));
    expect(k.nodes.filter((n) => n.kind === "MERGE" && !nodeIds.has(n.splitId ?? ""))).toEqual([]);
    expect(parseFlow(k).issues).toEqual([]);
  });

  it("들어오는 선이 없는 룰은 나가는 선·붙은 받는 노드와 함께 지운다", () => {
    // r2 로 들어오는 선을 지워 떨어진 룰을 만든다: start → r1 → end, r2 → end, c1(r2) → end
    const f = ok(addCatch(toEditFlow(null, ["R_A", "R_B"]), "r2", null));
    const loose: EditFlow = { ...f, edges: f.edges.map((x) => (x.id === "e2" ? { ...x, to: "end" } : x)) }; // e2: r1 → r2 를 r1 → end 로
    const g = ok(removeNode(loose, "r2"));
    expect(ids(g)).toEqual(["start", "r1", "end"]);
    expect(g.edges.map((e) => [e.from, e.to])).toEqual([["start", "r1"], ["r1", "end"]]);
  });

  it("정상 쪽에 노드가 더 있어도 돌아오는 합류로 들어오는 정상 쪽 선을 합류 출구로 잇는다", () => {
    // start → r1 → r3 → m1 → r2 → end, c1 → r9 → m1
    const f = toEditFlow(
      {
        version: 1,
        nodes: [
          n("start", "START"), n("r1", "RULE", "R_A"), c("c1", "r1", ["NO_RESULT"]), n("r3", "RULE", "R_D"), n("r9", "RULE", "R_C"),
          { ...n("m1", "MERGE"), splitId: "r1" }, n("r2", "RULE", "R_B"), n("end", "END"),
        ],
        edges: [e("e1", "start", "r1"), e("e2", "r1", "r3"), e("e8", "r3", "m1"), e("e3", "c1", "r9"), e("e4", "r9", "m1"), e("e6", "m1", "r2"), e("e7", "r2", "end")],
      },
      [],
    );
    expect(parseFlow(f).issues).toEqual([]);
    const g = ok(removeNode(f, "r1"));
    expect(ids(g)).toEqual(["start", "r3", "r9", "r2", "end"]);
    expect(g.edges.map((x) => [x.id, x.from, x.to])).toEqual([
      ["e1", "start", "r3"],
      ["e8", "r3", "r2"],
      ["e7", "r2", "end"],
    ]);
  });

  it("돌아오는 합류의 정상 쪽 선이 하나가 아니면 룰을 지우지 않는다", () => {
    const f = specFlow();
    const twisted: EditFlow = { ...f, edges: [...f.edges, e("e9", "start", "m1")] };
    expect(reason(removeNode(twisted, "r1"))).toBe(RETURN_MERGE_NOT_ONE);
  });

  it("받는 노드만 지우면 그 나가는 선만 지운다", () => {
    const f = ok(addCatch(base(), "r1", null));
    const g = ok(removeNode(f, "c1"));
    expect(ids(g)).toEqual(["start", "r1", "end"]);
    expect(g.edges.map((e) => [e.from, e.to])).toEqual([["start", "r1"], ["r1", "end"]]);
  });

  /** 돌아오는 합류 m1 을 걷어 낸 모양 — 정상 쪽 선 e2 가 합류 출구 도착 r2 로 가고, 처리 갈래 r9 는 끊긴 채 남는다. */
  const expectUnwound = (g: EditFlow) => {
    expect(ids(g)).toEqual(["start", "r1", "r9", "c2", "r2", "end"]);
    expect(g.edges.map((x) => [x.id, x.from, x.to])).toEqual([
      ["e1", "start", "r1"],
      ["e2", "r1", "r2"],
      ["e5", "c2", "end"],
      ["e7", "r2", "end"],
    ]);
    expect(g.nodes.some((x) => x.kind === "MERGE")).toBe(false);
    const issues = parseFlow(g).issues;
    expect(issues.filter((i) => i.message.includes("짝 분기"))).toEqual([]);
    expect(issues.map((i) => i.nodeId)).toContain("r9");
  };

  it("돌아오는 처리 갈래의 마지막 받는 노드를 지우면 돌아오는 합류도 걷어 정상 쪽을 합류 출구로 잇는다", () => {
    const f = specFlow();
    const before = JSON.stringify(f);
    expectUnwound(ok(removeNode(f, "c1")));
    expect(JSON.stringify(f)).toBe(before); // 원래 흐름을 고치지 않는다 — 되돌리기가 앞 흐름을 그대로 쓴다
  });

  it("돌아오는 합류를 바로 지우면 받는 노드 지우기와 같은 방식으로 걷어 내고 받는 노드는 남긴다", () => {
    const g = ok(removeNode(specFlow(), "m1"));
    expect(ids(g)).toEqual(["start", "r1", "c1", "r9", "c2", "r2", "end"]);
    expect(g.edges.map((x) => [x.id, x.from, x.to])).toEqual([
      ["e1", "start", "r1"],
      ["e2", "r1", "r2"],
      ["e3", "c1", "r9"],
      ["e5", "c2", "end"],
      ["e7", "r2", "end"],
    ]);
    expect(parseFlow(g).issues.filter((i) => i.message.includes("짝 분기"))).toEqual([]);
    // 합류를 먼저 지우고 받는 노드를 지워도 받는 노드를 먼저 지운 것과 같은 모양이 된다
    expectUnwound(ok(removeNode(ok(removeNode(specFlow(), "m1")), "c1")));
  });

  it("돌아오는 받는 노드가 둘이면 하나를 지워도 합류를 남긴다", () => {
    const f = specFlow();
    const twoBack: EditFlow = { ...f, edges: f.edges.map((x) => (x.id === "e5" ? { ...x, to: "m1" } : x)) }; // c2 → m1
    expect(parseFlow(twoBack).issues).toEqual([]);
    const g = ok(removeNode(twoBack, "c1"));
    expect(ids(g)).toEqual(["start", "r1", "r9", "c2", "m1", "r2", "end"]);
    expect(g.edges.map((x) => [x.from, x.to])).toEqual([["start", "r1"], ["r1", "m1"], ["r9", "m1"], ["c2", "m1"], ["m1", "r2"], ["r2", "end"]]);
  });

  it("분기의 합류와 돌아오는 합류의 선이 하나씩이 아니면 합류를 지우지 않는다", () => {
    expect(reason(removeNode(ifWithGuard(), "m1"))).toBe("합류 노드는 분기를 지워서 없앤다");
    const f = specFlow();
    const twisted: EditFlow = { ...f, edges: [...f.edges, e("e9", "start", "m1")] };
    expect(reason(removeNode(twisted, "m1"))).toBe(RETURN_MERGE_STUCK);
    // 받는 노드 지우기는 합류를 걷지 못해도 받는 노드만 지운다(예전 동작)
    expect(ids(ok(removeNode(twisted, "c1")))).toContain("m1");
  });

  /** start → if1 [b1 → r1(R_A) → mr → m1][그 외 → m1] → end. r1 에 c1 → r9(R_C) → mr, c2 → end. */
  const ifWithGuard = (): EditFlow =>
    toEditFlow(
      {
        version: 1,
        nodes: [
          { id: "start", kind: "START", ruleId: null, splitId: null, label: null },
          { id: "if1", kind: "IF", ruleId: null, splitId: null, label: null },
          { id: "r1", kind: "RULE", ruleId: "R_A", splitId: null, label: null },
          { id: "c1", kind: "CATCH", ruleId: null, splitId: null, label: null, attachTo: "r1", catches: ["NO_RESULT"] },
          { id: "r9", kind: "RULE", ruleId: "R_C", splitId: null, label: null },
          { id: "c2", kind: "CATCH", ruleId: null, splitId: null, label: null, attachTo: "r1", catches: ["EVAL_ERROR"] },
          { id: "mr", kind: "MERGE", ruleId: null, splitId: "r1", label: null },
          { id: "m1", kind: "MERGE", ruleId: null, splitId: "if1", label: null },
          { id: "end", kind: "END", ruleId: null, splitId: null, label: null },
        ],
        edges: [
          { id: "e1", from: "start", to: "if1", order: null, cond: null, otherwise: false, label: null },
          { id: "b1", from: "if1", to: "r1", order: 1, cond: "X > 0", otherwise: false, label: null },
          { id: "bo", from: "if1", to: "m1", order: null, cond: null, otherwise: true, label: null },
          { id: "e2", from: "r1", to: "mr", order: null, cond: null, otherwise: false, label: null },
          { id: "e3", from: "c1", to: "r9", order: null, cond: null, otherwise: false, label: null },
          { id: "e4", from: "r9", to: "mr", order: null, cond: null, otherwise: false, label: null },
          { id: "e5", from: "c2", to: "end", order: null, cond: null, otherwise: false, label: null },
          { id: "e6", from: "mr", to: "m1", order: null, cond: null, otherwise: false, label: null },
          { id: "e7", from: "m1", to: "end", order: null, cond: null, otherwise: false, label: null },
        ],
      },
      [],
    );

  it("받는 룰이 든 IF 블록은 받는 노드·처리 갈래(끝으로 가는 것 포함)까지 한 블록이라 지우기·접기 대상이다", () => {
    const f = ifWithGuard();
    expect(parseFlow(f).issues).toEqual([]);
    expect(blockMembers(f, "if1")).toEqual(["if1", "r1", "c1", "r9", "c2", "mr", "m1"]);
    const g = ok(removeNode(f, "if1"));
    expect(ids(g)).toEqual(["start", "end"]);
  });

  it("받는 룰이 든 갈래를 남기고 분기를 풀면 받는 노드·처리 갈래가 함께 남고, 다른 갈래를 고르면 함께 지워진다", () => {
    const kept = ok(dissolveSplit(ifWithGuard(), "if1", "b1"));
    expect(ids(kept)).toEqual(["start", "r1", "c1", "r9", "c2", "mr", "end"]);
    expect(kept.edges.find((e) => e.id === "e6")).toMatchObject({ from: "mr", to: "end" });
    expect(parseFlow(kept).issues).toEqual([]);
    expect(ids(ok(dissolveSplit(ifWithGuard(), "if1", "bo")))).toEqual(["start", "end"]);
  });

  it("받는 노드가 든 블록은 복사하지 않는다", () => {
    expect(copyFragment(ifWithGuard(), "if1")).toBe(NO_COPY_CATCH);
  });

  it("룰 하나 복사는 받는 노드 없이 룰만 복사한다", () => {
    const frag = copyFragment(ok(addCatch(base(), "r1", null)), "r1");
    expect(typeof frag !== "string" && frag.nodes).toEqual([{ id: "r1", kind: "RULE", ruleId: "R_A", splitId: null, label: null }]);
  });

  it("받는 노드 위치는 저장하지 않는다", () => {
    const f = ok(addCatch(base(), "r1", null));
    expect(setPositions(f, { c1: { x: 1, y: 2 }, r1: { x: 3, y: 4 } }).view.positions).toEqual({ r1: { x: 3, y: 4 } });
  });

  it("받는 노드로 들어가는 선·받는 노드에서 두 번째로 나가는 선은 만들지 않는다", () => {
    const f = ok(addCatch(base(), "r1", null));
    expect(reason(connect(f, "r1", "c1"))).toBe(CATCH_NO_IN);
    expect(reason(connect(f, "c1", "r1"))).toBe(CATCH_ONE_OUT);
  });

  it("처리 갈래 첫 선의 도착 끝은 옮길 수 있고, 받는 노드로 옮기거나 선이 있는 받는 노드에서 나가게 옮기는 것은 막는다", () => {
    // start → r1 → r2 → end(e1 e2 e3), c1 → end(e4), c2 → end(e5)
    const f = ok(addCatch(ok(addCatch(toEditFlow(null, ["R_A", "R_B"]), "r1", null)), "r1", null));
    // 룰의 정상 다음 노드(r2)로 옮기면 돌아오는 합류를 만들어 그 합류로 간다(돌아오기, catch-return.test).
    expect(ok(reconnectEdge(f, "e4", { to: "r2" })).edges.find((e) => e.id === "e4")).toMatchObject({ from: "c1", to: "m1" });
    expect(reason(reconnectEdge(f, "e4", { to: "c2" }))).toBe(CATCH_NO_IN);
    expect(reason(reconnectEdge(f, "e2", { from: "c2" }))).toBe(CATCH_ONE_OUT);
  });

  it("받는 노드에는 설명을 달 수 없다(R-DESC)", () => {
    const f = ok(addCatch(base(), "r1", null));
    expect(reason(updateNodeDesc(f, "c1", "설명"))).toBe("받는 노드에는 설명을 달 수 없다");
    expect(reason(updateNodeDesc(f, "r1", "설명"))).toBeNull();
  });

  it("처리 갈래가 돌아오는 룰은 옮기지 않는다", () => {
    expect(reason(moveNode(specFlow(), "r1", "e7"))).toBe(MOVE_GUARDED);
  });

  it("처리 갈래가 끝으로 가는 룰은 옮길 수 있지만, 자기 받는 노드에서 나가는 선 위로는 옮기지 않는다", () => {
    // start → r1 → r2 → r3 → end(e1 e2 e3 e4), c1 → end(e5)
    const f = ok(addCatch(toEditFlow(null, ["R_A", "R_B", "R_C"]), "r1", null));
    expect(moveExcludedEdges(f, "r1").has("e5")).toBe(true);
    expect(reason(moveNode(f, "r1", "e5"))).toBe("자기 자리나 자기 블록 안으로는 옮길 수 없다");
    const g = ok(moveNode(f, "r1", "e3"));
    expect(g.edges.map((x) => [x.from, x.to])).toEqual([["start", "r2"], ["r2", "r1"], ["r1", "r3"], ["r3", "end"], ["c1", "end"]]);
    expect(parseFlow(g).issues).toEqual([]);
  });

  it("받는 룰이 든 블록은 처리 갈래에서 끝으로 가는 선 위로 옮기지 않는다", () => {
    const f = ifWithGuard();
    expect(moveExcludedEdges(f, "if1").has("e5")).toBe(true);
    expect(reason(moveNode(f, "if1", "e5"))).toBe("자기 자리나 자기 블록 안으로는 옮길 수 없다");
  });

  it("받는 노드는 옮기지도 복사·복제하지도 않는다", () => {
    const f = ok(addCatch(base(), "r1", null));
    expect(reason(moveNode(f, "c1", "e1"))).toBe("받는 노드는 룰을 옮겨서 옮긴다");
    expect(copyFragment(f, "c1")).toBe(NO_COPY_CATCH_NODE);
    expect(reason(duplicateNode(f, "c1"))).toBe(NO_COPY_CATCH_NODE);
  });

  it("받는 노드는 그룹에 넣지 않는다", () => {
    const f = ok(addCatch(base(), "r1", null));
    expect(reason(addGroup(f, ["c1"], "G"))).toBe("그룹에 넣을 노드를 고른다");
    const g = addGroup(f, ["r1", "c1"], "G");
    expect(g.ok && g.flow.view.groups[0].nodeIds).toEqual(["r1"]);
    const h = updateGroup(ok(g), g.ok ? g.id! : "", { nodeIds: ["c1", "r1"] });
    expect(h.view.groups[0].nodeIds).toEqual(["r1"]);
  });

  it("처리 갈래가 길어도 룰을 자기 처리 갈래 안의 선 위로 옮기지 않는다(끝으로 가는 갈래)", () => {
    // start → r1 → r2 → end(e1 e2 e3), c1 → r9 → end(e4 e9)
    const f0 = toEditFlow(null, ["R_A", "R_B"]);
    const f = ok(addCatch({ ...f0, nodes: [...f0.nodes, n("r9", "RULE", "R_X")], edges: [...f0.edges, e("e9", "r9", "end")] }, "r1", "r9"));
    expect(f.edges.find((x) => x.id === "e4")).toMatchObject({ from: "c1", to: "r9" });
    expect([...moveExcludedEdges(f, "r1")].sort()).toEqual(["e1", "e2", "e4", "e9"]);
    expect(reason(moveNode(f, "r1", "e9"))).toBe("자기 자리나 자기 블록 안으로는 옮길 수 없다");
    expect(ok(moveNode(f, "r1", "e3")).edges.find((x) => x.id === "e9")).toMatchObject({ from: "r9", to: "end" });
  });

  it("돌아오는 처리 갈래 안 선 위로도 룰을 옮기지 않는다", () => {
    const f = specFlow(); // c1 → r9 → m1(e3 e4), c2 → end(e5)
    expect([...moveExcludedEdges(f, "r1")].sort()).toEqual(["e1", "e2", "e3", "e4", "e5"]);
    expect(reason(moveNode(f, "r1", "e4"))).toBe(MOVE_GUARDED);
  });

  it("받는 룰이 든 블록은 처리 갈래가 길어도 그 갈래 안 선 위로 옮기지 않는다", () => {
    // ifWithGuard 의 c2 → end 를 c2 → r8 → end 로 늘린다
    const f0 = ifWithGuard();
    const f: EditFlow = {
      ...f0,
      nodes: [...f0.nodes.slice(0, -1), n("r8", "RULE", "R_D"), f0.nodes[f0.nodes.length - 1]],
      edges: [...f0.edges.map((x) => (x.id === "e5" ? { ...x, to: "r8" } : x)), e("e8", "r8", "end")],
    };
    expect(parseFlow(f).issues).toEqual([]);
    expect(blockMembers(f, "if1")).toContain("r8");
    expect(moveExcludedEdges(f, "if1").has("e8")).toBe(true);
    expect(reason(moveNode(f, "if1", "e8"))).toBe("자기 자리나 자기 블록 안으로는 옮길 수 없다");
  });
});
