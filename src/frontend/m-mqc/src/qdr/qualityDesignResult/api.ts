/**
 * 품질설계결과 화면의 OASIS 호출 — 화면 전용 qualityDesignResult 와 공용 주문 서비스 qcdOrder.
 * params 는 납작한 글자 값만 싣고, 빈 값은 보내지 않는다(서버가 「조건 없음」 으로 읽는다).
 */
import { callOasis } from "@/common/oasis";

import {
  ORDER_SERVICE,
  SCREEN_ID,
  type DesignFilters,
  type DesignHistoryEvent,
  type DesignSearchResult,
  type DesignView,
  type OrderSearchResult,
  type OrderViewResult,
} from "./types";

/** 빈 글자·undefined·null 은 뺀다. */
export function compactParams(params: Record<string, string | number | undefined | null>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (s === "") continue;
    out[k] = s;
  }
  return out;
}

export function searchDesigns(filters: DesignFilters): Promise<DesignSearchResult> {
  return callOasis<DesignSearchResult>(SCREEN_ID, "search", compactParams({ ...filters }));
}

export function viewDesign(orderKey: string): Promise<DesignView> {
  return callOasis<DesignView>(SCREEN_ID, "view", { orderKey });
}

export function calculateDesign(orderKey: string): Promise<DesignView> {
  return callOasis<DesignView>(SCREEN_ID, "calculate", { orderKey });
}

export function confirmDesign(orderKey: string): Promise<DesignView> {
  return callOasis<DesignView>(SCREEN_ID, "confirm", { orderKey });
}

/** 보류 ↔ 보류해제(서버가 상태를 뒤집는다). */
export function toggleHold(orderKey: string, note?: string): Promise<DesignView> {
  return callOasis<DesignView>(SCREEN_ID, "cancel", compactParams({ orderKey, note }));
}

export async function designHistory(orderKey: string): Promise<DesignHistoryEvent[]> {
  const out = await callOasis<{ events?: DesignHistoryEvent[] }>(SCREEN_ID, "history", { orderKey });
  return out.events ?? [];
}

/** 공용 주문 조회(qcdOrder) — 시뮬레이션의 「OMS 주문 불러오기」 도 쓴다. */
export function searchOrders(keyword?: string, prdNmCd?: string, limit?: number): Promise<OrderSearchResult> {
  return callOasis<OrderSearchResult>(ORDER_SERVICE, "search", compactParams({ keyword, prdNmCd, limit }));
}

export function viewOrder(orderKey: string): Promise<OrderViewResult> {
  return callOasis<OrderViewResult>(ORDER_SERVICE, "view", { orderKey });
}
