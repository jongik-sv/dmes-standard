"use client";

import React from "react";

export type ProgressStatus = "idle" | "running" | "completed" | "error";

export interface ProgressBarProps {
  /** 진행 상태. idle 이면 (hideWhenIdle 기본값 true) 렌더링하지 않음 */
  status?: ProgressStatus;
  /**
   * 진행률 0~100. 지정 시 결정형(채워지는 막대), 미지정 + running 이면
   * 비결정형(움직이는 줄무늬) 애니메이션.
   */
  value?: number;
  /** 막대 옆/아래에 표시할 텍스트 (상태 메시지 등) */
  label?: React.ReactNode;
  /** N% 숫자 표시 (value 필요) */
  showPercent?: boolean;
  /** idle 상태에서 숨김 (기본값 true) — SchedulingProgressBar 와 동일 동작 */
  hideWhenIdle?: boolean;
  /** 트랙 높이(px). 기본값 8 */
  height?: number;
  /** running 색상 오버라이드 */
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}

const STATUS_COLOR: Record<ProgressStatus, string> = {
  idle: "#9ca3af",
  running: "#2563eb",
  completed: "#16a34a",
  error: "#dc2626",
};

const STATUS_LABEL: Record<ProgressStatus, string> = {
  idle: "대기",
  running: "실행 중",
  completed: "완료",
  error: "오류",
};

/**
 * 범용 진행바 — 시뮬레이션/실행 콘솔의 실행바, 비동기 작업 진행 표시 등에 사용.
 *
 * - `value` 지정 → 결정형(채워지는 막대 + 선택적 %)
 * - `value` 미지정 + `status="running"` → 비결정형(줄무늬 애니메이션)
 * - shared 관례(Tabs/Spinner)와 동일하게 외부 CSS 없이 인라인 스타일 자급.
 */
export function ProgressBar({
  status = "idle",
  value,
  label,
  showPercent = true,
  hideWhenIdle = true,
  height = 8,
  color,
  className = "",
  style,
}: ProgressBarProps) {
  if (status === "idle" && hideWhenIdle) return null;

  const accent = status === "running" ? (color ?? STATUS_COLOR.running) : STATUS_COLOR[status];
  const determinate = typeof value === "number" && !Number.isNaN(value);
  const pct = determinate ? Math.max(0, Math.min(100, value as number)) : 0;
  const indeterminate = status === "running" && !determinate;

  return (
    <div
      className={`oasis-progress ${className}`.trim()}
      style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", ...style }}
      role="progressbar"
      aria-valuenow={determinate ? pct : undefined}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        style={{
          flex: 1,
          height,
          background: "#eceff3",
          borderRadius: height,
          overflow: "hidden",
          position: "relative",
        }}
      >
        {indeterminate ? (
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              width: "40%",
              borderRadius: height,
              background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
              animation: "oasis-progress-indeterminate 1.2s ease-in-out infinite",
            }}
          />
        ) : (
          <div
            style={{
              height: "100%",
              width: `${pct}%`,
              background: accent,
              borderRadius: height,
              transition: "width 0.25s ease",
            }}
          />
        )}
      </div>

      {(label != null || (showPercent && determinate) || status !== "running") && (
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: accent,
            whiteSpace: "nowrap",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {label ?? STATUS_LABEL[status]}
          {showPercent && determinate && (
            <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{pct}%</span>
          )}
        </span>
      )}

      <style>{`@keyframes oasis-progress-indeterminate {
        0% { left: -40%; }
        100% { left: 100%; }
      }`}</style>
    </div>
  );
}

export default ProgressBar;
