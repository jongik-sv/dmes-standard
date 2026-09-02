/**
 * commPermMng (PERMISSION 관리) 화면 타입.
 *
 * 인용 정본:
 *   - 분석리포트 §3.7 DS-001 (ds_main 컬럼) / §9 (DB 컬럼 카탈로그) / §11 To-Be 정책 #1
 *   - 기능설계서 §3.1 / §3.2 / §4.1
 *   - BPMN설계서 §1.1 / §4.1
 *
 * As-Is 컬럼명 (SNAKE_CASE) 보존 — BE Service 의 toSearchRow / saveCmPerm row mapping 키와 1:1 일치.
 * To-Be 정책 #1 (BIZ_SYSTEM_CODE 폐기) 반영 — ds_main 12 → 11 컬럼 (BIZ_SYSTEM_CODE 제거 / ROLE_ID 보존).
 */

/** 조회조건 — 분석 §3.2 / 기능 §3.1 / To-Be 3 파라미터 (S-001 폐기). */
export interface CommPermMngFilters {
  /** S-002 — PERMISSION ID (UPPER LIKE 부분 일치). */
  edt_PERMISSION_ID: string;
  /** S-003 — PERMISSION 명 (UPPER LIKE 부분 일치). */
  edt_PERMISSION_NM: string;
  /** S-004 — 사용 여부 (Y/N 일치 / 빈 값 = 전체). */
  cbo_USE_TP: string;
}

/**
 * Master 그리드 row — As-Is ds_main (xfdl:159~174) + To-Be 정책 #1 (BIZ_SYSTEM_CODE 제거).
 * 본 10 컬럼 + ROLE_ID (scalar subquery — fn_rowDelete 차단 검증용).
 */
export interface CommPermMngRow extends Record<string, unknown> {
  /** G-002 / D-002 — PK (신규 행만 입력 허용). */
  PERMISSION_ID: string;
  /** G-003 / D-004. */
  PERMISSION_NM?: string;
  /** G-012 / D-006. */
  PERMISSION_DESC?: string;
  /** G-004 / D-016 TextArea — 공통 버튼 권한 (B-002 팝업 결과 채움). */
  PERMISSION_COMMON?: string;
  /** G-005 / D-019 TextArea — CUSTOM 버튼 권한 (B-003 팝업 결과 채움). */
  PERMISSION_CUSTOM?: string;
  /** G-006 / D-022 TextArea — POPUP 버튼. */
  POPUP_BTN?: string;
  /** G-007 / D-024 TextArea — ACTION 권한. */
  PERMISSION_ACTION?: string;
  /** G-009 / D-010 Radio / S-004 — Y/N (저장 필수). */
  USE_TP?: string;
  /** G-010 / D-012 — As-Is 행추가 default gfn_today() 8자. */
  START_ACTIVE_DATE?: string | null;
  /** G-011 / D-014 — As-Is 행추가 default "99991231" 8자 → To-Be 정정 9999-12-31 23:59:59. */
  END_ACTIVE_DATE?: string | null;
  /** ROLE_ID — scalar subquery (TB_MCM_SEC_ROLE_MAPPING). null 아니면 fn_rowDelete 차단. */
  ROLE_ID?: string | null;
}

/** Nexacro row status (As-Is !nativeeditor_status) — To-Be rowStatus 표준화. */
export type RowStatus = "" | "inserted" | "updated" | "deleted";
