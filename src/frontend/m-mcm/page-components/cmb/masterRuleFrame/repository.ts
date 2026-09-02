/**
 * 업무기준 구조관리 (masterRuleFrame) — Repository.
 *
 * BFF endpoints (OASIS — docs/guide/FrontEnd/standard-v2/frontend-standard/01-rules-decisions-files.md §2-2-1-A):
 *  - POST /api/mcm/oasis/masterRuleFrame/search → IN/OUT 컬럼 목록 (ds_GetRuleColInList/ds_GetRuleColOutList + cnt)
 *  - POST /api/mcm/oasis/masterRuleFrame/save   → delete-all→insert 일괄 저장 (BR-003) + 후속 재조회
 *
 * BE: com.dongkuk.dmes.mcm.cmb.masterRuleFrame.service.MasterRuleFrameService (mcm-core)
 *  (BPMN: mcm/api/src/main/resources/services/cmb/masterRuleFrame.bpmn).
 *
 * save 는 BE `save(MasterRuleFrameSearchRequest request, List<Map> inList, List<Map> outList)`
 * 시그니처에 맞춰 params(pRuleId) + grids.inList/grids.outList(전량 — As-Is 전체 송신 xfdl:363) 전송.
 *
 * P-001(업무기준 선택)은 정식 masterRuleListPop 팝업 컴포넌트 사용 (D-003 P-001 해소 2026-07-08).
 */
import { apiRequest } from "@dk-oasis/shared/http";
import type { FrameFilters, RuleColRow } from "./types";

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
      ds_GetRuleColInList?: RuleColRow[];
      ds_GetRuleColOutList?: RuleColRow[];
    };
  };
}

export type SaveRow = Record<string, unknown>;

export interface FrameSearchResult {
  inList: RuleColRow[];
  outList: RuleColRow[];
  cnt: number;
}

export interface FrameSaveResult extends FrameSearchResult {
  cntSave: number;
}

export interface MasterRuleFrameRepository {
  search(filters: FrameFilters): Promise<FrameSearchResult>;
  save(filters: FrameFilters, inRows: SaveRow[], outRows: SaveRow[]): Promise<FrameSaveResult>;
}

const ENDPOINT_SEARCH = "/api/mcm/oasis/masterRuleFrame/search";
const ENDPOINT_SAVE = "/api/mcm/oasis/masterRuleFrame/save";

export function createMasterRuleFrameRepository(): MasterRuleFrameRepository {
  return {
    async search(filters) {
      const body = {
        meta: { menuId: "masterRuleFrame" },
        params: { pRuleId: filters.pRuleId ?? "" },
      };
      const res = await apiRequest<CactusResponse>(ENDPOINT_SEARCH, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.meta?.success) {
        throw new Error(res.meta?.message ?? "조회 실패");
      }
      const inList = res.data?.result?.ds_GetRuleColInList ?? [];
      const outList = res.data?.result?.ds_GetRuleColOutList ?? [];
      return { inList, outList, cnt: Number(res.data?.result?.cnt ?? inList.length) };
    },

    async save(filters, inRows, outRows) {
      const body = {
        meta: { menuId: "masterRuleFrame" },
        params: { pRuleId: filters.pRuleId ?? "" },
        grids: {
          inList: { rows: inRows },
          outList: { rows: outRows },
        },
      };
      const res = await apiRequest<CactusResponse>(ENDPOINT_SAVE, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.meta?.success) {
        throw new Error(res.meta?.message ?? "저장 실패");
      }
      const inList = res.data?.result?.ds_GetRuleColInList ?? [];
      const outList = res.data?.result?.ds_GetRuleColOutList ?? [];
      return {
        cntSave: Number(res.data?.result?.cnt_save ?? 0),
        inList,
        outList,
        cnt: Number(res.data?.result?.cnt ?? inList.length),
      };
    },

  };
}
