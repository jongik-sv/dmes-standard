/**
 * 업무기준 컬럼 리스트 등록 팝업 (masterRuleFrameColListPopup) — Repository.
 *
 * BFF endpoints (OASIS — docs/guide/FrontEnd/standard-v2/frontend-standard/01-rules-decisions-files.md §2-2-1-A):
 *  - POST /api/mcm/oasis/masterRuleFrameColListPopup/search → 소스 테이블 컬럼 메타 (ds_grdRuleCol + cnt)
 *  - POST /api/mcm/oasis/masterRuleFrameColListPopup/save   → 전체 재등록 (delete-all→insert) → { savedCount }
 *
 * BE: com.dongkuk.dmes.mcm.cmb.masterRuleFrameColListPopup.service.MasterRuleFrameColListPopupService
 *  (BPMN: services/cmb/masterRuleFrameColListPopup.bpmn — search/save 2 액션).
 *
 * pTable 은 As-Is 계약(Script:227)대로 FE 가 "TB_MCA_" + ruleId 로 조립해 전송.
 * save 응답은 { savedCount } 만 (Q-002 확정 — 재조회 없음, 성공 시 팝업 닫기 + 부모 재조회).
 */
import { apiRequest } from "@dk-oasis/shared/http";
import type { ColListRow } from "./types";

/**
 * 이 팝업의 보안객체 ID = screenId (부모 버튼 objId·내부 RBAC 판정에 사용).
 *
 * 팝업도 자기 serviceId 로 OASIS 를 직접 호출하므로 TB_MCM_SEC_OBJ 에 OBJECT 를 갖는다
 * (mcm DataInitializer 시드 완료). 부모(masterRuleFrame)는 팝업을 여는 버튼에
 * `objId={OBJ_ID}` + `action="popup"` 를 달아 **팝업 단위**로 판정한다.
 */
export const OBJ_ID = "masterRuleFrameColListPopup";

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
      savedCount?: number;
      ds_grdRuleCol?: ColListRow[];
    };
  };
}

export type SaveRow = Record<string, unknown>;

const ENDPOINT_SEARCH = "/api/mcm/oasis/masterRuleFrameColListPopup/search";
const ENDPOINT_SAVE = "/api/mcm/oasis/masterRuleFrameColListPopup/save";

export interface MasterRuleFrameColListPopupRepository {
  search(ruleId: string): Promise<{ list: ColListRow[]; cnt: number }>;
  save(ruleId: string, rows: SaveRow[]): Promise<{ savedCount: number }>;
}

export function createMasterRuleFrameColListPopupRepository(): MasterRuleFrameColListPopupRepository {
  return {
    async search(ruleId) {
      const body = {
        meta: { menuId: "masterRuleFrameColListPopup" },
        params: {
          pRuleId: ruleId,
          pTable: `TB_MCA_${ruleId}`,   // As-Is Script:227 — "TB_MCA_"+sRuleId
        },
      };
      const res = await apiRequest<CactusResponse>(ENDPOINT_SEARCH, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.meta?.success) {
        throw new Error(res.meta?.message ?? "조회 실패");
      }
      const list = res.data?.result?.ds_grdRuleCol ?? [];
      return { list, cnt: Number(res.data?.result?.cnt ?? list.length) };
    },

    async save(ruleId, rows) {
      const body = {
        meta: { menuId: "masterRuleFrameColListPopup" },
        params: { pRuleId: ruleId, pTable: "" },
        grids: {
          rows: { rows },
        },
      };
      const res = await apiRequest<CactusResponse>(ENDPOINT_SAVE, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.meta?.success) {
        throw new Error(res.meta?.message ?? "저장 실패");
      }
      return { savedCount: Number(res.data?.result?.savedCount ?? 0) };
    },
  };
}
