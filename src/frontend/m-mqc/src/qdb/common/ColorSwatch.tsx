"use client";

/**
 * 색 견본 칩 — 네모 색 칸 하나(+ 옆 글). 업무에 묶이지 않는 표시 부품이다(shared 등록 후보).
 * 색은 데이터(도료 색)라 그대로 칠하고, 테두리·글은 의미 토큰으로 칠한다. 반투명 색은 점선 테두리로 그린다.
 */
import type { CSSProperties } from "react";

export interface ColorSwatchProps {
  /** CSS 색. "transparent" 면 빈 칸(점선). */
  color: string;
  /** 반투명으로 칠하고 점선 테두리를 그린다. */
  translucent?: boolean;
  /** 칸 크기(px). 기본 14 — 그리드 셀 안. */
  size?: number;
  /** 칸 오른쪽 글. */
  label?: string;
  /** 마우스오버 설명. 없으면 label. */
  title?: string;
  testId?: string;
}

const WRAP: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  minWidth: 0,
  verticalAlign: "middle",
};

const LABEL: CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

export function ColorSwatch({
  color,
  translucent = false,
  size = 14,
  label,
  title,
  testId,
}: ColorSwatchProps) {
  const empty = color === "transparent";
  const chip: CSSProperties = {
    display: "inline-block",
    flex: "none",
    width: size,
    height: size,
    borderRadius: 3,
    background: empty ? "transparent" : color,
    opacity: translucent && !empty ? 0.6 : 1,
    border: `1px ${translucent || empty ? "dashed" : "solid"} var(--color-border-strong)`,
    boxSizing: "border-box",
  };
  return (
    <span style={WRAP} title={title ?? label} data-testid={testId}>
      <span style={chip} aria-hidden="true" />
      {label ? <span style={LABEL}>{label}</span> : null}
    </span>
  );
}
