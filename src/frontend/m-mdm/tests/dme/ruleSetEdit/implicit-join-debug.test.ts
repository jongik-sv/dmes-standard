/** @vitest-environment happy-dom */
// implicit-join spec §11 — 돌아오는 자리에서 CATCH_* 되돌림(안쪽 블록부터, 고친 값보다 먼저), 병렬 안 IF 끝냄의 END 프레임, 끝낸 갈래 표시.
// 기록은 엔진 RuleSetCatchTest.nestedReturn·RuleSetIfEndTest 의 실행 기록을 손으로 옮겼다.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import type { FlowEdge, FlowNode, FlowNodeKind, NodeTrace, RuleSetFlow, RunTrace, TypedValue } from "../../../src/contract/engine-contract.generated";
import { debugStatus, endedBranchText } from "../../../pages/dme/ruleSetEdit/debugger/debug-model";
import { TraceDetail } from "../../../pages/dme/ruleSetEdit/debugger/TraceDetail";
import { frames } from "../../../pages/dme/ruleSetEdit/trace-view";
import { flush, installDomStorage } from "../helpers/render";

const S = (v: string): TypedValue => ({ type: "STRING", value: v });
const N = (v: string): TypedValue => ({ type: "NUMBER", value: v });
const fn = (id: string, kind: FlowNodeKind, over: Partial<FlowNode> = {}): FlowNode => ({ id, kind, ruleId: null, splitId: null, label: null, ...over });
const fe = (id: string, from: string, to: string, over: Partial<FlowEdge> = {}): FlowEdge => ({ id, from, to, order: null, cond: null, otherwise: false, label: null, ...over });
const nt = (seq: number, nodeId: string, kind: FlowNodeKind, over: Partial<NodeTrace> = {}): NodeTrace => ({
  seq, nodeId, kind, status: "OK", ruleId: null, ver: null, reads: null, branches: null, chosenEdgeId: null, order: null, splitId: null, merged: null,
  violations: null, ...over,
});
const res = (ruleId: string, results: Record<string, TypedValue>) => ({
  ruleId, ver: 1, evalTs: "2026-06-01T09:00:00", hits: [{ rowId: 1, seq: 1, groupChoices: {} }], defaultApplied: false, results, trace: [], warnings: [],
});
const run = (nodes: NodeTrace[], finalValues: Record<string, TypedValue>, extra: Partial<RunTrace> = {}): RunTrace =>
  ({ setId: "(저장 전)", evalTs: "2026-06-01T09:00:00", input: { X: N("5") }, violations: null, finalValues, nodes, ...extra });

/** 새 형식 중첩 — r1(R_ERR) → after → end. c1 EVAL_ERROR → h1(R_G) → k(R_CODE) → after. c9(h1) NO_RESULT → f(R_FILL) → k. */
const nested: RuleSetFlow = {
  version: 1,
  nodes: [fn("start", "START"), fn("r1", "RULE", { ruleId: "R_ERR" }), fn("c1", "CATCH", { attachTo: "r1", catches: ["EVAL_ERROR"] }), fn("h1", "RULE", { ruleId: "R_G" }),
    fn("c9", "CATCH", { attachTo: "h1", catches: ["NO_RESULT"] }), fn("f", "RULE", { ruleId: "R_FILL" }), fn("k", "RULE", { ruleId: "R_CODE" }),
    fn("after", "RULE", { ruleId: "R_AFTER" }), fn("end", "END")],
  edges: [fe("e1", "start", "r1"), fe("e2", "r1", "after"), fe("e3", "c1", "h1"), fe("e4", "h1", "k"), fe("e5", "c9", "f"), fe("e6", "f", "k"),
    fe("e7", "k", "after"), fe("e8", "after", "end")],
};
const nestedNodes = (): NodeTrace[] => [
  nt(1, "start", "START"),
  nt(2, "r1", "RULE", { status: "CAUGHT", ruleId: "R_ERR", ver: 1, reads: { X: N("5") }, violations: [] }),
  nt(3, "c1", "CATCH", { ruleId: "R_ERR", catchKind: "EVAL_ERROR", code: "EVALUATION_ERROR", message: "나누기 오류" }),
  nt(4, "h1", "RULE", { status: "CAUGHT", ruleId: "R_G", ver: 1, reads: { X: N("5") }, violations: [] }),
  nt(5, "c9", "CATCH", { ruleId: "R_G", catchKind: "NO_RESULT", code: "NO_RESULT", message: "맞는 행과 기본 행이 없다" }),
  nt(6, "f", "RULE", { ruleId: "R_FILL", ver: 1, reads: {}, result: res("R_FILL", { G: N("0") }) }),
  nt(7, "k", "RULE", { ruleId: "R_CODE", ver: 1, reads: {}, result: res("R_CODE", { CODE: S("EVALUATION_ERROR") }) }),
  nt(8, "after", "RULE", { ruleId: "R_AFTER", ver: 1, reads: { X: N("5") }, result: res("R_AFTER", { Z: N("10") }) }),
  nt(9, "end", "END"),
];

