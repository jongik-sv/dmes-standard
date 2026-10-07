/**
 * screenUsageStat OASIS 호출 — POST /api/mcm/oasis/screenUsageStat/{action}.
 * 응답 계약: docs/superpowers/plans/2026-10-02-screen-usage-stats.md C4.
 * envelope 해제는 csa/commSyncMng/api.ts 와 같은 규칙이다: meta.success=false 거절, data(+data.result) 펼침, grids.{key}.rows.
 * meta.userId 는 보내지 않는다 — 서버가 인증 정보로 채운다(lsh/noticeMgmt/api.ts 와 같다).
 * @dk-oasis/shared 를 런타임 import 하지 않는다(m-mcm vitest 가 shared dist 없이 시험한다).
 */
import { createJsonApiClient } from "@/lib/http/json-api-client";

import { parseUnusedDays, toYmd } from "./format";
import type {
  ScreenUsageDeptRow,
  ScreenUsageHistoryRow,
  ScreenUsageOverview,
  ScreenUsageScreenRow,
  ScreenUsageUnusedRow,
  ScreenUsageUserGridRow,
  ScreenUsageUserRow,
  StatAction,
  StatFilters,
  StatTab,
} from "./types";

const api = createJsonApiClient();

const SCREEN_ID = "screenUsageStat";
const OASIS_BASE = `/api/mcm/oasis/${SCREEN_ID}`;

export const TAB_ACTION: Record<StatTab, StatAction> = {
  overview: "overview",
  screen: "byScreen",
  dept: "byDept",
  user: "byUser",
  unused: "unused",
  history: "history",
};

interface CactusEnvelope {
  meta?: { success?: boolean; message?: string };
  data?: Record<string, unknown>;
  grids?: Record<string, { rows?: unknown[] }>;
}

function unwrapPayload(res: unknown): Record<string, unknown> {
  const env = res as CactusEnvelope;
  // OASIS 실행기는 업무 거절을 HTTP 200 + meta.success=false 로 돌려준다(commSyncMng/api.ts 주석 참고).
  if (env?.meta && env.meta.success === false) {
    throw new Error(env.meta.message?.trim() || "요청이 거부되었습니다.");
  }
  const out: Record<string, unknown> = {};
  if (env?.data) {
    Object.assign(out, env.data);
    const inner = env.data["result"];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      Object.assign(out, inner as Record<string, unknown>);
    }
  }
  if (env?.grids) {
    for (const [key, val] of Object.entries(env.grids)) {
      out[key] = val?.rows ?? [];
    }
  }
  return out;
}

async function callAction(
  action: StatAction,
  params: Record<string, string | number>
): Promise<Record<string, unknown>> {
  const res = await api.request<unknown>(`${OASIS_BASE}/${action}`, {
    method: "POST",
    body: { meta: { menuId: SCREEN_ID }, params },
  });
  return unwrapPayload(res);
}

