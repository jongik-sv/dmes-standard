/**
 * domainMng 화면의 OASIS BFF 호출 래퍼 — `POST /api/mdm/oasis/domainMng/{action}`(기능설계서 §1.2).
 *
 * BFF 가 MDM_WAS_URL 로 프록시하고 신뢰 헤더를 붙인다. 두 가지는 B0 실측(design.md §9.1)으로 정한 규칙이다.
 *  - grids(testCases·examples·vars)는 **빈 배열이라도 늘 보낸다** — 빠지면 OASIS 가 메서드를 찾지 못한다.
 *  - params 에서 **null·undefined·빈 문자열 값은 키째 뺀다** — null 값이 하나라도 있으면 요청 전체가 S999 로 실패한다.
 * OASIS 는 서비스 예외를 HTTP 200 + `meta.success=false` 로 돌려주므로 공통 계약(`@dk-oasis/shared/http` callOasisAt)이 던진다.
 */
import { callOasisAt, type OasisCallOptions } from "@dk-oasis/shared/http";

import { MDM_OASIS_BASE, plainError } from "@/oasis-screen";

import type {
  DomainDraft, ExecuteResult, PreviewRequest, SaveResult, SearchFilters, SearchResult, TestCaseRow,
  ValidateResult, ViewResult,
} from "./types";

const SERVICE = "domainMng";

type Grids = Record<string, { rows: Array<Record<string, unknown>> }>;

/** 지금 동작 그대로 — params 는 null·undefined·공백만 있는 문자열을 빼고, 성공은 data 전체 위에 `data.result` 를 덮고, 거부는 meta.message 만 담은 일반 Error. */
const OASIS: OasisCallOptions = { omit: "nullish+blank", merge: "data+result", details: "none", errorFactory: plainError };

function callAction<T>(action: string, params: object, grids?: Grids): Promise<T> {
  return callOasisAt<T>(MDM_OASIS_BASE, SERVICE, action, params, grids, OASIS);
}

function draftGrids(cases: TestCaseRow[], examples: string[]): Grids {
  return {
    testCases: { rows: cases as unknown as Array<Record<string, unknown>> },
    examples: { rows: examples.map((v) => ({ VALUE: v })) },
  };
}

/** B-001 조회. */
export function searchDomains(filters: SearchFilters): Promise<SearchResult> {
  return callAction("search", { keyword: filters.keyword, domainKind: filters.domainKind });
}

/** 행 선택 — 상세·요구 변수·영향도. */
export function viewDomain(domainId: number): Promise<ViewResult> {
  return callAction("view", { domainId });
}

/** B-004 도메인검증 — 쓰기 없음. */
export function validateDomain(draft: DomainDraft, cases: TestCaseRow[], examples: string[]): Promise<ValidateResult> {
  return callAction("validate", draft, draftGrids(cases, examples));
}

/** B-005 저장. */
export function saveDomain(draft: DomainDraft, cases: TestCaseRow[], examples: string[]): Promise<SaveResult> {
  return callAction("save", draft, draftGrids(cases, examples));
}

/** 서버 미리보기(자동, 디바운스) — 쓰기 없음. vars = [{NAME, VALUE}]. */
export function executePreview(req: PreviewRequest, vars: Array<{ NAME: string; VALUE: string }>): Promise<ExecuteResult> {
  return callAction("execute", req, { vars: { rows: vars } });
}
