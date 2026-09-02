import type { ReactNode } from "react";

type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

const TONE_BY_VALUE: Record<string, StatusTone> = {
  Y: "success",
  N: "neutral",
  가동: "success",
  점검: "warning",
  비가동: "danger",
  정상: "success",
  주의: "warning",
  지연: "danger",
  보류: "neutral",
  긴급: "danger",
  정보: "info",
  Critical: "danger",
  Major: "warning",
  Minor: "info",
  검토대기: "warning",
  조치진행: "info",
  완료: "success",
  제품: "info",
  반제품: "warning",
  원자재: "neutral",
  설비: "info",
  작업조: "neutral",
};

export function StatusBadge({
  value,
  tone,
  children,
}: {
  value?: string;
  tone?: StatusTone;
  children?: ReactNode;
}) {
  const label = children ?? value ?? "";
  const resolvedTone =
    tone ?? TONE_BY_VALUE[String(value ?? label)] ?? "neutral";
  return (
    <span className={`status-badge status-badge--${resolvedTone}`}>
      {label}
    </span>
  );
}
