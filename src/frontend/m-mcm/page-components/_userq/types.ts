/**
 * 맞춤 레포트 조회 공용 타입(스펙 2026-10-10-user-query-program-design §8.3).
 * 관리 화면(cmq/userQueryMng)과 사용자 화면(cmq/userQuery)이 함께 쓴다. `page.tsx` 를 두지 않는다(페이지 등록부가 화면으로 올리지 않게).
 */
import type { QueryParam, QueryResult, TableColumnConfig } from "../../widget-types/_query/format";

/** 모듈 코드 — 예약 작업의 JOB_MODULES 와 같은 집합(금지 경로를 건너지 않게 여기에 따로 둔다). 스펙 2차 §4. */
export const USRQ_MODULES = ["MCM", "MDM", "MPP", "MLS", "MQC", "MPN"] as const;
export type UsrqModule = (typeof USRQ_MODULES)[number];
export const USRQ_MODULE_LABELS: Readonly<Record<UsrqModule, string>> = {
  MCM: "공통",
  MDM: "기준정보",
  MPP: "생산",
  MLS: "물류",
  MQC: "품질",
  MPN: "APS",
};
export const DEFAULT_MODULE: UsrqModule = "MCM";
/** 「전체」 없는 선택지(정의 폼). */
export const USRQ_MODULE_OPTIONS = USRQ_MODULES.map((m) => ({ value: m, label: `${m} ${USRQ_MODULE_LABELS[m]}` }));
/** 「전체」 포함 선택지(조회조건). */
export const USRQ_MODULE_FILTER_OPTIONS = [{ value: "", label: "전체" }, ...USRQ_MODULE_OPTIONS];

/** 모듈 코드 정리 — 알려진 값만, 그 밖은 null. */
export function moduleOf(v: unknown): UsrqModule | null {
  return typeof v === "string" && (USRQ_MODULES as readonly string[]).includes(v) ? (v as UsrqModule) : null;
}

/** 위젯 입력 조건 그대로. */
export type UserQueryParam = QueryParam;
/** 위젯 표 열 그대로. */
export type UserQueryColumn = TableColumnConfig;

export interface UserQuerySummary {
  queryId: string;
  queryNm: string;
  categoryCd: string | null;
  queryDesc: string | null;
  moduleCd: UsrqModule | null;
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
  moduleCd: UsrqModule | null;
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
  moduleCd: UsrqModule;
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
  moduleCd?: string;
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
