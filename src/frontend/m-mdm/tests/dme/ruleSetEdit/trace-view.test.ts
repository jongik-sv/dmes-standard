// 2단계 계획 P9 — 기록 해석(trace-view.ts). Task 4 골든(mdm/api test resources)을 사본 없이 경로로 읽는다.
// 골든의 trace 는 서버 execute 응답 그대로(엔진 RunTrace 스키마)이고, flowJson 은 P2 정규 JSON 문자열이다.
import { describe, expect, it } from "vitest";

import type { FlowNodeKind, NodeTrace, RuleSetFlow, RunTrace, TypedValue } from "../../../src/contract/engine-contract.generated";
import { frames, overlayAt, typedText, valueTable } from "../../../pages/dme/ruleSetEdit/trace-view";
import { golden, goldenCases } from "../helpers/rule-set-golden";

const CASE_NAMES = ["IF_FIRST_TRUE", "IF_NULL_ELSE", "IF_ERROR_STOPS", "PARALLEL_MERGE", "IF_IN_PARALLEL", "STRUCTURE_ERROR", "MISSING_INPUT"];

const S = (value: string): TypedValue => ({ type: "STRING", value });
const N = (value: string): TypedValue => ({ type: "NUMBER", value });
const NULL: TypedValue = { type: "NULL" };

