/**
 * commRoleMng 화면의 OASIS BFF 호출 래퍼.
 *
 * 호출 패턴: POST /api/mcm/oasis/commRoleMng/{action} (BPMN action 6 enum — To-Be 정책 #1 적용)
 *   - searchCmRole     — 역할 마스터 그리드 조회 (ds_main)
 *   - saveCmRole       — 역할 마스터 일괄 저장 (status 분기) + 후속 재조회
 *   - searchCmRoleMap  — 선택 역할의 현재 권한 조회 (ds_roleMap, 3-table JOIN)
 *   - saveCmRoleMap    — 현재 권한 일괄 저장 (INSERT/DELETE — UPDATE ✗ / Q-011 closed) + 후속 재조회
 *   - searchCmPerm     — 전체 권한 후보 조회 (ds_perm, NOT EXISTS — 미할당 권한 풀)
 *   - lov              — MENU_ID 1 dataset (ds_lovMenuId — To-Be 정책 #1)
 *
 * 분석리포트 §6 (SQL ID) / §8 (BPMN) / BPMN설계서 §1.1 + §2 인용.
 *
 * 본 모듈 (mcm) 은 SqlSession 빈 미등록 — Phase 7 라우트 사용 금지.
 * 무조건 OASIS (`/api/mcm/oasis/...`) 만 사용 (docs/guide/FrontEnd/standard-v2/frontend-standard/01-rules-decisions-files.md §2-2-1-A).
 * W1·W2 정본 패턴 동일.
 */
import { createJsonApiClient } from "@/lib/http/json-api-client";
import type {
  CommRoleMngFilters,
  CommRoleMngPermRow,
  CommRoleMngRoleMapRow,
  CommRoleMngRow,
  MenuIdLov,
  ObjectLovRow,
} from "./types";

const api = createJsonApiClient();

const OASIS_BASE = "/api/mcm/oasis/commRoleMng";

interface SearchCmRolePayload {
  ds_main?: CommRoleMngRow[];
}

interface SaveCmRolePayload {
  cnt_merge?: number;
  ds_main?: CommRoleMngRow[];
}

interface SearchCmRoleMapPayload {
  ds_roleMap?: CommRoleMngRoleMapRow[];
}

interface SaveCmRoleMapPayload {
  cnt_merge?: number;
  ds_roleMap?: CommRoleMngRoleMapRow[];
}

interface SearchCmPermPayload {
  ds_perm?: CommRoleMngPermRow[];
}

interface LovPayload {
  ds_lovMenuId?: MenuIdLov[];
}

interface SearchObjectLovPayload {
  ds_menuObjLst?: ObjectLovRow[];
}

/**
 * Cactus 표준 응답 envelope — CactusResponseConverter 가 Service Map&lt;String,Object&gt; 반환을 분리:
 *  - 단일 값 (cnt_merge 같은 Number/String) → data.{key}
 *  - List 값 (ds_main 같은) → grids.{key}.rows
 *
 * BPMN output="result" + Service Map 반환 패턴: cactus 가 data.result = Map 으로 적재.
 * Map 내부의 List 는 cactus 가 자동 분리 안 함 → FE 가 result 안의 key 들을 그대로 flat 전개
 * (W1·W2 정본 패턴 그대로).
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
      meta: { userId: "admin", menuId: "commRoleMng" },
      params,
      ...(grids ? { grids } : {}),
    },
  });
  return unwrapPayload<T>(res);
}

/**
 * action=searchCmRole — 역할 마스터 그리드 조회.
 * BE: searchCmRoleTask → CommRoleMngService.searchCmRole(CommRoleMngSearchRequest) → ds_main.
 */
export async function searchCmRole(filters: CommRoleMngFilters): Promise<SearchCmRolePayload> {
  return callAction<SearchCmRolePayload>("search", {
    edtROLEID: filters.edt_ROLE_ID,
    edtROLENM: filters.edt_ROLE_NM,
    cboUSETP: filters.cbo_USE_TP,
  });
}

