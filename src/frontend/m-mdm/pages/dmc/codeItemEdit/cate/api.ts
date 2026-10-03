/**
 * 코드 편집 화면 카테고리 탭의 OASIS BFF 호출(TSK-06-04 design.md §1·§2). 모양은 ../api.ts 를 복제했다 — 공유 파일을
 * 바꾸지 않는다.
 *
 * 호출: `POST /api/mdm/oasis/codeCateEdit/{action}` — view·compare(READ), restore(EDIT). 카테고리 편집 메뉴는
 * 코드 편집 화면으로 합쳐 없어졌지만(D-101) 서버 OBJECT·서비스 codeCateEdit 는 남는다. 저장·검사는 여기서 부르지
 * 않는다 — 코드 행 변경과 함께 codeItemEdit `save`·`validate` 한 번으로 보낸다(../api.ts saveAll·validateAll).
 * 버전은 문자열로 보낸다(JS number 는 2.000 의 소수 자릿수를 잃는다).
 */
import { callOasisAt, unwrapOasis, type OasisCallOptions } from "@dk-oasis/shared/http";

import { MDM_OASIS_BASE, plainError } from "@/oasis-screen";

import type { PreviewResult, ViewResult } from "./types";

const SERVICE = "codeCateEdit";

/** 지금 동작 그대로 — params 는 null·undefined 만 빼고, 성공은 `data.result` 만 펴고, 거부는 meta.message 만 담은 일반 Error. */
const OASIS: OasisCallOptions = { merge: "result", details: "none", errorFactory: plainError };

type Rows = Record<string, unknown>[];

/**
 * 봉투 해제 + 업무 거부 판정. BPMN 안에서 던진 업무 오류는 `meta.message`(서버 예외 message)만 오고 `errors[]` 는
 * 비어 있다(F11). 그래서 message 를 그대로 화면 오류 문구로 쓴다. 성공이면 `data.result` 를 펼친다(output="result").
 */
export function unwrap<T = Record<string, unknown>>(res: unknown): T {
  return unwrapOasis<T>(res, OASIS);
}

/** params 의 null·undefined 는 뺀다 — OASIS 가 null 값의 타입을 정하지 못해 요청 전체가 실패한다(F23). */
function callOasis<T>(
  action: string, params: Record<string, unknown>, grids?: Record<string, { rows: Rows }>,
): Promise<T> {
  return callOasisAt<T>(MDM_OASIS_BASE, SERVICE, action, params, grids, OASIS);
}

export function viewCategories(maruCodeId: string, ver?: string | null): Promise<ViewResult> {
  return callOasis<ViewResult>("view", { maruCodeId, ver: ver || null });
}

/** REGEX 전용 — 저장 전 후보 defExpr·defTarget 을 서버 Pattern 으로 재해석한다(원천 04:183). */
export function previewRegex(
  maruCodeId: string, ver: string, cateId: string | null, defExpr: string, defTarget: string,
): Promise<PreviewResult> {
  return callOasis<PreviewResult>("compare", { maruCodeId, ver, cateId, defExpr, defTarget });
}

export function revertCategory(
  maruCodeId: string, ver: string, rowVersion: number, table: "CATE" | "CATE_ITEM", cateId: string,
  code?: string | null,
): Promise<{ rowVersion?: number }> {
  return callOasis("restore", { maruCodeId, ver, rowVersion, table, cateId, code: code ?? null });
}
