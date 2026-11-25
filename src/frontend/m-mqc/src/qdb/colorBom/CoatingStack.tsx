"use client";

/**
 * 도장 단면 그림 — 위에서부터 보호필름 · 전면 상도 · 전면 프라이머 · 강판 · 후면 층. 배치는 stack.ts 가 정한다.
 * 층 색은 부재료 색(색상코드 근사색)이고, 선·글·강판은 의미 토큰으로 칠한다. 반투명 층(투명 프라이머·필름)은 점선으로 그린다.
 */
import { memo, useId, useMemo } from "react";

import type { Bom } from "../common/bom";
import { STACK, stackLayout } from "./stack";

const TEXT = { fill: "var(--color-text)", fontSize: 12 } as const;
const MUTED = { fill: "var(--color-text-muted)", fontSize: 11 } as const;
const LINE = { stroke: "var(--color-border-strong)", strokeWidth: 1 } as const;
const STEEL = { fill: "var(--color-bg-readonly)" } as const;

export interface CoatingStackProps {
  bom: Bom;
  testId?: string;
}

export const CoatingStack = memo(function CoatingStack({
  bom,
  testId,
}: CoatingStackProps) {
  const uid = "mqc-coat-" + useId().replace(/[^a-zA-Z0-9-]/g, "");
  const layout = useMemo(() => stackLayout(bom), [bom]);
  const { x0, x1, labelX, thkX, braceX, width } = STACK;

  return (
    <svg
      viewBox={`0 0 ${width} ${layout.height}`}
      width="100%"
      style={{ display: "block", maxWidth: width }}
      role="img"
      aria-labelledby={`${uid}-t`}
      data-testid={testId}
    >
      <title id={`${uid}-t`}>{layout.summary}</title>
      <defs>
        <pattern
          id={`${uid}-hatch`}
          width="8"
          height="8"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line x1="0" y1="0" x2="0" y2="8" style={LINE} />
        </pattern>
      </defs>

      {layout.bands.map((b) => {
        const mid = b.y + b.height / 2;
        const dashed = b.swatch ? b.swatch.translucent : false;
        return (
          <g
            key={b.key}
            data-testid={testId ? `${testId}-band-${b.key}` : undefined}
          >
            {b.kind === "steel" ? (
              <>
                <rect
                  x={x0}
                  y={b.y}
                  width={x1 - x0}
                  height={b.height}
                  style={STEEL}
                />
                <rect
                  x={x0}
                  y={b.y}
                  width={x1 - x0}
                  height={b.height}
                  fill={`url(#${uid}-hatch)`}
                  style={LINE}
                />
              </>
            ) : (
              <rect
                x={x0}
                y={b.y}
                width={x1 - x0}
                height={b.height}
                style={{
                  ...LINE,
                  fill:
                    b.swatch && b.swatch.source !== "none"
                      ? b.swatch.color
                      : "var(--color-bg)",
                  fillOpacity: dashed ? 0.55 : 1,
                  strokeDasharray: dashed ? "4 3" : undefined,
                }}
              />
            )}
            {b.thkText ? (
              <text x={thkX} y={mid + 4} textAnchor="end" style={MUTED}>
                {b.thkText}
              </text>
            ) : null}
            <polyline
              points={`${x1},${mid} ${x1 + 10},${mid} ${labelX - 6},${b.labelY + 2}`}
              style={{ ...LINE, fill: "none" }}
            />
            <text x={labelX} y={b.labelY} style={TEXT}>
              {b.title}
            </text>
            <text x={labelX} y={b.labelY + 14} style={MUTED}>
              {b.sub}
            </text>
          </g>
        );
      })}

      {layout.braces.map((br) => (
        <g
          key={br.side}
          data-testid={testId ? `${testId}-brace-${br.side}` : undefined}
        >
          <polyline
            points={`${braceX + 8},${br.y0 + 1} ${braceX},${br.y0 + 1} ${braceX},${br.y1 - 1} ${braceX + 8},${br.y1 - 1}`}
            style={{ ...LINE, fill: "none" }}
          />
          <text
            x={braceX - 6}
            y={(br.y0 + br.y1) / 2 + 4}
            textAnchor="end"
            style={TEXT}
          >
            {br.text}
          </text>
        </g>
      ))}

      <text x={8} y={layout.height - 8} style={MUTED}>
        층 두께는 비례가 아닙니다. 보호필름은 도막 합계에 넣지 않습니다.
      </text>
    </svg>
  );
});
