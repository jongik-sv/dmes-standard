/**
 * commPermBench (권한 작업대) 화면 계약 타입.
 *
 * 정본: docs/perm-bench/decompose.md §0.3 「작업대 API」 — 칸 이름을 그대로(UPPER_SNAKE) 쓴다.
 * 결정 D36(win30): 목록 입력은 OASIS params 배열이 아니라 grids 로 보낸다.
 *   → saveDraft 요청 = `grids.changes.rows`(칸 TP·KEY1·KEY2·OP·BTN_PERM·POPUP_PERM), 응답 = `grids.draft`.
 *
 * 호출 = POST /api/mcm/oasis/commPermBench/{action}. 실연결 전에는 mock.ts 의 가짜 API 가 같은 모양으로 답한다.
 */

/** 단계 1·2 공통: 현재 값(CUR)으로 답할지, 저장된 초안을 얹은 값(DRAFT)으로 답할지. */
export type PermSource = "CUR" | "DRAFT";

export type YN = "Y" | "N";

/** 못 쓰는 이유 — 서버 `DenyReason` enum 과 같은 이름. */
export type PermDenyReason =
  | "NO_PERM"
  | "NOT_IN_OBJ"
  | "ROLE_UNUSED"
  | "GROUP_UNUSED"
  | "OBJ_UNUSED"
  | "MENU_HIDDEN"
  | "NO_ROLE";

/** 쓰는 이유 — 서버 `GrantReason` enum 과 같은 이름. */
export type PermGrantReason = "PERM" | "SYSADMIN";

export type PermReason = PermDenyReason | PermGrantReason;

/** 퍼미션 칸 종류. BTN = 버튼(BTN_PERM), POPUP = 팝업을 여는 action(POPUP_PERM). */
export type PermKind = "BTN" | "POPUP";

/** SYSADMIN 역할 ID — 퍼미션 행 없이 모든 사용 오브젝트의 허용 값 전부(D13). */
export const PERM_SYSADMIN_ROLE_ID = "SYSADMIN";

// ── searchBench (1단계) ─────────────────────────────────────

export interface SearchBenchParams {
  /** 이름·부서·사번 부분 일치. 빈 값 = 전체. */
  userQ?: string;
  roleGroupId?: string;
  roleId?: string;
}

export interface BenchUserRow {
  USER_ID: string;
  USER_NM: string;
  DEPT_NM: string | null;
  USE_TP: YN;
}

export interface BenchGroupRow {
  ROLE_GROUP_ID: string;
  ROLE_GROUP_NM: string;
  USE_TP: YN;
  USER_CNT: number;
}

export interface BenchRoleRow {
  ROLE_ID: string;
  ROLE_NM: string;
  /** 역할의 대표 메뉴(폴더) ID. 없으면 null. */
  MENU_ID: string | null;
  USE_TP: YN;
  GROUP_CNT: number;
  USER_CNT: number;
  PERM_CNT: number;
}

export interface BenchUserGroupRow {
  USER_ID: string;
  ROLE_GROUP_ID: string;
}

export interface BenchGroupRoleRow {
  ROLE_GROUP_ID: string;
  ROLE_ID: string;
}

export interface SearchBenchResult {
  users: BenchUserRow[];
  groups: BenchGroupRow[];
  roles: BenchRoleRow[];
  userGroups: BenchUserGroupRow[];
  groupRoles: BenchGroupRoleRow[];
  /** 로그인한 관리자(bench-be f3 추가). ME_SYSADMIN = SYSADMIN 인가(로그인 없음 = "N"). 옛 서버는 칸이 없다. */
  me?: BenchMeRow[];
}

export interface BenchMeRow {
  ME_SYSADMIN: YN;
}

// ── searchMenuTree (1단계) ──────────────────────────────────

/** userId(사람 기준) 또는 roleId(역할 기준) 중 하나. */
export interface SearchMenuTreeParams {
  userId?: string;
  roleId?: string;
  source: PermSource;
}

