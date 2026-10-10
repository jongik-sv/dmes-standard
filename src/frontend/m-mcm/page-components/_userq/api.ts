/**
 * 맞춤 레포트 조회 OASIS 호출 — `POST /api/mcm/oasis/{userQueryMng|userQuery}/{action}` (스펙 2026-10-10-user-query-program-design §4).
 * 본문 `{ meta: { menuId: <serviceId> }, params }`. params 는 평평한 글자 값만 싣는다(배열·객체는 `…Json` 글자). 응답은 data.result 를 풀어 읽는다.
 * 봉투 해제는 위젯과 같은 `unwrapResult`(meta.success=false 거절, data·data.result 펼침)를 쓴다.
 * @dk-oasis/shared 를 런타임 import 하지 않는다(m-mcm vitest 가 shared dist 없이 시험한다).
 */
import { createJsonApiClient } from "@/lib/http/json-api-client";

import { unwrapResult } from "../../widget-types/_query/api";
import { normalizeQueryResult, paramsOf, tableConfigOf } from "../../widget-types/_query/format";

import type {
  UserQueryAssignRow,
  UserQueryCandidate,
  UserQueryColumn,
  UserQueryDef,
  UserQueryListRow,
  UserQueryParam,
  UserQueryRunDef,
  UserQueryRunResult,
  UserQuerySearchCond,
  UserQuerySummary,
} from "./types";

const api = createJsonApiClient();

export const USER_QUERY_MNG_ID = "userQueryMng";
export const USER_QUERY_ID = "userQuery";

type Rec = Record<string, unknown>;

const isRecord = (v: unknown): v is Rec => v !== null && typeof v === "object" && !Array.isArray(v);
const records = (v: unknown): Rec[] => (Array.isArray(v) ? v.filter(isRecord) : []);
const textOrNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const text = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const numberOr = (v: unknown, fallback: number): number => {
  // null·빈 글자는 Number() 가 0 으로 바꾸므로 먼저 fallback 으로 보낸다(ver 0·maxRowCnt 0 으로 오읽지 않게).
  if (v == null || v === "") return fallback;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** 빈 값(null·undefined·빈 글자)은 키를 뺀다. cactus 요청 변환기는 null 값을 거절한다. */
export function cleanParams(params: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    out[key] = String(value);
  }
  return out;
}

async function callAction(serviceId: string, action: string, params: Record<string, unknown> = {}): Promise<Rec> {
  const res = await api.request<unknown>(`/api/mcm/oasis/${serviceId}/${action}`, {
    method: "POST",
    body: { meta: { menuId: serviceId }, params: cleanParams(params) },
  });
  return unwrapResult(res);
}

