"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";

export interface LineDataPoint {
  label: string;
  value: number;
}

interface LineChartProps {
  data: LineDataPoint[];
  height?: number | "100%";
  color?: string;
  avgColor?: string;
  showAvg?: boolean;
  avgLabel?: string;
  yLabel?: string;
}

const PADDING = { top: 20, right: 80, bottom: 40, left: 60 };

const LineChart = memo(function LineChart({
  data,
  height = 250,
  color = "#4a90d9",
  avgColor = "#28a745",
  showAvg = true,
  avgLabel = "AVG",
  yLabel,
}: LineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  // Measure container size with ResizeObserver.
  // 창 리사이즈 중 매 콜마다 setState 하면 SVG 전체가 재생성되며 번쩍이므로
  // rAF 로 프레임당 1회만 반영하고, 값이 바뀔 때만 상태를 갱신한다.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let rafId = 0;
    const applySize = () => {
      rafId = 0;
      const nextWidth = el.clientWidth;
      const nextHeight = el.clientHeight;
      setContainerWidth((prev) => (prev === nextWidth ? prev : nextWidth));
      setContainerHeight((prev) => (prev === nextHeight ? prev : nextHeight));
    };

    const scheduleMeasure = () => {
      if (rafId !== 0) return;
      rafId = window.requestAnimationFrame(applySize);
    };

    applySize();
    const ro = new ResizeObserver(scheduleMeasure);
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (rafId !== 0) window.cancelAnimationFrame(rafId);
    };
  }, []);

  const autoHeight = height === "100%";
  const resolvedHeight = autoHeight ? (containerHeight || 250) : height;
  const width = containerWidth || 600;
  const chartW = width - PADDING.left - PADDING.right;
  const chartH = resolvedHeight - PADDING.top - PADDING.bottom;

  const { maxVal, avgVal, points, yTicks } = useMemo(() => {
    if (data.length === 0 || chartW <= 0) return { maxVal: 0, avgVal: 0, points: [], yTicks: [] };

    const values = data.map((d) => d.value);
    const max = Math.max(...values);
    const avg = values.reduce((s, v) => s + v, 0) / values.length;

    const yMax = max === 0 ? 10 : Math.ceil(max * 1.15);
    const tickCount = 5;
    const tickStep = Math.ceil(yMax / tickCount);
    const ticks: number[] = [];
    for (let i = 0; i <= tickCount; i++) ticks.push(i * tickStep);
    const actualYMax = ticks[ticks.length - 1] || 1;

    const pts = data.map((d, i) => ({
      x: PADDING.left + (data.length === 1 ? chartW / 2 : (i / (data.length - 1)) * chartW),
      y: PADDING.top + chartH - (d.value / actualYMax) * chartH,
      ...d,
    }));

    return { maxVal: actualYMax, avgVal: avg, points: pts, yTicks: ticks };
  }, [data, chartW, chartH]);

  if (data.length === 0) return <div style={{ color: "#999", fontSize: 12, padding: 12 }}>데이터 없음</div>;

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const avgY = maxVal > 0 ? PADDING.top + chartH - (avgVal / maxVal) * chartH : PADDING.top + chartH;
  const labelSkip = Math.max(1, Math.ceil(data.length / 12));

  return (
    <div ref={containerRef} style={{ width: "100%", height: autoHeight ? "100%" : undefined }}>
      {containerWidth > 0 && resolvedHeight > 0 && (
        <svg
          width={width}
          height={resolvedHeight}
          style={{ display: "block" }}
          onMouseLeave={() => setHoverIdx(null)}
        >
          {/* Grid lines */}
          {yTicks.map((tick) => {
            const y = PADDING.top + chartH - (tick / maxVal) * chartH;
            return (
              <g key={`grid-${tick}`}>
                <line x1={PADDING.left} y1={y} x2={PADDING.left + chartW} y2={y} stroke="#e8e8e8" strokeWidth={1} />
                <text x={PADDING.left - 8} y={y + 4} textAnchor="end" fontSize={10} fill="#999">
                  {tick.toLocaleString()}
                </text>
              </g>
            );
          })}

          {/* Y-axis label */}
          {yLabel && (
            <text x={14} y={PADDING.top + chartH / 2} textAnchor="middle" fontSize={10} fill="#999"
              transform={`rotate(-90 14 ${PADDING.top + chartH / 2})`}>
              {yLabel}
            </text>
          )}

          {/* X-axis labels */}
          {points.map((p, i) =>
            i % labelSkip === 0 ? (
              <text key={`xlabel-${i}`} x={p.x} y={PADDING.top + chartH + 20} textAnchor="middle" fontSize={10} fill="#999">
                {p.label}
              </text>
            ) : null,
          )}

          {/* Average line */}
          {showAvg && (
            <g>
              <line x1={PADDING.left} y1={avgY} x2={PADDING.left + chartW} y2={avgY}
                stroke={avgColor} strokeWidth={1.5} strokeDasharray="6 3" />
              <text x={PADDING.left + chartW + 4} y={avgY + 4} fontSize={10} fill={avgColor} fontWeight={600}>
                {avgLabel}: {Math.round(avgVal).toLocaleString()}
              </text>
            </g>
          )}

          {/* Area fill */}
          <path
            d={`${linePath} L${points[points.length - 1].x},${PADDING.top + chartH} L${points[0].x},${PADDING.top + chartH} Z`}
            fill={color} opacity={0.08}
          />

          {/* Line */}
          <path d={linePath} fill="none" stroke={color} strokeWidth={2} />

          {/* Data points */}
          {points.map((p, i) => (
            <circle key={`pt-${i}`} cx={p.x} cy={p.y} r={hoverIdx === i ? 5 : 3}
              fill={hoverIdx === i ? color : "#fff"} stroke={color} strokeWidth={2}
              style={{ cursor: "pointer", transition: "r 0.1s" }}
              onMouseEnter={() => setHoverIdx(i)}
            />
          ))}

          {/* Tooltip */}
          {hoverIdx !== null && points[hoverIdx] && (
            <g>
              <rect x={points[hoverIdx].x - 40} y={points[hoverIdx].y - 36} width={80} height={28} rx={4} fill="#333" opacity={0.9} />
              <text x={points[hoverIdx].x} y={points[hoverIdx].y - 18} textAnchor="middle" fontSize={11} fill="#fff" fontWeight={600}>
                {points[hoverIdx].value.toLocaleString()}
              </text>
            </g>
          )}

          {/* Axes */}
          <line x1={PADDING.left} y1={PADDING.top} x2={PADDING.left} y2={PADDING.top + chartH} stroke="#ccc" strokeWidth={1} />
          <line x1={PADDING.left} y1={PADDING.top + chartH} x2={PADDING.left + chartW} y2={PADDING.top + chartH} stroke="#ccc" strokeWidth={1} />
        </svg>
      )}
    </div>
  );
});

export default LineChart;
