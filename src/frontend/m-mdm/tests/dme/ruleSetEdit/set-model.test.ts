// TSK-08-06 design §6.2·§6.3·§6.9·I10·I11 — 화면 즉시 계산 `set-model.ts`. Java `RuleSetAnalyzerTest` 의 핵심 사례(세 룰 고리·PROG·중복 대입·빈 목록)와
// 화면 전용 `condMarks`(조건 변수 칩 강조)·`laterDeps`(뒤에 있음). 두 구현의 문구·순서 동치 전체는 `rule-set-corpus.test.ts` 가 본다.
import { describe, expect, it } from "vitest";

import type { FlowEdge, FlowNode, FlowNodeKind, RuleSetFlow } from "../../../src/contract/engine-contract.generated";
import { condMarks, flowChecks, flowIo, isFinalResult, laterDeps, setChecks, setDeps, setIo } from "../../../pages/dme/ruleSetEdit/set-model";
import type { CondIo, IoName, IoSource, RuleIo, RuleSetCheck } from "../../../pages/dme/ruleSetEdit/types";

const n = (name: string, source: IoSource | null = null, extra: Partial<IoName> = {}): IoName => ({
  name,
  source,
  label: null,
  dataType: null,
  scale: null,
  dateString: false,
  maruCodeId: null,
  ...extra,
});

function rule(ruleId: string, conds: IoName[], results: IoName[], over: Partial<RuleIo> = {}): RuleIo {
  return {
    ruleId,
    ruleName: null,
    ruleKind: "DERIVE",
    status: "INUSE",
    exists: true,
    releasedVer: 1,
    hitPolicy: null,
    conds,
    results,
    ...over,
  };
}

const byId = (...rs: RuleIo[]): Record<string, RuleIo> => Object.fromEntries(rs.map((r) => [r.ruleId, r]));

