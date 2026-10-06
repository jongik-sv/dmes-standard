/**
 * 자동 수집(collect) 정의 설정(CONFIG_JSON) — 읽기·검사·편집 도우미. 순수 함수.
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
/** 환율 원천의 interval 주기 하한(분) — 외부 호출이 잦지 않게 서버가 60분 미만을 저장 때 거절한다(daily 는 제한 없음). */
export const EXCHANGE_EVERY_MIN_FLOOR = 60;
export const FIELD_MAX = 100;
export const URL_MAX = 500;
export const PATH_MAX = 200;
export const PATH_DEPTH_MAX = 20;
export const PATH_INDEX_MAX = 9999;

export const SCHEDULE_MODE_LABELS: Readonly<Record<string, string>> = { interval: "주기마다", daily: "매일 정해진 시각" };
export const SOURCE_KIND_LABELS: Readonly<Record<string, string>> = { sql: "SQL", http: "HTTP JSON", exchange: "환율" };

/** 주기 선택지 글자 — 「10분」·「60분(1시간)」·「1440분(24시간)」. */
export function everyMinLabel(min: number): string {
  return min >= 60 && min % 60 === 0 ? `${min}분(${min / 60}시간)` : `${min}분`;
}

const AT_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const CUR_RE = /^[A-Z]{3}$/;
/** 값 위치 이름 조각 — 유니코드 글자·숫자와 `_`·`$`·`-` 만(서버 PATH_NAME 과 같다). */
const PATH_NAME_RE = /^[\p{L}\p{N}_$-]+$/u;

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
    // 단위는 원래 글자를 그대로 둔다(입력 중 끝 공백이 지워지면 「a b」 를 칠 수 없다). 길이 검사는 받은 값 길이로, 칸을 벗어날 때 편집기가 다듬는다.
    show: { days: numberOf(show.days) ?? SHOW_DAYS_DEFAULT, unit: text(show.unit) },
  };
}

/** 위젯이 읽을 기간(일) — 설정이 1~90 정수가 아니면 7. */
export function showDaysOf(raw: unknown): number {
  const d = readCollectConfig(raw).show.days;
  return Number.isInteger(d) && d >= SHOW_DAYS_MIN && d <= SHOW_DAYS_MAX ? d : SHOW_DAYS_DEFAULT;
}