export interface BenchMenuRow {
  MENU_ID: string;
  PARENT_MENU_ID: string | null;
  MENU_NM: string;
  /** 화면 메뉴만 값이 있다. 모듈·폴더는 null. */
  OBJECT_ID: string | null;
  SORT_SEQ: number;
  SHOW_TP: YN;
  USE_TP: YN;
  /** 그 사람(역할)이 메뉴에서 이 화면을 보는지. */
  VISIBLE: YN;
  /** 이유. VISIBLE = N 이면 못 보는 이유, VISIBLE = Y 면 MENU_HIDDEN(권한은 닿지만 메뉴에서 숨김 — 그 화면이나 위 폴더, bench-be #11) 또는 null. */
  REASON: PermDenyReason | null;
  /**
   * 오브젝트 사용 여부(OBJ.USE_TP). 화면 메뉴 줄에만 값이 있다. BE 결정 13b(확정, 2026-11-27) — 없으면(옛 서버·모듈·폴더)
   * 화면이 사람 기준 트리의 REASON·explain 으로 판정한다.
   */
  OBJ_USE_TP?: YN | null;
}

export interface SearchMenuTreeResult {
  menus: BenchMenuRow[];
}

// ── explain (1단계) ─────────────────────────────────────────

export interface ExplainParams {
  userId: string;
  objectId: string;
  source: PermSource;
}

export interface ExplainButtonRow {
  CODE: string;
  KIND: PermKind;
  /** 오브젝트 허용 값(OBJ.BTN_PERM·POPUP_PERM)에 있는지. */
  ALLOWED: YN;
  /** 이 사람이 실제로 쓰는지(런타임 게이트와 같은 계산). */
  GRANTED: YN;
  REASON: PermReason;
  /** 이 값을 켠 역할 ID 들(콤마). */
  ROLES: string;
  /** 그 역할을 준 그룹 ID 들(콤마). */
  GROUPS: string;
}

export interface ExplainPathRow {
  ROLE_GROUP_ID: string;
  ROLE_ID: string;
  BTN_PERM: string | null;
  POPUP_PERM: string | null;
}

export interface ExplainResult {
  buttons: ExplainButtonRow[];
  paths: ExplainPathRow[];
}

// ── searchRolePerm (1단계) ──────────────────────────────────

export interface SearchRolePermParams {
  roleId: string;
  /** 메뉴 모듈·폴더 ID. 빈 값 = 역할의 모든 퍼미션. */
  menuFolderId?: string;
  source: PermSource;
}

export interface RolePermRow {
  ROLE_ID: string;
  OBJECT_ID: string;
  OBJECT_NM: string;
  /** "모듈 › 폴더" */
  MENU_PATH: string;
  OBJ_BTN_PERM: string | null;
  OBJ_POPUP_PERM: string | null;
  /** 「조회만」 프리셋(D18, 서버 PermTokens.readPreset). */
  OBJ_READ_PERM: string | null;
  BTN_PERM: string | null;
  POPUP_PERM: string | null;
  DATA_PERM: string | null;
}

export interface SearchRolePermResult {
  perms: RolePermRow[];
}

// ── 초안 (2단계) ─────────────────────────────────────────────

/** USER_GRP = 사람↔그룹(KEY1 USER_ID, KEY2 ROLE_GROUP_ID) · GRP_ROLE = 그룹↔역할(KEY1 ROLE_GROUP_ID, KEY2 ROLE_ID) · ROLE_OBJ = 퍼미션(KEY1 ROLE_ID, KEY2 OBJECT_ID). */
export type PermChangeTp = "USER_GRP" | "GRP_ROLE" | "ROLE_OBJ";

export type PermChangeOp = "ADD" | "DEL" | "UPD";

/** 서버 PermChange record 와 1:1(D36). saveDraft 요청 `grids.changes.rows` 의 한 줄. */
export interface PermChangeRow {
  TP: PermChangeTp;
  KEY1: string;
  KEY2: string;
  OP: PermChangeOp;
  /** ROLE_OBJ 의 ADD·UPD 만 값. 그 밖은 null. */
  BTN_PERM: string | null;
  POPUP_PERM: string | null;
}