function rowsOf<T>(out: Record<string, unknown>, key: string): T[] {
  const v = out[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * C4 공통 params. 기간은 yyyyMMdd, 빈 조건은 보내지 않는다.
 * deptCd 인자는 부서별 탭의 "선택 부서 화면별" 조회용으로 조회조건 부서보다 우선한다.
 * unusedDays 는 unused·overview 탭에 숫자로 싣는다(메인 결정 1·7, 빈 값이면 키를 뺀다).
 */
export function buildStatParams(
  tab: StatTab,
  q: StatFilters,
  deptCd?: string
): Record<string, string | number> {
  const params: Record<string, string | number> = { fromDt: toYmd(q.fromDt), toDt: toYmd(q.toDt) };
  const dept = (deptCd ?? q.deptCd).trim();
  if (dept) params.deptCd = dept;
  const userId = q.userId.trim();
  if (userId) params.userId = userId;
  const pageId = q.pageId.trim();
  if (pageId) params.pageId = pageId;
  if (tab === "unused" || tab === "overview") {
    // 빈 값이면 키를 뺀다(서버 기본 90). 검사를 통과한 값만 오지만 잘못된 값도 키를 뺀다.
    const days = q.unusedDays.trim() === "" ? null : parseUnusedDays(q.unusedDays);
    if (days !== null) params.unusedDays = days;
  }
  return params;
}

/** 탭별 조회 조건 키 — 실제로 보낼 params 로 만든다. 같으면 탭 전환 때 다시 부르지 않는다. */
export function statQueryKey(tab: StatTab, q: StatFilters): string {
  return `${tab}:${JSON.stringify(buildStatParams(tab, q))}`;
}

export async function fetchOverview(q: StatFilters): Promise<ScreenUsageOverview> {
  const out = await callAction("overview", buildStatParams("overview", q));
  return {
    totalOpenCnt: num(out.totalOpenCnt),
    userCnt: num(out.userCnt),
    totalDurationMs: num(out.totalDurationMs),
    unusedScreenCnt: num(out.unusedScreenCnt),
    daily: rowsOf(out, "daily"),
    topScreens: rowsOf(out, "topScreens"),
  };
}

export async function fetchByScreen(
  q: StatFilters,
  deptCd?: string
): Promise<ScreenUsageScreenRow[]> {
  const out = await callAction("byScreen", buildStatParams("screen", q, deptCd));
  return rowsOf(out, "screens");
}

export async function fetchByDept(q: StatFilters): Promise<ScreenUsageDeptRow[]> {
  const out = await callAction("byDept", buildStatParams("dept", q));
  return rowsOf(out, "depts");
}

export async function fetchByUser(q: StatFilters): Promise<ScreenUsageUserGridRow[]> {
  const out = await callAction("byUser", buildStatParams("user", q));
  return rowsOf<ScreenUsageUserRow>(out, "users").map((r) => ({
    ...r,
    rowKey: `${r.userId}|${r.deptCd}`,
  }));
}

export async function fetchUnused(q: StatFilters): Promise<ScreenUsageUnusedRow[]> {
  const out = await callAction("unused", buildStatParams("unused", q));
  return rowsOf(out, "unused");
}

export async function fetchHistory(q: StatFilters): Promise<ScreenUsageHistoryRow[]> {
  const out = await callAction("history", buildStatParams("history", q));
  return rowsOf(out, "history");
}

export interface TabRequestTracker<K extends string> {
  /** 이 탭을 이 조건 키로 이미 받았는가. */
  isLoaded(tab: K, key: string): boolean;
  /** 요청 시작 — 탭별 순번을 올리고 대기 수를 하나 늘린다. 돌려준 순번으로 isLatest 를 묻는다. */
  begin(tab: K): number;
  /** 이 순번이 그 탭의 마지막 요청인가(늦게 온 이전 응답은 버린다). */
  isLatest(tab: K, n: number): boolean;
  markLoaded(tab: K, key: string): void;
  /** 요청 끝 — 대기 수를 하나 줄이고, 아직 남은 요청이 있으면 true(로딩 표시 유지). */
  finish(): boolean;
  /** [조회] 로 조건을 새로 고정할 때 받은 키를 모두 잊는다. 순번은 그대로 둔다. */
  reset(): void;
}

/** 탭 요청 조정 — React 밖 작은 상태라 시험할 수 있다. 화면은 useState 초기화 함수로 한 번만 만든다. */
export function createTabRequestTracker<K extends string>(): TabRequestTracker<K> {
  const loaded = new Map<K, string>();
  const seq = new Map<K, number>();
  let pending = 0;
  return {
    isLoaded: (tab, key) => loaded.get(tab) === key,
    begin: (tab) => {
      const n = (seq.get(tab) ?? 0) + 1;
      seq.set(tab, n);
      pending += 1;
      return n;
    },
    isLatest: (tab, n) => seq.get(tab) === n,
    markLoaded: (tab, key) => {
      loaded.set(tab, key);
    },
    finish: () => {
      pending = Math.max(0, pending - 1);
      return pending > 0;
    },
    reset: () => {
      loaded.clear();
    },
  };
}
