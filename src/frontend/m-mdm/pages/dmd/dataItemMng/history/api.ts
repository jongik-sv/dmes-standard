/**
 * dataHistory 서비스의 OASIS BFF 호출 래퍼 — `POST /api/mdm/oasis/dataHistory/search`(READ).
 * 항목 편집 화면의 오른쪽 이력 패널(항목·카테고리·소속)이 쓴다(D8, D-104 로 항목 이력 화면을 합침).
 */
import { callOasis } from "../api";

import type { DataHistoryFilters, DataHistoryResult } from "./types";

/** action=search — 키 필수 판정은 서버 한 곳에서 한다(H3). 화면은 빈 키도 그대로 보낸다. */
export function searchDataHistory(filters: DataHistoryFilters): Promise<DataHistoryResult> {
  return callOasis<DataHistoryResult>("dataHistory", "search", {
    maruDataId: filters.maruDataId,
    target: filters.target,
    cateId: filters.target === "CATE_ITEM" ? filters.cateId : undefined,
    key: filters.key.trim(),
  });
}
