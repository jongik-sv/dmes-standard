/**
 * 홈의 위젯 정의 조회 — POST /api/mcm/oasis/widgetDef/list (AUTH_ONLY, 스펙 widget-admin-generic §5.1·§11).
 * 응답: { defs: [정의·덮어쓰기 행], homeDefault: [기본 배치 행] | null, homeDefaultKey }.
 * 요청 봉투·응답 해제는 widget-store.ts·api.ts 와 같은 규칙이다(meta.success=false 거절, data(+data.result) 펼침).
 * @dk-oasis/shared 를 런타임 import 하지 않는다(m-mcm vitest 가 shared dist 없이 시험한다) — 타입만 가져온다.
 * defs 줄을 WidgetDefRow 로 바꾸는 일(toWidgetDefRow)은 shared 를 쓰는 page.tsx 가 한다.
 */
import type { WidgetItem } from "@dk-oasis/shared/widget";

import { createJsonApiClient } from "@/lib/http/json-api-client";

const api = createJsonApiClient();

const LIST_URL = "/api/mcm/oasis/widgetDef/list";

/** widgetDef/list 의 두 갈래 결과. rawDefs 는 서버 줄 그대로(configJson 문자열 포함). homeDefault 가 null 이면 전사 기본 배치가 없다(화면 코드 상수를 쓴다). */
export interface WidgetDefsResult {
  rawDefs: Record<string, unknown>[];
  homeDefault: WidgetItem[] | null;
}

interface CactusEnvelope {
  meta?: { success?: boolean; message?: string };
  data?: Record<string, unknown>;
  grids?: Record<string, { rows?: unknown[] }>;
}

/** OASIS 는 업무 거절을 HTTP 200 + meta.success=false 로 돌려준다. 결과는 data.result 안에 통째로 오므로 펼쳐 둔다. */
function unwrap(res: unknown): Record<string, unknown> {
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

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const toNum = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * 기본 배치 서버 줄(instId·widgetId·posX·posY·sizeW·sizeH·lockYn)을 WidgetItem 으로 바꾼다.
 * instId·widgetId 가 없는 줄은 건너뛴다. 좌표·크기는 보드(sanitizeLayout)가 위젯별 범위로 다시 자른다.
 */
export function homeItemsFromRows(rows: readonly unknown[]): WidgetItem[] {
  const out: WidgetItem[] = [];
  for (const raw of rows) {
    if (!isRecord(raw)) continue;
    const instId = typeof raw.instId === "string" ? raw.instId : "";
    const widgetId = typeof raw.widgetId === "string" ? raw.widgetId : "";
    if (!instId || !widgetId) continue;
    out.push({
      instId,
      widgetId,
      x: toNum(raw.posX),
      y: toNum(raw.posY),
      w: toNum(raw.sizeW),
      h: toNum(raw.sizeH),
      locked: raw.lockYn === "Y",
      config: null,
    });
  }
  return out;
}

/** 위젯 정의·전사 기본 배치를 불러온다. 실패(네트워크·HTTP·meta.success=false)는 Error 로 던진다. */
export async function fetchWidgetDefs(): Promise<WidgetDefsResult> {
  const res = await api.request<unknown>(LIST_URL, {
    method: "POST",
    body: { meta: { menuId: "HOME" }, params: {} },
  });
  const out = unwrap(res);
  // 성공 응답인데 defs 가 없거나 배열이 아니면 응답 모양 위반이다 — 빈 목록·ready 로 두면 정의 위젯이 배치에서 지워질 수 있다.
  if (!Array.isArray(out.defs)) throw new Error("위젯 정의 응답 형식이 올바르지 않습니다.");
  const defs = out.defs.filter(isRecord);
  const home = Array.isArray(out.homeDefault) ? homeItemsFromRows(out.homeDefault) : null;
  return { rawDefs: defs, homeDefault: home };
}

/** 응답의 기본 배치가 있으면(비어 있지 않으면) 그것, 없으면 코드 상수. 서버는 빈 기본 배치를 저장하지 않으므로 빈 배열도 「없음」으로 본다. */
export function pickHomeDefault(fromServer: WidgetItem[] | null, fallback: WidgetItem[]): WidgetItem[] {
  return fromServer && fromServer.length > 0 ? fromServer : fallback;
}

/** 유형 등록부 → { 유형 ID: 이름 } — [위젯 추가] 서랍이 정의 위젯 옆에 유형 이름을 보인다. */
export function typeTitlesOf(types: Readonly<Record<string, { meta: { title: string } }>>): Record<string, string> {
  return Object.fromEntries(Object.entries(types).map(([id, entry]) => [id, entry.meta.title]));
}

/** WidgetWorkspace.registryStatus 와 같은 값. */
export type RegistryStatus = "loading" | "ready" | "error";

/** 홈이 들고 있는 정의 조회 상태. status 가 loading·error 이면 [배치 편집]이 막힌다(정의 위젯 손실 방지, Review Focus 1). */
export interface DefsState {
  status: RegistryStatus;
  rawDefs: Record<string, unknown>[];
  homeDefault: WidgetItem[] | null;
}

export const INITIAL_DEFS_STATE: DefsState = { status: "loading", rawDefs: [], homeDefault: null };

export type DefsAction =
  | { type: "retry" }
  | { type: "loaded"; rawDefs: Record<string, unknown>[]; homeDefault: WidgetItem[] | null }
  | { type: "failed" };

/** retry·failed 는 rawDefs 를 그대로 두어 등록부가 다시 합쳐지지 않게 한다(바뀌면 작업 공간이 탭을 다시 불러온다). */
export function defsReducer(state: DefsState, action: DefsAction): DefsState {
  switch (action.type) {
    case "retry":
      return { ...state, status: "loading" };
    case "loaded":
      // 서버 defs 가 비어 있고 기존 것도 비어 있으면 rawDefs 참조를 그대로 둔다 — 새 빈 배열이면 등록부가 다시 합쳐져 작업 공간이 한 번 더 불러온다.
      return {
        status: "ready",
        rawDefs: action.rawDefs.length === 0 && state.rawDefs.length === 0 ? state.rawDefs : action.rawDefs,
        homeDefault: action.homeDefault,
      };
    case "failed":
      return { ...state, status: "error" };
  }
}
