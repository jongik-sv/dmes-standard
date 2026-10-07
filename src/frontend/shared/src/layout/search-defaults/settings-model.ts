/**
 * 조회 기본값 설정 창의 순수 모델(설계 2026-10-07-search-defaults §8.3·§4) — 화면 없이 시험한다.
 *
 * - 등록된 칸 목록과 저장된 규칙으로 표의 줄을 만들고(기간 짝은 한 줄), 고친 줄을 다시 규칙으로 바꾼다.
 * - 이름표로 나타낼 수 없는 규칙(샘플 JSON 으로 넣은 monthStart+days 등)은 「사용자 지정」 줄로 두고, 고치지 않으면 그대로 저장한다.
 * - 저장은 화면(pageId) 단위로 행 전체를 바꾸므로, 이 영역의 칸 키만 바꾸고 나머지 규칙(다른 영역·지금 없는 조건부 칸)은 남긴다.
 */
import {
  RANGE_PRESETS,
  resolveSearchDefault,
  type RelativeDateBase,
  type SearchDefaultRule,
  type SearchValueType,
} from "./rule";
import { getPageSearchDefaults, resetSearchDefaults, saveSearchDefaults, type PageRules, type SearchDefaultSaveRow } from "./store";
import type { SearchDefaultsFieldInfo } from "./area";

export type SettingsField = SearchDefaultsFieldInfo & { storageKey: string };

/** 상대 날짜 한 쪽 — 이름표 id 와 N. */
export interface RelativePick {
  presetId: RelativePresetId;
  n: number;
}

export type RelativePresetId =
  | "today"
  | "yesterday"
  | "daysAgo"
  | "daysAfter"
  | "monthStart"
  | "monthEnd"
  | "prevMonthStart"
  | "prevMonthEnd"
  | "monthsAgo";

/** 설정 창의 상대 날짜 이름표(설계 §4.3). needsN 이면 N 입력을 함께 보인다. */
export const SETTINGS_RELATIVE_OPTIONS: ReadonlyArray<{ id: RelativePresetId; label: string; needsN?: "days" | "months" }> = [
  { id: "today", label: "당일" },
  { id: "yesterday", label: "전일" },
  { id: "daysAgo", label: "N일 전", needsN: "days" },
  { id: "daysAfter", label: "N일 후", needsN: "days" },
  { id: "monthStart", label: "당월 1일" },
  { id: "monthEnd", label: "당월 말일" },
  { id: "prevMonthStart", label: "전월 1일" },
  { id: "prevMonthEnd", label: "전월 말일" },
  { id: "monthsAgo", label: "N개월 전 같은 날", needsN: "months" },
];

/** N 의 범위 — 일은 0~366(설계 §4.3), 개월은 1~120(규칙 검사 상한 안). */
export const N_LIMITS = { days: { min: 0, max: 366 }, months: { min: 1, max: 120 } } as const;

type RelativeRule = Extract<SearchDefaultRule, { kind: "relative" }>;

/** 상대 날짜 규칙 → 이름표. 나타낼 수 없으면 null. months·days 의 undefined 와 0 은 같다. */
export function relativeToPick(rule: RelativeRule): RelativePick | null {
  const m = rule.months ?? 0;
  const d = rule.days ?? 0;
  if (rule.base === "today") {
    if (m === 0) {
      if (d === 0) return { presetId: "today", n: 0 };
      if (d === -1) return { presetId: "yesterday", n: 0 };
      return d < 0 ? { presetId: "daysAgo", n: -d } : { presetId: "daysAfter", n: d };
    }
    if (d === 0 && m < 0) return { presetId: "monthsAgo", n: -m };
    return null;
  }
  if (d !== 0) return null;
  if (rule.base === "monthStart") return m === 0 ? { presetId: "monthStart", n: 0 } : m === -1 ? { presetId: "prevMonthStart", n: 0 } : null;
  if (rule.base === "monthEnd") return m === 0 ? { presetId: "monthEnd", n: 0 } : m === -1 ? { presetId: "prevMonthEnd", n: 0 } : null;
  return null;
}

