import type { CSSProperties } from "react";

/**
 * MDM 업무 배지 공통 스타일(TSK-01-03 U3, D11).
 *
 * shared 에 그리드 밖 범용 배지가 없고 화면 모듈은 Mantine 을 쓸 수 없어 인라인 스타일로 그린다.
 * 색은 의미 토큰(var(--color-…))만 쓴다 — 16진수·rgb()·폴백 값 금지(UI-Visual-Standard §3·§5).
 * 상태는 배경·글자색으로 구분하고 한 변 색 막대는 쓰지 않는다.
 */
export type MdmBadgeTone = "neutral" | "info" | "success" | "warning" | "muted";

const TONE_COLORS: Record<MdmBadgeTone, { color: string; background: string }> = {
  success: { color: "var(--color-success)", background: "var(--color-success-soft)" },
  warning: { color: "var(--color-warning)", background: "var(--color-edited)" },
  info: { color: "var(--color-primary)", background: "var(--color-selection)" },
  neutral: { color: "var(--color-text-secondary)", background: "var(--color-bg-header)" },
  muted: { color: "var(--color-text-muted)", background: "var(--color-bg-header)" },
};

export function badgeStyle(tone: MdmBadgeTone): CSSProperties {
  const { color, background } = TONE_COLORS[tone];
  return {
    display: "inline-flex",
    alignItems: "center",
    height: "18px",
    padding: "0 6px",
    borderRadius: "var(--radius-sm)",
    fontSize: "var(--font-size-xs)",
    fontWeight: 600,
    lineHeight: 1,
    whiteSpace: "nowrap",
    border: "1px solid var(--color-border)",
    color,
    background,
  };
}
