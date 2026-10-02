/**
 * 쿼리 위젯 서버 호출(스펙 2026-10-02-widget-admin-generic §5.1·§5.2).
 *   - 위젯 실행: `POST /api/mcm/oasis/widgetData/run` — 로그인 사용자 누구나(AUTH_ONLY). **defId 만 보낸다**(W-D23: 요청의 SQL 은 실행하지 않는다).
 *   - 관리자 시험: `POST /api/mcm/oasis/commWidgetMng/previewQuery` — 위젯관리 메뉴 권한. 행 상한 50, DB 오류 메시지를 그대로 돌려준다.
 * 요청 본문은 CactusRequest 표준(params 는 평평한 값). meta.userId 는 보내지 않는다 — 서버가 인증 정보로 채운다.
 * envelope 해제는 home/api.ts·screenUsageStat/api.ts 와 같은 규칙이다: meta.success=false 거절, data(+data.result) 펼침, grids.{key}.rows.
 * @dk-oasis/shared 를 런타임 import 하지 않는다(m-mcm vitest 가 shared dist 없이 시험한다).
 */
import { createJsonApiClient } from "@/lib/http/json-api-client";

import { normalizeQueryResult, type QueryResult } from "./format";

const api = createJsonApiClient();

export const WIDGET_DATA_RUN_URL = "/api/mcm/oasis/widgetData/run";
export const PREVIEW_QUERY_URL = "/api/mcm/oasis/commWidgetMng/previewQuery";

interface CactusEnvelope {
  meta?: { success?: boolean; message?: string };
  data?: Record<string, unknown>;
  grids?: Record<string, { rows?: unknown[] }>;
}

/** 응답 봉투 해제 + 업무 거절 판정. OASIS 는 BusinessException 을 HTTP 200 + `meta.success=false` 로 돌려준다. */
export function unwrapResult(res: unknown): Record<string, unknown> {
  const env = res as CactusEnvelope | null;
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

async function post(url: string, menuId: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await api.request<unknown>(url, { method: "POST", body: { meta: { menuId }, params } });
  return unwrapResult(res);
}

/** 저장된 쿼리 위젯 정의를 실행한다(행 상한 500 은 서버가 정한다). */
export async function runWidgetQuery(defId: string): Promise<QueryResult> {
  return normalizeQueryResult(await post(WIDGET_DATA_RUN_URL, "HOME", { defId }));
}

/** 저장 전 SQL 시험 실행(관리자). 실패는 서버 메시지(「쿼리 오류: …」 등)를 담은 Error. */
export async function previewWidgetQuery(dataSrc: string, sql: string): Promise<QueryResult> {
  return normalizeQueryResult(await post(PREVIEW_QUERY_URL, "commWidgetMng", { dataSrc, sql }));
}
