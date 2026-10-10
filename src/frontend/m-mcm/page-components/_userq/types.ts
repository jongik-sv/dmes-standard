/**
 * 맞춤 레포트 조회 공용 타입(스펙 2026-10-10-user-query-program-design §8.3).
 * 관리 화면(cmq/userQueryMng)과 사용자 화면(cmq/userQuery)이 함께 쓴다. `page.tsx` 를 두지 않는다(페이지 등록부가 화면으로 올리지 않게).
 */
import type { QueryParam, QueryResult, TableColumnConfig } from "../../widget-types/_query/format";

/** 위젯 입력 조건 그대로. */
export type UserQueryParam = QueryParam;
/** 위젯 표 열 그대로. */
export type UserQueryColumn = TableColumnConfig;

export interface UserQuerySummary {
  queryId: string;
  queryNm: string;
  categoryCd: string | null;
  queryDesc: string | null;
}

export interface UserQueryRunDef extends UserQuerySummary {
  params: UserQueryParam[];
  columns: UserQueryColumn[];
  maxRowCnt: number;
}

/** { columns, rows, truncated, maxRowCnt } */
export interface UserQueryRunResult extends QueryResult {
  maxRowCnt: number;
}

export interface UserQueryListRow {
  queryId: string;
  queryNm: string;
  categoryCd: string | null;
  ownerDeptCd: string | null;
  ownerDeptNm: string | null;
  useYn: "Y" | "N";
  maxRowCnt: number;
  assignCnt: number;
  uAt: string | null;
  uUsrId: string | null;
}

export interface UserQueryDef {
  queryId: string;
  queryNm: string;
  categoryCd: string | null;
  queryDesc: string | null;
  ownerDeptCd: string | null;
  ownerDeptNm: string | null;
  sqlText: string;
  /** api.ts 가 paramsJson·columnsJson 을 풀어 묶는다. */
  params: UserQueryParam[];
  columns: UserQueryColumn[];
  maxRowCnt: number;
  useYn: "Y" | "N";
  /** 신규(저장 전)는 null. */
  ver: number | null;
}

export interface UserQuerySearchCond {
  categoryCd?: string;
  keyword?: string;
  useYn?: "Y" | "N";
  ownerDept?: string;
  assignUser?: string;
}

export interface UserQueryAssignRow {
  userId: string;
  userNm: string | null;
  deptCd: string | null;
  deptNm: string | null;
  /** 서버 missingYn='Y' — 사용자 표에 없는 사용자. */
  missing: boolean;
}

export interface UserQueryCandidate {
  userId: string;
  userNm: string;
  deptCd: string | null;
  deptNm: string | null;
}
