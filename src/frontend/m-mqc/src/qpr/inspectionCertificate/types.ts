/** 검사증명서관리(inspectionCertificate) 타입·상수. 서버 응답 모양은 InspectionCertificateService 와 같다. */
import type { OutputEvent } from "@/qpr/shared/status";

export const SCREEN_ID = "inspectionCertificate";

export type MtcStatus = "REVIEW" | "ISSUED" | "HOLD";

export interface MtcRow extends Record<string, unknown> {
  mtcNo: string;
  stdCd: string;
  coilNo: string;
  heatNo: string | null;
  ordNo: string | null;
  cusNm: string | null;
  prdLabel: string | null;
  specCd: string | null;
  sizeText: string | null;
  wgt: number | null;
  yp: number | null;
  ts: number | null;
  el: number | null;
  coat: number | null;
  fixed: boolean;
  status: MtcStatus;
  statusNm: string;
  judgStatus: string | null;
  judgStatusNm: string | null;
  inspDate: string | null;
  inspBy: string | null;
  srcCd: string;
  srcNm: string;
  langCd: string;
  langNm: string;
  docRev: number;
  reqBy: string | null;
  reqAt: string | null;
  issueBy: string | null;
  issueAt: string | null;
  note: string | null;
}

export interface MechRow extends Record<string, unknown> {
  itemCd: string;
  itemNm: string;
  critTxt: string | null;
  value: number | null;
  result: string | null;
  resultNm: string | null;
}

export interface MtcDetail {
  cert: MtcRow;
  mech: MechRow[];
  chemistry: { elemCd: string; value: number | null }[];
  actions: { canIssue: boolean; canReissue: boolean; canCancel: boolean; blockReason: string | null };
  history: OutputEvent[];
}

export interface CoilOption {
  coilNo: string;
  ordNo: string;
  heatNo: string | null;
  prdLabel: string;
  specCd: string | null;
  status: string;
  statusNm: string;
}

export interface MtcRequestForm {
  coilNo: string;
  stdCd: string;
  srcCd: string;
  langCd: string;
  note: string;
}

export interface Filters {
  fromDt: string;
  toDt: string;
  stdCd: string;
  status: string;
  keyword: string;
}

/** 시연 데이터 기준 고정 시작일(검사일). 종료일은 비운다. */
export const DEFAULT_FILTERS: Filters = { fromDt: "2026-08-28", toDt: "", stdCd: "", status: "", keyword: "" };

export const STANDARDS = ["KS D 3506", "KS D 3520", "JIS G 3302", "ASTM A653"];
export const STD_OPTIONS = [{ value: "", label: "전체" }, ...STANDARDS.map((s) => ({ value: s, label: s }))];

export const STATUS_OPTIONS = [
  { value: "", label: "전체" },
  { value: "REVIEW", label: "검토중" },
  { value: "ISSUED", label: "발행" },
  { value: "HOLD", label: "보류" },
];

export const SOURCE_OPTIONS = [
  { value: "SELF", label: "자체 시험" },
  { value: "EXT", label: "외부 기관" },
];

export const LANG_OPTIONS = [
  { value: "KO", label: "국문" },
  { value: "EN", label: "영문" },
];
