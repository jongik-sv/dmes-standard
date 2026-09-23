"use client";

import { type CSSProperties } from "react";
import { Loader, Overlay, Text } from "@mantine/core";

export interface SpinnerProps {
  /** 스피너 크기 (px). 기본값 32 */
  size?: number;
  /** 테두리 두께 (px). 기본값 3 — Mantine Loader 는 자체 두께를 쓰므로 시각 참고용으로만 남긴다. */
  borderWidth?: number;
  /** 메인 색상. 기본값 var(--color-primary, #0b62d6) */
  color?: string;
  /** 트랙 색상. 기본값 #e0e0e0 — Mantine Loader(oval variant) 에는 별도 트랙 색이 없어 참고용으로만 남긴다. */
  trackColor?: string;
  /** 하단 텍스트 */
  label?: string;
  /** 전체 화면 오버레이 모드 */
  overlay?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function Spinner({
  size = 32,
  color = "var(--color-primary, #0b62d6)",
  label,
  overlay = false,
  className = "",
  style,
}: SpinnerProps) {
  const spinner = (
    <div
      className={`oasis-spinner ${className}`.trim()}
      style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 8, ...style }}
    >
      <Loader size={size} color={color} />
      {label && (
        <Text size="xs" c="dimmed">
          {label}
        </Text>
      )}
    </div>
  );

  if (!overlay) return spinner;

  return (
    <Overlay
      className="oasis-spinner-overlay"
      backgroundOpacity={0.7}
      color="#fff"
      zIndex={50}
      style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      {spinner}
    </Overlay>
  );
}
