// 노드 찾기(3단계 Task 8, B11) — 룰 ID·룰 이름·노드 라벨을 대소문자 무시로 흐름 노드 순서대로 찾는다.
// 2026-10-01 찾기 위젯 옵션 셋(대소문자 구분·단어 단위·정규식)과 잘못된 정규식.
import { describe, expect, it } from "vitest";

import { insertSplit, toEditFlow, updateNodeLabel } from "../../../pages/dme/ruleSetEdit/flow-edit";
import { INVALID_FIND, compileFind, findNodes } from "../../../pages/dme/ruleSetEdit/state/useFind";
import type { RuleIo } from "../../../pages/dme/ruleSetEdit/types";

const io = (ruleId: string, ruleName: string): RuleIo => ({
  ruleId, ruleName, ruleKind: "DECISION", status: "INUSE", exists: true, releasedVer: "1.000", hitPolicy: "FIRST", conds: [], results: [],
});
const rules = { E2S_GRD: io("E2S_GRD", "등급 판정"), E2S_FCT: io("E2S_FCT", "Factor 계산"), E2S_GRD2: io("E2S_GRD2", "등급 재판정") };

describe("findNodes", () => {
  const flow = toEditFlow(null, ["E2S_GRD", "E2S_FCT", "E2S_GRD2"]);

  it("룰 ID 를 대소문자 무시로 흐름 노드 순서대로 찾는다", () => {
    expect(findNodes(flow, rules, "grd")).toEqual(["r1", "r3"]);
  });

  it("룰 이름으로 찾는다", () => {
    expect(findNodes(flow, rules, "factor")).toEqual(["r2"]);
    expect(findNodes(flow, rules, "등급")).toEqual(["r1", "r3"]);
  });

  it("노드 라벨로 찾는다", () => {
    const r = updateNodeLabel(flow, "r2", "검증 단계");
    if (!r.ok) throw new Error(r.reason);
    expect(findNodes(r.flow, rules, "검증")).toEqual(["r2"]);
  });

  it("빈 질의·공백·없는 흐름·맞는 것이 없으면 빈 목록", () => {
    expect(findNodes(flow, rules, "")).toEqual([]);
    expect(findNodes(flow, rules, "   ")).toEqual([]);
    expect(findNodes(null, rules, "grd")).toEqual([]);
    expect(findNodes(flow, rules, "없는말")).toEqual([]);
  });

  it("분기 노드도 라벨로 찾는다", () => {
    const r = insertSplit(flow, "e2", "IF");
    if (!r.ok) throw new Error(r.reason);
    const ifId = r.flow.nodes.find((n) => n.kind === "IF")!.id;
    expect(findNodes(r.flow, rules, "조건")).toEqual([ifId]);
  });
});

describe("findNodes — 옵션(찾기 위젯)", () => {
  const flow = toEditFlow(null, ["E2S_GRD", "E2S_FCT", "E2S_GRD2"]);
  const opt = (o: Partial<{ caseSensitive: boolean; wholeWord: boolean; regex: boolean }>) => ({ caseSensitive: false, wholeWord: false, regex: false, ...o });

  it("대소문자 구분 — 켜면 글자 그대로만 맞는다", () => {
    expect(findNodes(flow, rules, "grd", opt({ caseSensitive: true }))).toEqual([]);
    expect(findNodes(flow, rules, "GRD", opt({ caseSensitive: true }))).toEqual(["r1", "r3"]);
    expect(findNodes(flow, rules, "factor", opt({ caseSensitive: true }))).toEqual([]);
  });

  it("단어 단위 — 앞뒤가 글자·숫자·밑줄이 아니어야 한다(한글도 단어 글자다)", () => {
    // "등급 판정" 은 단어 「등급」, "등급 재판정" 도 단어 「등급」 — 「판정」 은 "재판정" 안에 붙어 있어 r3 에서는 단어가 아니다.
    expect(findNodes(flow, rules, "등급", opt({ wholeWord: true }))).toEqual(["r1", "r3"]);
    expect(findNodes(flow, rules, "판정", opt({ wholeWord: true }))).toEqual(["r1"]);
    expect(findNodes(flow, rules, "판정")).toEqual(["r1", "r3"]);
    // 밑줄은 단어 글자다 — E2S_GRD 안의 GRD 는 단어가 아니다. ID 전체는 단어다.
    expect(findNodes(flow, rules, "GRD", opt({ wholeWord: true }))).toEqual([]);
    expect(findNodes(flow, rules, "e2s_grd", opt({ wholeWord: true }))).toEqual(["r1"]);
  });

  it("정규식 — 글자를 정규식으로 본다. 대소문자·단어 단위 옵션과 함께 쓴다", () => {
    expect(findNodes(flow, rules, "^E2S_GRD\\d?$", opt({ regex: true }))).toEqual(["r1", "r3"]);
    expect(findNodes(flow, rules, "grd2|fct", opt({ regex: true }))).toEqual(["r2", "r3"]);
    expect(findNodes(flow, rules, "grd2|fct", opt({ regex: true, caseSensitive: true }))).toEqual([]);
    expect(findNodes(flow, rules, "등.", opt({ regex: true, wholeWord: true }))).toEqual(["r1", "r3"]);
    // 정규식이 아니면 특수 문자를 글자 그대로 찾는다.
    expect(findNodes(flow, rules, "E2S.GRD")).toEqual([]);
    expect(findNodes(flow, rules, "E2S.GRD", opt({ regex: true }))).toEqual(["r1", "r3"]);
  });

  it("잘못된 정규식은 예외 없이 결과 0건이고 compileFind 가 INVALID_FIND 를 돌려준다", () => {
    expect(() => findNodes(flow, rules, "(", opt({ regex: true }))).not.toThrow();
    expect(findNodes(flow, rules, "(", opt({ regex: true }))).toEqual([]);
    expect(compileFind("(", opt({ regex: true }))).toBe(INVALID_FIND);
    // 정규식이 아니면 같은 글자도 잘못이 아니다.
    expect(compileFind("(", opt({}))).not.toBe(INVALID_FIND);
    expect(compileFind("  ", opt({ regex: true }))).toBeNull();
  });

  it("빈 글자 일치(x*)는 결과로 치지 않고 멈추지 않는다", () => {
    expect(findNodes(flow, rules, "x*", opt({ regex: true }))).toEqual([]);
    expect(findNodes(flow, rules, "Q?", opt({ regex: true, wholeWord: true }))).toEqual([]);
    expect(findNodes(flow, rules, "F*CT", opt({ regex: true }))).toEqual(["r2"]);
  });
});
