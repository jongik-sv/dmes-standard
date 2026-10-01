// implicit-join spec §12.2·§14.4 — 편집기 옛 형식 변환(upgradeLegacyMerges·toEditFlowCounted)과,
// 코퍼스·퍼즈의 옛 형식 흐름 전부의 변환 전후 계산 동치(결정 A5 의 가장 강한 확인, 편차 F5 의 비교 규칙).
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type { FlowEdge, FlowNode, RuleSetFlow } from "../../../src/contract/engine-contract.generated";
import { TASK_LABEL, flowJsonOf, toEditFlow, toEditFlowCounted, upgradeLegacyMerges } from "../../../pages/dme/ruleSetEdit/flow-edit";
import { CATCHABLE, catchesOf, parseFlow, type Seq } from "../../../pages/dme/ruleSetEdit/flow-model";
import { flowChecks, flowDeps, flowIo } from "../../../pages/dme/ruleSetEdit/set-model";
import type { CondIo, IoName, IoSource, RuleIo, RuleSetCheck } from "../../../pages/dme/ruleSetEdit/types";
import { RULE_SET_CORPUS_PATH } from "../../helpers/engine-paths";

const N = (id: string, kind: FlowNode["kind"], over: Partial<FlowNode> = {}): FlowNode => ({ id, kind, ruleId: null, splitId: null, label: null, ...over });
const C = (id: string, attachTo: string, ...catches: string[]): FlowNode => ({ ...N(id, "CATCH"), attachTo, catches });
const E = (id: string, from: string, to: string, over: Partial<FlowEdge> = {}): FlowEdge => ({ id, from, to, order: null, cond: null, otherwise: false, label: null, ...over });
const raw = (nodes: FlowNode[], edges: FlowEdge[], view?: unknown) => ({ version: 1, nodes, edges, ...(view ? { view } : {}) }) as RuleSetFlow & { view?: unknown };
const edgesOf = (f: { edges?: FlowEdge[] | null }) => (f.edges ?? []).map((e) => `${e.id}:${e.from}>${e.to}`);

/** e2e 시드 E2S_FLOW — r1 → if1 [e3 → r2] [e4 그 외 → m1] → m1 → r3 → end. */
const E2S_FLOW = raw(
  [N("start", "START"), N("r1", "RULE", { ruleId: "E2S_GRD" }), N("if1", "IF"), N("r2", "RULE", { ruleId: "E2S_FCT" }), N("m1", "MERGE", { splitId: "if1" }),
    N("r3", "RULE", { ruleId: "E2S_SPD" }), N("end", "END")],
  [E("e1", "start", "r1"), E("e2", "r1", "if1"), E("e3", "if1", "r2", { order: 1, cond: 'S_GRD = "A"', label: "등급 A" }),
    E("e4", "if1", "m1", { otherwise: true, label: "그 외" }), E("e5", "r2", "m1"), E("e6", "m1", "r3"), E("e7", "r3", "end")],
);

