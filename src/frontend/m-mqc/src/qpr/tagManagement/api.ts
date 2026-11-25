/** Tag관리 OASIS 호출 — POST /api/mqc/oasis/tagManagement/{search|view|issue|reissue|cancel|history}. */
import { callOasis } from "@/common/oasis";
import type { OutputEvent } from "@/qpr/shared/status";

import { isTagNo, SCREEN_ID, type Filters, type ReissueForm, type TagDetail, type TagRow, type TagStatus } from "./types";

export async function searchTags(f: Filters): Promise<{ rows: TagRow[]; counts: Record<TagStatus, number> }> {
  const out = await callOasis<{ rows?: TagRow[]; counts?: Record<TagStatus, number> }>(SCREEN_ID, "search", { ...f });
  return { rows: out.rows ?? [], counts: out.counts ?? { WAIT: 0, ISSUED: 0, REISSUED: 0, DISCARDED: 0 } };
}

export const viewTag = (tagNo: string) => callOasis<TagDetail>(SCREEN_ID, "view", { tagNo });

/** 출력 — 하나면 상세가 함께 온다. 여러 개는 쉼표 문자열. */
export const issueTags = (tagNos: string[]) =>
  callOasis<{ count: number; detail?: TagDetail }>(SCREEN_ID, "issue", tagNos.length === 1 ? { tagNo: tagNos[0] } : { tagNos: tagNos.join(",") });

export const discardTag = (tagNo: string, reason: string) => callOasis<TagDetail>(SCREEN_ID, "cancel", { tagNo, reason });

/** 재발행 params — 대상이 T- 로 시작하면 Tag번호, 아니면 코일번호로 보낸다. */
export function reissueParams(f: ReissueForm): Record<string, string> {
  const target = f.target.trim();
  return {
    ...(isTagNo(target) ? { tagNo: target } : { coilNo: target }),
    reasonCd: f.reasonCd,
    prtId: f.prtId,
    copies: f.copies,
    note: f.note.trim(),
  };
}

export const reissueTag = (f: ReissueForm) => callOasis<TagDetail>(SCREEN_ID, "reissue", reissueParams(f));

export async function searchTagHistory(fromDt: string, toDt: string): Promise<OutputEvent[]> {
  const out = await callOasis<{ events?: OutputEvent[] }>(SCREEN_ID, "history", { fromDt, toDt });
  return out.events ?? [];
}
