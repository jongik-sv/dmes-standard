"use client";

import React from "react";

export interface SpinnerProps {
  /** 스피너 크기 (px). 기본값 32 */
  size?: number;
  /** 테두리 두께 (px). 기본값 3 */
  borderWidth?: number;
  /** 메인 색상. 기본값 var(--color-primary, #337ab7) */
  color?: string;
  /** 트랙 색상. 기본값 #e0e0e0 */
  trackColor?: string;
  /** 하단 텍스트 */
  label?: string;
  /** 전체 화면 오버레이 모드 */
  overlay?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function Spinner({
  size = 32,
  borderWidth = 3,
  color = "var(--color-primary, #337ab7)",
  trackColor = "#e0e0e0",
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
      <div
        style={{
          width: size,
          height: size,
          border: `${borderWidth}px solid ${trackColor}`,
          borderTopColor: color,
          borderRadius: "50%",
          animation: "oasis-spin 0.8s linear infinite",
          boxSizing: "border-box",
        }}
      />
      {label && <span style={{ fontSize: 12, color: "#666" }}>{label}</span>}
      <style>{`@keyframes oasis-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (!overlay) return spinner;

  return (
    <div
      className="oasis-spinner-overlay"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(255, 255, 255, 0.7)",
        zIndex: 50,
      }}
    >
      {spinner}
    </div>
  );
}
