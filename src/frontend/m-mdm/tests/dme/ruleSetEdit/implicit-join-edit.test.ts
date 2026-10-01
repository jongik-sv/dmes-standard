// implicit-join spec §8 — 새 형식 편집 연산: IF 끼우기·갈래·풀기·종류 바꾸기·지우기·옮기기·복사·복제, 받는 노드 붙이기·돌아오기, 빈 갈래 둘 막기.
import { describe, expect, it } from "vitest";

import type { FlowEdge, FlowNode } from "../../../src/contract/engine-contract.generated";
import {
  ENDING_TO_PARALLEL, IF_EMPTY_TWICE, KEEP_ENDING, MERGE_EXIT_NOT_ONE, MERGE_ONLY_BY_SPLIT, MOVE_GUARDED, RETURN_JOIN_END, RETURN_TO_END,
  TASK_LABEL, addBranch, addCatch, blockMembers, insertRule, changeSplitKind, copyFragment, dissolveSplit, duplicateNode, insertSplit, moveNode, pasteFragment, reconnectEdge,
  removeBranch, removeNode, returnCatch, tailsOf, toEditFlow, updateEdge, type EditFlow, type EditResult, type Fragment,
} from "../../../pages/dme/ruleSetEdit/flow-edit";
import { endingBranches, joinOf, parseFlow, returnOf } from "../../../pages/dme/ruleSetEdit/flow-model";
import { collapseView } from "../../../pages/dme/ruleSetEdit/canvas/collapse";

const N = (id: string, kind: FlowNode["kind"], over: Partial<FlowNode> = {}): FlowNode => ({ id, kind, ruleId: null, splitId: null, label: null, ...over });
const R = (id: string, ruleId = id.toUpperCase()) => N(id, "RULE", { ruleId });
const C = (id: string, attachTo: string, ...catches: string[]): FlowNode => ({ ...N(id, "CATCH"), attachTo, catches });
const E = (id: string, from: string, to: string, over: Partial<FlowEdge> = {}): FlowEdge => ({ id, from, to, order: null, cond: null, otherwise: false, label: null, ...over });
const ef = (nodes: FlowNode[], edges: FlowEdge[]): EditFlow => toEditFlow({ version: 1, nodes, edges }, []);
const ok = (r: EditResult): EditFlow => {
  if (!r.ok) throw new Error(r.reason);
  return r.flow;
};
const edgesOf = (f: EditFlow) => f.edges.map((e) => `${e.id}:${e.from}>${e.to}`);
const ids = (f: EditFlow) => f.nodes.map((n) => n.id);

/** F2 — start → if1 [b1 "X > 0" → x → j] [bo 그 외 → j] → j → end. */
const F2 = () => ef([N("start", "START"), N("if1", "IF"), R("x"), R("j"), N("end", "END")],
  [E("e0", "start", "if1"), E("b1", "if1", "x", { order: 1, cond: "X > 0", label: "갈래 1" }), E("bo", "if1", "j", { otherwise: true, label: "그 외" }),
    E("ex", "x", "j"), E("ej", "j", "end")]);
/** F3 — start → if1 [b1 → k → end](끝내는 갈래) [b2 → z → a] [bo 그 외 → a] → a → end. */
const F3 = () => ef([N("start", "START"), N("if1", "IF"), R("k"), R("z"), R("a"), N("end", "END")],
  [E("e0", "start", "if1"), E("b1", "if1", "k", { order: 1, cond: "X > 0" }), E("b2", "if1", "z", { order: 2, cond: "X > 1" }), E("bo", "if1", "a", { otherwise: true }),
    E("ek", "k", "end"), E("ez", "z", "a"), E("ea", "a", "end")]);

