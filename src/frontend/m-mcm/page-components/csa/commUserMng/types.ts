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

/**
 * 조회조건 — 기능 §3.1 / 분석 §3.2 + 2026-11-28 시안 「사용자 비활성화·퇴직 처리」.
 *
 * 사용 여부(USE_TP)·내부 외부 구분(IN_OUT_EMP_TP) 칸은 조회 영역에서 뺐다. USE_TP='N' 이 이제 비활성과 퇴직을 함께 뜻해
 * 상태 칸과 겹치고, 관리 구분(MANUAL = 외부 'O')이 내부 외부 구분과 같은 뜻이다. 서버에는 두 칸을 빈 값(전체)으로 보낸다.
 */
export interface CommUserMngFilters {
  /** S-001 — 사용자 키 (USER_ID / USER_EMP_NO / USER_NM 3 컬럼 UPPER LIKE OR 부분 일치). */
  edt_USER_ID: string;
  /** 계정 상태 — ACTIVE·LOCKED·SUSPENDED·EXPIRED·RETIRED, 빈 값 = 전체(기본, 시안과 같다). */
  cbo_USER_ST: string;
  /** 관리 구분 — HR(ERP 인사)·MANUAL(수동 관리 = 외부), 빈 값 = 전체. */
  cbo_MANAGE_TP: string;
  /** 「비밀번호 미변경만」. */
  chk_PWD_TEMP: boolean;
  /** 「퇴직자가 담당인 데이터만」 — 켜면 목록에 담당 데이터 건수(OWNED_CNT)가 온다. */
  chk_ORPHAN: boolean;
}

/** 계정 상태 코드 (서버 AccountState). */
export type UserSt = "ACTIVE" | "LOCKED" | "SUSPENDED" | "EXPIRED" | "RETIRED";

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

  // ── 2026-11-28 상태 칸 (조회 전용 — 서버가 계산한다. 저장 때 서버는 PWD_EXPIRY_EXEMPT_YN 만 읽는다) ──
  /** 계정 상태 코드. 신규 행에는 없다. */
  USER_ST?: UserSt | string;
  /** 상태 이름 — 활성·잠금·비활성·기한 밖·퇴직. */
  USER_ST_NM?: string;
  /** 상태 사유(이력의 사유 또는 잠금 시각 등). */
  ST_RSN?: string | null;
  /** 비밀번호 실패 잠금 Y/N. */
  LOCK_YN?: string;
  /** ERP 인사 상태 — ACTIVE·LEAVE·RETIRED. 비면 인사가 모르는 계정. */
  HR_ST?: string | null;
  /** 관리 구분 — HR(ERP 인사)·MANUAL(수동 관리, 외부 구분 O). */
  MANAGE_TP?: string;
  /** 비밀번호 미변경(임시 비밀번호 상태) Y/N. */
  PWD_TEMP_YN?: string;
  /** 임시 비밀번호 만료 일시. */
  TEMP_PWD_EXP?: string | null;
  /** 마지막 비밀번호 변경 일시. 비면 임시 상태. */
  LAST_PWD_CHNG_DATE?: string | null;
  /** 비밀번호 사용 기간 제외(인터페이스·배치 계정) Y/N — 상세 폼에서 고쳐 저장한다. */
  PWD_EXPIRY_EXEMPT_YN?: string;
  /** 마지막 로그인 일시. */
  LAST_LOGIN_AT?: string | null;
  /** 담당 데이터 건수 — 「퇴직자가 담당인 데이터만」 조회 때만 온다. MDM 에 닿지 못하면 null. */
  OWNED_CNT?: number | null;
}

/** 조회 전용 상태 칸 — 행 복사로 새 행을 만들 때 떼어 낸다. */
export const STATE_FIELDS = [
  "USER_ST", "USER_ST_NM", "ST_RSN", "LOCK_YN", "HR_ST", "MANAGE_TP", "PWD_TEMP_YN",
  "TEMP_PWD_EXP", "LAST_PWD_CHNG_DATE", "LAST_LOGIN_AT", "OWNED_CNT",
] as const;

