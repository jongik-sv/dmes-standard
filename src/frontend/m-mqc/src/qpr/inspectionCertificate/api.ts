/** 검사증명서관리 OASIS 호출 — POST /api/mqc/oasis/inspectionCertificate/{search|view|save|issue|reissue|cancel|history|codes}. */
import { callOasis } from "@/common/oasis";
import type { OutputEvent } from "@/qpr/shared/status";

import { SCREEN_ID, type CoilOption, type Filters, type MtcDetail, type MtcRequestForm, type MtcRow, type MtcStatus } from "./types";

export async function searchMtcs(f: Filters): Promise<{ rows: MtcRow[]; counts: Record<MtcStatus, number> }> {
  const out = await callOasis<{ rows?: MtcRow[]; counts?: Record<MtcStatus, number> }>(SCREEN_ID, "search", { ...f });
  return { rows: out.rows ?? [], counts: out.counts ?? { REVIEW: 0, ISSUED: 0, HOLD: 0 } };
}

export const viewMtc = (mtcNo: string) => callOasis<MtcDetail>(SCREEN_ID, "view", { mtcNo });

/** 발행 — 하나면 상세가 함께 온다. 여러 개는 쉼표 문자열로 보낸다. */
export const issueMtcs = (mtcNos: string[]) =>
  callOasis<{ count: number; detail?: MtcDetail }>(SCREEN_ID, "issue", mtcNos.length === 1 ? { mtcNo: mtcNos[0] } : { mtcNos: mtcNos.join(",") });
export const reissueMtc = (mtcNo: string, reason: string) => callOasis<MtcDetail>(SCREEN_ID, "reissue", { mtcNo, reason });
export const holdMtc = (mtcNo: string, reason: string) => callOasis<MtcDetail>(SCREEN_ID, "cancel", { mtcNo, reason });
export const requestMtc = (f: MtcRequestForm) => callOasis<MtcDetail>(SCREEN_ID, "save", { ...f, note: f.note.trim() });

export async function searchMtcHistory(fromDt: string, toDt: string): Promise<OutputEvent[]> {
  const out = await callOasis<{ events?: OutputEvent[] }>(SCREEN_ID, "history", { fromDt, toDt });
  return out.events ?? [];
}

export async function loadCoils(): Promise<CoilOption[]> {
  const out = await callOasis<{ coils?: CoilOption[] }>(SCREEN_ID, "codes", {});
  return out.coils ?? [];
}
