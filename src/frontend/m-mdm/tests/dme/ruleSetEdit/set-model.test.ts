// TSK-08-06 design §6.2·§6.3·§6.9·I10·I11 — 화면 즉시 계산 `set-model.ts`. Java `RuleSetAnalyzerTest` 의 핵심 사례(세 룰 고리·PROG·중복 대입·빈 목록)와
// 화면 전용 `condMarks`(조건 변수 칩 강조)·`laterDeps`(뒤에 있음). 두 구현의 문구·순서 동치 전체는 `rule-set-corpus.test.ts` 가 본다.
import { describe, expect, it } from "vitest";

import { condMarks, isFinalResult, laterDeps, setChecks, setDeps, setIo } from "../../../pages/dme/ruleSetEdit/set-model";
import type { IoName, IoSource, RuleIo } from "../../../pages/dme/ruleSetEdit/types";

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
      },
      {
        code: "DUP_RESULT",
        severity: "WARN",
        ruleId: "C",
        otherRuleId: "B",
        varName: "S_X",
        message: "B와 C가 같은 결과 변수 S_X에 대입한다",
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
      { code: "EMPTY", severity: "REJECT", ruleId: null, otherRuleId: null, varName: null, message: "룰이 하나도 없다" },
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
