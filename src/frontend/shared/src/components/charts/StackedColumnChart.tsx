"use client";

/**
 * 세로 누적 막대 차트 — 항목(월·주 등)마다 여러 계열을 위로 쌓고, 선택적으로 기준선(계획 등)을 점선으로 겹친다.
 * - dimFrom: 그 순번부터의 막대를 옅게 그린다(전망·예상 구간).
 * - totalAt: 그 순번 막대 위에 합계를 적는다(마지막 실적 등).
 * - 폭은 부모의 실제 픽셀 폭(ResizeObserver)으로 다시 계산한다. 글자 크기는 10px 로 고정되고 막대·간격만 늘어난다.
 *   높이는 height(px)로 정한다 — 카드 본문 높이를 채우려면 화면이 본문 높이에서 범례 줄을 뺀 값을 넘긴다.
 * 색은 계열마다 의미 토큰으로 받는다(--color-chart-1 … 5). 막대마다 <title> 툴팁이 있다.
 */
import { memo, useEffect, useMemo, useRef, useState } from "react";

export interface StackedColumnSeries {
  key: string;
  label: string;
  /** 계열 색(의미 토큰, 예 var(--color-chart-1)). */
  color: string;
  /** categories 와 같은 순서·길이의 값. 모자란 칸은 0. */
  values: number[];
}

export interface StackedColumnLine {
  label: string;
  color: string;
  values: number[];
  /** 점선(기본 true). */
  dashed?: boolean;
}

export interface StackedColumnChartProps {
  /** 가로축 항목 이름(예: "1월" … "12월"). */
  categories: string[];
  /** 아래에서 위로 쌓을 계열. */
  series: StackedColumnSeries[];
  /** 막대 위에 겹칠 기준선(계획 합계 등). */
  line?: StackedColumnLine;
  /** 이 순번(0부터)부터의 막대를 옅게 그린다. */
  dimFrom?: number;
  /** 범례 끝에 붙는 옅은 구간 설명(예: "10~12월은 전망(옅은 색)"). */
  dimLabel?: string;
  /** 이 순번 막대 위에 합계를 적는다. */
  totalAt?: number;
  /** 툴팁 단위(예: "천 t"). */
  unit?: string;
  /** 그림 높이(px, 기본 230, 최소 120). 범례 줄은 이 높이 밖이다(약 26px). */
  height?: number;
  /** 범례 표시(기본 true). */
  showLegend?: boolean;
  /** 화면 읽기 프로그램용 설명. */
  ariaLabel?: string;
  /** 뿌리 data-testid. */
  testId?: string;
}

/** 폭을 재기 전(서버 렌더·첫 그림)에 쓰는 폭. */
const FALLBACK_WIDTH = 640;
const MIN_HEIGHT = 120;
const PAD = { left: 36, right: 10, top: 14, bottom: 24 };

/** 0 부터 max 이상까지 1·2·5 단위의 보기 좋은 눈금. */
export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0, 1];
  let step = Math.pow(10, Math.floor(Math.log10(max / count)));
  const err = max / count / step;
  step *= err >= 5 ? 10 : err >= 2 ? 5 : err >= 1.5 ? 2 : 1;
  const ticks: number[] = [];
  for (let v = 0; v <= max + 1e-9; v += step) ticks.push(Number(v.toFixed(6)));
  if (ticks[ticks.length - 1] < max)
    ticks.push(Number((ticks[ticks.length - 1] + step).toFixed(6)));
  return ticks;
}

const fmt = (v: number) => v.toLocaleString("ko-KR");