/** 이름표 → 상대 날짜 규칙. 0 인 months·days 는 적지 않는다. */
export function pickToRelative(pick: RelativePick): RelativeRule {
  const r = (base: RelativeDateBase, months = 0, days = 0): RelativeRule => ({
    kind: "relative",
    base,
    ...(months ? { months } : {}),
    ...(days ? { days } : {}),
  });
  switch (pick.presetId) {
    case "today":
      return r("today");
    case "yesterday":
      return r("today", 0, -1);
    case "daysAgo":
      return r("today", 0, -pick.n);
    case "daysAfter":
      return r("today", 0, pick.n);
    case "monthStart":
      return r("monthStart");
    case "monthEnd":
      return r("monthEnd");
    case "prevMonthStart":
      return r("monthStart", -1);
    case "prevMonthEnd":
      return r("monthEnd", -1);
    case "monthsAgo":
      return r("today", -pick.n);
  }
}

const sameRel = (a: RelativeRule, b: { base: RelativeDateBase; months?: number; days?: number }) =>
  a.base === b.base && (a.months ?? 0) === (b.months ?? 0) && (a.days ?? 0) === (b.days ?? 0);

/** 두 상대 날짜 규칙이 기간 묶음 하나와 같으면 그 id. */
export function matchRangePreset(from: RelativeRule, to: RelativeRule): string | null {
  return RANGE_PRESETS.find((p) => sameRel(from, p.from) && sameRel(to, p.to))?.id ?? null;
}

export type SingleMode = "none" | "fixed" | "relative" | "last" | "custom";
export type PairMode = "none" | "range" | "fixed" | "relative" | "last" | "custom";

/** 칸 하나(또는 기간의 한 쪽) 편집 상태. */
export interface SideState {
  fixed: string;
  rel: RelativePick;
}

export interface SingleRow {
  kind: "single";
  field: SettingsField;
  mode: SingleMode;
  side: SideState;
  /** 불러온 규칙이 이름표로 나타낼 수 없을 때 — mode 가 custom 이면 그대로 저장한다. */
  custom: SearchDefaultRule | null;
}

export interface PairRow {
  kind: "pair";
  from: SettingsField;
  to: SettingsField;
  mode: PairMode;
  rangeId: string;
  fromSide: SideState;
  toSide: SideState;
  custom: { from: SearchDefaultRule | null; to: SearchDefaultRule | null } | null;
}

export type SettingsRow = SingleRow | PairRow;

const emptySide = (): SideState => ({ fixed: "", rel: { presetId: "today", n: 1 } });

function sideFromRule(rule: SearchDefaultRule | undefined): SideState {
  const s = emptySide();
  if (!rule) return s;
  if (rule.kind === "fixed") s.fixed = rule.value;
  if (rule.kind === "relative") {
    const p = relativeToPick(rule);
    if (p) s.rel = p;
  }
  return s;
}

/** 칸의 값 종류에 이 규칙을 쓸 수 있고 이름표로 나타낼 수 있는가. */
function singleModeOf(rule: SearchDefaultRule | undefined, valueType: SearchValueType): { mode: SingleMode; custom: SearchDefaultRule | null } {
  if (!rule) return { mode: "none", custom: null };
  if (rule.kind === "fixed") return { mode: "fixed", custom: null };
  if (rule.kind === "last") return { mode: "last", custom: null };
  if (valueType === "date" && relativeToPick(rule)) return { mode: "relative", custom: null };
  return { mode: "custom", custom: rule };
}

/** 저장 키로 스코프 붙은 상대 칸 키를 만든다(짝의 partnerKey 에는 scope 가 없다). */
export const scopedKey = (scope: string, key: string) => (scope ? `${scope}.${key}` : key);

/** 등록된 칸과 저장된 규칙으로 표의 줄을 만든다. 기간 짝은 From 자리에 한 줄로 묶는다. */
export function buildSettingsRows(fields: SettingsField[], rules: PageRules, scope: string): SettingsRow[] {
  const byKey = new Map(fields.map((f) => [f.storageKey, f]));
  const used = new Set<string>();
  const rows: SettingsRow[] = [];
  for (const f of fields) {
    if (used.has(f.storageKey)) continue;
    const pair = f.pair;
    const partner = pair?.partnerKey ? byKey.get(scopedKey(scope, pair.partnerKey)) : undefined;
    if (pair && partner && f.valueType === "date" && partner.valueType === "date") {
      const from = pair.role === "from" ? f : partner;
      const to = pair.role === "from" ? partner : f;
      used.add(from.storageKey);
      used.add(to.storageKey);
      rows.push(pairRowOf(from, to, rules[from.storageKey], rules[to.storageKey]));
      continue;
    }
    used.add(f.storageKey);
    const rule = rules[f.storageKey];
    const { mode, custom } = singleModeOf(rule, f.valueType);
    rows.push({ kind: "single", field: f, mode, side: sideFromRule(rule), custom });
  }
  return rows;
}

