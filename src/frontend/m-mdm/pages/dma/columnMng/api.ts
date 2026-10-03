/**
 * columnMng 화면의 OASIS BFF 호출 래퍼(TSK-04-04 design.md §6.17, noticeMgmt/api.ts 선례).
 *
 * 호출 패턴: `POST /api/mdm/oasis/columnMng/{action}` — search·view·compare(READ), save(EDIT).
 * BFF 가 `MDM_WAS_URL` 로 프록시하고 인증 헤더를 주입한다. 화면은 헤더를 다루지 않는다.
 */
import { callOasisAt, unwrapOasis, type OasisCallOptions } from "@dk-oasis/shared/http";

import { MDM_OASIS_BASE, plainError } from "@/oasis-screen";

import type { DomainRow } from "@/domain";

import type {
  CompareResult,
  Direction,
  SearchResult,
  ViewResult,
} from "./types";

type Rows = Record<string, unknown>[];

/**
 * 지금 동작 그대로 — `apiRequest` 는 non-2xx 만 throw 하므로 `meta.success === false` 는 공통 계약이 본다.
 * BPMN 안에서 던진 업무 오류는 `meta.message`(= 서버 예외 message)만 오고 `errors[]` 는 비어 있다(design.md F12).
 * 그래서 message 만 담은 일반 Error 를 던진다. 성공이면 `data.result` 만 펼친다(output="result").
 */
const OASIS: OasisCallOptions = { merge: "result", details: "none", errorFactory: plainError };

/** 응답 봉투 해제 + 업무 거부 판정 — 위 옵션 그대로. */
export function unwrap<T = Record<string, unknown>>(res: unknown): T {
  return unwrapOasis<T>(res, OASIS);
}

/**
 * 공통 호출 — termRegPop/api.ts 도 serviceId 만 바꿔 쓴다.
 * params 의 null·undefined 값은 뺀다 — OASIS 가 null 값의 타입을 정하지 못해 "The type cannot be determined because
 * object is null" 로 요청 전체가 실패한다(design.md 「Build 이탈」 B3). 서버 DTO 에서는 빠진 키가 곧 null 이다.
 */
export function callOasis<T>(
  serviceId: string,
  action: string,
  params: Record<string, unknown>,
  grids?: Record<string, { rows: Rows }>,
): Promise<T> {
  return callOasisAt<T>(MDM_OASIS_BASE, serviceId, action, params, grids, OASIS);
}

/** 도메인 조건은 도메인 ID·도메인명·표준명에 대소문자 무시 부분 일치하는 키워드다(서버 domainKeyword). 비면 전체. */
export function searchColumns(
  keyword: string,
  domainKeyword: string,
): Promise<SearchResult> {
  const dk = domainKeyword.trim();
  return callOasis<SearchResult>("columnMng", "search", {
    keyword,
    domainKeyword: dk === "" ? null : dk,
  });
}

/**
 * 편집 폼 도메인 칸의 서버 검색 — 룰 편집(ruleEdit)의 도메인 검색 action(target=DOMAIN, 8건)을 그대로 쓴다.
 * 두 화면이 같은 도메인 테이블을 같은 규칙으로 찾는다. 콤보에 전체 목록을 싣지 않는다.
 */
export async function searchDomains(keyword: string): Promise<DomainRow[]> {
  const kw = keyword.trim();
  const res = await callOasis<{ rows?: DomainRow[] }>("ruleEdit", "search", {
    target: "DOMAIN",
    keyword: kw === "" ? null : kw,
  });
  return res.rows ?? [];
}

/** 진입 때 시스템 콤보 값만 받는다(optionsOnly — 서버 목록 조회 없음, list 는 빈 배열). */
export function loadColumnOptions(): Promise<SearchResult> {
  return callOasis<SearchResult>("columnMng", "search", { optionsOnly: true });
}

export function viewColumn(columnId: number): Promise<ViewResult> {
  return callOasis<ViewResult>("columnMng", "view", { columnId });
}

export function compareName(
  direction: Direction,
  input: string,
): Promise<CompareResult> {
  return callOasis<CompareResult>("columnMng", "compare", { direction, input });
}

/**
 * 저장. 그리드 이름 `systems`·`terms` 는 서버 메서드 파라미터 이름과 글자 단위로 같아야 하고, 빈 목록이어도 **항상**
 * 보낸다 — 그리드를 빼면 서버 바인딩이 실패한다(I16, design.md 「Build 이탈」 B1). 배열은 params 에 싣지 않는다.
 */
export function saveColumn(
  params: Record<string, unknown>,
  systems: Rows,
  terms: Rows,
): Promise<{ columnId: number }> {
  return callOasis<{ columnId: number }>("columnMng", "save", params, {
    systems: { rows: systems },
    terms: { rows: terms },
  });
}
