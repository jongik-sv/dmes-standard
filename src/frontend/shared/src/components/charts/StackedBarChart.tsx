"use client";

import { memo, useMemo, useState } from "react";

export interface StackedBarSegment {
  key: string;
  label: string;
  color: string;
}

export interface StackedBarRow {
  label: string;
  values: Record<string, number>;
}

interface StackedBarChartProps {
  rows: StackedBarRow[];
  segments: StackedBarSegment[];
  barHeight?: number;
  labelWidth?: number;
  chartWidth?: number;
  showPercentLabels?: boolean;
}

const StackedBarChart = memo(function StackedBarChart({
  rows,
  segments,
  barHeight = 26,
  labelWidth = 50,
  chartWidth = 400,
  showPercentLabels = true,
}: StackedBarChartProps) {
  const [hoverInfo, setHoverInfo] = useState<{ row: number; seg: string } | null>(null);

  const gap = 8;
  const totalH = rows.length * (barHeight + gap) + 30; // + legend space

  const maxTotal = useMemo(() => {
    let max = 0;
    for (const row of rows) {
      const sum = segments.reduce((s, seg) => s + (row.values[seg.key] ?? 0), 0);
      if (sum > max) max = sum;
    }
    return max || 1;
  }, [rows, segments]);

  if (rows.length === 0) return <div style={{ color: "#999", fontSize: 12, padding: 12 }}>데이터 없음</div>;

  return (
    <div>
      <svg
        width={labelWidth + chartWidth + 60}
        height={totalH}
        style={{ display: "block" }}
        onMouseLeave={() => setHoverInfo(null)}
      >
        {rows.map((row, ri) => {
          const y = ri * (barHeight + gap);
          const rowTotal = segments.reduce((s, seg) => s + (row.values[seg.key] ?? 0), 0);
          let xOffset = labelWidth;

          return (
            // key 는 index 사용 — 데이터 가공 측에서 같은 label 이 두 row 로 들어올 수 있음
            // (예: 자원코드 다른데 자원명 같은 케이스). 정렬은 외부에서 고정되어 reconcile 안전.
            <g key={ri}>
              <text x={labelWidth - 6} y={y + barHeight / 2 + 4} textAnchor="end" fontSize={12} fill="#555">
                {row.label}
              </text>
              {segments.map((seg) => {
                const val = row.values[seg.key] ?? 0;
                if (val === 0) return null;
                const w = (val / maxTotal) * chartWidth;
                const currX = xOffset;
                xOffset += w;
                const isHovered = hoverInfo?.row === ri && hoverInfo?.seg === seg.key;

                return (
                  <g
                    key={seg.key}
                    onMouseEnter={() => setHoverInfo({ row: ri, seg: seg.key })}
                  >
                    <rect
                      x={currX}
                      y={y}
                      width={Math.max(w, 1)}
                      height={barHeight}
                      fill={seg.color}
                      opacity={isHovered ? 1 : 0.85}
                      rx={ri === 0 || ri === rows.length - 1 ? 0 : 0}
                    />
                    {showPercentLabels && w > 30 && (
                      <text
                        x={currX + w / 2}
                        y={y + barHeight / 2 + 4}
                        textAnchor="middle"
                        fontSize={10}
                        fill="#fff"
                        fontWeight={600}
                      >
                        {rowTotal > 0 ? `${((val / rowTotal) * 100).toFixed(0)}%` : ""}
                      </text>
                    )}
                  </g>
                );
              })}
              {/* Row total */}
              <text x={xOffset + 6} y={y + barHeight / 2 + 4} fontSize={11} fill="#666">
                {rowTotal.toLocaleString()}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, marginTop: 8, paddingLeft: labelWidth }}>
        {segments.map((seg) => (
          <div key={seg.key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 12, height: 12, borderRadius: 2, background: seg.color }} />
            <span style={{ fontSize: 11, color: "#666" }}>{seg.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
});

export default StackedBarChart;