describe("IF 끼우기·갈래(implicit-join spec §8.2)", () => {
  it("IF 를 끼우면 합류 없이 「갈래 1」 빈 단계와 「그 외」 빈 갈래가 생긴다", () => {
    const base = toEditFlow(null, ["R_A"]); // start → r1 → end, e1·e2
    const f = ok(insertSplit(base, "e1", "IF"));
    expect(f.nodes.map((n) => `${n.id}:${n.kind}`)).toEqual(["start:START", "if1:IF", "r2:TASK", "r1:RULE", "end:END"]);
    expect(f.nodes.some((n) => n.kind === "MERGE")).toBe(false);
    expect(edgesOf(f)).toEqual(["e1:start>if1", "e3:if1>r2", "e4:if1>r1", "e5:r2>r1", "e2:r1>end"]);
    expect(f.edges.find((e) => e.id === "e3")).toMatchObject({ order: 1, label: "갈래 1", otherwise: false });
    expect(f.edges.find((e) => e.id === "e4")).toMatchObject({ order: null, label: "그 외", otherwise: true });
    expect(parseFlow(f).issues.map((i) => i.code)).toEqual(["FLOW_IF_ELSE"]);
    const g = ok(updateEdge(f, "e3", { cond: "X > 0" }));
    expect(parseFlow(g).issues).toEqual([]);
    expect(joinOf(g, "if1")).toBe("r1");
  });

  it("갈래를 더하면 빈 단계 하나와 모이는 자리로 가는 선이 그 외 앞에 들어간다", () => {
    const f = ok(addBranch(F2(), "if1"));
    expect(ids(f)).toEqual(["start", "if1", "r1", "x", "j", "end"]);
    expect(edgesOf(f)).toEqual(["e0:start>if1", "b1:if1>x", "e1:if1>r1", "e2:r1>j", "bo:if1>j", "ex:x>j", "ej:j>end"]);
    expect(f.edges.find((e) => e.id === "e1")).toMatchObject({ order: 2, label: "갈래 2" });
  });

  it("갈래를 지우면 이어지는 갈래는 모이는 자리까지, 끝내는 갈래는 END 까지 안쪽을 지운다", () => {
    expect(edgesOf(ok(removeBranch(F3(), "if1", "b1")))).toEqual(["e0:start>if1", "b2:if1>z", "bo:if1>a", "ez:z>a", "ea:a>end"]);
    expect(edgesOf(ok(removeBranch(F3(), "if1", "b2")))).toEqual(["e0:start>if1", "b1:if1>k", "bo:if1>a", "ek:k>end", "ea:a>end"]);
  });
});

describe("분기 풀기·종류 바꾸기", () => {
  it("이어지는 갈래·빈 갈래를 남기면 들어오는 선이 그 갈래로 가고, 끝내는 갈래만 남기기는 거부한다", () => {
    expect(edgesOf(ok(dissolveSplit(F3(), "if1", "b2")))).toEqual(["e0:start>z", "ez:z>a", "ea:a>end"]);
    expect(edgesOf(ok(dissolveSplit(F3(), "if1", "bo")))).toEqual(["e0:start>a", "ea:a>end"]);
    expect(dissolveSplit(F3(), "if1", "b1")).toEqual({ ok: false, reason: KEEP_ENDING });
  });

  it("안쪽 IF 를 풀어 바깥 IF 에 같은 도착 선이 둘 생기면 거부한다(B2)", () => {
    // o [b1 → i [d1 → y][그 외 → j]] [그 외 → j] → j → end
    const f = ef([N("start", "START"), N("o", "IF"), N("i", "IF"), R("y"), R("j"), N("end", "END")],
      [E("e0", "start", "o"), E("b1", "o", "i", { order: 1, cond: "X > 0" }), E("bo", "o", "j", { otherwise: true }), E("d1", "i", "y", { order: 1, cond: "X > 1" }),
        E("do", "i", "j", { otherwise: true }), E("ey", "y", "j"), E("ej", "j", "end")]);
    expect(dissolveSplit(f, "i", "do")).toEqual({ ok: false, reason: IF_EMPTY_TWICE("o") });
  });

  it("IF → 병렬은 모이는 자리 앞에 합류를 넣고 꼬리를 모은다, 병렬 → IF 는 합류를 없애고 같은 도착 갈래에 빈 단계를 채운다", () => {
    const p = ok(changeSplitKind(F2(), "if1", "PARALLEL"));
    expect(p.nodes.map((n) => `${n.id}:${n.kind}`)).toEqual(["start:START", "if1:PARALLEL", "x:RULE", "m1:MERGE", "j:RULE", "end:END"]);
    expect(p.nodes.find((n) => n.id === "m1")!.splitId).toBe("if1");
    expect(edgesOf(p)).toEqual(["e0:start>if1", "b1:if1>x", "bo:if1>m1", "ex:x>m1", "e1:m1>j", "ej:j>end"]);
    expect(parseFlow(p).issues).toEqual([]);
    const back = ok(changeSplitKind(p, "if1", "IF"));
    expect(back.nodes.some((n) => n.kind === "MERGE")).toBe(false);
    expect(edgesOf(back)).toEqual(["e0:start>if1", "b1:if1>x", "bo:if1>j", "ex:x>j", "ej:j>end"]);
    expect(changeSplitKind(F3(), "if1", "PARALLEL")).toEqual({ ok: false, reason: ENDING_TO_PARALLEL });
    // 병렬 빈 갈래 둘 → IF: 실행 순서 마지막(pb)만 빈 갈래로 둔다.
    const par = ef([N("start", "START"), N("p1", "PARALLEL"), R("a"), N("pm", "MERGE", { splitId: "p1" }), R("z"), N("end", "END")],
      [E("e0", "start", "p1"), E("pa", "p1", "pm", { order: 1 }), E("pb", "p1", "pm", { order: 2 }), E("pc", "p1", "a", { order: 3 }), E("ea", "a", "pm"),
        E("ep", "pm", "z"), E("ez", "z", "end")]);
    const iff = ok(changeSplitKind(par, "p1", "IF"));
    const outs = iff.edges.filter((e) => e.from === "p1");
    expect(new Set(outs.map((e) => e.to)).size).toBe(outs.length);
    expect(iff.edges.find((e) => e.id === "pb")!.to).toBe("z");
    expect(iff.nodes.find((n) => n.id === iff.edges.find((e) => e.id === "pa")!.to)!.kind).toBe("TASK");
  });
});

