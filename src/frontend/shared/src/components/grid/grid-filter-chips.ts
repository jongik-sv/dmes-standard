/**
 * 「걸린 조건」 칩 — 빠른 검색어와 칸별 필터 조건을 짧은 글로 만든다(그리드 머리줄 아래 칩 줄이 보인다).
 *
 * - 이름: 빠른 검색은 「검색어」, 칸별 조건은 그 칸의 머리글 표시 이름(없으면 열 정의의 `header`, 그것도 없으면 칸 키).
 * - 값: ag-grid 필터 모델(text·number, 조건 2개 조합 포함)을 짧게 쓴다. 긴 값은 줄이고 전체 글은 칩의 툴팁(title)에 둔다.
 * - 이 파일은 ag-grid 필터 모델을 글로 바꾸는 순수 함수와, 그리드 api 에서 칩 목록을 뽑는 함수만 둔다(React 없음).
 */
import type { GridApi } from "ag-grid-community";

import type { GridFilterChip } from "./grid-panel-context";

/** 칩에 보일 값의 최대 글자 수 — 넘으면 「…」 로 줄인다(전체 글은 title). */
const CHIP_VALUE_MAX = 24;

/** 빠른 검색어 칩의 id. 칸별 조건 칩의 id 는 `col:{colId}`. */
export const QUICK_CHIP_ID = "quick";
export const COLUMN_CHIP_PREFIX = "col:";

/** 걸린 조건이 없을 때 쓰는 빈 목록 — `useSyncExternalStore` 의 getSnapshot 이 늘 같은 객체를 돌려주게. */
export const NO_FILTER_CHIPS: readonly GridFilterChip[] = Object.freeze([]);

interface SimpleModel {
  type?: string | null;
  filter?: unknown;
  filterTo?: unknown;
  dateFrom?: unknown;
  dateTo?: unknown;
  values?: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function valueText(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

/** 조건 하나(글자·숫자·날짜 필터 모델)를 짧게 쓴다. 알 수 없는 모양이면 null. */
function describeSimple(model: SimpleModel): string | null {
  const type = model.type ?? undefined;
  if (type === "blank") return "빈 값";
  if (type === "notBlank") return "값 있음";
  const raw = model.filter !== undefined ? model.filter : (model.dateFrom ?? undefined);
  const v = valueText(raw);
  if (type === "inRange") {
    const to = valueText(model.filterTo !== undefined ? model.filterTo : model.dateTo);
    return `${v} ~ ${to}`;
  }
  if (v === "") return null;
  switch (type) {
    case "equals":
      return `= ${v}`;
    case "notEqual":
      return `≠ ${v}`;
    case "lessThan":
      return `< ${v}`;
    case "lessThanOrEqual":
      return `≤ ${v}`;
    case "greaterThan":
      return `> ${v}`;
    case "greaterThanOrEqual":
      return `≥ ${v}`;
    case "notContains":
      return `포함 안 함 ${v}`;
    case "startsWith":
      return `${v} 시작`;
    case "endsWith":
      return `${v} 끝`;
    case "contains":
    default:
      return v;
  }
}

/**
 * 칸 하나의 필터 모델을 짧은 글로 쓴다. 조건 2개 조합은 「A 그리고 B」 / 「A 또는 B」 로 잇는다
 * (ag-grid 33 은 `{ operator, conditions: [...] }`, 예전 모양 `{ operator, condition1, condition2 }` 도 읽는다).
 * 글로 쓸 수 없는 모양(집합 필터 등)은 「적용됨」.
 */
export function describeFilterModel(model: unknown): string {
  const m = asRecord(model);
  if (!m) return "적용됨";
  const conditions = Array.isArray(m.conditions) ? m.conditions : [m.condition1, m.condition2].filter((c) => c != null);
  if (conditions.length > 0) {
    const parts = conditions.map((c) => (asRecord(c) ? describeSimple(c as SimpleModel) : null)).filter((s): s is string => s !== null);
    if (parts.length > 0) return parts.join(m.operator === "OR" ? " 또는 " : " 그리고 ");
    return "적용됨";
  }
  if (Array.isArray(m.values)) return m.values.map(valueText).filter(Boolean).join(", ") || "적용됨";
  return describeSimple(m as SimpleModel) ?? "적용됨";
}

/** 칩에 보일 값 — 길면 줄인다. */
export function shortenChipValue(value: string): string {
  return value.length > CHIP_VALUE_MAX ? `${value.slice(0, CHIP_VALUE_MAX)}…` : value;
}

/** 칸의 머리글 표시 이름 — 그리드가 보이는 이름, 없으면 열 정의 header, 그것도 없으면 칸 키. */
function columnLabel(api: GridApi, colId: string): string {
  const column = api.getColumn(colId);
  if (!column) return colId;
  const display = api.getDisplayNameForColumn(column, "header");
  if (typeof display === "string" && display.trim() !== "") return display.trim();
  const def = column.getColDef();
  if (typeof def.headerName === "string" && def.headerName.trim() !== "") return def.headerName.trim();
  return colId;
}

/** 칩 목록이 같은가(내용 비교) — 같으면 이전 객체를 그대로 써서 구독자를 다시 그리지 않는다. */
export function sameChips(a: readonly GridFilterChip[], b: readonly GridFilterChip[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((c, i) => c.id === b[i]!.id && c.label === b[i]!.label && c.value === b[i]!.value && c.title === b[i]!.title);
}

/**
 * 그리드에 지금 걸린 조건을 칩 목록으로 만든다 — 빠른 검색어(있으면 맨 앞) → 칸별 조건(필터 모델 순서).
 * 걸린 조건이 없으면 {@link NO_FILTER_CHIPS}.
 */
export function buildFilterChips(api: GridApi | null | undefined, quickText: string): readonly GridFilterChip[] {
  const chips: GridFilterChip[] = [];
  const quick = quickText.trim();
  if (quick !== "") {
    chips.push({ id: QUICK_CHIP_ID, kind: "quick", label: "검색어", value: shortenChipValue(quick), title: `검색어 ${quick}` });
  }
  if (api && !api.isDestroyed()) {
    const model = api.getFilterModel() as Record<string, unknown>;
    for (const colId of Object.keys(model)) {
      const full = describeFilterModel(model[colId]);
      const label = columnLabel(api, colId);
      chips.push({ id: `${COLUMN_CHIP_PREFIX}${colId}`, kind: "column", label, value: shortenChipValue(full), title: `${label}: ${full}` });
    }
  }
  return chips.length === 0 ? NO_FILTER_CHIPS : chips;
}
