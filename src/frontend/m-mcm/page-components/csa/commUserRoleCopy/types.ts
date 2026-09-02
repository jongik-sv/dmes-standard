/**
 * commUserRoleCopy 화면 — TypeScript 타입 정의 (W7 / csa 9 화면 7번째).
 *
 * 인용 정본:
 *   - 분석리포트 §3 (UI 컴포넌트) / §3.7 (Dataset DS-001~004) / §6 (SQL 5 + 외부 1) / §8 (BPMN 3 action) / §9 (테이블 카탈로그)
 *   - 기능설계서 §3 (S 1 / G 3 / GE 12) / §4 (D 12) / §5 (B 5)
 *   - BPMN설계서 §1.1 (API 3 행) / §2 (action 별 흐름)
 *
 * dataset 컬럼은 As-Is SNAKE_CASE 보존 (Service 응답과 1:1).
 */

/** 분석 §3.7 DS-002 — Copy 대상 사용자 (grd_copyUser / G-001~G-003). 1 row 만 표시. */
export interface CommUserRoleCopyCopyUserRow extends Record<string, unknown> {
  USER_ID: string;
  USER_EMP_NO: string;
  USER_NM: string;
}

/** 분석 §3.7 DS-001 — Copy 대상의 보유 RoleGroup (grd_copyRoleGroup / GE-001-1, GE-001-2). */
export interface CommUserRoleCopyCopyRoleGrpRow extends Record<string, unknown> {
  ROLE_GROUP_ID: string;
  ROLE_GROUP_NM: string;
  /** As-Is dataset 정의 컬럼 — 표시 ✗ (Service 응답 일관성). */
  USER_ID?: string;
}

/**
 * 분석 §3.7 DS-003 — 전체 사용자 List (grd_userFrom / GE-003-1~5).
 * CHK 컬럼은 클라이언트 선택 토글 only (Service 응답에는 미포함 — 클라이언트 default 0).
 */
export interface CommUserRoleCopyUserFromRow extends Record<string, unknown> {
  CHK?: number | string; // "0" / "1" — 클라이언트 셔틀 토글 마킹
  USER_ID: string;
  USER_EMP_NO: string;
  USER_NM: string;
  DEPT_NM: string | null;
}

/**
 * 분석 §3.7 DS-004 — 권한 생성 대상 사용자 (grd_userTo / GE-002-1~5).
 * userFrom 에서 셔틀로 이동된 행이 누적. CHK 는 셔틀 우 (복귀) 시 토글.
 */
export interface CommUserRoleCopyUserToRow extends Record<string, unknown> {
  CHK?: number | string;
  USER_ID: string;
  USER_EMP_NO: string;
  USER_NM: string;
  DEPT_NM: string | null;
}

/** S-001 조회조건 (Copy 대상 사용자 ID/사번 입력값). */
export interface CommUserRoleCopyFilters {
  pUserIdCopy: string;
}

/** 권한생성 헤더 입력 (D-002 / D-004). save 시 sArgument 로 전송. */
export interface CommUserRoleCopyHeader {
  pInfReqNo: string;
  pDescription: string;
}

/** D-005 / D-006 필터 — 클라이언트 측 ds_userFrom.filter() 적용용 (Service 호출 ✗). */
export interface CommUserRoleCopyClientFilter {
  userFilter: string; // D-005 ID/사번/이름
  deptFilter: string; // D-006 부서
}
