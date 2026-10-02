/**
 * 환율·날씨 OASIS 호출 — POST /api/mcm/oasis/widgetExt/{exchange|weather}(스펙 2026-10-02-widget-admin-generic §5.1, 로그인만 되면 누구나).
 * 요청 본문은 CactusRequest 표준(params 는 평평한 값), 응답은 data.result(Map). envelope 해제는 screenUsageStat/api.ts 와 같은 규칙이다:
 * meta.success=false(HTTP 200 업무 거절) → Error(message), data(+data.result) 펼침.
 * 서버가 사용자·부서를 정하므로 meta.userId 는 보내지 않는다. 날짜는 yyyyMMdd·yyyy-MM-dd 둘 다 받아 yyyy-MM-dd 로 맞춘다.
 * @dk-oasis/shared 를 런타임 import 하지 않는다(m-mcm vitest 가 shared dist 없이 시험한다).
 */
import { createJsonApiClient } from "@/lib/http/json-api-client";

import { normalizeDate, toNumber } from "./format";
import type { ExchangeHistoryPoint, ExchangeLatest, ExchangeResult, WeatherDaily, WeatherResult } from "./types";

const api = createJsonApiClient();

const OASIS_BASE = "/api/mcm/oasis/widgetExt";
/** 위젯이 놓이는 포털 홈 — secWidget 호출(widget-store.ts)과 같은 menuId. */
const MENU_ID = "HOME";

interface CactusEnvelope {
  meta?: { success?: boolean; message?: string };
  data?: Record<string, unknown>;
  grids?: Record<string, { rows?: unknown[] }>;
}

/** 응답 봉투 해제 + 업무 거절 판정. 결과는 data.result 안에 통째로 오므로 펼쳐 둔다. */
export function unwrapPayload(res: unknown): Record<string, unknown> {
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

async function callAction(action: "exchange" | "weather", params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await api.request<unknown>(`${OASIS_BASE}/${action}`, {
    method: "POST",
    body: { meta: { menuId: MENU_ID }, params },
  });
  return unwrapPayload(res);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function rowsOf(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? v.filter(isRecord) : [];
}

/** 환율 요청 params — base 는 KRW 만, symbols 는 쉼표 문자열(서버가 문자열·목록 모두 받는다), days 1~90. */
export function exchangeParams(symbols: readonly string[], days: number): Record<string, unknown> {
  return { base: "KRW", symbols: symbols.join(","), days };
}

export function weatherParams(lat: number, lon: number): Record<string, unknown> {
  return { lat, lon };
}

export function normalizeExchange(out: Record<string, unknown>): ExchangeResult {
  const latest: ExchangeLatest[] = [];
  for (const r of rowsOf(out.latest)) {
    if (typeof r.cur !== "string" || r.cur.trim() === "") continue;
    latest.push({
      cur: r.cur.trim().toUpperCase(),
      rate: toNumber(r.rate),
      diff: toNumber(r.diff),
      date: normalizeDate(r.date),
    });
  }
  const history: ExchangeHistoryPoint[] = [];
  for (const r of rowsOf(out.history)) {
    const date = normalizeDate(r.date);
    const rate = toNumber(r.rate);
    if (!date || rate === null || typeof r.cur !== "string" || r.cur.trim() === "") continue;
    history.push({ date, cur: r.cur.trim().toUpperCase(), rate });
  }
  return { latest, history, stale: out.stale === true, disabled: out.disabled === true };
}

export function normalizeWeather(out: Record<string, unknown>): WeatherResult {
  const c = out.current;
  const current = isRecord(c)
    ? { temp: toNumber(c.temp), code: toNumber(c.code), wind: toNumber(c.wind), humidity: toNumber(c.humidity) }
    : null;
  const daily: WeatherDaily[] = [];
  for (const r of rowsOf(out.daily)) {
    const date = normalizeDate(r.date);
    if (!date) continue;
    daily.push({ date, min: toNumber(r.min), max: toNumber(r.max), code: toNumber(r.code), pop: toNumber(r.pop) });
  }
  return { current, daily, stale: out.stale === true, disabled: out.disabled === true };
}

/** 원화 기준 환율 — 최근 days 일(스펙 §5.1). 제공자가 실패하면 서버가 DB 값만 + stale 로 돌려준다. */
export async function fetchExchange(symbols: readonly string[], days: number): Promise<ExchangeResult> {
  return normalizeExchange(await callAction("exchange", exchangeParams(symbols, days)));
}

/** 좌표의 현재 날씨 + 3일 예보. 실패하면 서버가 「날씨 정보를 불러오지 못했습니다」 로 거절한다(이전 값이 있으면 stale). */
export async function fetchWeather(lat: number, lon: number): Promise<WeatherResult> {
  return normalizeWeather(await callAction("weather", weatherParams(lat, lon)));
}
