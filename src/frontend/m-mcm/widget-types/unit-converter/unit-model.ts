/**
 * 단위 계산기 유형의 순수 로직 — 정의 설정 읽기·검사, 화면 값 계산, 브라우저 기억(localStorage) 값의 직렬화·검증.
 * 렌더러(renderer.tsx)·편집기(editor.tsx)는 이 파일과 units.ts·unit-format.ts 만 부른다.
 * 저장소(window.localStorage) 접근 자체는 unit-storage.ts 가 try/catch 로 감싸서 한다 — 여기서는 문자열만 다룬다.
 */
import type { Dec } from "@dk-oasis/shared/evalex";

import {
  CATEGORIES,
  CATEGORY_IDS,
  convertAll,
  findUnit,
  getCategory,
  isBelowAbsoluteZero,
  isCategoryId,
  type CategoryDef,
  type CategoryId,
} from "./units";
import {
  formatExact,
  formatNumber,
  INVALID_NUMBER_TEXT,
  MAX_INPUT_LENGTH,
  NO_VALUE_TEXT,
  parseNumberInput,
  TOO_LARGE_TEXT,
  TOO_SMALL_TEXT,
} from "./unit-format";

/* ------------------------------------------------------------------ 정의 설정 */

/** 정의 설정(TB_MCM_WIDGET_DEF.CONFIG_JSON). categories 가 비었거나 없으면 전체 분류를 보인다. */
export interface UnitConverterConfig {
  categories: string[];
  defaultCategory: string;
}

/** 초기 설정(type.meta.ts initialConfig 와 같다 — 시험이 같음을 확인). */
export const UNIT_DEFAULT_CONFIG: UnitConverterConfig = { categories: [], defaultCategory: "length" };

