/**
 * dme 화면(ruleMng·ruleEdit)의 OASIS BFF 호출 — `POST /api/mdm/oasis/{serviceId}/{action}`(TSK-08-02 design F30).
 *
 * 요청 조립·봉투 해제·거부 판정은 `@dk-oasis/shared/http` 의 공통 계약(callOasisAt) 기본값 그대로다 — 본문
 * `{meta:{menuId}, params, grids?}`, params 의 null·undefined 칸은 빼고(OASIS 는 null 값을 받지 못한다, “object is null”),
 * 배열은 `grids.<이름>.rows` 로 보낸다(params 배열은 “Generic type” 오류, design Build 이탈 B4). 거부는 `OasisCallError`
 * (`code`, 문구는 `기본 문구 + "\n- 항목명: 메시지"`). 항목명은 MDM 공통 맵(`mdmFieldLabel`)만 쓴다 — 룰 화면의 서버 field 는
 * `var:<id>`·변수명·확정 검사 항목 이름 같은 합성 값이라 메시지만 보인다. 이 파일에는 MDM 경로와 MDM 업무 코드 판정(MDM001~003)만 남는다.
 */
import { OasisCallError, callOasisAt, isOasisCallError, omitParams, type OasisCallOptions, type OasisGrids } from "@dk-oasis/shared/http";

import { MDM_OASIS_BASE, mdmFieldLabel } from "@/oasis-screen";

export { OasisCallError };

const OASIS: OasisCallOptions = { fieldLabel: mdmFieldLabel() };

/** MDM001(row_version 충돌)의 기본 문구 — BPMN 경로에서 meta.message 는 이 문구로 시작한다. */
const ROW_VERSION_CONFLICT_MESSAGE = "다른 사용자가 수정했습니다";

/**
 * row_version 충돌(MDM001)인가. 서버 meta.code(2026-10-05 부터 MDMnnn)로 먼저 보고, 문구는 예비다 — 코드가 오지 않는 경로(HTTP 오류
 * 본문)와 meta.code 가 S001 이던 옛 서버가 남아 있어도 안내가 사라지지 않게 한다.
 */
export function isRowVersionConflict(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  if (isOasisCallError(e) && e.code === "MDM001") return true;
  return e.message.includes("MDM001") || e.message.startsWith(ROW_VERSION_CONFLICT_MESSAGE);
}

/**
 * row_version 충돌(MDM001) 안내 — 룰 화면(ruleEdit)·룰 상세(ruleMng)·룰 세트 편집(ruleSetEdit)이 같은 문구를 쓴다(ruleEdit 기능설계서 §6.2).
 * 서버 문구("다른 사용자가 수정했습니다")를 그대로 보이지 않고, 화면은 이 문구와 함께 [다시 불러오기] 를 준다.
 */
export const CONFLICT_MESSAGE = "다른 창에서 바뀌었습니다. 다시 불러오세요";

/** 쓰기 실패를 화면 안내로 바꾼다 — 충돌(MDM001)이면 `CONFLICT_MESSAGE` 와 `conflict: true`, 그 밖은 서버 문구 그대로. */
export function writeFailure(e: unknown): { conflict: boolean; message: string } {
  if (isRowVersionConflict(e)) return { conflict: true, message: CONFLICT_MESSAGE };
  return { conflict: false, message: e instanceof Error ? e.message : String(e) };
}

/** DRAFT 가 아니거나(MDM002) 내 DRAFT 가 아니다(MDM003) — 다른 곳에서 확정·넘기기·삭제됐다(D-144 2단계). 코드 1순위, 문구는 예비(위와 같다). */
export function isDraftGone(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  if (isOasisCallError(e) && (e.code === "MDM002" || e.code === "MDM003")) return true;
  return e.message.startsWith("DRAFT 상태에서만") || e.message.startsWith("DRAFT 소유자만");
}

/** params 의 null·undefined 를 뺀다(빈 문자열은 남긴다) — 공통 계약 `omitParams` 의 `nullish`. */
export function omitNullish(params: Record<string, unknown>): Record<string, unknown> {
  return omitParams(params, "nullish");
}

/** `POST /api/mdm/oasis/{serviceId}/{action}` — 공통 계약 기본값(nullish·data+result·append-dedup·OasisCallError) + 공통 항목명. */
export function callOasis<T>(
  serviceId: string,
  action: string,
  params: Record<string, unknown>,
  grids?: OasisGrids,
): Promise<T> {
  return callOasisAt<T>(MDM_OASIS_BASE, serviceId, action, params, grids, OASIS);
}
