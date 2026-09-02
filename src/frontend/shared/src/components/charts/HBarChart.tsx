"use client";

import { memo } from "react";

export interface BarData {
  label: string;
  value: number;
  color: string;
}

interface HBarChartProps {
  data: BarData[];
  maxValue?: number;
  barHeight?: number;
  labelWidth?: number;
  chartWidth?: number;
}

const HBarChart = memo(function HBarChart({
  data,
  maxValue,
  barHeight = 22,
  labelWidth = 100,
  chartWidth = 320,
}: HBarChartProps) {
  const max = maxValue ?? Math.max(...data.map((d) => d.value), 1);
  const gap = 6;
  const totalH = data.length * (barHeight + gap);

  return (
    <svg width={labelWidth + chartWidth + 50} height={totalH} style={{ display: "block" }}>
      {data.map((d, i) => {
        const y = i * (barHeight + gap);
        const w = (d.value / max) * chartWidth;
        return (
          <g key={d.label}>
            <text x={labelWidth - 6} y={y + barHeight / 2 + 4} textAnchor="end" fontSize={12} fill="#555">
              {d.label}
            </text>
            <rect x={labelWidth} y={y} width={Math.max(w, 2)} height={barHeight} rx={3} fill={d.color} opacity={0.85} />
            <text x={labelWidth + w + 6} y={y + barHeight / 2 + 4} fontSize={11} fill="#333" fontWeight={600}>
              {d.value}
            </text>
          </g>
        );
      })}
    </svg>
  );
});

export default HBarChart;