/** 화면이 쓰는 읽은 값 — categories 는 표 순서의 알려진 id(비어 있지 않음), defaultCategory 는 그 안의 값. */
export interface UnitConfig {
  categories: CategoryId[];
  defaultCategory: CategoryId;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** 목록 값 → 알려진 분류 id 를 표 순서로(중복·모르는 값 제거). 목록이 아니면 빈 목록. */
export function readUnitSelection(raw: unknown): CategoryId[] {
  const list = isRecord(raw) && Array.isArray(raw.categories) ? raw.categories : [];
  return CATEGORY_IDS.filter((id) => list.includes(id));
}

/** 보일 분류 안에서 쓸 기본 분류 — 원하는 값이 보일 분류 안에 있으면 그것, 아니면 length, 그것도 없으면 첫 분류. */
export function pickDefaultCategory(visible: readonly CategoryId[], preferred?: unknown): CategoryId {
  if (isCategoryId(preferred) && visible.includes(preferred)) return preferred;
  return visible.includes("length") ? "length" : visible[0];
}

/**
 * 정의 설정(CONFIG_JSON 파싱값) → 화면 값. 빠지거나 틀린 값은 기본값으로 바로잡는다.
 * categories 가 비었거나 없거나 알려진 id 가 하나도 없으면 전체, defaultCategory 가 틀리거나 보일 분류 밖이면 length(없으면 첫 분류).
 */
export function readUnitConfig(definition: unknown): UnitConfig {
  const selected = readUnitSelection(definition);
  const categories = selected.length > 0 ? selected : [...CATEGORY_IDS];
  const preferred = isRecord(definition) ? definition.defaultCategory : undefined;
  return { categories, defaultCategory: pickDefaultCategory(categories, preferred) };
}

export const UNIT_CATEGORIES_TYPE_ERROR = "보일 분류(categories)는 분류 id 목록이어야 합니다.";
export const UNIT_DEFAULT_TYPE_ERROR = "기본 분류(defaultCategory)는 분류 id 문자열이어야 합니다.";
export const unitUnknownCategoryError = (id: unknown): string => `알 수 없는 분류입니다: ${String(id)}`;
export const UNIT_DEFAULT_OUTSIDE_ERROR = "기본 분류는 보일 분류 안에서 골라야 합니다.";

/**
 * 편집기 검사(저장 막기용 오류 목록). 읽은 값이 아니라 받은 원본을 검사한다 — 바로잡힌 값 뒤에 틀린 값이 숨지 않게.
 * categories·defaultCategory 가 빠진 것은 오류가 아니다(전체·length 로 읽는다). 모르는 분류 id, 기본 분류가 보일 분류 밖이면 오류.
 */
export function validateUnitConfig(raw: unknown): string[] {
  const r = isRecord(raw) ? raw : {};
  const errors: string[] = [];
  let visible: readonly CategoryId[] = CATEGORY_IDS;

  if (r.categories !== undefined && r.categories !== null) {
    if (!Array.isArray(r.categories)) {
      errors.push(UNIT_CATEGORIES_TYPE_ERROR);
    } else {
      const unknown = [...new Set(r.categories.filter((id) => !isCategoryId(id)).map(String))];
      for (const id of unknown) errors.push(unitUnknownCategoryError(id));
      const known = readUnitSelection(r);
      if (known.length > 0) visible = known;
    }
  }

  const def = r.defaultCategory;
  if (def !== undefined && def !== null && def !== "") {
    if (typeof def !== "string") errors.push(UNIT_DEFAULT_TYPE_ERROR);
    else if (!isCategoryId(def)) errors.push(unitUnknownCategoryError(def));
    else if (!visible.includes(def)) errors.push(UNIT_DEFAULT_OUTSIDE_ERROR);
  }
  return errors;
}

export const UNIT_EDITOR_ALL_NOTE = "모든 분류를 보입니다. 분류가 새로 늘어도 자동으로 보입니다.";
export const unitEditorCountNote = (n: number): string => `${n}개 분류를 보입니다.`;

/** 고른 분류 → 저장할 목록. 알려진 분류만 표 순서로 하고, 비었거나 전부 골랐으면 `[]`(= 전체 — 분류가 늘어도 보인다). */
export function normalizeSelection(selected: readonly CategoryId[]): CategoryId[] {
  const categories = CATEGORY_IDS.filter((id) => selected.includes(id));
  return categories.length === CATEGORY_IDS.length ? [] : categories;
}

/** 편집기 선택칸이 올리는 설정 — 보일 분류는 normalizeSelection, 기본 분류는 보일 분류 안으로 맞춘다. */
export function buildUnitConfig(selected: readonly CategoryId[], defaultCategory: unknown): UnitConverterConfig {
  const categories = normalizeSelection(selected);
  const visible = categories.length > 0 ? categories : CATEGORY_IDS;
  return { categories, defaultCategory: pickDefaultCategory(visible, defaultCategory) };
}

/**
 * 편집기 체크박스가 올리는 설정 — 보일 분류만 바꾸고 기본 분류는 받은 값 그대로 둔다(틀린 값을 조용히 고치지 않는다 — 검사 오류로 알리고
 * 사용자가 기본 분류를 고를 때 바로잡는다). 기본 분류가 아예 빠져 있으면 새 보일 분류 기준의 읽은 값으로 채운다.
 */
export function changeUnitSelection(raw: unknown, selected: readonly CategoryId[]): UnitConverterConfig {
  const categories = normalizeSelection(selected);
  const visible = categories.length > 0 ? categories : CATEGORY_IDS;
  const rawDefault = isRecord(raw) ? raw.defaultCategory : undefined;
  const missing = rawDefault === undefined || rawDefault === null || rawDefault === "";
  return { categories, defaultCategory: missing ? pickDefaultCategory(visible, undefined) : (rawDefault as string) };
}

/* ------------------------------------------------------------------ 화면 값 계산 */

export const UNIT_ABSOLUTE_ZERO_WARNING = "절대영도(-273.15 °C)보다 낮은 온도입니다. 계산만 합니다.";

export interface UnitRow {
  id: string;
  label: string;
  /** 서식을 입힌 값(쉼표 포함). 입력이 숫자가 아니면 「–」. */
  text: string;
}

/** 계산이 안 된 까닭 — empty(빈 입력)·invalid(숫자가 아님)·tooLarge·tooSmall(지수가 너무 큼·작음, 또는 결과가 무한대). */
export type UnitProblem = "empty" | "invalid" | "tooLarge" | "tooSmall";

export interface UnitView {
  /** 입력이 숫자이고 계산이 됐다. */
  ok: boolean;
  /** ok 가 아닐 때의 까닭(ok 면 null). */
  problem: UnitProblem | null;
  /** 결과 칸에 보일 글 — 숫자가 아니면 「숫자를 입력하세요」, 너무 크거나 작으면 「값이 너무 큽니다」·「값이 너무 작습니다」. */
  resultText: string;
  /** 복사에 쓰는 쉼표 없는 결과(10자리 — 화면에 보이는 값, ok 가 아니면 빈 글). */
  plainText: string;
  /** [⇄] 가 입력으로 잇는 반올림하지 않은 정밀 값(유효숫자 17자리, 쉼표 없음). ok 가 아니거나 입력으로 못 읽는 크기면 빈 글. */
  exactText: string;
  /** 분류의 모든 단위로 환산한 목록(표 순서). */
  rows: UnitRow[];
  /** 절대영도 아래 온도 — 계산은 하되 경고를 보인다. */
  belowAbsoluteZero: boolean;
}

const PROBLEM_TEXT: Record<UnitProblem, string> = {
  empty: INVALID_NUMBER_TEXT,
  invalid: INVALID_NUMBER_TEXT,
  tooLarge: TOO_LARGE_TEXT,
  tooSmall: TOO_SMALL_TEXT,
};

/**
 * 환산 결과 중 유한하지 않은 값이 있으면 그 까닭. 무한대(±)는 tooLarge, NaN 은 invalid. 모두 유한하면 null.
 * 입력 지수를 1000 으로 막아 두어 보통은 닿지 않는 방어선이다(decimal.js 지수 한계 ±9e15 를 넘는 결과가 `Infinity` 로 보이고 복사가 켜지는 것을 막는다).
 */
export function findNonFinite(values: readonly Dec[]): UnitProblem | null {
  let problem: UnitProblem | null = null;
  for (const v of values) {
    if (v.isNaN()) return "invalid";
    if (!v.isFinite()) problem = "tooLarge";
  }
  return problem;
}

function failedView(cat: CategoryDef, problem: UnitProblem): UnitView {
  return {
    ok: false,
    problem,
    resultText: PROBLEM_TEXT[problem],
    plainText: "",
    exactText: "",
    rows: cat.units.map((u) => ({ id: u.id, label: u.label, text: NO_VALUE_TEXT })),
    belowAbsoluteZero: false,
  };
}

/** 입력 글 + 분류·단위 → 결과 칸·목록·경고. */
export function computeView(text: string, category: CategoryId, fromId: string, toId: string): UnitView {
  const cat = getCategory(category);
  const parsed = parseNumberInput(text);
  if (!parsed.ok) return failedView(cat, parsed.reason);
  const all = convertAll(parsed.value, category, fromId);
  const nonFinite = findNonFinite(all.map((c) => c.value));
  if (nonFinite) return failedView(cat, nonFinite);
  const target = all.find((c) => c.unit.id === toId) ?? all[0];
  return {
    ok: true,
    problem: null,
    resultText: formatNumber(target.value),
    plainText: formatNumber(target.value, false),
    exactText: formatExact(target.value),
    rows: all.map((c) => ({ id: c.unit.id, label: c.unit.label, text: formatNumber(c.value) })),
    belowAbsoluteZero: isBelowAbsoluteZero(parsed.value, category, fromId),
  };
}

/* ------------------------------------------------------------------ 화면 상태·브라우저 기억 */

export interface UnitPair {
  from: string;
  to: string;
}

/** 렌더러 상태 — 분류별로 고른 단위를 따로 들고 있어 분류를 오가도 각자의 단위가 돌아온다. */
export interface UnitState {
  category: string;
  units: Record<string, UnitPair>;
  /** 입력 칸 글(쉼표·공백 포함 원문). */
  text: string;
}

export const UNIT_DEFAULT_TEXT = "1";

/** 사용자·위젯 인스턴스별 기억 키 접두사. 위젯 작업 영역의 `dmes:widget:lastTab:{userId}` 와 같은 계열이다. */
export const UNIT_STORAGE_PREFIX = "dmes:widget:unit-converter:";
/** 관리 화면 미리보기의 위젯·인스턴스 ID — 실제 배치가 아니므로 기억하지 않는다. */
const PREVIEW_WIDGET_ID = "def.preview";
const PREVIEW_INST_ID = "preview";

/** 기억할 수 있는 자리인가 — 인스턴스가 있고 관리 화면 미리보기가 아니다. */
export function isRememberable(widgetId: string | undefined, instanceId: string | undefined): boolean {
  return !!instanceId && instanceId !== PREVIEW_INST_ID && widgetId !== PREVIEW_WIDGET_ID;
}

/**
 * 기억 키 `dmes:widget:unit-converter:{userId}:{instanceId}`. 같은 PC 를 쓰는 다른 사용자가 관리자가 정한 같은 기본 배치(같은 instanceId)를 열어도
 * 값이 섞이지 않게 사용자를 키에 넣는다. 사용자를 모르거나(빈 글) 기억할 수 없는 자리면 null(기억하지 않는다).
 */
export function storageKey(widgetId: string | undefined, instanceId: string | undefined, userId: string | null | undefined): string | null {
  if (!userId || !isRememberable(widgetId, instanceId)) return null;
  return `${UNIT_STORAGE_PREFIX}${userId}:${instanceId}`;
}

/** 분류 안에서 쓸 단위 쌍 — 고른 값이 그 분류의 단위가 아니면 분류의 기본 단위로 바로잡는다. */
export function resolveUnits(category: CategoryId, saved: Partial<UnitPair> | undefined): UnitPair {
  const cat = getCategory(category);
  const from = saved?.from;
  const to = saved?.to;
  return {
    from: typeof from === "string" && findUnit(category, from) ? from : cat.defaultFrom,
    to: typeof to === "string" && findUnit(category, to) ? to : cat.defaultTo,
  };
}

/** 지금 보일 분류 — 상태의 분류가 보일 분류 안이면 그것, 설정에서 빠졌으면 기본 분류. */
export function resolveCategory(stateCategory: unknown, config: UnitConfig): CategoryId {
  return isCategoryId(stateCategory) && config.categories.includes(stateCategory) ? stateCategory : config.defaultCategory;
}

/**
 * 처음 상태 — 기억한 값이 있으면 그것을, 없으면 설정의 기본 분류·기본 단위·「1」.
 * 기억한 분류가 설정에서 빠졌어도 상태에는 그대로 둔다(화면은 resolveCategory 로 그때그때 기본 분류를 보인다). 그래야 입력만 고쳐도
 * 기억한 분류가 기본 분류로 덮이지 않고, 설정에 그 분류가 다시 들어오면 돌아온다.
 */
export function initialState(config: UnitConfig, stored: UnitState | null): UnitState {
  return {
    category: stored?.category ?? config.defaultCategory,
    units: stored?.units ?? {},
    text: stored?.text ?? UNIT_DEFAULT_TEXT,
  };
}

export function serializeState(state: UnitState): string {
  return JSON.stringify({ v: 1, category: state.category, units: state.units, text: state.text });
}

/**
 * localStorage 에서 읽은 글 → 상태. 깨진 글·모르는 분류·모르는 단위는 버린다(null 이거나 그 부분만 기본값).
 * 분류가 보일 분류 안인지는 여기서 보지 않는다(설정이 바뀔 수 있으므로 resolveCategory 가 그때그때 본다).
 */
export function parseStoredState(raw: string | null | undefined): UnitState | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(data) || !isCategoryId(data.category)) return null;
  const units: Record<string, UnitPair> = {};
  const savedUnits = isRecord(data.units) ? data.units : {};
  for (const cat of CATEGORIES) {
    const u = savedUnits[cat.id];
    if (!isRecord(u)) continue;
    // 한쪽만 알려진 단위여도 나머지는 기본 단위로 채워 둔다.
    units[cat.id] = resolveUnits(cat.id, u as Partial<UnitPair>);
  }
  const text = typeof data.text === "string" ? data.text.slice(0, MAX_INPUT_LENGTH) : UNIT_DEFAULT_TEXT;
  return { category: data.category, units, text };
}
