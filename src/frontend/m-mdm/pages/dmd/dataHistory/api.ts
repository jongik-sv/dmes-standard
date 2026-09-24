/**
 * dataHistory 화면의 OASIS BFF 호출 래퍼 — `POST /api/mdm/oasis/dataHistory/{action}`, view·search(READ).
 * 항목 관리 화면의 「이력」 패널도 같은 호출을 쓴다(D8).
 */
import { callOasis } from "../dataItemMng/api";

import type { DataHistoryFilters, DataHistoryResult, DataHistoryViewResult } from "./types";

export function viewDataHistory(maruDataId?: string): Promise<DataHistoryViewResult> {
  return callOasis<DataHistoryViewResult>("dataHistory", "view", { maruDataId });
}

/** action=search — 키 필수 판정은 서버 한 곳에서 한다(H3). 화면은 빈 키도 그대로 보낸다. */
export function searchDataHistory(filters: DataHistoryFilters): Promise<DataHistoryResult> {
  return callOasis<DataHistoryResult>("dataHistory", "search", {
    maruDataId: filters.maruDataId,
    target: filters.target,
    cateId: filters.target === "CATE_ITEM" ? filters.cateId : undefined,
    key: filters.key.trim(),
  });
}