describe("setChecks — 저장 시 검사(§6.3)", () => {
  it("세 룰 고리는 직접 의존이 아니어도 이행적으로 CYCLE 하나다", () => {
    // A 가 C 결과를 읽고, C 는 B 결과를, B 는 A 결과를 읽는다 → C→B→A 로 A 에 닿는다.
    const rules = byId(
      rule("A", [n("S_C", "NONE")], [n("S_A")]),
      rule("B", [n("S_A", "NONE")], [n("S_B")]),
      rule("C", [n("S_B", "NONE")], [n("S_C")]),
    );
    expect(setChecks(["A", "B", "C"], rules)).toStrictEqual([
      {
        code: "CYCLE",
        severity: "REJECT",
        ruleId: "A",
        otherRuleId: "C",
        varName: "S_C",
        message: "A와 C가 서로의 결과 변수를 읽는다(순환). 순서를 바꿔서는 풀리지 않는다",
        nodeId: null,
        edgeId: null,
      },
    ]);
  });

  it("뒤 룰이 만드는 이름을 앞 룰이 읽으면 ORDER 이고 문구에 뒤 생산자를 모두 적는다", () => {
    const rules = byId(
      rule("A", [n("S_X", "NONE")], [n("S_A")]),
      rule("B", [], [n("S_X")]),
      rule("C", [], [n("S_X")]),
    );
    expect(setChecks(["A", "B", "C"], rules)).toStrictEqual([
      {
        code: "ORDER",
        severity: "REJECT",
        ruleId: "A",
        otherRuleId: "B",
        varName: "S_X",
        message: "A가 뒤에 도는 B, C의 결과 변수 S_X를 읽는다. B를 A 앞으로 옮긴다",
        nodeId: null,
        edgeId: null,
      },
      {
        code: "DUP_RESULT",
        severity: "WARN",
        ruleId: "C",
        otherRuleId: "B",
        varName: "S_X",
        message: "B와 C가 같은 결과 변수 S_X에 대입한다",
        nodeId: null,
        edgeId: null,
      },
    ]);
  });

  it("프로그램 변수(PROG)는 아무도 만들지 않으면 통과하고, 뒤 룰이 만들면 ORDER 다", () => {
    const alone = byId(rule("A", [n("P_IN", "PROG")], [n("S_A")]));
    expect(setChecks(["A"], alone)).toStrictEqual([]);

    const later = byId(rule("A", [n("P_IN", "PROG")], [n("S_A")]), rule("B", [], [n("P_IN")]));
    expect(setChecks(["A", "B"], later).map((c) => [c.code, c.ruleId, c.otherRuleId, c.varName])).toEqual([["ORDER", "A", "B", "P_IN"]]);
  });

  it("NONE 이고 세트 안에서 아무도 만들지 않으면 UNKNOWN_INPUT, DICT 는 통과한다", () => {
    const rules = byId(rule("A", [n("COL", "DICT"), n("S_Q", "NONE")], [n("S_A")]));
    expect(setChecks(["A"], rules)).toStrictEqual([
      {
        code: "UNKNOWN_INPUT",
        severity: "REJECT",
        ruleId: "A",
        otherRuleId: null,
        varName: "S_Q",
        message: "A의 조건 변수 S_Q는 컬럼 사전에 없고 세트 안의 어느 룰도 만들지 않는다",
        nodeId: null,
        edgeId: null,
      },
    ]);
  });

  it("세 번 대입하면 경고가 두 건이고 상대는 바로 앞 생산자다", () => {
    const rules = byId(rule("A", [], [n("R")]), rule("B", [], [n("R")]), rule("C", [], [n("R")]));
    expect(setChecks(["A", "B", "C"], rules).map((c) => [c.code, c.severity, c.otherRuleId, c.ruleId, c.message])).toEqual([
      ["DUP_RESULT", "WARN", "A", "B", "A와 B가 같은 결과 변수 R에 대입한다"],
      ["DUP_RESULT", "WARN", "B", "C", "B와 C가 같은 결과 변수 R에 대입한다"],
    ]);
  });

  it("빈 목록은 EMPTY 하나뿐이다", () => {
    expect(setChecks([], {})).toStrictEqual([
      { code: "EMPTY", severity: "REJECT", ruleId: null, otherRuleId: null, varName: null, message: "룰이 하나도 없다", nodeId: null, edgeId: null },
    ]);
  });

  it("1단계(없음·DEPRECATED·RELEASED 없음)가 먼저 나오고 그다음 2단계다", () => {
    const rules = byId(
      rule("A", [n("S_Q", "NONE")], []),
      rule("D", [], [], { status: "DEPRECATED" }),
      rule("G", [], [], { exists: false, conds: null, results: null }),
      rule("R", [], [], { releasedVer: null }),
    );
    expect(setChecks(["A", "M", "D", "G", "R"], rules).map((c) => [c.code, c.severity, c.ruleId, c.message])).toEqual([
      ["RULE_NOT_FOUND", "REJECT", "M", "M는 없는 룰이다"],
      ["RULE_DEPRECATED", "REJECT", "D", "D는 DEPRECATED다"],
      ["RULE_NOT_FOUND", "REJECT", "G", "G는 없는 룰이다"],
      ["NO_RELEASED", "WARN", "R", "R는 RELEASED 버전이 없어 입출력을 계산하지 않았다. 이대로 부르면 판정 오류다"],
      ["UNKNOWN_INPUT", "REJECT", "A", "A의 조건 변수 S_Q는 컬럼 사전에 없고 세트 안의 어느 룰도 만들지 않는다"],
    ]);
  });
});

describe("setIo — 세트 입출력 표(§6.2, I10)", () => {
  it("앞 룰이 만든 이름만 readers 이고, 뒤 룰이 만드는 이름을 앞 룰이 읽으면 입력으로 잡힌다", () => {
    const rules = byId(
      rule("A", [n("COL", "DICT", { label: "컬럼", dataType: "NUMBER", scale: 2 }), n("S_B", "NONE")], [n("S_A", null, { dataType: "STRING" })]),
      rule("B", [n("S_A", "NONE"), n("COL", "DICT")], [n("S_B")]),
      rule("C", [n("S_A", "NONE")], [n("S_C")]),
    );
    const io = setIo(["A", "B", "C"], rules);
    expect(io.inputs).toStrictEqual([
      { name: "COL", label: "컬럼", dataType: "NUMBER", scale: 2, dateString: false, maruCodeId: null, source: "DICT", users: ["A", "B"] },
      { name: "S_B", label: null, dataType: null, scale: null, dateString: false, maruCodeId: null, source: "NONE", users: ["A"] },
    ]);
    expect(io.results).toStrictEqual([
      { name: "S_A", dataType: "STRING", scale: null, dateString: false, maruCodeId: null, by: ["A"], readers: ["B", "C"] },
      { name: "S_B", dataType: null, scale: null, dateString: false, maruCodeId: null, by: ["B"], readers: [] },
      { name: "S_C", dataType: null, scale: null, dateString: false, maruCodeId: null, by: ["C"], readers: [] },
    ]);
    // 최종 = 뒤에서 아무도 읽지 않는 결과, 그 밖은 중간.
    expect(io.results.map(isFinalResult)).toEqual([false, true, true]);
  });

  it("빈 목록은 빈 표다", () => {
    expect(setIo([], {})).toStrictEqual({ inputs: [], results: [] });
  });
});

