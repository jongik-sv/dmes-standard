/**
 * commPermMng (퍼미션 관리) 화면 타입 — perm-bench 새 설계(시안 v16 lgPermNext, decompose.md §0.4).
 *
 * 새 퍼미션 = 역할 × 오브젝트 한 건(TB_MCM_SEC_ROLE_PERM, PK ROLE_ID·OBJECT_ID).
 * 버튼·팝업 권한은 오브젝트(TB_MCM_SEC_OBJ.BTN_PERM·POPUP_PERM)가 허용한 값 안에서만 고른다(D15).
 * 칸 이름 = BE 응답 키 그대로(SNAKE_CASE). 콤마로 잇는 값은 문자열 그대로 둔다.
 *
 * OASIS action(객체 commPermMng):
 *   - lov          — params 없음 → grids `roles`(PermRoleLov) · `menus`(PermMenuLov)
 *   - search       — params PermSearchParams → grids `perms`(PermRow) · data `TOTAL_CNT`
 *   - searchPermOne — params { roleId, objectId } → grids `others`(PermOtherRow) · `groups`(PermRoleGroupRow) · data `USER_CNT`
 *   - save         — grids `perms`(PermSaveRow, D36 목록 입력 = grids) → data `cnt_merge`·`cnt_delete`
 *   (action 이름 = 기존 BPMN 분기 search·save 그대로. 새 이름은 lov·searchPermOne 만 — perm-core 시드 등록 대상)
 *     실패 = UserException PERM_NOT_IN_OBJ(오브젝트 밖 값) · PERM_EMPTY_BTN(빈 BTN, D14)
 */

/** 조회 조건 4개 + 퍼미션 없는 오브젝트도(역할을 고를 때만). */
export interface PermSearchParams {
  /** 역할 ID. 빈 값 = 전체(SYSADMIN 제외). */
  roleId: string;
  /** 메뉴 ID(모듈 또는 폴더). 빈 값 = 전체 메뉴. 고른 메뉴 아래 오브젝트 전부. */
  menuId: string;
  /** 오브젝트 ID·이름 부분 일치(대소문자 무시). */
  objectQ: string;
  /** 버튼·팝업 코드 부분 일치. 퍼미션 있는 줄 = 퍼미션 값, 없는 줄 = 오브젝트 허용 값에서 찾는다. */
  codeQ: string;
  /** Y = 고른 역할의 퍼미션 없는 오브젝트도 줄로 낸다(roleId 가 비면 무시). */
  showEmpty: "Y" | "N";
  /** 1부터. */
  pageNo: number;
  pageSize: number;
}

/** 퍼미션 목록 한 줄 = 역할 × 오브젝트(정렬 = 역할 → 메뉴 순서). */
export interface PermRow extends Record<string, unknown> {
  ROLE_ID: string;
  ROLE_NM?: string;
  OBJECT_ID: string;
  OBJECT_NM?: string;
  /** 메뉴 경로 표시(예: "공통관리 › 시스템관리"). */
  MENU_PATH?: string;
  /** 오브젝트를 가리키는 메뉴 이름(여럿이면 첫 번째). */
  MENU_NM?: string;
  /** 오브젝트 허용 버튼(TB_MCM_SEC_OBJ.BTN_PERM, 콤마). */
  OBJ_BTN_PERM?: string;
  /** 오브젝트 허용 팝업(TB_MCM_SEC_OBJ.POPUP_PERM, 콤마). */
  OBJ_POPUP_PERM?: string;
  /** 「조회만」 값(서버 PermTokens.readPreset, D18). */
  OBJ_READ_PERM?: string;
  /** 퍼미션 버튼(없는 줄 = 빈 값). 오브젝트 밖 값이 남아 있을 수 있다(D15 — 계산에서만 빠짐). */
  BTN_PERM?: string;
  POPUP_PERM?: string;
  /** 데이터 권한 — 조회·저장 통과만, 편집 UI 없음(D21). */
  DATA_PERM?: string;
  /** Y = 퍼미션 행 있음, N = showEmpty 로 낸 빈 줄. */
  HAS_PERM: "Y" | "N";
}

/** 같은 오브젝트의 다른 역할 퍼미션(오른쪽 「같은 화면 다른 퍼미션」). */
export interface PermOtherRow extends Record<string, unknown> {
  ROLE_ID: string;
  ROLE_NM?: string;
  BTN_PERM?: string;
  POPUP_PERM?: string;
}

/** 역할이 들어 있는 그룹(오른쪽 「받는 사람」 옆 그룹 이름). */
export interface PermRoleGroupRow extends Record<string, unknown> {
  ROLE_GROUP_ID: string;
  ROLE_GROUP_NM?: string;
  USER_CNT?: number;
}

/** 저장 한 줄 — PK merge(MERGE) 또는 delete(DEL). grids.perms.rows 로 보낸다(D36). */
export interface PermSaveRow extends Record<string, unknown> {
  ROLE_ID: string;
  OBJECT_ID: string;
  BTN_PERM: string;
  POPUP_PERM: string;
  DATA_PERM: string;
  OP_TP: "MERGE" | "DEL";
}

/** 역할 고르기 목록(SYSADMIN 제외). */
export interface PermRoleLov extends Record<string, unknown> {
  ROLE_ID: string;
  ROLE_NM?: string;
  USE_TP?: string;
}

/** 메뉴 고르기 목록 — 모듈(MENU_LV 1)·폴더(2 이상). 화면(오브젝트를 가리키는 잎)은 빼고 내린다. */
export interface PermMenuLov extends Record<string, unknown> {
  MENU_ID: string;
  MENU_NM?: string;
  PARENT_MENU_ID?: string | null;
  MENU_LV: number;
  /** 표시용 경로(예: "공통관리 › 시스템관리"). */
  MENU_PATH?: string;
}

/** save 거절 코드(UserException). */
export type PermSaveError = "PERM_NOT_IN_OBJ" | "PERM_EMPTY_BTN";
