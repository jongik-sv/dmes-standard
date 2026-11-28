/**
 * commRoleMng 화면의 OASIS BFF 호출 래퍼(perm-bench f6 — 새 설계 계약은 types.ts 머리 주석).
 *
 * 호출 패턴: POST /api/mcm/oasis/commRoleMng/{action}
 *   - search            — 역할 목록(옛 조건 그대로) → ds_main(RoleRow = 옛 칸 + GROUP_CNT·USER_CNT·PERM_CNT)
 *   - save              — 역할 마스터 일괄 저장(grids.master, 옛 그대로)
 *   - searchRoleGroups  — 들어 있는 그룹·받은 사람 수
 *   - searchCmRoleMap   — 이 역할의 퍼미션(역할 × 오브젝트 한 건)
 *   - saveCmRoleMap     — 퍼미션 저장(params roleId + grids.perms, OP_TP MERGE|DEL — D36)
 *   - searchFolderObj   — 메뉴 폴더 오브젝트(「메뉴에서 오브젝트 추가」 후보)
 *   - lov               — 폴더 고르기(menus)
 *
 * 본 모듈 (mcm) 은 SqlSession 빈 미등록 — 무조건 OASIS (`/api/mcm/oasis/...`) 만 사용
 * (docs/guide/FrontEnd/standard-v2/frontend-standard/01-rules-decisions-files.md §2-2-1-A).
 */
import { createJsonApiClient } from "@/lib/http/json-api-client";
import { businessError } from "./role-perm";
import type {
  CommRoleMngFilters,
  CommRoleMngRow,
  FolderObjRow,
  RoleGroupRow,
  RoleMenuLov,
  RolePermRow,
  RolePermSaveRow,
  RoleRow,
} from "./types";

const api = createJsonApiClient();

const OASIS_BASE = "/api/mcm/oasis/commRoleMng";

interface SearchCmRolePayload {
  ds_main?: RoleRow[];
}

interface SaveCmRolePayload {
  cnt_merge?: number;
  /** 저장 뒤 역할 전부(BE 재조회, 조회 조건 없음) — 조건에 안 걸리는 새 역할을 목록에 남길 때 쓴다(z2fix2 e). */
  ds_main?: RoleRow[];
}

interface SearchRoleGroupsPayload {
  groups?: RoleGroupRow[];
  /** 그룹 겹침을 뺀 받은 사람 수. */
  USER_CNT?: number;
}

interface SearchCmRoleMapPayload {
  perms?: RolePermRow[];
}

interface SaveCmRoleMapPayload {
  cnt_merge?: number;
  cnt_delete?: number;
}

interface SearchFolderObjPayload {
  objs?: FolderObjRow[];
}

interface LovPayload {
  menus?: RoleMenuLov[];
}

/**
 * Cactus 표준 응답 envelope — CactusResponseConverter 가 Service Map&lt;String,Object&gt; 반환을 분리:
 *  - 단일 값 (cnt_merge 같은 Number/String) → data.{key}
 *  - List 값 (ds_main 같은) → grids.{key}.rows
 *
 * BPMN output="result" + Service Map 반환 패턴: cactus 가 data.result = Map 으로 적재.
 * Map 내부의 List 는 cactus 가 자동 분리 안 함 → FE 가 result 안의 key 들을 그대로 flat 전개.
 */
interface CactusEnvelope {
  meta?: { success?: boolean; message?: string; code?: string };
  /** 업무 오류 상세(cactus CactusResponse.errors) — code·message. */
  errors?: { code?: string; message?: string }[];
  data?: Record<string, unknown>;
  grids?: Record<string, { rows?: unknown[] }>;
}

