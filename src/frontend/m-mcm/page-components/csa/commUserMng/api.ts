/**
 * commUserMng 화면의 OASIS BFF 호출 래퍼.
 *
 * 호출 패턴: POST /api/mcm/oasis/commUserMng/{action} (BPMN action 11 enum — As-Is 1:1 보존)
 *   - searchCmUser          — 메인 사용자 그리드 조회 (ds_main + ds_mainAll chain)
 *   - saveCmUser            — 메인 그리드 수정 (status="updated" 분기만)
 *   - regCmUser             — 계정 생성
 *   - deleteCmUser          — 계정 삭제 (논리삭제 END_ACTIVE_DATE)
 *   - reRegCmUser           — 계정 재생성 (단건)
 *   - searchUserRoleGrp     — 선택 사용자 보유 역할그룹 (ds_userRolegrp)
 *   - saveUserRoleGrp       — 역할그룹 추가/삭제 (이력 동시 기록)
 *   - searchRoleGrp         — 추가 가능 역할그룹 (ds_rolegrpList)
 *   - pwdinit               — 비밀번호 / SSO 비밀번호 초기화
 *   - saveUserRoleGrpCopy   — 역할그룹 복사
 *   - commonUserDept        — 부서 팝업 조회 (To-Be TB_MCM_DEPT_INFO)
 *
 * 분석리포트 §6 (SQL ID 20) / §8 (BPMN 11 action) / BPMN설계서 인용.
 *
 * 본 모듈 (mcm) 은 SqlSession 빈 미등록 — Phase 7 라우트 사용 금지.
 * 무조건 OASIS (`/api/mcm/oasis/...`) 만 사용 (docs/guide/FrontEnd/standard-v2/frontend-standard/01-rules-decisions-files.md §2-2-1-A).
 * W1·W2·W3·W4 정본 패턴 동일.
 */
import { createJsonApiClient } from "@/lib/http/json-api-client";
import type {
  CommUserMngAllRow,
  CommUserMngDeptRow,
  CommUserMngFilters,
  CommUserMngRoleGrpListRow,
  CommUserMngRoleGrpRow,
  CommUserMngRow,
  DeptLovRow,
} from "./types";

const api = createJsonApiClient();

const OASIS_BASE = "/api/mcm/oasis/commUserMng";

interface SearchCmUserPayload {
  ds_main?: CommUserMngRow[];
  ds_mainAll?: CommUserMngAllRow[];
}

interface SaveCountPayload {
  cnt_save?: number;
}

interface SearchUserRoleGrpPayload {
  ds_userRolegrp?: CommUserMngRoleGrpRow[];
}

interface SearchRoleGrpPayload {
  ds_rolegrpList?: CommUserMngRoleGrpListRow[];
}

interface CommonUserDeptPayload {
  ds_userDept?: CommUserMngDeptRow[];
}

interface SearchDeptLovPayload {
  ds_deptLov?: DeptLovRow[];
}

/**
 * Cactus 표준 응답 envelope (W1·W2·W3·W4 정본 패턴):
 *  - data.{key} = scalar
 *  - grids.{key}.rows = list
 *  - data.result = Map (BPMN output="result") — 내부 key flat 전개
 */
interface CactusEnvelope {
  meta?: { success?: boolean; message?: string };
  data?: Record<string, unknown>;
  grids?: Record<string, { rows?: unknown[] }>;
}

function unwrapPayload<T>(res: unknown): T {
  const env = res as CactusEnvelope;
  // ★비즈니스 거부 판정 (2026-08-07) — OASIS 실행기는 GlobalExceptionHandler 를 우회해
  //   HTTP 200 + meta.success=false + meta.message 로 실패를 돌려준다. 이 판정이 없으면
  //   저장/조회 실패가 조용히 성공으로 처리돼 "버튼을 눌러도 아무 일이 없는" 증상이 된다
  //   (commMenuMng 저장 미동작의 실제 정체 — BE CoercionException 이 여기서 삼켜지고 있었다).
  if (env?.meta && env.meta.success === false) {
    throw new Error(env.meta.message?.trim() || "요청이 거부되었습니다.");
  }
  const out: Record<string, unknown> = {};
  if (env?.data) {
    Object.assign(out, env.data);
    const inner = env.data["result"];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      Object.assign(out, inner as Record<string, unknown>);
    }
  }
  if (env?.grids) {
    for (const [key, val] of Object.entries(env.grids)) {
      out[key] = val?.rows ?? [];
    }
  }
  return out as T;
}

async function callAction<T>(
  action: string,
  params: Record<string, unknown>,
  grids?: Record<string, { rows: Record<string, unknown>[] }>,
): Promise<T> {
  const res = await api.request<unknown>(`${OASIS_BASE}/${action}`, {
    method: "POST",
    body: {
      meta: { userId: "admin", menuId: "commUserMng" },
      params,
      ...(grids ? { grids } : {}),
    },
  });
  return unwrapPayload<T>(res);
}

