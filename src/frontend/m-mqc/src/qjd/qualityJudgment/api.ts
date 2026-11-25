/**
 * 품질판정 OASIS 호출 — POST /api/mqc/oasis/qualityJudgment/{search|view|judge|confirm|history|codes}.
 * params 는 평평한 키-값만 보낸다(배열은 쉼표 문자열, 검사값은 JSON 문자열).
 */
import { callOasis } from "@/common/oasis";

import { SCREEN_ID, type CoilRow, type CriteriaRow, type Filters, type JudgmentDetail, type JudgmentEvent, type JudgmentStatus, type SearchResult } from "./types";

export async function searchCoils(f: Filters): Promise<SearchResult> {
  const out = await callOasis<{ rows?: CoilRow[]; counts?: Record<JudgmentStatus, number> }>(SCREEN_ID, "search", { ...f });
  // 배지 묶음(객체 배열)을 그리드 값으로 두면 ag-grid 가 object 형식 경고(#48)를 낸다 — 글자 칸 checkText 를 더해 그 칸에 그린다.
  const rows = (out.rows ?? []).map((r) => ({ ...r, checkText: (r.badges ?? []).map((b) => `${b.short}:${b.result}`).join(" ") }));
  return { rows, counts: out.counts ?? { WAIT: 0, PASS: 0, FAIL: 0, HOLD: 0 } };
}

export function viewCoil(coilNo: string): Promise<JudgmentDetail> {
  return callOasis<JudgmentDetail>(SCREEN_ID, "view", { coilNo });
}

/** 고친 검사값만 보낸다. 빈 칸은 미검(빈 문자열), 「재검」 은 보류다. */
export function buildValuesJson(edits: Record<string, string>): string {
  const keys = Object.keys(edits);
  if (keys.length === 0) return "";
  const out: Record<string, string> = {};
  for (const k of keys) out[k] = edits[k].trim();
  return JSON.stringify(out);
}

export function judgeCoil(coilNo: string, edits: Record<string, string>): Promise<JudgmentDetail> {
  return callOasis<JudgmentDetail>(SCREEN_ID, "judge", { coilNo, valuesJson: buildValuesJson(edits) });
}

export async function confirmCoils(coilNos: string[], status: Exclude<JudgmentStatus, "WAIT">, note: string): Promise<{ count: number; detail?: JudgmentDetail }> {
  return callOasis<{ count: number; detail?: JudgmentDetail }>(SCREEN_ID, "confirm", { coilNos: coilNos.join(","), status, note: note.trim() });
}

export async function searchHistory(fromDt: string, toDt: string): Promise<JudgmentEvent[]> {
  const out = await callOasis<{ events?: JudgmentEvent[] }>(SCREEN_ID, "history", { fromDt, toDt });
  return out.events ?? [];
}

export async function loadCriteria(prdCd: string, keyword: string): Promise<CriteriaRow[]> {
  const out = await callOasis<{ criteria?: CriteriaRow[] }>(SCREEN_ID, "codes", { prdCd, keyword });
  return out.criteria ?? [];
}
