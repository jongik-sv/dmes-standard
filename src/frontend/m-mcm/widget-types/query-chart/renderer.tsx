"use client";

import { useMemo } from "react";
import { LineChart, PieChart, StackedColumnChart } from "@dk-oasis/shared/charts";
import { useWidgetBodySize, type WidgetProps } from "@dk-oasis/shared/widget";

import {
  barChartHeight,
  chartColor,
  chartConfigOf,
  lineChartHeight,
  pieChartSize,
  toChartData,
  toLinePoints,
  toPieSlices,
  type ChartData,
  type ChartType,
} from "../_query/format";
import { QueryEmpty, QueryStyle } from "../_query/parts";
import { useQueryData } from "../_query/useQueryData";

function ChartBody({ type, chart, body }: { type: ChartType; chart: ChartData; body: { width: number; height: number | null } }) {
  if (type === "pie") {
    // 원 차트는 첫 계열만 그린다.
    return (
      <div className="wq-center" data-testid="wq-chart-pie">
        <PieChart data={toPieSlices(chart)} size={pieChartSize(body)} />
      </div>
    );
  }
  if (type === "line" || type === "area") {
    // shared LineChart 는 계열 하나에 옅은 영역 채움이 늘 붙는다 — area 는 line 과 같게 그리고(별도 영역 옵션 없음),
    // 여러 계열은 계열마다 한 장씩 위아래로 나눠 그린다(다계열 선 차트가 shared 에 없다).
    const height = lineChartHeight(body.height, chart.series.length);
    return (
      <div className="wq-lines" data-testid="wq-chart-line">
        {chart.series.map((s, i) => (
          <LineChart
            key={s.key}
            data={toLinePoints(chart, i)}
            height={height}
            color={chartColor(i)}
            avgColor="var(--color-success)"
            showAvg={false}
            yLabel={s.label}
          />
        ))}
      </div>
    );
  }
  // bar — 세로 막대. 계열이 여럿이면 위로 쌓는다(shared 세로 막대 차트는 누적형).
  return (
    <div data-testid="wq-chart-bar">
      <StackedColumnChart
        categories={chart.categories}
        series={chart.series.map((s, i) => ({ ...s, color: chartColor(i) }))}
        height={barChartHeight(body.height)}
        ariaLabel="쿼리 결과 막대 차트"
      />
    </div>
  );
}

/** 쿼리 차트(스펙 §6 query-chart) — xField 가 가로축, series[].field 값은 숫자로. 크기는 위젯 본문 크기(useWidgetBodySize). */
export default function QueryChartRenderer({ definition, widgetId, refreshKey }: WidgetProps) {
  const data = useQueryData(definition, widgetId, refreshKey);
  const body = useWidgetBodySize();
  const cfg = useMemo(() => chartConfigOf(definition), [definition]);
  const chart = useMemo(() => (data ? toChartData(data.rows, cfg.xField, cfg.series) : null), [data, cfg]);

  return (
    <>
      <QueryStyle />
      {data &&
        chart &&
        (data.rows.length === 0 || chart.series.length === 0 ? (
          <QueryEmpty />
        ) : (
          <ChartBody type={cfg.chartType} chart={chart} body={body} />
        ))}
    </>
  );
}