/** action=searchCmUser — 메인 사용자 + 전체 USER_ID/EMP_NO 동시. */
export async function searchCmUser(filters: CommUserMngFilters): Promise<SearchCmUserPayload> {
  return callAction<SearchCmUserPayload>("search", {
    edtUSERID: filters.edt_USER_ID,
    cboUSETP: filters.cbo_USE_TP,
    cboINOUTEMPTP: filters.cbo_IN_OUT_EMP_TP,
  });
}

/** action=saveCmUser — 메인 그리드 수정 (status="updated" 분기만 / 정책 #3 (B)). */
export async function saveCmUser(rows: CommUserMngRow[]): Promise<SaveCountPayload> {
  return callAction<SaveCountPayload>(
    "save",
    {},
    { master: { rows: rows as unknown as Record<string, unknown>[] } },
  );
}

/** action=regCmUser — 계정 생성 (status="inserted" 분기). */
export async function regCmUser(rows: CommUserMngRow[]): Promise<SaveCountPayload> {
  return callAction<SaveCountPayload>(
    "regCmUser",
    {},
    { master: { rows: rows as unknown as Record<string, unknown>[] } },
  );
}

/** action=deleteCmUser — 계정 논리삭제 (END_ACTIVE_DATE 마감 / status="deleted"). */
export async function deleteCmUser(rows: CommUserMngRow[]): Promise<SaveCountPayload> {
  return callAction<SaveCountPayload>(
    "deleteCmUser",
    {},
    { master: { rows: rows as unknown as Record<string, unknown>[] } },
  );
}

/** action=reRegCmUser — 계정 재생성 (단건 ds_main.get(0)). */
export async function reRegCmUser(rows: CommUserMngRow[]): Promise<SaveCountPayload> {
  return callAction<SaveCountPayload>(
    "reRegCmUser",
    {},
    { master: { rows: rows as unknown as Record<string, unknown>[] } },
  );
}

/** action=searchUserRoleGrp — 선택 사용자 보유 역할그룹 (ds_userRolegrp). */
export async function searchUserRoleGrp(userId: string): Promise<SearchUserRoleGrpPayload> {
  return callAction<SearchUserRoleGrpPayload>("searchUserRoleGrp", { USER_ID: userId });
}

/** action=saveUserRoleGrp — 역할그룹 추가/삭제 + ROLL_HIS 이력. */
export async function saveUserRoleGrp(rows: CommUserMngRoleGrpRow[]): Promise<SaveCountPayload> {
  return callAction<SaveCountPayload>(
    "saveUserRoleGrp",
    {},
    { master: { rows: rows as unknown as Record<string, unknown>[] } },
  );
}

/** action=searchRoleGrp — 추가 가능 역할그룹 (NOT EXISTS / ds_rolegrpList). */
export async function searchRoleGrp(userId: string): Promise<SearchRoleGrpPayload> {
  return callAction<SearchRoleGrpPayload>("searchRoleGrp", { USER_ID: userId });
}

/** action=pwdinit — 비밀번호 / SSO 비밀번호 초기화. */
export async function pwdinit(
  userId: string,
  userEmpNo: string,
  ssoResetFlag: "Y" | "N",
  ssoMaster?: CommUserMngRow[],
): Promise<SaveCountPayload> {
  return callAction<SaveCountPayload>(
    "pwdinit",
    {
      USER_ID: userId,
      USER_EMP_NO: userEmpNo,
      SSO_RESET_FLAG: ssoResetFlag,
    },
    ssoMaster && ssoMaster.length > 0
      ? { master: { rows: ssoMaster as unknown as Record<string, unknown>[] } }
      : undefined,
  );
}

/** action=saveUserRoleGrpCopy — 역할그룹 복사 (USER_ID_COPY → USER_ID, 비보유분만). */
export async function saveUserRoleGrpCopy(
  userId: string,
  userIdCopy: string,
  infReqNo?: string | null,
  description?: string | null,
): Promise<SaveCountPayload> {
  return callAction<SaveCountPayload>("saveUserRoleGrpCopy", {
    USER_ID: userId,
    USER_ID_COPY: userIdCopy,
    INF_REQ_NO: infReqNo ?? "",
    DESCRIPTION: description ?? "",
  });
}

/** action=commonUserDept — 부서 팝업 조회 (To-Be TB_MCM_DEPT_INFO). */
export async function commonUserDept(deptKey: string): Promise<CommonUserDeptPayload> {
  return callAction<CommonUserDeptPayload>("commonUserDept", { edt_DEPT_CD: deptKey });
}

/**
 * action=searchDeptLov — Detail 부서 LoV 모달 조회 (2026-06-04 신설 / 사용자 결정).
 *
 * Detail 영역 부서코드 직접 타이핑 ✗ → 검색 버튼 + LoV 모달 (DEPT_CD/DEPT_NM)
 * → 선택 시 DEPT_CD + DEPT_NM 자동 세트. keyword 빈 값 = 전체 USE_TP='Y' 부서.
 */
export async function searchDeptLov(keyword: string): Promise<SearchDeptLovPayload> {
  return callAction<SearchDeptLovPayload>("searchDeptLov", { keyword });
}

export type {
  SearchCmUserPayload,
  SaveCountPayload,
  SearchUserRoleGrpPayload,
  SearchRoleGrpPayload,
  CommonUserDeptPayload,
  SearchDeptLovPayload,
};
