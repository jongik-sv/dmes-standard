// TSK-08-04 design §6.5·D12·I24 — 테스트 케이스 기대 JSON(`expectedFromResult`)과 결과 배지. hit 표현: 하나 = 숫자, 여럿 = 배열(엔진
// hits 순서), 기본 행 = 기본 행 row_id, 없음 = null. 숫자 결과는 06 샘플처럼 JSON 숫자로(글자 그대로) 싣는다.
import { describe, expect, it } from "vitest";

import type { ValueTestCaseResult, ValueTestResult } from "../../../pages/dme/ruleEdit/types";
import { caseBadge, expectedFromResult, hitValue } from "../../../pages/dme/ruleEdit/value-test/case-model";
import { SAMPLE_VARS } from "./fixtures";

function result(over: Partial<ValueTestResult> = {}): ValueTestResult {
  return {
    target: "VERSION",
    ver: 1,
    evalTs: "2026-09-26 10:00:00",
    outcome: "OK",
    results: { QLTY_GRD: "A", PRC_FCT: "1.05" },
    hits: [{ rowId: 1, seq: 1, groupChoices: {} }],
    defaultApplied: false,
    trace: [],
    ...over,
  };
}

describe("hitValue", () => {
  it("하나 = 숫자, 여럿 = 엔진 hits 순서의 배열, 기본 행 = 기본 행 row_id, 없음 = null", () => {
    expect(hitValue(result(), 4)).toBe(1);
    expect(
      hitValue(
        result({
          hits: [
            { rowId: 3, seq: 3, groupChoices: {} },
            { rowId: 1, seq: 1, groupChoices: {} },
          ],
        }),
        4,
      ),
    ).toEqual([3, 1]);
    expect(hitValue(result({ hits: [], defaultApplied: true }), 4)).toBe(4);
    expect(hitValue(result({ hits: [], defaultApplied: true }), null)).toBeNull();
    expect(hitValue(result({ hits: [] }), 4)).toBeNull();
  });
});

describe("expectedFromResult", () => {
  it("06:1322 모양 — 결과 변수 뒤에 hit, 숫자 결과는 JSON 숫자 글자 그대로", () => {
    expect(expectedFromResult(result(), SAMPLE_VARS, 4)).toBe('{"QLTY_GRD":"A","PRC_FCT":1.05,"hit":1}');
    expect(expectedFromResult(result({ results: { QLTY_GRD: "C", PRC_FCT: "0.900" }, hits: [], defaultApplied: true }), SAMPLE_VARS, 4)).toBe(
      '{"QLTY_GRD":"C","PRC_FCT":0.900,"hit":4}',
    );
  });

  it("null·불린·목록을 싣고, 숫자 변수라도 숫자 모양이 아닌 값은 문자열로 둔다", () => {
    const json = expectedFromResult(result({ results: { QLTY_GRD: null, PRC_FCT: ["1.5", "2"], FLAG: true, X: "1e3" }, hits: [] }), SAMPLE_VARS, null);
    expect(json).toBe('{"QLTY_GRD":null,"PRC_FCT":[1.5,2],"FLAG":true,"X":"1e3","hit":null}');
    expect(expectedFromResult(result({ results: { PRC_FCT: "1e3" } }), SAMPLE_VARS, 4)).toBe('{"PRC_FCT":"1e3","hit":1}');
  });

  it("판정 오류 결과로는 기대값을 만들지 않는다", () => {
    expect(expectedFromResult(result({ outcome: "ERROR", results: undefined, hits: undefined }), SAMPLE_VARS, 4)).toBeNull();
  });
});

describe("caseBadge", () => {
  const base: ValueTestCaseResult = { caseId: 1, caseName: "A급", outcome: "OK", pass: true, mismatches: [] };

  it("기대값 없음 = 돌려 보기만, 통과, 실패는 불일치 키를 잇는다", () => {
    expect(caseBadge({ ...base, pass: null })).toEqual({ text: "돌려 보기만", tone: "muted" });
    expect(caseBadge(base)).toEqual({ text: "통과", tone: "success" });
    expect(
      caseBadge({
        ...base,
        pass: false,
        mismatches: [
          { key: "QLTY_GRD", expected: "A", actual: "B" },
          { key: "hit", expected: 1, actual: 2 },
        ],
      }),
    ).toEqual({ text: "실패 · QLTY_GRD, hit", tone: "danger" });
  });

  it("판정 오류로 실패하면 불일치 키 대신 판정 오류라고 적는다", () => {
    expect(caseBadge({ ...base, outcome: "ERROR", pass: false, mismatches: [] })).toEqual({ text: "실패 · 판정 오류", tone: "danger" });
  });
});
