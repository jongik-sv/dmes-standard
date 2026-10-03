/**
 * termMng 화면의 OASIS BFF 호출 래퍼 — `POST /api/mdm/oasis/termMng/{action}`(design.md §1.2).
 *   - search  — 목록 조회(§3)
 *   - save    — 등록/수정(§4, 불변 규칙 I6·I7·I8)
 *   - delete  — 삭제
 *   - compare — 유사어 추천 1차+2차 결합(A-RECO, D4, 불변 규칙 I18)
 *   - execute — 재인코딩 배치(관리자 전용, D6)
 */
import { callOasisAt, type OasisCallOptions } from "@dk-oasis/shared/http";

import { MDM_OASIS_BASE, plainError } from "@/oasis-screen";

import type { RecommendCandidate, TermForm, TermRow } from "./types";

const SERVICE = "termMng";

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

/**
 * 지금 동작 그대로 — 성공은 data 전체 위에 `data.result` 를 덮고, 거부는 일반 Error 다. 거부 문구는 meta.message 뒤에
 * errors[] 를 `field: message` 로 붙인다(base 와 같은 문구도 거르지 않는다).
 */
const OASIS: OasisCallOptions = { merge: "data+result", details: "append", errorFactory: plainError };

/**
 * OASIS `CactusRequestConverter` 는 `params` 의 각 값을 `TypedObject`(타입 힌트 없음)로 감싸는데,
 * 그 단일 인자 생성자는 값이 `null` 이면 "The type cannot be determined because object is null" 로
 * 즉시 죽는다(실측 확인, TermSaveRequest.termId·RecommendRequest.termId 가 신규 등록 시 null 이다).
 * null/undefined 키는 아예 실어 보내지 않는다(공통 계약 기본값 `omit: "nullish"`) — 서버 DTO 필드는 미지정 시 자연히 null 로 남는다.
 * `signal` 은 그대로 fetch 에 넘긴다(유사어 추천 디바운스 취소).
 */
function callAction<T>(
  action: string,
  params: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  return callOasisAt<T>(MDM_OASIS_BASE, SERVICE, action, params, undefined, { ...OASIS, signal });
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
