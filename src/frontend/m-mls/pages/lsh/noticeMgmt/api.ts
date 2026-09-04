/**
 * noticeMgmt 화면의 OASIS BFF 호출 래퍼.
 *
 * 호출 패턴: `POST /api/mls/oasis/noticeMgmt/{action}` (기능설계서 §1.2)
 *   - search       — 목록 조회 (§3)
 *   - save         — 일괄 저장 C/U/D (§5.1 B-003 / B-004)
 *   - changeStatus — 게시상태 변경 (§5.1 B-005)
 *
 * BFF(`m-mcm/app/api/[module]/oasis/[serviceId]/[action]`)가 `MLS_WAS_URL` 로 프록시하며
 * 인증 헤더 3종(`X-Client-Key` / `X-Authenticated-User` / `X-Authenticated-Role`)을 주입한다.
 * 화면 코드는 그 헤더를 직접 다루지 않는다.
 */
import { apiRequest } from "@dk-oasis/shared/http";

import type { NoticeMgmtFilters, NoticeRow } from "./types";

const OASIS_BASE = "/api/mls/oasis/noticeMgmt";

/**
 * Cactus 표준 응답 봉투.
 *
 * BE 가 `Map<String,Object>` 를 반환하고 BPMN 이 `output="result"` 이므로 결과는
 * `data.result` 안에 통째로 들어온다. cactus 는 Map 내부 List 를 자동 분리하지 않는다
 * (BackEnd 표준 §6-D-2) — 그래서 아래 `unwrap` 이 `result` 를 flat 전개한다.
 */
interface CactusEnvelope {
  meta?: { success?: boolean; message?: string; code?: string };
  data?: Record<string, unknown>;
  grids?: Record<string, { rows?: unknown[] }>;
  errors?: Array<{ grid?: string; rowKey?: string; field?: string; message?: string }>;
}

export interface NoticeMgmtPayload {
  list?: NoticeRow[];
  cntMerge?: number;
}

/**
 * 응답 봉투 해제 + **비즈니스 거부 판정**.
 *
 * ★ OASIS 실행기는 `BusinessException` 을 잡아 HTTP 200 + `meta.success=false` 로 되돌려준다.
 *   `apiRequest` 는 `!res.ok` 일 때만 throw 하므로, 이 판정이 없으면 저장 실패가 조용히 성공으로
 *   처리돼 "버튼을 눌러도 아무 일이 없는" 증상이 된다. 저장소의 모든 화면이 이 체크를 넣어 둔다.
 *
 *   행·필드 단위 상세(`errors[]`)가 오면 메시지에 덧붙여 사용자가 어느 행이 문제인지 알 수 있게 한다.
 */
function unwrap(res: unknown): NoticeMgmtPayload {
  const env = res as CactusEnvelope;

  if (env?.meta && env.meta.success === false) {
    const base = env.meta.message?.trim() || "요청이 거부되었습니다.";
    const details = (env.errors ?? [])
      .map((e) => (e.field ? `${e.field}: ${e.message}` : e.message))
      .filter(Boolean);
    throw new Error(details.length > 0 ? `${base}\n- ${details.join("\n- ")}` : base);
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
  return out as NoticeMgmtPayload;
}

async function callAction(
  action: string,
  params: Record<string, unknown>,
  grids?: Record<string, { rows: Record<string, unknown>[] }>,
): Promise<NoticeMgmtPayload> {
  const res = await apiRequest<unknown>(`${OASIS_BASE}/${action}`, {
    method: "POST",
    body: JSON.stringify({
      meta: { menuId: "noticeMgmt" },
      params,
      ...(grids ? { grids } : {}),
    }),
  });
  return unwrap(res);
}

/** action=search — §3 조회조건으로 목록 조회 (B-001). */
export async function searchNotices(filters: NoticeMgmtFilters): Promise<NoticeMgmtPayload> {
  return callAction("search", {
    title: filters.title,
    noticeStatus: filters.noticeStatus,
    postStartDt: filters.postStartDt,
    postEndDt: filters.postEndDt,
  });
}

/**
 * action=save — 변경 행만 일괄 저장 (B-003 / B-004).
 *
 * ★ 최상위 grid 키 `master` 는 BE 메서드 파라미터명(`List<Map> master`)과 **글자 단위로 같아야** 한다.
 *   OASIS 가 이름으로 바인딩하므로 키를 바꾸면 BE 에 null 이 들어온다 (BackEnd 표준 §6-E-3).
 *
 * ★ 배열을 `params` 에 실으면 안 된다 — `CactusRequestConverter` 가 `params` 를 TypeReference 없이
 *   `TypedObject` 로 감싸 "Generic type. You must explicitly specify the type" 로 죽는다. 반드시 `grids`.
 */
export async function saveNotices(rows: NoticeRow[]): Promise<NoticeMgmtPayload> {
  return callAction(
    "save",
    {},
    { master: { rows: rows as unknown as Record<string, unknown>[] } },
  );
}

/** action=changeStatus — 게시상태 변경 (B-005 게시중지). */
export async function changeNoticeStatus(
  noticeId: string,
  noticeStatus: string,
): Promise<NoticeMgmtPayload> {
  return callAction("changeStatus", { noticeId, noticeStatus });
}
