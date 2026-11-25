import { describe, expect, it } from "vitest";

import {
  dirtyFields,
  expectScore,
  extraFields,
  newCaseName,
  orderKeyOf,
  pinLabelOf,
  removePin,
  tracesFor,
  upsertPin,
  verdictExpectText,
} from "../../../src/qcd/designSimulation/logic";
import type { ValueTrace } from "../../../src/qdr/qualityDesignResult/types";

const t = (path: string): ValueTrace => ({
  path,
  label: path,
  value: "1",
  unit: null,
  kind: "rule",
  formula: null,
  note: null,
  ruleId: null,
  ver: null,
  ruleKey: null,
  seq: null,
  screen: null,
  base: null,
  specs: [],
});

describe("designSimulation logic", () => {
  it("dirtyFields — 빈칸·null 은 같다", () => {
    expect(dirtyFields({ A: "1", B: "", C: "x" }, { A: "1", B: null, C: "y", D: "z" })).toEqual(["C", "D"]);
    expect(dirtyFields({ _src: "a" }, {})).toEqual([]);
  });

  it("extraFields — 핵심 항목 밖", () => {
    expect(extraFields({ PRD_NM_CD: "3", NAT_CD: "KR", _x: "" }, ["PRD_NM_CD"], { FLOW_CHL: "유통경로" })).toEqual(["FLOW_CHL", "NAT_CD"]);
  });

  it("tracesFor — 정확히, 없으면 아래 경로", () => {
    const trace = { "common.도금량코드": t("common.도금량코드"), "cgl.lines.적정.1": t("cgl.lines.적정.1"), "cgl.lines.적정.3": t("cgl.lines.적정.3") };
    expect(tracesFor(trace, "common.도금량코드").map((x) => x.path)).toEqual(["common.도금량코드"]);
    expect(tracesFor(trace, "cgl.lines.적정").map((x) => x.path)).toEqual(["cgl.lines.적정.1", "cgl.lines.적정.3"]);
    expect(tracesFor(trace, "cgl.lines.차선1")).toEqual([]);
    expect(tracesFor(undefined, "x")).toEqual([]);
    expect(tracesFor(trace, null)).toEqual([]);
  });

  it("핀 더하기·지우기 — 같은 경로는 바꾼다", () => {
    const p1 = { path: "cgl.coat.min", label: "도금 하한", op: "=" as const, val: "80" };
    const pins = upsertPin([p1], { ...p1, val: "90" });
    expect(pins).toHaveLength(1);
    expect(pins[0].val).toBe("90");
    expect(upsertPin(pins, { path: "x", label: "x", op: "~", val: "E" })).toHaveLength(2);
    expect(removePin(pins, "cgl.coat.min")).toEqual([]);
  });

  it("기대값 글·점수", () => {
    expect(verdictExpectText({ stage: 2, expectErrorCode: "A803" })).toBe("2단계 에러 A803");
    expect(verdictExpectText({ stage: 4, expect: "P" })).toBe("4단계 = P");
    expect(expectScore(null)).toEqual({ pass: 0, total: 0 });
    expect(
      expectScore({ pinPass: 1, pinTotal: 2, verdictPass: 1, verdictTotal: 1 } as Parameters<typeof expectScore>[0]),
    ).toEqual({ pass: 2, total: 3 });
  });

  it("이름·키", () => {
    expect(pinLabelOf("common.도금량코드")).toBe("도금량코드");
    expect(pinLabelOf("cgl.lines.적정.1")).toBe("적정[1]");
    expect(orderKeyOf({ ORD_REQ_NO: "D260831014", ORD_REQ_LN: "010" })).toBe("D260831014-010");
    expect(orderKeyOf({})).toBeNull();
    expect(newCaseName("D1-010")).toBe("새 케이스 — D1-010");
    expect(newCaseName(null)).toBe("새 케이스");
  });
});