describe("setDeps·laterDeps — 의존 룰·뒤에 있음(I11)", () => {
  it("의존은 DICT 가 아닌 조건 이름을 만드는 다른 룰(목록 순)이고 DICT 이름은 빠진다", () => {
    const rules = byId(
      rule("P", [], [n("S_P")]),
      rule("Q", [n("COL", "DICT"), n("S_R", "NONE"), n("S_P", "NONE")], [n("S_Q")]),
      rule("R", [n("S_Q", "PROG")], [n("S_R"), n("S_Q")]),
      // K 는 Q 가 DICT 로 읽는 이름만 만든다 → Q 의 의존이 아니다.
      rule("K", [], [n("COL")]),
    );
    expect(Object.entries(setDeps(["P", "Q", "R", "K"], rules))).toEqual([
      ["P", []],
      ["Q", ["P", "R"]],
      ["R", ["Q"]],
      ["K", []],
    ]);
  });

  it("뒤에 있음은 목록에서 자기보다 뒤에 있는 의존만이다(앞의 의존은 빠진다)", () => {
    const deps = { P: [], Q: ["P", "R"], R: ["Q"] };
    expect(laterDeps(["P", "Q", "R"], deps)).toEqual({ P: [], Q: ["R"], R: [] });
    expect(laterDeps(["R", "Q", "P"], deps)).toEqual({ R: ["Q"], Q: ["P"], P: [] });
  });
});

