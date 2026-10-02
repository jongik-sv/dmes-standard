/**
 * 여러 탭이 함께 쓰는 그리드 열. SCREEN_COLUMNS 는 화면별 탭(S2)과 부서별 탭의 선택 부서 화면별 그리드(S3)가 같이 쓴다.
 * 슬라이스는 이 파일을 고치지 않는다. 자기 탭 전용 열은 자기 `*-tab.ts` 에 둔다.
 */
import type { GridColumn } from "@dk-oasis/shared/grid";

import { formatDuration, formatYmd } from "../format";

export const countCol = (key: string, header: string): GridColumn => ({
  key,
  header,
  width: 100,
  align: "right",
  type: "number",
});

/** 이용 시간(ms) → "1시간 2분". null(예: 열람 0회의 평균)은 빈 칸. */
export const durationCol = (key: string, header: string): GridColumn => ({
  key,
  header,
  width: 100,
  align: "right",
  render: (v) => formatDuration(v),
});

export const ymdCol = (key: string, header: string): GridColumn => ({
  key,
  header,
  width: 100,
  align: "center",
  render: (v) => formatYmd(v),
});

/** 화면별 — 8열이라 fit. 남는 폭은 메뉴 경로. 메뉴 없는 화면은 서버 문구 "(메뉴 없음)" 그대로. */
export const SCREEN_COLUMNS: GridColumn[] = [
  { key: "menuNm", header: "화면명", width: 180, align: "left" },
  { key: "pageId", header: "화면 ID", width: 120, align: "left" },
  { key: "menuPath", header: "메뉴 경로", width: 100, minWidth: 180, align: "left" },
  countCol("openCnt", "열람 횟수"),
  countCol("userCnt", "이용자 수"),
  durationCol("durationMs", "총 이용 시간"),
  durationCol("avgDurationMs", "평균 이용 시간"),
  ymdCol("lastUsedDt", "마지막 이용일"),
];
