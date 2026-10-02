/**
 * 쿼리 위젯 유형(query-table·query-chart·query-number) 공용 순수 함수 — 서식·결과 정리·설정 읽기·변환·편집기 검사.
 * 스펙 2026-10-02-widget-admin-generic §6(유형별 정의 설정)·§7.2(시스템 변수)·§10.1(미리보기 `__preview`).
 * @dk-oasis/shared 는 타입만 import 한다(m-mcm vitest 가 shared dist 없이 시험한다 — 팀 운영 규칙 7).
 */
import type { GridColumn } from "@dk-oasis/shared/grid";

/* ── 타입 ── */

/** widgetData/run·commWidgetMng/previewQuery 결과(스펙 §5.1). */
export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  truncated: boolean;
}

export type QueryTypeId = "query-table" | "query-chart" | "query-number";

export type ColumnAlign = "left" | "center" | "right";
export type ColumnFormat = "text" | "number" | "date";

export interface TableColumnConfig {
  field: string;
  header?: string;
  /** 「fit」 폭 가중치(픽셀 기준 비율). */
  width?: number;
  align?: ColumnAlign;
  format?: ColumnFormat;
}

export interface QueryTableConfig {
  sql: string;
  columns: TableColumnConfig[];
}

export type ChartType = "bar" | "line" | "area" | "pie";

export interface ChartSeriesConfig {
  field: string;
  label?: string;
}

export interface QueryChartConfig {
  sql: string;
  chartType: ChartType;
  xField: string;
  series: ChartSeriesConfig[];
}

export type NumberFormat = "number" | "percent";

export interface QueryNumberConfig {
  sql: string;
  labelField: string;
  valueField: string;
  unitField?: string;
  unit?: string;
  format: NumberFormat;
}

/* ── 문구·상수 ── */

export const QUERY_LOAD_ERROR = "위젯 데이터를 불러오지 못했습니다";
export const QUERY_EMPTY = "표시할 데이터가 없습니다";

/** 표가 잘렸을 때 아래 안내 — 위젯 실행은 500행(「상위 500행만 표시합니다」), 관리 화면 미리보기는 50행. */
export function truncatedNote(rowCount: number): string {
  return `상위 ${rowCount}행만 표시합니다`;
}
/** 숫자 타일 최대 개수(스펙 §6 query-number). */
export const MAX_NUMBER_TILES = 8;
/** 표 그리드 행 키 — 결과 행에 id 컬럼이 없어도 행이 겹치지 않게 순번을 붙인다. */
export const TABLE_ROW_KEY = "__rowKey";

/** 스펙 §7.2 시스템 변수 — SQL 편집기 안내. */
export const SYSTEM_VARIABLES: readonly { name: string; desc: string }[] = [
  { name: ":userId", desc: "사용자 ID" },
  { name: ":deptCd", desc: "부서 코드" },
  { name: ":today", desc: "오늘(yyyyMMdd)" },
  { name: ":yesterday", desc: "어제(yyyyMMdd)" },
  { name: ":monthStart", desc: "이달 1일(yyyyMMdd)" },
  { name: ":now", desc: "현재 시각" },
];

export const CHART_TYPE_OPTIONS: readonly { value: ChartType; label: string }[] = [
  { value: "bar", label: "막대" },
  { value: "line", label: "선" },
  { value: "area", label: "영역" },
  { value: "pie", label: "원(첫 계열만)" },
];

export const NUMBER_FORMAT_OPTIONS: readonly { value: NumberFormat; label: string }[] = [
  { value: "number", label: "숫자(천 단위 구분)" },
  { value: "percent", label: "백분율(소수 1자리 %)" },
];

export const ALIGN_LABELS: Readonly<Record<string, string>> = { "": "자동", left: "왼쪽", center: "가운데", right: "오른쪽" };
export const FORMAT_LABELS: Readonly<Record<string, string>> = { "": "그대로", text: "글자", number: "숫자", date: "날짜" };

