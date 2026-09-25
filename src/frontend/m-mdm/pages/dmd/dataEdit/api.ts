/**
 * dataEdit 화면의 OASIS BFF 호출 래퍼(TSK-07-02 design.md §2, codeEdit/api.ts 선례).
 *
 * 호출 패턴: `POST /api/mdm/oasis/dataEdit/{action}` — view(READ), save·delete(EDIT, D9). 마루 데이터 선택 목록은
 * dataMng 의 search 를 그대로 부른다(§1 — dataEdit 에는 별도 목록 분기를 두지 않는다, `dataMng/api.ts` 는 읽기만 한다).
 */
import { apiRequest } from "@dk-oasis/shared/http";

import { searchDataMng } from "../dataMng/api";
import type { DataMngRow } from "../dataMng/types";
import { ATTR_KEYS, type DataEditView, type HeaderForm } from "./types";

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
  const cleaned = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== null && v !== undefined));
  const res = await apiRequest<unknown>(`/api/mdm/oasis/dataEdit/${action}`, {
    method: "POST",
    body: JSON.stringify({ meta: { menuId: "dataEdit" }, params: cleaned }),
  });
  return unwrap<T>(res);
}

/** 마루 데이터 select 옵션 — dataMng 의 search("") 그대로(§1). */
export async function searchMaruDataOptions(): Promise<DataMngRow[]> {
  const result = await searchDataMng("", "", "");
  return result.list ?? [];
}

export function viewDataEdit(maruDataId: string): Promise<DataEditView> {
  return callOasis<DataEditView>("view", { maruDataId });
}

/** action=save — 헤더+키 패턴+라벨+lvl_cnt 한 번에(D3). 빈 라벨도 보낸다 — 서버가 공백을 NULL 로 바꿔 지운다. */
export function saveHeader(maruDataId: string, auditVer: number, form: HeaderForm): Promise<DataEditView> {
  const params: Record<string, unknown> = {
    maruDataId,
    auditVer,
    maruDataName: form.maruDataName,
    description: form.description,
    codePattern: form.codePattern,
    lvlCnt: Number(form.lvlCnt),
  };
  for (const key of ATTR_KEYS) params[key] = form[key];
  return callOasis<DataEditView>("save", params);
}

/** action=delete — 폐기(method=deprecate). */
export function deprecateData(maruDataId: string, auditVer: number): Promise<DataEditView> {
  return callOasis<DataEditView>("delete", { maruDataId, auditVer });
}
