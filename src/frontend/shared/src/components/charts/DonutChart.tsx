"use client";

import { memo, useState } from "react";

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
  icon?: string;
}

interface DonutChartProps {
  data: DonutSlice[];
  size?: number;
  innerRadius?: number;
  centerLabel?: string;
  centerValue?: string;
}

// ---- Hover tooltip for single slice ----
function SliceTooltip({
  slice,
  total,
  x,
}: {
  slice: DonutSlice;
  total: number;
  x: number;
}) {
  const pct = total > 0 ? ((slice.value / total) * 100).toFixed(1) : "0.0";
  return (
    <div
      style={{
        position: "absolute",
        left: x + 8,
        top: "50%",
        transform: "translateY(-50%)",
        background: "#fff",
        border: "1px solid #e0e0e0",
        borderRadius: 8,
        boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
        padding: "12px 16px",
        zIndex: 10,
        whiteSpace: "nowrap",
        pointerEvents: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: slice.color, display: "inline-block" }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: "#333" }}>{slice.label}</span>
      </div>
      <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
        <div>
          <div style={{ color: "#888", marginBottom: 2 }}>건수</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#1a1a2e" }}>{slice.value.toLocaleString()}</div>
        </div>
        <div>
          <div style={{ color: "#888", marginBottom: 2 }}>비율</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: slice.color }}>{pct}%</div>
        </div>
        <div>
          <div style={{ color: "#888", marginBottom: 2 }}>전체</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#666" }}>{total.toLocaleString()}</div>
        </div>
      </div>
    </div>
  );
}

// ---- Helper: compute arc path with optional radial offset ----
function computeArcPath(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  startAngle: number,
  endAngle: number,
  offset: number = 0,
): string {
  const midAngle = (startAngle + endAngle) / 2;
  const ox = offset * Math.cos(midAngle);
  const oy = offset * Math.sin(midAngle);
  const osx = cx + ox + outerR * Math.cos(startAngle);
  const osy = cy + oy + outerR * Math.sin(startAngle);
  const oex = cx + ox + outerR * Math.cos(endAngle);
  const oey = cy + oy + outerR * Math.sin(endAngle);
  const iex = cx + ox + innerR * Math.cos(endAngle);
  const iey = cy + oy + innerR * Math.sin(endAngle);
  const isx = cx + ox + innerR * Math.cos(startAngle);
  const isy = cy + oy + innerR * Math.sin(startAngle);
  const large = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M${osx},${osy} A${outerR},${outerR} 0 ${large} 1 ${oex},${oey} L${iex},${iey} A${innerR},${innerR} 0 ${large} 0 ${isx},${isy} Z`;
}

const DonutChart = memo(function DonutChart({
  data,
  size = 200,
  innerRadius: innerRadiusProp,
  centerLabel,
  centerValue,
}: DonutChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <div style={{ color: "#999", fontSize: 12, padding: 12 }}>데이터 없음</div>;

  const outerR = size / 2 - 10;
  const innerR = innerRadiusProp ?? outerR * 0.6;
  const cx = size / 2;
  const cy = size / 2;

  const visibleData = data.filter((d) => d.value > 0);

  // ---- Center text ----
  const hoveredSlice = hoverIdx !== null ? data[hoverIdx] : null;
  const centerEl = (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        textAlign: "center",
        transition: "all 0.15s",
      }}
    >
      {hoveredSlice ? (
        <>
          <div style={{ fontSize: size * 0.14, fontWeight: 800, color: hoveredSlice.color, lineHeight: 1.1 }}>
            {hoveredSlice.value.toLocaleString()}
          </div>
          <div style={{ fontSize: size * 0.06, color: "#888", marginTop: 2 }}>{hoveredSlice.label}</div>
        </>
      ) : (
        <>
          {centerValue && (
            <div style={{ fontSize: size * 0.16, fontWeight: 800, color: "#1a1a2e", lineHeight: 1.1 }}>
              {centerValue}
            </div>
          )}
          {centerLabel && (
            <div style={{ fontSize: size * 0.06, color: "#888", marginTop: 2 }}>{centerLabel}</div>
          )}
        </>
      )}
    </div>
  );

  // ---- Legend ----
  const legendEl = (
    <div style={{ display: "flex", gap: 20, flexWrap: "wrap", justifyContent: "center" }}>
      {data.map((s, i) => {
        const pct = s.value > 0 ? ((s.value / total) * 100).toFixed(1) : "0.0";
        const dimmed = hoverIdx !== null && hoverIdx !== i;
        return (
          <div
            key={s.label}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              opacity: dimmed ? 0.35 : 1,
              transition: "opacity 0.15s",
              cursor: "pointer",
            }}
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx(null)}
          >
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: "#555" }}>{s.label}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#333" }}>{pct}%</span>
          </div>
        );
      })}
    </div>
  );

  // ---- Single slice (100%) ----
  if (visibleData.length === 1) {
    const idx = data.indexOf(visibleData[0]);
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
        <div
          style={{ position: "relative", width: size, height: size, cursor: "pointer" }}
          onMouseEnter={() => setHoverIdx(idx)}
          onMouseLeave={() => setHoverIdx(null)}
        >
          <svg width={size} height={size}>
            <circle cx={cx} cy={cy} r={outerR} fill={visibleData[0].color} />
            <circle cx={cx} cy={cy} r={innerR} fill="#fff" />
          </svg>
          {centerEl}
          {hoverIdx !== null && <SliceTooltip slice={data[hoverIdx]} total={total} x={size} />}
        </div>
        {legendEl}
      </div>
    );
  }

  // ---- Multiple slices: compute angles ----
  const sliceAngles: { startAngle: number; endAngle: number; dataIdx: number }[] = [];
  let cumAngle = -Math.PI / 2;
  for (let i = 0; i < data.length; i++) {
    if (data[i].value <= 0) continue;
    const angle = (data[i].value / total) * 2 * Math.PI;
    sliceAngles.push({ startAngle: cumAngle, endAngle: cumAngle + angle, dataIdx: i });
    cumAngle += angle;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
      <div
        style={{ position: "relative", width: size, height: size, cursor: "pointer" }}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <svg width={size} height={size}>
          {sliceAngles.map((sa) => {
            const d = data[sa.dataIdx];
            const isHovered = hoverIdx === sa.dataIdx;
            const isDimmed = hoverIdx !== null && !isHovered;
            const offset = isHovered ? 6 : 0;
            const path = computeArcPath(cx, cy, outerR, innerR, sa.startAngle, sa.endAngle, offset);
            return (
              <path
                key={d.label}
                d={path}
                fill={d.color}
                stroke="#fff"
                strokeWidth={2}
                opacity={isDimmed ? 0.35 : 1}
                style={{ transition: "opacity 0.15s", cursor: "pointer" }}
                onMouseEnter={() => setHoverIdx(sa.dataIdx)}
              />
            );
          })}
        </svg>
        {centerEl}
        {hoverIdx !== null && <SliceTooltip slice={data[hoverIdx]} total={total} x={size} />}
      </div>
      {legendEl}
    </div>
  );
});

export default DonutChart;
