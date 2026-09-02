"use client";

import type { CSSProperties, ReactNode } from "react";

type GridBadgeStyle = CSSProperties & Record<`--${string}`, string | number | undefined>;

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export interface GridBadgeCellProps {
  children?: ReactNode;
  align?: "left" | "center" | "right";
  className?: string;
}

export function GridBadgeCell({ children, align = "center", className }: GridBadgeCellProps) {
  return (
    <div
      className={cx(
        "cm-grid-badge-cell",
        align !== "center" && `cm-grid-badge-cell--${align}`,
        className
      )}
    >
      {children}
    </div>
  );
}

export interface GridBadgeGroupProps {
  children?: ReactNode;
  wrap?: boolean;
  className?: string;
}

export function GridBadgeGroup({ children, wrap = false, className }: GridBadgeGroupProps) {
  return (
    <span className={cx("cm-grid-badge-group", wrap && "cm-grid-badge-group--wrap", className)}>
      {children}
    </span>
  );
}

export interface GridBadgeProps {
  label: ReactNode;
  title?: string;
  bg?: string;
  color?: string;
  borderColor?: string;
  strong?: boolean;
  dimmed?: boolean;
  muted?: boolean;
  className?: string;
}

export function GridBadge({
  label,
  title,
  bg,
  color,
  borderColor,
  strong = false,
  dimmed = false,
  muted = false,
  className,
}: GridBadgeProps) {
  const style: GridBadgeStyle = {
    "--cm-grid-badge-bg": bg,
    "--cm-grid-badge-color": color,
    "--cm-grid-badge-border": borderColor,
  };

  return (
    <span
      className={cx(
        "cm-grid-badge",
        strong && "cm-grid-badge--strong",
        dimmed && "cm-grid-badge--dimmed",
        muted && "cm-grid-badge--muted",
        className
      )}
      style={style}
      title={title}
    >
      <span className="cm-grid-badge__label">{label}</span>
    </span>
  );
}
