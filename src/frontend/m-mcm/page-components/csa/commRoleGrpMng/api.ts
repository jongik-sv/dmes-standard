/**
 * commRoleGrpMng 화면의 OASIS BFF 호출 래퍼.
 *
 * 호출 패턴: POST /api/mcm/oasis/commRoleGrpMng/{action} (BPMN action 6 enum — To-Be 정책 #1 적용)
 *   - searchCmRoleGrp     — 역할 그룹 메인 그리드 조회 (ds_main + USER_ID scalar subquery)
 *   - saveCmRoleGrp       — 역할 그룹 일괄 저장 (status 분기) + 후속 재조회
 *   - searchCmRoleGrpMap  — 선택 역할 그룹의 매핑 역할 조회 (ds_roleGrpMap, 2-table JOIN + PARENT_ROLE_ID)
 *   - saveCmRoleGrpMap    — 매핑 일괄 저장 (INSERT/DELETE — UPDATE ✗ / 더미 DUAL 폐기) + 후속 재조회
 *   - searchCmRole        — 미매핑 전체 역할 조회 (ds_role, NOT EXISTS — 후보 풀 + PARENT_ROLE_ID)
 *   - searchCmRoleGrpMenu — 매핑 역할이 보유한 메뉴 트리 조회 (ds_menuTreeList — Oracle CTE → MSSQL WITH RECURSIVE)
 *
 * 분석리포트 §6 (SQL ID) / §8 (BPMN) / BPMN설계서 §1.1 + §2 인용.
 *
 * 본 모듈 (mcm) 은 SqlSession 빈 미등록 — Phase 7 라우트 사용 금지.
 * 무조건 OASIS (`/api/mcm/oasis/...`) 만 사용 (docs/guide/FrontEnd/standard-v2/frontend-standard/01-rules-decisions-files.md §2-2-1-A).
 * W1·W2·W3 정본 패턴 동일.
 */
import { createJsonApiClient } from "@/lib/http/json-api-client";
import type {
  CommRoleGrpMngFilters,
  CommRoleGrpMngMenuTreeRow,
  CommRoleGrpMngRoleMapRow,
  CommRoleGrpMngRoleRow,
  CommRoleGrpMngRow,
} from "./types";

const api = createJsonApiClient();

const OASIS_BASE = "/api/mcm/oasis/commRoleGrpMng";

interface SearchCmRoleGrpPayload {
  ds_main?: CommRoleGrpMngRow[];
}

interface SaveCmRoleGrpPayload {
  cnt_merge?: number;
  ds_main?: CommRoleGrpMngRow[];
}

interface SearchCmRoleGrpMapPayload {
  ds_roleGrpMap?: CommRoleGrpMngRoleMapRow[];
}

interface SaveCmRoleGrpMapPayload {
  cnt_merge?: number;
  /** 서버가 조용히 건너뛴 행 수 (중복 PK / PK 누락 / 미지원 status). 0 이 아니면 화면에 사유를 알린다. */
  cnt_skip?: number;
  ds_roleGrpMap?: CommRoleGrpMngRoleMapRow[];
}

interface SearchCmRolePayload {
  ds_role?: CommRoleGrpMngRoleRow[];
}

interface SearchCmRoleGrpMenuPayload {
  ds_menuTreeList?: CommRoleGrpMngMenuTreeRow[];
}

/**
 * Cactus 표준 응답 envelope — CactusResponseConverter 가 Service Map&lt;String,Object&gt; 반환을 분리:
 *  - 단일 값 (cnt_merge 같은 Number/String) → data.{key}
 *  - List 값 (ds_main 같은) → grids.{key}.rows
 *
 * BPMN output="result" + Service Map 반환 패턴: cactus 가 data.result = Map 으로 적재.
 * Map 내부의 List 는 cactus 가 자동 분리 안 함 → FE 가 result 안의 key 들을 그대로 flat 전개
 * (W1·W2·W3 정본 패턴 그대로).
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
      meta: { userId: "admin", menuId: "commRoleGrpMng" },
      params,
      ...(grids ? { grids } : {}),
    },
  });
  return unwrapPayload<T>(res);
}

/**
 * action=searchCmRoleGrp — 역할 그룹 메인 그리드 조회.
 * BE: searchCmRoleGrpTask → CommRoleGrpMngService.searchCmRoleGrp(CommRoleGrpMngSearchRequest) → ds_main.
 */