export interface SaveDraftRequest {
  grids: { changes: { rows: PermChangeRow[] } };
}

/**
 * 초안 CHANGES_JSON 원소. 서버 저장 모양이라 키가 camelCase 다(bench-be 계약 ⑤-2, null 포함).
 * 요청 rows(PermChangeRow, SNAKE)와 섞지 않는다 — 바꿀 때는 toDraftChange·fromDraftChange.
 */
export interface DraftChange {
  tp: PermChangeTp;
  key1: string;
  key2: string;
  op: PermChangeOp;
  btnPerm: string | null;
  popupPerm: string | null;
}

export const toDraftChange = (r: PermChangeRow): DraftChange => ({
  tp: r.TP,
  key1: r.KEY1,
  key2: r.KEY2,
  op: r.OP,
  btnPerm: r.BTN_PERM ?? null,
  popupPerm: r.POPUP_PERM ?? null,
});

export const fromDraftChange = (c: DraftChange): PermChangeRow => ({
  TP: c.tp,
  KEY1: c.key1,
  KEY2: c.key2,
  OP: c.op,
  BTN_PERM: c.btnPerm ?? null,
  POPUP_PERM: c.popupPerm ?? null,
});

/** 초안 한 줄. 초안이 없어도 한 줄이 온다(CHANGES_JSON "[]"·CHANGE_CNT 0·U_AT null). */
export interface DraftRow {
  /** DraftChange[] 의 JSON 문자열(camelCase 키). */
  CHANGES_JSON: string;
  CHANGE_CNT: number;
  /** 마지막 저장 시각(ISO). 초안이 없으면 null. */
  U_AT: string | null;
}

export interface DraftResult {
  draft: DraftRow[];
}

// ── impact (2단계) ───────────────────────────────────────────

export interface ImpactSummaryRow {
  GAIN_USER_CNT: number;
  LOSE_USER_CNT: number;
  SCREEN_CNT: number;
}

export interface ImpactRow {
  USER_ID: string;
  USER_NM: string;
  OBJECT_ID: string;
  OBJECT_NM: string;
  /** 얻는 action(콤마). */
  GAINED: string | null;
  /** 잃는 action(콤마). */
  LOST: string | null;
}

export interface ImpactResult {
  summary: ImpactSummaryRow[];
  /** 앞 500줄까지. */
  impacts: ImpactRow[];
}

// ── apply (2단계) ────────────────────────────────────────────

export interface ApplyParams {
  /** 잃는 사람이 있어도 적용할지. N 이면 서버가 PERM_NEED_CONFIRM 으로 막는다. */
  confirmLoss: YN;
  memo: string;
}

export interface ApplyResultRow {
  APPLY_ID: string;
  CHANGE_CNT: number;
}

export interface ApplyResult {
  result: ApplyResultRow[];
}

/**
 * 작업대 실패 코드. 서버 BusinessException 문구 = "CODE: 상세"(bench-be 계약 ①·⑤).
 * - PERM_NO_USER = 로그인 없음 · PERM_DRAFT_BUSY = 같은 관리자의 동시 첫 저장 · PERM_DRAFT_CORRUPT = 초안 JSON 깨짐
 * - PERM_FORBIDDEN = SYSADMIN 역할이 걸린 변경(GRP_ROLE·USER_GRP 는 SYSADMIN 사용자만, ROLE_OBJ 의 SYSADMIN ADD·UPD 는 늘 금지)
 * - NOT_FOUND = 변경 대상(사람·그룹·역할·오브젝트)이 없음. 서버는 HTTP 400(INVALID_VALUE)으로 "NOT_FOUND: 변경 대상이 없습니다: {key}" 를 준다
 * - PERM_DRAFT_BUSY 는 초안 동시 저장의 잠금 충돌에도 온다
 * - PERM_DRAFT_CORRUPT 는 초안 범위가 기준 지문(base fingerprint)에 없을 때도 온다 → 「초안 버리기」로 이끈다
 * - PERM_BAD_VALUE = 입력 값 형식 오류(이력 기간 형식·366일 넘음 등)
 * - PERM_BUSY = 잠금 대기 5초 넘음·교착·APPLY_ID 충돌 → 잠시 뒤 다시 시도
 */
