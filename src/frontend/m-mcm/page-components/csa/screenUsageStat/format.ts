/**
 * screenUsageStat 표시·입력 변환과 검사 — 순수 함수만 둔다.
 * React·@dk-oasis/shared 를 import 하지 않는다(m-mcm vitest 가 shared dist 없이 시험한다).
 */
import type {
  ScreenUsageDailyRow,
  ScreenUsageTopScreen,
  StatFilters,
  UsageStartKind,
} from "./types";

/**
 * 이용 이력 조회 기간 상한 — 시작·종료일을 포함해 31일(메인 결정 5, 날짜 차 ≤ 30).
 * 서버 C4(ScreenUsageHistoryQuery)와 화면이 같은 식(날짜 차 ≤ 30, 메인 결정 U2-1)이고, 화면은 조회 전에 같은 식으로 막는다.
 */
export const HISTORY_MAX_DAYS = 31;
/** 이용 이력 응답 행 상한 — 이 수만큼 오면 서버가 잘랐다고 본다(메인 결정 6). */
export const HISTORY_ROW_LIMIT = 10_000;
export const HISTORY_TRUNCATED_NOTICE = "최근 10,000건만 표시됩니다. 기간을 줄여 조회하세요.";
export const DEFAULT_UNUSED_DAYS = 90;
export const MAX_UNUSED_DAYS = 3650;

/** 구분 라벨 — 열람(첫 업무 호출로 시작한 구간)인지만 보인다. SWITCH 는 2026-10-03 이전 기록의 하위 호환 값이다. */
export const START_KIND_LABEL: Record<UsageStartKind, string> = {
  OPEN: "열람",
  SWITCH: "계속",
  RESUME: "계속",
};

/** shared LineDataPoint 와 같은 모양. */
export interface ChartPoint {
  label: string;
  value: number;
}

/** shared BarData 와 같은 모양. */
export interface BarPoint extends ChartPoint {
  color: string;
}

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const YMD = /^\d{8}$/;

/** 이용 시간(ms) → "1시간 2분". 0 → "0분", 1분 미만 → "1분 미만", 값 없음·음수·숫자 아님 → "". */
export function formatDuration(ms: unknown): string {
  if (ms === null || ms === undefined || ms === "") return "";
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 0) return "";
  if (n === 0) return "0분";
  if (n < MINUTE_MS) return "1분 미만";
  const totalMin = Math.floor(n / MINUTE_MS);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}분`;
  const hText = `${h.toLocaleString("ko-KR")}시간`;
  return m === 0 ? hText : `${hText} ${m}분`;
}

/** yyyyMMdd → yyyy-MM-dd. 비면 "", 8자리 숫자가 아니면 그대로. */
export function formatYmd(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v).trim();
  if (s === "" || !YMD.test(s)) return s;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

/** yyyyMMdd → MM/dd (추이 선 가로축 라벨). */
export function formatMonthDay(ymd: string): string {
  return YMD.test(ymd) ? `${ymd.slice(4, 6)}/${ymd.slice(6, 8)}` : ymd;
}

/** yyyy-MM-dd(DatePicker 값) → yyyyMMdd(서버 파라미터). 이미 yyyyMMdd 면 그대로. */
export function toYmd(date: string): string {
  return date.replace(/-/g, "");
}

function ymdToUtc(ymd: string): number {
  if (!YMD.test(ymd)) return Number.NaN;
  return Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8)));
}

function utcToYmd(t: number): string {
  const d = new Date(t);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}${mm}${dd}`;
}

/** 기간 일수 = to - from (yyyy-MM-dd·yyyyMMdd 모두 받음). 형식이 틀리면 NaN. */
export function periodDays(from: string, to: string): number {
  return Math.round((ymdToUtc(toYmd(to)) - ymdToUtc(toYmd(from))) / DAY_MS);
}

/** 미사용 기준 일수 입력 → 정수. 비면 90, 1~3650 정수가 아니면 null. */
export function parseUnusedDays(input: string): number | null {
  const s = input.trim();
  if (s === "") return DEFAULT_UNUSED_DAYS;
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 && n <= MAX_UNUSED_DAYS ? n : null;
}

/** [조회] 전 검사. 문제가 없으면 null, 있으면 처음 걸린 안내 문구 하나(screen-patterns.md §메시지). */
export function checkFilters(f: StatFilters): string | null {
  if (!f.fromDt) return "조회 시작일을 입력하세요.";
  if (!f.toDt) return "조회 종료일을 입력하세요.";
  if (periodDays(f.fromDt, f.toDt) < 0) return "시작일이 종료일보다 늦을 수 없습니다.";
  if (parseUnusedDays(f.unusedDays) === null) {
    return `미사용 기준 일수는 1~${MAX_UNUSED_DAYS} 사이의 정수여야 합니다.`;
  }
  return null;
}