describe("frames — 돌아오는 자리(implicit-join spec §11)", () => {
  it("돌아오는_자리에서_안쪽_블록부터_CATCH_를_되돌린다", () => {
    const fr = frames(run(nestedNodes(), { G: N("0"), CODE: S("EVALUATION_ERROR"), Z: N("10") }), nested);
    expect(fr[5].before.CATCH_CODE).toEqual(S("NO_RESULT")); // f — 안쪽 처리 갈래
    expect(fr[6].before.CATCH_CODE).toEqual(S("EVALUATION_ERROR")); // k — 안쪽 블록 되돌림 뒤 바깥 값
    expect(fr[6].before.CATCH_KIND).toEqual(S("EVAL_ERROR"));
    expect(fr[7].before.CATCH_CODE).toBeUndefined(); // after — 바깥 블록도 닫혔다
  });

  it("같은_자리를_닫는_중첩_블록은_안쪽부터_되돌려_가장_바깥_블록_직전_값이_남는다", () => {
    // r1 → after → end. c1(r1) EVAL_ERROR → h1 → after. c9(h1) NO_RESULT → f → after — 두 블록이 모두 after 로 돌아온다(guardJoins after → [h1, r1]).
    const same: RuleSetFlow = {
      version: 1,
      nodes: [fn("start", "START"), fn("r1", "RULE", { ruleId: "R_ERR" }), fn("c1", "CATCH", { attachTo: "r1", catches: ["EVAL_ERROR"] }), fn("h1", "RULE", { ruleId: "R_G" }),
        fn("c9", "CATCH", { attachTo: "h1", catches: ["NO_RESULT"] }), fn("f", "RULE", { ruleId: "R_FILL" }), fn("after", "RULE", { ruleId: "R_AFTER" }), fn("end", "END")],
      edges: [fe("e1", "start", "r1"), fe("e2", "r1", "after"), fe("e3", "c1", "h1"), fe("e4", "h1", "after"), fe("e5", "c9", "f"), fe("e6", "f", "after"),
        fe("e7", "after", "end")],
    };
    const nodes = [
      nt(1, "start", "START"),
      nt(2, "r1", "RULE", { status: "CAUGHT", ruleId: "R_ERR", ver: 1, reads: {}, violations: [] }),
      nt(3, "c1", "CATCH", { ruleId: "R_ERR", catchKind: "EVAL_ERROR", code: "EVALUATION_ERROR", message: "나누기 오류" }),
      nt(4, "h1", "RULE", { status: "CAUGHT", ruleId: "R_G", ver: 1, reads: {}, violations: [] }),
      nt(5, "c9", "CATCH", { ruleId: "R_G", catchKind: "NO_RESULT", code: "NO_RESULT", message: "맞는 행과 기본 행이 없다" }),
      nt(6, "f", "RULE", { ruleId: "R_FILL", ver: 1, reads: {}, result: res("R_FILL", { G: N("0") }) }),
      nt(7, "after", "RULE", { ruleId: "R_AFTER", ver: 1, reads: {}, result: res("R_AFTER", { Z: N("10") }) }),
      nt(8, "end", "END"),
    ];
    const fr = frames(run(nodes, {}), same);
    expect(fr[5].before.CATCH_KIND).toEqual(S("NO_RESULT")); // f — 안쪽 처리 갈래
    for (const n of ["CATCH_KIND", "CATCH_RULE", "CATCH_CODE", "CATCH_MSG"]) expect(fr[6].before[n]).toBeUndefined(); // 바깥부터 되돌리면 c1 값이 남는다
    const edited = frames(run(nodes, {}, { edits: [{ beforeSeq: 7, nodeId: "after", values: { CATCH_KIND: S("EDITED") } }] }), same);
    expect(edited[6].before.CATCH_KIND).toEqual(S("EDITED"));
  });

  it("돌아오는 자리에 건 고친 값은 되돌림 뒤에 들어간다(R3)", () => {
    const fr = frames(run(nestedNodes(), {}, { edits: [{ beforeSeq: 7, nodeId: "k", values: { CATCH_CODE: S("EDITED") } }] }), nested);
    expect(fr[6].before.CATCH_CODE).toEqual(S("EDITED"));
    expect(fr[6].edited).toEqual(["CATCH_CODE"]);
  });

  it("돌아오는 자리가 받는 노드가 붙은 단계면 앞 블록을 되돌린 뒤 그 단계 직전 값을 적는다", () => {
    // start → r1 → r2 → r3 → end. c1(r1) → h → r2(돌아오는 자리 = r2). c2(r2) → f → r3(돌아오는 자리 = r3). 엔진: guarded(r1) 끝에서 되돌린 뒤 guarded(r2) 가 outer 를 적는다.
    const flow: RuleSetFlow = {
      version: 1,
      nodes: [fn("start", "START"), fn("r1", "RULE", { ruleId: "R_ERR" }), fn("c1", "CATCH", { attachTo: "r1", catches: ["EVAL_ERROR"] }), fn("h", "RULE", { ruleId: "R_H" }),
        fn("r2", "RULE", { ruleId: "R_G" }), fn("c2", "CATCH", { attachTo: "r2", catches: ["NO_RESULT"] }), fn("f", "RULE", { ruleId: "R_FILL" }),
        fn("r3", "RULE", { ruleId: "R_AFTER" }), fn("end", "END")],
      edges: [fe("e1", "start", "r1"), fe("e2", "r1", "r2"), fe("e3", "c1", "h"), fe("e4", "h", "r2"), fe("e5", "r2", "r3"), fe("e6", "c2", "f"), fe("e7", "f", "r3"),
        fe("e8", "r3", "end")],
    };
    const head = [
      nt(1, "start", "START"),
      nt(2, "r1", "RULE", { status: "CAUGHT", ruleId: "R_ERR", ver: 1, reads: { X: N("5") }, violations: [] }),
      nt(3, "c1", "CATCH", { ruleId: "R_ERR", catchKind: "EVAL_ERROR", code: "EVALUATION_ERROR", message: "나누기 오류" }),
      nt(4, "h", "RULE", { ruleId: "R_H", ver: 1, reads: {}, result: res("R_H", { H: N("1") }) }),
    ];
    // r2 정상 — r3 앞에 CATCH_* 가 없다.
    const ok = frames(run([...head, nt(5, "r2", "RULE", { ruleId: "R_G", ver: 1, reads: {}, result: res("R_G", { G: N("2") }) }),
      nt(6, "r3", "RULE", { ruleId: "R_AFTER", ver: 1, reads: {}, result: res("R_AFTER", { Z: N("10") }) }), nt(7, "end", "END")], {}), flow);
    expect(ok[4].before.CATCH_KIND).toBeUndefined(); // r2 — r1 블록이 닫혔다
    expect(ok[5].before.CATCH_KIND).toBeUndefined(); // r3 — r2 블록 직전 값(빈 값)으로
    // r2 도 받음 — f 는 c2 값, r3 앞에는 c1·c2 어느 값도 없다.
    const caught = frames(run([...head, nt(5, "r2", "RULE", { status: "CAUGHT", ruleId: "R_G", ver: 1, reads: {}, violations: [] }),
      nt(6, "c2", "CATCH", { ruleId: "R_G", catchKind: "NO_RESULT", code: "NO_RESULT", message: "맞는 행과 기본 행이 없다" }),
      nt(7, "f", "RULE", { ruleId: "R_FILL", ver: 1, reads: {}, result: res("R_FILL", { G: N("0") }) }),
      nt(8, "r3", "RULE", { ruleId: "R_AFTER", ver: 1, reads: {}, result: res("R_AFTER", { Z: N("10") }) }), nt(9, "end", "END")], {}), flow);
    expect(caught[6].before.CATCH_KIND).toEqual(S("NO_RESULT"));
    for (const n of ["CATCH_KIND", "CATCH_RULE", "CATCH_CODE", "CATCH_MSG"]) expect(caught[7].before[n]).toBeUndefined();
  });

  it("병렬_갈래_안_IF_끝냄_기록의_END_프레임은_열린_갈래를_합친다", () => {
    // p1 [p1a → a → pm] [p1i → if1 [b1 "X > 0" → k → end] [그 외 → pm]] [p1b → b → pm] → pm → end
    const flow: RuleSetFlow = {
      version: 1,
      nodes: [fn("start", "START"), fn("p1", "PARALLEL"), fn("a", "RULE", { ruleId: "R_A" }), fn("if1", "IF"), fn("k", "RULE", { ruleId: "R_AFTER" }),
        fn("b", "RULE", { ruleId: "R_B" }), fn("pm", "MERGE", { splitId: "p1" }), fn("end", "END")],
      edges: [fe("e0", "start", "p1"), fe("p1a", "p1", "a", { order: 1 }), fe("p1i", "p1", "if1", { order: 2 }), fe("p1b", "p1", "b", { order: 3 }), fe("ea", "a", "pm"),
        fe("b1", "if1", "k", { order: 1, cond: "X > 0" }), fe("ek", "k", "end"), fe("bo", "if1", "pm", { otherwise: true }), fe("eb", "b", "pm"), fe("ee", "pm", "end")],
    };
    const trace = run([
      nt(1, "start", "START"),
      nt(2, "p1", "PARALLEL", { order: ["p1a", "p1i", "p1b"] }),
      nt(3, "a", "RULE", { ruleId: "R_A", ver: 1, reads: { X: N("5") }, result: res("R_A", { A: N("6") }) }),
      nt(4, "if1", "IF", { chosenEdgeId: "b1" }),
      nt(5, "k", "RULE", { ruleId: "R_AFTER", ver: 1, reads: { X: N("5") }, result: res("R_AFTER", { Z: N("10") }) }),
      nt(6, "end", "END"),
    ], { A: N("6"), Z: N("10") });
    const fr = frames(trace, flow);
    expect(fr[5].ctx.A).toEqual(N("6"));
    expect(fr[5].ctx.Z).toEqual(N("10"));
  });
});