/** JSON 글자 또는 이미 풀린 배열을 배열로 읽는다. 읽지 못하면 빈 배열. */
function jsonArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (typeof v !== "string" || v.trim() === "") return [];
  try {
    const parsed: unknown = JSON.parse(v);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export const parseParams = (v: unknown): UserQueryParam[] => paramsOf({ params: jsonArray(v) });
export const parseColumns = (v: unknown): UserQueryColumn[] => tableConfigOf({ columns: jsonArray(v) }).columns;

const useYnOf = (v: unknown): "Y" | "N" => (v === "N" ? "N" : "Y");

function toListRow(r: Rec): UserQueryListRow {
  return {
    queryId: text(r.queryId),
    queryNm: text(r.queryNm),
    categoryCd: textOrNull(r.categoryCd),
    ownerDeptCd: textOrNull(r.ownerDeptCd),
    ownerDeptNm: textOrNull(r.ownerDeptNm),
    useYn: useYnOf(r.useYn),
    maxRowCnt: numberOr(r.maxRowCnt, 1000),
    assignCnt: numberOr(r.assignCnt, 0),
    uAt: textOrNull(r.uAt),
    uUsrId: textOrNull(r.uUsrId),
  };
}

function toDef(r: Rec): UserQueryDef {
  return {
    queryId: text(r.queryId),
    queryNm: text(r.queryNm),
    categoryCd: textOrNull(r.categoryCd),
    queryDesc: textOrNull(r.queryDesc),
    ownerDeptCd: textOrNull(r.ownerDeptCd),
    ownerDeptNm: textOrNull(r.ownerDeptNm),
    sqlText: text(r.sqlText),
    params: parseParams(r.paramsJson ?? r.params),
    columns: parseColumns(r.columnsJson ?? r.columns),
    maxRowCnt: numberOr(r.maxRowCnt, 1000),
    useYn: useYnOf(r.useYn),
    ver: r.ver == null || r.ver === "" ? null : numberOr(r.ver, 0),
  };
}

/* ── userQueryMng(관리) ── */

/** 목록 — 조회조건 5개(빈 값은 보내지 않는다). */
export async function searchUserQueries(cond: UserQuerySearchCond = {}): Promise<UserQueryListRow[]> {
  const out = await callAction(USER_QUERY_MNG_ID, "search", { ...cond });
  return records(out.rows).map(toListRow);
}

/** 정의 1건(SQL·입력/출력 정의 포함). 없으면 Error(서버 문구). */
export async function getUserQueryDef(queryId: string): Promise<UserQueryDef> {
  const out = await callAction(USER_QUERY_MNG_ID, "get", { queryId });
  if (!isRecord(out.def)) throw new Error("쿼리 정의를 찾을 수 없습니다.");
  return toDef(out.def);
}

/**
 * 저장 — `ver` 가 null 이면 신규. 돌려주는 값은 저장된 queryId 와 새 ver.
 * 계약(조정 2026-10-10): save 는 전체 교체다. 비어 있는 칸(categoryCd·queryDesc·ownerDeptCd·paramsJson·columnsJson)은 키를 싣지 않고
 * (`cleanParams` 가 뺀다), 서버는 「키 없음 = null 로 비움」 으로 읽는다. 예전 값이 남지 않는다.
 */
export async function saveUserQuery(def: UserQueryDef): Promise<{ queryId: string; ver: number }> {
  const out = await callAction(USER_QUERY_MNG_ID, "save", {
    queryId: def.queryId,
    queryNm: def.queryNm,
    categoryCd: def.categoryCd,
    queryDesc: def.queryDesc,
    ownerDeptCd: def.ownerDeptCd,
    sqlText: def.sqlText,
    paramsJson: def.params.length > 0 ? JSON.stringify(def.params) : null,
    columnsJson: def.columns.length > 0 ? JSON.stringify(def.columns) : null,
    maxRowCnt: def.maxRowCnt,
    useYn: def.useYn,
    ver: def.ver,
  });
  return { queryId: text(out.queryId) || def.queryId, ver: numberOr(out.ver, 0) };
}

export async function deleteUserQuery(queryId: string, ver: number): Promise<{ deleted: number; assignDeleted: number }> {
  const out = await callAction(USER_QUERY_MNG_ID, "delete", { queryId, ver });
  return { deleted: numberOr(out.deleted, 0), assignDeleted: numberOr(out.assignDeleted, 0) };
}

/** 저장 전 SQL 시험(50행). 실패는 서버 문구를 담은 Error. */
export async function previewUserQuery(sqlText: string, params?: readonly UserQueryParam[]) {
  const out = await callAction(USER_QUERY_MNG_ID, "previewQuery", {
    sqlText,
    paramsJson: params && params.length > 0 ? JSON.stringify(params) : null,
  });
  return normalizeQueryResult(out);
}

/** SQL 이 쓰는 사용자 바인드 이름(처음 나온 순서). */
export async function validateUserQuery(sqlText: string, params?: readonly UserQueryParam[]): Promise<string[]> {
  const out = await callAction(USER_QUERY_MNG_ID, "validate", {
    sqlText,
    paramsJson: params && params.length > 0 ? JSON.stringify(params) : null,
  });
  return Array.isArray(out.binds) ? out.binds.filter((b): b is string => typeof b === "string") : [];
}

export async function searchUserQueryAssigns(queryId: string): Promise<UserQueryAssignRow[]> {
  const out = await callAction(USER_QUERY_MNG_ID, "searchAssign", { queryId });
  return records(out.rows).map((r) => ({
    userId: text(r.userId),
    userNm: textOrNull(r.userNm),
    deptCd: textOrNull(r.deptCd),
    deptNm: textOrNull(r.deptNm),
    missing: r.missingYn === "Y",
  }));
}

/** 할당 전체 교체(최대 2000명). */
export async function saveUserQueryAssigns(queryId: string, userIds: readonly string[]): Promise<{ added: number; removed: number }> {
  const out = await callAction(USER_QUERY_MNG_ID, "saveAssign", { queryId, userIdsJson: JSON.stringify(userIds) });
  return { added: numberOr(out.added, 0), removed: numberOr(out.removed, 0) };
}

/** 할당 후보 — 사용 중 사용자, 최대 5000. */
export async function searchUserQueryCandidates(): Promise<{ rows: UserQueryCandidate[]; truncated: boolean }> {
  const out = await callAction(USER_QUERY_MNG_ID, "searchUserList");
  return {
    rows: records(out.rows).map((r) => ({
      userId: text(r.userId),
      userNm: text(r.userNm),
      deptCd: textOrNull(r.deptCd),
      deptNm: textOrNull(r.deptNm),
    })),
    truncated: out.truncated === true,
  };
}

/** 부서 고르기(담당 부서 팝업) — 코드·이름 앞부분 일치, 서버가 최대 50건. commWidgetMng/searchDepts 와 같은 응답 모양(`depts`). */
export async function searchUserQueryDepts(keyword: string): Promise<{ deptCd: string; deptNm: string }[]> {
  const out = await callAction(USER_QUERY_MNG_ID, "searchDepts", { keyword: keyword.trim() });
  return records(out.depts)
    .filter((r) => r.deptCd != null && String(r.deptCd) !== "")
    .map((r) => ({ deptCd: String(r.deptCd), deptNm: text(r.deptNm) }));
}

/* ── userQuery(사용자, userq-user 가 쓴다) ── */

export async function listMyUserQueries(): Promise<UserQuerySummary[]> {
  const out = await callAction(USER_QUERY_ID, "myList");
  return records(out.rows).map((r) => ({
    queryId: text(r.queryId),
    queryNm: text(r.queryNm),
    categoryCd: textOrNull(r.categoryCd),
    queryDesc: textOrNull(r.queryDesc),
  }));
}

/** 실행용 정의. SQL 은 오지 않는다. */
export async function getUserQueryRunDef(queryId: string): Promise<UserQueryRunDef> {
  const out = await callAction(USER_QUERY_ID, "getDef", { queryId });
  return {
    queryId: text(out.queryId) || queryId,
    queryNm: text(out.queryNm),
    categoryCd: textOrNull(out.categoryCd),
    queryDesc: textOrNull(out.queryDesc),
    params: parseParams(out.params),
    columns: parseColumns(out.columns),
    maxRowCnt: numberOr(out.maxRowCnt, 1000),
  };
}

/** 실행 — queryId 와 값만 보낸다(SQL 은 서버가 DB 에서 읽는다). 값이 없으면 paramsJson 을 싣지 않는다. */
export async function runUserQuery(queryId: string, values?: Readonly<Record<string, string>>): Promise<UserQueryRunResult> {
  const out = await callAction(USER_QUERY_ID, "run", {
    queryId,
    paramsJson: values && Object.keys(values).length > 0 ? JSON.stringify(values) : null,
  });
  return { ...normalizeQueryResult(out), maxRowCnt: numberOr(out.maxRowCnt, 0) };
}
