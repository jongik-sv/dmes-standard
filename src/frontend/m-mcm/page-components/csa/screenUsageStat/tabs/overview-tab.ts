/**
 * 개요 탭 모듈 — overview 조회(미사용 기준 일수 포함), 일별 추이 엑셀, 미사용 KPI 문구.
 * shared 를 런타임 import 하지 않는다(시험 격리).
 */
import { fetchOverview } from "../api";
import { DEFAULT_UNUSED_DAYS, checkFilters, parseUnusedDays } from "../format";
import type { StatFilters } from "../types";
import type { ExportColumn, StatTabModule } from "./tab-contract";

/** 개요 탭의 엑셀은 일별 추이를 내보낸다. */
export const DAILY_EXPORT_COLUMNS: ExportColumn[] = [
  { key: "usageDt", header: "일자" },
  { key: "openCnt", header: "열람 횟수" },
  { key: "userCnt", header: "이용자 수" },
  { key: "durationMs", header: "이용 시간" },
];

export const overviewTab: StatTabModule = {
  load: async (q) => ({
    overview: await fetchOverview(q),
    overviewRange: [q.fromDt, q.toDt] as const,
  }),
  // 다른 탭에서 입력한 잘못된 미사용 기준 일수가 서버 기본값(90)으로 조용히 조회되는 것을 막는다.
  check: (q) => checkFilters(q),
  toExport: (data) => ({ rows: data.overview?.daily ?? [], columns: DAILY_EXPORT_COLUMNS }),
};

/** 미사용 KPI 보조 문구 — [조회] 로 고정한 기준 일수(서버에 보낸 값과 같은 해석). */
export function unusedKpiCaption(q: StatFilters | null): string {
  const days = (q && parseUnusedDays(q.unusedDays)) ?? DEFAULT_UNUSED_DAYS;
  return `최근 ${days}일 이용 없음`;
}
