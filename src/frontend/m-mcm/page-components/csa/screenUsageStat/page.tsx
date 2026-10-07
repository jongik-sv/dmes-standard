"use client";

/**
 * screenUsageStat — 화면 사용 통계(관리자). 조회 화면 A 유형 + shared Tabs 6개.
 * 설계: docs/superpowers/specs/2026-10-02-screen-usage-stats-design.md §5 · 응답 계약: 총괄 계획 C4.
 * - 첫 진입 자동 조회는 하지 않는다(커밋 c564a05f 방향). [조회] 가 조건을 고정하고 활성 탭을 다시 부른다.
 * - 탭을 바꾸면 고정된 조건으로 그 탭만 부른다. 같은 조건으로 이미 받은 탭은 다시 부르지 않는다.
 * - 탭별 조회·검사·엑셀 대상은 tabs/*-tab.ts(TAB_MODULES), 그리기는 tabs/*Tab.tsx 가 맡는다.
 */
import { useCallback, useMemo, useState } from "react";

import { DatePicker } from "@dk-oasis/shared/form";
import { PageLayout, SearchArea, SearchField } from "@dk-oasis/shared/layout";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { useCarryRefetch, useCarryState } from "@dk-oasis/shared/portal-shell";
import { Tabs } from "@dk-oasis/shared/tabs";
import { exportToExcel, today } from "@dk-oasis/shared/utils";

import { createTabRequestTracker, statQueryKey } from "./api";
import { DEFAULT_UNUSED_DAYS, toExportRows } from "./format";
import DeptTab from "./tabs/DeptTab";
import HistoryTab from "./tabs/HistoryTab";
import OverviewTab from "./tabs/OverviewTab";
import ScreenTab from "./tabs/ScreenTab";
import UnusedTab from "./tabs/UnusedTab";
import UserTab from "./tabs/UserTab";
import { checkSearch, exportFileName, type StatTabViewProps } from "./tabs/tab-contract";
import { TAB_MODULES } from "./tabs/tab-modules";
import {
  TAB_ITEMS,
  TAB_LABEL,
  emptyFilters,
  emptyStatData,
  type StatData,
  type StatFilters,
  type StatTab,
} from "./types";

