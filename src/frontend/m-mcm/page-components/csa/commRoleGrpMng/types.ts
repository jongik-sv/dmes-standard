/**
 * commRoleGrpMng (역할 그룹 관리) 화면 타입.
 *
 * 인용 정본:
 *   - 분석리포트 §3.8 DS-002 (ds_main 컬럼) / DS-003 (ds_roleGrpMap) / DS-001 (ds_role) / DS-004 (ds_menuTreeList) /
 *     §9.9 (DB 컬럼 카탈로그) / §11/§12 To-Be 정책 #1 (BIZ_SYSTEM_CODE 폐기) + PARENT_ROLE_ID SELECT 추가 (Q-010)
 *   - 기능설계서 §3.1 (S-NNN 3 활성) / §3.2 (G/GE1/GE2/LT) / §4.1 (D-NNN 6 활성)
 *   - BPMN설계서 §1.1 (6 action DTO 매핑)
 *
 * As-Is 컬럼명 (SNAKE_CASE) 보존 — BE Service 의 row mapping 키와 1:1 일치.
 * To-Be 정책 #1 (BIZ_SYSTEM_CODE 폐기) 반영 — 조회조건 / Detail / 그리드에서 제거.
 */

/** 조회조건 — 분석 §3.2 / 기능 §3.1 / To-Be 3 파라미터 (S-001 cbo_bizSystemCode 폐기). */
export interface CommRoleGrpMngFilters {
  /** S-002 — 역할 그룹 ID UPPER LIKE 부분 일치. */
  edt_ROLE_GROUP_ID: string;
  /** S-003 — 역할 그룹명 UPPER LIKE 부분 일치. */
  edt_ROLE_GROUP_NM: string;
  /** S-004 — 사용 여부 (Y/N 일치 / 빈 값 = 전체). */
  cbo_USE_TP: string;
}

/**
 * 역할 그룹 메인 그리드 row — As-Is ds_main + To-Be 정책 #1 (BIZ_SYSTEM_CODE 미포함).
 * 분석 §3.3 G-002~G-008 (7 컬럼 — G-005 BIZ_SYSTEM_CODE 제거) + USER_ID(서브쿼리, V-101 행삭제 차단 검증용).
 */
export interface CommRoleGrpMngRow extends Record<string, unknown> {
  /** G-002 / D-001 — PK (사용자 입력 / V-004 필수). */
  ROLE_GROUP_ID: string;
  /** G-003 / D-003. */
  ROLE_GROUP_NM?: string;
  /** G-004 / D-004. */
  ROLE_GROUP_DESC?: string;
  /** G-006 / S-004 / D-005 (Radio — 신규 행 default 'Y'). */
  USE_TP?: string;
  /** G-007 / D-006 — As-Is 신규 행 default gfn_today() 8자. */
  START_ACTIVE_DATE?: string | null;
  /** G-008 / D-007 — As-Is 신규 행 default "99991231" 8자 (ST-002) → To-Be BE 정정 9999-12-31 23:59:59. */
  END_ACTIVE_DATE?: string | null;
  /** 부속 — scalar subquery (xml:14~18), V-101 화면 행삭제 차단 검증용 (xfdl:739). */
  USER_ID?: string | null;
}

/**
 * 현재 매핑 역할 그리드 row (sub1 — ds_roleGrpMap, GE1-NNN). 분석 §3.4 (8 컬럼).
 * GE1-001 CHK 는 FE state 전용. 본 7 컬럼 + PARENT_ROLE_ID (To-Be 추가 — Q-010 해소).
 */
export interface CommRoleGrpMngRoleMapRow extends Record<string, unknown> {
  /** GE1-002 — PK#2 (FK to TB_MCM_SEC_ROLE.ROLE_ID). */
  ROLE_ID: string;
  /** GE1-008 — PK#1 (FK to TB_MCM_SEC_ROLEGROUP.ROLE_GROUP_ID). */
  ROLE_GROUP_ID: string;
  /** GE1-003 — JOIN TB_MCM_SEC_ROLE.ROLE_NM. */
  ROLE_NM?: string;
  /** GE1-004 — JOIN TB_MCM_SEC_ROLE.PARENT_ROLE_ID (To-Be SELECT 추가 / Q-010). */
  PARENT_ROLE_ID?: string;
  /** GE1-005. */
  USE_TP?: string;
  /** GE1-006. */
  START_ACTIVE_DATE?: string | null;
  /** GE1-007. */
  END_ACTIVE_DATE?: string | null;
  /** 부속 — TB_MCM_SEC_ROLE.MENU_ID (FE 미사용 — BE response 잔존). */
  MENU_ID?: string | null;
}

/**
 * 미매핑 전체 역할 그리드 row (sub2 — ds_role, GE2-NNN). 분석 §3.6 (7 컬럼).
 * GE2-001 CHK 는 FE state 전용. 본 6 컬럼 + PARENT_ROLE_ID (Q-010).
 */
export interface CommRoleGrpMngRoleRow extends Record<string, unknown> {
  /** GE2-002 — ROLE_ID (PK). */
  ROLE_ID: string;
  /** GE2-003. */
  ROLE_NM?: string;
  /** GE2-004 — PARENT_ROLE_ID (To-Be SELECT 추가 / Q-010). */
  PARENT_ROLE_ID?: string;
  /** GE2-005. */
  USE_TP?: string;
  /** GE2-006. */
  START_ACTIVE_DATE?: string | null;
  /** GE2-007. */
  END_ACTIVE_DATE?: string | null;
  /** 부속 — TB_MCM_SEC_ROLE.MENU_ID (FE 미사용 — BE response 잔존). */
  MENU_ID?: string | null;
}

/**
 * 좌하 메뉴 트리 row (LT — ds_menuTreeList, LT-001). 분석 §3.5 (1 표시 컬럼 / 8 응답 컬럼).
 * Oracle CTE+CONNECT BY → MSSQL WITH RECURSIVE 변환 (정합 §F).
 */
export interface CommRoleGrpMngMenuTreeRow extends Record<string, unknown> {
  MENU_ID: string;
  MENU_SEQ?: string | null;
  /** LT-001 표시 컬럼. */
  MENU_NM?: string;
  /** treelevel — `bind:LEV` (xfdl:98). */
  LEV?: number | string | null;
  PARENT_MENU_ID?: string | null;
  ROW_SEQ?: number | string | null;
  OBJECT_ID?: string | null;
  MENU_VIEW_YN?: string | null;
}

/** Nexacro row status (As-Is !nativeeditor_status) — To-Be rowStatus 표준화 (W1·W2·W3 정본 패턴). */
export type RowStatus = "" | "inserted" | "updated" | "deleted";
