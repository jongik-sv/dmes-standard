/**
 * 공용 쿼리 조회 화면의 순수 로직 — 목록 거르기·분류 묶기, 실행 가능 판정(필수 값), 결과 열 규칙, 잘림 안내, 마지막 쿼리 기억.
 * @dk-oasis/shared 는 타입만 import 한다(m-mcm vitest 가 shared dist 없이 시험한다).
 * 스펙 2026-10-10-user-query-program-design §6·§8.1.
 */
import type { GridColumn } from "@dk-oasis/shared/grid";

import {
  initialValues,
  missingRequired,
  paramsOf,
  planRun,
  toColumnDefs,
  toGridRows,
  truncatedNote,
  usableParams,
  type ParamValues,
} from "../../../widget-types/_query/format";
import type { UserQueryColumn, UserQueryParam, UserQueryRunResult, UserQuerySummary } from "../../_userq/types";

export const NO_ASSIGNED_QUERY = "할당된 쿼리가 없습니다. 관리자에게 요청하세요";
export const NEED_INPUT_MESSAGE = "조건을 입력하고 조회하세요";
export const UNCATEGORIZED_LABEL = "미분류";
export const LAST_QUERY_STORAGE_KEY = "mcm.cmq.userQuery.lastQueryId";

/* ── 목록 ── */

export interface QueryGroup {
  /** 분류 코드, 없으면 "" */
  categoryCd: string;
  label: string;
  items: UserQuerySummary[];
}

/** 이름·ID·설명 부분 일치(대소문자 무시). 화면 안에서만 거른다. 빈 검색어는 전부. */
export function filterQueries(list: readonly UserQuerySummary[], keyword: string): UserQuerySummary[] {
  const k = keyword.trim().toLowerCase();
  if (k === "") return [...list];
  return list.filter((q) => [q.queryNm, q.queryId, q.queryDesc ?? ""].some((s) => s.toLowerCase().includes(k)));
}

/** 분류 이름으로 묶는다. 묶음·항목 순서는 입력(서버 정렬) 그대로, 분류 이름을 모르는 코드는 코드를 그대로 보인다. */
export function groupByCategory(list: readonly UserQuerySummary[], categoryNames: Readonly<Record<string, string>>): QueryGroup[] {
  const groups = new Map<string, QueryGroup>();
  for (const q of list) {
    const cd = q.categoryCd ?? "";
    let g = groups.get(cd);
    if (!g) {
      g = { categoryCd: cd, label: cd === "" ? UNCATEGORIZED_LABEL : (categoryNames[cd] ?? cd), items: [] };
      groups.set(cd, g);
    }
    g.items.push(q);
  }
  return [...groups.values()];
}

/** 처음 고를 쿼리 — 마지막에 고른 것이 아직 목록에 있으면 그것, 없으면 고르지 않는다(자동 조회도 하지 않는다). */
export function pickInitialQueryId(list: readonly UserQuerySummary[], lastQueryId: string | null): string | null {
  if (lastQueryId && list.some((q) => q.queryId === lastQueryId)) return lastQueryId;
  return null;
}

/* ── 마지막으로 고른 쿼리(localStorage, 실패해도 동작한다) ── */

export function readLastQueryId(): string | null {
  try {
    return window.localStorage.getItem(LAST_QUERY_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

export function writeLastQueryId(queryId: string): void {
  try {
    window.localStorage.setItem(LAST_QUERY_STORAGE_KEY, queryId);
  } catch {
    /* 저장하지 못해도 화면은 동작한다 */
  }
}

/* ── 조건·실행 ── */

/** 그릴 입력 조건 — 서버가 준 정의에서 이름 형식이 맞고 처음 나온 것만. */
export function conditionParams(params: readonly UserQueryParam[]): UserQueryParam[] {
  return usableParams(paramsOf({ params }));
}

/** 쿼리를 고를 때·되돌릴 때 조건 칸에 넣는 기본값. */
export function defaultValues(params: readonly UserQueryParam[]): ParamValues {
  return initialValues(params);
}

export type RunDecision = { run: true; values?: ParamValues } | { run: false; missing: string[]; message: string };

/** 조회 단추를 눌렀을 때 서버를 부를지 정한다. 필수 값이 비면 부르지 않고 안내 문구를 돌려준다. */
export function decideRun(params: readonly UserQueryParam[], draft: Readonly<Record<string, string | undefined>>): RunDecision {
  const plan = planRun(params, draft);
  if (plan.run) return plan;
  return { run: false, missing: plan.missing, message: NEED_INPUT_MESSAGE };
}

/** 필수 값이 빈 조건의 이름. 화면이 해당 칸을 알릴 때 쓴다. */
export function missingNames(params: readonly UserQueryParam[], draft: Readonly<Record<string, string | undefined>>): string[] {
  return missingRequired(params, draft);
}

/* ── 결과 ── */

/** 그리드 열 — 정의에 열이 있으면 그 규칙(머리글·폭·정렬·형식), 없으면 결과 열 전부. */
export function resultColumns(result: UserQueryRunResult, columns: readonly UserQueryColumn[]): GridColumn[] {
  return toColumnDefs(result.columns, { sql: "", columns: [...columns] }, result.rows);
}

export function resultRows(result: UserQueryRunResult): Record<string, unknown>[] {
  return toGridRows(result.rows);
}

/** 잘렸을 때만 안내 문구(「상위 N행만 표시합니다」). 잘리지 않았으면 undefined 라 기본 「N행」이 나온다. */
export function truncationNote(result: UserQueryRunResult): string | undefined {
  return result.truncated ? truncatedNote(result.rows.length) : undefined;
}

/** 그리드는 그대로 두고 행만 비운다(필수 값 안내·실행 실패 뒤). 열·maxRowCnt 는 남긴다. */
export function withoutRows(result: UserQueryRunResult): UserQueryRunResult {
  return { ...result, rows: [], truncated: false };
}
