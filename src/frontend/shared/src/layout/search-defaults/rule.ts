/**
 * 조회 칸 사용자 기본값 — 규칙 모델과 계산 (순수 함수, 설계 2026-10-07-search-defaults-design §4).
 *
 * - 규칙은 칸 하나당 하나다. 「사용 안 함」 은 규칙을 저장하지 않는 것으로 표현한다.
 * - 상대 날짜는 브라우저 지역 시각의 오늘을 기준으로 계산한다(UTC 기반 toISOString 을 쓰지 않는다 — 자정 전후 하루가 밀린다).
 *   계산 순서: 기준일의 달을 months 만큼 옮김 → base 로 날을 정함(today 는 그 달 말일을 넘으면 말일로 줄임) → days 를 더함.
 * - 날짜 값의 형식은 shared DatePicker 와 같은 `YYYY-MM-DD` 다.
 */

/** 칸의 값 종류 — SearchField `type` 에서 정한다. */
export type SearchValueType = "text" | "select" | "radio" | "date";

export type RelativeDateBase = "today" | "monthStart" | "monthEnd";

export type SearchDefaultRule =
  | { kind: "fixed"; value: string }
  | { kind: "relative"; base: RelativeDateBase; months?: number; days?: number }
  | { kind: "last" };

export type SearchDefaultRuleKind = SearchDefaultRule["kind"];

/** 서버 검사와 같은 범위(설계 §5.3). */
export const RELATIVE_MONTHS_LIMIT = 120;
export const RELATIVE_DAYS_LIMIT = 3660;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const BASES: readonly RelativeDateBase[] = ["today", "monthStart", "monthEnd"];

function isInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v);
}

