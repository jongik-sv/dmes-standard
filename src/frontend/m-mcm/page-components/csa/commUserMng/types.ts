/**
 * commUserMng (사용자 관리) 화면 타입.
 *
 * 인용 정본:
 *   - 분석리포트 §3.8 DS-001 (ds_main) / DS-002 (ds_userRolegrp) / DS-003 (ds_rolegrpList) /
 *     DS-006 (ds_mainAll) / §9.1 (DB 컬럼 카탈로그) / §11 To-Be 정책 #2 / #3 (D)
 *   - 기능설계서 §3.1 (S-NNN 3) / §3.2 (G/GR/GL) / §4.1 (D-NNN 20)
 *   - BPMN설계서 (11 action DTO 매핑)
 *
 * As-Is 컬럼명 (SNAKE_CASE) 보존 — BE Service 의 row mapping 키와 1:1 일치.
 * To-Be 정책 #3 (D) / Q-005 — D-013~015 (GROUP_ID1~3) UI 콤보 제거, DB 컬럼은 보존.
 */

/** 조회조건 — 기능 §3.1 / 분석 §3.2 (3 행). */
export interface CommUserMngFilters {
  /** S-001 — 사용자 키 (USER_ID / USER_EMP_NO / USER_NM 3 컬럼 UPPER LIKE OR 부분 일치). */
  edt_USER_ID: string;
  /** S-002 — 사용 여부 (Y/N 일치 / 빈 값 = 전체). default "Y". */
  cbo_USE_TP: string;
  /** S-003 — 내부 외부 구분 (I/O 일치 / 빈 값 = 전체). */
  cbo_IN_OUT_EMP_TP: string;
}

/**
 * 메인 사용자 그리드 row — As-Is ds_main 19 컬럼 (정책 #2 DEPT_NM 부착).
 * 분석 §3.3 G-001~G-017 + Detail §3.6 D-NNN.
 */
export interface CommUserMngRow extends Record<string, unknown> {
  /** D-001 / G-002 — PK (V-004 필수). 신규 행에서만 입력. */
  USER_ID: string;
  /** D-002 / G-003 — 사번 (V-005 / V-102 필수). */
  USER_EMP_NO?: string;
  /** D-003 / G-004 — SSO ID. */
  SSO_ID?: string;
  /** D-004 / G-005 — 사용자명 (V-102 필수). */
  USER_NM?: string;
  /** D-005 / G-006 — 유효개시일. rowAdd 기본값 = today (xfdl:862). */
  START_ACTIVE_DATE?: string | null;
  /** D-006 / G-007 — 유효기한일 / 논리삭제 마감일. rowAdd 기본값 = "99991231" → To-Be 9999-12-31. */
  END_ACTIVE_DATE?: string | null;
  /** D-007 / G-008 — 부서코드 (LV-005 TB_MCM_DEPT_INFO / V-102 필수). */
  DEPT_CD?: string;
  /** 부속 — DEPT_INFO 부착 표시명 (정책 #2 / T-008 — As-Is EAI scalar subquery 대체). */
  DEPT_NM?: string | null;
  /** D-008 / G-009 — 사용자분류코드. */
  USER_CATEGORY_CD?: string;
  /** D-016 (Radio) / G-010 / S-002 — 사용 여부 (Y/N). */
  USE_TP?: string;
  /** D-009 / G-011 — 이메일 (V-102 필수). */
  EMAIL?: string;
  /** D-010 / G-012 — 전화 번호. */
  TEL_NO?: string;
  /** D-011 / G-013 — 모바일 번호. */
  MOBILE_TEL_NO?: string;
  /** D-012 / G-014 / S-003 — 내부 외부 구분 (V-102 필수). */
  IN_OUT_EMP_TP?: string;
  /** G-015 — DB 컬럼 보존 (D-013 콤보 UI 폐기 / 정책 #3 (D)). */
  GROUP_ID1?: string;
  /** G-016 — DB 컬럼 보존 (D-014 폐기). */
  GROUP_ID2?: string;
  /** G-017 — DB 컬럼 보존 (D-015 폐기). */
  GROUP_ID3?: string;
  /** D-019 — 정보처리의뢰서번호 (저장 시 setColumn 으로 ds_main 으로 복사). */
  INF_REQ_NO?: string | null;
  /** D-020 — 처리사유 (저장 시 setColumn). */
  DESCRIPTION?: string | null;
}

/**
 * 중복 검증용 전체 사용자 row (ds_mainAll). 분석 §3.8 DS-006.
 * V-004 / V-006 (V-104 / V-106 / V-204 / V-206) 검증용. USER_ID + USER_EMP_NO 만.
 */
export interface CommUserMngAllRow extends Record<string, unknown> {
  USER_ID: string;
  USER_EMP_NO?: string;
}

/**
 * 보유 역할그룹 row (ds_userRolegrp) — 우상 그리드 GR-NNN. 분석 §3.4 (3 컬럼).
 */
export interface CommUserMngRoleGrpRow extends Record<string, unknown> {
  ROLE_GROUP_ID: string;
  ROLE_GROUP_NM?: string;
  USER_ID?: string;
}

/**
 * 추가 가능 역할그룹 row (ds_rolegrpList) — 우하 그리드 GL-NNN. 분석 §3.5 (2 컬럼).
 * 활성 (USE_TP='Y' + BETWEEN) + 보유 NOT EXISTS 필터.
 */
export interface CommUserMngRoleGrpListRow extends Record<string, unknown> {
  ROLE_GROUP_ID: string;
  ROLE_GROUP_NM?: string;
}

/** 부서 LoV row (ds_userDept) — D-007 commonDynamic 부서 팝업 (정책 #2 TB_MCM_DEPT_INFO). */
export interface CommUserMngDeptRow extends Record<string, unknown> {
  DEPT_CD: string;
  DEPT_NM?: string;
}

/**
 * Detail 부서 LoV 모달 row (ds_deptLov) — 2026-06-04 신설 / 사용자 결정.
 *
 * Detail 영역 부서코드 직접 타이핑 ✗ → 검색 버튼 + LoV 모달 그리드 (DEPT_CD/DEPT_NM)
 * → 선택 시 DEPT_CD + DEPT_NM 자동 세트. 응답 컬럼은 ds_userDept 와 동일하나 활용처 분리.
 */
export interface DeptLovRow extends Record<string, unknown> {
  DEPT_CD: string;
  DEPT_NM?: string;
}

/** Nexacro row status (As-Is !nativeeditor_status) — To-Be rowStatus 표준화 (W1·W2·W3·W4 정본 패턴). */
export type RowStatus = "" | "inserted" | "updated" | "deleted";
