/**
 * commSyncMng 화면의 OASIS BFF 호출 래퍼 (W8 — 8번째 화면).
 *
 * 호출 패턴: POST /api/mcm/oasis/commSyncMng/{action} (BPMN action 1 enum — As-Is 1:1 보존)
 *   - reg — 동기화 실행 (이행) — 6 처리유형 분기 (Service 내부 if/else) — MASTER 만 실제 동기화 (Q-001)
 *
 * 분석리포트 §6 (SQL 13) / §8 (BPMN 1 action) / BPMN설계서 §1.1 인용.
 *
 * 본 모듈 (mcm) 은 SqlSession 빈 미등록 — Phase 7 라우트 사용 금지.
 * 무조건 OASIS (`/api/mcm/oasis/...`) 만 사용 (docs/guide/FrontEnd/standard-v2/frontend-standard/01-rules-decisions-files.md §2-2-1-A).
 * W1·W2·W3·W4·W5·W6·W7 정본 패턴 동일.
 */
import { createJsonApiClient } from "@/lib/http/json-api-client";
import type {
  CommSyncMngMainRow,
  CommSyncMngObjectRow,
  CommSyncMngRegResponse,
  SyncTarget,
} from "./types";

const api = createJsonApiClient();

const OASIS_BASE = "/api/mcm/oasis/commSyncMng";

/**
 * Cactus 표준 응답 envelope (W1·W2·W3·W4·W5·W6·W7 정본 패턴):
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
      meta: { userId: "admin", menuId: "commSyncMng" },
      params,
      ...(grids ? { grids } : {}),
    },
  });
  return unwrapPayload<T>(res);
}

/**
 * action=reg — 동기화 실행 (이행).
 *
 * @param pSyncTarget  처리유형 6 enum (MASTER / RULE / RULE_JUDGE / INTERFACE / FORMAT / OBJECT)
 * @param dsMain       이행 매트릭스 (16 정적 행 — CHK=1 행만 BE 가 필터 / V-007 화이트리스트)
 * @param dsObject     처리대상 List (edt_Target ',' split 결과)
 * @returns {cnt_save: N} — fn_callBack 의 cnt_save==0 분기 / "{N}건 저장 되었습니다." 메시지 정합
 */
export async function reg(
  pSyncTarget: SyncTarget,
  dsMain: CommSyncMngMainRow[],
  dsObject: CommSyncMngObjectRow[],
): Promise<CommSyncMngRegResponse> {
  return callAction<CommSyncMngRegResponse>(
    "reg",
    { pSyncTarget },
    {
      dsMain: { rows: dsMain as unknown as Record<string, unknown>[] },
      dsObject: { rows: dsObject as unknown as Record<string, unknown>[] },
    },
  );
}

export type { CommSyncMngRegResponse };
