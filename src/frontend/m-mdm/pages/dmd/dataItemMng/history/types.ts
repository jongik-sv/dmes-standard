/**
 * dataHistory(항목 이력) 서비스 타입 — 서버 DTO camelCase 그대로(TSK-07-03 design.md §2). 사건·빈 구간·행 상태·마지막
 * 상태는 서버가 계산한다(H2). 화면은 그대로 그린다.
 */
import type { DataItemHeader, DataItemValues } from "../types";

export type HistoryTarget = "ITEM" | "CATE" | "CATE_ITEM";
export type HistoryEvent = "CREATED" | "CHANGED" | "REOPENED";
export type HistoryRowState = "OPEN" | "PAST" | "CLOSED";
export type HistoryState = "OPEN" | "CLOSED" | "NONE";

export type DataHistoryRow = Partial<DataItemValues> & {
  validFrom: string;
  validTo: string;
  open: boolean;
  event: HistoryEvent;
  rowState: HistoryRowState;
  gapFrom: string | null;
  gapTo: string | null;
  rowVersion?: number | null;
  cateName?: string | null;
  defKind?: string | null;
  defTarget?: string | null;
  defExpr?: string | null;
};

export interface DataHistoryResult {
  header?: DataItemHeader | null;
  target?: HistoryTarget;
  key?: string;
  rows?: DataHistoryRow[];
  state?: HistoryState;
}

export interface DataHistoryFilters {
  maruDataId: string;
  target: HistoryTarget;
  cateId: string;
  key: string;
}

export const TARGET_OPTIONS: { value: HistoryTarget; label: string }[] = [
  { value: "ITEM", label: "항목" },
  { value: "CATE", label: "카테고리" },
  { value: "CATE_ITEM", label: "소속" },
];

export const EVENT_LABELS: Record<HistoryEvent, string> = {
  CREATED: "생성",
  CHANGED: "변경",
  REOPENED: "다시 열기",
};

export const ROW_STATE_LABELS: Record<HistoryRowState, string> = {
  OPEN: "열림",
  PAST: "지난 행",
  CLOSED: "소멸(닫힘)",
};

export const STATE_LABELS: Record<HistoryState, string> = {
  OPEN: "열림",
  CLOSED: "소멸(닫힘)",
  NONE: "행 없음",
};

/** 빈 구간 줄의 사건 칸 문구. */
export const GAP_LABEL = "닫혀 있던 구간";
