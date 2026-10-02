"use client";

/**
 * 작은 추이 선(sparkline) — 축·눈금 없이 값의 흐름만 보인다. 마지막 점을 동그라미로 강조하고 선 아래를 옅게 칠한다.
 * 값이 모두 같으면 가운데 수평선으로 그린다. 값이 2개 미만이면 아무것도 그리지 않는다.
 */
import { memo } from "react";

export interface SparklineProps {
  /** 시간 순서의 값. */
  values: number[];
  /** 그림 폭(px, 기본 84). */
  width?: number;
  /** 그림 높이(px, 기본 26). */
  height?: number;
  /** 선 색(의미 토큰, 기본 var(--color-primary)). */
  color?: string;
  /** 선 아래 옅은 채움(기본 true). */
  area?: boolean;
  /** 화면 읽기 프로그램용 설명. 없으면 장식으로 숨긴다. */
  ariaLabel?: string;
  /** 뿌리 data-testid. */
  testId?: string;
}

/** 값 → 그림 좌표(위·아래 3px, 좌우 2px 여백). 테스트에서도 쓴다. */
export function sparklinePoints(
  values: number[],
  width: number,
  height: number
): Array<[number, number]> {
  if (values.length < 2) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  return values.map((v, i) => {
    const x = 2 + (i * (width - 4)) / (values.length - 1);
    const y = range === 0 ? height / 2 : height - 3 - ((v - min) / range) * (height - 6);
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
  });
}

export const Sparkline = memo(function Sparkline({
  values,
  width = 84,
  height = 26,
  color = "var(--color-primary)",
  area = true,
  ariaLabel,
  testId,
}: SparklineProps) {
  const pts = sparklinePoints(values, width, height);
  if (pts.length === 0) return null;
  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`).join(" ");
  const [lastX, lastY] = pts[pts.length - 1];
  const a11y = ariaLabel ? { role: "img", "aria-label": ariaLabel } : { "aria-hidden": true };
  return (
    <svg
      className="cm-sparkline"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      data-testid={testId}
      {...a11y}
    >
      {area && (
        <path
          d={`${line} L${lastX} ${height} L${pts[0][0]} ${height} Z`}
          fill={color}
          opacity={0.12}
        />
      )}
      <path d={line} fill="none" stroke={color} strokeWidth={1.5} />
      <circle cx={lastX} cy={lastY} r={2.5} fill={color} />
    </svg>
  );
});