export type PermApplyErrorCode =
  | "PERM_CONFLICT"
  | "PERM_NEED_CONFIRM"
  | "PERM_NOT_IN_OBJ"
  | "PERM_EMPTY_BTN"
  | "PERM_NO_USER"
  | "PERM_DRAFT_BUSY"
  | "PERM_DRAFT_CORRUPT"
  | "PERM_FORBIDDEN"
  | "PERM_BAD_VALUE"
  | "PERM_BUSY"
  | "NOT_FOUND";

/** 아는 실패 코드 전부(api.ts 가 문구 앞 코드를 이 목록으로 읽는다). */
export const PERM_ERROR_CODES: readonly PermApplyErrorCode[] = [
  "PERM_CONFLICT",
  "PERM_NEED_CONFIRM",
  "PERM_NOT_IN_OBJ",
  "PERM_EMPTY_BTN",
  "PERM_NO_USER",
  "PERM_DRAFT_BUSY",
  "PERM_DRAFT_CORRUPT",
  "PERM_FORBIDDEN",
  "PERM_BAD_VALUE",
  "PERM_BUSY",
  "NOT_FOUND",
];

/** apply 실패. PERM_CONFLICT 면 scopes 에 충돌 범위(사람·그룹·역할 ID)가 온다. */
export class PermApplyError extends Error {
  readonly code: PermApplyErrorCode;
  readonly scopes: string[];

  constructor(code: PermApplyErrorCode, message: string, scopes: string[] = []) {
    super(message);
    this.name = "PermApplyError";
    this.code = code;
    this.scopes = scopes;
  }
}

// ── 이력 (2단계) ─────────────────────────────────────────────

export interface SearchHistoryParams {
  /** YYYY-MM-DD */
  fromDt?: string;
  toDt?: string;
  applyUserId?: string;
}

export interface HistoryRow {
  APPLY_ID: string;
  APPLY_USER_ID: string;
  /** ISO 시각. */
  APPLY_AT: string;
  CHANGE_CNT: number;
  GAIN_USER_CNT: number;
  LOSE_USER_CNT: number;
  APPLY_MEMO: string | null;
}

export interface SearchHistoryResult {
  his: HistoryRow[];
}

export interface HistoryDtlRow {
  SEQ_NO: number;
  TARGET_TP: PermChangeTp;
  KEY1: string;
  KEY2: string;
  OP_TP: PermChangeOp;
  BEFORE_VAL: string | null;
  AFTER_VAL: string | null;
}

export interface SearchHistoryDtlResult {
  dtl: HistoryDtlRow[];
}

// ── 화면이 쓰는 API 모양 ─────────────────────────────────────

/** api.ts(실연결)와 mock.ts(가짜 자료)가 함께 따르는 모양. 화면은 이 인터페이스만 안다. */
export interface PermBenchApi {
  searchBench(params: SearchBenchParams): Promise<SearchBenchResult>;
  searchMenuTree(params: SearchMenuTreeParams): Promise<SearchMenuTreeResult>;
  explain(params: ExplainParams): Promise<ExplainResult>;
  searchRolePerm(params: SearchRolePermParams): Promise<SearchRolePermResult>;
  loadDraft(): Promise<DraftResult>;
  saveDraft(request: SaveDraftRequest): Promise<DraftResult>;
  discardDraft(): Promise<void>;
  impact(): Promise<ImpactResult>;
  /** 실패 = PermApplyError. */
  apply(params: ApplyParams): Promise<ApplyResult>;
  searchHistory(params: SearchHistoryParams): Promise<SearchHistoryResult>;
  searchHistoryDtl(params: { applyId: string }): Promise<SearchHistoryDtlResult>;
}
