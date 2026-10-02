/**
 * 이용 이력 탭 모듈 — 31일 검사(조회 전), history 조회, 10,000행 안내, 엑셀 대상.
 * 그리드 열(배지 렌더 포함)은 HistoryTab.tsx 에 있다. 여기는 shared 를 런타임 import 하지 않는다(시험 격리).
 */
import { fetchHistory } from "../api";
import { HISTORY_TRUNCATED_NOTICE, checkHistoryPeriod } from "../format";
import type { ExportColumn, StatTabModule } from "./tab-contract";

/** 서버 최신순 상한(ScreenUsageHistoryQuery.HISTORY_MAX_ROWS)과 같다. */
export const HISTORY_ROW_LIMIT = 10_000;

/** HistoryTab.tsx 의 그리드 열과 같은 순서·제목. */
export const HISTORY_EXPORT_COLUMNS: ExportColumn[] = [
  { key: "startedAt", header: "시작" },
  { key: "endedAt", header: "종료" },
  { key: "durationMs", header: "이용 시간" },
  { key: "startKind", header: "시작 사유" },
  { key: "userId", header: "사용자 ID" },
  { key: "userNm", header: "사용자명" },
  { key: "deptNm", header: "부서" },
  { key: "menuNm", header: "화면명" },
  { key: "pageId", header: "화면 ID" },
  { key: "clientIp", header: "IP" },
];

export const historyTab: StatTabModule = {
  load: async (q) => ({ history: await fetchHistory(q) }),
  check: (q) => checkHistoryPeriod(q.fromDt, q.toDt),
  toExport: (data) => ({ rows: data.history, columns: HISTORY_EXPORT_COLUMNS }),
};

/** 상한만큼 받았으면 잘렸을 수 있으므로 안내한다(메인 결정 U3-6). */
export function historyLimitNotice(rowCount: number): string | null {
  return rowCount >= HISTORY_ROW_LIMIT ? HISTORY_TRUNCATED_NOTICE : null;
}
