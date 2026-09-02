/**
 * 일반 업무기준 등록(Excel Upload) (masterRuleDataUploadFilePopup) — Repository.
 *
 * BFF endpoints (OASIS — m-mcm CLAUDE.md "mcm = OASIS 무조건"):
 *  - POST /api/mcm/oasis/masterRuleDataUploadFilePopup/searchCol → 컬럼정의 (ds_GetRuleColUploadList)
 *  - POST /api/mcm/oasis/masterRuleDataUploadFilePopup/search    → 다운로드용 전건 (ds_GetRuleDataUploadList)
 *  - POST /api/mcm/oasis/masterRuleDataUploadFilePopup/save      → Excel 일괄 등록 (cnt_import)
 *
 * BE: com.dongkuk.dmes.mcm.cmb.masterRuleDataUploadFilePopup.service.MasterRuleDataUploadFilePopupService
 *  (BPMN: services/cmb/masterRuleDataUploadFilePopup.bpmn — 3 액션).
 *
 * pTable 은 As-Is 계약(FE "TB_MCA_"+ruleId 조립 — xfdl:177/213)대로 전송하되, 서버가 pRuleId 로
 * 재조립·대조한다 (Q-104 안전화). 업로드 행 컬럼 키는 대문자 COL_ID 그대로 송신.
 */
import { apiRequest } from "@dk-oasis/shared/http";
import type { ColDef, UploadRow } from "./types";

/**
 * 이 팝업의 보안객체 ID = screenId (부모 버튼 objId·내부 RBAC 판정에 사용).
 *
 * 팝업도 자기 serviceId 로 OASIS 를 직접 호출하므로 TB_MCM_SEC_OBJ 에 OBJECT 를 갖는다
 * (mcm DataInitializer 시드 완료). 부모(masterRuleData)는 팝업을 여는 버튼에
 * `objId={OBJ_ID}` + `action="popup"` 를 달아 **팝업 단위**로 판정한다.
 */
export const OBJ_ID = "masterRuleDataUploadFilePopup";

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
      cnt_import?: number;
      ds_GetRuleColUploadList?: ColDef[];
      ds_GetRuleDataUploadList?: UploadRow[];
    };
  };
}

const EP = (action: string) => `/api/mcm/oasis/masterRuleDataUploadFilePopup/${action}`;

function baseParams(ruleId: string): Record<string, unknown> {
  return {
    pRuleId: ruleId ?? "",
    pTable: ruleId ? `TB_MCA_${ruleId}` : "",   // As-Is xfdl:177/213 조립 계약
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

export interface MasterRuleDataUploadFilePopupRepository {
  searchCol(ruleId: string): Promise<{ colDefs: ColDef[]; cnt: number }>;
  search(ruleId: string): Promise<{ list: UploadRow[]; cnt: number }>;
  save(ruleId: string, regFlag: boolean, rows: UploadRow[]): Promise<{ cntImport: number }>;
}

export function createMasterRuleDataUploadFilePopupRepository(): MasterRuleDataUploadFilePopupRepository {
  return {
    async searchCol(ruleId) {
      const res = await call("searchCol", {
        meta: { menuId: "masterRuleDataUploadFilePopup" },
        params: { pRuleId: ruleId ?? "" },
      });
      const colDefs = res.data?.result?.ds_GetRuleColUploadList ?? [];
      return { colDefs, cnt: Number(res.data?.result?.cnt ?? colDefs.length) };
    },

    async search(ruleId) {
      const res = await call("search", {
        meta: { menuId: "masterRuleDataUploadFilePopup" },
        params: baseParams(ruleId),
      });
      const list = res.data?.result?.ds_GetRuleDataUploadList ?? [];
      return { list, cnt: Number(res.data?.result?.cnt ?? list.length) };
    },

    async save(ruleId, regFlag, rows) {
      const res = await call("save", {
        meta: { menuId: "masterRuleDataUploadFilePopup" },
        params: { ...baseParams(ruleId), pRegFlag: regFlag ? "true" : "false" },   // As-Is chk_regFlag.value (xfdl:214)
        grids: { rows: { rows } },
      });
      return { cntImport: Number(res.data?.result?.cnt_import ?? 0) };
    },
  };
}
