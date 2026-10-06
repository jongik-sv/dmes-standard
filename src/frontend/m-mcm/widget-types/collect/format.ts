/**
 * 자동 수집(collect) 읽기 결과 변환 — 순수 함수. 계약: docs/widget-2026-10/spec-widget-data.md §5.
 * 응답: columns [COLLECTED_AT, ITEM_KEY, VALUE], rows(SLOT 오름차순 → ITEM_KEY 오름차순), truncated, lastRun.
 * 값 서식은 _query/format.ts 의 formatNumber·toNumber 를 쓴다. @dk-oasis/shared 를 import 하지 않는다.
 */
import { normalizeQueryResult } from "../_query/format";

/* ── 문구 ── */

export const COLLECT_EMPTY = "아직 수집된 값이 없습니다";
export const COLLECT_FAILED = "최근 수집 실패";
/** 관리 화면 미리보기(저장 전)에서 값 대신 보이는 안내. */
export const COLLECT_PREVIEW_NOTE = "저장하고 첫 수집이 끝나면 수집된 값이 여기에 보입니다";

/* ── 타입 ── */

export interface CollectLastRun {
  /** 수집 시각 원문(yyyy-MM-ddTHH:mm:ss). */
  at: string;
  status: "OK" | "FAIL" | "RUN";
  message?: string;
}

export interface CollectPoint {
  /** 수집 시각 원문(정렬 키). */
  at: string;
  /** 숫자면 number, 글자면 string. */
  value: number | string;
}

export interface CollectItem {
  key: string;
  /** 수집 시각 오름차순. */
  points: CollectPoint[];
}

export interface CollectData {
  items: CollectItem[];
  lastRun: CollectLastRun | null;
  truncated: boolean;
}

export interface CollectTile {
  key: string;
  value: string;
  /** 값이 글자인지 — 긴 글자는 화면이 말줄임+title 로 보인다. */
  isText: boolean;
  unit?: string;
  /** 전 회차 대비 증감 문구(숫자 두 개가 있을 때만) — 「▲ 12 (+3.2%)」. */
  delta?: string;
  deltaDir?: "up" | "down" | "flat";
  /** 수집 시각 문구 — 「2026-10-05 09:10」. */
  collectedAt: string;
  /** 추이 선을 그릴 수 있는지(숫자 값이 2개 이상). */
  chartable: boolean;
}

/* ── 숫자 읽기·서식 ── */

/** 서버 CollectItem.NUMERIC_TEXT — 이 모양의 글자만 숫자로 본다(쉼표·지수·앞뒤 점은 글자). */
const NUMERIC_TEXT_RE = /^[+-]?[0-9]+(\.[0-9]+)?$/;

/** 값 칸 읽기 — JSON 숫자 또는 NUMERIC_TEXT 글자만 숫자, 그 밖은 null(글자로 둔다). */
export function numericValue(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const t = v.trim();
  return NUMERIC_TEXT_RE.test(t) ? Number(t) : null;
}

/** 수집 값 서식 — 천 단위 구분, 소수는 8자리까지(저장 정밀도 NUMERIC(24,8)), 불필요한 0 은 뺀다. */
export function formatCollectValue(n: number): string {
  return n.toLocaleString("ko-KR", { maximumFractionDigits: 8 });
}

/* ── 읽기 ── */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** 응답의 lastRun 을 읽는다 — 모양이 이상하면 null. 상태가 모르는 글자면 null(실패로 오해하지 않는다). */
export function readLastRun(v: unknown): CollectLastRun | null {
  if (!isRecord(v)) return null;
  const status = v.status;
  if (status !== "OK" && status !== "FAIL" && status !== "RUN") return null;
  const out: CollectLastRun = { at: typeof v.at === "string" ? v.at : "", status };
  if (typeof v.message === "string" && v.message !== "") out.message = v.message;
  return out;
}

/**
 * widgetData/run 원본 응답 → 항목별 시계열. 값이 숫자(숫자 글자 포함)면 숫자, 그 밖은 글자.
 * 항목 순서는 가장 최근 수집 시각의 행 순서, 그 시각에 없는 항목은 뒤에 이름순.
 */