/** 담당 데이터 한 종류 (searchOwned ds_owned · retire/handover HANDOVER_ITEMS). */
export interface OwnedRow extends Record<string, unknown> {
  USER_ID?: string;
  KIND?: string;
  KIND_NM?: string;
  CNT?: number;
  /** Y = 넘기지 않고 건너뜀. */
  SKIPPED?: string;
}

/** 담당 데이터 인계 결과 — retire·handover 응답 공통. */
export interface HandoverResult {
  cnt_save?: number;
  HANDOVER_ST?: "DONE" | "PENDING" | "FAILED" | string;
  HANDOVER_MSG?: string;
  HANDOVER_ITEMS?: OwnedRow[];
}

/** 퇴직 처리 응답. */
export interface RetireResult extends HandoverResult {
  ROLE_GROUP_CNT?: number;
  ASSIGN_CNT?: number;
}

/**
 * 퇴직 미리 보기 응답(searchRetirePreview, 2026-11-28) — 퇴직 처리가 회수·해제할 건수. 아무것도 바꾸지 않는다.
 * ds_owned 는 ERD 작업 중 표시(KIND=ERD_CLAIM)까지 담는다. MDM 에 닿지 못하면 ds_owned 는 빈 목록·CLAIM_CNT 없음·OWNED_ERROR 문구.
 */
export interface RetirePreview {
  ROLE_GROUP_CNT?: number;
  ASSIGN_CNT?: number;
  CLAIM_CNT?: number;
  ds_owned?: OwnedRow[];
  OWNED_ERROR?: string;
}

/** 받을 사람 후보 한 명(searchActiveUserLov ds_userLov) — 상태 활성·잠금만 온다. */
export interface ActiveUserLovRow extends Record<string, unknown> {
  USER_ID?: string;
  USER_NM?: string;
  USER_EMP_NO?: string;
  DEPT_CD?: string;
  DEPT_NM?: string | null;
  USER_ST?: string;
  USER_ST_NM?: string;
}

/** 받을 사람 찾기 응답. 후보가 상한(200명)을 넘으면 LOV_TRUNCATED=Y. */
export interface ActiveUserLovPayload {
  ds_userLov?: ActiveUserLovRow[];
  LOV_TRUNCATED?: "Y" | "N" | string;
}

/** ERP 인사 정보 한 건 (searchHrEvt ds_hrEvt). */
export interface HrEvtRow extends Record<string, unknown> {
  EVT_ID: string | number;
  EMP_NO?: string;
  /** HIRE·LEAVE·RETURN·RETIRE·MOVE·INFO. */
  EVT_TP?: string;
  /** 발령일 yyyyMMdd. */
  EVT_DT?: string;
  ORDER_NO?: string | null;
  USER_NM?: string | null;
  DEPT_CD?: string | null;
  USER_ID?: string | null;
  /** WAIT·DONE·SKIP·FAIL·HOLD. */
  PROC_ST?: string;
  PROC_MSG?: string | null;
  TRY_CNT?: number | null;
  PROC_AT?: string | null;
}

/** 다시 처리 결과 한 건 (retryHrEvt ds_hrResult). */
export interface HrResultRow extends Record<string, unknown> {
  EVT_ID: string | number;
  PROC_ST?: string;
  PROC_MSG?: string | null;
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

/** 그리드 내부 키·행 상태가 붙은 행 (화면 루트와 상세 폼이 공유). */
export interface GridRow extends Record<string, unknown> {
  __gridTempId?: string;
  __rowId?: string;
  nativeeditor_status?: RowStatus;
}

/** 메인 그리드 행 = 사용자 행 + 그리드 내부 키·상태. 상세 폼의 초안 단위. */
export type CommUserMngGridRow = CommUserMngRow & GridRow;
