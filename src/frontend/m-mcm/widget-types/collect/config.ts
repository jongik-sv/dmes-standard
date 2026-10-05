/**
 * 정시 수집(collect) 정의 설정(CONFIG_JSON) — 읽기·검사·편집 도우미. 순수 함수.
 * 계약: docs/widget-2026-10/spec-widget-data.md §2(서버 규칙과 같은 한도). 저장 검사는 서버가 정식으로 판정하고, 이 검사는 칸 단위 안내와 저장 막기용이다.
 * 읽기(read*)는 느슨하다 — 값이 없거나 이상하면 초기 설정으로 채우되, 편집 중에 일부러 비운 목록은 그대로 둔다(편집기가 오류를 보이게).
 * @dk-oasis/shared 를 import 하지 않는다(m-mcm vitest 가 shared dist 없이 시험한다).
 */
import { extractAllBindNames, RESERVED_PARAM_NAMES } from "../_query/format";

/* ── 타입 ── */

export type ScheduleMode = "interval" | "daily";
export type SourceKind = "sql" | "http" | "exchange";

export interface CollectSchedule {
  mode: ScheduleMode;
  /** interval 일 때 주기(분). */
  everyMin: number;
  /** daily 일 때 시각 목록(HH:mm). */
  at: string[];
}

export interface HttpItem {
  key: string;
  path: string;
}

export interface CollectSource {
  kind: SourceKind;
  sql: string;
  keyField: string;
  valueField: string;
  url: string;
  items: HttpItem[];
  currencies: string[];
}

export interface CollectShow {
  days: number;
  unit: string;
}

export interface CollectConfig {
  schedule: CollectSchedule;
  source: CollectSource;
  show: CollectShow;
}

/** 칸 묶음별 오류 문구 — 편집기가 해당 칸 아래에 보인다. */
export interface CollectErrors {
  schedule: string[];
  source: string[];
  show: string[];
}

/* ── 상수 ── */

/** 1440 의 약수 중 허용하는 주기(분) — 자정에 맞춰 정렬되고 외부 호출이 잦지 않게. */
export const EVERY_MIN_OPTIONS: readonly number[] = [5, 10, 15, 20, 30, 60, 120, 180, 240, 360, 480, 720, 1440];
export const DAILY_AT_MAX = 24;
export const HTTP_ITEMS_MAX = 20;
export const ITEM_KEY_MAX = 100;
export const SHOW_DAYS_MIN = 1;
export const SHOW_DAYS_MAX = 90;
export const SHOW_DAYS_DEFAULT = 7;
export const UNIT_MAX = 10;
export const CURRENCIES_MAX = 10;

export const SCHEDULE_MODE_LABELS: Readonly<Record<string, string>> = { interval: "주기마다", daily: "매일 정해진 시각" };
export const SOURCE_KIND_LABELS: Readonly<Record<string, string>> = { sql: "SQL", http: "HTTP JSON", exchange: "환율" };

/** 주기 선택지 글자 — 「10분」·「60분(1시간)」·「1440분(24시간)」. */
export function everyMinLabel(min: number): string {
  return min >= 60 && min % 60 === 0 ? `${min}분(${min / 60}시간)` : `${min}분`;
}

const AT_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const CUR_RE = /^[A-Z]{3}$/;
/** 점·대괄호 경로 — `data.items[0].price`. 공백·빈 마디·숫자 아닌 인덱스는 거절한다. */
const PATH_RE = /^(?:\[\d+\]|[^\s.[\]]+)(?:\.[^\s.[\]]+|\[\d+\])*$/;

