/** Tag관리(tagManagement) 타입·상수. 서버 응답 모양은 TagManagementService 와 같다. */
import type { OutputEvent } from "@/qpr/shared/status";

export const SCREEN_ID = "tagManagement";

export type TagStatus = "WAIT" | "ISSUED" | "REISSUED" | "DISCARDED";

export interface TagRow extends Record<string, unknown> {
  tagNo: string;
  tagKnd: "PROC" | "SHIP";
  tagKndNm: string;
  coilNo: string;
  ordNo: string | null;
  cusNm: string | null;
  prdLabel: string | null;
  specCd: string | null;
  sizeText: string | null;
  wgt: number | null;
  heatNo: string | null;
  judgStatus: string | null;
  judgStatusNm: string | null;
  prtId: string | null;
  status: TagStatus;
  statusNm: string;
  copyCnt: number;
  rissuCnt: number;
  rissuRsn: string | null;
  rissuRsnNm: string | null;
  issueBy: string | null;
  issueAt: string | null;
  note: string | null;
}

export interface TagDetail {
  tag: TagRow;
  actions: { canIssue: boolean; canReissue: boolean; canCancel: boolean; blockReason: string | null };
  history: OutputEvent[];
}

export interface ReissueForm {
  target: string;
  reasonCd: string;
  prtId: string;
  copies: string;
  note: string;
}

export interface Filters {
  fromDt: string;
  toDt: string;
  prtId: string;
  status: string;
  keyword: string;
}

/** 시연 데이터 기준 고정 시작일(발행일). 대기 Tag 는 기간과 상관없이 보인다. */
export const DEFAULT_FILTERS: Filters = { fromDt: "2026-08-31", toDt: "", prtId: "", status: "", keyword: "" };

export const PRINTERS = ["PRT-CGL2-01", "PRT-CGL5-01", "PRT-CCL-02", "PRT-출하-01"];
export const PRINTER_FILTER_OPTIONS = [{ value: "", label: "전체" }, ...PRINTERS.map((p) => ({ value: p, label: p }))];
export const PRINTER_OPTIONS = [{ value: "", label: "그대로" }, ...PRINTERS.map((p) => ({ value: p, label: p }))];

export const STATUS_OPTIONS = [
  { value: "", label: "전체" },
  { value: "WAIT", label: "대기" },
  { value: "ISSUED", label: "발행" },
  { value: "REISSUED", label: "재발행" },
  { value: "DISCARDED", label: "폐기" },
];

export const REASON_OPTIONS = [
  { value: "DAMAGE", label: "훼손" },
  { value: "LOST", label: "분실" },
  { value: "CORRECT", label: "정보 정정" },
];

export const COPY_OPTIONS = ["1", "2", "3", "4", "5"].map((v) => ({ value: v, label: `${v}매` }));

/** Tag번호(T-…) 와 코일번호를 가른다. */
export const isTagNo = (s: string) => /^T-/i.test(s.trim());
