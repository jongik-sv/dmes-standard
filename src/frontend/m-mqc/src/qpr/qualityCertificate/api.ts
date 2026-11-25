/** 품질보증서관리 OASIS 호출 — POST /api/mqc/oasis/qualityCertificate/{search|view|save|issue|reissue|cancel|history|codes}. */
import { callOasis } from "@/common/oasis";
import type { OutputEvent } from "@/qpr/shared/status";

import { SCREEN_ID, type CertDetail, type CertRow, type Filters, type OrderOption, type QcStatus, type RequestForm } from "./types";

export async function searchCerts(f: Filters): Promise<{ rows: CertRow[]; counts: Record<QcStatus, number> }> {
  const out = await callOasis<{ rows?: CertRow[]; counts?: Record<QcStatus, number> }>(SCREEN_ID, "search", { ...f });
  return { rows: out.rows ?? [], counts: out.counts ?? { DRAFT: 0, ISSUED: 0, REISSUED: 0, RECALLED: 0 } };
}

export const viewCert = (qcNo: string) => callOasis<CertDetail>(SCREEN_ID, "view", { qcNo });
export const issueCert = (qcNo: string) => callOasis<CertDetail>(SCREEN_ID, "issue", { qcNo });
export const reissueCert = (qcNo: string, reason: string) => callOasis<CertDetail>(SCREEN_ID, "reissue", { qcNo, reason });
export const cancelCert = (qcNo: string, reason: string) => callOasis<CertDetail>(SCREEN_ID, "cancel", { qcNo, reason });

/** 발행 요청 — 코일 목록은 쉼표 문자열로 보낸다(params 에 배열 금지). */
export function requestCert(form: RequestForm) {
  return callOasis<CertDetail>(SCREEN_ID, "save", {
    ordNo: form.ordNo,
    coilNos: form.coilNos.join(","),
    tmplCd: form.tmplCd,
    langCd: form.langCd,
    note: form.note.trim(),
  });
}

export async function searchCertHistory(fromDt: string, toDt: string): Promise<OutputEvent[]> {
  const out = await callOasis<{ events?: OutputEvent[] }>(SCREEN_ID, "history", { fromDt, toDt });
  return out.events ?? [];
}

export async function loadOrders(): Promise<OrderOption[]> {
  const out = await callOasis<{ orders?: OrderOption[] }>(SCREEN_ID, "codes", {});
  return out.orders ?? [];
}