/* ── 읽기 ── */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function text(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function numberOf(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

/** 새 정의의 초기 설정 — interval 10분·sql 원천·show.days 7(type.meta.ts 의 initialConfig 와 같다). */
export const COLLECT_INITIAL: Readonly<Record<string, unknown>> = {
  schedule: { mode: "interval", everyMin: 10 },
  source: { kind: "sql", sql: "", valueField: "" },
  show: { days: SHOW_DAYS_DEFAULT },
};

/** 정의 설정을 모양을 믿지 않고 읽는다. 항목·시각·통화 목록은 비어 있어도 그대로 둔다(편집 중). */
export function readCollectConfig(raw: unknown): CollectConfig {
  const c = isRecord(raw) ? raw : {};
  const s = isRecord(c.schedule) ? c.schedule : {};
  const src = isRecord(c.source) ? c.source : {};
  const show = isRecord(c.show) ? c.show : {};

  const mode: ScheduleMode = s.mode === "daily" ? "daily" : "interval";
  const at = Array.isArray(s.at) ? s.at.filter((a): a is string => typeof a === "string").map((a) => a.trim()) : [];
  const kind: SourceKind = src.kind === "http" || src.kind === "exchange" ? src.kind : "sql";
  const items: HttpItem[] = Array.isArray(src.items)
    ? src.items.filter(isRecord).map((i) => ({ key: text(i.key).trim(), path: text(i.path).trim() }))
    : [];
  const currencies: string[] = [];
  if (Array.isArray(src.currencies)) {
    for (const cur of src.currencies) {
      const code = typeof cur === "string" ? cur.trim().toUpperCase() : "";
      if (code && !currencies.includes(code)) currencies.push(code);
    }
  }

  return {
    schedule: { mode, everyMin: numberOf(s.everyMin) ?? 10, at },
    source: {
      kind,
      sql: text(src.sql),
      keyField: text(src.keyField).trim(),
      valueField: text(src.valueField).trim(),
      url: text(src.url),
      items,
      currencies,
    },
    show: { days: numberOf(show.days) ?? SHOW_DAYS_DEFAULT, unit: text(show.unit).trim() },
  };
}

/** 위젯이 읽을 기간(일) — 설정이 1~90 정수가 아니면 7. */
export function showDaysOf(raw: unknown): number {
  const d = readCollectConfig(raw).show.days;
  return Number.isInteger(d) && d >= SHOW_DAYS_MIN && d <= SHOW_DAYS_MAX ? d : SHOW_DAYS_DEFAULT;
}

/** 값 단위 — 앞뒤 공백을 지우고 UNIT_MAX 자까지. */
export function unitOf(raw: unknown): string {
  return readCollectConfig(raw).show.unit.slice(0, UNIT_MAX);
}

/* ── 편집 도우미(저장 모양으로 되돌린다) ── */

/** 일정 → 저장 모양 — 방식에 맞는 키만 남긴다. */
export function scheduleToJson(s: CollectSchedule): Record<string, unknown> {
  return s.mode === "daily" ? { mode: "daily", at: s.at } : { mode: "interval", everyMin: s.everyMin };
}

/** 원천 → 저장 모양 — 종류에 맞는 키만 남긴다(빈 keyField 는 뺀다). */
export function sourceToJson(s: CollectSource): Record<string, unknown> {
  if (s.kind === "http") return { kind: "http", url: s.url, items: s.items };
  if (s.kind === "exchange") return { kind: "exchange", currencies: s.currencies };
  const out: Record<string, unknown> = { kind: "sql", sql: s.sql, valueField: s.valueField };
  if (s.keyField) out.keyField = s.keyField;
  return out;
}

/** 표시 → 저장 모양 — 빈 단위는 뺀다. */
export function showToJson(s: CollectShow): Record<string, unknown> {
  const out: Record<string, unknown> = { days: s.days };
  if (s.unit) out.unit = s.unit;
  return out;
}

/** 원천 종류를 바꾼 새 원천 — 이전 종류의 칸은 버리고 새 종류의 빈 칸으로 시작한다. */
export function sourceOfKind(kind: SourceKind, prev: CollectSource): CollectSource {
  const empty: CollectSource = { kind, sql: "", keyField: "", valueField: "", url: "", items: [], currencies: [] };
  if (kind === prev.kind) return prev;
  if (kind === "exchange") return { ...empty, currencies: ["USD", "EUR", "JPY", "CNY"] };
  if (kind === "http") return { ...empty, items: [{ key: "", path: "" }] };
  return empty;
}

/* ── 검사 ── */

function validateSchedule(s: CollectSchedule, raw: unknown): string[] {
  const rawMode = isRecord(raw) && isRecord(raw.schedule) ? raw.schedule.mode : undefined;
  const errors: string[] = [];
  if (rawMode !== undefined && rawMode !== "interval" && rawMode !== "daily") errors.push("수집 방식을 주기마다 또는 매일 정해진 시각 중에서 고르세요");
  if (s.mode === "interval") {
    if (!EVERY_MIN_OPTIONS.includes(s.everyMin)) errors.push(`수집 주기는 ${EVERY_MIN_OPTIONS.join("·")}분 중에서 고르세요`);
    return errors;
  }
  if (s.at.length === 0) errors.push(`수집 시각을 1~${DAILY_AT_MAX}개 넣으세요`);
  else if (s.at.length > DAILY_AT_MAX) errors.push(`수집 시각은 최대 ${DAILY_AT_MAX}개까지 둘 수 있습니다`);
  const seen = new Set<string>();
  for (const a of s.at) {
    if (!AT_RE.test(a)) errors.push(`수집 시각 「${a}」 은 HH:mm(00:00~23:59) 형식이어야 합니다`);
    else if (seen.has(a)) errors.push(`수집 시각 「${a}」 이 중복됩니다`);
    seen.add(a);
  }
  return errors;
}

function validateHttpUrl(url: string): string | null {
  const u = url.trim();
  if (u === "") return "주소를 입력하세요";
  let parsed: URL;
  try {
    parsed = new URL(u);
  } catch {
    return "주소는 http 또는 https 절대 주소여야 합니다";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "주소는 http 또는 https 절대 주소여야 합니다";
  if (parsed.username !== "" || parsed.password !== "") return "주소에 사용자 정보(user:pw@)를 넣을 수 없습니다";
  return null;
}

function validateSource(s: CollectSource): string[] {
  const errors: string[] = [];
  if (s.kind === "sql") {
    if (s.sql.trim() === "") errors.push("SQL 을 입력하세요");
    else {
      const names = extractAllBindNames(s.sql);
      const system = names.filter((n) => n === "userId" || n === "deptCd");
      const user = names.filter((n) => !RESERVED_PARAM_NAMES.includes(n));
      if (system.length > 0) errors.push(`수집에는 사용자가 없어 ${system.map((n) => `:${n}`).join("·")} 를 쓸 수 없습니다`);
      if (user.length > 0) errors.push(`수집 SQL 에는 사용자 입력 조건(${user.map((n) => `:${n}`).join(", ")})을 쓸 수 없습니다`);
    }
    if (s.valueField === "") errors.push("값 컬럼을 입력하세요");
  } else if (s.kind === "http") {
    const urlError = validateHttpUrl(s.url);
    if (urlError) errors.push(urlError);
    if (s.items.length === 0) errors.push(`수집 항목을 1~${HTTP_ITEMS_MAX}개 넣으세요`);
    else if (s.items.length > HTTP_ITEMS_MAX) errors.push(`수집 항목은 최대 ${HTTP_ITEMS_MAX}개까지 둘 수 있습니다`);
    s.items.forEach((item, i) => {
      const at = `수집 항목 ${i + 1}번`;
      if (item.key === "") errors.push(`${at}의 이름을 입력하세요`);
      else if (item.key.length > ITEM_KEY_MAX) errors.push(`${at}의 이름은 ${ITEM_KEY_MAX}자 이하로 입력하세요`);
      if (item.path === "") errors.push(`${at}의 값 위치를 입력하세요`);
      else if (!PATH_RE.test(item.path)) errors.push(`${at}의 값 위치는 data.items[0].price 처럼 점·대괄호로 적으세요`);
    });
  } else {
    if (s.currencies.length === 0) errors.push(`통화를 1~${CURRENCIES_MAX}개 고르세요`);
    else if (s.currencies.length > CURRENCIES_MAX) errors.push(`통화는 최대 ${CURRENCIES_MAX}개까지 고를 수 있습니다`);
    for (const c of s.currencies) {
      if (c === "KRW") errors.push("기준 통화(KRW)는 대상 통화로 고를 수 없습니다");
      else if (!CUR_RE.test(c)) errors.push(`통화 코드가 올바르지 않습니다: ${c}`);
    }
  }
  return errors;
}

function validateShow(s: CollectShow, raw: unknown): string[] {
  const errors: string[] = [];
  const rawShow = isRecord(raw) && isRecord(raw.show) ? raw.show : {};
  if (rawShow.days !== undefined && (numberOf(rawShow.days) === undefined || !Number.isInteger(s.days) || s.days < SHOW_DAYS_MIN || s.days > SHOW_DAYS_MAX)) {
    errors.push(`표시 기간은 ${SHOW_DAYS_MIN}~${SHOW_DAYS_MAX}일의 정수로 입력하세요`);
  }
  if (typeof rawShow.unit === "string" && rawShow.unit.trim().length > UNIT_MAX) errors.push(`단위는 ${UNIT_MAX}자 이하로 입력하세요`);
  return errors;
}

/** 칸 묶음별 검사 — 편집기가 각 칸 아래에 보인다. */
export function collectErrors(raw: unknown): CollectErrors {
  const cfg = readCollectConfig(raw);
  return { schedule: validateSchedule(cfg.schedule, raw), source: validateSource(cfg.source), show: validateShow(cfg.show, raw) };
}

/** 편집기 검사(저장 막기용) — 빈 배열이면 저장 가능. 서버 규칙(스펙 §2)과 같은 한도. */
export function validateCollectConfig(raw: unknown): string[] {
  const e = collectErrors(raw);
  return [...e.schedule, ...e.source, ...e.show];
}