const CHART_TYPES: readonly ChartType[] = ["bar", "line", "area", "pie"];
const ALIGNS: readonly ColumnAlign[] = ["left", "center", "right"];
const FORMATS: readonly ColumnFormat[] = ["text", "number", "date"];

/* ── 작은 도우미 ── */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function pick<T extends string>(v: unknown, allowed: readonly T[]): T | undefined {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
}

/* ── 값 서식 ── */

const THOUSANDS_RE = /^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/;
const PLAIN_NUMBER_RE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/**
 * 숫자·숫자 문자열만 숫자로. 그 밖은 null.
 * 쉼표는 천 단위 자리 규칙(1,234 · 1,234.5)일 때만 지운다(「1,2,3」은 숫자가 아니다). 16진(0x10)은 받지 않는다. 지수 표기(1e3)는 받는다.
 */
export function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (t === "") return null;
  let s: string;
  if (THOUSANDS_RE.test(t)) s = t.replace(/,/g, "");
  else if (PLAIN_NUMBER_RE.test(t)) s = t;
  else return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** 서버 호출 여부(관리 화면 저장 전 미리보기 자리 표시 ID). */
const PREVIEW_WIDGET_ID = "def.preview";

/**
 * 쿼리 위젯이 서버(widgetData/run)를 불러야 하는지.
 * `__preview` 결과가 있거나, widgetId 가 비었거나, 저장 전 미리보기 자리 표시 ID(def.preview)면 부르지 않는다.
 */
export function shouldRunQuery(definition: unknown, widgetId: string): boolean {
  if (previewOf(definition)) return false;
  if (!widgetId || widgetId.trim() === "") return false;
  if (widgetId === PREVIEW_WIDGET_ID) return false;
  return true;
}