/** 모르는 꼴이면 null(그 칸은 규칙이 없는 것으로 본다). JSON 문자열이나 객체를 받는다. */
export function parseSearchDefaultRule(raw: unknown): SearchDefaultRule | null {
  let v: unknown = raw;
  if (typeof raw === "string") {
    try {
      v = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  switch (o.kind) {
    case "fixed":
      return typeof o.value === "string" ? { kind: "fixed", value: o.value } : null;
    case "last":
      return { kind: "last" };
    case "relative": {
      if (!BASES.includes(o.base as RelativeDateBase)) return null;
      const rule: { kind: "relative"; base: RelativeDateBase; months?: number; days?: number } = {
        kind: "relative",
        base: o.base as RelativeDateBase,
      };
      if (o.months !== undefined) {
        if (!isInt(o.months) || Math.abs(o.months) > RELATIVE_MONTHS_LIMIT) return null;
        if (o.months !== 0) rule.months = o.months;
      }
      if (o.days !== undefined) {
        if (!isInt(o.days) || Math.abs(o.days) > RELATIVE_DAYS_LIMIT) return null;
        if (o.days !== 0) rule.days = o.days;
      }
      return rule;
    }
    default:
      return null;
  }
}

/** 이 값 종류에서 쓸 수 있는 규칙인가(상대 날짜는 날짜 칸만). */
export function isRuleAllowed(rule: SearchDefaultRule, valueType: SearchValueType): boolean {
  return rule.kind !== "relative" || valueType === "date";
}

const pad = (n: number, len = 2) => String(n).padStart(len, "0");

/** 지역 시각 기준 `YYYY-MM-DD`. */
export function formatLocalIsoDate(d: Date): string {
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** `YYYY-MM-DD` 가 실제 있는 날짜인가(2026-02-30 은 아니다). */
export function isValidIsoDate(value: string): boolean {
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return false;
  return d <= new Date(y, mo, 0).getDate();
}

/** 상대 날짜 계산(설계 §4.3). now 는 기준 시각 — 지역 시각의 날짜만 쓴다. */
export function resolveRelativeDate(
  rule: { base: RelativeDateBase; months?: number; days?: number },
  now: Date,
): string {
  const months = rule.months ?? 0;
  const days = rule.days ?? 0;
  // 1) 달 옮기기 — 1일로 놓고 옮겨 말일 넘침(3월 31일 → 2월 31일 = 3월 3일)을 피한다.
  const shifted = new Date(now.getFullYear(), now.getMonth() + months, 1);
  const lastDay = new Date(shifted.getFullYear(), shifted.getMonth() + 1, 0).getDate();
  // 2) base 로 날 정하기
  let day: number;
  if (rule.base === "monthStart") day = 1;
  else if (rule.base === "monthEnd") day = lastDay;
  else day = Math.min(now.getDate(), lastDay);
  // 3) days 더하기 — Date 가 달·해 경계를 넘겨 준다.
  const result = new Date(shifted.getFullYear(), shifted.getMonth(), day + days);
  return formatLocalIsoDate(result);
}

export interface ResolveContext {
  valueType: SearchValueType;
  /** select·radio 선택지 값 — 고정 값이 이 안에 없으면 넣지 않는다. */
  optionValues?: readonly string[];
  /** 마지막 조회값(없으면 undefined). */
  lastValue?: string;
  now: Date;
}

/**
 * 규칙으로 넣을 값을 계산한다. 넣지 않아야 하면 undefined.
 * - 고정 값이 지금 선택지에 없으면(코드 폐기) 넣지 않는다. 날짜 칸의 고정 값·마지막 조회값이 날짜 꼴이 아니면 넣지 않는다(빈 값은 넣는다).
 */
export function resolveSearchDefault(rule: SearchDefaultRule, ctx: ResolveContext): string | undefined {
  if (!isRuleAllowed(rule, ctx.valueType)) return undefined;
  let value: string | undefined;
  if (rule.kind === "fixed") value = rule.value;
  else if (rule.kind === "last") value = ctx.lastValue;
  else value = resolveRelativeDate(rule, ctx.now);
  if (value === undefined) return undefined;
  if ((ctx.valueType === "select" || ctx.valueType === "radio") && ctx.optionValues && !ctx.optionValues.includes(value)) {
    return undefined;
  }
  if (ctx.valueType === "date" && value !== "" && !isValidIsoDate(value)) return undefined;
  return value;
}

/** 상대 날짜 이름표(설정 창·샘플용, 설계 §4.3). N 이 들어가는 것은 days·months 를 화면이 채운다. */
export const RELATIVE_DATE_PRESETS: ReadonlyArray<{ id: string; label: string; rule: { base: RelativeDateBase; months?: number; days?: number } }> = [
  { id: "today", label: "당일", rule: { base: "today" } },
  { id: "yesterday", label: "전일", rule: { base: "today", days: -1 } },
  { id: "monthStart", label: "당월 1일", rule: { base: "monthStart" } },
  { id: "monthEnd", label: "당월 말일", rule: { base: "monthEnd" } },
  { id: "prevMonthStart", label: "전월 1일", rule: { base: "monthStart", months: -1 } },
  { id: "prevMonthEnd", label: "전월 말일", rule: { base: "monthEnd", months: -1 } },
];

/** 기간 묶음 선택지(설계 §4.4) — From·To 규칙을 한꺼번에 채운다. */
export const RANGE_PRESETS: ReadonlyArray<{
  id: string;
  label: string;
  from: { base: RelativeDateBase; months?: number; days?: number };
  to: { base: RelativeDateBase; months?: number; days?: number };
}> = [
  { id: "today", label: "당일~당일", from: { base: "today" }, to: { base: "today" } },
  { id: "yesterday", label: "전일~전일", from: { base: "today", days: -1 }, to: { base: "today", days: -1 } },
  { id: "last7", label: "최근 7일", from: { base: "today", days: -6 }, to: { base: "today" } },
  { id: "last30", label: "최근 30일", from: { base: "today", days: -29 }, to: { base: "today" } },
  { id: "monthToDate", label: "당월(1일~당일)", from: { base: "monthStart" }, to: { base: "today" } },
  { id: "thisMonth", label: "당월 전체", from: { base: "monthStart" }, to: { base: "monthEnd" } },
  { id: "prevMonth", label: "전월 전체", from: { base: "monthStart", months: -1 }, to: { base: "monthEnd", months: -1 } },
];
