/**
 * 업무기준 목록조회 (masterRuleList) — Repository.
 *
 * BFF endpoints (OASIS — docs/guide/FrontEnd/standard-v2/frontend-standard/01-rules-decisions-files.md §2-2-1-A):
 *  - POST /api/mcm/oasis/masterRuleList/search → 그리드 목록 (list + cnt)
 *  - POST /api/mcm/oasis/masterRuleList/save   → 일괄 저장 (rowStatus C/U) + 후속 재조회
 *
 * BE: com.dongkuk.dmes.mcm.cmb.masterRuleList.service.MasterRuleListService (mcm-core)
 *  (BPMN: mcm/api/src/main/resources/services/cmb/masterRuleList.bpmn).
 *
 * save 는 BE `save(MasterRuleListSearchRequest request, List<Map> master)` 시그니처에 맞춰
 * params(재조회 조건) + grids.master(변경행) 를 함께 전송한다.
 * 응답 Map { list, cnt(_save) } 는 cactus 가 data.result.{key} 로 노출.
 */
import { apiRequest } from "@dk-oasis/shared/http";
import type { RuleFilters, RuleRow } from "./types";

interface CactusMeta {
  txId?: string;
  success: boolean;
  code?: string;
  message?: string;
}

interface GridRows<T> {
  rows: T[];
}

interface CactusResponse {
  meta: CactusMeta;
  data?: {
    result?: {
      cnt?: number;
      cnt_save?: number;
      list?: RuleRow[];
    };
  };
  grids?: {
    list?: GridRows<RuleRow>;
  };
}

export type SaveRow = Record<string, unknown> & {
  rowKey: string;
  rowStatus: "C" | "U";
};

export interface SearchResult {
  list: RuleRow[];
  cnt: number;
}

export interface SaveResult {
  cntSave: number;
  list: RuleRow[];
}

export interface MasterRuleListRepository {
  search(filters: RuleFilters): Promise<SearchResult>;
  save(filters: RuleFilters, rows: SaveRow[]): Promise<SaveResult>;
}

const ENDPOINT_SEARCH = "/api/mcm/oasis/masterRuleList/search";
const ENDPOINT_SAVE = "/api/mcm/oasis/masterRuleList/save";

export function createMasterRuleListRepository(): MasterRuleListRepository {
  return {
    async search(filters) {
      const body = {
        meta: { menuId: "masterRuleList" },
        params: {
          pRuleId: filters.pRuleId ?? "",
          pRuleNm: filters.pRuleNm ?? "",
        },
      };
      const res = await apiRequest<CactusResponse>(ENDPOINT_SEARCH, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.meta?.success) {
        throw new Error(res.meta?.message ?? "조회 실패");
      }
      const list = res.data?.result?.list ?? res.grids?.list?.rows ?? [];
      return {
        list,
        cnt: Number(res.data?.result?.cnt ?? list.length),
      };
    },

    async save(filters, rows) {
      const body = {
        meta: { menuId: "masterRuleList" },
        params: {
          pRuleId: filters.pRuleId ?? "",
          pRuleNm: filters.pRuleNm ?? "",
        },
        grids: {
          master: { rows },
        },
      };
      const res = await apiRequest<CactusResponse>(ENDPOINT_SAVE, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.meta?.success) {
        throw new Error(res.meta?.message ?? "저장 실패");
      }
      return {
        cntSave: Number(res.data?.result?.cnt_save ?? 0),
        list: res.data?.result?.list ?? res.grids?.list?.rows ?? [],
      };
    },
  };
}
