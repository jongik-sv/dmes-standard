/**
 * termMng 화면의 OASIS BFF 호출 래퍼 — `POST /api/mdm/oasis/termMng/{action}`(design.md §1.2).
 *   - search  — 목록 조회(§3)
 *   - save    — 등록/수정(§4, 불변 규칙 I6·I7·I8)
 *   - delete  — 삭제
 *   - compare — 유사어 추천 1차+2차 결합(A-RECO, D4, 불변 규칙 I18)
 *   - execute — 재인코딩 배치(관리자 전용, D6)
 */
import { apiRequest } from "@dk-oasis/shared/http";

import type { RecommendCandidate, TermForm, TermRow } from "./types";

const OASIS_BASE = "/api/mdm/oasis/termMng";

interface CactusEnvelope {
  meta?: { success?: boolean; message?: string; code?: string };
  data?: Record<string, unknown>;
  errors?: Array<{ grid?: string; rowKey?: string; field?: string; message?: string }>;
}

export interface TermSearchPayload {
  list?: TermRow[];
}

export interface TermSavePayload {
  termId?: number;
  warnings?: string[];
  list?: TermRow[];
}

export interface RecommendPayload {
  candidates?: RecommendCandidate[];
  stage2Enabled?: boolean;
}

export interface ReencodeBatchPayload {
  enabled?: boolean;
  processed?: number;
  remaining?: number;
  done?: boolean;
}

function unwrap<T>(res: unknown): T {
  const env = res as CactusEnvelope;
  if (env?.meta && env.meta.success === false) {
    const base = env.meta.message?.trim() || "요청이 거부되었습니다.";
    const details = (env.errors ?? [])
      .map((e) => (e.field ? `${e.field}: ${e.message}` : e.message))
      .filter(Boolean);
    throw new Error(details.length > 0 ? `${base}\n- ${details.join("\n- ")}` : base);
  }
  const out: Record<string, unknown> = {};
  if (env?.data) {
    Object.assign(out, env.data);
    const inner = env.data["result"];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      Object.assign(out, inner as Record<string, unknown>);
    }
  }
  return out as T;
}

async function callAction<T>(
  action: string,
  params: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const res = await apiRequest<unknown>(`${OASIS_BASE}/${action}`, {
    method: "POST",
    body: JSON.stringify({ meta: { menuId: "termMng" }, params }),
    signal,
  });
  return unwrap<T>(res);
}

/** action=search — §3 S-001~S-003. */
export async function searchTerms(keyword: string, systems: string, context: string): Promise<TermSearchPayload> {
  return callAction<TermSearchPayload>("search", { keyword, systems, context });
}

/** action=save — §4 D-001~D-011. synonyms/aliases/systems 는 콤마 구분 원본 문자열 그대로 보낸다. */
export async function saveTerm(form: TermForm): Promise<TermSavePayload> {
  return callAction<TermSavePayload>("save", {
    termId: form.termId,
    termName: form.termName,
    senseNo: form.senseNo === "" ? null : Number(form.senseNo),
    definition: form.definition,
    context: form.context,
    engName: form.engName,
    engAbbr: form.engAbbr,
    synonyms: form.synonyms,
    aliases: form.aliases,
    systems: form.systems,
    stdBasis: form.stdBasis,
  });
}

/** action=delete. */
export async function deleteTerm(termId: number): Promise<void> {
  await callAction<Record<string, unknown>>("delete", { termId });
}

/** action=compare(method=recommend) — A-RECO. 디바운스 취소를 위해 signal 을 그대로 전달한다. */
export async function recommend(
  termId: number | null,
  termName: string,
  definition: string,
  engName: string,
  signal?: AbortSignal,
): Promise<RecommendPayload> {
  return callAction<RecommendPayload>("compare", { termId, termName, definition, engName }, signal);
}

/** action=execute(method=reencodeBatch) — 관리자 전용, 청크 폴링(D6). */
export async function reencodeBatch(chunkSize = 500): Promise<ReencodeBatchPayload> {
  return callAction<ReencodeBatchPayload>("execute", { chunkSize });
}
