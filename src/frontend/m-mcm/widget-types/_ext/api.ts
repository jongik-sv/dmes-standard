/**
 * 환율·날씨 OASIS 호출 — POST /api/mcm/oasis/widgetExt/{exchange|weather}(스펙 2026-10-02-widget-admin-generic §5.1, 로그인만 되면 누구나).
 * 요청 본문은 CactusRequest 표준(params 는 평평한 값), 응답은 data.result(Map). envelope 해제는 screenUsageStat/api.ts 와 같은 규칙이다:
 * meta.success=false(HTTP 200 업무 거절) → Error(message), data(+data.result) 펼침.
 * 서버가 사용자·부서를 정하므로 meta.userId 는 보내지 않는다. 날짜는 yyyyMMdd·yyyy-MM-dd 둘 다 받아 yyyy-MM-dd 로 맞춘다.
 * fetch 자체가 실패하면(네트워크 끊김 등 — 브라우저가 영어 TypeError "Failed to fetch"·"Load failed"·"NetworkError …" 를 던진다)
 * 한국어 문구({@link NETWORK_ERROR_MESSAGE})로 바꿔 던진다. 서버가 보낸 거절 문구(업무 거절·HTTP 오류)는 그대로 둔다.
 * @dk-oasis/shared 를 런타임 import 하지 않는다(m-mcm vitest 가 shared dist 없이 시험한다).
 */
import { createJsonApiClient } from "@/lib/http/json-api-client";

import { normalizeDate, toNumber } from "./format";
import { sameSpot, type WeatherLocation } from "./config";
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

type ExtAction = "exchange" | "weather" | "options";

/** 응답 없이 fetch 가 실패했을 때(네트워크 끊김 등) 보일 문구. */
export const NETWORK_ERROR_MESSAGE: Record<ExtAction, string> = {
  exchange: "환율 정보를 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
  weather: "날씨 정보를 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
  options: "선택지를 불러오지 못했습니다. 기본 목록을 보입니다.",
};

async function callAction(action: ExtAction, params: Record<string, unknown>): Promise<Record<string, unknown>> {
  let res: unknown;
  try {
    res = await api.request<unknown>(`${OASIS_BASE}/${action}`, {
      method: "POST",
      body: { meta: { menuId: MENU_ID }, params },
    });
  } catch (e) {
    // fetch 는 응답을 받지 못하면 TypeError 를 던진다(문구는 브라우저마다 다른 영어). HTTP 오류는 json-api-client 가 서버 문구로 Error 를 만든다.
    if (e instanceof TypeError) throw new Error(NETWORK_ERROR_MESSAGE[action], { cause: e });
    throw e;
  }
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
  return { latest, history, stale: out.stale === true, disabled: out.disabled === true, ...(out.empty === true ? { empty: true } : {}) };
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
  const collectedAt = typeof out.collectedAt === "string" && out.collectedAt.trim() !== "" ? out.collectedAt.trim() : null;
  return { current, daily, stale: out.stale === true, collectedAt, uncollected: out.uncollected === true, empty: out.empty === true };
}

/** 원화 기준 환율 — 최근 days 일(스펙 §5.1). 서버가 MDM 환율 마스터를 읽어 주며, 값이 낡았으면 stale·없으면 empty 가 붙는다. */
export async function fetchExchange(symbols: readonly string[], days: number): Promise<ExchangeResult> {
  return normalizeExchange(await callAction("exchange", exchangeParams(symbols, days)));
}

/** 좌표의 현재 날씨 + 3일 예보 — 예약 작업(날씨 수집)이 모아 둔 최신 값. 수집 대상이 아닌 지점은 uncollected, 모인 값이 없으면 empty 로 돌려준다. */
export async function fetchWeather(lat: number, lon: number): Promise<WeatherResult> {
  return normalizeWeather(await callAction("weather", weatherParams(lat, lon)));
}

/** 편집기 선택지 — 서버가 환율 마스터·날씨 수집 작업에서 읽어 준 통화 코드와 지점(이름·좌표). */
export interface WidgetOptions {
  currencies: string[];
  places: WeatherLocation[];
}

const CUR_CODE = /^[A-Z]{3}$/;

/** 선택지 응답 정리 — 영문 대문자 3자리(KRW 제외)만 중복 없이, 지점은 이름이 있고 좌표가 범위 안인 것만(이름·좌표가 모두 같은 것은 하나). */
export function normalizeOptions(out: Record<string, unknown>): WidgetOptions {
  const currencies: string[] = [];
  if (Array.isArray(out.currencies)) {
    for (const c of out.currencies) {
      const cur = typeof c === "string" ? c.trim().toUpperCase() : "";
      if (CUR_CODE.test(cur) && cur !== "KRW" && !currencies.includes(cur)) currencies.push(cur);
    }
  }
  const places: WeatherLocation[] = [];
  for (const r of rowsOf(out.places)) {
    const name = typeof r.name === "string" ? r.name.trim() : "";
    const lat = toNumber(r.lat);
    const lon = toNumber(r.lon);
    if (name === "" || lat === null || lon === null || lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;
    const place = { name, lat, lon };
    // 이름이 같아도 좌표가 다르면 서로 다른 지점이라 둘 다 둔다. 이름과 좌표가 모두 같으면 하나만.
    if (places.some((p) => p.name === name && sameSpot(p, place))) continue;
    places.push(place);
  }
  return { currencies, places };
}

/** 선택지를 다시 읽기 전까지 두는 시간(ms) — 편집기를 여닫을 때마다 부르지 않게 한다. */
export const OPTIONS_TTL_MS = 60_000;

let optionsCache: { at: number; value: Promise<WidgetOptions> } | null = null;

/**
 * 환율 통화·날씨 지점 선택지(서버 값). 성공한 응답은 {@link OPTIONS_TTL_MS} 동안 다시 쓰고, 실패하면 캐시를 비워 다음에 다시 부른다.
 * 호출하는 쪽은 실패·빈 목록일 때 고정 목록으로 대신한다.
 */
export function fetchWidgetOptions(now: number = Date.now()): Promise<WidgetOptions> {
  if (optionsCache && now - optionsCache.at < OPTIONS_TTL_MS) return optionsCache.value;
  const value = callAction("options", {}).then(normalizeOptions);
  const entry = { at: now, value };
  optionsCache = entry;
  value.catch(() => {
    if (optionsCache === entry) optionsCache = null;
  });
  return value;
}

/** 시험용 — 선택지 캐시를 비운다. */
export function resetWidgetOptionsCache(): void {
  optionsCache = null;
}
