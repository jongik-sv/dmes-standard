"use client";

/** 개요 탭 화면 — KPI 4개, 일별 열람 추이, 많이 연 화면 상위 10개. */
import { useMemo } from "react";

import { HBarChart, LineChart } from "@dk-oasis/shared/charts";
import {
  DashboardCard,
  DashboardCell,
  DashboardGrid,
  KpiTile,
  KpiTileGroup,
} from "@dk-oasis/shared/dashboard";
import { today } from "@dk-oasis/shared/utils";

import { formatDuration, toDailyPoints, toTopBars } from "../format";
import { unusedKpiCaption } from "./overview-tab";
import type { StatTabViewProps } from "./tab-contract";

const fmtCount = (n: number | undefined) => (n === undefined ? "-" : n.toLocaleString("ko-KR"));

export default function OverviewTab({ data, query }: StatTabViewProps) {
  const { overview, overviewRange: range } = data;
  const points = useMemo(
    () => (overview && range ? toDailyPoints(overview.daily, range[0], range[1], today()) : []),
    [overview, range]
  );
  const bars = useMemo(
    () => (overview ? toTopBars(overview.topScreens, "var(--color-chart-1)") : []),
    [overview]
  );
  return (
    <DashboardGrid fill ariaLabel="화면 사용 개요">
      <DashboardCell span={12}>
        <KpiTileGroup ariaLabel="주요 지표">
          <KpiTile label="총 열람" value={fmtCount(overview?.totalOpenCnt)} unit="회" />
          <KpiTile label="이용자 수" value={fmtCount(overview?.userCnt)} unit="명" />
          <KpiTile
            label="총 이용 시간"
            value={overview ? formatDuration(overview.totalDurationMs) : "-"}
          />
          <KpiTile
            label="미사용 화면"
            value={fmtCount(overview?.unusedScreenCnt)}
            unit="개"
            target={unusedKpiCaption(query)}
          />
        </KpiTileGroup>
      </DashboardCell>
      <DashboardCard span={7} title="일별 열람 추이" subtitle="열람 횟수">
        <LineChart
          data={points}
          height={260}
          color="var(--color-primary)"
          avgColor="var(--color-success)"
          avgLabel="평균"
        />
      </DashboardCard>
      <DashboardCard span={5} title="많이 연 화면" subtitle="상위 10개 · 열람 횟수">
        {/* HBarChart 는 고정 폭 SVG 이고 카드가 overflow:hidden 이라 가로 스크롤을 부모가 맡는다(Local-Rules §17). */}
        <div style={{ overflowX: "auto" }}>
          <HBarChart data={bars} labelWidth={160} chartWidth={280} barHeight={20} />
        </div>
      </DashboardCard>
    </DashboardGrid>
  );
}
