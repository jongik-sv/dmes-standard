/**
 * commWidgetMng OASIS 호출(위젯 목록 탭) — POST /api/mcm/oasis/commWidgetMng/{search|save|delete}.
 * 계약: 스펙 2026-10-02-widget-admin-generic §5.2, 계획 Task 2 표. 응답은 data.result(Map).
 * envelope 해제는 csa/screenUsageStat/api.ts 와 같은 규칙이다: meta.success=false 거절, data(+data.result) 펼침, grids.{key}.rows.
 * meta.userId 는 보내지 않는다 — 서버가 인증 정보로 채운다.
 * @dk-oasis/shared 를 런타임 import 하지 않는다(m-mcm vitest 가 shared dist 없이 시험한다) — configJson 파싱(toWidgetDefRow)은 화면이 한다.
 */
import { createJsonApiClient } from "@/lib/http/json-api-client";

import { SCREEN_ID, type WidgetAdminSearchResult, type WidgetSaveParams } from "./types";

const api = createJsonApiClient();

const OASIS_BASE = `/api/mcm/oasis/${SCREEN_ID}`;

interface CactusEnvelope {
  meta?: { success?: boolean; message?: string };
  data?: Record<string, unknown>;
  grids?: Record<string, { rows?: unknown[] }>;
}

function unwrapPayload(res: unknown): Record<string, unknown> {
  const env = res as CactusEnvelope;
  // OASIS 실행기는 업무 거절을 HTTP 200 + meta.success=false 로 돌려준다(screenUsageStat/api.ts 와 같다).
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

async function callAction(action: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const res = await api.request<unknown>(`${OASIS_BASE}/${action}`, {
    method: "POST",
    body: { meta: { menuId: SCREEN_ID }, params },
  });
  return unwrapPayload(res);
}

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

/** 정의·덮어쓰기 행 전체(configJson 전부 포함)와 위젯별 사용자 수. */
export async function searchWidgetDefs(): Promise<WidgetAdminSearchResult> {
  const out = await callAction("search");
  const defs = Array.isArray(out.defs) ? out.defs.filter(isRecord) : [];
  const usage: Record<string, number> = {};
  if (isRecord(out.usage)) {
    for (const [id, v] of Object.entries(out.usage)) {
      const n = Number(v);
      if (Number.isFinite(n)) usage[id] = n;
    }
  }
  return { defs, usage };
}

/** 정의 행 1개 저장 — 결과 def Map(신규 정의 위젯이면 서버가 만든 widgetId 포함). */
export async function saveWidgetDef(params: WidgetSaveParams): Promise<Record<string, unknown> & { widgetId: string }> {
  const out = await callAction("save", { ...params });
  const def = isRecord(out.def) ? out.def : {};
  const widgetId = typeof def.widgetId === "string" && def.widgetId ? def.widgetId : params.widgetId;
  return { ...def, widgetId };
}

/** 정의 위젯 삭제(사용자 수 0 일 때만) 또는 코드 위젯 덮어쓰기 행 삭제(= 코드 값으로 되돌리기). */
export async function deleteWidgetDef(widgetId: string): Promise<string> {
  const out = await callAction("delete", { widgetId });
  return typeof out.deleted === "string" && out.deleted ? out.deleted : widgetId;
}
