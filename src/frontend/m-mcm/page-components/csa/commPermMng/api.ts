/**
 * commPermMng 화면의 OASIS BFF 호출 래퍼.
 *
 * 호출 패턴: POST /api/mcm/oasis/commPermMng/{action} (BPMN action 2 enum — To-Be 정책 #1 적용)
 *   - searchCmPerm — PERMISSION 그리드 조회 (selectCommPermMng + ROLE_ID scalar 부착)
 *   - saveCmPerm   — PERMISSION 일괄 저장 (status 분기 inserted/updated/deleted) + 후속 재조회
 *
 * 폐기 action (cross-cutting 정책 #1, 2026-05-31):
 *   - lov (As-Is CommObjMngMapper.selectAppHostId cross-module) — BIZ_SYSTEM_CODE 컬럼 폐기로 호출 불요
 *
 * 분석리포트 §6 (SQL ID) / §8 (BPMN) / BPMN설계서 §1.1 + §2 인용.
 *
 * 본 모듈 (mcm) 은 SqlSession 빈 미등록 — Phase 7 라우트 사용 금지.
 * 무조건 OASIS (`/api/mcm/oasis/...`) 만 사용 (docs/guide/FrontEnd/standard-v2/frontend-standard/01-rules-decisions-files.md §2-2-1-A).
 */
import { createJsonApiClient } from "@/lib/http/json-api-client";
import type { CommPermMngFilters, CommPermMngRow } from "./types";

const api = createJsonApiClient();

const OASIS_BASE = "/api/mcm/oasis/commPermMng";

interface SearchCmPermPayload {
  ds_main?: CommPermMngRow[];
}

interface SaveCmPermPayload {
  cnt_merge?: number;
  ds_main?: CommPermMngRow[];
}

/**
 * Cactus 표준 응답 envelope — CactusResponseConverter 가 Service Map<String,Object> 반환을
 * 다음과 같이 분리:
 *  - 단일 값 (cnt_merge 같은 Number/String) → data.{key}
 *  - List 값 (ds_main 같은) → grids.{key}.rows
 *
 * BPMN output="result" + Service Map 반환 패턴: cactus 가 data.result = Map 으로 적재.
 * Map 내부의 List 는 cactus 가 자동 분리 안 함 → FE 가 result 안의 key 들을 그대로 flat 전개
 * (cma·W1~W5 정본 패턴 그대로).
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
      meta: { userId: "admin", menuId: "commPermMng" },
      params,
      ...(grids ? { grids } : {}),
    },
  });
  return unwrapPayload<T>(res);
}

/** action=searchCmPerm — PERMISSION 그리드 조회 (As-Is selectCommPermMng). */
export async function searchCommPermMng(filters: CommPermMngFilters): Promise<SearchCmPermPayload> {
  return callAction<SearchCmPermPayload>("search", {
    edtPERMISSIONID: filters.edt_PERMISSION_ID,
    edtPERMISSIONNM: filters.edt_PERMISSION_NM,
    cboUSETP: filters.cbo_USE_TP,
  });
}

/**
 * action=saveCmPerm — PERMISSION 일괄 저장 (CactusRequest 표준: grids.master.rows).
 * BE Service.saveCmPerm(List<Map> master) parameter 이름 = grid key `master` 와 일치 (가이드 §6-E-3).
 */
export async function saveCommPermMng(rows: CommPermMngRow[]): Promise<SaveCmPermPayload> {
  return callAction<SaveCmPermPayload>(
    "save",
    {},
    { master: { rows: rows as unknown as Record<string, unknown>[] } },
  );
}

export type { SearchCmPermPayload, SaveCmPermPayload };