/** 화면에 붙일 값 단위 — 앞뒤 공백을 지우고 UNIT_MAX 자까지. */
export function unitOf(raw: unknown): string {
  return readCollectConfig(raw).show.unit.trim().slice(0, UNIT_MAX);
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

/* ── 검사(원래 설정 값을 서버 규칙과 같게 본다 — 읽기 기본값으로 가리지 않는다) ── */

const PATH_HINT = "data.items[0].price 처럼 점·대괄호 경로로 적으세요(이름은 글자·숫자와 _ $ - 만, 첨자는 0~9999, 200자·20조각 이하)";

/**
 * 값 위치 검사 — 서버 CollectConfigs.parsePath 와 같은 규칙. 오류가 있으면 문구(「…」 앞에 붙일 사유 없이 PATH_HINT 포함), 없으면 null.
 * 빈 조각·연속 점·`]` 뒤에 바로 붙은 이름·숫자 아닌 첨자·허용 밖 글자(`/`·`@`·`:`·공백 등) 거절.
 */
export function pathError(path: string): string | null {
  if (path === "" || path.trim() === "") return "값 위치를 입력하세요";
  const bad = `값 위치는 ${PATH_HINT}`;
  if (path.length > PATH_MAX) return bad;
  let parts = 0;
  let i = 0;
  let expectName = true;
  const n = path.length;
  while (i < n) {
    const c = path[i];
    if (c === "[") {
      const close = path.indexOf("]", i);
      if (close < 0 || close === i + 1) return bad;
      const digits = path.slice(i + 1, close);
      if (!/^[0-9]{1,4}$/.test(digits) || Number(digits) > PATH_INDEX_MAX) return bad;
      parts++;
      i = close + 1;
      expectName = false;
    } else if (c === ".") {
      if (expectName) return bad;
      i++;
      if (i >= n) return bad;
      expectName = true;
    } else {
      if (!expectName && parts > 0) return bad;
      let end = i;
      while (end < n && path[end] !== "." && path[end] !== "[") end++;
      if (!PATH_NAME_RE.test(path.slice(i, end))) return bad;
      parts++;
      i = end;
      expectName = false;
    }
    if (parts > PATH_DEPTH_MAX) return bad;
  }
  return parts === 0 ? bad : null;
}

/** java.net.URI 가 받는 글자인지 — 공백·제어문자·`"<>\^`{|}` 와 `%` 뒤 16진 두 자리가 아닌 `%` 는 거절(영문 외 글자는 URI 가 받는다). */
const URI_ILLEGAL_RE = /[\u0000-\u0020\u007f"<>\\^`{|}]|%(?![0-9A-Fa-f]{2})/;
/** 호스트 이름 마디 — 영문·숫자·`-`, 처음·끝은 영문·숫자(밑줄·한글은 java.net.URI 가 호스트로 읽지 못한다). */
const HOST_LABEL_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;

/** 호스트 글자가 java.net.URI 의 호스트 규칙(이름·IPv4·[IPv6])에 맞는지 — 맞지 않으면 URI.getHost() 가 null 이라 서버가 거절한다. */
function hostOk(host: string): boolean {
  if (host.startsWith("[")) return /^\[[0-9A-Fa-f:.]+\]$/.test(host);
  const labels = host.endsWith(".") ? host.slice(0, -1).split(".") : host.split(".");
  if (labels.length === 0 || labels.some((l) => !HOST_LABEL_RE.test(l))) return false;
  // 마지막 마디(toplabel)는 영문으로 시작한다. IPv4(숫자 4마디)는 따로 받는다.
  if (/^\d+$/.test(labels[labels.length - 1])) return labels.length === 4 && labels.every((l) => Number(l) <= 255);
  return /^[A-Za-z]/.test(labels[labels.length - 1]);
}

/** 주소 검사 — 서버 CollectConfigs.parseUrl(java.net.URI)에 가깝게. 오류 문구, 없으면 null. 허용 호스트 목록은 서버만 안다. */
export function urlError(url: string): string | null {
  const u = url.trim();
  if (u === "") return "주소를 입력하세요";
  if (url.length > URL_MAX) return `주소는 ${URL_MAX}자 이하로 입력하세요`;
  if (URI_ILLEGAL_RE.test(u)) return "주소에 쓸 수 없는 글자가 있습니다(공백·\" < > \\ ^ ` { | } 와 % 뒤 16진 두 자리가 아닌 %)";
  const m = /^([A-Za-z][A-Za-z0-9+.-]*):(\/\/)?([^/?#]*)/.exec(u);
  const scheme = m ? m[1].toLowerCase() : "";
  if (scheme !== "http" && scheme !== "https") return "주소는 http:// 또는 https:// 로 시작하는 절대 주소여야 합니다";
  const authority = m && m[2] ? m[3] : "";
  if (authority.includes("@")) return "주소에 사용자 정보(user:pw@)를 넣을 수 없습니다";
  const hp = /^(.*?)(?::(\d*))?$/.exec(authority);
  const host = hp ? hp[1] : "";
  if (host === "" || !hostOk(host)) return "주소에 올바른 호스트가 있어야 합니다(영문·숫자·점·하이픈 호스트만, 밑줄·한글 호스트는 쓸 수 없습니다)";
  return null;
}

function isIntegerNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v);
}

function validateSchedule(raw: unknown, sourceKind: unknown): string[] {
  if (!isRecord(raw)) return ["수집 일정이 아직 설정되지 않았습니다. 방식(주기마다·매일 정해진 시각)을 다시 골라 주세요"];
  const errors: string[] = [];
  if (raw.mode === "interval") {
    if (!isIntegerNumber(raw.everyMin) || !EVERY_MIN_OPTIONS.includes(raw.everyMin)) {
      errors.push(`수집 주기는 ${EVERY_MIN_OPTIONS.join("·")}분 중에서 고르세요`);
    } else if (sourceKind === "exchange" && raw.everyMin < EXCHANGE_EVERY_MIN_FLOOR) {
      errors.push(`환율 원천은 주기마다 수집할 때 ${EXCHANGE_EVERY_MIN_FLOOR}분 이상으로 고르세요(더 자주 모으려면 매일 정해진 시각을 쓰세요)`);
    }
    return errors;
  }
  if (raw.mode !== "daily") return ["수집 방식을 주기마다 또는 매일 정해진 시각 중에서 고르세요"];
  const at = Array.isArray(raw.at) ? raw.at : [];
  if (at.length === 0) errors.push(`수집 시각을 1~${DAILY_AT_MAX}개 넣으세요`);
  else if (at.length > DAILY_AT_MAX) errors.push(`수집 시각은 최대 ${DAILY_AT_MAX}개까지 둘 수 있습니다`);
  const seen = new Set<string>();
  for (const a of at) {
    const t = typeof a === "string" ? a : String(a);
    if (typeof a !== "string" || !AT_RE.test(a)) errors.push(`수집 시각 「${t}」 은 HH:mm(00:00~23:59) 형식이어야 합니다`);
    else if (seen.has(a)) errors.push(`수집 시각 「${a}」 이 중복됩니다`);
    seen.add(t);
  }
  return errors;
}

function validateSource(raw: unknown): string[] {
  if (!isRecord(raw)) return ["수집 원천이 아직 설정되지 않았습니다. 원천 종류를 다시 골라 주세요"];
  const errors: string[] = [];
  if (raw.kind === "sql") {
    const sql = typeof raw.sql === "string" ? raw.sql : "";
    if (sql.trim() === "") errors.push("SQL 을 입력하세요");
    else {
      const names = extractAllBindNames(sql);
      const system = names.filter((n) => n === "userId" || n === "deptCd");
      const user = names.filter((n) => !RESERVED_PARAM_NAMES.includes(n));
      if (system.length > 0) errors.push(`수집에는 사용자가 없어 ${system.map((n) => `:${n}`).join("·")} 를 쓸 수 없습니다`);
      if (user.length > 0) errors.push(`수집 SQL 에는 사용자 입력 조건(${user.map((n) => `:${n}`).join(", ")})을 쓸 수 없습니다`);
    }
    const value = typeof raw.valueField === "string" ? raw.valueField : "";
    if (value.trim() === "") errors.push("값 컬럼을 입력하세요");
    else if (value.length > FIELD_MAX) errors.push(`값 컬럼은 ${FIELD_MAX}자 이하로 입력하세요`);
    const key = raw.keyField;
    if (key !== undefined && key !== null && (typeof key !== "string" || key.length > FIELD_MAX)) {
      errors.push(`항목 컬럼은 ${FIELD_MAX}자 이하로 입력하세요`);
    }
  } else if (raw.kind === "http") {
    const url = typeof raw.url === "string" ? raw.url : "";
    const e = urlError(url);
    if (e) errors.push(e);
    const items = Array.isArray(raw.items) ? raw.items : [];
    if (items.length === 0) errors.push(`수집 항목을 1~${HTTP_ITEMS_MAX}개 넣으세요`);
    else if (items.length > HTTP_ITEMS_MAX) errors.push(`수집 항목은 최대 ${HTTP_ITEMS_MAX}개까지 둘 수 있습니다`);
    const keys = new Set<string>();
    items.forEach((item, i) => {
      const at = `수집 항목 ${i + 1}번`;
      const rec = isRecord(item) ? item : {};
      const key = typeof rec.key === "string" ? rec.key : "";
      if (key.trim() === "") errors.push(`${at}의 이름을 입력하세요`);
      else if (key.length > ITEM_KEY_MAX) errors.push(`${at}의 이름은 ${ITEM_KEY_MAX}자 이하로 입력하세요`);
      else if (keys.has(key)) errors.push(`${at}의 이름 「${key}」 이 중복됩니다`);
      if (key !== "") keys.add(key);
      const pe = pathError(typeof rec.path === "string" ? rec.path : "");
      if (pe) errors.push(`${at}의 ${pe}`);
    });
  } else if (raw.kind === "exchange") {
    const list = Array.isArray(raw.currencies) ? raw.currencies : [];
    if (list.length === 0) errors.push(`통화를 1~${CURRENCIES_MAX}개 고르세요`);
    else if (list.length > CURRENCIES_MAX) errors.push(`통화는 최대 ${CURRENCIES_MAX}개까지 고를 수 있습니다`);
    const seen = new Set<string>();
    for (const c of list) {
      const t = typeof c === "string" ? c : String(c);
      if (t === "KRW") errors.push("기준 통화(KRW)는 대상 통화로 고를 수 없습니다");
      else if (typeof c !== "string" || !CUR_RE.test(c)) errors.push(`통화 코드가 올바르지 않습니다: ${t}`);
      else if (seen.has(c)) errors.push(`통화 ${c} 가 중복됩니다`);
      seen.add(t);
    }
  } else {
    errors.push("원천 종류를 SQL·HTTP JSON·환율 중에서 고르세요");
  }
  return errors;
}

function validateShow(raw: unknown): string[] {
  if (raw === undefined || raw === null) return [];
  if (!isRecord(raw)) return ["표시 설정 형식이 올바르지 않습니다"];
  const errors: string[] = [];
  const days = raw.days;
  if (days !== undefined && days !== null && (!isIntegerNumber(days) || days < SHOW_DAYS_MIN || days > SHOW_DAYS_MAX)) {
    errors.push(`표시 기간은 ${SHOW_DAYS_MIN}~${SHOW_DAYS_MAX}일의 정수로 입력하세요`);
  }
  const unit = raw.unit;
  if (unit !== undefined && unit !== null && (typeof unit !== "string" || unit.length > UNIT_MAX)) {
    errors.push(`단위는 공백을 포함해 ${UNIT_MAX}자 이하로 입력하세요`);
  }
  return errors;
}

/** 칸 묶음별 검사 — 편집기가 각 칸 아래에 보인다. */
export function collectErrors(raw: unknown): CollectErrors {
  const c = isRecord(raw) ? raw : {};
  const kind = isRecord(c.source) ? c.source.kind : undefined;
  return { schedule: validateSchedule(c.schedule, kind), source: validateSource(c.source), show: validateShow(c.show) };
}

/** 편집기 검사(저장 막기용) — 빈 배열이면 저장 가능. 서버 규칙(스펙 §2)과 같은 한도. */
export function validateCollectConfig(raw: unknown): string[] {
  const e = collectErrors(raw);
  return [...e.schedule, ...e.source, ...e.show];
}
