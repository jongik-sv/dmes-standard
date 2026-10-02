/**
 * columnMng 화면의 OASIS BFF 호출 래퍼(TSK-04-04 design.md §6.17, noticeMgmt/api.ts 선례).
 *
 * 호출 패턴: `POST /api/mdm/oasis/columnMng/{action}` — search·view·compare(READ), save(EDIT).
 * BFF 가 `MDM_WAS_URL` 로 프록시하고 인증 헤더를 주입한다. 화면은 헤더를 다루지 않는다.
 */
import { apiRequest } from "@dk-oasis/shared/http";

import type {
  CompareResult,
  Direction,
  SearchResult,
  ViewResult,
} from "./types";

interface CactusEnvelope {
  meta?: { success?: boolean; message?: string | null; code?: string };
  data?: Record<string, unknown>;
}

type Rows = Record<string, unknown>[];

/**
 * 응답 봉투 해제 + 업무 거부 판정. `apiRequest` 는 non-2xx 만 throw 하므로 `meta.success === false` 를 직접 본다.
 * BPMN 안에서 던진 업무 오류는 `meta.message`(= 서버 예외 message)만 오고 `errors[]` 는 비어 있다(design.md F12).
 * 그래서 message 를 그대로 화면 오류 문구로 쓴다. 성공이면 `data.result` 를 펼친다(output="result").
 */
export function unwrap<T = Record<string, unknown>>(res: unknown): T {
  const env = res as CactusEnvelope;
  if (env?.meta && env.meta.success === false) {
    throw new Error(env.meta.message?.trim() || "요청이 거부되었습니다.");
  }
  const out: Record<string, unknown> = {};
  const inner = env?.data?.["result"];
  if (inner && typeof inner === "object" && !Array.isArray(inner)) {
    Object.assign(out, inner as Record<string, unknown>);
  }
  return out as T;
}

/**
 * 공통 호출 — termRegPop/api.ts 도 serviceId 만 바꿔 쓴다.
 * params 의 null·undefined 값은 뺀다 — OASIS 가 null 값의 타입을 정하지 못해 "The type cannot be determined because
 * object is null" 로 요청 전체가 실패한다(design.md 「Build 이탈」 B3). 서버 DTO 에서는 빠진 키가 곧 null 이다.
 */
export async function callOasis<T>(
  serviceId: string,
  action: string,
  params: Record<string, unknown>,
  grids?: Record<string, { rows: Rows }>,
): Promise<T> {
  const cleaned = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== null && v !== undefined),
  );
  const res = await apiRequest<unknown>(
    `/api/mdm/oasis/${serviceId}/${action}`,
    {
      method: "POST",
      body: JSON.stringify({
        meta: { menuId: serviceId },
        params: cleaned,
        ...(grids ? { grids } : {}),
      }),
    },
  );
  return unwrap<T>(res);
}

export function searchColumns(
  keyword: string,
  domainId: string,
): Promise<SearchResult> {
  return callOasis<SearchResult>("columnMng", "search", {
    keyword,
    domainId: domainId === "" ? null : Number(domainId),
  });
}

/** 진입 때 도메인·시스템 콤보 값만 받는다(optionsOnly — 서버 목록 조회 없음, list 는 빈 배열). */
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
