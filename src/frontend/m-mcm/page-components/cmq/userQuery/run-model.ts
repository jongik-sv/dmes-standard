/**
 * 맞춤 레포트 조회 화면의 순수 로직 — 목록 거르기·목록 행·열, 실행 가능 판정(필수 값), 결과 열 규칙, 잘림 안내, 마지막 쿼리 기억.
 * @dk-oasis/shared 는 타입만 import 한다(m-mcm vitest 가 shared dist 없이 시험한다).
 * 스펙 2026-10-10-user-query-program-design §6·§8.1.
 */
import type { GridColumn } from "@dk-oasis/shared/grid";

import {
  columnSums,
  initialValues,
  missingRequired,
  paramsOf,
  planRun,
  toColumnDefs,
  toGridRows,
  truncatedNote,
  usableParams,
  type ColumnDefOptions,
  type ParamValues,
} from "../../../widget-types/_query/format";
import type { UserQueryColumn, UserQueryParam, UserQueryRunResult, UserQuerySummary } from "../../_userq/types";

export const NO_ASSIGNED_QUERY = "할당된 쿼리가 없습니다. 관리자에게 요청하세요";
export const NEED_INPUT_MESSAGE = "조건을 입력하고 조회하세요";
export const READY_MESSAGE = "조건을 확인하고 조회하세요";
export const UNCATEGORIZED_LABEL = "미분류";
export const LAST_QUERY_STORAGE_KEY = "mcm.cmq.userQuery.lastQueryId";

/* ── 목록 ── */

/** 왼쪽 조회조건 — 분류 코드("" 면 전체)와 이름·쿼리 ID 검색어. */
export interface QueryListFilter {
  categoryCd: string;
  /** 모듈 코드("" 면 전체). */
  moduleCd: string;
  keyword: string;
}

export const EMPTY_LIST_FILTER: QueryListFilter = { categoryCd: "", moduleCd: "", keyword: "" };

/**
 * myList 결과를 화면 안에서 거른다(서버 호출 없음). 모듈·분류는 코드 일치(빈 값이면 전체, 분류 없는 쿼리는 분류를 고르면 빠진다),
 * 검색어는 쿼리 이름 또는 쿼리 ID 의 부분 일치(대소문자 무시·앞뒤 공백 무시, 설명은 보지 않는다). 순서는 입력 그대로.
 */
export function filterQueryList(list: readonly UserQuerySummary[], filter: QueryListFilter): UserQuerySummary[] {
  const k = filter.keyword.trim().toLowerCase();
  return list.filter((q) => {
    if (filter.categoryCd !== "" && q.categoryCd !== filter.categoryCd) return false;
    if (filter.moduleCd !== "" && q.moduleCd !== filter.moduleCd) return false;
    if (k === "") return true;
    return q.queryNm.toLowerCase().includes(k) || q.queryId.toLowerCase().includes(k);
  });
}

/** 목록 그리드 한 행 — 분류 이름을 미리 풀어 열 정의가 분류 목록 도착과 무관하게 한다. */
export type QueryListRow = {
  queryId: string;
  queryNm: string;
  categoryNm: string;
  moduleCd: string;
};

/** 분류 이름을 풀어 그리드 행으로 바꾼다. 분류 이름을 모르는 코드는 코드 그대로, 분류가 없으면 「미분류」. */
export function toListRows(list: readonly UserQuerySummary[], categoryNames: Readonly<Record<string, string>>): QueryListRow[] {
  return list.map((q) => {
    const cd = q.categoryCd ?? "";
    return { queryId: q.queryId, queryNm: q.queryNm, categoryNm: cd === "" ? UNCATEGORIZED_LABEL : (categoryNames[cd] ?? cd), moduleCd: q.moduleCd ?? "" };
  });
}

/** 두 목록이 값까지 같은가 — 다시 조회해도 그대로면 state 를 바꾸지 않으려는 비교(R7). */
export function sameQueryList(a: readonly UserQuerySummary[], b: readonly UserQuerySummary[]): boolean {
  return (
    a.length === b.length &&
    a.every((q, i) => q.queryId === b[i].queryId && q.queryNm === b[i].queryNm && q.categoryCd === b[i].categoryCd && q.moduleCd === b[i].moduleCd && q.queryDesc === b[i].queryDesc)
  );
}

export const LIST_ROW_KEY = "queryId";

