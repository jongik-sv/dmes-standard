"use client";

/**
 * 행 배지 묶음(RuleDisplay.badges) — 그리드 칸 안에서 GridBadge 로 보인다. 색은 의미 토큰만 쓴다.
 */
import { GridBadge, GridBadgeGroup } from "@dk-oasis/shared/grid";

import type { RuleBadge } from "./display";

const TONE_STYLE: Record<
  RuleBadge["tone"],
  { bg?: string; color?: string; muted?: boolean }
> = {
  primary: { bg: "var(--color-primary-soft)", color: "var(--color-primary)" },
  success: { bg: "var(--color-success-soft)", color: "var(--color-success)" },
  warning: { bg: "var(--color-warning-soft)", color: "var(--color-warning)" },
  danger: { bg: "var(--color-danger-soft)", color: "var(--color-danger)" },
  muted: { muted: true },
};

export function RuleBadgeChip({ badge }: { badge: RuleBadge }) {
  const s = TONE_STYLE[badge.tone];
  return (
    <GridBadge
      label={badge.label}
      title={badge.title}
      bg={s.bg}
      color={s.color}
      muted={s.muted}
    />
  );
}

export function RuleBadges({
  badges,
  testId,
}: {
  badges: readonly RuleBadge[];
  testId?: string;
}) {
  if (badges.length === 0) return null;
  return (
    <span data-testid={testId}>
      <GridBadgeGroup wrap>
        {badges.map((b) => (
          <RuleBadgeChip key={`${b.label}-${b.title ?? ""}`} badge={b} />
        ))}
      </GridBadgeGroup>
    </span>
  );
}
