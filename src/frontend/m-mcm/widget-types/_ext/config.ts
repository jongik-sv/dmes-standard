/**
 * 환율·날씨 정의 설정(CONFIG_JSON) — 읽기·검사·편집 도우미. 순수 함수(스펙 2026-10-02-widget-admin-generic §6·§8).
 * 읽기(read*)는 느슨하다: 값이 없거나 이상하면 초기 설정으로 채우되, 편집 중에 일부러 비운 목록(통화·지점 0개)은 그대로 둔다.
 * 그래야 편집기가 「하나 이상 고르세요」 오류를 보일 수 있다. 검사(validate*)가 저장을 막는다.
 * 서버 한도(Task 9): 통화 1~10개(3자리 대문자)·기간 1~90일·기준 통화 KRW. @dk-oasis/shared 를 import 하지 않는다.
 */

// ── 환율 ─────────────────────────────────────────────────────────────────

/** 편집기가 보여 주는 통화(스펙 §6 Task 12). VND 는 기본 제공자 Frankfurter(유럽중앙은행)가 주지 않아 뺐다. */
export const EXCHANGE_CURRENCIES = ["USD", "EUR", "JPY", "CNY", "GBP", "AUD", "CAD", "CHF", "HKD", "SGD", "THB"] as const;
/** 서버가 한 번에 받는 통화 수(widgetExt/exchange symbols 1~10개). */
export const MAX_EXCHANGE_CURRENCIES = 10;
export const EXCHANGE_DAY_OPTIONS = [7, 30, 90] as const;
const DEFAULT_DAYS = 30;
const CUR_RE = /^[A-Z]{3}$/;
const BASE_CUR = "KRW";

export interface ExchangeConfig {
  base: string;
  currencies: string[];
  days: number;
}