/**
 * 목록 그리드 열(모듈 상수, 화면 성능 가이드 R12). 왼쪽 칸이 좁아(기본 20%) 가로 스크롤이 생기지 않게 minWidth 합을 작게 둔다(Local-Rules §30).
 * 이름이 남는 폭을 가져가고, 분류·쿼리 ID 는 말줄임으로 둔다.
 */
export const LIST_COLUMNS: GridColumn[] = [
  { key: "queryNm", header: "이름", width: 6, minWidth: 64, align: "left" },
  { key: "categoryNm", header: "분류", width: 4, minWidth: 44, align: "left" },
  { key: "queryId", header: "쿼리 ID", width: 3, minWidth: 48, align: "left" },
  { key: "moduleCd", header: "모듈", width: 1, minWidth: 34, align: "left" },
];

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
export function decideRun(params: readonly UserQueryParam[], draft: Readonly<Record<string, string | string[] | undefined>>): RunDecision {
  const plan = planRun(params, draft);
  if (plan.run) return plan;
  return { run: false, missing: plan.missing, message: plan.message ?? NEED_INPUT_MESSAGE };
}

/** 필수 값이 빈 조건의 이름. 화면이 해당 칸을 알릴 때 쓴다. */
export function missingNames(params: readonly UserQueryParam[], draft: Readonly<Record<string, string | string[] | undefined>>): string[] {
  return missingRequired(params, draft);
}

/* ── 결과 ── */

/**
 * 정의(getDef)의 출력 열로 만든 그리드 열 — 조회 전에 빈 그리드를 그릴 때 쓴다. 정의에 열이 없으면 결과 열을 조회 뒤에야 알 수 있으므로 빈 배열이다.
 * 조회 뒤에도 같은 열 정의를 그대로 쓰므로(resultColumns 는 정의에 열이 있으면 결과 열을 보지 않는다) 결과를 채울 때 그리드를 다시 마운트하지 않는다.
 */
export function definedColumns(columns: readonly UserQueryColumn[], opts?: ColumnDefOptions): GridColumn[] {
  return columns.length === 0 ? [] : toColumnDefs([], { sql: "", columns: [...columns] }, [], opts);
}

/** 그리드 열 — 정의에 열이 있으면 그 규칙(머리글·폭·정렬·형식), 없으면 결과 열 전부. */
export function resultColumns(result: UserQueryRunResult, columns: readonly UserQueryColumn[], opts?: ColumnDefOptions): GridColumn[] {
  return toColumnDefs(result.columns, { sql: "", columns: [...columns] }, result.rows, opts);
}

export function resultRows(result: UserQueryRunResult): Record<string, unknown>[] {
  return toGridRows(result.rows);
}

export const SUM_LABEL = "합계";
export const SUM_LABEL_TRUNCATED = "표시한 행 합계";

/**
 * 합계 고정 행(AgDataGrid pinnedBottomRows) — 합계 열(`sum`)이 없거나 행이 없으면 undefined.
 * 첫 열(합계 열이 아닌 첫 열)에 「합계」(잘렸으면 「표시한 행 합계」), 합계 열에 합. 값 서식은 열 정의(mask)가 그대로 입힌다.
 */
export function resultSumRows(result: UserQueryRunResult, columns: readonly UserQueryColumn[]): Record<string, unknown>[] | undefined {
  if (result.rows.length === 0) return undefined;
  const sums = columnSums(result.rows, columns);
  if (Object.keys(sums).length === 0) return undefined;
  const row: Record<string, unknown> = { ...sums };
  const labelColumn = columns.find((c) => !(c.field in sums));
  if (labelColumn) row[labelColumn.field] = result.truncated ? SUM_LABEL_TRUNCATED : SUM_LABEL;
  return [row];
}

/** 잘렸을 때만 안내 문구(「상위 N행만 표시합니다」). 잘리지 않았으면 undefined 라 기본 「N행」이 나온다. */
export function truncationNote(result: UserQueryRunResult): string | undefined {
  return result.truncated ? truncatedNote(result.rows.length) : undefined;
}

/** 그리드는 그대로 두고 행만 비운다(필수 값 안내·실행 실패 뒤). 열·maxRowCnt 는 남긴다. */
export function withoutRows(result: UserQueryRunResult): UserQueryRunResult {
  return { ...result, rows: [], truncated: false };
}