describe("끝낸 갈래 표시(R12)", () => {
  /** start → r0 → if1(단가 확인) [b1 "X > 10" 「단가 없음」 → k → end] [그 외 → n] → n → end */
  const flow: RuleSetFlow = {
    version: 1,
    nodes: [fn("start", "START"), fn("r0", "RULE", { ruleId: "R_A" }), fn("if1", "IF", { label: "단가 확인" }), fn("k", "RULE", { ruleId: "R_B" }),
      fn("n", "RULE", { ruleId: "R_AFTER" }), fn("end", "END")],
    edges: [fe("e1", "start", "r0"), fe("e2", "r0", "if1"), fe("b1", "if1", "k", { order: 1, cond: "X > 10", label: "단가 없음" }), fe("ek", "k", "end"),
      fe("bo", "if1", "n", { otherwise: true }), fe("en", "n", "end")],
  };
  const ended = run([nt(1, "start", "START"), nt(2, "r0", "RULE", { ruleId: "R_A", ver: 1, reads: {}, result: res("R_A", { A: N("21") }) }),
    nt(3, "if1", "IF", { chosenEdgeId: "b1" }), nt(4, "k", "RULE", { ruleId: "R_B", ver: 1, reads: {}, result: res("R_B", { B: N("22") }) }), nt(5, "end", "END")],
    { A: N("21"), B: N("22") });

  it("끝내는 갈래로 끝난 실행은 완료 뒤에 「IF {제목}의 「{갈래}」 갈래에서 끝냈다」 를 붙인다", () => {
    expect(endedBranchText(ended, flow)).toBe("IF 단가 확인의 「단가 없음」 갈래에서 끝냈다");
    expect(debugStatus(ended, 5, 0, flow)).toBe("완료 · 5단계 · 결과 변수 2개 · IF 단가 확인의 「단가 없음」 갈래에서 끝냈다");
    const through = run([nt(1, "start", "START"), nt(2, "r0", "RULE"), nt(3, "if1", "IF", { chosenEdgeId: "bo" }), nt(4, "n", "RULE"), nt(5, "end", "END")], { A: N("6"), Z: N("10") });
    expect(endedBranchText(through, flow)).toBeNull();
    expect(debugStatus(through, 5, 0, flow)).toBe("완료 · 5단계 · 결과 변수 2개");
    expect(endedBranchText({ ...ended, endedBy: "c1" }, flow)).toBeNull();
  });

  it("IF·갈래 label 이 비었거나 공백이면 「조건」·기본 갈래 이름으로 보인다", () => {
    const blank: RuleSetFlow = {
      ...flow,
      nodes: flow.nodes.map((x) => (x.id === "if1" ? { ...x, label: "  " } : x)),
      edges: flow.edges.map((x) => (x.id === "b1" ? { ...x, label: "" } : x)),
    };
    expect(endedBranchText(ended, blank)).toBe("IF 조건의 「갈래 1」 갈래에서 끝냈다");
  });

  describe("END 노드 상세", () => {
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
    });
    it("끝낸 갈래 문장을 보인다", async () => {
      await act(async () => {
        root.render(createElement(DmesUiProvider, null, createElement(TraceDetail, {
          nodeId: "end", node: ended.nodes[4], flow, traceViolations: [], onOpenRule: () => {}, endedBranch: endedBranchText(ended, flow),
        })));
      });
      await flush();
      expect(document.querySelector('[data-testid="sim-detail-ended-branch"]')!.textContent).toBe("IF 단가 확인의 「단가 없음」 갈래에서 끝냈다");
    });
  });
});