const StackedColumnChart = memo(function StackedColumnChart({
  categories,
  series,
  line,
  dimFrom,
  dimLabel,
  totalAt,
  unit = "",
  height = 230,
  showLegend = true,
  ariaLabel,
  testId,
}: StackedColumnChartProps) {
  // 부모 폭을 잰다(LineChart 와 같은 방식 — rAF 로 묶고 값이 바뀔 때만 갱신).
  const boxRef = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState(0);
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let raf = 0;
    const apply = () => {
      raf = 0;
      const w = el.clientWidth;
      setMeasured((prev) => (prev === w ? prev : w));
    };
    apply();
    const ro = new ResizeObserver(() => {
      if (raf === 0) raf = requestAnimationFrame(apply);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (raf !== 0) cancelAnimationFrame(raf);
    };
  }, []);
  // 여백보다 좁은 폭(숨김·탭 전환 중 잠깐 잰 값)은 재기 전과 같이 본다 — 그대로 쓰면 그릴 폭·막대 폭이 음수가 되어 <rect width> 오류가 난다.
  const W = measured > PAD.left + PAD.right ? measured : FALLBACK_WIDTH;
  const H = Math.max(MIN_HEIGHT, Math.round(height));

  const totals = useMemo(
    () => categories.map((_, i) => series.reduce((s, ser) => s + (ser.values[i] ?? 0), 0)),
    [categories, series]
  );
  const ticks = useMemo(() => {
    const lineMax = line ? Math.max(0, ...line.values) : 0;
    return niceTicks(Math.max(0, ...totals, lineMax), 4);
  }, [totals, line]);

  if (categories.length === 0 || series.length === 0) {
    // 측정 대상 div 는 비어 있을 때도 그린다(빈 데이터로 마운트한 뒤 데이터가 들어와도 폭을 잰다).
    return (
      <div ref={boxRef} style={{ minWidth: 0, width: "100%" }}>
        <div style={{ color: "var(--color-text-muted)", fontSize: 12, padding: 12 }}>데이터 없음</div>
      </div>
    );
  }

  const ymax = ticks[ticks.length - 1] || 1;
  const ih = H - PAD.top - PAD.bottom;
  const iw = W - PAD.left - PAD.right;
  const y = (v: number) => PAD.top + ih - (v / ymax) * ih;
  const bw = iw / categories.length;
  const cx = (i: number) => PAD.left + i * bw + bw / 2;
  const textStyle = {
    fill: "var(--color-text-muted)",
    fontSize: 10,
    fontFamily: "var(--font-family)",
  };
  const unitText = unit ? ` ${unit}` : "";

  return (
    <div ref={boxRef} data-testid={testId} style={{ minWidth: 0, width: "100%" }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        role="img"
        aria-label={ariaLabel}
        style={{ display: "block" }}
      >
        <g>
          {ticks.map((t) => (
            <g key={`tick-${t}`}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(t)}
                y2={y(t)}
                stroke="var(--color-chart-grid)"
                strokeWidth={1}
              />
              <text x={PAD.left - 6} y={y(t) + 3} textAnchor="end" style={textStyle}>
                {fmt(t)}
              </text>
            </g>
          ))}
        </g>
        {categories.map((cat, i) => {
          const dim = dimFrom != null && i >= dimFrom;
          const x = PAD.left + i * bw + bw * 0.22;
          const w = bw * 0.56;
          let acc = 0;
          return (
            <g key={`col-${i}`} data-dim={dim ? "true" : undefined}>
              {series.map((ser) => {
                const v = ser.values[i] ?? 0;
                if (v <= 0) return null;
                const top = y(acc + v);
                const h = Math.max(0, y(acc) - top - 1);
                acc += v;
                return (
                  <rect
                    key={ser.key}
                    x={x.toFixed(1)}
                    y={top.toFixed(1)}
                    width={w.toFixed(1)}
                    height={h.toFixed(1)}
                    fill={ser.color}
                    opacity={dim ? 0.4 : 1}
                  >
                    <title>{`${cat} ${ser.label}${dim ? " (전망)" : ""} ${fmt(v)}${unitText}`}</title>
                  </rect>
                );
              })}
              <text x={cx(i).toFixed(1)} y={H - 8} textAnchor="middle" style={textStyle}>
                {cat}
              </text>
            </g>
          );
        })}
        {line && line.values.length > 0 && (
          <g>
            <path
              d={line.values
                .map((v, i) => `${i === 0 ? "M" : "L"}${cx(i).toFixed(1)} ${y(v).toFixed(1)}`)
                .join(" ")}
              fill="none"
              stroke={line.color}
              strokeWidth={2}
              strokeDasharray={line.dashed === false ? undefined : "5 3"}
            />
            {line.values.map((v, i) => (
              <circle
                key={`pt-${i}`}
                cx={cx(i).toFixed(1)}
                cy={y(v).toFixed(1)}
                r={2.5}
                fill="var(--color-bg)"
                stroke={line.color}
                strokeWidth={1.5}
              >
                <title>{`${categories[i] ?? ""} ${line.label} ${fmt(v)}${unitText}`}</title>
              </circle>
            ))}
          </g>
        )}
        {totalAt != null && totalAt >= 0 && totalAt < categories.length && (
          <text
            x={cx(totalAt).toFixed(1)}
            y={(y(Math.max(totals[totalAt], line?.values[totalAt] ?? 0)) - 7).toFixed(1)}
            textAnchor="middle"
            style={{ ...textStyle, fill: "var(--color-text)", fontWeight: 700 }}
            data-total="true"
          >
            {fmt(totals[totalAt])}
          </text>
        )}
      </svg>
      {showLegend && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "4px 14px",
            marginTop: 6,
            fontSize: "var(--font-size-xs)",
            color: "var(--color-text-muted)",
          }}
        >
          {series.map((ser) => (
            <span key={ser.key} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <i
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: ser.color,
                }}
              />
              {ser.label}
            </span>
          ))}
          {line && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <i
                style={{ display: "inline-block", width: 12, height: 2, background: line.color }}
              />
              {line.label}
            </span>
          )}
          {dimLabel && <span>{dimLabel}</span>}
        </div>
      )}
    </div>
  );
});

export default StackedColumnChart;