export const EXCHANGE_INITIAL: Readonly<ExchangeConfig> = {
  base: "KRW",
  currencies: ["USD", "EUR", "JPY", "CNY"],
  days: DEFAULT_DAYS,
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** 정의 설정 일부를 바꾼 새 객체 — 다른 키는 그대로 둔다(편집기가 모르는 키를 지우지 않는다). */
export function patchConfig(raw: unknown, patch: Record<string, unknown>): Record<string, unknown> {
  return { ...(isRecord(raw) ? raw : {}), ...patch };
}

function cloneExchangeInitial(): ExchangeConfig {
  return { ...EXCHANGE_INITIAL, currencies: [...EXCHANGE_INITIAL.currencies] };
}

export function readExchangeConfig(raw: unknown): ExchangeConfig {
  if (!isRecord(raw)) return cloneExchangeInitial();
  const out = cloneExchangeInitial();
  if (typeof raw.base === "string") out.base = raw.base.trim().toUpperCase();
  if (Array.isArray(raw.currencies)) {
    const list: string[] = [];
    for (const c of raw.currencies) {
      if (typeof c !== "string") continue;
      const cur = c.trim().toUpperCase();
      if (cur && !list.includes(cur)) list.push(cur);
    }
    out.currencies = list;
  }
  const days = typeof raw.days === "string" && raw.days.trim() !== "" ? Number(raw.days) : raw.days;
  if (typeof days === "number" && Number.isFinite(days)) out.days = days;
  return out;
}

/** 편집기 검사 — 원본 설정을 읽어 서버 한도에 맞는지 본다. 빈 배열이면 저장 가능. */
export function validateExchangeConfig(raw: unknown): string[] {
  const cfg = readExchangeConfig(raw);
  const errors: string[] = [];
  if (cfg.base !== BASE_CUR) errors.push(`기준 통화는 ${BASE_CUR} 만 지원합니다`);
  if (cfg.currencies.length === 0) errors.push("통화를 하나 이상 고르세요");
  else if (cfg.currencies.length > MAX_EXCHANGE_CURRENCIES) errors.push(`통화는 ${MAX_EXCHANGE_CURRENCIES}개까지 고를 수 있습니다`);
  for (const c of cfg.currencies) {
    if (c === BASE_CUR) errors.push(`기준 통화(${BASE_CUR})는 대상 통화로 고를 수 없습니다`);
    else if (!CUR_RE.test(c)) errors.push(`통화 코드가 올바르지 않습니다: ${c}`);
  }
  if (!Number.isInteger(cfg.days) || cfg.days < 1 || cfg.days > 90) errors.push("기간은 1~90일 사이 정수여야 합니다");
  return errors;
}

/** 서버에 보낼 값 — 올바른 통화만 중복 없이 10개까지, 기간은 1~90 으로 맞춘다. 통화가 없으면 호출하지 않는다. */
export function exchangeRequest(cfg: ExchangeConfig): { symbols: string[]; days: number } {
  const symbols: string[] = [];
  for (const c of cfg.currencies) {
    const cur = c.trim().toUpperCase();
    // 기준 통화(KRW)는 대상이 될 수 없다 — 서버가 거절하므로 보내지 않는다.
    if (CUR_RE.test(cur) && cur !== BASE_CUR && !symbols.includes(cur)) symbols.push(cur);
    if (symbols.length >= MAX_EXCHANGE_CURRENCIES) break;
  }
  const days = Number.isFinite(cfg.days) ? Math.min(90, Math.max(1, Math.round(cfg.days))) : DEFAULT_DAYS;
  return { symbols, days };
}

/** 통화 체크 — 편집기 목록 순서(USD·EUR·JPY…)로 정렬하고, 목록에 없는 코드는 맨 뒤에 둔다. */
export function toggleCurrency(current: readonly string[], cur: string, checked: boolean): string[] {
  const set = new Set(current);
  if (checked) set.add(cur);
  else set.delete(cur);
  const known = (EXCHANGE_CURRENCIES as readonly string[]).filter((c) => set.has(c));
  const extra = [...set].filter((c) => !(EXCHANGE_CURRENCIES as readonly string[]).includes(c));
  return [...known, ...extra];
}

/** 기간 선택지 — 7·30·90, 설정값이 1~90 정수인데 그 밖이면 함께 보여 선택이 사라지지 않게 한다. */
export function daysOptions(days: number): number[] {
  const list: number[] = [...EXCHANGE_DAY_OPTIONS];
  if (Number.isInteger(days) && days >= 1 && days <= 90 && !list.includes(days)) list.push(days);
  return list.sort((a, b) => a - b);
}

// ── 날씨 ─────────────────────────────────────────────────────────────────

export interface WeatherLocation {
  name: string;
  /** 편집 중 숫자가 아닌 글자면 NaN(검사가 막는다) */
  lat: number;
  lon: number;
}

export interface WeatherConfig {
  locations: WeatherLocation[];
}

export const WEATHER_INITIAL: Readonly<WeatherConfig> = {
  locations: [{ name: "서울", lat: 37.5665, lon: 126.978 }],
};

/** 빠른 추가 버튼(스펙 §6 Task 12). */
export const QUICK_LOCATIONS: readonly WeatherLocation[] = [
  { name: "서울", lat: 37.5665, lon: 126.978 },
  { name: "인천", lat: 37.4563, lon: 126.7052 },
  { name: "포항", lat: 36.019, lon: 129.3435 },
  { name: "당진", lat: 36.8898, lon: 126.6458 },
  { name: "부산", lat: 35.1796, lon: 129.0756 },
];

function cloneWeatherInitial(): WeatherConfig {
  return { locations: WEATHER_INITIAL.locations.map((l) => ({ ...l })) };
}

/** 좌표 글자 → 숫자. 비었거나 숫자가 아니면 NaN. */
export function parseCoord(text: string): number {
  const t = text.trim();
  return t === "" ? Number.NaN : Number(t);
}

/** 좌표 숫자 → 입력 칸 글자(NaN 은 빈 글자). */
export function coordText(n: number): string {
  return Number.isFinite(n) ? String(n) : "";
}

/** 입력 중인 글자가 이 값과 같은 뜻인가("37." 와 37) — 입력 도중 글자를 값으로 덮어쓰지 않으려고 쓴다. */
export function sameCoord(text: string, n: number): boolean {
  const p = parseCoord(text);
  return Number.isNaN(p) ? Number.isNaN(n) : p === n;
}

function coordOf(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseCoord(v);
  return Number.NaN;
}

export function readWeatherConfig(raw: unknown): WeatherConfig {
  if (!isRecord(raw) || !Array.isArray(raw.locations)) return cloneWeatherInitial();
  const locations: WeatherLocation[] = [];
  for (const l of raw.locations) {
    if (!isRecord(l)) continue;
    locations.push({ name: typeof l.name === "string" ? l.name : "", lat: coordOf(l.lat), lon: coordOf(l.lon) });
  }
  return { locations };
}

function latOk(n: number): boolean {
  return Number.isFinite(n) && n >= -90 && n <= 90;
}

function lonOk(n: number): boolean {
  return Number.isFinite(n) && n >= -180 && n <= 180;
}

/** 그릴 수 있는 지점 — 이름이 있고 좌표가 범위 안. */
export function validLocations(cfg: WeatherConfig): WeatherLocation[] {
  return cfg.locations.filter((l) => l.name.trim() !== "" && latOk(l.lat) && lonOk(l.lon));
}

/** 편집기 검사 — 지점 1개 이상, 이름·위도(−90~90)·경도(−180~180). 오류마다 「지점 N:」 을 붙인다. */
export function validateWeatherConfig(raw: unknown): string[] {
  const { locations } = readWeatherConfig(raw);
  if (locations.length === 0) return ["지점을 하나 이상 넣으세요"];
  const errors: string[] = [];
  locations.forEach((l, i) => {
    const p = `지점 ${i + 1}:`;
    if (l.name.trim() === "") errors.push(`${p} 이름을 입력하세요`);
    if (!latOk(l.lat)) errors.push(`${p} 위도는 -90~90 사이 숫자여야 합니다`);
    if (!lonOk(l.lon)) errors.push(`${p} 경도는 -180~180 사이 숫자여야 합니다`);
  });
  return errors;
}

/** 빠른 추가 — 같은 이름이 이미 있으면 그대로(같은 배열) 돌려준다. */
export function addQuickLocation(list: readonly WeatherLocation[], preset: WeatherLocation): WeatherLocation[] {
  if (list.some((l) => l.name === preset.name)) return list as WeatherLocation[];
  return [...list, { ...preset }];
}
