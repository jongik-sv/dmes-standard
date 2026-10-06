import { describe, expect, it } from "vitest";

import { fetchRuleCalcIo, RULE_CALC_EXECUTE_URL, RULE_CALC_VIEW_URL, runRuleCalc, unwrapRuleCalc } from "./api";

describe("unwrapRuleCalc", () => {
  it("meta.success=false 면 서버 메시지로 거절한다", () => {
    expect(() => unwrapRuleCalc({ meta: { success: false, message: "권한이 없습니다." } })).toThrow("권한이 없습니다.");
    expect(() => unwrapRuleCalc({ meta: { success: false } })).toThrow("요청이 거부되었습니다.");
  });
  it("data 를 펼치지 않고 그대로 준다 — 결과 칸 이름(ok·steps)과 부딪히지 않는다", () => {
    const data = { ok: true, result: { ok: "1", steps: "2" }, steps: [], messages: [] };
    expect(unwrapRuleCalc({ meta: { success: true }, data })).toBe(data);
  });
  it("봉투가 아니면 응답 그대로", () => {
    const body = { ok: true };
    expect(unwrapRuleCalc(body)).toBe(body);
  });
});

describe("호출 경로", () => {
  it("MDM 서비스 ruleCalc 의 view·execute", () => {
    expect(RULE_CALC_VIEW_URL).toBe("/api/mdm/oasis/ruleCalc/view");
    expect(RULE_CALC_EXECUTE_URL).toBe("/api/mdm/oasis/ruleCalc/execute");
  });
});

// B3 에서 목을 걷으면 이 묶음은 fetch 대역으로 요청 본문(params 키)을 확인하는 시험으로 바꾼다.
describe("목 서버(B3 전까지)", () => {
  it("룰: 입력 두 칸·출력 한 칸, 계산 결과는 소수 3자리 글자", async () => {
    const io = await fetchRuleCalcIo("RULE", "M47C0001");
    expect(io.inputs.map((i) => i.name)).toEqual(["THK", "WIDTH"]);
    expect(io.target.verStatus).toBe("RELEASED");
    const run = await runRuleCalc("RULE", "M47C0001", { THK: "0.5", WIDTH: "1000" });
    expect(run).toMatchObject({ ok: true, result: { WEIGHT: "500.000" } });
  });
  it("미리보기는 DRAFT 로 보인다", async () => {
    expect((await fetchRuleCalcIo("RULE", "M47C0001", true)).target.verStatus).toBe("DRAFT");
  });
  it("세트: 중간 단계가 실행 순서대로 온다", async () => {
    const io = await fetchRuleCalcIo("SET", "M47_COAT_WT");
    expect(io.steps.map((s) => s.ruleId)).toEqual(["M47C0007", "M47C0006"]);
    const run = await runRuleCalc("SET", "M47_COAT_WT", { COAT_AREA: "10", COAT_THK: "20" });
    expect(run.steps.map((s) => s.ruleId)).toEqual(["M47C0007", "M47C0006"]);
  });
  it("NONE 로 시작하는 대상은 확정 버전 없음", async () => {
    const io = await fetchRuleCalcIo("RULE", "NONE1");
    expect(io.messages[0].code).toBe("NO_RELEASED");
    expect((await runRuleCalc("RULE", "NONE1", {})).ok).toBe(false);
  });
});
