import { describe, expect, it } from "vitest";

import { meta } from "./type.meta";
import {
  blocksInput,
  collectValues,
  formatResultValue,
  isNumericType,
  isValidNumberText,
  messageText,
  messageTone,
  normalizeIo,
  normalizeRun,
  readRuleCalcConfig,
  RULE_CALC_DEFAULT_CONFIG,
  displayValue,
  stepOutputDataType,
  stepOutputLabel,
  stepOutputScale,
  validateRuleCalcConfig,
  type RuleCalcInput,
} from "./rule-calc-model";

const num = (name: string, over: Partial<RuleCalcInput> = {}): RuleCalcInput => ({
  name,
  label: name,
  dataType: "NUMBER",
  scale: null,
  unit: null,
  required: true,
  ...over,
});

describe("type.meta", () => {
  it("초기 설정이 기본 설정과 같고 도구 창(floatable)으로 쓸 수 있다", () => {
    expect(meta.id).toBe("rule-calc");
    expect(meta.initialConfig).toEqual(RULE_CALC_DEFAULT_CONFIG);
    expect(meta.floatable).toBe(true);
  });
});

describe("readRuleCalcConfig", () => {
  it("모양이 틀리면 기본값", () => {
    for (const raw of [null, undefined, "x", 3, [], {}]) expect(readRuleCalcConfig(raw)).toEqual(RULE_CALC_DEFAULT_CONFIG);
  });
  it("SET·showSteps 는 정확한 값일 때만 켠다", () => {
    expect(readRuleCalcConfig({ targetTp: "SET", targetId: " M47_COAT_WT ", showSteps: true })).toEqual({
      targetTp: "SET",
      targetId: "M47_COAT_WT",
      showSteps: true,
    });
    expect(readRuleCalcConfig({ targetTp: "set", targetId: "A", showSteps: "true" })).toEqual({ targetTp: "RULE", targetId: "A", showSteps: false });
  });
  it("ID 가 비면 검사 오류", () => {
    expect(validateRuleCalcConfig({ targetTp: "RULE", targetId: "", showSteps: false })).toHaveLength(1);
    expect(validateRuleCalcConfig({ targetTp: "RULE", targetId: "M47C0001", showSteps: false })).toEqual([]);
  });
});

describe("normalizeIo", () => {
  it("계약 모양(A0 §2)을 읽고, 라벨이 없으면 이름, 단위가 빈 글자면 null", () => {
    const io = normalizeIo({
      ok: true,
      target: { tp: "RULE", id: "M47C0001", name: "원판 중량", ver: "1.000", verStatus: "RELEASED", status: "INUSE" },
      inputs: [
        { name: "THK", label: "두께", dataType: "NUMBER", scale: 3, unit: "MM", required: true },
        { name: "X", label: null, dataType: "STRING", scale: null, unit: "", required: true },
        { label: "이름 없음" },
      ],
      outputs: [{ name: "COIL_WT", label: "원판 중량", dataType: "NUMBER", scale: 2, unit: "KG" }],
      steps: [],
      messages: [{ code: "RULE_DEPRECATED", text: "폐기" }],
    });
    expect(io.ok).toBe(true);
    expect(io.target).toEqual({ tp: "RULE", id: "M47C0001", name: "원판 중량", ver: "1.000", verStatus: "RELEASED", status: "INUSE" });
    expect(io.inputs.map((i) => [i.name, i.label, i.scale, i.unit])).toEqual([
      ["THK", "두께", 3, "MM"],
      ["X", "X", null, null],
    ]);
    expect(io.outputs[0]).toMatchObject({ name: "COIL_WT", scale: 2, unit: "KG" });
    expect(io.messages).toEqual([{ code: "RULE_DEPRECATED", text: "폐기" }]);
  });
  it("null·엉뚱한 값도 깨지지 않는다", () => {
    const io = normalizeIo(null);
    expect(io).toMatchObject({ ok: false, inputs: [], outputs: [], steps: [], messages: [] });
  });
  it("세트 단계 라벨·소수 자리를 찾는다", () => {
    const io = normalizeIo({ steps: [{ ruleId: "R1", name: "앞 룰", outputs: [{ name: "A", label: "중간", scale: 2 }] }] });
    expect(stepOutputLabel(io, "R1", "A")).toBe("중간");
    expect(stepOutputScale(io, "R1", "A")).toBe(2);
    expect(stepOutputLabel(io, "R9", "A")).toBe("A");
    expect(stepOutputLabel(null, "R1", "B")).toBe("B");
  });
});

describe("normalizeRun", () => {
  it("값은 글자로 — 숫자·불린·null, 목록은 원소별 글자 배열", () => {
    const run = normalizeRun({
      ok: true,
      result: { A: "12.340", B: 3, C: true, D: ["1.0", "2.5"], E: null },
      steps: [{ ruleId: "R1", inputs: { X: "1" }, outputs: { Y: "2.50" }, hit: false, defaultApplied: true }],
      messages: [],
    });
    expect(run.result).toEqual({ A: "12.340", B: "3", C: "true", D: ["1.0", "2.5"], E: "" });
    expect(run.steps[0]).toEqual({ ruleId: "R1", inputs: { X: "1" }, outputs: { Y: "2.50" }, hit: false, defaultApplied: true });
  });
  it("ok 가 true 가 아니면 false", () => {
    expect(normalizeRun({ ok: "yes" }).ok).toBe(false);
    expect(normalizeRun(undefined)).toMatchObject({ ok: false, result: {}, steps: [], messages: [] });
  });
});

