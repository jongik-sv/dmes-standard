/**
 * masterCodeMng 화면의 OASIS BFF 호출 래퍼.
 *
 * 호출 패턴: POST /api/mcm/oasis/masterCodeMng/{action} (BPMN action 4 enum)
 *   - search        Master 그리드 + Master 전체 LoV
 *   - searchDetail  Category + Detail + Ref1~5 + Master 전체 LoV
 *   - save          Master 일괄 저장 + 후속 search 재조회
 *   - saveDetail    Detail status 분기 저장 + 후속 searchDetail 재조회
 *
 * 분석리포트 §6 (SQL ID) / §8 (BPMN) / BPMN설계서 §2 인용.
 *
 * 본 모듈 (mcm) 은 SqlSession 빈 미등록 — Phase 7 라우트 사용 금지.
 * 무조건 OASIS (`/api/mcm/oasis/...`) 만 사용 (docs/guide/FrontEnd/standard-v2/frontend-standard/01-rules-decisions-files.md §2-2-1-A).
 */
import { createJsonApiClient } from "@/lib/http/json-api-client";
import type {
  CategoryLov,
  DetailRefLov,
  DetailRow,
  MasterCodeFilters,
  MasterLov,
  MasterRow,
} from "./types";

const api = createJsonApiClient();

const OASIS_BASE = "/api/mcm/oasis/masterCodeMng";

interface SearchPayload {
  ds_GetCodeMasterList?: MasterRow[];
  ds_GetCodeMasterAllList?: MasterLov[];
  /** 서버가 `limit` 으로 목록을 잘랐을 때의 전체 건수(R1). 서버가 상한을 적용하지 않으면 오지 않는다. */
  totalCount?: number;
  /** 서버가 `limit` 으로 목록을 잘랐는지. */
  truncated?: boolean;
}

interface SearchDetailPayload {
  ds_GetTbMcmCodeCategoryList?: CategoryLov[];
  ds_GetCodeDetailList?: DetailRow[];
  ds_codeValRef1?: DetailRefLov[];
  ds_codeValRef2?: DetailRefLov[];
  ds_codeValRef3?: DetailRefLov[];
  ds_codeValRef4?: DetailRefLov[];
  ds_codeValRef5?: DetailRefLov[];
  ds_GetCodeMasterAllList?: MasterLov[];
}

interface SavePayload {
  cnt_merge?: number;
  ds_GetCodeMasterList?: MasterRow[];
  ds_GetCodeMasterAllList?: MasterLov[];
}

interface SaveDetailPayload {
  cnt_mergeDetail?: number;
  ds_GetCodeDetailList?: DetailRow[];
  ds_GetCodeMasterAllList?: MasterLov[];
}

/**
 * Cactus 표준 응답 envelope — CactusResponseConverter 가 Service Map<String,Object> 반환을
 * 다음과 같이 분리:
 *  - 단일 값 (cnt_merge 같은 Number/String) → data.{key}
 *  - List 값 (ds_GetCodeMasterList 같은) → grids.{key}.rows
 *
 * 따라서 FE 는 grids 의 각 key 의 rows 를 추출해 payload 형식으로 변환해야 한다.
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
  // BPMN output="result" + Service Map 반환 패턴: cactus 가 data.result = Map 으로 적재.
  // Map 내부의 List 는 cactus 가 자동 분리 안 함 → FE 가 result 안의 key 들을 그대로 flat 전개.
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
    body: { meta: { userId: "admin", menuId: "masterCodeMng" }, params, ...(grids ? { grids } : {}) },
  });
  return unwrapPayload<T>(res);
}

/**
 * 조건 없는 첫 조회의 행 수 상한(화면 성능 가이드 R1·§5 예산 ≤ 1,000건).
 * 서버가 `limit` 을 받으면 조건이 없을 때만 앞쪽 `limit` 건으로 줄이고 `totalCount`·`truncated` 를 함께 준다.
 * 화면은 잘리면 `GridLimitNotice` 와 [전체 보기](상한 없이 재조회)를 보인다.
 */
export const FIRST_SEARCH_LIMIT = 1000;

/** action=search — Master 그리드 + Master 전체 LoV. `limit` 을 주면 첫 조회 상한(R1), 비우면 전체. */
export async function searchMaster(filters: MasterCodeFilters, limit?: number): Promise<SearchPayload> {
  return callAction<SearchPayload>("search", {
    pCodeId: filters.pCodeId,
    pCodeNm: filters.pCodeNm,
    ...(limit !== undefined ? { limit } : {}),
  });
}

/** action=searchDetail — Category + Detail + Ref1~5 + Master 전체 LoV. */
export async function searchDetail(
  pCodeId: string,
  refs: { ref1?: string; ref2?: string; ref3?: string; ref4?: string; ref5?: string }
): Promise<SearchDetailPayload> {
  return callAction<SearchDetailPayload>("searchDetail", {
    pCodeId,
    pMasterCodeRef1: refs.ref1 ?? "",
    pMasterCodeRef2: refs.ref2 ?? "",
    pMasterCodeRef3: refs.ref3 ?? "",
    pMasterCodeRef4: refs.ref4 ?? "",
    pMasterCodeRef5: refs.ref5 ?? "",
  });
}

/** action=save — Master 일괄 저장 (CactusRequest 표준: grids.master.rows). */
export async function saveMaster(rows: MasterRow[]): Promise<SavePayload> {
  return callAction<SavePayload>("save", {}, { master: { rows: rows as unknown as Record<string, unknown>[] } });
}

/** action=saveDetail — Detail status 분기 저장 (CactusRequest 표준: grids.master.rows). */
export async function saveDetail(rows: DetailRow[]): Promise<SaveDetailPayload> {
  return callAction<SaveDetailPayload>("saveDetail", {}, { master: { rows: rows as unknown as Record<string, unknown>[] } });
}

export type {
  SearchPayload,
  SearchDetailPayload,
  SavePayload,
  SaveDetailPayload,
};
