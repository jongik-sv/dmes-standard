"use client";

import { useMemo, useState } from "react";
import { LineChart, PieChart, StackedColumnChart } from "@dk-oasis/shared/charts";
import { useWidgetBodySize, type WidgetProps } from "@dk-oasis/shared/widget";

import {
  barChartHeight,
  chartColor,
  chartConfigOf,
  hasPieData,
  lineChartHeight,
  pieChartSize,
  pieUnitOf,
  toChartData,
  toLinePoints,
  toPieSlices,
  type ChartData,
  type ChartType,
} from "../_query/format";
import { QueryShell } from "../_query/ConditionBar";
import { QueryEmpty, QueryStyle } from "../_query/parts";
import { useQueryData } from "../_query/useQueryData";

function ChartBody({
  type,
  chart,
  body,
  unit,
}: {
  type: ChartType;
  chart: ChartData;
  body: { width: number; height: number | null };
  unit?: string;
}) {
  if (type === "pie") {
    // 원 차트는 첫 계열만 그린다. 양수 합이 0 이면 shared PieChart 의 「데이터 없음」 대신 QueryEmpty.
    // 범례 단위는 설정 unit 이 먼저, 없으면 계열 이름 끝 괄호(「사용 시간(분)」→분), 그것도 없으면 "" — 안 넘기면 shared 기본 「건」이 붙는다.
    const slices = toPieSlices(chart);
    if (!hasPieData(slices)) return <QueryEmpty />;
    return (
      <div className="wq-center" data-testid="wq-chart-pie">
        <PieChart data={slices} size={pieChartSize(body)} unit={pieUnitOf(chart, unit)} />
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
  const { data, condition } = useQueryData(definition, widgetId, refreshKey);
  const frame = useWidgetBodySize();
  // 조건 줄이 본문 위를 차지하므로 그림 크기는 그 높이를 뺀 값으로 정한다(줄이 없으면 0).
  const [barHeight, setBarHeight] = useState(0);
  const body = useMemo(
    () => ({ width: frame.width, height: frame.height == null ? null : Math.max(0, frame.height - barHeight) }),
    [frame.width, frame.height, barHeight]
  );
  const cfg = useMemo(() => chartConfigOf(definition), [definition]);
  const chart = useMemo(() => (data ? toChartData(data.rows, cfg.xField, cfg.series) : null), [data, cfg]);

  return (
    <>
      <QueryStyle />
      <QueryShell condition={condition} onBarHeight={setBarHeight}>
        {data &&
          chart &&
          (data.rows.length === 0 || chart.series.length === 0 ? (
            <QueryEmpty />
          ) : (
            <ChartBody type={cfg.chartType} chart={chart} body={body} unit={cfg.unit} />
          ))}
      </QueryShell>
    </>
  );
}
