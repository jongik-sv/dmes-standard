/**
 * dataMng 화면의 OASIS BFF 호출 래퍼(TSK-07-02 design.md §2, codeMng/api.ts 선례).
 *
 * 호출 패턴: `POST /api/mdm/oasis/dataMng/{action}` — search(READ), reg(EDIT, D9). BFF 가 `MDM_WAS_URL` 로
 * 프록시하고 인증 헤더를 주입한다.
 */
import { apiRequest } from "@dk-oasis/shared/http";

import type { DataMngRegForm, DataMngRegResult, DataMngSearchResult } from "./types";

interface CactusEnvelope {
  meta?: { success?: boolean; message?: string | null; code?: string };
  data?: Record<string, unknown>;
}

/** 응답 봉투 해제 + 업무 거부 판정. 성공이면 `data.result` 를 펼친다(F12). */
export function unwrap<T = Record<string, unknown>>(res: unknown): T {
  const env = res as CactusEnvelope;
  if (env?.meta && env.meta.success === false) {
    throw new Error(env.meta.message?.trim() || "요청이 거부되었습니다.");
  }
  const out: Record<string, unknown> = {};
  const inner = env?.data?.["result"];
  if (inner && typeof inner === "object" && !Array.isArray(inner)) {
    Object.assign(out, inner as Record<string, unknown>);
  }
  return out as T;
}

async function callOasis<T>(action: string, params: Record<string, unknown>): Promise<T> {
  const cleaned = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== null && v !== undefined && v !== ""));
  const res = await apiRequest<unknown>(`/api/mdm/oasis/dataMng/${action}`, {
    method: "POST",
    body: JSON.stringify({ meta: { menuId: "dataMng" }, params: cleaned }),
  });
  return unwrap<T>(res);
}

export function searchDataMng(id: string, name: string, status: string): Promise<DataMngSearchResult> {
  return callOasis<DataMngSearchResult>("search", { maruDataId: id.trim(), maruDataName: name.trim(), status });
}

/** action=reg — 등록(R1·R6·R10). */
export function registerDataMng(form: DataMngRegForm): Promise<DataMngRegResult> {
  return callOasis<DataMngRegResult>("reg", {
    maruDataId: form.maruDataId.trim(),
    maruDataName: form.maruDataName.trim(),
    description: form.description.trim(),
    codePattern: form.codePattern.trim(),
    lvlCnt: Number(form.lvlCnt),
  });
}