const SCREEN_ID = "screenUsageStat";

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function ScreenUsageStatPage() {
  const { showMessage } = useMessage();
  // 새 창으로 분리할 때 이어받는 상태(useCarryState) — 조회 조건·고정 조건·활성 탭은 가볍게, 조회 결과(탭별 목록 묶음)는 bulky.
  // 결과가 탭별 배열을 담은 한 객체라 비었는지는 알 수 없다 — 조회 전에는 submitted 가 null 이라 재조회 함수가 아무것도 부르지 않는다.
  const [filters, setFilters] = useCarryState<StatFilters>("filters", emptyFilters);
  /** [조회] 로 고정한 조건. null 이면 아직 조회 전이라 탭을 바꿔도 부르지 않는다. */
  const [submitted, setSubmitted] = useCarryState<StatFilters | null>("submitted", null);
  const [tab, setTab] = useCarryState<StatTab>("tab", "overview");
  const [data, setData] = useCarryState<StatData>("data", emptyStatData, { bulky: true });
  const [isBusy, setIsBusy] = useState(false);
  // 요청 조정기는 렌더마다 새로 만들지 않도록 초기화 함수로 한 번만 만든다(렌더 중에는 읽지 않는다).
  const [tracker] = useState(() => createTabRequestTracker<StatTab>());

  const loadTab = useCallback(
    async (target: StatTab, q: StatFilters) => {
      const key = statQueryKey(target, q);
      if (tracker.isLoaded(target, key)) return;
      const mod = TAB_MODULES[target];
      const msg = mod.check?.(q) ?? null;
      if (msg) {
        showMessage({ message: msg, alertType: "warning" });
        return;
      }
      const n = tracker.begin(target);
      setIsBusy(true);
      try {
        const patch = await mod.load(q);
        if (!tracker.isLatest(target, n)) return;
        setData((prev) => ({ ...prev, ...patch }));
        tracker.markLoaded(target, key);
      } catch (e) {
        if (tracker.isLatest(target, n)) {
          // 서버 거절(meta.success=false)은 api.ts 가 서버 문구로 던진다 — 그대로 알린다.
          showMessage({ title: "오류", message: errorText(e), alertType: "error" });
        }
      } finally {
        setIsBusy(tracker.finish());
      }
    },
    [tracker, showMessage, setData]
  );

  // 분리 창이 조회 결과를 못 받았을 때(opener 를 못 쓰는 경우) 이어받은 고정 조건으로 활성 탭을 한 번 다시 조회한다.
  useCarryRefetch(() => (submitted ? loadTab(tab, submitted) : undefined));

  const handleSearch = useCallback(() => {
    const msg = checkSearch(tab, filters);
    if (msg) {
      showMessage({ message: msg, alertType: "warning" });
      return;
    }
    const q = { ...filters };
    setSubmitted(q);
    tracker.reset();
    // 새 조건의 조회이므로 이전 결과를 비운다(검사에서 막히거나 실패해도 옛 결과가 남지 않게).
    setData(emptyStatData());
    void loadTab(tab, q);
  }, [filters, tab, tracker, loadTab, showMessage, setData, setSubmitted]);

  const handleTabChange = useCallback(
    (k: string) => {
      const next = k as StatTab;
      setTab(next);
      if (submitted) void loadTab(next, submitted);
    },
    [submitted, loadTab, setTab]
  );

  const exportInfo = useMemo(() => TAB_MODULES[tab].toExport(data), [tab, data]);

  const handleExport = useCallback(() => {
    void exportToExcel(
      toExportRows(exportInfo.rows),
      exportFileName(TAB_LABEL[tab], today()),
      "Sheet1",
      exportInfo.columns
    );
  }, [tab, exportInfo]);

  const setFilter = (key: keyof StatFilters, value: string) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const viewProps: StatTabViewProps = { data, query: submitted, busy: isBusy };

  return (
    <PageLayout
      title="화면 사용 통계"
      breadcrumb="공통관리 > 시스템관리 > 화면 사용 통계"
      screenId={SCREEN_ID}
      objId={SCREEN_ID}
      buttons={[
        {
          id: "btn_search",
          label: "조회",
          onClick: handleSearch,
          type: "primary",
          disabled: isBusy,
          action: "search",
        },
        {
          id: "btn_export",
          label: "엑셀",
          onClick: handleExport,
          disabled: isBusy || exportInfo.rows.length === 0,
          action: "export",
        },
      ]}
    >
      <SearchArea onSearch={handleSearch}>
        {/* 기간 두 칸을 기본값 대상으로 묶는다(설계 2026-10-07-search-defaults §7.3). To 칸 키는 label="~" 짝이라 `fromDt~to` 로 자동 정해진다. */}
        <SearchField label="조회 기간" defaultKey="fromDt" type="date" value={filters.fromDt} onChange={(v) => setFilter("fromDt", v)}>
          <DatePicker value={filters.fromDt} onChange={(v) => setFilter("fromDt", v)} />
        </SearchField>
        <SearchField label="~" type="date" value={filters.toDt} onChange={(v) => setFilter("toDt", v)}>
          <DatePicker value={filters.toDt} onChange={(v) => setFilter("toDt", v)} />
        </SearchField>
        <SearchField
          label="부서코드"
          name="deptCd"
          value={filters.deptCd}
          onChange={(v) => setFilter("deptCd", v)}
          placeholder="정확히 입력 (부서 없음: -)"
        />
        <SearchField
          label="사용자"
          name="userId"
          value={filters.userId}
          onChange={(v) => setFilter("userId", v)}
          placeholder="사용자 ID 정확히 입력"
        />
        <SearchField
          label="화면"
          name="pageId"
          value={filters.pageId}
          onChange={(v) => setFilter("pageId", v)}
          placeholder="화면 ID 정확히 입력 (예: csa/commUserMng)"
        />
        {(tab === "overview" || tab === "unused") && (
          <SearchField
            label="미사용 기준(일)"
            name="unusedDays"
            meta={false}
            value={filters.unusedDays}
            onChange={(v) => setFilter("unusedDays", v)}
            placeholder={String(DEFAULT_UNUSED_DAYS)}
          />
        )}
      </SearchArea>

      <Tabs items={TAB_ITEMS} activeKey={tab} onChange={handleTabChange} />

      {tab === "overview" && <OverviewTab {...viewProps} />}
      {tab === "screen" && <ScreenTab {...viewProps} />}
      {tab === "dept" && <DeptTab {...viewProps} />}
      {tab === "user" && <UserTab {...viewProps} />}
      {tab === "unused" && <UnusedTab {...viewProps} />}
      {tab === "history" && <HistoryTab {...viewProps} />}
    </PageLayout>
  );
}
