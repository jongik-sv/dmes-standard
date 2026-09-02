/**
 * commObjMng 화면의 OASIS BFF 호출 래퍼.
 *
 * 호출 패턴: POST /api/mcm/oasis/commObjMng/{action} (BPMN action 3 enum — As-Is 보존)
 *   - searchCmObj — OBJECT 그리드 조회
 *   - saveCmObj   — OBJECT 일괄 저장 (status 분기) + 후속 재조회
 *   - lov         — MENU ID 1 dataset (To-Be 정책 #1 — APP_HOST 폐기)
 *
 * 분석리포트 §6 (SQL ID) / §8 (BPMN) / BPMN설계서 §1.1 + §2 인용.
 *
 * 본 모듈 (mcm) 은 SqlSession 빈 미등록 — Phase 7 라우트 사용 금지.
 * 무조건 OASIS (`/api/mcm/oasis/...`) 만 사용 (docs/guide/FrontEnd/standard-v2/frontend-standard/01-rules-decisions-files.md §2-2-1-A).
 */
import { createJsonApiClient } from "@/lib/http/json-api-client";
import type { CommObjMngFilters, CommObjMngRow, MenuIdLov } from "./types";

const api = createJsonApiClient();

const OASIS_BASE = "/api/mcm/oasis/commObjMng";

interface SearchCmObjPayload {
  ds_main?: CommObjMngRow[];
}

interface SaveCmObjPayload {
  cnt_merge?: number;
  ds_main?: CommObjMngRow[];
}

interface LovPayload {
  ds_lovMenuId?: MenuIdLov[];
}

interface SearchSystemLovPayload {
  ds_systemLov?: { MENU_ID: string; MENU_NM?: string }[];
}

/**
 * Cactus 표준 응답 envelope — CactusResponseConverter 가 Service Map<String,Object> 반환을
 * 다음과 같이 분리:
 *  - 단일 값 (cnt_merge 같은 Number/String) → data.{key}
 *  - List 값 (ds_main 같은) → grids.{key}.rows
 *
 * BPMN output="result" + Service Map 반환 패턴: cactus 가 data.result = Map 으로 적재.
 * Map 내부의 List 는 cactus 가 자동 분리 안 함 → FE 가 result 안의 key 들을 그대로 flat 전개
 * (cma masterCodeMng 정본 패턴 그대로).
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
      meta: { userId: "admin", menuId: "commObjMng" },
      params,
      ...(grids ? { grids } : {}),
    },
  });
  return unwrapPayload<T>(res);
}

/** action=searchCmObj — OBJECT 그리드 조회 (As-Is selectCommObjMng). */
export async function searchCommObjMng(filters: CommObjMngFilters): Promise<SearchCmObjPayload> {
  return callAction<SearchCmObjPayload>("search", {
    edtOBJECTID: filters.edt_OBJECT_ID,
    cboUSETP: filters.cbo_USE_TP,
  });
}

/**
 * action=saveCmObj — OBJECT 일괄 저장 (CactusRequest 표준: grids.master.rows).
 * BE Service.saveCmObj(List<Map> master) parameter 이름 = grid key `master` 와 일치 (가이드 §6-E-3).
 */
export async function saveCommObjMng(rows: CommObjMngRow[]): Promise<SaveCmObjPayload> {
  return callAction<SaveCmObjPayload>(
    "save",
    {},
    { master: { rows: rows as unknown as Record<string, unknown>[] } },
  );
}

/** action=lov — MENU ID LoV (To-Be 정책 #1 — 1 dataset 만). */
export async function loadLov(): Promise<LovPayload> {
  return callAction<LovPayload>("lov", {});
}

/**
 * action=searchSystemLov — SYSTEM 콤보박스 옵션 (TB_MCM_SEC_MENU_FLD root 폴더).
 *
 * 2026-06-05 — Detail SYSTEM 입력란 콤보박스화. source = PARENT_MENU_ID IS NULL row.
 * 현 시점 시드는 'mcm' 1행. 추후 다른 모듈 root 추가 시 자동 노출.
 */
export async function searchSystemLov(): Promise<SearchSystemLovPayload> {
  return callAction<SearchSystemLovPayload>("searchSystemLov", {});
}

export type { SearchCmObjPayload, SaveCmObjPayload, LovPayload, SearchSystemLovPayload };