describe("trace-view(골든)", () => {
  it("골든 사례 7개가 계획 순서대로 있다", () => {
    expect(goldenCases.map((c) => c.name)).toEqual(CASE_NAMES);
  });

  it("IF_FIRST_TRUE — 고른 선은 chosen, 안 탄 갈래는 끝에서 dim", () => {
    const { flow, trace } = golden("IF_FIRST_TRUE");
    const last = trace.nodes.length - 1;
    const o = overlayAt(trace, flow, last);
    expect(o.edges.e3).toBe("chosen");
    expect(o.edges.e4).toBe("dim");
    expect(o.nodes.r3.state).toBe("dim");
    expect(o.nodes[trace.nodes[last].nodeId].state).toBe("current");
    const mid = overlayAt(trace, flow, 1);
    expect(mid.nodes.r3.state).toBe("pending");
  });

  it("IF_FIRST_TRUE — 단계별 노드·선 상태, seq, 결과 칩", () => {
    const { flow, trace } = golden("IF_FIRST_TRUE");
    const mid = overlayAt(trace, flow, 1);
    expect(mid.nodes.start).toEqual({ state: "run", seq: 1, chip: null });
    expect(mid.nodes.r1).toEqual({ state: "current", seq: 2, chip: "GT_G=A" });
    expect(mid.nodes.if1).toEqual({ state: "pending", seq: null, chip: null });
    expect(mid.edges).toEqual({ e1: "run", e2: "idle", e3: "idle", e4: "idle", e5: "idle", e6: "idle", e7: "idle" });

    const atIf = overlayAt(trace, flow, 2);
    expect(atIf.nodes.if1.state).toBe("current");
    expect(atIf.edges.e2).toBe("run");
    expect(atIf.edges.e3).toBe("chosen");
    expect(atIf.edges.e4).toBe("dim");
    expect(atIf.edges.e5).toBe("idle");

    const o = overlayAt(trace, flow, trace.nodes.length - 1);
    expect(o.nodes.r2).toEqual({ state: "run", seq: 4, chip: "GT_F=1" });
    expect(o.edges).toEqual({ e1: "run", e2: "run", e3: "chosen", e4: "dim", e5: "run", e6: "dim", e7: "run" });
  });

  it("IF_NULL_ELSE — NULL 갈래는 거짓, 그 외 선이 chosen", () => {
    const { flow, trace } = golden("IF_NULL_ELSE");
    const o = overlayAt(trace, flow, trace.nodes.length - 1);
    expect(o.edges.e4).toBe("chosen");
    expect(o.edges.e3).toBe("dim");
    expect(o.nodes.r2.state).toBe("dim");
    expect(o.nodes.r3).toEqual({ state: "run", seq: 4, chip: "GT_S=5" });
  });

  it("IF_ERROR_STOPS — 오류 노드는 error, 칩은 위반 코드", () => {
    const { flow, trace } = golden("IF_ERROR_STOPS");
    const k = trace.nodes.length - 1;
    expect(overlayAt(trace, flow, k).nodes.if1).toEqual({ state: "error", seq: trace.nodes[k].seq, chip: "BRANCH_EVAL_ERROR" });
  });

  it("IF_ERROR_STOPS — 고른 갈래가 없는 오류 IF 의 나가는 선은 모두 dim, 뒤 노드도 dim", () => {
    const { flow, trace } = golden("IF_ERROR_STOPS");
    const o = overlayAt(trace, flow, trace.nodes.length - 1);
    expect(o.edges).toEqual({ e1: "run", e2: "run", e3: "dim", e5: "dim", e4: "dim", e6: "dim", e7: "dim", e8: "dim" });
    expect(["r2", "r3", "m1", "end"].map((id) => o.nodes[id].state)).toEqual(["dim", "dim", "dim", "dim"]);
    // 오류 프레임의 ctx 는 오류 직전 그대로다(값이 생기지 않는다).
    const fr = frames(trace, flow);
    expect(fr[fr.length - 1].ctx).toEqual({ GT_THK: S("12"), GT_G: S("A") });
    expect(fr[fr.length - 1].changed).toEqual([]);
  });

  it("PARALLEL_MERGE — 둘째 갈래 단계에 첫 갈래 값이 보이지 않고, 합류에서 뒤 갈래가 이긴다", () => {
    const { flow, trace } = golden("PARALLEL_MERGE");
    const fr = frames(trace, flow);
    const rs2 = fr.find((x) => x.node.nodeId === "rs2")!;
    expect(rs2.ctx.GT_F).toBeUndefined(); // 첫 갈래(r2)의 결과가 둘째 갈래 범위에 없다
    expect(rs2.ctx.GT_V).toEqual({ type: "STRING", value: "two" });
    const merge = fr.find((x) => x.node.nodeId === "m1")!;
    expect(merge.ctx.GT_V).toEqual({ type: "STRING", value: "two" });
    expect(merge.ctx.GT_F).toEqual({ type: "NUMBER", value: "1" });
    const t = valueTable(trace, flow);
    expect(t.vars.slice(0, 2)).toEqual(["GT_THK", "GT_KIND"]);
    expect(t.cols.map((c) => c.label)).toEqual(["GT_GRADE", "GT_FAST", "GT_SAME1", "GT_SLOW", "GT_SAME2", "합류 m1"]);
  });

  it("PARALLEL_MERGE — 프레임마다 그 단계의 ctx 사본을 갖는다", () => {
    const { flow, trace } = golden("PARALLEL_MERGE");
    const fr = frames(trace, flow);
    expect(fr.map((f) => f.index)).toEqual(trace.nodes.map((_, i) => i));
    const at = (id: string) => fr.find((x) => x.node.nodeId === id)!;
    expect(at("start").ctx).toEqual({ GT_THK: S("12"), GT_KIND: S("x") });
    expect(at("r1").ctx).toEqual({ GT_THK: S("12"), GT_KIND: S("x"), GT_G: S("A") });
    expect(at("par1").ctx).toEqual(at("r1").ctx);
    expect(at("r2").ctx).toEqual({ GT_THK: S("12"), GT_KIND: S("x"), GT_G: S("A"), GT_F: N("1") });
    expect(at("rs1").ctx.GT_V).toEqual(S("one"));
    expect(at("r3").ctx).toEqual({ GT_THK: S("12"), GT_KIND: S("x"), GT_G: S("A"), GT_S: N("5") });
    expect(at("m1").ctx).toEqual({ GT_THK: S("12"), GT_KIND: S("x"), GT_G: S("A"), GT_F: N("1"), GT_V: S("two"), GT_S: N("5") });
    expect(at("end").ctx).toEqual(at("m1").ctx);
    expect(at("r1").changed).toEqual(["GT_G"]);
    expect(at("rs2").changed).toEqual(["GT_V"]);
    expect(at("m1").changed).toEqual(["GT_F", "GT_V", "GT_S"]);
    expect(at("start").changed).toEqual([]);
    expect(at("par1").changed).toEqual([]);
  });

  it("PARALLEL_MERGE — 값 표 칸과 바뀜 표시", () => {
    const { flow, trace } = golden("PARALLEL_MERGE");
    const t = valueTable(trace, flow);
    expect(t.vars).toEqual(["GT_THK", "GT_KIND", "GT_G", "GT_F", "GT_V", "GT_S"]);
    expect(t.cols).toEqual([
      { index: 1, nodeId: "r1", label: "GT_GRADE" },
      { index: 3, nodeId: "r2", label: "GT_FAST" },
      { index: 4, nodeId: "rs1", label: "GT_SAME1" },
      { index: 5, nodeId: "r3", label: "GT_SLOW" },
      { index: 6, nodeId: "rs2", label: "GT_SAME2" },
      { index: 7, nodeId: "m1", label: "합류 m1" },
    ]);
    const row = (name: string) => t.cells[t.vars.indexOf(name)];
    const chg = (name: string) => t.changed[t.vars.indexOf(name)];
    expect(row("GT_THK")).toEqual([S("12"), S("12"), S("12"), S("12"), S("12"), S("12")]);
    expect(chg("GT_THK")).toEqual([false, false, false, false, false, false]);
    expect(row("GT_G")).toEqual([S("A"), S("A"), S("A"), S("A"), S("A"), S("A")]);
    expect(chg("GT_G")).toEqual([true, false, false, false, false, false]);
    expect(row("GT_V")).toEqual([null, null, S("one"), null, S("two"), S("two")]);
    expect(chg("GT_V")).toEqual([false, false, true, true, true, false]);
    expect(row("GT_F")).toEqual([null, N("1"), N("1"), null, null, N("1")]);
    expect(chg("GT_F")).toEqual([false, true, false, true, false, true]);
    expect(row("GT_S")).toEqual([null, null, null, N("5"), N("5"), N("5")]);
  });

  it("IF_IN_PARALLEL — IF 는 범위를 만들지 않고, 안쪽 합류는 병렬 갈래 범위에 있다", () => {
    const { flow, trace } = golden("IF_IN_PARALLEL");
    const fr = frames(trace, flow);
    const at = (id: string) => fr.find((x) => x.node.nodeId === id)!;
    expect(at("m2").ctx.GT_F).toEqual(N("1"));
    expect(at("m2").changed).toEqual([]);
    expect(at("rs1").ctx.GT_F).toBeUndefined();
    expect(at("rs1").ctx.GT_V).toEqual(S("one"));
    expect(at("m1").ctx).toEqual({ GT_THK: S("12"), GT_KIND: S("x"), GT_G: S("A"), GT_F: N("1"), GT_V: S("one") });
    expect(valueTable(trace, flow).cols.map((c) => c.label)).toEqual(["GT_GRADE", "GT_FAST", "GT_SAME1", "합류 m1"]);
    const o = overlayAt(trace, flow, trace.nodes.length - 1);
    expect(o.edges).toEqual({
      e1: "run", e2: "run", p1: "run", e3: "chosen", e4: "dim", e5: "run", e6: "dim", e7: "run", p2: "run", e8: "run", e9: "run",
    });
    expect(o.nodes.r3.state).toBe("dim");
  });

  it("STRUCTURE_ERROR·MISSING_INPUT — 기록이 비면 모든 노드 pending", () => {
    for (const name of ["STRUCTURE_ERROR", "MISSING_INPUT"]) {
      const { flow, trace } = golden(name);
      expect(frames(trace, flow)).toEqual([]);
      const o = overlayAt(trace, flow, 0);
      expect(Object.keys(o.nodes)).toEqual(flow.nodes.map((n) => n.id));
      expect(Object.values(o.nodes).every((n) => n.state === "pending")).toBe(true);
      expect(Object.keys(o.edges)).toEqual(flow.edges.map((e) => e.id));
      expect(Object.values(o.edges).every((s) => s === "idle")).toBe(true);
      const t = valueTable(trace, flow);
      expect(t.cols).toEqual([]);
      expect(t.cells.every((r) => r.length === 0)).toBe(true);
    }
  });

  it("모든 사례 — 룰이 읽은 값은 그 단계 직전 범위 ctx 와 같고, finalValues 는 끝 프레임 ctx 에 있다", () => {
    for (const name of CASE_NAMES) {
      const { flow, trace } = golden(name);
      const fr = frames(trace, flow);
      expect(fr.length, name).toBe(trace.nodes.length);
      for (const f of fr) {
        if (f.node.kind !== "RULE" || !f.node.reads) continue;
        const before = scopeBefore(fr, f.index, flow);
        for (const [k, v] of Object.entries(f.node.reads)) expect(before[k] ?? NULL, `${name} ${f.node.nodeId} ${k}`).toEqual(v);
      }
      if (fr.length > 0 && fr[fr.length - 1].node.status === "OK") {
        const lastCtx = fr[fr.length - 1].ctx;
        for (const [k, v] of Object.entries(trace.finalValues)) expect(lastCtx[k], `${name} final ${k}`).toEqual(v);
      }
    }
  });

  it("병렬 합류 이름 = 기록의 merged(순서 무시)", () => {
    for (const name of ["PARALLEL_MERGE", "IF_IN_PARALLEL"]) {
      const { flow, trace } = golden(name);
      const m = frames(trace, flow).find((f) => f.node.kind === "MERGE" && f.node.merged != null)!;
      // 합류에서 바뀐 이름은 merged 의 부분집합이고, merged 의 이름은 모두 합류 ctx 에 있다.
      for (const n of m.changed) expect(m.node.merged).toContain(n);
      for (const n of m.node.merged!) expect(m.ctx[n], `${name} ${n}`).toBeDefined();
    }
  });
});