describe("upgradeLegacyMerges(implicit-join spec §12.2)", () => {
  it("시드 E2S_FLOW 는 m1 이 빠지고 들어오던 선이 r3 로 간다(선 ID·칸 그대로, 노드 7 → 6)", () => {
    const { flow, upgraded } = toEditFlowCounted(E2S_FLOW, []);
    expect(upgraded).toBe(1);
    expect(flow.nodes.map((n) => n.id)).toEqual(["start", "r1", "if1", "r2", "r3", "end"]);
    expect(edgesOf(flow)).toEqual(["e1:start>r1", "e2:r1>if1", "e3:if1>r2", "e4:if1>r3", "e5:r2>r3", "e7:r3>end"]);
    expect(flow.edges.find((e) => e.id === "e4")).toMatchObject({ otherwise: true, label: "그 외" });
    expect(flow.edges.find((e) => e.id === "e3")).toMatchObject({ order: 1, cond: 'S_GRD = "A"', label: "등급 A" });
    expect(parseFlow(flow).issues).toEqual([]);
  });

  it("END 로 바로 나가는 합류는 빈 단계가 되고, 합류 연쇄면 END 앞 합류 하나만 빈 단계다(J-D10)", () => {
    // if1 [b1 → r1] [그 외 → m1], r1(c1 → h → mr) → mr(돌아오는 합류) → m1(IF 합류) → end
    const f = raw(
      [N("start", "START"), N("if1", "IF"), N("r1", "RULE", { ruleId: "A" }), C("c1", "r1", "NO_RESULT"), N("h", "RULE", { ruleId: "H" }),
        N("mr", "MERGE", { splitId: "r1" }), N("m1", "MERGE", { splitId: "if1" }), N("end", "END")],
      [E("e0", "start", "if1"), E("b1", "if1", "r1", { order: 1, cond: "X > 0" }), E("bo", "if1", "m1", { otherwise: true }), E("e1", "r1", "mr"),
        E("ec", "c1", "h"), E("eh", "h", "mr"), E("em", "mr", "m1"), E("ee", "m1", "end")],
      { positions: { m1: { x: 10, y: 20 }, mr: { x: 1, y: 2 } } },
    );
    const { flow, upgraded } = toEditFlowCounted(f, []);
    expect(upgraded).toBe(2);
    expect(flow.nodes.find((n) => n.id === "m1")).toMatchObject({ kind: "TASK", splitId: null, label: TASK_LABEL });
    expect(flow.nodes.some((n) => n.id === "mr")).toBe(false);
    expect(edgesOf(flow)).toEqual(["e0:start>if1", "b1:if1>r1", "bo:if1>m1", "e1:r1>m1", "ec:c1>h", "eh:h>m1", "ee:m1>end"]);
    expect(flow.view.positions).toEqual({});
    const s = parseFlow(flow).tree!.root.items[0];
    expect(s.type === "SPLIT" && s.joinId).toBe("m1");
    expect(s.type === "SPLIT" && s.branches.every((b) => !b.ends)).toBe(true);
  });

  it("빈 갈래가 여럿인 옛 IF(옛 insertSplit 모양)는 실행 순서 마지막 갈래만 빈 갈래로 두고 나머지에 빈 단계를 채운다(B2)", () => {
    const f = raw(
      [N("start", "START"), N("r1", "RULE", { ruleId: "A" }), N("if1", "IF"), N("m1", "MERGE", { splitId: "if1" }), N("r2", "RULE", { ruleId: "B" }), N("end", "END")],
      [E("e1", "start", "r1"), E("e2", "r1", "if1"), E("e3", "if1", "m1", { order: 1, label: "갈래 1" }), E("e4", "if1", "m1", { otherwise: true, label: "그 외" }),
        E("e5", "m1", "r2"), E("e6", "r2", "end")],
    );
    const { flow, upgraded } = toEditFlowCounted(f, []);
    expect(upgraded).toBe(1);
    expect(flow.nodes.map((n) => `${n.id}:${n.kind}`)).toEqual(["start:START", "r1:RULE", "if1:IF", "r3:TASK", "r2:RULE", "end:END"]);
    expect(flow.nodes.find((n) => n.id === "r3")!.label).toBe(TASK_LABEL);
    expect(edgesOf(flow)).toEqual(["e1:start>r1", "e2:r1>if1", "e3:if1>r3", "e5:r3>r2", "e4:if1>r2", "e6:r2>end"]);
  });

  it("병렬 합류와 짝이 맞지 않는 MERGE 는 그대로 둔다", () => {
    const f = raw(
      [N("start", "START"), N("p1", "PARALLEL"), N("a", "RULE", { ruleId: "A" }), N("b", "RULE", { ruleId: "B" }), N("pm", "MERGE", { splitId: "p1" }),
        N("zm", "MERGE", { splitId: "zz" }), N("end", "END")],
      [E("e0", "start", "p1"), E("pa", "p1", "a", { order: 1 }), E("pb", "p1", "b", { order: 2 }), E("ea", "a", "pm"), E("eb", "b", "pm"), E("ep", "pm", "zm"), E("ez", "zm", "end")],
    );
    const { flow, upgraded } = toEditFlowCounted(f, []);
    expect(upgraded).toBe(0);
    expect(flow.nodes.map((n) => n.id)).toEqual(["start", "p1", "a", "b", "pm", "zm", "end"]);
  });

  it("옮긴 선의 꺾는 점은 지우고 이름표 오프셋은 남기며, 지운 합류는 그룹·메모에서 빠진다", () => {
    const f = { ...E2S_FLOW, view: {
      positions: { m1: { x: 5, y: 5 } }, notes: [{ id: "n1", text: "합류", x: 0, y: 0, w: 10, h: 10, attach: "m1" }],
      groups: [{ id: "g1", title: "묶음", nodeIds: ["m1", "r3"] }, { id: "g2", title: "합류만", nodeIds: ["m1"] }],
      routes: { e4: [{ x: 1, y: 1 }], e5: [{ x: 2, y: 2 }], e6: [{ x: 3, y: 3 }] }, labels: { e4: { label: { dx: 5, dy: 5 } } },
    } };
    const v = toEditFlow(f, []).view;
    expect(v.routes).toEqual({});
    expect(v.labels).toEqual({ e4: { label: { dx: 5, dy: 5 } } });
    expect(v.groups).toEqual([{ id: "g1", title: "묶음", nodeIds: ["r3"] }]);
    expect(v.notes[0].attach).toBeNull();
    expect(v.positions).toEqual({});
  });

  it("같은 입력이면 같은 결과이고, 새 형식은 더 바뀌지 않는다(멱등)", () => {
    const once = toEditFlow(E2S_FLOW, []);
    expect(flowJsonOf(toEditFlow(E2S_FLOW, []))).toBe(flowJsonOf(once));
    const again = upgradeLegacyMerges(once);
    expect(again.upgraded).toBe(0);
    expect(flowJsonOf(again.flow)).toBe(flowJsonOf(once));
  });
});

