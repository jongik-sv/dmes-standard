import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchRuleCalcIo, RULE_CALC_EXECUTE_URL, RULE_CALC_VIEW_URL, runRuleCalc, unwrapRuleCalc } from "./api";

const fetchMock = vi.fn();

function reply(body: unknown, status = 200) {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

function sent(i = 0): { url: string; method: string; body: { meta: Record<string, unknown>; params: Record<string, unknown> } } {
  const [url, init] = fetchMock.mock.calls[i] as [string, RequestInit];
  return { url, method: String(init.method), body: JSON.parse(String(init.body)) };
}

/** OASIS 봉투 — 서비스 결과는 data.result 한 덩어리다. */
const ok = (result: unknown) => ({ meta: { success: true }, data: { result } });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("unwrapRuleCalc", () => {
  it("meta.success=false 면 서버 메시지로 거절한다", () => {
    expect(() => unwrapRuleCalc({ meta: { success: false, message: "권한이 없습니다." } })).toThrow("권한이 없습니다.");
    expect(() => unwrapRuleCalc({ meta: { success: false } })).toThrow("요청이 거부되었습니다.");
  });
  it("data.result 를 펼치지 않고 그대로 준다 — 결과 칸 이름(ok·steps)과 부딪히지 않는다", () => {
    const result = { ok: true, result: { ok: "1", steps: "2" }, steps: [], messages: [] };
    expect(unwrapRuleCalc(ok(result))).toBe(result);
  });
  it("data.result 가 없으면 data, 봉투가 아니면 응답 그대로", () => {
    const data = { ok: true };
    expect(unwrapRuleCalc({ meta: { success: true }, data })).toBe(data);
    expect(unwrapRuleCalc(data)).toBe(data);
  });
});

describe("view", () => {
  it("MDM ruleCalc/view 에 대상만 보내고(preview 는 켤 때만) 응답을 정규화한다", async () => {
    reply(
      ok({
        ok: true,
        target: { tp: "RULE", id: "M47C0001", name: "코일원판중량", ver: "1.000", verStatus: "RELEASED", status: "INUSE" },
        inputs: [{ name: "THK", label: "두께", dataType: "NUMBER", scale: 3, unit: "MM", required: true }],
        outputs: [{ name: "COIL_WT", label: "원판 중량", dataType: "NUMBER", scale: 2, unit: "KG" }],
        steps: [],
        messages: [],
      })
    );
    const io = await fetchRuleCalcIo("RULE", "M47C0001");
    const req = sent();
    expect(RULE_CALC_VIEW_URL).toBe("/api/mdm/oasis/ruleCalc/view");
    expect([req.url, req.method]).toEqual([RULE_CALC_VIEW_URL, "POST"]);
    expect(req.body.params).toEqual({ targetTp: "RULE", targetId: "M47C0001" });
    expect(io.inputs[0]).toMatchObject({ name: "THK", scale: 3, unit: "MM", required: true });
    expect(io.outputs[0]).toMatchObject({ name: "COIL_WT", unit: "KG" });
    expect(io.target.verStatus).toBe("RELEASED");
  });

  it("편집기 미리보기는 preview=true 를 싣는다", async () => {
    reply(ok({ ok: true, target: {}, inputs: [], outputs: [], steps: [], messages: [] }));
    await fetchRuleCalcIo("SET", "M47_COAT_WT", true);
    expect(sent().body.params).toEqual({ targetTp: "SET", targetId: "M47_COAT_WT", preview: true });
  });

  it("확정 버전 없음은 오류가 아니라 messages 로 온다", async () => {
    reply(ok({ ok: false, target: { tp: "RULE", id: "X" }, inputs: [], outputs: [], steps: [], messages: [{ code: "NO_RELEASED", text: "확정 버전 없음" }] }));
    const io = await fetchRuleCalcIo("RULE", "X");
    expect(io.ok).toBe(false);
    expect(io.messages).toEqual([{ code: "NO_RELEASED", text: "확정 버전 없음" }]);
  });

  it("HTTP 오류·업무 거절은 Error", async () => {
    reply({ message: "권한이 없습니다." }, 403);
    await expect(fetchRuleCalcIo("RULE", "X")).rejects.toThrow("권한이 없습니다.");
    reply({ meta: { success: false, message: "형식 오류" } });
    await expect(fetchRuleCalcIo("RULE", "X")).rejects.toThrow("형식 오류");
  });
});

describe("execute", () => {
  it("입력값은 valuesJson 글자로(소수 글자 그대로), preview·evalTs 는 싣지 않는다", async () => {
    reply(ok({ ok: true, result: { COIL_WT: "123.4560" }, steps: [], messages: [] }));
    const run = await runRuleCalc("RULE", "M47C0001", { THK: "0.500", WIDTH: "1000" });
    const req = sent();
    expect(RULE_CALC_EXECUTE_URL).toBe("/api/mdm/oasis/ruleCalc/execute");
    expect(req.url).toBe(RULE_CALC_EXECUTE_URL);
    expect(Object.keys(req.body.params).sort()).toEqual(["targetId", "targetTp", "valuesJson"]);
    expect(typeof req.body.params.valuesJson).toBe("string");
    expect(JSON.parse(String(req.body.params.valuesJson))).toEqual({ THK: "0.500", WIDTH: "1000" });
    expect(run).toMatchObject({ ok: true, result: { COIL_WT: "123.4560" } });
  });

  it("세트: 단계별 값·적중 표시를 읽는다", async () => {
    reply(
      ok({
        ok: true,
        result: { COAT_WT: "12.34" },
        steps: [{ ruleId: "M47C0007", inputs: { THK: "0.5" }, outputs: { COAT_AMT: "0.020" }, hit: true, defaultApplied: false }],
        messages: [{ code: "RULE_DEPRECATED", text: "폐기 룰 포함" }],
      })
    );
    const run = await runRuleCalc("SET", "M47_COAT_WT", { THK: "0.5" });
    expect(run.steps[0]).toEqual({ ruleId: "M47C0007", inputs: { THK: "0.5" }, outputs: { COAT_AMT: "0.020" }, hit: true, defaultApplied: false });
    expect(run.messages[0].code).toBe("RULE_DEPRECATED");
  });

  it("입력 누락은 ok=false 와 INPUT_MISSING", async () => {
    reply(ok({ ok: false, result: {}, steps: [], messages: [{ code: "INPUT_MISSING", text: "THK 필요" }] }));
    const run = await runRuleCalc("RULE", "M47C0001", {});
    expect(run.ok).toBe(false);
    expect(run.messages[0]).toEqual({ code: "INPUT_MISSING", text: "THK 필요" });
  });
});