describe("노드 지우기·옮기기(implicit-join spec §8.2)", () => {
  it("IF 를 지우면 들어오는 선이 모이는 자리로 가고 끝내는 갈래 몸까지 블록으로 지운다", () => {
    expect(edgesOf(ok(removeNode(F3(), "if1")))).toEqual(["e0:start>a", "ea:a>end"]);
  });

  it("들어오는 선이 여럿인 모이는 자리 룰을 지우면 모두 다음 노드로 옮기고, 그 결과 빈 갈래가 둘이면 거부한다", () => {
    expect(edgesOf(ok(removeNode(F2(), "j")))).toEqual(["e0:start>if1", "b1:if1>x", "bo:if1>end", "ex:x>end"]);
    expect(removeNode(F2(), "x")).toEqual({ ok: false, reason: IF_EMPTY_TWICE("if1") });
  });

  it("돌아오는 자리이고 다음이 END 인 노드는 지우거나 옮기지 않는다, 합류 노드는 분기로 지운다", () => {
    const f = ef([N("start", "START"), R("r1"), C("c1", "r1", "NO_RESULT"), R("h"), R("n"), N("end", "END")],
      [E("e1", "start", "r1"), E("e2", "r1", "n"), E("e3", "c1", "h"), E("e4", "h", "n"), E("e5", "n", "end")]);
    expect(returnOf(f, "r1")).toBe("n");
    expect(removeNode(f, "n")).toEqual({ ok: false, reason: RETURN_JOIN_END });
    expect(moveNode(f, "n", "e1")).toEqual({ ok: false, reason: RETURN_JOIN_END });
    expect(moveNode(f, "r1", "e5")).toEqual({ ok: false, reason: MOVE_GUARDED });
    const par = ef([N("start", "START"), N("p1", "PARALLEL"), R("a"), R("b"), N("pm", "MERGE", { splitId: "p1" }), N("end", "END")],
      [E("e0", "start", "p1"), E("pa", "p1", "a", { order: 1 }), E("pb", "p1", "b", { order: 2 }), E("ea", "a", "pm"), E("eb", "b", "pm"), E("ep", "pm", "end")]);
    expect(removeNode(par, "pm")).toEqual({ ok: false, reason: MERGE_ONLY_BY_SPLIT });
  });

  it("들어오는 선이 여럿인 룰을 옮기면 들어오는 선을 모두 다음 노드로 잇는다", () => {
    expect(edgesOf(ok(moveNode(F2(), "j", "e0")))).toEqual(["e0:start>j", "e1:j>if1", "b1:if1>x", "bo:if1>end", "ex:x>end"]);
  });

  it("IF 블록을 옮기면 꼬리를 놓는 선의 도착으로 잇고 새 선을 만들지 않는다", () => {
    const f = ef([N("start", "START"), N("if1", "IF"), R("x"), R("j"), R("y"), N("end", "END")],
      [E("e0", "start", "if1"), E("b1", "if1", "x", { order: 1, cond: "X > 0" }), E("bo", "if1", "j", { otherwise: true }), E("ex", "x", "j"), E("ej", "j", "y"),
        E("ey", "y", "end")]);
    const g = ok(moveNode(f, "if1", "ej"));
    expect(edgesOf(g)).toEqual(["e0:start>j", "b1:if1>x", "bo:if1>y", "ex:x>y", "ej:j>if1", "ey:y>end"]);
    expect(parseFlow(g).issues).toEqual([]);
  });
});