/**
 * action=saveCmRole — 역할 마스터 일괄 저장 (CactusRequest 표준: grids.master.rows).
 * BE Service.saveCmRole(List&lt;Map&gt; master) parameter 이름 = grid key `master` 와 일치 (가이드 §6-E-3).
 * 응답: cnt_merge + ds_main (재조회 결과 — As-Is fn_callBack saveCmRole 의 fn_search 자동 재호출 정합).
 */
export async function saveCmRole(rows: CommRoleMngRow[]): Promise<SaveCmRolePayload> {
  return callAction<SaveCmRolePayload>(
    "save",
    {},
    { master: { rows: rows as unknown as Record<string, unknown>[] } },
  );
}

/**
 * action=searchCmRoleMap — 선택 역할의 현재 권한 조회 (3-table JOIN).
 * BE: searchCmRoleMapTask → CommRoleMngService.searchCmRoleMap(CommRoleMngSearchRoleMapRequest) → ds_roleMap.
 */
export async function searchCmRoleMap(roleId: string): Promise<SearchCmRoleMapPayload> {
  return callAction<SearchCmRoleMapPayload>("searchCmRoleMap", {
    ROLE_ID: roleId,
  });
}

/**
 * action=saveCmRoleMap — 현재 권한 일괄 저장 (INSERT/DELETE 분기 — UPDATE ✗).
 * BE Service.saveCmRoleMap(List&lt;Map&gt; master) — grids.master.rows.
 * 응답: cnt_merge + ds_roleMap (재조회 결과). ds_perm 은 FE 가 별도 searchCmPerm 호출 (As-Is 패턴).
 */
export async function saveCmRoleMap(rows: CommRoleMngRoleMapRow[]): Promise<SaveCmRoleMapPayload> {
  return callAction<SaveCmRoleMapPayload>(
    "saveCmRoleMap",
    {},
    { master: { rows: rows as unknown as Record<string, unknown>[] } },
  );
}

/**
 * action=searchCmPerm — 전체 권한 후보 조회 (선택 ROLE_ID 미할당 권한 풀).
 * BE: searchCmPermTask → CommRoleMngService.searchCmPerm(CommRoleMngSearchPermRequest) → ds_perm.
 */
export async function searchCmPerm(roleId: string): Promise<SearchCmPermPayload> {
  return callAction<SearchCmPermPayload>("searchCmPerm", {
    ROLE_ID: roleId,
  });
}

/**
 * action=lov — MENU_ID 1 dataset (As-Is fn_lov 의 To-Be 단순화 — APP_HOST_ID 폐기).
 * BE: lovTask → CommRoleMngService.lov() → ds_lovMenuId.
 */
export async function loadLov(): Promise<LovPayload> {
  return callAction<LovPayload>("lov", {});
}

/**
 * action=searchObjectLov — sub2 OBJECT-LoV (round-2 fix / Q-016 closed).
 * As-Is xfdl:321~336 commonDynamic_onload "csa::CommMenuMng/commonList" 의 본 화면 namespace 내재화.
 * BE: searchObjectLovTask → CommRoleMngService.searchObjectLov(CommRoleMngSearchObjectLovRequest) → ds_menuObjLst.
 *
 * 검색 조건명 {@code edtOBJECTID} = As-Is xfdl 인자의 {@code "edt_OBJECT_ID"} camelCase 변환.
 */
export async function searchObjectLov(keyword: string): Promise<SearchObjectLovPayload> {
  return callAction<SearchObjectLovPayload>("searchObjectLov", {
    edtOBJECTID: keyword,
  });
}

export type {
  SearchCmRolePayload,
  SaveCmRolePayload,
  SearchCmRoleMapPayload,
  SaveCmRoleMapPayload,
  SearchCmPermPayload,
  LovPayload,
  SearchObjectLovPayload,
};
