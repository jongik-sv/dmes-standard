/**
 * commRoleMng (역할 관리) 화면 타입.
 *
 * 인용 정본:
 *   - 분석리포트 §3.8 DS-002 (ds_main 컬럼) / DS-003 (ds_roleMap) / DS-001 (ds_perm) / DS-006 (ds_lovMenuId) /
 *     §9.4 (DB 컬럼 카탈로그) / §11 To-Be 정책 #1 (BIZ_SYSTEM_CODE 폐기)
 *   - 기능설계서 §3.2 (G/GE) / §4.1 (D-NNN 8 필드 — D-001 폐기)
 *   - BPMN설계서 §1.1 (6 action DTO 매핑)
 *
 * As-Is 컬럼명 (SNAKE_CASE) 보존 — BE Service 의 row mapping 키와 1:1 일치.
 * To-Be 정책 #1 (BIZ_SYSTEM_CODE 폐기) 반영 — 조회조건 / Detail / 그리드에서 제거.
 */

/** 조회조건 — 분석 §3.2 / 기능 §3.1 / To-Be 3 파라미터 (S-001 cbo_bizSystemCode 폐기). */
export interface CommRoleMngFilters {
  /** S-002 — 역할 ID UPPER LIKE 부분 일치. */
  edt_ROLE_ID: string;
  /** S-003 — 역할 명 UPPER LIKE 부분 일치. */
  edt_ROLE_NM: string;
  /** S-004 — 사용 여부 (Y/N 일치 / 빈 값 = 전체). */
  cbo_USE_TP: string;
}

/**
 * 역할 마스터 그리드 row — As-Is ds_main (xfdl:968~981) + To-Be 정책 #1 (BIZ_SYSTEM_CODE 미포함).
 * 분석 §3.3 G-002~G-009 (8 컬럼 — G-006 BIZ_SYSTEM_CODE 제거) + ROLE_GROUP_ID(서브쿼리) + ID(SUBSTR) + FE row state.
 */
export interface CommRoleMngRow extends Record<string, unknown> {
  /** G-002 / D-002 — PK (자동 합성 "role_"+MENU_ID+"_"+ID). */
  ROLE_ID: string;
  /** G-003 / D-005. */
  ROLE_NM?: string;
  /** G-004 / D-006. */
  ROLE_DESC?: string;
  /** G-005 / D-003 (Essential V-006). */
  MENU_ID?: string;
  /** G-007 / S-004 / D-007 (RadioGroup — Q-007 자연 흡수, 신규 행 default 'Y'). */
  USE_TP?: string;
  /** G-008 / D-008 — As-Is 신규 행 default gfn_today() 8자. */
  START_ACTIVE_DATE?: string | null;
  /** G-009 / D-009 — As-Is 신규 행 default "99991231" 8자 → To-Be BE 정정 9999-12-31 23:59:59. */
  END_ACTIVE_DATE?: string | null;
  /** 부속 — scalar subquery (xml:14~18), V-003 화면 검증용 (참조 무결성). */
  ROLE_GROUP_ID?: string | null;
  /** 부속 — D-004 ID (ROLE_ID 의 마지막 "_" 이후 토큰 / xml:20). */
  ID?: string;
}

/**
 * 현재 권한 매핑 그리드 row (sub1) — As-Is ds_roleMap (xfdl:982~997 / 12 컬럼).
 * GE-001 CHK 는 FE 전용 (BE 미저장). 본 10 컬럼 (PERMISSION_ID_UPPER 는 FE 필터링 계산용 derived).
 */
export interface CommRoleMngRoleMapRow extends Record<string, unknown> {
  /** GE-002 — PK#3 (FK to TB_MCM_SEC_PERM.PERMISSION_ID). */
  PERMISSION_ID: string;
  /** GE-003 — PK#2 (FK to TB_MCM_SEC_OBJ.OBJECT_ID). */
  OBJECT_ID: string;
  /** GE-011 — PK#1 (FK to TB_MCM_SEC_ROLE.ROLE_ID). */
  ROLE_ID: string;
  /** GE-004 — JOIN TB_MCM_SEC_PERM.PERMISSION_NM. */
  PERMISSION_NM?: string;
  /** GE-005. */
  PERMISSION_COMMON?: string;
  /** GE-006. */
  PERMISSION_CUSTOM?: string;
  /** GE-007. */
  POPUP_BTN?: string;
  /** GE-008 — JOIN TB_MCM_SEC_OBJ.OBJECT_NM. */
  OBJECT_NM?: string;
  /** GE-009 — JOIN TB_MCM_SEC_OBJ.SYSTEM_CODE. */
  SYSTEM_CODE?: string;
  /** GE-010 — JOIN TB_MCM_SEC_OBJ.SERVICE. */
  SERVICE?: string;
}

/**
 * 전체 권한 후보 그리드 row (sub2) — As-Is ds_perm (xfdl:957~967 / 7 컬럼).
 * GE-012 CHK 는 FE 전용. 본 5 컬럼 (PERMISSION_ID_UPPER 는 FE 필터링 derived).
 */
export interface CommRoleMngPermRow extends Record<string, unknown> {
  /** GE-013. */
  PERMISSION_ID: string;
  /** GE-014 (As-Is 띄어쓰기 비대칭 — 분석 §3.4 보존). */
  PERMISSION_NM?: string;
  /** GE-015. */
  PERMISSION_COMMON?: string;
  /** GE-016. */
  PERMISSION_CUSTOM?: string;
  /** GE-017 (As-Is 띄어쓰기 비대칭 — 분석 §3.4 보존). */
  POPUP_BTN?: string;
}

/** MENU ID lov row — As-Is ds_lovMenuId (분석 §3.8 DS-006 / 3 컬럼). */
export interface MenuIdLov extends Record<string, unknown> {
  MENU_ID: string;
  /** To-Be 정책 #1 — FE 미사용 (BE response 에는 잔존). */
  BIZ_SYSTEM_CODE?: string | null;
  /** "MENU_ID (MENU_NM)" 합성. */
  MENU_ID_NM?: string;
}

/**
 * OBJECT-LoV row — As-Is ds_menuObjLst (xfdl:321~336 commonDynamic_onload — round-2 fix).
 *
 * 본 화면 sub2 영역의 OBJECT_ID 입력 LoV. As-Is xfdl 인자 명시 응답 컬럼 (OBJECT_ID, OBJECT_NM, FORM_URL)
 * 은 BE selectMenuObjPop 응답 5 컬럼 (OBJECT_ID / OBJECT_NM / SERVICE / FORM_URL / PARAM) 의 부분집합.
 * 모두 보존.
 */
export interface ObjectLovRow extends Record<string, unknown> {
  OBJECT_ID: string;
  OBJECT_NM?: string;
  SERVICE?: string;
  FORM_URL?: string;
  PARAM?: string;
}

/** Nexacro row status (As-Is !nativeeditor_status) — To-Be rowStatus 표준화 (W1·W2 정본 패턴). */
export type RowStatus = "" | "inserted" | "updated" | "deleted";