function plain(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

/** 천 단위 구분(소수는 3자리까지). 숫자가 아니면 글자 그대로. */
export function formatNumber(v: unknown): string {
  const n = toNumber(v);
  return n === null ? plain(v) : n.toLocaleString("ko-KR");
}

/** 값을 백분율 수치(97.3 = 97.3%)로 보고 소수 1자리 + %. 숫자가 아니면 글자 그대로. */
export function formatPercent(v: unknown): string {
  const n = toNumber(v);
  if (n === null) return plain(v);
  return `${n.toLocaleString("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** yyyy-MM-dd. ISO·yyyyMMdd(HHmmss)·yyyy/M/d·yyyy.MM.dd 문자열과 epoch 밀리초를 받는다. 그 밖은 글자 그대로. */
export function formatDate(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s: string;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return String(v);
    // 8자리 정수(19000101~29991231)는 yyyyMMdd 로 본다 — 나머지 숫자만 epoch 밀리초.
    if (Number.isInteger(v) && v >= 19000101 && v <= 29991231) {
      s = String(v);
    } else {
      const d = new Date(v);
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    }
  } else {
    s = String(v).trim();
  }
  const compact = /^(\d{4})(\d{2})(\d{2})(\d{6})?$/.exec(s);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  const sep = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  if (sep) return `${sep[1]}-${pad2(Number(sep[2]))}-${pad2(Number(sep[3]))}`;
  return s;
}

export function formatCell(v: unknown, format?: ColumnFormat): string {
  if (format === "number") return formatNumber(v);
  if (format === "date") return formatDate(v);
  return plain(v);
}

/* ── 결과 ── */

/** 서버 결과를 정리한다 — 컬럼은 문자열·{name} 둘 다 받고, 없으면 첫 행 키로 채운다. */
export function normalizeQueryResult(raw: unknown): QueryResult {
  const r = isRecord(raw) ? raw : {};
  const rows = Array.isArray(r.rows) ? r.rows.filter(isRecord) : [];
  let columns: string[] = [];
  if (Array.isArray(r.columns)) {
    columns = r.columns
      .map((c) => (typeof c === "string" ? c : isRecord(c) && c.name != null ? String(c.name) : ""))
      .filter((c) => c !== "");
  }
  if (columns.length === 0 && rows.length > 0) columns = Object.keys(rows[0]);
  return { columns, rows, truncated: r.truncated === true };
}

/** 관리 화면 미리보기 — definition.__preview 가 있으면 그 결과(서버를 부르지 않는다, 계획 「화면 전용 키 규칙」). */
export function previewOf(definition: unknown): QueryResult | null {
  if (!isRecord(definition) || !isRecord(definition.__preview)) return null;
  return normalizeQueryResult(definition.__preview);
}

/** [쿼리 시험] 결과 요약 — 「3행 · 컬럼: A, B」. */
export function summarizeResult(r: QueryResult): string {
  const n = r.rows.length;
  const count = r.truncated ? `${n}행 넘음(앞 ${n}행만 받음)` : `${n}행`;
  const cols = r.columns.length > 0 ? `컬럼: ${r.columns.join(", ")}` : "컬럼 없음";
  return `${count} · ${cols}`;
}

/* ── 설정 읽기(정의 설정은 관리자 값이라 모양을 믿지 않고 정리해 읽는다) ── */

function positiveInt(v: unknown): number | undefined {
  const n = toNumber(v);
  if (n === null) return undefined;
  const r = Math.round(n);
  return r > 0 ? r : undefined;
}

export function tableConfigOf(v: unknown): QueryTableConfig {
  const c = isRecord(v) ? v : {};
  const columns: TableColumnConfig[] = [];
  if (Array.isArray(c.columns)) {
    for (const col of c.columns) {
      if (!isRecord(col)) continue;
      const out: TableColumnConfig = { field: str(col.field) };
      const header = str(col.header);
      if (header) out.header = header;
      const width = positiveInt(col.width);
      if (width !== undefined) out.width = width;
      const align = pick(col.align, ALIGNS);
      if (align) out.align = align;
      const format = pick(col.format, FORMATS);
      if (format) out.format = format;
      columns.push(out);
    }
  }
  return { sql: typeof c.sql === "string" ? c.sql : "", columns };
}

export function chartConfigOf(v: unknown): QueryChartConfig {
  const c = isRecord(v) ? v : {};
  const series: ChartSeriesConfig[] = [];
  if (Array.isArray(c.series)) {
    for (const s of c.series) {
      if (!isRecord(s)) continue;
      const out: ChartSeriesConfig = { field: str(s.field) };
      const label = str(s.label);
      if (label) out.label = label;
      series.push(out);
    }
  }
  return {
    sql: typeof c.sql === "string" ? c.sql : "",
    chartType: pick(c.chartType, CHART_TYPES) ?? "bar",
    xField: str(c.xField),
    series,
  };
}

export function numberConfigOf(v: unknown): QueryNumberConfig {
  const c = isRecord(v) ? v : {};
  const out: QueryNumberConfig = {
    sql: typeof c.sql === "string" ? c.sql : "",
    labelField: str(c.labelField),
    valueField: str(c.valueField),
    format: pick(c.format, ["number", "percent"] as const) ?? "number",
  };
  const unitField = str(c.unitField);
  if (unitField) out.unitField = unitField;
  const unit = str(c.unit);
  if (unit) out.unit = unit;
  return out;
}

/** 입력 칸에 보일 원래 글자 — 읽기 함수(…ConfigOf)는 공백을 지우므로 칠 때는 이 값을 쓴다(「생산 실적」 처럼 가운데 공백). */
export function configText(v: unknown, key: string): string {
  if (!isRecord(v)) return "";
  const s = v[key];
  return typeof s === "string" ? s : "";
}

/** 편집기 값 고치기 — 다른 키(`__preview` 등)는 그대로 둔다. */
export function patchConfig(v: unknown, patch: Record<string, unknown>): Record<string, unknown> {
  return { ...(isRecord(v) ? v : {}), ...patch };
}

/* ── 표 ── */

const DEFAULT_COLUMN_WEIGHT = 100;
const DEFAULT_COLUMN_MIN = 60;

function firstValue(rows: readonly Record<string, unknown>[], field: string): unknown {
  for (const r of rows) {
    const v = r[field];
    if (v !== null && v !== undefined) return v;
  }
  return undefined;
}

/**
 * 표 컬럼 정의 — columns 설정이 없으면 결과 컬럼 전부. AgDataGrid columnSizing="fit" 기준이라 width 는 비율 가중치다.
 * 폭을 주지 않은 컬럼은 가중치 100·최소 60px, 준 컬럼은 그 폭이 최소 폭이 된다(AgDataGrid fit 규칙).
 */
export function toColumnDefs(
  columns: readonly string[],
  cfg: QueryTableConfig,
  rows: readonly Record<string, unknown>[] = []
): GridColumn[] {
  if (cfg.columns.length === 0) {
    return columns.map((field) => {
      const col: GridColumn = { key: field, header: field, width: DEFAULT_COLUMN_WEIGHT, minWidth: DEFAULT_COLUMN_MIN };
      if (typeof firstValue(rows, field) === "number") col.align = "right";
      return col;
    });
  }
  return cfg.columns.map((c) => {
    const col: GridColumn = { key: c.field, header: c.header || c.field, width: c.width ?? DEFAULT_COLUMN_WEIGHT };
    if (c.width === undefined) col.minWidth = DEFAULT_COLUMN_MIN;
    const align = c.align ?? (c.format === "number" ? "right" : undefined);
    if (align) col.align = align;
    const format = c.format;
    if (format) col.render = (value: unknown) => formatCell(value, format);
    return col;
  });
}

export function toGridRows(rows: readonly Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((r, i) => ({ ...r, [TABLE_ROW_KEY]: String(i) }));
}

/* ── 차트 ── */

export interface ChartData {
  categories: string[];
  series: { key: string; label: string; values: number[] }[];
}

/** 차트 데이터 — xField 값이 가로축 항목, 계열 값은 숫자(숫자가 아니면 0). 필드가 빈 계열은 뺀다. */
export function toChartData(
  rows: readonly Record<string, unknown>[],
  xField: string,
  series: readonly ChartSeriesConfig[]
): ChartData {
  return {
    categories: rows.map((r) => plain(r[xField])),
    series: series
      .filter((s) => s.field !== "")
      .map((s) => ({
        key: s.field,
        label: s.label || s.field,
        values: rows.map((r) => toNumber(r[s.field]) ?? 0),
      })),
  };
}

/** 계열 색 — 상태가 아닌 여러 계열은 --color-chart-1 … 5 를 차례로(charts 표준값). */
export function chartColor(i: number): string {
  return `var(--color-chart-${(i % 5) + 1})`;
}

export function toLinePoints(data: ChartData, index: number): { label: string; value: number }[] {
  const s = data.series[index];
  if (!s) return [];
  return data.categories.map((label, i) => ({ label, value: s.values[i] ?? 0 }));
}

/** 원 차트 — 첫 계열만(스펙 계획 Task 7), 항목마다 색. */
export function toPieSlices(data: ChartData): { label: string; value: number; color: string }[] {
  const s = data.series[0];
  if (!s) return [];
  return data.categories.map((label, i) => ({ label, value: s.values[i] ?? 0, color: chartColor(i) }));
}

/** 범례 줄 높이(StackedColumnChart 는 범례를 그림 높이 밖에 그린다). */
const LEGEND_HEIGHT = 26;

/** 원 차트에 그릴 값이 있는지 — 양수 합이 0 이하면 false(shared PieChart 의 「데이터 없음」 대신 QueryEmpty 를 보인다). */
export function hasPieData(slices: readonly { value: number }[]): boolean {
  return slices.reduce((sum, s) => sum + (s.value > 0 ? s.value : 0), 0) > 0;
}

/** 막대 차트 그림 높이 — 본문 높이에서 범례 줄을 뺀 값(최소 120), 높이를 모르면 230. */
export function barChartHeight(bodyHeight: number | null): number {
  if (bodyHeight == null || bodyHeight <= 0) return 230;
  return Math.max(120, Math.round(bodyHeight - LEGEND_HEIGHT));
}

/** 선 차트 한 장 높이 — 계열마다 한 장씩 위아래로 나눈다(최소 140, 넘치면 본문이 스크롤). 높이를 모르면 250. */
export function lineChartHeight(bodyHeight: number | null, count: number): number {
  if (bodyHeight == null || bodyHeight <= 0) return 250;
  return Math.max(140, Math.floor(bodyHeight / Math.max(1, count)));
}

/** 원 차트 지름 — 범례가 옆에 붙으므로 폭의 절반 남짓, 100~320. 크기를 모르면 180. */
export function pieChartSize(body: { width: number; height: number | null }): number {
  if (body.height == null || body.height <= 0 || body.width <= 0) return 180;
  const size = Math.min(body.height - 8, body.width * 0.48);
  return Math.round(Math.min(320, Math.max(100, size)));
}

/* ── 숫자 타일 ── */

export interface NumberTile {
  key: string;
  label: string;
  value: string;
  unit?: string;
}

/** 결과 행마다 타일(최대 8개) — 단위는 unitField 값, 비면 unit. */
export function toNumberTiles(rows: readonly Record<string, unknown>[], cfg: QueryNumberConfig): NumberTile[] {
  return rows.slice(0, MAX_NUMBER_TILES).map((r, i) => {
    const raw = r[cfg.valueField];
    const value = cfg.format === "percent" ? formatPercent(raw) : formatNumber(raw);
    const tile: NumberTile = { key: String(i), label: plain(r[cfg.labelField]), value: value === "" ? "-" : value };
    const unit = (cfg.unitField ? plain(r[cfg.unitField]).trim() : "") || cfg.unit || "";
    if (unit) tile.unit = unit;
    return tile;
  });
}

/* ── 편집기 ── */

/** 편집기 검사(저장 막기용) — 빈 배열이면 저장 가능. */
export function validateQueryConfig(typeId: string, cfg: unknown): string[] {
  const errors: string[] = [];
  const sql = isRecord(cfg) && typeof cfg.sql === "string" ? cfg.sql : "";
  if (sql.trim() === "") errors.push("SQL 을 입력하세요");
  if (typeId === "query-table") {
    if (tableConfigOf(cfg).columns.some((c) => c.field === "")) errors.push("필드가 빈 컬럼이 있습니다");
  } else if (typeId === "query-chart") {
    const c = chartConfigOf(cfg);
    if (c.xField === "") errors.push("가로축 필드를 고르세요");
    if (c.series.length === 0) errors.push("값 계열을 하나 이상 넣으세요");
    else if (c.series.some((s) => s.field === "")) errors.push("필드가 빈 값 계열이 있습니다");
  } else if (typeId === "query-number") {
    const c = numberConfigOf(cfg);
    if (c.labelField === "") errors.push("라벨 필드를 고르세요");
    if (c.valueField === "") errors.push("값 필드를 고르세요");
  }
  return errors;
}

/** 목록 칸 편집 값(글자) — 앞뒤 공백을 지우고, 비면 undefined(저장할 때 키가 빠진다). */
export function textCell(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}

/** 목록 칸 편집 값(폭 등 양의 정수) — 그 밖은 undefined. */
export function intCell(v: unknown): number | undefined {
  return positiveInt(v);
}

/** [결과 컬럼 모두 넣기] — 표시 컬럼에 아직 없는 결과 컬럼만 뒤에 붙인다. */
export function appendMissingFields(
  list: readonly TableColumnConfig[],
  columns: readonly string[]
): TableColumnConfig[] {
  const have = new Set(list.map((c) => c.field));
  return [...list, ...columns.filter((c) => !have.has(c)).map((field) => ({ field }))];
}