export async function searchCmRoleGrp(filters: CommRoleGrpMngFilters): Promise<SearchCmRoleGrpPayload> {
  return callAction<SearchCmRoleGrpPayload>("search", {
    edtROLEGROUPID: filters.edt_ROLE_GROUP_ID,
    edtROLEGROUPNM: filters.edt_ROLE_GROUP_NM,
    cboUSETP: filters.cbo_USE_TP,
  });
}

/**
 * action=saveCmRoleGrp — 역할 그룹 일괄 저장 (CactusRequest 표준: grids.master.rows).
 * BE Service.saveCmRoleGrp(List&lt;Map&gt; master) parameter 이름 = grid key `master` 와 일치 (가이드 §6-E-3).
 * 응답: cnt_merge + ds_main (재조회 결과 — As-Is fn_callBack saveCmRoleGrp 의 fn_search 자동 재호출 정합, xfdl:552).
 */
export async function saveCmRoleGrp(rows: CommRoleGrpMngRow[]): Promise<SaveCmRoleGrpPayload> {
  return callAction<SaveCmRoleGrpPayload>(
    "save",
    {},
    { master: { rows: rows as unknown as Record<string, unknown>[] } },
  );
}

/**
 * action=searchCmRoleGrpMap — 선택 역할 그룹의 매핑 역할 조회 (2-table JOIN + PARENT_ROLE_ID).
 * BE: searchCmRoleGrpMapTask → CommRoleGrpMngService.searchCmRoleGrpMap(CommRoleGrpMngSearchMapRequest) → ds_roleGrpMap.
 */
export async function searchCmRoleGrpMap(roleGroupId: string): Promise<SearchCmRoleGrpMapPayload> {
  return callAction<SearchCmRoleGrpMapPayload>("searchCmRoleGrpMap", {
    ROLE_GROUP_ID: roleGroupId,
  });
}

/**
 * action=saveCmRoleGrpMap — 매핑 일괄 저장 (INSERT/DELETE 분기 — UPDATE ✗).
 * BE Service.saveCmRoleGrpMap(List&lt;Map&gt; master) — grids.master.rows.
 * 응답: cnt_merge + ds_roleGrpMap (재조회 결과). ds_role / ds_menuTreeList 는 FE 가 별도 호출 (As-Is 패턴).
 */
export async function saveCmRoleGrpMap(rows: CommRoleGrpMngRoleMapRow[]): Promise<SaveCmRoleGrpMapPayload> {
  return callAction<SaveCmRoleGrpMapPayload>(
    "saveCmRoleGrpMap",
    {},
    { master: { rows: rows as unknown as Record<string, unknown>[] } },
  );
}

/**
 * action=searchCmRole — 미매핑 전체 역할 후보 조회 (선택 ROLE_GROUP_ID 미할당 역할 풀).
 * BE: searchCmRoleTask → CommRoleGrpMngService.searchCmRole(CommRoleGrpMngSearchMapRequest) → ds_role.
 */
export async function searchCmRole(roleGroupId: string): Promise<SearchCmRolePayload> {
  return callAction<SearchCmRolePayload>("searchCmRole", {
    ROLE_GROUP_ID: roleGroupId,
  });
}

/**
 * action=searchCmRoleGrpMenu — 매핑 역할이 보유한 메뉴 트리 조회 (CTE 변환).
 * BE: searchCmRoleGrpMenuTask → CommRoleGrpMngService.searchCmRoleGrpMenu(CommRoleGrpMngSearchMapRequest) → ds_menuTreeList.
 */
export async function searchCmRoleGrpMenu(roleGroupId: string): Promise<SearchCmRoleGrpMenuPayload> {
  return callAction<SearchCmRoleGrpMenuPayload>("searchCmRoleGrpMenu", {
    ROLE_GROUP_ID: roleGroupId,
  });
}

export type {
  SearchCmRoleGrpPayload,
  SaveCmRoleGrpPayload,
  SearchCmRoleGrpMapPayload,
  SaveCmRoleGrpMapPayload,
  SearchCmRolePayload,
  SearchCmRoleGrpMenuPayload,
};
