"use client";

/**
 * 그리드 밖 상태 배지 — 패널 머리·목록 항목·카드 안에서 분류·상태·형식을 작은 알약 모양으로 보인다.
 * - 그리드 셀 안에서는 grid 의 GridBadge 를 쓴다(그쪽 스타일은 .cm-data-grid 안에서만 적용된다).
 * - tone 은 의미 토큰 쌍(배경 soft + 글자색)만 쓴다. 16진수 색을 받지 않는다.
 * - variant="outline" 은 흰 바탕 + 1px 테두리(형식 표시 TXT·MD·HTML 같은 보조 표지), mono 는 고정폭 글꼴.
 * 스타일은 컴포넌트가 직접 넣는다(포털이 원격 모듈의 CSS 파일을 싣지 않는다 — Part B §18-3).
 */
import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "primary" | "success" | "warning" | "danger";
export type BadgeVariant = "soft" | "outline";

export interface BadgeProps {
  /** 배지 안에 보일 내용. */
  label: ReactNode;
  /** 의미 색(기본 neutral 회색). */
  tone?: BadgeTone;
  /** soft(옅은 배경, 기본) · outline(흰 바탕 + 테두리). */
  variant?: BadgeVariant;
  /** 고정폭 글꼴(코드·형식 표지). */
  mono?: boolean;
  /** 마우스오버 설명. */
  title?: string;
  /** 뿌리에 더할 클래스. */
  className?: string;
  /** 뿌리 data-testid. */
  testId?: string;
}

const STYLE_HREF = "cm-badge";

export const BADGE_CSS = `
.cm-badge { display: inline-flex; align-items: center; box-sizing: border-box; height: 18px; padding: 0 7px; border-radius: 9px; border: 1px solid transparent; font-size: var(--font-size-xs); font-weight: 500; line-height: 1; white-space: nowrap; vertical-align: middle; flex-shrink: 0; }
.cm-badge--neutral { background: var(--color-bg-hover); color: var(--color-text-muted); }
.cm-badge--primary { background: var(--color-primary-soft); color: var(--color-primary); }
.cm-badge--success { background: var(--color-success-soft); color: var(--color-success); }
.cm-badge--warning { background: var(--color-warning-soft); color: var(--color-warning); }
.cm-badge--danger { background: var(--color-danger-soft); color: var(--color-danger); }
.cm-badge--outline { background: var(--color-bg); border-color: var(--color-border); height: 16px; padding: 0 4px; border-radius: 2px; font-size: 10px; font-weight: 400; }
.cm-badge--outline.cm-badge--neutral { color: var(--color-text-muted); }
.cm-badge--mono { font-family: var(--font-family-mono); }
`;

/** 배지 스타일을 한 번만 넣는다(React 19 가 같은 href 의 style 을 하나로 합친다). */
export function BadgeStyle() {
  return (
    <style href={STYLE_HREF} precedence="default">
      {BADGE_CSS}
    </style>
  );
}

export function Badge({
  label,
  tone = "neutral",
  variant = "soft",
  mono = false,
  title,
  className,
  testId,
}: BadgeProps) {
  const classes = ["cm-badge", `cm-badge--${tone}`];
  if (variant === "outline") classes.push("cm-badge--outline");
  if (mono) classes.push("cm-badge--mono");
  if (className) classes.push(className);
  return (
    <>
      <BadgeStyle />
      <span className={classes.join(" ")} title={title} data-testid={testId} data-tone={tone}>
        {label}
      </span>
    </>
  );
}