describe("condMarks — 조건 변수 칩(§6.9, 시안 H:2196)", () => {
  it("DICT 와 앞에서 아직 안 만든 PROG 는 보통 칩, 그 밖은 붉은 칩이고 앞에서 안 만든 것에만 '앞에 없음'", () => {
    const rules = byId(
      rule("P", [], [n("S_P"), n("PV2")]),
      rule("Q", [n("COL", "DICT"), n("S_P", "NONE"), n("S_R", "NONE"), n("PV", "PROG"), n("PV2", "PROG")], [n("S_Q")]),
      rule("R", [], [n("S_R")]),
    );
    expect(condMarks(["P", "Q", "R", "X"], rules)).toStrictEqual([
      [],
      [
        { name: "COL", source: "DICT", red: false, missingBefore: false },
        { name: "S_P", source: "NONE", red: true, missingBefore: false },
        { name: "S_R", source: "NONE", red: true, missingBefore: true },
        { name: "PV", source: "PROG", red: false, missingBefore: false },
        { name: "PV2", source: "PROG", red: true, missingBefore: false },
      ],
      [],
      [],
    ]);
  });
});
describe("flowChecks — 흐름 기준 검사(계획 C4)", () => {
  const fn = (id: string, kind: FlowNodeKind, over: Partial<FlowNode> = {}): FlowNode => ({ id, kind, ruleId: null, splitId: null, label: null, ...over });
  const fe = (id: string, from: string, to: string, over: Partial<FlowEdge> = {}): FlowEdge => ({
    id,
    from,
    to,
    order: null,
    cond: null,
    otherwise: false,
    label: null,
    ...over,
  });
  const dictA: Record<string, CondIo> = { e2: { ok: true, message: null, vars: [n("A", "DICT")] } };

  /** start → if1 { e2(1, A = 1): r1(R1) ; e3(그 외): r2(R2) } m1 → [rz(RZ)] → end */
  function ifFlow(withTail: boolean, r2Rule = "R2"): RuleSetFlow {
    const nodes = [
      fn("start", "START"),
      fn("if1", "IF"),
      fn("r1", "RULE", { ruleId: "R1" }),
      fn("r2", "RULE", { ruleId: r2Rule }),
      fn("m1", "MERGE", { splitId: "if1" }),
      ...(withTail ? [fn("rz", "RULE", { ruleId: "RZ" })] : []),
      fn("end", "END"),
    ];
    const edges = [
      fe("e1", "start", "if1"),
      fe("e2", "if1", "r1", { order: 1, cond: "A = 1" }),
      fe("e3", "if1", "r2", { otherwise: true }),
      fe("e4", "r1", "m1"),
      fe("e5", "r2", "m1"),
      ...(withTail ? [fe("e6", "m1", "rz"), fe("e7", "rz", "end")] : [fe("e6", "m1", "end")]),
    ];
    return { version: 1, nodes, edges };
  }

  /** start → p1 { ea(1): ra(RA) ; eb(2): rb(RB) } m1 → end */
  const parFlow: RuleSetFlow = {
    version: 1,
    nodes: [fn("start", "START"), fn("p1", "PARALLEL"), fn("ra", "RULE", { ruleId: "RA" }), fn("rb", "RULE", { ruleId: "RB" }), fn("m1", "MERGE", { splitId: "p1" }), fn("end", "END")],
    edges: [fe("e1", "start", "p1"), fe("ea", "p1", "ra", { order: 1 }), fe("eb", "p1", "rb", { order: 2 }), fe("e4", "ra", "m1"), fe("e5", "rb", "m1"), fe("e6", "m1", "end")],
  };

  it("IF 두 갈래가 같은 결과를 쓰는 것은 정상이고, 한 갈래에서만 만든 값을 합류 뒤에서 읽으면 FLOW_PARTIAL 경고", () => {
    const rules = byId(rule("R1", [n("A", "DICT")], [n("X")]), rule("R2", [n("A", "DICT")], [n("X"), n("Y")]), rule("RZ", [n("Y", "NONE")], [n("Z")]));
    expect(flowChecks(ifFlow(true), rules, dictA)).toStrictEqual([
      {
        code: "FLOW_PARTIAL",
        severity: "WARN",
        ruleId: "RZ",
        otherRuleId: null,
        varName: "Y",
        message: "RZ가 읽는 Y는 IF 의 일부 갈래에서만 만들어진다. 다른 갈래를 타면 판정 오류다",
        nodeId: "rz",
        edgeId: null,
      },
    ]);
  });

  it("IF 갈래 안의 룰이 다른 갈래에서만 만든 값을 읽으면 IF_SIBLING", () => {
    const rules = byId(rule("R1", [n("A", "DICT")], [n("X")]), rule("R2", [n("A", "DICT"), n("X", "NONE")], [n("W")]));
    expect(flowChecks(ifFlow(false), rules, dictA)).toStrictEqual([
      {
        code: "IF_SIBLING",
        severity: "REJECT",
        ruleId: "R2",
        otherRuleId: "R1",
        varName: "X",
        message: "R2가 읽는 X는 같은 IF 의 다른 갈래(R1)에서만 만들어진다. 이 갈래를 타면 값이 없다",
        nodeId: "r2",
        edgeId: null,
      },
    ]);
  });

  it("병렬 형제의 결과를 읽으면 PAR_SIBLING", () => {
    const rules = byId(rule("RA", [n("A", "DICT")], [n("X")]), rule("RB", [n("X", "NONE")], [n("Y")]));
    expect(flowChecks(parFlow, rules, {}).map((c) => [c.code, c.ruleId, c.otherRuleId, c.varName, c.message, c.nodeId])).toEqual([
      ["PAR_SIBLING", "RB", "RA", "X", "RB가 병렬 형제 갈래의 RA가 만드는 X를 읽는다. 병렬 갈래끼리는 결과를 읽을 수 없다", "rb"],
    ]);
  });

  it("병렬 형제가 같은 결과 변수를 쓰면 PAR_SIBLING(중복 대입 경고가 아니다)", () => {
    const rules = byId(rule("RA", [n("A", "DICT")], [n("X")]), rule("RB", [n("A", "DICT")], [n("X")]));
    expect(flowChecks(parFlow, rules, {}).map((c) => [c.code, c.severity, c.ruleId, c.otherRuleId, c.message])).toEqual([
      ["PAR_SIBLING", "REJECT", "RB", "RA", "병렬 갈래의 RA와 RB가 같은 결과 변수 X에 대입한다"],
    ]);
  });

  it("같은 룰이 두 IF 갈래에 있으면 검사·입출력이 한 번씩이다", () => {
    const rules = byId(rule("R1", [n("A", "DICT")], [n("X")]));
    expect(flowChecks(ifFlow(false, "R1"), rules, dictA)).toStrictEqual([]);
    const io = flowIo(ifFlow(false, "R1"), rules);
    expect(io.inputs.map((i) => [i.name, i.users])).toEqual([["A", ["R1"]]]);
    expect(io.results.map((r) => [r.name, r.by])).toEqual([["X", ["R1"]]]);
  });

  it("조건식 — 파싱 실패, 정보 없음, 정의 안 된 변수", () => {
    const rules = byId(rule("R1", [n("A", "DICT")], [n("X")]), rule("R2", [n("A", "DICT")], [n("X")]));
    const cases: Array<[Record<string, CondIo>, [string, string | null, string][]]> = [
      [{ e2: { ok: false, message: "파싱 실패", vars: [] } }, [["FLOW_COND", null, "e2 갈래 조건식을 읽을 수 없다: 파싱 실패"]]],
      [{}, [["FLOW_COND", null, "e2 갈래 조건식을 읽을 수 없다: 조건식 정보 없음"]]],
      [{ e2: { ok: true, message: null, vars: [n("Q", "NONE")] } }, [["FLOW_COND", "Q", "e2 갈래 조건식이 읽는 Q는 이 지점에서 정의되지 않았다"]]],
    ];
    for (const [condIo, want] of cases) {
      const got = flowChecks(ifFlow(false), rules, condIo);
      expect(got.map((c) => [c.code, c.varName, c.message])).toEqual(want);
      expect(got.every((c) => c.nodeId === "if1" && c.edgeId === "e2" && c.ruleId === null)).toBe(true);
    }
  });

  it("구조 오류가 있으면 존재 검사 다음에 구조 검사만 내고 경로 검사는 하지 않는다", () => {
    const f = ifFlow(false);
    const broken: RuleSetFlow = { ...f, edges: f.edges.map((e) => (e.id === "e3" ? { ...e, otherwise: false } : e)) };
    const rules = byId(rule("R1", [n("Q", "NONE")], [n("X")]));
    expect(flowChecks(broken, rules, dictA).map((c) => [c.code, c.ruleId, c.nodeId, c.edgeId])).toEqual([
      ["RULE_NOT_FOUND", "R2", "r2", null],
      ["FLOW_IF_ELSE", null, "if1", null],
      ["FLOW_IF_ELSE", null, "if1", "e3"],
      ["FLOW_STRUCTURE", null, "if1", "e3"],
    ]);
  });

  it("목록 검사(setChecks)는 한 줄 흐름으로 돌리고 위치를 비운다", () => {
    const rules = byId(rule("A", [n("S_X", "NONE")], [n("S_A")]), rule("B", [], [n("S_X")]));
    expect(setChecks(["A", "B"], rules).map((c) => [c.code, c.nodeId, c.edgeId])).toEqual([["ORDER", null, null]]);
  });
});