describe("collectValues", () => {
  it("빈 칸은 빼고, 필수 누락은 오류", () => {
    const { values, errors } = collectValues([num("A"), num("B", { required: false }), num("C")], { A: " 1.5 ", B: "", C: "" });
    expect(values).toEqual({ A: "1.5" });
    expect(errors).toEqual({ C: "필수 입력입니다" });
  });
  it("숫자 모양·소수 자리 검사", () => {
    const inputs = [num("A", { scale: 2 }), num("B"), num("S", { dataType: "STRING" })];
    expect(collectValues(inputs, { A: "1.234", B: "abc", S: "그냥 글" }).errors).toEqual({
      A: "소수 2자리까지 입력할 수 있습니다",
      B: "숫자를 입력하세요",
    });
    expect(collectValues([num("A", { scale: 0 })], { A: "1.5" }).errors.A).toBe("정수만 입력할 수 있습니다");
    expect(collectValues(inputs, { A: "1.23", B: "-.5", S: "x" }).errors).toEqual({});
  });
  it("숫자 글은 쉼표를 허용하지 않는다", () => {
    expect(isValidNumberText("1,000")).toBe(false);
    expect(isValidNumberText("")).toBe(true);
    expect(isValidNumberText("+3.")).toBe(true);
    expect(isNumericType("DECIMAL(10,2)")).toBe(true);
    expect(isNumericType("STRING")).toBe(false);
  });
});

describe("formatResultValue — scale 로 HALF_UP, 글자 연산", () => {
  it.each([
    ["12.3", 3, "12.300"],
    ["12.3456", 2, "12.35"],
    ["12.3449", 2, "12.34"],
    ["0.995", 2, "1.00"],
    ["999.9996", 3, "1,000.000"],
    ["1234567.5", 0, "1,234,568"],
    ["-0.004", 2, "0.00"],
    ["-12.345", 2, "-12.35"],
    ["12345678901234567890.12345", 3, "12,345,678,901,234,567,890.123"],
    ["5", 2, "5.00"],
    ["1234.5", null, "1,234.5"],
  ])("%s / scale %s → %s", (text, scale, expected) => {
    expect(formatResultValue(text, scale)).toBe(expected);
  });
  it("숫자가 아니면 그대로", () => {
    expect(formatResultValue("ABC", 2)).toBe("ABC");
    expect(formatResultValue("", 2)).toBe("");
    expect(formatResultValue("1.5", 2, "STRING")).toBe("1.5");
  });
});

describe("displayValue", () => {
  it("목록은 원소마다 scale·쉼표를 적용해 잇는다", () => {
    expect(displayValue(["1.2345", "2.5"], 2, "NUMBER")).toBe("1.23, 2.50");
    expect(displayValue("1.5", 2, "NUMBER")).toBe("1.50");
  });
  it("dataType 을 모르거나 숫자 계열이 아니면 서버 글자 그대로(앞 0·긴 숫자 보존)", () => {
    expect(displayValue("00123", 2, "")).toBe("00123");
    expect(displayValue("00123", null, "STRING")).toBe("00123");
    expect(displayValue("1234567", null, "STRING")).toBe("1234567");
  });
  it("세트 단계 출력의 dataType 을 찾는다", () => {
    const io = normalizeIo({ steps: [{ ruleId: "R1", outputs: [{ name: "A", dataType: "STRING" }] }] });
    expect(stepOutputDataType(io, "R1", "A")).toBe("STRING");
    expect(stepOutputDataType(io, "R1", "Z")).toBe("");
  });
});

describe("collectValues — 소수 자리", () => {
  it("뒤쪽 0 은 자리로 세지 않는다(엑셀 붙여넣기 1.50 · 5.0)", () => {
    expect(collectValues([num("A", { scale: 1 })], { A: "1.50" }).errors).toEqual({});
    expect(collectValues([num("A", { scale: 0 })], { A: "5.0" }).errors).toEqual({});
    expect(collectValues([num("A", { scale: 1 })], { A: "1.51" }).errors.A).toBeTruthy();
  });
});

describe("messages", () => {
  it("문구는 서버 글자, 없으면 코드별 기본, 모르는 코드는 코드", () => {
    expect(messageText({ code: "NO_RELEASED", text: "확정 버전 없음" })).toBe("확정 버전 없음");
    expect(messageText({ code: "NO_RELEASED", text: " " })).toContain("확정 버전 없음");
    expect(messageText({ code: "ZZZ", text: "" })).toBe("ZZZ");
  });
  it("톤과 입력 차단", () => {
    expect(messageTone("EVAL_ERROR")).toBe("error");
    expect(messageTone("RULE_DEPRECATED")).toBe("warn");
    expect(messageTone("ZZZ")).toBe("info");
    expect(blocksInput([{ code: "NOT_FOUND", text: "" }])).toBe(true);
    expect(blocksInput([{ code: "NO_RELEASED", text: "" }])).toBe(true);
    expect(blocksInput([{ code: "RULE_DEPRECATED", text: "" }])).toBe(false);
  });
});
