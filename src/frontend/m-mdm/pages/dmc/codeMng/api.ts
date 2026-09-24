/**
 * codeMng 화면의 OASIS BFF 호출 래퍼 — `POST /api/mdm/oasis/codeMng/{action}`(TSK-06-02 design.md §6.1).
 *   - search — 목록(현재 버전·미적용·계산 상태)
 *   - reg    — 등록(method=register). 원천은 보내지 않는다 — 서버 기본 MDM(I8)
 *
 * 공통 호출(`callMdmOasis`)은 codeEdit 도 쓴다. BPMN 안에서 던진 업무 오류는 `meta.message` 만 온다(design.md F18).
 */
import { apiRequest } from "@dk-oasis/shared/http";

import type { CodeMngSearchResult, CodeRegForm, CodeRegResult } from "./types";

interface CactusEnvelope {
  meta?: { success?: boolean; message?: string; code?: string };
  data?: Record<string, unknown>;
}

/** 응답 봉투 해제 + 업무 거부 판정(`meta.success === false` 면 message 로 throw). 성공이면 `data.result` 를 펼친다. */
export function unwrap<T = Record<string, unknown>>(res: unknown): T {
  const env = res as CactusEnvelope;
  if (env?.meta && env.meta.success === false) {
    throw new Error(env.meta.message?.trim() || "요청이 거부되었습니다.");
  }
  const out: Record<string, unknown> = {};
  if (env?.data) {
    Object.assign(out, env.data);
    const inner = env.data["result"];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      Object.assign(out, inner as Record<string, unknown>);
    }
  }
  return out as T;
}

/**
 * 공통 호출. params 의 null·undefined 는 뺀다 — OASIS 가 null 값의 타입을 정하지 못해 요청 전체가 실패한다
 * (columnMng/api.ts 선례). 서버 DTO 에서는 빠진 키가 곧 null 이다.
 */
export async function callMdmOasis<T>(serviceId: string, action: string, params: Record<string, unknown>): Promise<T> {
  const cleaned = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== null && v !== undefined));
  const res = await apiRequest<unknown>(`/api/mdm/oasis/${serviceId}/${action}`, {
    method: "POST",
    body: JSON.stringify({ meta: { menuId: serviceId }, params: cleaned }),
  });
  return unwrap<T>(res);
}

export function searchCodes(keyword: string, status: string): Promise<CodeMngSearchResult> {
  return callMdmOasis<CodeMngSearchResult>("codeMng", "search", {
    keyword: keyword.trim() === "" ? null : keyword.trim(),
    status: status === "" ? null : status,
  });
}

export function registerCode(form: CodeRegForm): Promise<CodeRegResult> {
  return callMdmOasis<CodeRegResult>("codeMng", "reg", {
    maruCodeId: form.maruCodeId.trim(),
    maruCodeName: form.maruCodeName.trim(),
    description: form.description.trim() === "" ? null : form.description.trim(),
    lvlCnt: Number(form.lvlCnt),
  });
}