/** f 직전 같은 범위의 ctx — 같은 범위의 앞 프레임을 찾는다(골든 흐름에서는 바로 앞 프레임이거나 갈래 첫 노드면 분기 프레임). */
function scopeBefore(fr: ReturnType<typeof frames>, index: number, flow: RuleSetFlow): Record<string, TypedValue> {
  const prev = fr[index - 1];
  const edge = flow.edges.find((e) => e.to === fr[index].node.nodeId);
  // 병렬 갈래의 첫 노드면 분기 프레임의 ctx(분기 직전 값 사본)가 기준이다.
  if (edge) {
    const from = fr.find((f) => f.node.nodeId === edge.from);
    if (from && from.node.kind === "PARALLEL") return from.ctx;
  }
  return prev.ctx;
}

// ── 손으로 만든 기록 ──────────────────────────────────────────────────────────

const node = (seq: number, nodeId: string, kind: FlowNodeKind, extra: Partial<NodeTrace> = {}): NodeTrace => ({
  seq, nodeId, kind, status: "OK", ruleId: null, ver: null, reads: null, branches: null, chosenEdgeId: null, order: null,
  splitId: null, merged: null, violations: null, ...extra,
});
const ruleNode = (seq: number, nodeId: string, ruleId: string, results: Record<string, TypedValue>): NodeTrace =>
  node(seq, nodeId, "RULE", {
    ruleId, ver: 1, reads: {},
    result: { ruleId, ver: 1, evalTs: "2026-06-01T09:00:00", hits: [], defaultApplied: false, results, trace: [], warnings: [] },
  });
