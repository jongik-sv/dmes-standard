/**
 * workOrderMng OASIS 호출. 봉투 규칙의 정본은 `src/frontend/m-mls/pages/lsh/noticeMgmt/api.ts` 와
 * `oasis-contract-check` 스킬이다. 이 파일은 UI 예제가 타입 검사를 통과하도록 줄인 형태다.
 */
import { apiRequest } from "@dk-oasis/shared/http";

import type { WorkOrderFilters, WorkOrderOperRow, WorkOrderRegisterForm, WorkOrderRow, WorkOrderSearchResult } from "./types";

const OASIS_BASE = "/api/mpp/oasis/workOrderMng";

interface CactusEnvelope {
  meta?: { success?: boolean; message?: string };
  params?: { totalCount?: number };
  grids?: Record<string, { rows?: unknown[] }>;
}

async function callAction(
  action: string,
  params: Record<string, unknown>,
  grids?: Record<string, { rows: Record<string, unknown>[] }>,
): Promise<CactusEnvelope> {
  const env = await apiRequest<CactusEnvelope>(`${OASIS_BASE}/${action}`, {
    method: "POST",
    body: JSON.stringify({ meta: { menuId: "workOrderMng" }, params, ...(grids ? { grids } : {}) }),
  });
  if (env?.meta?.success === false) throw new Error(env.meta.message || "요청이 거부되었습니다.");
  return env;
}

/** `limit` 을 주면 서버가 앞쪽 limit 건만 돌려주고 `totalCount` 에 전체 건수를 싣는다. 비우면 전체([전체 보기]). */
export async function searchWorkOrders(filters: WorkOrderFilters, limit?: number): Promise<WorkOrderSearchResult> {
  const env = await callAction("search", { ...filters, ...(limit != null ? { limit } : {}) });
  const rows = (env.grids?.master?.rows ?? []) as WorkOrderRow[];
  return { rows, totalCount: env.params?.totalCount ?? rows.length };
}

export async function searchOpers(woNo: string): Promise<WorkOrderOperRow[]> {
  const env = await callAction("searchOper", { woNo });
  return (env.grids?.detail?.rows ?? []) as WorkOrderOperRow[];
}

export async function registerWorkOrder(form: WorkOrderRegisterForm): Promise<void> {
  await callAction("register", {}, { master: { rows: [{ ...form, rowStatus: "C" }] } });
}
