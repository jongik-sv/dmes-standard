/**
 * defectCodeMng OASIS 호출. 봉투 해제(meta.success=false → throw)와 grids 키 규칙은
 * MES 실례 `src/frontend/m-mls/pages/lsh/noticeMgmt/api.ts` 와 `oasis-contract-check` 스킬이 정본이다.
 * 이 파일은 UI 예제가 타입 검사를 통과하도록 그 형태를 줄여 옮긴 것이다.
 */
import { apiRequest } from "@dk-oasis/shared/http";
import type { SavePayload } from "@dk-oasis/shared/grid";

import type { DefectCodeFilters, DefectCodeRow } from "./types";

const OASIS_BASE = "/api/mqc/oasis/defectCodeMng";

interface CactusEnvelope {
  meta?: { success?: boolean; message?: string };
  data?: Record<string, unknown>;
  grids?: Record<string, { rows?: unknown[] }>;
}

async function callAction(
  action: string,
  params: Record<string, unknown>,
  grids?: Record<string, { rows: Record<string, unknown>[] }>,
): Promise<CactusEnvelope> {
  const env = await apiRequest<CactusEnvelope>(`${OASIS_BASE}/${action}`, {
    method: "POST",
    body: JSON.stringify({ meta: { menuId: "defectCodeMng" }, params, ...(grids ? { grids } : {}) }),
  });
  if (env?.meta?.success === false) throw new Error(env.meta.message || "요청이 거부되었습니다.");
  return env;
}

export async function searchDefectCodes(filters: DefectCodeFilters): Promise<DefectCodeRow[]> {
  const env = await callAction("search", { defectType: filters.defectType, keyword: filters.keyword });
  return (env.grids?.master?.rows ?? []) as DefectCodeRow[];
}

/** SavePayload(inserted/updated/deleted) → BE 행 상태(C/U/D) 변환은 api.ts 에서 한다(Part B §6). */
export async function saveDefectCodes(payload: SavePayload): Promise<void> {
  const rows = [
    ...payload.inserted.map((r) => ({ ...r, rowStatus: "C" })),
    ...payload.updated.map((r) => ({ ...r, rowStatus: "U" })),
    ...payload.deleted.map((r) => ({ ...r, rowStatus: "D" })),
  ];
  await callAction("save", {}, { master: { rows } });
}
