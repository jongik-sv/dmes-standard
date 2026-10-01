/**
 * equipMng OASIS 호출. 봉투 규칙의 정본은 `src/frontend/m-mls/pages/lsh/noticeMgmt/api.ts` 와
 * `oasis-contract-check` 스킬이다. 이 파일은 UI 예제가 타입 검사를 통과하도록 줄인 형태다.
 */
import { apiRequest } from "@dk-oasis/shared/http";

import type { EquipFilters, EquipForm, EquipRow } from "./types";

const OASIS_BASE = "/api/mpp/oasis/equipMng";

interface CactusEnvelope {
  meta?: { success?: boolean; message?: string };
  grids?: Record<string, { rows?: unknown[] }>;
}

async function callAction(
  action: string,
  params: Record<string, unknown>,
  grids?: Record<string, { rows: Record<string, unknown>[] }>,
): Promise<CactusEnvelope> {
  const env = await apiRequest<CactusEnvelope>(`${OASIS_BASE}/${action}`, {
    method: "POST",
    body: JSON.stringify({ meta: { menuId: "equipMng" }, params, ...(grids ? { grids } : {}) }),
  });
  if (env?.meta?.success === false) throw new Error(env.meta.message || "요청이 거부되었습니다.");
  return env;
}

export async function searchEquips(filters: EquipFilters): Promise<EquipRow[]> {
  const env = await callAction("search", { ...filters });
  return (env.grids?.master?.rows ?? []) as EquipRow[];
}

export async function saveEquip(form: EquipForm, isNew: boolean): Promise<void> {
  await callAction("save", {}, { master: { rows: [{ ...form, rowStatus: isNew ? "C" : "U" }] } });
}

export async function deleteEquip(equipCd: string): Promise<void> {
  await callAction("save", {}, { master: { rows: [{ equipCd, rowStatus: "D" }] } });
}