function pairRowOf(from: SettingsField, to: SettingsField, fr: SearchDefaultRule | undefined, tr: SearchDefaultRule | undefined): PairRow {
  const base: PairRow = { kind: "pair", from, to, mode: "none", rangeId: RANGE_PRESETS[0].id, fromSide: sideFromRule(fr), toSide: sideFromRule(tr), custom: null };
  if (!fr && !tr) return base;
  if (fr?.kind === "last" && tr?.kind === "last") return { ...base, mode: "last" };
  if (fr?.kind === "fixed" && tr?.kind === "fixed") return { ...base, mode: "fixed" };
  if (fr?.kind === "relative" && tr?.kind === "relative") {
    const id = matchRangePreset(fr, tr);
    if (id) return { ...base, mode: "range", rangeId: id };
    if (relativeToPick(fr) && relativeToPick(tr)) return { ...base, mode: "relative" };
  }
  return { ...base, mode: "custom", custom: { from: fr ?? null, to: tr ?? null } };
}

/** 한 쪽 편집 상태 → 규칙. 고정 날짜가 비면 규칙 없음. */
function sideRule(mode: "fixed" | "relative" | "last", side: SideState, valueType: SearchValueType): SearchDefaultRule | null {
  if (mode === "last") return { kind: "last" };
  if (mode === "relative") return pickToRelative(side.rel);
  // 날짜·텍스트의 빈 고정 값은 「항상 비움」 이라 코드 기본값과 같은 뜻이 아니다 — 그래도 텍스트는 사용자가 고른 그대로 둔다.
  if (valueType === "date" && side.fixed === "") return null;
  return { kind: "fixed", value: side.fixed };
}

/** 줄 → 저장 키별 규칙(null 은 규칙 없음). */
export function rowRules(row: SettingsRow): Array<[string, SearchDefaultRule | null]> {
  if (row.kind === "single") {
    const k = row.field.storageKey;
    if (row.mode === "none") return [[k, null]];
    if (row.mode === "custom") return [[k, row.custom]];
    return [[k, sideRule(row.mode, row.side, row.field.valueType)]];
  }
  const fk = row.from.storageKey;
  const tk = row.to.storageKey;
  switch (row.mode) {
    case "none":
      return [[fk, null], [tk, null]];
    case "custom":
      return [[fk, row.custom?.from ?? null], [tk, row.custom?.to ?? null]];
    case "range": {
      const p = RANGE_PRESETS.find((x) => x.id === row.rangeId) ?? RANGE_PRESETS[0];
      return [[fk, { kind: "relative", ...p.from }], [tk, { kind: "relative", ...p.to }]];
    }
    default:
      return [[fk, sideRule(row.mode, row.fromSide, "date")], [tk, sideRule(row.mode, row.toSide, "date")]];
  }
}

export interface RowCheck {
  /** 오늘 기준 계산 결과(기간은 「시작 ~ 끝」). */
  preview: string;
  /** 저장을 막는 문제. */
  error?: string;
  /** 저장은 되지만 알릴 점(선택지에 없는 값). */
  warning?: string;
}

const LAST_NONE = "없음";