describe("flowChecks — 빈 단계(TASK)가 있는 흐름(4단계)", () => {
  const tn = (id: string, kind: FlowNodeKind, over: Partial<FlowNode> = {}): FlowNode => ({ id, kind, ruleId: null, splitId: null, label: null, ...over });
  const te = (id: string, from: string, to: string): FlowEdge => ({ id, from, to, order: null, cond: null, otherwise: false, label: null });

  it("TASK 는 경로 검사에서 읽고 만드는 것이 없다 — 빈 단계 경고(EMPTY_TASK, Task 3)를 빼면 TASK 를 뺀 흐름의 검사와 같다", () => {
    const rules = byId(rule("R1", [], [n("A")]), rule("R2", [n("A")], [n("B")]));
    const withTask: RuleSetFlow = {
      version: 1,
      nodes: [tn("start", "START"), tn("r1", "RULE", { ruleId: "R1" }), tn("t1", "TASK"), tn("r2", "RULE", { ruleId: "R2" }), tn("end", "END")],
      edges: [te("e1", "start", "r1"), te("e2", "r1", "t1"), te("e3", "t1", "r2"), te("e4", "r2", "end")],
    };
    const without: RuleSetFlow = {
      version: 1,
      nodes: [tn("start", "START"), tn("r1", "RULE", { ruleId: "R1" }), tn("r2", "RULE", { ruleId: "R2" }), tn("end", "END")],
      edges: [te("e1", "start", "r1"), te("e3", "r1", "r2"), te("e4", "r2", "end")],
    };
    const strip = (cs: RuleSetCheck[]) => cs.filter((c) => c.code !== "EMPTY_TASK");
    expect(strip(flowChecks(withTask, rules, {}))).toEqual(flowChecks(without, rules, {}));
  });
});