// ── 코퍼스·퍼즈 동치 ──

interface CorpusCase {
  name: string;
  flow?: { version: number; nodes: Array<Partial<FlowNode> & { id: string; kind: FlowNode["kind"] }>; edges: Array<Partial<FlowEdge> & { id: string; from: string; to: string }> };
  condIo?: Record<string, { ok: boolean; message?: string | null; vars?: Array<{ name: string; source?: IoSource | null }> }>;
  rules?: Record<string, { exists?: boolean; status?: string | null; releasedVer?: number | null; hitPolicy?: string | null; hasDefault?: boolean;
    conds?: Array<{ name: string; source?: IoSource | null }>; results?: Array<{ name: string }> }>;
}

const ioName = (name: string, source: IoSource | null): IoName => ({ name, source, label: null, dataType: null, scale: null, dateString: false, maruCodeId: null });

function flowOf(f: NonNullable<CorpusCase["flow"]>): RuleSetFlow {
  return {
    version: f.version,
    nodes: f.nodes.map((n) => {
      const base: FlowNode = { id: n.id, kind: n.kind, ruleId: n.ruleId ?? null, splitId: n.splitId ?? null, label: n.label ?? null };
      return n.kind === "CATCH" ? { ...base, attachTo: n.attachTo ?? null, catches: n.catches ?? null } : base;
    }),
    edges: f.edges.map((e) => ({ id: e.id, from: e.from, to: e.to, order: e.order ?? null, cond: e.cond ?? null, otherwise: e.otherwise ?? false, label: e.label ?? null })),
  };
}

function rulesOf(c: CorpusCase): Record<string, RuleIo> {
  const out: Record<string, RuleIo> = {};
  for (const [id, r] of Object.entries(c.rules ?? {})) {
    out[id] = {
      ruleId: id, ruleName: null, ruleKind: null, status: r.status ?? null, exists: r.exists ?? false, releasedVer: r.releasedVer ?? null, hitPolicy: r.hitPolicy ?? null,
      conds: (r.conds ?? []).map((x) => ioName(x.name, x.source ?? null)), results: (r.results ?? []).map((x) => ioName(x.name, null)), hasDefault: r.hasDefault ?? false,
    };
  }
  return out;
}

