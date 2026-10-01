/** workOrderMng 타입·상수. */
import { addDays, formatDateStr, today } from "@dk-oasis/shared/utils";

export interface WorkOrderRow extends Record<string, unknown> {
  woNo: string;
  itemCd: string;
  itemNm: string;
  planQty: number;
  prodQty: number;
  woStatus: string; // WAIT | RUN | DONE | HOLD
  planDt: string; // yyyy-MM-dd
}

export interface WorkOrderOperRow extends Record<string, unknown> {
  operSeq: number;
  operCd: string;
  operNm: string;
  equipCd: string;
  goodQty: number;
  defectQty: number;
}

export interface WorkOrderFilters {
  woStatus: string;
  itemCd: string;
  fromDt: string;
  toDt: string;
}

export interface WorkOrderRegisterForm {
  itemCd: string;
  planQty: string;
  planDt: string;
}

export const emptyFilters = (): WorkOrderFilters => ({
  woStatus: "",
  itemCd: "",
  fromDt: formatDateStr(addDays(today(), -7)),
  toDt: formatDateStr(today()),
});

export const emptyRegisterForm = (): WorkOrderRegisterForm => ({
  itemCd: "",
  planQty: "",
  planDt: formatDateStr(today()),
});

export const WO_STATUS_LABELS: Record<string, string> = {
  WAIT: "대기",
  RUN: "진행",
  DONE: "완료",
  HOLD: "보류",
};

export const WO_STATUS_OPTIONS = [
  { value: "", label: "전체" },
  ...Object.entries(WO_STATUS_LABELS).map(([value, label]) => ({ value, label })),
];