/** 이용 이력 응답이 상한(10,000행)에 닿았는지. */
export function isHistoryTruncated(rowCount: number): boolean {
  return rowCount >= HISTORY_ROW_LIMIT;
}

/** 이용 이력 탭 조회 전 검사. 시작·종료일 포함 31일(날짜 차 30) 이하면 null. */
export function checkHistoryPeriod(from: string, to: string): string | null {
  return periodDays(from, to) > HISTORY_MAX_DAYS - 1
    ? `이용 이력 조회 기간은 ${HISTORY_MAX_DAYS}일 이하여야 합니다.`
    : null;
}

export function startKindLabel(v: unknown): string {
  return START_KIND_LABEL[v as UsageStartKind] ?? String(v ?? "");
}

/**
 * 일별 추이 → 차트 점. 기간 안의 빈 날은 0 으로 채운다(빈 날을 건너뛴 선이 추이를 왜곡하지 않게).
 * 서버처럼 오늘(todayYmd, yyyyMMdd)까지만 채운다 — 종료일이 미래면 선 끝에 0 이 이어져 급락처럼 보인다.
 * 기간이 틀리면 받은 행을 일자 순으로만 그린다. todayYmd 형식이 틀리면 종료일까지 채운다.
 */
export function toDailyPoints(
  rows: readonly ScreenUsageDailyRow[],
  fromDt: string,
  toDt: string,
  todayYmd: string
): ChartPoint[] {
  const start = ymdToUtc(toYmd(fromDt));
  const toEnd = ymdToUtc(toYmd(toDt));
  if (Number.isNaN(start) || Number.isNaN(toEnd) || toEnd < start) {
    return [...rows]
      .sort((a, b) => String(a.usageDt).localeCompare(String(b.usageDt)))
      .map((r) => ({ label: formatMonthDay(String(r.usageDt)), value: Number(r.openCnt) || 0 }));
  }
  const todayUtc = ymdToUtc(toYmd(todayYmd));
  const end = Number.isNaN(todayUtc) ? toEnd : Math.min(toEnd, todayUtc);
  const byDay = new Map(rows.map((r) => [String(r.usageDt), Number(r.openCnt) || 0]));
  const out: ChartPoint[] = [];
  for (let t = start; t <= end; t += DAY_MS) {
    const ymd = utcToYmd(t);
    out.push({ label: formatMonthDay(ymd), value: byDay.get(ymd) ?? 0 });
  }
  return out;
}

/**
 * 상위 화면 → 가로 막대. HBarChart 는 label 을 React key 로 쓰므로 라벨을 유일하게 만든다.
 * 서버가 준 menuNm(메뉴 없는 화면은 "(메뉴 없음)")을 그대로 쓰고, 같은 라벨이 여럿이면 뒤에 "(pageId)" 를 붙인다.
 * menuNm 이 비면 pageId 를 쓴다(pageId 는 C4 에서 화면마다 하나라 결과가 유일하다).
 */
export function toTopBars(rows: readonly ScreenUsageTopScreen[], color: string): BarPoint[] {
  const base = rows.map((r) => (r.menuNm ? String(r.menuNm) : String(r.pageId)));
  const count = new Map<string, number>();
  for (const b of base) count.set(b, (count.get(b) ?? 0) + 1);
  return rows.map((r, i) => ({
    label: (count.get(base[i]) ?? 0) > 1 ? `${base[i]} (${r.pageId})` : base[i],
    value: Number(r.openCnt) || 0,
    color,
  }));
}

const DURATION_KEYS = ["durationMs", "avgDurationMs", "totalDurationMs"];
const YMD_KEYS = ["usageDt", "lastUsedDt"];

/** 엑셀용 행 — 이용 시간·일자·구분을 화면과 같은 글자로 바꾼다. 원본 행은 바꾸지 않는다. */
export function toExportRows(rows: readonly Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((r) => {
    const out: Record<string, unknown> = { ...r };
    for (const k of DURATION_KEYS) if (k in out) out[k] = formatDuration(out[k]);
    for (const k of YMD_KEYS) if (k in out) out[k] = formatYmd(out[k]);
    if ("startKind" in out) out.startKind = startKindLabel(out.startKind);
    return out;
  });
}
