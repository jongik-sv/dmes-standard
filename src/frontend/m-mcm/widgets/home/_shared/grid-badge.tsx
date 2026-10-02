import { GridBadge } from "@dk-oasis/shared/grid";
import type { BadgeTone } from "@dk-oasis/shared/form";

/* ── 그리드 배지 색(GridBadge 는 그리드 셀 안 전용) — 작업지시·출하 위젯이 함께 쓴다 ── */
export const GRID_BADGE_COLORS: Record<BadgeTone, { bg?: string; color?: string; muted?: boolean }> = {
  neutral: { muted: true },
  primary: { bg: "var(--color-primary-soft)", color: "var(--color-primary)" },
  success: { bg: "var(--color-success-soft)", color: "var(--color-success)" },
  warning: { bg: "var(--color-warning-soft)", color: "var(--color-warning)" },
  danger: { bg: "var(--color-danger-soft)", color: "var(--color-danger)" },
};

export function toneBadge(label: string, tone: BadgeTone) {
  const c = GRID_BADGE_COLORS[tone];
  return <GridBadge label={label} bg={c.bg} color={c.color} muted={c.muted} />;
}