function unwrapPayload<T>(res: unknown): T {
  const env = res as CactusEnvelope;
  // ★비즈니스 거부 판정 (2026-08-07) — OASIS 실행기는 GlobalExceptionHandler 를 우회해
  //   HTTP 200 + meta.success=false + meta.message 로 실패를 돌려준다. 이 판정이 없으면
  //   저장/조회 실패가 조용히 성공으로 처리돼 "버튼을 눌러도 아무 일이 없는" 증상이 된다.
  //   퍼미션 저장 거절(PERM_NOT_IN_OBJ · PERM_EMPTY_BTN)도 이 길로 온다. 코드는 meta.code 또는 errors[].code 에 오고
  //   문구가 그 코드로 시작하지 않으면 「CODE: 문구」 로 붙여 던진다(오류 객체 code 에도 싣는다).
  if (env?.meta && env.meta.success === false) {
    throw businessError(env.meta, env.errors);
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
      meta: { userId: "admin", menuId: "commRoleMng" },
      params,
      ...(grids ? { grids } : {}),
    },
  });
  return unwrapPayload<T>(res);
}

/** action=search — 역할 목록(+ 집계 칸 GROUP_CNT·USER_CNT·PERM_CNT). */
export async function searchCmRole(filters: CommRoleMngFilters): Promise<SearchCmRolePayload> {
  return callAction<SearchCmRolePayload>("search", {
    edtROLEID: filters.edt_ROLE_ID,
    edtROLENM: filters.edt_ROLE_NM,
    cboUSETP: filters.cbo_USE_TP,
  });
}

/**
 * action=save — 역할 마스터 일괄 저장 (CactusRequest 표준: grids.master.rows).
 * BE Service.saveCmRole(List&lt;Map&gt; master) parameter 이름 = grid key `master` 와 일치 (가이드 §6-E-3).
 */
export async function saveCmRole(rows: CommRoleMngRow[]): Promise<SaveCmRolePayload> {
  return callAction<SaveCmRolePayload>(
    "save",
    {},
    { master: { rows: rows as unknown as Record<string, unknown>[] } },
  );
}

/** action=searchRoleGroups — 이 역할이 들어 있는 그룹(읽기만)과 받은 사람 수. */
export async function searchRoleGroups(roleId: string): Promise<SearchRoleGroupsPayload> {
  return callAction<SearchRoleGroupsPayload>("searchRoleGroups", { roleId });
}

/** action=searchCmRoleMap — 이 역할의 퍼미션(한 줄 = ROLE_ID × OBJECT_ID). SYSADMIN 은 빈 목록(D13). */
export async function searchCmRoleMap(roleId: string): Promise<SearchCmRoleMapPayload> {
  return callAction<SearchCmRoleMapPayload>("searchCmRoleMap", { roleId });
}

/**
 * action=saveCmRoleMap — 퍼미션 저장. 바뀐 줄만 grids.perms.rows 로 보낸다(D36 — 목록 입력은 늘 grids).
 * 거절: PERM_NOT_IN_OBJ(오브젝트 밖 값) · PERM_EMPTY_BTN(버튼 빈 MERGE).
 */
export async function saveCmRoleMap(roleId: string, rows: RolePermSaveRow[]): Promise<SaveCmRoleMapPayload> {
  return callAction<SaveCmRoleMapPayload>(
    "saveCmRoleMap",
    { roleId },
    { perms: { rows: rows as unknown as Record<string, unknown>[] } },
  );
}

/** action=searchFolderObj — 메뉴 폴더(모듈이면 아래 폴더 포함) 오브젝트. HAS_PERM=Y = 이 역할에 이미 있음. */
export async function searchFolderObj(roleId: string, menuFolderId: string): Promise<SearchFolderObjPayload> {
  return callAction<SearchFolderObjPayload>("searchFolderObj", { roleId, menuFolderId });
}

/** action=lov — 폴더 고르기(menus). */
export async function loadLov(): Promise<LovPayload> {
  return callAction<LovPayload>("lov", {});
}

export type {
  SearchCmRolePayload,
  SaveCmRolePayload,
  SearchRoleGroupsPayload,
  SearchCmRoleMapPayload,
  SaveCmRoleMapPayload,
  SearchFolderObjPayload,
  LovPayload,
};
