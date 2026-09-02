/**
 * commUserRoleCopy 화면의 OASIS BFF 호출 래퍼 (W7).
 *
 * 호출 패턴: POST /api/mcm/oasis/commUserRoleCopy/{action} (BPMN action 3 enum — As-Is 1:1 보존)
 *   - searchUserList  — 전체 사용자 List 조회 (ds_userFrom)
 *   - search          — Copy 대상 사용자 + 보유 RoleGroup chain (ds_copyUser + ds_copyRolegrp)
 *   - save            — RoleGroup 일괄 복사 + 권한부여 이력 (cnt_save)
 *
 * 분석리포트 §6 (SQL ID) / §8 (BPMN 3 action) / BPMN설계서 §1.1 인용.
 *
 * 본 모듈 (mcm) 은 SqlSession 빈 미등록 — Phase 7 라우트 사용 금지.
 * 무조건 OASIS (`/api/mcm/oasis/...`) 만 사용 (docs/guide/FrontEnd/standard-v2/frontend-standard/01-rules-decisions-files.md §2-2-1-A).
 * W1·W2·W3·W4·W5·W6 정본 패턴 동일.
 */
import { createJsonApiClient } from "@/lib/http/json-api-client";
import type {
  CommUserRoleCopyCopyRoleGrpRow,
  CommUserRoleCopyCopyUserRow,
  CommUserRoleCopyHeader,
  CommUserRoleCopyUserFromRow,
  CommUserRoleCopyUserToRow,
} from "./types";

const api = createJsonApiClient();

const OASIS_BASE = "/api/mcm/oasis/commUserRoleCopy";

interface SearchUserListPayload {
  ds_userFrom?: CommUserRoleCopyUserFromRow[];
}

interface SearchPayload {
  ds_copyUser?: CommUserRoleCopyCopyUserRow[];
  ds_copyRolegrp?: CommUserRoleCopyCopyRoleGrpRow[];
}

interface SaveCountPayload {
  cnt_save?: number;
}

/**
 * Cactus 표준 응답 envelope (W1·W2·W3·W4·W5·W6 정본 패턴):
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
      meta: { userId: "admin", menuId: "commUserRoleCopy" },
      params,
      ...(grids ? { grids } : {}),
    },
  });
  return unwrapPayload<T>(res);
}

/**
 * action=searchUserList — 전체 사용자 List 조회 (ds_userFrom).
 *
 * 2026-06-04 fix (a) — optional `pUserIdCopy` 전달 시 Copy 대상(본인) 응답에서 제외.
 * Copy 대상이 검색되지 않은 상태에서는 전체 사용자 반환 (종전 동작 1:1).
 *
 * 2026-08-11 fix — 미전달 시 null 이 아닌 빈 문자열("") 전송.
 *   OASIS TypedObject 는 값의 클래스로 타입을 추론하므로 params 에 null 이 실리면
 *   CactusRequestConverter 에서 IllegalArgumentException("The type cannot be determined...") 으로
 *   요청 자체가 거부된다(onload 자동조회 즉시 오류의 원인). BE 계약은 "" = 전체 반환.
 */
export async function searchUserList(pUserIdCopy?: string): Promise<SearchUserListPayload> {
  return callAction<SearchUserListPayload>("searchUserList", {
    pUserIdCopy: pUserIdCopy ?? "",
  });
}

/** action=search — Copy 대상 사용자 + 보유 RoleGroup (ds_copyUser + ds_copyRolegrp). */
export async function search(pUserIdCopy: string): Promise<SearchPayload> {
  return callAction<SearchPayload>("search", {
    pUserIdCopy,
  });
}

/**
 * action=save — RoleGroup 일괄 복사 + 권한부여 이력.
 *
 * @param header  pUserIdCopy + pInfReqNo + pDescription (xfdl:343~345 sArgument)
 * @param userTo  ds_userTo 권한 생성 대상자 List (BPMN grids.master.rows → method param master 자동 매핑)
 */
export async function save(
  header: { pUserIdCopy: string } & CommUserRoleCopyHeader,
  userTo: CommUserRoleCopyUserToRow[],
): Promise<SaveCountPayload> {
  return callAction<SaveCountPayload>(
    "save",
    {
      pUserIdCopy: header.pUserIdCopy,
      pInfReqNo: header.pInfReqNo,
      pDescription: header.pDescription,
    },
    { master: { rows: userTo as unknown as Record<string, unknown>[] } },
  );
}

export type { SearchUserListPayload, SearchPayload, SaveCountPayload };
