/**
 * masterCodeMngList (Master Code 상세조회) 화면의 OASIS BFF 호출 래퍼.
 *
 * 호출 패턴: POST /api/mcm/oasis/masterCodeMngList/{action} (BPMN action 2 enum)
 *   - search        Master 그리드 (1 SQL — GetCodeMasterList)
 *   - searchDetail  Category LoV + Detail (2 SQL — GetTbMcmCodeCategoryList + GetCodeDetailList)
 *
 * 분석리포트 §6 (SQL ID) / §8 (BPMN) / BPMN설계서 §2 인용.
 *
 * 본 모듈 (mcm) 은 SqlSession 빈 미등록 — Phase 7 라우트 사용 금지.
 * 무조건 OASIS (`/api/mcm/oasis/...`) 만 사용 (docs/guide/FrontEnd/standard-v2/frontend-standard/01-rules-decisions-files.md §2-2-1-A).
 */
import { createJsonApiClient } from "@/lib/http/json-api-client";
import type {
  MasterCodeMngListCategoryLov,
  MasterCodeMngListDetailRow,
  MasterCodeMngListFilters,
  MasterCodeMngListMasterRow,
} from "./types";

const api = createJsonApiClient();

const OASIS_BASE = "/api/mcm/oasis/masterCodeMngList";

interface SearchPayload {
  ds_GetCodeMasterList?: MasterCodeMngListMasterRow[];
}

interface SearchDetailPayload {
  ds_GetTbMcmCodeCategoryList?: MasterCodeMngListCategoryLov[];
  ds_GetCodeDetailList?: MasterCodeMngListDetailRow[];
}

/**
 * Cactus 표준 응답 envelope — CactusResponseConverter 가 Service Map 반환을 분리:
 *  - 단일 값 (Number/String 등) → data.{key}
 *  - List 값 → grids.{key}.rows
 * BPMN output="result" + Service Map 반환 패턴에서는 data.result 안의 key 들을 평탄 전개.
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
): Promise<T> {
  const res = await api.request<unknown>(`${OASIS_BASE}/${action}`, {
    method: "POST",
    body: { meta: { userId: "admin", menuId: "masterCodeMngList" }, params },
  });
  return unwrapPayload<T>(res);
}

/** action=search — Master 그리드. */
export async function searchMaster(filters: MasterCodeMngListFilters): Promise<SearchPayload> {
  return callAction<SearchPayload>("search", {
    pCodeId: filters.pCodeId,
    pCodeNm: filters.pCodeNm,
  });
}

/** action=searchDetail — Category LoV + Detail. */
export async function searchDetail(
  pCodeId: string,
  refs: { ref1?: string; ref2?: string; ref3?: string; ref4?: string; ref5?: string },
): Promise<SearchDetailPayload> {
  return callAction<SearchDetailPayload>("searchDetail", {
    pCodeId,
    pCodeIdRef1: refs.ref1 ?? "",
    pCodeIdRef2: refs.ref2 ?? "",
    pCodeIdRef3: refs.ref3 ?? "",
    pCodeIdRef4: refs.ref4 ?? "",
    pCodeIdRef5: refs.ref5 ?? "",
  });
}

export type { SearchPayload, SearchDetailPayload };
