/**
 * 역할 관리(개선 시안) 표본 데이터. 백엔드를 부르지 않는다.
 *
 * 현행 권한 구조(mcm-core):
 *   사용자 ─(SEC_USER_MAPPING)→ 역할 그룹 ─(SEC_ROLEGROUP_MAPPING)→ 역할
 *   역할 ─(SEC_ROLE_MAPPING: ROLE × OBJECT × PERMISSION)→ 화면별 권한 묶음
 *   권한 묶음(SEC_PERM) = 버튼 동작 토큰 모음(PERMISSION_COMMON·CUSTOM·POPUP_BTN·ACTION)
 * 시안은 권한 묶음을 「권한 수준」 으로, OBJECT 를 「화면」 으로 바꿔 보인다.
 * 사람 이름·부서는 가상 값이다.
 */

/** 권한 수준 = 현행 권한 묶음(PERMISSION_ID) 한 개. 화면에서는 이름과 할 수 있는 일만 보인다. */
export interface PermLevel {
  id: string;
  label: string;
  /** 이 수준으로 누를 수 있는 버튼(사람이 읽는 이름). */
  actions: string[];
  /** 낮은 수준 → 높은 수준 순서. 사용자 합산 권한에서 높은 쪽을 고른다. 업무 전용 묶음은 99. */
  rank: number;
  /** 이 묶음을 줄 수 있는 화면. 없으면 모든 화면. */
  onlyScreens?: string[];
}

/** 「없음」. select 편집기가 빈 문자열을 다루지 않게 값을 둔다(저장 때는 매핑 행을 지운다). */
export const NONE = "NONE";

export const PERM_LEVELS: PermLevel[] = [
  { id: NONE, label: "없음", actions: [], rank: 0 },
  { id: "PERM_READ", label: "조회", actions: ["조회", "엑셀"], rank: 1 },
  {
    id: "PERM_EDIT",
    label: "편집",
    actions: ["조회", "엑셀", "등록", "저장", "삭제", "복사"],
    rank: 2,
  },
  {
    id: "PERM_CONFIRM",
    label: "편집·확정",
    actions: ["조회", "엑셀", "등록", "저장", "삭제", "복사", "확정", "확정 취소"],
    rank: 3,
  },
  { id: "PERM_ALL", label: "전체", actions: ["모든 버튼"], rank: 4 },
  {
    id: "PERM_USRQ_USE",
    label: "레포트 실행",
    actions: ["목록", "실행"],
    rank: 99,
    onlyScreens: ["userQuery"],
  },
];

export const PERM_LEVEL_BY_ID = new Map(PERM_LEVELS.map((l) => [l.id, l]));

export interface MenuGroup {
  id: string;
  label: string;
}

export const MENU_GROUPS: MenuGroup[] = [
  { id: "csa", label: "공통관리 > 시스템관리" },
  { id: "lsh", label: "공통관리 > 게시판" },
  { id: "cmq", label: "공통관리 > 레포트" },
  { id: "dma", label: "기준정보 > 데이터 사전" },
  { id: "dmc", label: "기준정보 > 코드" },
  { id: "aps", label: "생산계획 > 계획" },
  { id: "qcd", label: "품질 > 검사" },
  { id: "m30", label: "물류 > 부재료" },
];

export interface ScreenItem {
  id: string;
  name: string;
  group: string;
}

export const SCREENS: ScreenItem[] = [
  { id: "commUserMng", name: "사용자 관리", group: "csa" },
  { id: "commRoleMng", name: "역할 관리", group: "csa" },
  { id: "commRoleGrpMng", name: "역할 그룹 관리", group: "csa" },
  { id: "commPermMng", name: "권한 관리", group: "csa" },
  { id: "commObjMng", name: "OBJECT 관리", group: "csa" },
  { id: "commMenuMng", name: "메뉴 관리", group: "csa" },
  { id: "jobSchedMng", name: "예약 작업 관리", group: "csa" },
  { id: "noticeMgmt", name: "공지사항 관리", group: "lsh" },
  { id: "userQuery", name: "맞춤 레포트", group: "cmq" },
  { id: "userQueryMng", name: "맞춤 레포트 관리", group: "cmq" },
  { id: "termMng", name: "용어 관리", group: "dma" },
  { id: "domainMng", name: "도메인 관리", group: "dma" },
  { id: "columnMng", name: "컬럼 관리", group: "dma" },
  { id: "codeMng", name: "코드 관리", group: "dmc" },
  { id: "codeConfirm", name: "코드 확정", group: "dmc" },
  { id: "scheduleGantt", name: "스케줄 현황", group: "aps" },
  { id: "workOrderGantt", name: "작업지시 현황", group: "aps" },
  { id: "planHistory", name: "계획 이력 조회", group: "aps" },
  { id: "incomingInspection", name: "수입검사대상조회", group: "qcd" },
  { id: "abnrProcReview", name: "부적합가공검토", group: "qcd" },
  { id: "dispatchInquiry", name: "배차정보 조회", group: "m30" },
  { id: "consumptionResult", name: "소모실적조회", group: "m30" },
  { id: "stockByGroup", name: "재고현황(그룹별)조회", group: "m30" },
];