describe("복사·붙여넣기·복제(R7)", () => {
  it("IF 블록 조각은 꼬리·끝 선을 to 빈 문자열로 담고 출구가 없다", () => {
    const frag = copyFragment(F3(), "if1") as Fragment;
    expect(frag.exit).toBeNull();
    expect(frag.nodes.map((n) => n.id)).toEqual(["if1", "k", "z"]);
    expect(frag.edges.map((e) => `${e.id}:${e.from}>${e.to}`)).toEqual(["b1:if1>k", "b2:if1>z", "bo:if1>", "ek:k>", "ez:z>"]);
    expect(frag.tails).toEqual(["bo", "ez"]);
    expect(frag.endTails).toEqual(["ek"]);
  });

  it("붙여 넣으면 꼬리는 놓는 선의 도착, 끝 선은 END 로 잇는다", () => {
    const frag = copyFragment(F3(), "if1") as Fragment;
    const g = ok(pasteFragment(F2(), "ej", frag));
    const s = g.edges.find((e) => e.id === "ej")!.to;
    expect(g.nodes.find((n) => n.id === s)!.kind).toBe("IF");
    const outs = g.edges.filter((e) => e.from === s);
    expect(outs.find((e) => e.otherwise)!.to).toBe("end");
    const k = outs.find((e) => e.order === 1)!.to;
    expect(g.edges.find((e) => e.from === k)!.to).toBe("end");
  });

  it("IF 블록을 복제하면 원래 꼬리가 복제 분기로 가고 복제 꼬리가 원래 모이는 자리로 간다", () => {
    const g = ok(duplicateNode(F2(), "if1"));
    expect(ids(g)).toEqual(["start", "if1", "x", "if2", "r1", "j", "end"]);
    expect(edgesOf(g)).toEqual(["e0:start>if1", "b1:if1>x", "bo:if1>if2", "ex:x>if2", "e1:if2>r1", "e2:if2>j", "e3:r1>j", "ej:j>end"]);
    expect(joinOf(g, "if1")).toBe("if2");
    expect(joinOf(g, "if2")).toBe("j");
    expect(tailsOf(g, "if2")!.map((e) => e.id)).toEqual(["e2", "e3"]);
  });
});

describe("받는 노드 연산(implicit-join spec §8.2)", () => {
  it("빈 단계에도 받는 노드를 붙이고 정상 다음 노드로 놓으면 합류 없이 바로 돌아온다", () => {
    const f = ef([N("start", "START"), N("t1", "TASK", { label: "빈 단계" }), R("n"), N("end", "END")], [E("e1", "start", "t1"), E("e2", "t1", "n"), E("e3", "n", "end")]);
    const g = ok(addCatch(f, "t1", "n"));
    expect(g.nodes.some((n) => n.kind === "MERGE")).toBe(false);
    expect(edgesOf(g)).toEqual(["e1:start>t1", "e2:t1>n", "e3:n>end", "e4:c1>n"]);
    expect(returnOf(g, "t1")).toBe("n");
  });

  it("처리 갈래 선 끝을 정상 경로 노드로 옮기면 그 선이 곧 돌아오는 선이다", () => {
    const f = ef([N("start", "START"), R("r1"), C("c1", "r1", "NO_RESULT"), R("n"), N("end", "END")],
      [E("e1", "start", "r1"), E("e2", "r1", "n"), E("e3", "c1", "end"), E("e4", "n", "end")]);
    const g = ok(reconnectEdge(f, "e3", { to: "n" }));
    expect(edgesOf(g)).toEqual(["e1:start>r1", "e2:r1>n", "e3:c1>n", "e4:n>end"]);
  });

  it("「흐름으로 돌아오기」는 맨 바깥 끝 선을 돌아올 자리로 옮기고 처리 갈래 안 IF 의 끝내는 갈래 끝 선은 그대로 둔다", () => {
    // r1 → n → end, c1 → if9 [b "X > 0" → f → end] [그 외 → q → end]
    const f = ef([N("start", "START"), R("r1"), C("c1", "r1", "NO_RESULT"), N("if9", "IF"), R("f"), R("q"), R("n"), N("end", "END")],
      [E("e1", "start", "r1"), E("e2", "r1", "n"), E("e3", "c1", "if9"), E("b", "if9", "f", { order: 1, cond: "X > 0" }), E("ef", "f", "end"),
        E("bo", "if9", "q", { otherwise: true }), E("eq", "q", "end"), E("en", "n", "end")]);
    const g = ok(returnCatch(f, "c1"));
    expect(g.edges.find((e) => e.id === "eq")!.to).toBe("n");
    expect(g.edges.find((e) => e.id === "ef")!.to).toBe("end");
    expect(returnOf(g, "r1")).toBe("n");
    const atEnd = ef([N("start", "START"), R("r1"), C("c1", "r1", "NO_RESULT"), R("h"), N("end", "END")],
      [E("e1", "start", "r1"), E("e2", "r1", "end"), E("e3", "c1", "h"), E("e4", "h", "end")]);
    expect(returnCatch(atEnd, "c1")).toEqual({ ok: false, reason: RETURN_TO_END });
  });
});