/** 줄의 오늘 기준 미리보기와 검사. lastValues 는 이 화면의 마지막 조회값(저장 키별). */
export function checkRow(row: SettingsRow, lastValues: Record<string, string>, now: Date): RowCheck {
  const resolveOne = (f: SettingsField, rule: SearchDefaultRule | null): string | undefined =>
    rule ? resolveSearchDefault(rule, { valueType: f.valueType, optionValues: f.options?.map((o) => o.value), lastValue: lastValues[f.storageKey], now }) : undefined;
  const label = (f: SettingsField, v: string | undefined) => (v === undefined ? "" : f.options?.find((o) => o.value === v)?.label ?? v);
  const rules = rowRules(row);
  if (row.kind === "single") {
    const rule = rules[0][1];
    if (!rule) return { preview: "" };
    const v = resolveOne(row.field, rule);
    if (rule.kind === "last") return { preview: v === undefined ? LAST_NONE : label(row.field, v) || "(빈 값)" };
    if (rule.kind === "fixed" && v === undefined) {
      if (row.field.valueType === "date") return { preview: "", error: "날짜 형식이 아닙니다(YYYY-MM-DD)" };
      return { preview: rule.value, warning: "선택지에 없는 값 — 넣지 않습니다" };
    }
    return { preview: v === "" ? "(빈 값 · 전체)" : label(row.field, v) };
  }
  const [fr, tr] = [rules[0][1], rules[1][1]];
  if (!fr && !tr) return { preview: "" };
  const fv = resolveOne(row.from, fr);
  const tv = resolveOne(row.to, tr);
  const show = (rule: SearchDefaultRule | null, v: string | undefined) => (!rule ? "-" : v === undefined ? (rule.kind === "last" ? LAST_NONE : "?") : v || "(빈 값)");
  const preview = `${show(fr, fv)} ~ ${show(tr, tv)}`;
  if (row.mode === "fixed" && ((fr && fv === undefined) || (tr && tv === undefined))) return { preview, error: "날짜 형식이 아닙니다(YYYY-MM-DD)" };
  if (fv && tv && fr?.kind !== "last" && tr?.kind !== "last" && fv > tv) return { preview, error: "시작이 끝보다 늦습니다" };
  return { preview };
}

/**
 * 이 영역의 새 규칙을 화면 전체 규칙에 합친다 — 이 영역 칸 키(areaKeys)는 새 값으로 바꾸거나 빼고, 나머지는 그대로 둔다.
 * labels 는 이 영역 칸의 이름(서버 행의 fieldLabel). 다른 칸 행의 이름은 브라우저가 모르므로 비운다.
 */
export function mergeAreaRules(
  pageRules: PageRules,
  areaKeys: ReadonlySet<string>,
  next: ReadonlyArray<[string, SearchDefaultRule | null]>,
  fields: ReadonlyMap<string, SettingsField>,
): SearchDefaultSaveRow[] {
  const out: SearchDefaultSaveRow[] = [];
  for (const [key, rule] of Object.entries(pageRules)) {
    if (!areaKeys.has(key)) out.push({ fieldKey: key, rule });
  }
  for (const [key, rule] of next) {
    if (!rule) continue;
    const f = fields.get(key);
    out.push({ fieldKey: key, rule, fieldLabel: f?.label ?? null, fieldMeta: f?.meta ?? null });
  }
  return out;
}

/** 「지금 조건을 기본값으로」 — 칸의 지금 값을 고정 값 규칙으로. 빈 텍스트·날짜는 규칙을 두지 않는다(select·radio 의 빈 값은 「전체」 라 남긴다). */
export function currentValueRules(fields: ReadonlyArray<SettingsField & { value: string }>): Array<[string, SearchDefaultRule | null]> {
  return fields.map((f) => {
    if (f.value === "" && (f.valueType === "text" || f.valueType === "date")) return [f.storageKey, null];
    return [f.storageKey, { kind: "fixed", value: f.value }];
  });
}

/**
 * 이 영역의 규칙을 서버에 저장한다 — 화면 전체 규칙에 합쳐 savePage 하고, 합친 결과가 비면 resetPage 한다.
 * 메뉴의 「내 기본값 초기화」·설정 창 [이 화면 초기화] 는 next 를 모두 null 로 넘긴다.
 */
export async function saveAreaRules(
  userId: string,
  pageId: string,
  fields: ReadonlyArray<SettingsField>,
  next: ReadonlyArray<[string, SearchDefaultRule | null]>,
): Promise<void> {
  const areaKeys = new Set(fields.map((f) => f.storageKey));
  const rows = mergeAreaRules(getPageSearchDefaults(userId, pageId), areaKeys, next, new Map(fields.map((f) => [f.storageKey, f])));
  if (rows.length === 0) await resetSearchDefaults(userId, pageId);
  else await saveSearchDefaults(userId, pageId, rows);
}
