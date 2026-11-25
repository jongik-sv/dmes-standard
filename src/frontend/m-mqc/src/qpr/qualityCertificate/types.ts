/** 품질보증서관리(qualityCertificate) 타입·상수. 서버 응답 모양은 QualityCertificateService 와 같다. */
import type { OutputEvent } from "@/qpr/shared/status";

export const SCREEN_ID = "qualityCertificate";

export type QcStatus = "DRAFT" | "ISSUED" | "REISSUED" | "RECALLED";

export interface CertRow extends Record<string, unknown> {
  qcNo: string;
  docRev: number;
  revText: string;
  ordNo: string;
  cusNm: string | null;
  poNo: string | null;
  prdLabel: string | null;
  specCd: string | null;
  sizeText: string | null;
  coilCount: number;
  totalWgt: number;
  tmplCd: string;
  tmplNm: string;
  langCd: string;
  langNm: string;
  status: QcStatus;
  statusNm: string;
  reqBy: string | null;
  reqAt: string | null;
  issueBy: string | null;
  issueAt: string | null;
  issueDate: string | null;
  note: string | null;
}

export interface CertCoil extends Record<string, unknown> {
  coilNo: string;
  sizeText: string;
  wgt: number | null;
  heatNo: string | null;
  status: string;
  statusNm: string;
  yp: number | null;
  ts: number | null;
  el: number | null;
  coat: number | null;
}

export interface GuaranteeRow extends Record<string, unknown> {
  itemCd: string;
  itemNm: string;
  basis: string;
  critTxt: string | null;
  value: string;
  result: string;
  resultNm: string;
}

export interface Actions {
  canIssue: boolean;
  canReissue: boolean;
  canCancel: boolean;
  blockReason: string | null;
}

export interface CertDetail {
  cert: CertRow;
  coils: CertCoil[];
  guarantee: GuaranteeRow[];
  actions: Actions;
  history: OutputEvent[];
}

export interface OrderOption {
  ordNo: string;
  cusNm: string | null;
  poNo: string | null;
  prdLabel: string;
  specCd: string | null;
  coils: { coilNo: string; sizeText: string; wgt: number | null; status: string; statusNm: string; takenBy: string | null }[];
}

export interface RequestForm {
  ordNo: string;
  coilNos: string[];
  tmplCd: string;
  langCd: string;
  note: string;
}

export interface Filters {
  fromDt: string;
  toDt: string;
  cusNm: string;
  status: string;
  keyword: string;
}

/** 시연 데이터 기준 고정 시작일. 종료일은 비워 시연 중 발행한 건도 보이게 한다. */
export const DEFAULT_FILTERS: Filters = { fromDt: "2026-08-25", toDt: "", cusNm: "", status: "", keyword: "" };

export const CUSTOMER_OPTIONS = [
  { value: "", label: "전체" },
  { value: "수요가 A", label: "수요가 A" },
  { value: "수요가 B", label: "수요가 B" },
  { value: "수요가 C", label: "수요가 C" },
  { value: "수요가 D", label: "수요가 D" },
];

export const STATUS_OPTIONS = [
  { value: "", label: "전체" },
  { value: "DRAFT", label: "초안" },
  { value: "ISSUED", label: "발행" },
  { value: "REISSUED", label: "재발행" },
  { value: "RECALLED", label: "회수" },
];

export const TEMPLATE_OPTIONS = [
  { value: "KS", label: "KS 표준" },
  { value: "CUS", label: "수요가 지정" },
];

export const LANG_OPTIONS = [
  { value: "KO", label: "국문" },
  { value: "EN", label: "영문" },
];
