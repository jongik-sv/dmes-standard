/**
 * 포털 홈 호출 래퍼.
 *   - 공지 목록: `POST /api/mls/oasis/noticeBoard/search` — 모든 로그인 사용자 읽기 전용(조회 범위는 서버가 고정).
 *   - 로그인 사용자: 공유 사용자 확인(`getCurrentUser` — `GET /api/auth/me` 세션 캐시) — 인사말 이름.
 * 요청 봉투·응답 해제는 m-mls `noticeMgmt/api.ts` 와 같은 방식이다(모듈 간 import 를 피하려고 여기에 둔다).
 */
import { apiRequest } from "@dk-oasis/shared/http";
import { getCurrentUser } from "@dk-oasis/shared/portal-shell";

import type { NoticeBoardRow } from "./types";

const NOTICE_BOARD_URL = "/api/mls/oasis/noticeBoard/search";

interface CactusEnvelope {
  meta?: { success?: boolean; message?: string };
  data?: Record<string, unknown>;
  grids?: Record<string, { rows?: unknown[] }>;
}

/**
 * 응답 봉투 해제 + 비즈니스 거부 판정. OASIS 는 BusinessException 을 HTTP 200 + `meta.success=false` 로 돌려준다.
 * 결과는 `data.result` 안에 통째로 오므로 펼쳐 둔다.
 */
export function unwrap(res: unknown): Record<string, unknown> {
  const env = res as CactusEnvelope;
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
  return out;
}

/** 게시 중 공지 목록(서버 정렬: 상단 고정 → 긴급 → 등록 최신순). */
export async function searchNoticeBoard(): Promise<NoticeBoardRow[]> {
  const res = await apiRequest<unknown>(NOTICE_BOARD_URL, {
    method: "POST",
    body: JSON.stringify({ meta: { menuId: "noticeBoard" }, params: {} }),
  });
  const list = unwrap(res).list;
  return Array.isArray(list) ? (list as NoticeBoardRow[]) : [];
}

export interface CurrentUser {
  id: string;
  name: string | null;
}

/** 로그인 사용자(이름이 없으면 null). 실패하면 null — 인사말만 이름 없이 보인다. */
export async function fetchCurrentUser(): Promise<CurrentUser | null> {
  try {
    // 공유 사용자 확인(진행 중 요청 공유·세션 캐시) — 셸이 이미 물었으면 요청 없이 받는다(K3).
    const me = await getCurrentUser();
    if (!me.ok) return null;
    return { id: me.user.id, name: me.user.name?.trim() || null };
  } catch {
    return null;
  }
}
