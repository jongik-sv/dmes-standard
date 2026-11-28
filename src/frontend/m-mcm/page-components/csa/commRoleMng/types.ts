/**
 * commRoleMng (역할 관리) 화면 타입 — perm-bench 새 설계(시안 v16 lgRoleNext, decompose.md §0.4).
 *
 * 새 퍼미션 = 역할 × 오브젝트 한 건(TB_MCM_SEC_ROLE_PERM). 「이 역할의 퍼미션」 한 칸이
 * 옛 세 칸(현재 버튼 권한 · OBJECT 선택 · 권한 선택)을 대신한다. PERMISSION_ID 고르기 없음.
 *
 * OASIS action(객체 commRoleMng):
 *   - search(BPMN 분기 이름, 서비스 searchCmRole) — 옛 조건 그대로 → grids `ds_main`(RoleRow = 옛 칸 + RoleAggCols)
 *   - save(서비스 saveCmRole) — grids `master`(옛 그대로, USE_TP N 포함)
 *   - searchRoleGroups     — params { roleId } → grids `groups`(RoleGroupRow) · data `USER_CNT`(그룹 겹침 뺀 사람 수)
 *   - searchCmRoleMap      — params { roleId } → grids `perms`(RolePermRow)
 *   - saveCmRoleMap        — params { roleId } + grids `perms`(RolePermSaveRow, D36) → data `cnt_merge`·`cnt_delete`
 *     실패 = PERM_NOT_IN_OBJ · PERM_EMPTY_BTN
 *   - searchFolderObj      — params { roleId, menuFolderId } → grids `objs`(FolderObjRow). 옛 searchCmPerm·searchObjectLov 대체
 *   - lov                  — grids `menus`(RoleMenuLov, 폴더 고르기). 옛 MENU_ID lov `ds_lovMenuId` 는 역할 MENU_ID 칼럼과 함께 없앴다(2026-11-28)
 */

/** searchCmRole 응답에 더하는 집계 칸(계산 값, DB 칼럼 아님). */
export interface RoleAggCols {
  /** 이 역할이 들어 있는 그룹 수. */
  GROUP_CNT?: number;
  /** 받은 사람 수(그룹 겹침 뺀 사람 수). */
  USER_CNT?: number;
  /** 퍼미션 수. SYSADMIN 은 -1(= 「모두」 표시). */
  PERM_CNT?: number;
}

/** 역할 목록 한 줄(새 설계) = 옛 칸 + 집계 칸. */
export type RoleRow = CommRoleMngRow & RoleAggCols;

/** 들어 있는 그룹(상세). 그룹에 넣고 빼기는 역할 그룹 관리에서 한다. */
export interface RoleGroupRow extends Record<string, unknown> {
  ROLE_GROUP_ID: string;
  ROLE_GROUP_NM?: string;
  USE_TP?: string;
  USER_CNT?: number;
}

/** 이 역할의 퍼미션 한 줄 = 퍼미션 한 건(ROLE_ID, OBJECT_ID). */
export interface RolePermRow extends Record<string, unknown> {
  ROLE_ID: string;
  OBJECT_ID: string;
  OBJECT_NM?: string;
  /** 오브젝트를 가리키는 메뉴가 들어 있는 폴더 MENU_ID(폴더 거르기). */
  MENU_FOLDER_ID?: string;
  /** 메뉴 경로 표시. */
  MENU_PATH?: string;
  MENU_NM?: string;
  OBJ_BTN_PERM?: string;
  OBJ_POPUP_PERM?: string;
  OBJ_READ_PERM?: string;
  BTN_PERM?: string;
  POPUP_PERM?: string;
  DATA_PERM?: string;
}

/** 저장 한 줄 — grids.perms.rows(D36). MERGE = 추가·변경, DEL = 빼기. */
export interface RolePermSaveRow extends Record<string, unknown> {
  ROLE_ID: string;
  OBJECT_ID: string;
  BTN_PERM: string;
  POPUP_PERM: string;
  DATA_PERM: string;
  OP_TP: "MERGE" | "DEL";
}

/** 메뉴 폴더 오브젝트(「메뉴에서 오브젝트 추가」 후보). */
export interface FolderObjRow extends Record<string, unknown> {
  OBJECT_ID: string;
  OBJECT_NM?: string;
  /** 오브젝트를 가리키는 메뉴가 들어 있는 폴더 MENU_ID(추가한 퍼미션 줄의 폴더 거르기). */
  MENU_FOLDER_ID?: string;
  MENU_NM?: string;
  MENU_PATH?: string;
  OBJ_BTN_PERM?: string;
  OBJ_POPUP_PERM?: string;
  OBJ_READ_PERM?: string;
  USE_TP?: string;
  /** Y = 이 역할에 이미 퍼미션 있음(후보에서 뺀다). */
  HAS_PERM: "Y" | "N";
}

/** 폴더 고르기 목록(모듈·폴더). */
export interface RoleMenuLov extends Record<string, unknown> {
  MENU_ID: string;
  MENU_NM?: string;
  PARENT_MENU_ID?: string | null;
  MENU_LV: number;
  MENU_PATH?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 아래 = 옛 화면 타입 중 새 화면도 쓰는 것(CommRoleMngFilters·CommRoleMngRow·RowStatus).
// 옛 RoleMapRow·PermRow·ObjectLovRow 는 f6 에서 지웠다(옛 세 칸·searchCmPerm·searchObjectLov 를 쓰지 않는다).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * (옛) commRoleMng (역할 관리) 화면 타입.
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
 * 분석 §3.3 G-002~G-009 (G-006 BIZ_SYSTEM_CODE·G-005 MENU_ID 제거 — MENU_ID 는 2026-11-28) + ROLE_GROUP_ID(서브쿼리) + ID(= ROLE_ID) + FE row state.
 */
export interface CommRoleMngRow extends Record<string, unknown> {
  /** G-002 / D-002 — PK. 새 역할 = 입력한 ID(앞뒤 공백 제거) 그대로, 기존 역할은 바뀌지 않는다. */
  ROLE_ID: string;
  /** G-003 / D-005. */
  ROLE_NM?: string;
  /** G-004 / D-006. */
  ROLE_DESC?: string;
  /** G-007 / S-004 / D-007 (RadioGroup — Q-007 자연 흡수, 신규 행 default 'Y'). */
  USE_TP?: string;
  /** G-008 / D-008 — As-Is 신규 행 default gfn_today() 8자. */
  START_ACTIVE_DATE?: string | null;
  /** G-009 / D-009 — As-Is 신규 행 default "99991231" 8자 → To-Be BE 정정 9999-12-31 23:59:59. */
  END_ACTIVE_DATE?: string | null;
  /** 부속 — scalar subquery (xml:14~18), V-003 화면 검증용 (참조 무결성). */
  ROLE_GROUP_ID?: string | null;
  /** 부속 — D-004 ID. 조회 응답은 ROLE_ID 와 같은 값, 새 역할은 사용자가 입력(→ ROLE_ID). */
  ID?: string;
}

/** Nexacro row status (As-Is !nativeeditor_status) — To-Be rowStatus 표준화 (W1·W2 정본 패턴). */
export type RowStatus = "" | "inserted" | "updated" | "deleted";
