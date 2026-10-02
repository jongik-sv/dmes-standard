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
  return (
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
  );
}