// ── 수정 1회차(컨트롤러 판정): END 앞 IF·병렬은 모이는 자리 빈 단계를 둔다 ──

describe("END 앞 선에 끼운 IF — 모이는 자리 빈 단계(수정 1회차)", () => {
  /** start → r1 → if1 [e3 "X > 0" → r2(빈 단계) → r3][e4 그 외 → r3] → r3(모이는 자리 빈 단계) → end. */
  const atEnd = () => ok(updateEdge(ok(insertSplit(toEditFlow(null, ["R_A"]), "e2", "IF")), "e3", { cond: "X > 0" }));

  it("END 로 들어가는 선에 IF 를 끼우면 「갈래 1」 빈 단계와 모이는 자리 빈 단계를 두고 「그 외」 는 끝내는 갈래가 아니다", () => {
    const f = ok(insertSplit(toEditFlow(null, ["R_A"]), "e2", "IF"));
    expect(f.nodes.map((n) => `${n.id}:${n.kind}`)).toEqual(["start:START", "r1:RULE", "if1:IF", "r2:TASK", "r3:TASK", "end:END"]);
    expect(f.nodes.find((n) => n.id === "r3")!.label).toBe(TASK_LABEL);
    expect(edgesOf(f)).toEqual(["e1:start>r1", "e2:r1>if1", "e3:if1>r2", "e4:if1>r3", "e5:r2>r3", "e6:r3>end"]);
    expect(f.edges.find((e) => e.id === "e4")).toMatchObject({ otherwise: true, label: "그 외" });
    const g = atEnd();
    expect(parseFlow(g).issues).toEqual([]);
    expect(joinOf(g, "if1")).toBe("r3");
    expect(endingBranches(g, "if1")).toEqual([]);
    expect(blockMembers(g, "if1")).toEqual(["if1", "r2"]);
  });

  it("IF 를 지우면 들어오는 선이 모이는 자리로 가고 갈래 빈 단계만 지운다(모이는 자리 빈 단계는 남는다)", () => {
    const g = ok(removeNode(atEnd(), "if1"));
    expect(ids(g)).toEqual(["start", "r1", "r3", "end"]);
    expect(edgesOf(g)).toEqual(["e1:start>r1", "e2:r1>r3", "e6:r3>end"]);
  });

  it("「그 외」 를 남기고 풀 수 있고 병렬로 바꿀 수 있다", () => {
    expect(edgesOf(ok(dissolveSplit(atEnd(), "if1", "e4")))).toEqual(["e1:start>r1", "e2:r1>r3", "e6:r3>end"]);
    const p = ok(changeSplitKind(atEnd(), "if1", "PARALLEL"));
    expect(p.nodes.map((n) => `${n.id}:${n.kind}`)).toEqual(["start:START", "r1:RULE", "if1:PARALLEL", "r2:TASK", "m1:MERGE", "r3:TASK", "end:END"]);
    expect(edgesOf(p)).toEqual(["e1:start>r1", "e2:r1>if1", "e3:if1>r2", "e4:if1>m1", "e5:r2>m1", "e7:m1>r3", "e6:r3>end"]);
    expect(parseFlow(p).issues).toEqual([]);
  });

  it("갈래를 더하면 새 빈 단계가 모이는 자리로 간다(「갈래 1」 빈 단계로 들어가지 않는다)", () => {
    const g = ok(addBranch(atEnd(), "if1"));
    expect(ids(g)).toEqual(["start", "r1", "if1", "r4", "r2", "r3", "end"]);
    expect(edgesOf(g)).toEqual(["e1:start>r1", "e2:r1>if1", "e3:if1>r2", "e7:if1>r4", "e8:r4>r3", "e4:if1>r3", "e5:r2>r3", "e6:r3>end"]);
  });

  it("갈래 1 에 룰을 넣은 블록은 옮기기·접기에서 갈래 안 노드가 함께 다뤄진다", () => {
    const f = ok(insertRule(atEnd(), "e3", "R_B")); // if1 → r4(R_B) → r2 → r3
    expect(blockMembers(f, "if1")).toEqual(["if1", "r4", "r2"]);
    const g = ok(moveNode(f, "if1", "e1")); // start 바로 뒤로
    expect(edgesOf(g)).toEqual(["e1:start>if1", "e2:r1>r3", "e3:if1>r4", "e7:r4>r2", "e4:if1>r1", "e5:r2>r1", "e6:r3>end"]);
    expect(parseFlow(g).issues.filter((i) => i.code !== "FLOW_IF_ELSE")).toEqual([]);
    const v = collapseView(f, new Set(["if1"]));
    expect([...v.hidden].sort()).toEqual(["r2", "r4"]);
    expect(v.blocks.if1.count).toBe(2);
  });
});

