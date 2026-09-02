/**
 * 업무기준 List조회 팝업 (masterRuleListPop) — Repository.
 *
 * BFF endpoint (OASIS — docs/guide/FrontEnd/standard-v2/frontend-standard/01-rules-decisions-files.md §2-2-1-A):
 *  - POST /api/mcm/oasis/masterRuleListPop/search → 현행 업무기준 목록 (ds_GetRuleMasterList + cnt)
 *
 * BE: com.dongkuk.dmes.mcm.cmb.masterRuleListPop.service.MasterRuleListPopService (mcm-core)
 *  (BPMN: mcm/api/src/main/resources/services/cmb/masterRuleListPop.bpmn — search 단일 액션).
 *
 * sSchema 는 As-Is 계약 보존 파라미터 (Q-002) — To-Be 기본 경로는 공란(MCAAPUSER 고정).
 */
import { apiRequest } from "@dk-oasis/shared/http";
import type { PopFilters, PopRuleRow } from "./types";

/**
 * 이 팝업의 보안객체 ID = screenId (부모 버튼 objId·내부 RBAC 판정에 사용).
 *
 * 팝업도 자기 serviceId 로 OASIS 를 직접 호출하므로 TB_MCM_SEC_OBJ 에 OBJECT 를 갖는다
 * (mcm DataInitializer 시드 완료). 부모(masterRuleData·masterRuleDataList·masterRuleFrame)는
 * 팝업을 여는 버튼에 `objId={OBJ_ID}` + `action="popup"` 를 달아 **팝업 단위**로 판정한다.
 */
export const OBJ_ID = "masterRuleListPop";

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
      ds_GetRuleMasterList?: PopRuleRow[];
    };
  };
}

export interface PopSearchResult {
  list: PopRuleRow[];
  cnt: number;
}

const ENDPOINT_SEARCH = "/api/mcm/oasis/masterRuleListPop/search";

export interface MasterRuleListPopRepository {
  search(filters: PopFilters, sSchema?: string): Promise<PopSearchResult>;
}

export function createMasterRuleListPopRepository(): MasterRuleListPopRepository {
  return {
    async search(filters, sSchema = "") {
      const body = {
        meta: { menuId: "masterRuleListPop" },
        params: {
          pRuleId: filters.pRuleId ?? "",
          pRuleNm: filters.pRuleNm ?? "",
          sSchema,
        },
      };
      const res = await apiRequest<CactusResponse>(ENDPOINT_SEARCH, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.meta?.success) {
        throw new Error(res.meta?.message ?? "조회 실패");
      }
      const list = res.data?.result?.ds_GetRuleMasterList ?? [];
      return { list, cnt: Number(res.data?.result?.cnt ?? list.length) };
    },
  };
}