const fnode = (id: string, kind: FlowNodeKind, extra: { ruleId?: string; splitId?: string } = {}) =>
  ({ id, kind, ruleId: extra.ruleId ?? null, splitId: extra.splitId ?? null, label: null });
const fedge = (id: string, from: string, to: string, order: number | null = null) =>
  ({ id, from, to, order, cond: null, otherwise: false, label: null });

/** start → r0 → par1 ─(p1: ra)─(p2: rb)→ m1 → end */
const parFlow: RuleSetFlow = {
  version: 1,
  nodes: [fnode("start", "START"), fnode("r0", "RULE", { ruleId: "R0" }), fnode("par1", "PARALLEL"), fnode("ra", "RULE", { ruleId: "RA" }),
    fnode("rb", "RULE", { ruleId: "RB" }), fnode("m1", "MERGE", { splitId: "par1" }), fnode("end", "END")],
  edges: [fedge("e1", "start", "r0"), fedge("e2", "r0", "par1"), fedge("p1", "par1", "ra", 1), fedge("p2", "par1", "rb", 2),
    fedge("e3", "ra", "m1"), fedge("e4", "rb", "m1"), fedge("e5", "m1", "end")],
};

describe("trace-view(손 기록)", () => {
  it("병렬 합류는 갈래가 쓴 이름만 덮어쓴다 — 뒤 갈래가 안 건드린 이름을 분기 전 값으로 되돌리지 않는다(엔진 FlowRun)", () => {
    const trace: RunTrace = {
      setId: "(저장 전)", evalTs: "2026-06-01T09:00:00", input: { X: N("0") }, violations: null,
      finalValues: { X: N("2"), Y: N("3") },
      nodes: [
        node(1, "start", "START"),
        ruleNode(2, "r0", "R0", { X: N("1") }),
        node(3, "par1", "PARALLEL", { order: ["p1", "p2"] }),
        ruleNode(4, "ra", "RA", { X: N("2") }),
        ruleNode(5, "rb", "RB", { Y: N("3") }),
        node(6, "m1", "MERGE", { splitId: "par1", merged: ["X", "Y"] }),
        node(7, "end", "END"),
      ],
    };
    const fr = frames(trace, parFlow);
    expect(fr[4].ctx).toEqual({ X: N("1"), Y: N("3") }); // rb 갈래는 분기 전 X=1 사본
    expect(fr[5].ctx).toEqual({ X: N("2"), Y: N("3") });
    expect(fr[5].changed).toEqual(["X", "Y"]);
  });

  it("병렬 갈래는 기록의 order(실행 순서)대로 합친다", () => {
    const trace: RunTrace = {
      setId: "(저장 전)", evalTs: "2026-06-01T09:00:00", input: {}, violations: null, finalValues: { V: S("a") },
      nodes: [
        node(1, "start", "START"),
        ruleNode(2, "r0", "R0", {}),
        node(3, "par1", "PARALLEL", { order: ["p2", "p1"] }),
        ruleNode(4, "rb", "RB", { V: S("b") }),
        ruleNode(5, "ra", "RA", { V: S("a") }),
        node(6, "m1", "MERGE", { splitId: "par1", merged: ["V"] }),
        node(7, "end", "END"),
      ],
    };
    const fr = frames(trace, parFlow);
    expect(fr[4].ctx).toEqual({ V: S("a") });
    expect(fr[5].ctx).toEqual({ V: S("a") });
  });

  it("NUMBER 는 값으로 견준다 — 1.10 을 1.1 로 덮어써도 바뀜이 아니다", () => {
    const trace: RunTrace = {
      setId: "(저장 전)", evalTs: "2026-06-01T09:00:00", input: { X: N("1.1") }, violations: null, finalValues: {},
      nodes: [node(1, "start", "START"), ruleNode(2, "r0", "R0", { X: N("1.10"), L: { type: "LIST", items: [N("1")] } })],
    };
    const fr = frames(trace, parFlow);
    expect(fr[1].changed).toEqual(["L"]);
    const t = valueTable(trace, parFlow);
    expect(t.vars).toEqual(["X", "L"]);
    expect(t.changed).toEqual([[false], [true]]);
    expect(overlayAt(trace, parFlow, 1).nodes.r0.chip).toBe("X=1.10");
  });

  it("값 비교와 글자", () => {
    expect(typedText({ type: "NULL" })).toBe("NULL");
    expect(typedText(undefined)).toBe("NULL");
    expect(typedText(null)).toBe("NULL");
    expect(typedText({ type: "BOOLEAN", value: "true" })).toBe("true");
    expect(typedText({ type: "LIST", items: [{ type: "NUMBER", value: "1.10" }, { type: "STRING", value: "a" }] })).toBe("[1.10, a]");
  });
});
