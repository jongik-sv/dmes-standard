/*
 * 작성자: Agent
 * 작성일: 2026-05-28
 * 내용: masterCodeUploadFilePopup FE API — BPMN action 2 종 (search / save) OASIS endpoint.
 *       UI→BFF: /api/mcm/oasis/masterCodeUploadFilePopup/{search,save}
 *
 *       NOTE (docs/guide/FrontEnd/standard-v2/frontend-standard/01-rules-decisions-files.md §2-2-1-A): mcm 모듈은 SqlSession 미등록 → Phase 7 라우트 사용 금지.
 *       OASIS만 사용 (`apiRequest`).
 *
 *       전송 spec (사용자 결정 §12): JSON (row 배열) — As-Is OASIS gfn_transaction 컨벤션 유지.
 */
import { apiRequest } from "@dk-oasis/shared/http";
import { MODULE_ID, SERVICE_ID, MENU_ID } from "./constants";
import type {
  MasterCodeUploadResponseRow,
  MasterCodeUploadRow,
} from "./types";

interface CactusResponse<TGrids = unknown, TData = unknown> {
  meta?: { success?: boolean; code?: string; message?: string };
  grids?: TGrids;
  data?: TData;
}

interface UploadSearchGrids {
  codeUploadList?: { rows?: MasterCodeUploadResponseRow[] };
}

const META = { userId: "current", menuId: MENU_ID };

/**
 * API-001 search — As-Is BPMN action="search" / Task_2 / GetCodeUploadList (분석 §8.4).
 * 요청: { pCodeId } — As-Is xfdl:192 `gfn_setParam("pCodeId", this.sMasterCode)`.
 * 응답: 7 컬럼 row 배열 (CODE_VER 포함).
 */
export async function searchMasterCodeUploadList(
  pCodeId: string,
): Promise<MasterCodeUploadResponseRow[]> {
  const res = await apiRequest<CactusResponse<UploadSearchGrids>>(
    `/api/${MODULE_ID}/oasis/${SERVICE_ID}/search`,
    {
      method: "POST",
      body: JSON.stringify({ meta: META, params: { pCodeId } }),
    },
  );
  return res.grids?.codeUploadList?.rows ?? [];
}

/**
 * API-002 save — As-Is BPMN action="save" / UserTask_09dxtkf / SaveMasterCodeFileUpload (분석 §8.5).
 * 요청: { pCodeId, pRegFlag, dsGrdUpload (row 배열) } — As-Is xfdl:214-219.
 *   - pCodeId  = 호출자 sMasterCode (xfdl:218)
 *   - pRegFlag = chk_regFlag.value (xfdl:219, "true" 일 때만 선 DELETE)
 *   - dsGrdUpload = Excel 미리보기 6 컬럼 row 배열 (xfdl:216)
 * 응답: cnt_import (INSERT 성공 row 수, As-Is java:68).
 */
export async function saveMasterCodeFileUpload(
  pCodeId: string,
  pRegFlag: boolean,
  rows: MasterCodeUploadRow[],
): Promise<number> {
  const res = await apiRequest<CactusResponse<unknown, { cnt_import?: number }>>(
    `/api/${MODULE_ID}/oasis/${SERVICE_ID}/save`,
    {
      method: "POST",
      body: JSON.stringify({
        meta: META,
        params: {
          pCodeId,
          // As-Is xfdl:219 — boolean 을 "true" / "false" 문자열로 직렬화 (Java pRegFlag.equals("true"))
          pRegFlag: pRegFlag ? "true" : "false",
        },
        // As-Is sInDatasets="dsGrdUpload=dsGrdUpload" — OASIS dataset alias 1:1
        grids: {
          dsGrdUpload: { rows },
        },
      }),
    },
  );
  return res.data?.cnt_import ?? 0;
}
