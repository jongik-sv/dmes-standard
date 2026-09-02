/**
 * commMenuMng (메뉴 관리) 화면 타입.
 *
 * 인용 정본:
 *   - 분석리포트 §3.8 DS-001 (ds_menuList 컬럼) / DS-002 (ds_menuTreeList) / DS-006 (ds_objMng) /
 *     §9 (DB 컬럼 카탈로그) / §11 To-Be 정책 #1
 *   - 기능설계서 §3.2 / §4.1 (D-NNN)
 *   - BPMN설계서 §5.1~§5.5 (DTO 매핑)
 *
 * As-Is 컬럼명 (SNAKE_CASE) 보존 — BE Service 의 row mapping 키와 1:1 일치.
 * To-Be 정책 #1 (BIZ_SYSTEM_CODE 폐기) 반영 — 조회조건 / OBJECT 그리드에서 제거.
 */

/** 조회조건 — 분석 §3.2 / 기능 §3.1 / To-Be 3 파라미터 (S-001 cbo_bizSystemCode 폐기). */
export interface CommMenuMngFilters {
  /** S-002 — 메뉴 ID UPPER LIKE 부분 일치. */
  edt_MENU_ID: string;
  /** S-003 — 메뉴 명 LIKE 부분 일치. */
  edt_MENU_NM: string;
  /** S-004 — 사용 유무 (Y/N 일치 / 빈 값 = 전체). */
  cbo_USE_TP: string;
}

/**
 * 메뉴 리스트 그리드 row — As-Is ds_menuList (xfdl:244~264) + To-Be 정책 #1 (BIZ_SYSTEM_CODE 미포함).
 * 본 15 컬럼 (PK 복합 MENU_ID+MENU_SEQ) + OBJECT_NM scalar + FE row state.
 */
export interface CommMenuMngRow extends Record<string, unknown> {
  /** G-003 / D-002 — PK#1 (xfdl D-002 cbo_menu_id substr(0,5)). */
  MENU_ID: string;
  /** G-002 / D-005 — PK#2 (xfdl D-002 substr(0,5) + D-004 edt_lst_seq lpad("0",3) = 8 char). */
  MENU_SEQ: string;
  /** G-006 / D-009 — FULL 정렬 순서 (inputtype=digit). */
  FULL_SEQ?: string;
  /** G-004 / D-006 — 메뉴 명칭 (Essential V-002). */
  MENU_NM?: string;
  /** G-012 / D-015 — 메뉴 설명 (TextArea). */
  MENU_DESC?: string;
  /** G-008 / D-011 — 메뉴 타입 (WEB/MOBIL, 신규 행 default 'WEB'). */
  MENU_TP?: string;
  /** G-005 / D-007 — FK to TB_MCM_SEC_OBJ (Essential V-002, commonDynamic.xfdl LoV). */
  OBJECT_ID?: string;
  /** G-NNN 부속 (LEFT JOIN B.OBJECT_NM). */
  OBJECT_NM?: string;
  /** G-007 / S-004 / D-010 — 사용 여부 (Y/N, 신규 행 default 'Y'). */
  USE_TP?: string;
  /** G-009 / D-012 — As-Is 신규 행 default gfn_today() 8자. */
  START_ACTIVE_DATE?: string | null;
  /** G-010 / D-013 — As-Is 신규 행 default "99991231" 8자 → To-Be BE 정정 9999-12-31 23:59:59. */
  END_ACTIVE_DATE?: string | null;
  /** G-011 / D-014 — 표시 여부 (Y/N, 신규 행 default 'Y'). */
  MENU_VIEW_YN?: string;
  /** D-008 — As-Is 보존 자기참조 (INSERT/UPDATE 시 BE 가 MENU_ID 로 자동 세트). */
  PARENT_MENU_ID?: string;
  /** D-016. */
  MENU_PARAM1?: string;
  /** D-017. */
  MENU_PARAM2?: string;
  /** D-018. */
  MENU_PARAM3?: string;
}

/**
 * 메뉴 트리 그리드 row — As-Is ds_menuTreeList (xfdl:265~273). selectMenuFldList CTE 결과 5 컬럼.
 */
export interface CommMenuMngTreeRow extends Record<string, unknown> {
  /** 메뉴 트리 depth (0=최상위 / >0=하위). To-Be CTE 누적 컬럼. */
  LEV: number;
  /** 트리 노드 식별자. */
  MENU_ID: string;
  /** 트리 노드의 순서 정렬 키 (1차 정렬). */
  MENU_SEQ?: string;
  /** 트리 노드 2차 정렬 키 (MENU_SEQ tie-break). 2026-06-04 자동부여 후 FLD owner row 도 FULL_SEQ 보유
   *  (NUMERIC(10,0) → 응답이 number 일 수 있음. buildMenuTree 가 String() 코어션). */
  FULL_SEQ?: string | number | null;
  /** GT-001 표시 텍스트 (treeitemcontrol). */
  MENU_NM?: string;
  /** 트리 부모-자식 관계. */
  PARENT_MENU_ID?: string | null;
}

/**
 * OBJECT 그리드 row — As-Is ds_objMng (xfdl:304~316) + To-Be 정책 #1 (BIZ_SYSTEM_CODE 제거 후 8 컬럼).
 * GO-NNN read-only 표시 전용.
 */
export interface CommMenuMngObjRow extends Record<string, unknown> {
  /** GO-007. */
  SYSTEM_CODE?: string;
  /** GO-009. */
  OBJECT_TYPE?: string;
  /** GO-002. */
  SERVICE?: string;
  /** GO-004. */
  USE_TP?: string;
  /** GO-001. */
  FORM_URL?: string;
  /** GO-003. */
  PARAM?: string;
  /** GO-005. */
  START_ACTIVE_DATE?: string | null;
  /** GO-006. */
  END_ACTIVE_DATE?: string | null;
}

/**
 * OBJECT 팝업 LoV row — As-Is ds_menuObjLst (commonDynamic.xfdl P-001 의 13번째 파라미터).
 * selectMenuObjPop 결과 6 컬럼 (2026-06-04 round 5 — PARENT_MENU_ID 추가).
 *
 * PARENT_MENU_ID: TB_MCM_SEC_MENU 에 동일 OBJECT_ID 가 매핑돼 있을 때 그 행의 PARENT_MENU_ID (상위 폴더).
 * 미매핑 시 null. FE 는 LoV 선택 시 Detail PARENT_MENU_ID 도 함께 자동 세트.
 */
export interface CommMenuMngObjLovRow extends Record<string, unknown> {
  OBJECT_ID: string;
  OBJECT_NM?: string;
  SERVICE?: string;
  FORM_URL?: string;
  PARAM?: string;
  PARENT_MENU_ID?: string | null;
}

/** Nexacro row status (As-Is !nativeeditor_status) — To-Be rowStatus 표준화 (W1 / cma 정본 패턴). */
export type RowStatus = "" | "inserted" | "updated" | "deleted";
