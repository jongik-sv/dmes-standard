/**
 * commObjMng (OBJECT 관리) 화면 타입.
 *
 * 인용 정본:
 *   - 분석리포트 §3.8 DS-001 (ds_main 컬럼) / §9 (DB 컬럼 카탈로그) / §11 To-Be 정책 #1
 *   - 기능설계서 §3.1 / §3.2 / §4.1
 *   - BPMN설계서 §5.1 / §5.2 / §5.3
 *
 * As-Is 컬럼명 (SNAKE_CASE) 보존 — BE Service 의 toSearchRow / saveCmObj row mapping 키와 1:1 일치.
 * To-Be 정책 #1 (BIZ_SYSTEM_CODE 폐기) 반영.
 */

/** 조회조건 — 분석 §3.2 / 기능 §3.1 / To-Be 2 파라미터 (S-001 폐기). */
export interface CommObjMngFilters {
  /** S-002 — OBJECT (UPPER LIKE OBJECT_ID OR OBJECT_NM). */
  edt_OBJECT_ID: string;
  /** S-003 — 사용 여부 (Y/N 일치 / 빈 값 = 전체). */
  cbo_USE_TP: string;
  /** 퍼미션 모델 v2 — 메뉴 폴더(하위 포함). 빈 값 = 전체. 옵션 = `lov` 의 ds_lovMenuId. */
  menuFolderId: string;
}

/**
 * Master 그리드 row — As-Is ds_main (xfdl:168~187) + To-Be 정책 #1 (BIZ_SYSTEM_CODE 제거).
 * 본 13 컬럼 + scalar subquery MENU_ID + 계산 ID + FE row state.
 */
export interface CommObjMngRow extends Record<string, unknown> {
  /** G-002 / D-001 — PK (자동 조합 `{MENU_ID}::{ID}`). */
  OBJECT_ID: string;
  /** G-003 / D-006. */
  OBJECT_NM?: string;
  /** G-004 / D-007. */
  PROGRAM_DESC?: string;
  /** G-005 / D-002 — As-Is 행추가 default "MES". */
  SYSTEM_CODE?: string;
  /** G-007 / D-008 — As-Is 행추가 default "web". */
  OBJECT_TYPE?: string;
  /** G-008 / D-009. */
  SERVICE?: string;
  /** G-009 / D-013 / S-003 — Y/N (저장 필수 V-002). */
  USE_TP?: string;
  /**
   * G-015 / D-010 — "내부" / "외부" (저장 필수 V-002 / FORM_URL/OUT_ACCESS_IP enable 분기).
   * 2026-06-03 사용자 명시 변경 — As-Is "1"/"2"/"3" 3 enum → To-Be "내부"/"외부" 2 enum.
   * DB 잔존 값 ("1"/"2"/"3") 은 DataInitializer 멱등 UPDATE 가 "내부"/"외부" 로 일괄 정정.
   */
  ACCESS_TP?: string;
  /** G-010 / D-011. */
  FORM_URL?: string;
  /** G-011 / D-012 — As-Is 라벨 "외부  접속 주소" 더블 스페이스 보존. */
  OUT_ACCESS_IP?: string;
  /** G-012 / D-014. */
  PARAM?: string;
  /** G-013 / D-015 — As-Is 행추가 default gfn_today() 8자. */
  START_ACTIVE_DATE?: string | null;
  /** G-014 / D-016 — As-Is 행추가 default "99991231" 8자 → To-Be 정정 9999-12-31 23:59:59. */
  END_ACTIVE_DATE?: string | null;
  /** D-004 cbo_folder — scalar subquery (TB_MCM_SEC_MENU.MENU_ID).
   *  2026-06-05 — BE searchCmObj 응답에서 OBJECT_ID 와 동일한 redundant alias 로 사용. BE 호환성 유지. */
  MENU_ID?: string;
  /** 2026-06-05 — 실제 그룹 토큰 (csa/cma/cme) source. FORM_URL 자동 산출 = `${PARENT_MENU_ID}/${OBJECT_ID}`.
   *  componentPath 정합 (Phase 1+2 라우팅 패턴). Detail MENU ID 콤보의 binding 필드. */
  PARENT_MENU_ID?: string;
  /** D-005 — OBJECT_ID 의 "::" 이후 (As-Is SUBSTR/INSTR/LENGTH 계산). */
  ID?: string;
  /** 퍼미션 모델 v2 — 버튼 허용 값(콤마로 잇는 코드, 최대 500자). */
  BTN_PERM?: string;
  /** 퍼미션 모델 v2 — 팝업 허용 값(최대 1000자). */
  POPUP_PERM?: string;
  /** 퍼미션 모델 v2 — 데이터 허용 값(최대 1000자). */
  DATA_PERM?: string;
  /** 읽기 전용 집계 — 이 오브젝트를 가리키는 메뉴 수 (조회 응답에서만 온다). */
  MENU_CNT?: number | string;
  /** 읽기 전용 집계 — 이 오브젝트의 퍼미션(역할×오브젝트) 수 (조회 응답에서만 온다). */
  PERM_CNT?: number | string;
  /**
   * FE 전용 — 조회 시점의 허용 값·사용 여부. 값을 뺄 때 영향 안내를 만들고 USE_TP Y→N 확인을 거는 기준.
   * 저장 body 에는 싣지 않는다(stripInternal).
   */
  __orig?: ObjOrig;
  /** FE 전용 — 조회 시점의 행 전체(행취소가 되돌릴 값). 저장 body 에는 싣지 않는다(stripInternal). */
  __snap?: Record<string, unknown>;
}

/** 조회 시점 값 스냅샷(FE 전용). */
export interface ObjOrig {
  BTN_PERM: string;
  POPUP_PERM: string;
  USE_TP: string;
}

/** searchObjPerm grids.perms — 이 오브젝트를 쓰는 역할(퍼미션 한 건). */
export interface ObjPermRow extends Record<string, unknown> {
  ROLE_ID: string;
  ROLE_NM?: string;
  ROLE_USE_TP?: string;
  BTN_PERM?: string;
  POPUP_PERM?: string;
  DATA_PERM?: string;
  /** 오브젝트 허용 값 안에서 실제로 켜진 버튼/팝업(효과 값). */
  EFF_BTN_PERM?: string;
  EFF_POPUP_PERM?: string;
  /** 이 역할을 받은 사람 수. */
  USER_CNT?: number | string;
}

/** searchObjMenu grids.menus — 이 오브젝트를 가리키는 메뉴. */
export interface ObjMenuRow extends Record<string, unknown> {
  MENU_ID: string;
  MENU_NM?: string;
  PARENT_MENU_ID?: string;
  MENU_PATH?: string;
  MENU_TP?: string;
  MENU_VIEW_YN?: string;
  USE_TP?: string;
}

/** save 응답 grids.impacts — 뺀 허용 값·사용 안 함이 퍼미션에 미친 영향. */
export interface SaveImpactRow extends Record<string, unknown> {
  OBJECT_ID: string;
  KIND: "BTN" | "POPUP" | "USE_TP" | string;
  CODE?: string;
  PERM_CNT?: number | string;
  USER_CNT?: number | string;
}

/** MENU_ID LoV — D-004 cbo_folder (LV-001, To-Be 재정렬 — As-Is LV-002). */
export interface MenuIdLov extends Record<string, unknown> {
  MENU_ID: string;
  BIZ_SYSTEM_CODE?: string;
  MENU_ID_NM: string;
}

/** Nexacro row status (As-Is !nativeeditor_status) — To-Be rowStatus 표준화. */
export type RowStatus = "" | "inserted" | "updated" | "deleted";
