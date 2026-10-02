/**
 * 환율·날씨 위젯 서식 — 순수 함수(스펙 2026-10-02-widget-admin-generic §6·§8). 렌더 시험 없이 vitest 로 시험한다.
 * @dk-oasis/shared 를 import 하지 않는다.
 */
import type { ExchangeResult, ExchangeRow } from "./types";

/** 값이 작아 100 단위로 보이는 통화(스펙: JPY. VND 도 소수 2자리로는 값이 사라져 같은 방식으로 보인다). */
const UNIT_BY_CUR: Readonly<Record<string, number>> = { JPY: 100, VND: 100 };

function cleanCur(cur: string): string {
  return cur.trim().toUpperCase();
}

/** 표시 단위(1 또는 100). */
export function unitOf(cur: string): number {
  return UNIT_BY_CUR[cleanCur(cur)] ?? 1;
}

/** 「1 USD」·「100 JPY」. */
export function unitLabel(cur: string): string {
  return `${unitOf(cur)} ${cleanCur(cur)}`;
}

export function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** yyyyMMdd · yyyy-MM-dd(뒤에 시각이 붙어도 됨) → yyyy-MM-dd. 날짜가 아니면 null. */
export function normalizeDate(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(raw) ?? /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(raw);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function fixed2(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 환율 값 — 천 단위 쉼표 + 소수 2자리. 값이 없으면 "-". */
export function formatRate(n: number | null): string {
  return n == null || !Number.isFinite(n) ? "-" : fixed2(n);
}

export type DiffDir = ExchangeRow["dir"];

/**
 * 전일 대비 — ▲(올림)·▼(내림)·– (소수 2자리로 반올림해 0). 값이 없으면 none.
 * 색은 렌더러가 방향으로 입힌다(한국 관례: 오름 빨강·내림 파랑).
 */
export function formatDiff(diff: number | null): { dir: DiffDir; text: string } {
  if (diff == null || !Number.isFinite(diff)) return { dir: "none", text: "–" };
  const abs = Math.round(Math.abs(diff) * 100) / 100;
  if (abs === 0) return { dir: "flat", text: "– 0.00" };
  return diff > 0 ? { dir: "up", text: `▲ ${fixed2(abs)}` } : { dir: "down", text: `▼ ${fixed2(abs)}` };
}

/** 부동소수 잡음(9.2×100=919.9999999999999)을 걷는다 — 값은 소수 8자리까지만 의미가 있다. */
function scale(v: number, unit: number): number {
  return Math.round(v * unit * 1e8) / 1e8;
}

/**
 * 서버 응답 → 설정한 통화 순서의 표 행. 데이터가 없는 통화도 줄은 남긴다.
 * latest 가 없으면 history 마지막 두 값으로 값·전일 대비를 채운다. 추이 점·값·전일 대비 모두 표시 단위(JPY ×100) 기준이다.
 */
export function toExchangeRows(result: ExchangeResult, currencies: readonly string[]): ExchangeRow[] {
  const seen = new Set<string>();
  const rows: ExchangeRow[] = [];
  for (const raw of currencies) {
    const cur = cleanCur(raw);
    if (!cur || seen.has(cur)) continue;
    seen.add(cur);
    const unit = unitOf(cur);
    const hist = result.history.filter((p) => p.cur === cur).sort((a, b) => a.date.localeCompare(b.date));
    const last = hist[hist.length - 1];
    const prev = hist[hist.length - 2];
    const latest = result.latest.find((l) => l.cur === cur);
    const rate = latest ? latest.rate : (last?.rate ?? null);
    const diff = latest ? latest.diff : last && prev ? last.rate - prev.rate : null;
    const date = latest?.date ?? last?.date ?? null;
    const d = formatDiff(diff == null ? null : scale(diff, unit));
    rows.push({
      cur,
      label: unitLabel(cur),
      rateText: formatRate(rate == null ? null : scale(rate, unit)),
      diffText: d.text,
      dir: d.dir,
      spark: hist.map((p) => scale(p.rate, unit)),
      date,
    });
  }
  return rows;
}

/** 행들의 기준일 중 가장 늦은 날짜(없으면 null). */
export function latestDateOf(rows: readonly ExchangeRow[]): string | null {
  let best: string | null = null;
  for (const r of rows) if (r.date && (best === null || r.date > best)) best = r.date;
  return best;
}

// ── 날씨 ─────────────────────────────────────────────────────────────────

/** Open-Meteo 기본 풍속 단위는 km/h 다(스펙 §8.2 요청 주소에 wind_speed_unit 이 없다). m/s 로 바꾼다. */
export function kmhToMs(kmh: number): number {
  return kmh / 3.6;
}

export function formatWind(kmh: number | null): string {
  return kmh == null ? "-" : `${kmhToMs(kmh).toFixed(1)} m/s`;
}

/** 기온 — 소수 1자리 ℃. -0.0 은 0.0 으로. */
export function formatTemp(t: number | null): string {
  if (t == null) return "-";
  const s = t.toFixed(1);
  return `${Number(s) === 0 ? "0.0" : s}℃`;
}

export function formatHumidity(h: number | null): string {
  return h == null ? "-" : `${Math.round(h)}%`;
}

export function formatPop(p: number | null): string {
  return p == null ? "-" : `${Math.round(p)}%`;
}

function deg(v: number | null): string {
  return v == null ? "-" : `${Math.round(v) || 0}°`;
}

/** 예보 줄의 최저/최고 — 정수 도(°). */
export function formatRange(min: number | null, max: number | null): string {
  return `${deg(min)} / ${deg(max)}`;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** yyyy-MM-dd → 요일 한 글자. UTC 로 계산해 시간대에 흔들리지 않는다. 날짜가 아니면 "". */
export function weekdayLabel(date: string): string {
  const d = normalizeDate(date);
  if (!d) return "";
  const [y, m, day] = d.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, day)).getUTCDay()];
}