function condIoOf(c: CorpusCase): Record<string, CondIo> {
  const out: Record<string, CondIo> = {};
  for (const [id, x] of Object.entries(c.condIo ?? {})) out[id] = { ok: x.ok, message: x.message ?? null, vars: (x.vars ?? []).map((v) => ioName(v.name, v.source ?? null)) };
  return out;
}

/** 옛 형식 — IF 를 가리키는 MERGE 또는 받는 노드가 붙은 노드를 가리키는 MERGE 가 있다. */
function hasLegacyMerge(f: RuleSetFlow): boolean {
  const kind = new Map((f.nodes ?? []).map((n) => [n.id, n.kind] as const));
  return (f.nodes ?? []).some((m) => m.kind === "MERGE" && m.splitId != null
    && (kind.get(m.splitId) === "IF" || (CATCHABLE.has(kind.get(m.splitId) ?? "START") && catchesOf(f, m.splitId).length > 0)));
}

const withoutEmpty = (cs: RuleSetCheck[]) => cs.filter((k) => k.code !== "EMPTY_TASK" && k.code !== "EMPTY");

/** 블록 트리의 끝내는 IF 갈래 선 ID(정렬). 퍼즈의 새 형식 IF 는 변환 전에도 끝내는 갈래를 가질 수 있다 — 변환이 더하거나 빼지 않는지만 본다(J-D10). */
function endingEdges(f: RuleSetFlow): string[] {
  const out: string[] = [];
  const walk = (s: Seq) => {
    for (const b of s.items) {
      if (b.type === "SEQ") walk(b);
      else if (b.type === "SPLIT") {
        for (const br of b.branches) {
          if (br.ends) out.push(br.edgeId);
          walk(br.body);
        }
      } else if (b.type === "GUARDED") {
        walk(b.normal);
        for (const h of b.handlers) walk(h.body);
      }
    }
  };
  walk(parseFlow(f).tree!.root);
  return out.sort();
}

describe("코퍼스·퍼즈 옛 형식 흐름의 변환 전후 io·deps·checks 동치(A5, 편차 F5)", () => {
  const files = [RULE_SET_CORPUS_PATH, path.join(path.dirname(RULE_SET_CORPUS_PATH), "rule-set-fuzz.json")];
  const legacy = files
    .flatMap((p) => (JSON.parse(fs.readFileSync(p, "utf8")) as { cases: CorpusCase[] }).cases)
    .filter((c) => c.flow && parseFlow(flowOf(c.flow)).issues.length === 0 && hasLegacyMerge(flowOf(c.flow)));

  it("옛 형식 흐름이 20개 이상이다", () => {
    expect(legacy.length).toBeGreaterThanOrEqual(20);
  });

  it.each(legacy.map((c) => [c.name, c] as const))("%s", (name, c) => {
    const before = flowOf(c.flow!);
    const after = toEditFlow(before, []);
    const rules = rulesOf(c);
    const condIo = condIoOf(c);
    expect(parseFlow(after).issues, `${name} 변환 뒤 구조`).toEqual([]);
    expect(hasLegacyMerge(after), `${name} 옛 합류가 남지 않는다`).toBe(false);
    expect(endingEdges(after), `${name} 변환은 끝내는 갈래를 더하거나 빼지 않는다(J-D10)`).toEqual(endingEdges(before));
    expect(flowIo(after, rules), `${name} io`).toEqual(flowIo(before, rules));
    expect(flowDeps(after, rules), `${name} deps`).toEqual(flowDeps(before, rules));
    const a = flowChecks(before, rules, condIo);
    const b = flowChecks(after, rules, condIo);
    expect(withoutEmpty(b), `${name} checks`).toEqual(withoutEmpty(a));
    if (b.some((k) => k.code === "EMPTY")) expect(a.some((k) => k.code === "EMPTY"), `${name} EMPTY 는 사라지기만 한다`).toBe(true);
    if (a.some((k) => k.code === "EMPTY_TASK")) expect(b.some((k) => k.code === "EMPTY_TASK"), `${name} EMPTY_TASK 는 남는다`).toBe(true);
  });
});
