/**
 * 업무기준 상세조회 (masterRuleDataList) — Repository.
 *
 * BFF endpoints (OASIS — docs/guide/FrontEnd/standard-v2/frontend-standard/01-rules-decisions-files.md §2-2-1-A):
 *  - POST /api/mcm/oasis/masterRuleDataList/lov          → 컬럼정의+PK/CODE_YN (ds_GetRuleColList)
 *  - POST /api/mcm/oasis/masterRuleDataList/search       → 동적 테이블 페이징 조회 (ds_GetMasterRuleDataList + totalCount)
 *  - POST /api/mcm/oasis/masterRuleDataList/searchExport → 전건 (ds_GetMasterRuleDataListExport)
 *
 * BE: com.dongkuk.dmes.mcm.cmb.masterRuleDataList.service.MasterRuleDataListService (mcm-core)
 *  (BPMN: services/cmb/masterRuleDataList.bpmn — 3 액션, 조회 전용 — save 없음).
 *
 * pTable 은 As-Is 계약(FE "TB_MCA_"+ruleId 조립 — xfdl:402)대로 전송하되, 서버가 pRuleId 로
 * 재조립·대조한다 (Q-007 안전화 / Q-009 변수명 정정). 동적 행 컬럼 키는 대문자 그대로 수신.
 */
import { apiRequest } from "@dk-oasis/shared/http";
import type { ColDef, DataListFilters, DataRow } from "./types";

interface CactusMeta {
  txId?: string;
  success: boolean;
  code?: string;
  message?: string;
}

interface CactusResponse {
  meta: CactusMeta;
  data?: {
    result?: {
      cnt?: number;
      totalCount?: number;
      ds_GetRuleColList?: ColDef[];
      ds_GetMasterRuleDataList?: DataRow[];
      ds_GetMasterRuleDataListExport?: DataRow[];
    };
  };
}

const EP = (action: string) => `/api/mcm/oasis/masterRuleDataList/${action}`;

function baseParams(filters: DataListFilters): Record<string, unknown> {
  const p: Record<string, unknown> = {
    pRuleId: filters.pRuleId ?? "",
    pTable: filters.pRuleId ? `TB_MCA_${filters.pRuleId}` : "",   // As-Is xfdl:402 조립 계약
  };
  filters.conds.forEach((c, i) => {
    const n = i + 1;
    p[`pWhere${n}`] = c.where ?? "";
    p[`pOperator${n}`] = c.operator ?? "LIKE";
    p[`pVal${n}`] = c.val ?? "";
  });
  return p;
}

async function call(action: string, body: unknown): Promise<CactusResponse> {
  const res = await apiRequest<CactusResponse>(EP(action), {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.meta?.success) {
    throw new Error(res.meta?.message ?? `${action} 실패`);
  }
  return res;
}

export interface MasterRuleDataListRepository {
  lov(filters: DataListFilters): Promise<{ colDefs: ColDef[]; cnt: number }>;
  search(filters: DataListFilters, page: number, pageSize: number): Promise<{ list: DataRow[]; cnt: number; totalCount: number }>;
  searchExport(filters: DataListFilters): Promise<{ list: DataRow[]; cnt: number }>;
}

export function createMasterRuleDataListRepository(): MasterRuleDataListRepository {
  return {
    async lov(filters) {
      const res = await call("lov", {
        meta: { menuId: "masterRuleDataList" },
        params: { pRuleId: filters.pRuleId ?? "" },
      });
      const colDefs = res.data?.result?.ds_GetRuleColList ?? [];
      return { colDefs, cnt: Number(res.data?.result?.cnt ?? colDefs.length) };
    },

    async search(filters, page, pageSize) {
      const res = await call("search", {
        meta: { menuId: "masterRuleDataList" },
        params: { ...baseParams(filters), currentPage: page + 1, countPerPage: pageSize },   // BE 1-based
      });
      const list = res.data?.result?.ds_GetMasterRuleDataList ?? [];
      return {
        list,
        cnt: Number(res.data?.result?.cnt ?? list.length),
        totalCount: Number(res.data?.result?.totalCount ?? list.length),
      };
    },

    async searchExport(filters) {
      const res = await call("searchExport", {
        meta: { menuId: "masterRuleDataList" },
        params: baseParams(filters),
      });
      const list = res.data?.result?.ds_GetMasterRuleDataListExport ?? [];
      return { list, cnt: Number(res.data?.result?.cnt ?? list.length) };
    },
  };
}
