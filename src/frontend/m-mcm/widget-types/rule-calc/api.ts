/**
 * 룰 계산기 서버 호출(계약 정본: docs/widget-2026-10/rule-calc-api.md).
 *   - 입력·출력 정의: `POST /api/mdm/oasis/ruleCalc/view`    — {targetTp, targetId, preview}
 *   - 계산:           `POST /api/mdm/oasis/ruleCalc/execute` — {targetTp, targetId, valuesJson}(evalTs 는 보내지 않아 서버 시계를 쓴다)
 * m-mcm 의 OASIS 프록시(app/api/[module]/oasis/...)가 module=mdm 을 MDM 서버로 넘긴다.
 * 요청 본문은 CactusRequest 표준(`{meta, params}`)이고 params 는 평평한 값이다 — 입력값 묶음은 객체가 아니라 JSON 글자 `valuesJson` 으로 싣는다
 * (OASIS 요청 변환기가 params 의 중첩 객체를 받지 못해서다 — 문서 §3).
 * 위젯 실행은 확정(RELEASED) 버전만 쓴다 — execute 는 preview 를 보내지 않는다. preview=true 는 편집기 미리보기의 view 호출 전용이다.
 *
 * 응답은 OASIS 봉투 `{meta, data:{result:{…}}}` 이고 계산을 못 하는 사유(확정 버전 없음·입력 누락 등)는 HTTP 오류가 아니라 `result.messages` 로 온다.
 * @dk-oasis/shared 를 런타임 import 하지 않는다(m-mcm vitest 가 shared dist 없이 시험한다).
 */
import { createJsonApiClient } from "@/lib/http/json-api-client";

import { normalizeIo, normalizeRun, type RuleCalcIo, type RuleCalcRun, type RuleCalcTargetTp } from "./rule-calc-model";

const api = createJsonApiClient();

export const RULE_CALC_VIEW_URL = "/api/mdm/oasis/ruleCalc/view";
export const RULE_CALC_EXECUTE_URL = "/api/mdm/oasis/ruleCalc/execute";

interface CactusEnvelope {
  meta?: { success?: boolean; message?: string };
  data?: unknown;
}

/**
 * 응답 봉투 해제 + 업무 거절 판정. OASIS 는 BusinessException 을 HTTP 200 + `meta.success=false` 로 돌려준다.
 * 서비스 결과는 `data.result` 한 덩어리(ok·target·inputs·result·steps·messages)다. 룰 결과 칸 이름과 부딪히지 않도록 펼치지 않고 그대로 돌려준다.
 * `data.result` 가 객체가 아니면 `data` 를 그대로 돌려준다.
 */
export function unwrapRuleCalc(res: unknown): unknown {
  const env = res as CactusEnvelope | null;
  if (env?.meta && env.meta.success === false) {
    throw new Error(env.meta.message?.trim() || "요청이 거부되었습니다.");
  }
  if (!env || typeof env !== "object" || !("data" in env)) return res;
  const inner = (env.data as { result?: unknown } | null | undefined)?.result;
  return inner !== null && typeof inner === "object" && !Array.isArray(inner) ? inner : env.data;
}

async function post(url: string, menuId: string, params: Record<string, unknown>): Promise<unknown> {
  const res = await api.request<unknown>(url, { method: "POST", body: { meta: { menuId }, params } });
  return unwrapRuleCalc(res);
}

/** 대상의 입력·출력(·단계) 정의를 읽는다. preview 는 편집기 미리보기(내 DRAFT 사용)에서만 true. */
export async function fetchRuleCalcIo(targetTp: RuleCalcTargetTp, targetId: string, preview = false): Promise<RuleCalcIo> {
  // preview 는 기본 false 라 켤 때만 싣는다(불린 params 를 OASIS 변환기가 받는지에 기대지 않는 위젯 실행 경로).
  return normalizeIo(await post(RULE_CALC_VIEW_URL, "HOME", preview ? { targetTp, targetId, preview: true } : { targetTp, targetId }));
}

/** 입력값(글자)으로 계산한다. 값이 없는 칸은 보내지 않고, 판정 시각은 서버 시계를 쓴다. 숫자는 글자 그대로 보낸다(서버가 BigDecimal 로 읽는다). */
export async function runRuleCalc(
  targetTp: RuleCalcTargetTp,
  targetId: string,
  values: Readonly<Record<string, string>>
): Promise<RuleCalcRun> {
  return normalizeRun(await post(RULE_CALC_EXECUTE_URL, "HOME", { targetTp, targetId, valuesJson: JSON.stringify(values) }));
}
