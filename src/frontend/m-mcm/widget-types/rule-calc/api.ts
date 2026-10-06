/**
 * 룰 계산기 서버 호출(조정 README §1 API 계약 초안 — rule-calc-api 레인 A0 문서가 정본).
 *   - 입력·출력 정의: `POST /api/mdm/oasis/ruleCalc/view`    — {targetTp, targetId, preview}
 *   - 계산:           `POST /api/mdm/oasis/ruleCalc/execute` — {targetTp, targetId, valuesJson, evalTs}
 * m-mcm 의 OASIS 프록시(app/api/[module]/oasis/...)가 module=mdm 을 MDM 서버로 넘긴다.
 * 요청 본문은 CactusRequest 표준(`{meta, params}`)이고 params 는 평평한 값이다 — 입력값 묶음은 객체가 아니라 JSON 글자 `valuesJson` 으로 싣는다
 * (조정 통지: action 이름은 기존 OASIS 어휘 view·execute, 값은 글자 숫자. A0 문서는 A1 머지 때 갱신된다).
 * 위젯 실행은 확정(RELEASED) 버전만 쓴다 — execute 는 preview 를 보내지 않는다. preview=true 는 편집기 미리보기의 view 호출 전용이다.
 *
 * ⚠ 지금은 서버(A0·A1)가 dev 에 없어 목(rule-calc-mock.ts)을 쓴다 — RULE_CALC_USE_MOCK 을 B3 에서 걷는다.
 * @dk-oasis/shared 를 런타임 import 하지 않는다(m-mcm vitest 가 shared dist 없이 시험한다).
 */
import { createJsonApiClient } from "@/lib/http/json-api-client";

import { mockRuleCalcIo, mockRuleCalcRun } from "./rule-calc-mock";
import { normalizeIo, normalizeRun, type RuleCalcIo, type RuleCalcRun, type RuleCalcTargetTp } from "./rule-calc-model";

const api = createJsonApiClient();

export const RULE_CALC_VIEW_URL = "/api/mdm/oasis/ruleCalc/view";
export const RULE_CALC_EXECUTE_URL = "/api/mdm/oasis/ruleCalc/execute";

/** B3(실제 API 연동)에서 false 로 바꾸고 목 파일을 걷는다. */
export const RULE_CALC_USE_MOCK = true;

interface CactusEnvelope {
  meta?: { success?: boolean; message?: string };
  data?: unknown;
}

/**
 * 응답 봉투 해제 + 업무 거절 판정. OASIS 는 BusinessException 을 HTTP 200 + `meta.success=false` 로 돌려준다.
 * 룰 결과 칸 이름(ok·steps 등)과 부딪히지 않도록 data 를 펼치지 않고 그대로 돌려준다.
 */
export function unwrapRuleCalc(res: unknown): unknown {
  const env = res as CactusEnvelope | null;
  if (env?.meta && env.meta.success === false) {
    throw new Error(env.meta.message?.trim() || "요청이 거부되었습니다.");
  }
  return env && typeof env === "object" && "data" in env ? env.data : res;
}

async function post(url: string, menuId: string, params: Record<string, unknown>): Promise<unknown> {
  const res = await api.request<unknown>(url, { method: "POST", body: { meta: { menuId }, params } });
  return unwrapRuleCalc(res);
}

/** 대상의 입력·출력(·단계) 정의를 읽는다. preview 는 편집기 미리보기(내 DRAFT 사용)에서만 true. */
export async function fetchRuleCalcIo(targetTp: RuleCalcTargetTp, targetId: string, preview = false): Promise<RuleCalcIo> {
  if (RULE_CALC_USE_MOCK) return mockRuleCalcIo(targetTp, targetId, preview);
  return normalizeIo(await post(RULE_CALC_VIEW_URL, "HOME", { targetTp, targetId, preview }));
}

/** 입력값(글자)으로 계산한다. 값이 없는 칸은 보내지 않고, 판정 시각(evalTs)은 서버 시계를 쓴다. 숫자는 글자 그대로 보낸다(서버가 BigDecimal 로 읽는다). */
export async function runRuleCalc(
  targetTp: RuleCalcTargetTp,
  targetId: string,
  values: Readonly<Record<string, string>>
): Promise<RuleCalcRun> {
  if (RULE_CALC_USE_MOCK) return mockRuleCalcRun(targetTp, targetId, values);
  return normalizeRun(await post(RULE_CALC_EXECUTE_URL, "HOME", { targetTp, targetId, valuesJson: JSON.stringify(values), evalTs: null }));
}