export const SCREEN_BY_ID = new Map(SCREENS.map((s) => [s.id, s]));
export const MENU_GROUP_BY_ID = new Map(MENU_GROUPS.map((g) => [g.id, g]));

export interface RoleRecord {
  roleId: string;
  name: string;
  description: string;
  useYn: "Y" | "N";
  startDate: string;
  endDate: string;
}

export const ROLES: RoleRecord[] = [
  {
    roleId: "SYSADMIN",
    name: "시스템 관리자",
    description: "모든 화면의 모든 버튼을 쓴다. 새 화면을 등록하면 자동으로 받는다.",
    useYn: "Y",
    startDate: "2026-06-01",
    endDate: "9999-12-31",
  },
  {
    roleId: "ROLE_MDM_EDITOR",
    name: "기준정보 편집자",
    description: "용어·도메인·컬럼·코드를 고친다. 확정은 하지 않는다.",
    useYn: "Y",
    startDate: "2026-07-01",
    endDate: "9999-12-31",
  },
  {
    roleId: "ROLE_MDM_OWNER",
    name: "기준정보 확정자",
    description: "기준정보를 고치고 확정한다.",
    useYn: "Y",
    startDate: "2026-07-01",
    endDate: "9999-12-31",
  },
  {
    roleId: "ROLE_QC_INSPECTOR",
    name: "품질 검사원",
    description: "수입검사와 부적합 가공 검토를 처리한다.",
    useYn: "Y",
    startDate: "2026-08-01",
    endDate: "9999-12-31",
  },
  {
    roleId: "ROLE_APS_PLANNER",
    name: "생산계획 담당",
    description: "스케줄과 작업지시를 짜고 확정한다.",
    useYn: "Y",
    startDate: "2026-08-01",
    endDate: "9999-12-31",
  },
  {
    roleId: "ROLE_LOGI_STAFF",
    name: "부재료 물류 담당",
    description: "배차·소모 실적을 입력하고 재고를 본다.",
    useYn: "Y",
    startDate: "2026-09-01",
    endDate: "9999-12-31",
  },
  {
    roleId: "ROLE_VIEWER",
    name: "현장 조회 전용",
    description: "공지와 현황 화면을 조회만 한다.",
    useYn: "Y",
    startDate: "2026-06-01",
    endDate: "9999-12-31",
  },
  {
    roleId: "ROLE_OLD_REPORT",
    name: "구 레포트 사용자",
    description: "옛 레포트 화면용. 맞춤 레포트로 옮긴 뒤 쓰지 않는다.",
    useYn: "N",
    startDate: "2026-06-01",
    endDate: "2026-10-31",
  },
];

/** 역할별 화면 권한(저장된 값). 화면 ID → 권한 수준 ID. 없는 화면은 「없음」. */
export type GrantMap = Record<string, Record<string, string>>;

const all = (level: string) => Object.fromEntries(SCREENS.map((s) => [s.id, level]));