export function collectDataOf(raw: unknown): CollectData {
  const r = isRecord(raw) ? raw : {};
  const { rows, truncated } = normalizeQueryResult(raw);
  const byKey = new Map<string, CollectPoint[]>();
  for (const row of rows) {
    const key = row.ITEM_KEY == null ? "" : String(row.ITEM_KEY);
    const at = row.COLLECTED_AT == null ? "" : String(row.COLLECTED_AT);
    const v = row.VALUE;
    if (key === "" || at === "" || v === null || v === undefined) continue;
    const n = numericValue(v);
    const point: CollectPoint = { at, value: n !== null ? n : String(v) };
    const list = byKey.get(key);
    if (list) list.push(point);
    else byKey.set(key, [point]);
  }
  for (const list of byKey.values()) list.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const latest = [...byKey.values()].reduce((max, l) => (l[l.length - 1].at > max ? l[l.length - 1].at : max), "");
  const inLatest: string[] = [];
  const rest: string[] = [];
  for (const [key, list] of byKey) (list[list.length - 1].at === latest ? inLatest : rest).push(key);
  // 가장 최근 시각에 있는 항목은 응답 행 순서(서버가 ITEM_KEY 순), 나머지는 이름순.
  const order = [...inLatest, ...rest.sort((a, b) => a.localeCompare(b))];
  return {
    items: order.map((key) => ({ key, points: byKey.get(key)! })),
    lastRun: readLastRun(r.lastRun),
    truncated,
  };
}

/* ── 서식 ── */

/** 「2026-10-05T09:10:00」 → 「2026-10-05 09:10」. 모양이 다르면 글자 그대로. */
export function formatCollectedAt(at: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(at);
  return m ? `${m[1]} ${m[2]}` : at;
}

/** 추이 선 가로 눈금 글자 — 같은 날 안이면 「HH:mm」, 여러 날이면 「MM-dd HH:mm」. */
export function axisLabel(at: string, multiDay: boolean): string {
  const m = /^\d{4}-(\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(at);
  if (!m) return at;
  return multiDay ? `${m[1]} ${m[2]}` : m[2];
}

/**
 * 전 회차 대비 증감 — 두 값이 모두 숫자일 때만. 「▲ 12 (+3.2%)」·「▼ 0.5 (-1.0%)」·「― 0」. 전 값이 0 이면 백분율은 뺀다.
 * 소수 8자리(저장 정밀도)로 먼저 맞춘 차이로 방향을 정한다 — 부동소수 잔재(0.1+0.2-0.3)가 ▲ 0 으로 보이지 않게.
 */
export function deltaOf(prev: CollectPoint | undefined, last: CollectPoint): { text: string; dir: "up" | "down" | "flat" } | null {
  if (!prev || typeof prev.value !== "number" || typeof last.value !== "number") return null;
  const diff = Number((last.value - prev.value).toFixed(8));
  if (diff === 0) return { text: "― 0", dir: "flat" };
  const dir = diff > 0 ? "up" : "down";
  const arrow = diff > 0 ? "▲" : "▼";
  const abs = formatCollectValue(Math.abs(diff));
  if (prev.value === 0) return { text: `${arrow} ${abs}`, dir };
  const pct = (diff / Math.abs(prev.value)) * 100;
  const pctText = `${pct > 0 ? "+" : ""}${pct.toLocaleString("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  return { text: `${arrow} ${abs} (${pctText})`, dir };
}

/** 항목마다 최신 값 타일. 단위는 숫자 값에만 붙인다. */
export function toCollectTiles(items: readonly CollectItem[], unit: string): CollectTile[] {
  return items.map((item) => {
    const last = item.points[item.points.length - 1];
    const prev = item.points.length >= 2 ? item.points[item.points.length - 2] : undefined;
    const num = typeof last.value === "number" ? last.value : null;
    const isNum = num !== null;
    const tile: CollectTile = {
      key: item.key,
      value: num !== null ? formatCollectValue(num) : String(last.value),
      isText: !isNum,
      collectedAt: formatCollectedAt(last.at),
      chartable: item.points.filter((p) => typeof p.value === "number").length >= 2,
    };
    if (isNum && unit) tile.unit = unit;
    const d = deltaOf(prev, last);
    if (d) {
      tile.delta = d.text;
      tile.deltaDir = d.dir;
    }
    return tile;
  });
}

/** 한 항목의 추이 선 점들 — 숫자 값만(글자 값은 그릴 수 없다). 눈금은 수집 시각이 하루 안이면 시각만. */
export function toTrendPoints(item: CollectItem | undefined): { label: string; value: number }[] {
  if (!item) return [];
  const nums = item.points.filter((p): p is { at: string; value: number } => typeof p.value === "number");
  const days = new Set(nums.map((p) => p.at.slice(0, 10)));
  return nums.map((p) => ({ label: axisLabel(p.at, days.size > 1), value: p.value }));
}

/** 처음 고를 항목 — 추이를 그릴 수 있는 첫 항목, 없으면 첫 항목, 항목이 없으면 null. */
export function defaultSelection(tiles: readonly CollectTile[]): string | null {
  return tiles.find((t) => t.chartable)?.key ?? tiles[0]?.key ?? null;
}

/** 저장 전(관리 화면 미리보기) 자리 표시 ID 이거나 widgetId 가 없으면 서버를 부르지 않는다. */
export function shouldRunCollect(widgetId: string): boolean {
  return widgetId.trim() !== "" && widgetId !== "def.preview";
}
