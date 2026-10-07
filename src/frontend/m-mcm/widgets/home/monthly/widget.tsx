"use client";

import { StackedColumnChart } from "@dk-oasis/shared/charts";
import { useWidgetBodySize } from "@dk-oasis/shared/widget";

import { monthlyChartHeight } from "@/page-components/home/chart-sizing";
import {
  MONTHLY_COATED,
  MONTHLY_COLD,
  MONTHLY_COLOR,
  MONTHLY_LAST_ACTUAL,
  MONTHLY_PLAN,
  MONTHS,
} from "@/page-components/home/sample-data";

const MONTHLY_SERIES = [
  { key: "cold", label: "냉연", color: "var(--color-chart-1)", values: MONTHLY_COLD },
  { key: "coated", label: "도금", color: "var(--color-chart-2)", values: MONTHLY_COATED },
  { key: "color", label: "컬러", color: "var(--color-chart-3)", values: MONTHLY_COLOR },
];
const MONTHLY_LINE = { label: "계획(합계)", color: "var(--color-chart-4)", values: MONTHLY_PLAN };

export default function MonthlyWidget() {
  const size = useWidgetBodySize();
  // 차트 높이는 범례 한 줄을 가정해 본문 높이에서 뺀다. 좁은 폭에서 범례가 두 줄로 접히면 넘치는데, 그 넘침을 위젯 본문(overflow:auto)이
  // 받으면 스크롤바가 생기고 사라지며 본문 폭·높이와 차트 높이가 서로를 끌어 떤다(위젯 관리 미리보기에서 최소 11×12 등).
  // 그래서 넘침은 이 안쪽 상자가 세로로만 받고, 가로는 막아 늦게 따라오는 차트 폭이 가로 스크롤바를 만들지 못하게 한다.
  return (
    <div style={{ height: "100%", overflowX: "hidden", overflowY: "auto" }} data-testid="home-monthly-box">
      <StackedColumnChart
        height={monthlyChartHeight(size)}
        categories={MONTHS}
        series={MONTHLY_SERIES}
        line={MONTHLY_LINE}
        dimFrom={MONTHLY_LAST_ACTUAL + 1}
        dimLabel="10~12월은 전망(옅은 색)"
        totalAt={MONTHLY_LAST_ACTUAL}
        unit="천 t"
        ariaLabel="제품군별 월 생산 실적과 계획"
      />
    </div>
  );
}
