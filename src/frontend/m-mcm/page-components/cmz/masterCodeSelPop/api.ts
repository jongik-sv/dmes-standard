"use client";

import { apiRequest } from "@dk-oasis/shared/http";
import type { MasterCodeRow, SearchRequest } from "./types";

/**
 * 마스터코드 선택 팝업 — API 호출 헬퍼.
 *
 * 설계서 정본 — BPMN설계서 §1 (API-001):
 *   UI → BFF: POST /api/mcm/oasis/masterCodeSelPop/search
 *   BFF → BE: POST /oasis/masterCodeSelPop/search
 *
 * 백엔드 OASIS BPMN (`services/cma/masterCodeSelPop.bpmn`):
 *   actionGateway → flow_search → searchTask (masterCodeSelPopService#search)
 *   output = "items"
 *
 * 요청 형식 (cactus CactusRequest 표준):
 *   ```
 *   {
 *     meta: { userId, menuId },           // CactusRequestConverter L37 가 sevenContext 에서 사용
 *     params: { pCodeId, pDiv, pValue },  // CactusRequestConverter L37-40 flat 전개 → inputs Map
 *     grids: { ... }                       // 본 화면은 grids 없음
 *   }
 *   ```
 *   (mcm cma 4 화면 통일 패턴 — masterCodeMng / masterCodeUploadFilePopup 등)
 *
 * 응답 형식 (cactus CactusResponse):
 *   ```
 *   {
 *     meta: { txId, success, code, message },
 *     grids: { items: { rows: [ { CODE_VAL, CODE_VAL_MEAN, CATEGORY_ID, CATEGORY_NM }, ... ] } },
 *     ...
 *   }
 *   ```
 *   Service#search 가 `List<Map<String, Object>>` 를 반환하므로 CactusResponseConverter
 *   (cactus-core L52-76) 가 List 결과를 `grids.{output}.rows` 로 적재.
 *   data 가 아닌 grids 임에 유의 — 결과 List 인 경우 grids 분기.
 */

/**
 * 이 팝업의 보안객체 ID = screenId (부모 버튼 objId·내부 RBAC 판정에 사용).
 *
 * 팝업도 자기 serviceId 로 OASIS 를 직접 호출하므로 TB_MCM_SEC_OBJ 에 OBJECT 를 갖는다
 * (mcm DataInitializer 시드 완료). 부모는 팝업을 여는 버튼에 `objId={OBJ_ID}` + `action="popup"`
 * 를 달아 **팝업 단위**로 권한을 판정한다 — 문자열 리터럴을 흩뿌리면 한쪽만 고쳐 갈린다.
 */
export const OBJ_ID = "masterCodeSelPop";

interface GridResult<T> {
  rows?: T[];
}

interface CactusResponse<TGrids = unknown, TData = unknown> {
  meta?: { success?: boolean; code?: string; message?: string };
  grids?: TGrids;
  data?: TData;
}

interface SearchGrids {
  items?: GridResult<MasterCodeRow>;
}

/** As-Is OASIS gfn_transaction 헤더 컨텍스트 — 다른 mcm cma 화면과 통일. */
const META = { userId: "current", menuId: "masterCodeSelPop" };

/**
 * 마스터코드 검색 (As-Is GetCodeDetailList 등가).
 *
 * As-Is mui Mapper.xml 의 입력 파라미터 (분석리포트 §6):
 *   - pCodeId (선택 — UPPER(CODE_ID) = UPPER(#{pCodeId}))
 *   - pDiv    (CODE_VAL or CODE_VAL_MEAN — LIKE 컬럼 분기)
 *   - pValue  (LIKE %...% — Oracle '||' → MSSQL '+' 변환은 BE Service 가 흡수)
 */
export async function searchMasterCodes(req: SearchRequest): Promise<MasterCodeRow[]> {
  const res = await apiRequest<CactusResponse<SearchGrids>>(
    "/api/mcm/oasis/masterCodeSelPop/search",
    {
      method: "POST",
      body: JSON.stringify({ meta: META, params: req }),
    },
  );
  return res?.grids?.items?.rows ?? [];
}