describe("END 앞 병렬 ⇄ IF 왕복(수정 1회차)", () => {
  it("병렬 → IF 는 END 앞 합류를 같은 ID 의 빈 단계로 바꾸고, 다시 병렬로 바꿀 수 있다", () => {
    const par = ok(insertSplit(toEditFlow(null, ["R_A"]), "e2", "PARALLEL")); // r1 → par1 [e3·e4 → m1] → m1 → e5 → end
    const iff = ok(changeSplitKind(par, "par1", "IF"));
    expect(iff.nodes.map((n) => `${n.id}:${n.kind}`)).toEqual(["start:START", "r1:RULE", "par1:IF", "r2:TASK", "m1:TASK", "end:END"]);
    expect(iff.nodes.find((n) => n.id === "m1")).toMatchObject({ splitId: null, label: TASK_LABEL });
    expect(edgesOf(iff)).toEqual(["e1:start>r1", "e2:r1>par1", "e3:par1>r2", "e6:r2>m1", "e4:par1>m1", "e5:m1>end"]);
    expect(endingBranches(iff, "par1")).toEqual([]);
    const back = ok(changeSplitKind(iff, "par1", "PARALLEL"));
    expect(back.nodes.map((n) => `${n.id}:${n.kind}`)).toEqual(["start:START", "r1:RULE", "par1:PARALLEL", "r2:TASK", "m2:MERGE", "m1:TASK", "end:END"]);
    expect(parseFlow(back).issues).toEqual([]);
  });
});

describe("받는 노드 없는 옛 돌아오는 합류 지우기(수정 1회차)", () => {
  it("룰을 가리키는 합류는 들어오는 선을 출구 도착으로 옮겨 걷어 내고, 출구가 하나가 아니면 거부한다", () => {
    const f = ef([N("start", "START"), R("r1"), N("m1", "MERGE", { splitId: "r1" }), R("r2"), N("end", "END")],
      [E("e1", "start", "r1"), E("e2", "r1", "m1"), E("e3", "m1", "r2"), E("e4", "r2", "end")]);
    expect(f.nodes.some((n) => n.id === "m1")).toBe(true); // 받는 노드가 없어 변환 대상이 아니다
    const g = ok(removeNode(f, "m1"));
    expect(ids(g)).toEqual(["start", "r1", "r2", "end"]);
    expect(edgesOf(g)).toEqual(["e1:start>r1", "e2:r1>r2", "e4:r2>end"]);
    const two: EditFlow = { ...f, edges: [...f.edges, E("e9", "m1", "end")] };
    expect(removeNode(two, "m1")).toEqual({ ok: false, reason: MERGE_EXIT_NOT_ONE });
  });
});

