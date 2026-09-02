"use client";

import { memo } from "react";

export interface PieSlice {
  label: string;
  value: number;
  color: string;
}

interface PieChartProps {
  data: PieSlice[];
  size?: number;
  showLegend?: boolean;
}

const PieChart = memo(function PieChart({ data, size = 180, showLegend = true }: PieChartProps) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <div style={{ color: "#999", fontSize: 12, padding: 12 }}>데이터 없음</div>;

  const r = size / 2 - 10;
  const cx = size / 2;
  const cy = size / 2;
  let cumAngle = -Math.PI / 2;

  const slices = data
    .filter((d) => d.value > 0)
    .map((d) => {
      const angle = (d.value / total) * 2 * Math.PI;
      const startX = cx + r * Math.cos(cumAngle);
      const startY = cy + r * Math.sin(cumAngle);
      cumAngle += angle;
      const endX = cx + r * Math.cos(cumAngle);
      const endY = cy + r * Math.sin(cumAngle);
      const large = angle > Math.PI ? 1 : 0;
      const path = `M${cx},${cy} L${startX},${startY} A${r},${r} 0 ${large} 1 ${endX},${endY} Z`;
      return { ...d, path, pct: ((d.value / total) * 100).toFixed(1) };
    });

  return (
    <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
      <svg width={size} height={size}>
        {slices.map((s) => (
          <path key={s.label} d={s.path} fill={s.color} opacity={0.85} stroke="#fff" strokeWidth={1} />
        ))}
      </svg>
      {showLegend && (
        <div style={{ fontSize: 12 }}>
          {slices.map((s) => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <div style={{ width: 12, height: 12, borderRadius: 2, background: s.color, flexShrink: 0 }} />
              <span>
                {s.label}: {s.value}건 ({s.pct}%)
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

export default PieChart;