export const INITIAL_GRANTS: GrantMap = {
  SYSADMIN: all("PERM_ALL"),
  ROLE_MDM_EDITOR: {
    termMng: "PERM_EDIT",
    domainMng: "PERM_EDIT",
    columnMng: "PERM_EDIT",
    codeMng: "PERM_EDIT",
    codeConfirm: "PERM_READ",
    noticeMgmt: "PERM_READ",
  },
  ROLE_MDM_OWNER: {
    termMng: "PERM_CONFIRM",
    domainMng: "PERM_CONFIRM",
    columnMng: "PERM_CONFIRM",
    codeMng: "PERM_CONFIRM",
    codeConfirm: "PERM_CONFIRM",
    noticeMgmt: "PERM_READ",
    userQuery: "PERM_USRQ_USE",
  },
  ROLE_QC_INSPECTOR: {
    incomingInspection: "PERM_EDIT",
    abnrProcReview: "PERM_CONFIRM",
    noticeMgmt: "PERM_READ",
    userQuery: "PERM_USRQ_USE",
  },
  ROLE_APS_PLANNER: {
    scheduleGantt: "PERM_CONFIRM",
    workOrderGantt: "PERM_CONFIRM",
    planHistory: "PERM_READ",
    stockByGroup: "PERM_READ",
    noticeMgmt: "PERM_READ",
    userQuery: "PERM_USRQ_USE",
  },
  ROLE_LOGI_STAFF: {
    dispatchInquiry: "PERM_EDIT",
    consumptionResult: "PERM_EDIT",
    stockByGroup: "PERM_READ",
    noticeMgmt: "PERM_READ",
  },
  ROLE_VIEWER: {
    noticeMgmt: "PERM_READ",
    scheduleGantt: "PERM_READ",
    workOrderGantt: "PERM_READ",
    stockByGroup: "PERM_READ",
    incomingInspection: "PERM_READ",
  },
  ROLE_OLD_REPORT: {
    planHistory: "PERM_READ",
  },
};

export interface RoleGroup {
  id: string;
  name: string;
  roleIds: string[];
}

export const ROLE_GROUPS: RoleGroup[] = [
  { id: "RG_ADMIN", name: "관리자 그룹", roleIds: ["SYSADMIN"] },
  { id: "RG_MDM_TEAM", name: "기준정보팀", roleIds: ["ROLE_MDM_OWNER", "ROLE_VIEWER"] },
  { id: "RG_MDM_PARTNER", name: "기준정보 협력사", roleIds: ["ROLE_MDM_EDITOR"] },
  { id: "RG_QC_TEAM", name: "품질팀", roleIds: ["ROLE_QC_INSPECTOR", "ROLE_VIEWER"] },
  { id: "RG_PLAN_TEAM", name: "생산관리팀", roleIds: ["ROLE_APS_PLANNER", "ROLE_VIEWER"] },
  { id: "RG_LOGI_TEAM", name: "물류팀", roleIds: ["ROLE_LOGI_STAFF", "ROLE_VIEWER"] },
  { id: "RG_FIELD", name: "현장 공용", roleIds: ["ROLE_VIEWER"] },
  { id: "RG_LEGACY", name: "구 레포트 그룹", roleIds: ["ROLE_OLD_REPORT"] },
];

export interface UserRecord {
  userId: string;
  name: string;
  dept: string;
  groupIds: string[];
}

export const USERS: UserRecord[] = [
  { userId: "u1001", name: "김하늘", dept: "정보기술팀", groupIds: ["RG_ADMIN"] },
  { userId: "u1002", name: "이도윤", dept: "정보기술팀", groupIds: ["RG_ADMIN", "RG_MDM_TEAM"] },
  { userId: "u2001", name: "박서준", dept: "기준정보팀", groupIds: ["RG_MDM_TEAM"] },
  { userId: "u2002", name: "최유나", dept: "기준정보팀", groupIds: ["RG_MDM_TEAM"] },
  { userId: "u2101", name: "정민호", dept: "협력사 A", groupIds: ["RG_MDM_PARTNER"] },
  { userId: "u2102", name: "한지우", dept: "협력사 A", groupIds: ["RG_MDM_PARTNER"] },
  { userId: "u3001", name: "오세린", dept: "품질보증팀", groupIds: ["RG_QC_TEAM"] },
  { userId: "u3002", name: "윤태경", dept: "품질보증팀", groupIds: ["RG_QC_TEAM"] },
  { userId: "u3003", name: "장예린", dept: "품질보증팀", groupIds: ["RG_QC_TEAM", "RG_LEGACY"] },
  { userId: "u4001", name: "임재원", dept: "생산관리팀", groupIds: ["RG_PLAN_TEAM"] },
  { userId: "u4002", name: "강수아", dept: "생산관리팀", groupIds: ["RG_PLAN_TEAM", "RG_LEGACY"] },
  { userId: "u5001", name: "조현우", dept: "물류팀", groupIds: ["RG_LOGI_TEAM"] },
  { userId: "u5002", name: "신다은", dept: "물류팀", groupIds: ["RG_LOGI_TEAM"] },
  { userId: "u6001", name: "배준서", dept: "냉연생산팀", groupIds: ["RG_FIELD"] },
  { userId: "u6002", name: "홍채원", dept: "도금생산팀", groupIds: ["RG_FIELD"] },
  { userId: "u6003", name: "문지호", dept: "도금생산팀", groupIds: ["RG_FIELD", "RG_LOGI_TEAM"] },
];
