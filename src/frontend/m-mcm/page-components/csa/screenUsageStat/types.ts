/**
 * screenUsageStat 타입·상수. 행 타입은 총괄 계획(docs/superpowers/plans/2026-10-02-screen-usage-stats.md) C4 그대로다.
 * 일자(usageDt·lastUsedDt)는 yyyyMMdd, 시각(startedAt·endedAt)은 "yyyy-MM-dd HH:mm:ss"(Asia/Seoul) 문자열, 시간·건수는 숫자.
 * 메뉴에 없는 화면은 menuNm "(메뉴 없음)", 부서 없음은 deptCd "-" · deptNm "(부서 없음)" 으로 온다.
 */
import type { TabItem } from "@dk-oasis/shared/tabs";
import { addDays, formatDateStr, today } from "@dk-oasis/shared/utils";

import { DEFAULT_UNUSED_DAYS } from "./format";

export type StatTab = "overview" | "screen" | "dept" | "user" | "unused" | "history";
export type StatAction = "overview" | "byScreen" | "byDept" | "byUser" | "unused" | "history";
export type UsageStartKind = "OPEN" | "SWITCH" | "RESUME";

/** 조회조건. 날짜는 DatePicker 값(yyyy-MM-dd), 서버로 보낼 때 api.ts 가 yyyyMMdd 로 바꾼다. */
export interface StatFilters {
  fromDt: string;
  toDt: string;
  deptCd: string;
  userId: string;
  pageId: string;
  /** 미사용 화면 탭의 기준 일수 입력값. 비면 90. */
  unusedDays: string;
}

export interface ScreenUsageDailyRow extends Record<string, unknown> {
  usageDt: string;
  openCnt: number;
  userCnt: number;
  durationMs: number;
}

export interface ScreenUsageTopScreen extends Record<string, unknown> {
  pageId: string;
  menuNm: string;
  openCnt: number;
  durationMs: number;
}

/** overview → data.result */
export interface ScreenUsageOverview {
  totalOpenCnt: number;
  userCnt: number;
  totalDurationMs: number;
  unusedScreenCnt: number;
  daily: ScreenUsageDailyRow[];
  topScreens: ScreenUsageTopScreen[];
}

/** byScreen → grids.screens.rows */
export interface ScreenUsageScreenRow extends Record<string, unknown> {
  pageId: string;
  menuNm: string;
  menuPath: string;
  openCnt: number;
  userCnt: number;
  durationMs: number;
  avgDurationMs: number | null;
  lastUsedDt: string | null;
}

/** byDept → grids.depts.rows */
export interface ScreenUsageDeptRow extends Record<string, unknown> {
  deptCd: string;
  deptNm: string;
  userCnt: number;
  openCnt: number;
  durationMs: number;
  topPageId: string | null;
  topMenuNm: string | null;
}

/** byUser → grids.users.rows */
export interface ScreenUsageUserRow extends Record<string, unknown> {
  userId: string;
  userNm: string;
  deptCd: string;
  deptNm: string;
  openCnt: number;
  durationMs: number;
  lastUsedDt: string | null;
}

/** 사용자별 그리드 행 — 부서 스냅숏 때문에 한 사용자가 여러 행일 수 있어 userId|deptCd 를 행 키로 쓴다. */
export type ScreenUsageUserGridRow = ScreenUsageUserRow & { rowKey: string };

/** unused → grids.unused.rows */
export interface ScreenUsageUnusedRow extends Record<string, unknown> {
  pageId: string;
  menuNm: string;
  menuPath: string;
  lastUsedDt: string | null;
}

/** history → grids.history.rows */
export interface ScreenUsageHistoryRow extends Record<string, unknown> {
  usageId: string;
  userId: string;
  userNm: string;
  deptCd: string;
  deptNm: string;
  pageId: string;
  menuNm: string;
  startKind: UsageStartKind;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  clientIp: string | null;
}

/** 탭별 조회 결과. overviewRange 는 개요를 부른 기간(yyyy-MM-dd 쌍) — 추이 선의 빈 날 채움에 쓴다. */
export interface StatData {
  overview: ScreenUsageOverview | null;
  overviewRange: readonly [string, string] | null;
  screens: ScreenUsageScreenRow[];
  depts: ScreenUsageDeptRow[];
  users: ScreenUsageUserGridRow[];
  unused: ScreenUsageUnusedRow[];
  history: ScreenUsageHistoryRow[];
}

export const emptyStatData = (): StatData => ({
  overview: null,
  overviewRange: null,
  screens: [],
  depts: [],
  users: [],
  unused: [],
  history: [],
});

/** 기간 기본값: 오늘-30일 ~ 오늘(설계 §5). today()·addDays() 는 yyyyMMdd 라 formatDateStr 로 DatePicker 형식으로 바꾼다. */
export const emptyFilters = (): StatFilters => ({
  fromDt: formatDateStr(addDays(today(), -30)),
  toDt: formatDateStr(today()),
  deptCd: "",
  userId: "",
  pageId: "",
  unusedDays: String(DEFAULT_UNUSED_DAYS),
});

export const TAB_LABEL: Record<StatTab, string> = {
  overview: "개요",
  screen: "화면별",
  dept: "부서별",
  user: "사용자별",
  unused: "미사용 화면",
  history: "이용 이력",
};

const TAB_ORDER: StatTab[] = ["overview", "screen", "dept", "user", "unused", "history"];

export const TAB_ITEMS: TabItem[] = TAB_ORDER.map((key) => ({ key, label: TAB_LABEL[key] }));
