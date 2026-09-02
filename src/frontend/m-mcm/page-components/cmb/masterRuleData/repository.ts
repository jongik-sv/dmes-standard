/**
 * 업무기준 Data관리 (masterRuleData) — Repository.
 *
 * BFF endpoints (OASIS — docs/guide/FrontEnd/standard-v2/frontend-standard/01-rules-decisions-files.md §2-2-1-A):
 *  - POST /api/mcm/oasis/masterRuleData/lov          → 컬럼정의+PK판정 (ds_GetRuleColList)
 *  - POST /api/mcm/oasis/masterRuleData/search       → 동적 테이블 페이징 조회 (ds_GetMasterRuleData + totalCount)
 *  - POST /api/mcm/oasis/masterRuleData/save         → U/D/C 저장 + 재조회 동봉 (cnt_save)
 *  - POST /api/mcm/oasis/masterRuleData/searchExport → 전건 (ds_GetMasterRuleDataExport)
 *
 * BE: com.dongkuk.dmes.mcm.cmb.masterRuleData.service.MasterRuleDataService (mcm-core)
 *  (BPMN: services/cmb/masterRuleData.bpmn — 4 액션).
 *
 * pTable 은 As-Is 계약(FE "TB_MCA_"+ruleId 조립 — xfdl:406)대로 전송하되, 서버가 pRuleId 로
 * 재조립·대조한다 (Q-007 안전화). 동적 행 컬럼 키는 대문자 그대로 송수신.
 */
import { apiRequest } from "@dk-oasis/shared/http";
import type { ColDef, DataFilters, DataRow } from "./types";

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
      cnt_save?: number;
      totalCount?: number;
      ds_GetRuleColList?: ColDef[];
      ds_GetMasterRuleData?: DataRow[];
      ds_GetMasterRuleDataExport?: DataRow[];
    };
  };
}

export type SaveRow = Record<string, unknown>;

const EP = (action: string) => `/api/mcm/oasis/masterRuleData/${action}`;

function condParams(filters: DataFilters): Record<string, string> {
  const p: Record<string, string> = {};
  filters.conds.forEach((c, i) => {
    const n = i + 1;
    p[`pWhere${n}`] = c.where ?? "";
    p[`pOperator${n}`] = c.operator ?? "LIKE";
    p[`pVal${n}`] = c.val ?? "";
  });
  return p;
}

function baseParams(filters: DataFilters): Record<string, unknown> {
  return {
    pRuleId: filters.pRuleId ?? "",
    pTable: filters.pRuleId ? `TB_MCA_${filters.pRuleId}` : "",   // As-Is xfdl:406 조립 계약
    pOption: filters.urgent ? "Y" : "N",
    ...condParams(filters),
  };
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

export interface MasterRuleDataRepository {
  lov(filters: DataFilters): Promise<{ colDefs: ColDef[]; cnt: number }>;
  search(filters: DataFilters, page: number, pageSize: number): Promise<{ list: DataRow[]; cnt: number; totalCount: number }>;
  save(filters: DataFilters, page: number, pageSize: number, rows: SaveRow[]): Promise<{ cntSave: number; list: DataRow[]; totalCount: number }>;
  searchExport(filters: DataFilters): Promise<{ list: DataRow[]; cnt: number }>;
}

export function createMasterRuleDataRepository(): MasterRuleDataRepository {
  return {
    async lov(filters) {
      const res = await call("lov", {
        meta: { menuId: "masterRuleData" },
        params: { pRuleId: filters.pRuleId ?? "" },
      });
      const colDefs = res.data?.result?.ds_GetRuleColList ?? [];
      return { colDefs, cnt: Number(res.data?.result?.cnt ?? colDefs.length) };
    },

    async search(filters, page, pageSize) {
      const res = await call("search", {
        meta: { menuId: "masterRuleData" },
        params: { ...baseParams(filters), currentPage: page + 1, countPerPage: pageSize },   // BE 1-based
      });
      const list = res.data?.result?.ds_GetMasterRuleData ?? [];
      return {
        list,
        cnt: Number(res.data?.result?.cnt ?? list.length),
        totalCount: Number(res.data?.result?.totalCount ?? list.length),
      };
    },

    async save(filters, page, pageSize, rows) {
      const res = await call("save", {
        meta: { menuId: "masterRuleData" },
        params: { ...baseParams(filters), currentPage: page + 1, countPerPage: pageSize },
        grids: { rows: { rows } },
      });
      const list = res.data?.result?.ds_GetMasterRuleData ?? [];
      return {
        cntSave: Number(res.data?.result?.cnt_save ?? 0),
        list,
        totalCount: Number(res.data?.result?.totalCount ?? list.length),
      };
    },

    async searchExport(filters) {
      const res = await call("searchExport", {
        meta: { menuId: "masterRuleData" },
        params: baseParams(filters),
      });
      const list = res.data?.result?.ds_GetMasterRuleDataExport ?? [];
      return { list, cnt: Number(res.data?.result?.cnt ?? list.length) };
    },
  };
}
