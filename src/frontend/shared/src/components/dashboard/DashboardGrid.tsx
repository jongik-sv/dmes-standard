"use client";

/**
 * 대시보드 12열 격자와 칸.
 * - DashboardGrid: 12열 격자. `fill` 이면 부모(PageLayout 등 세로 flex)의 남은 높이를 채우고 세로로 스크롤한다.
 * - DashboardCell: 카드가 아닌 칸(인사말 줄·띠·KPI 타일 등)을 격자에 놓는다.
 * 칸 너비는 span(넓은 화면) · spanMd(1100px 이하) · spanSm(480px 이하)으로 정한다. 생략하면 spanDefaults 규칙을 따른다.
 */
import type { ReactNode } from "react";

import { DashboardLayoutProvider } from "./layout";
import { DashboardStyle } from "./styles";

export type DashboardSpan = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export interface DashboardSpanProps {
  /** 넓은 화면에서 차지할 열 수(1~12, 기본 12). */
  span?: DashboardSpan;
  /** 화면 폭 1100px 이하에서 차지할 열 수. 기본: span ≤ 3 이면 span × 2, 아니면 12(세로 쌓기). */
  spanMd?: DashboardSpan;
  /** 화면 폭 480px 이하에서 차지할 열 수. 기본: span ≤ 2 이면 6, 아니면 12. */
  spanSm?: DashboardSpan;
}

/** span 기본값 규칙 — 작은 타일은 좁은 화면에서 두 배로 넓히고, 나머지 카드는 한 줄을 다 쓴다. */
export function spanDefaults({ span = 12, spanMd, spanSm }: DashboardSpanProps): {
  span: DashboardSpan;
  spanMd: DashboardSpan;
  spanSm: DashboardSpan;
} {
  const md = spanMd ?? ((span <= 3 ? span * 2 : 12) as DashboardSpan);
  const sm = spanSm ?? ((span <= 2 ? 6 : 12) as DashboardSpan);
  return { span, spanMd: md, spanSm: sm };
}

/** 칸 요소에 붙일 data-span 속성. */
export function spanAttributes(props: DashboardSpanProps): Record<string, string> {
  const s = spanDefaults(props);
  return {
    "data-span": String(s.span),
    "data-span-md": String(s.spanMd),
    "data-span-sm": String(s.spanSm),
  };
}

export interface DashboardGridProps {
  children: ReactNode;
  /** 부모의 남은 높이를 채우고 세로로 스크롤한다(탭 본문 스크롤). 바깥 감싸개 `cm-dash-scroll` 이 스크롤·여백(좌우·아래 10px)을 맡고 격자는 내용 높이를 갖는다. */
  fill?: boolean;
  /**
   * 카드 배치(접힘·칸 수·높이) 저장 키(화면별 고유, 예 "mcm.home.layout"). 주면 사용자별로 브라우저에 저장한다.
   * 없어도 접기·크기 조절은 동작하고 화면을 다시 열면 기본 배치로 돌아간다.
   */
  layoutKey?: string;
  /** 뿌리 aria-label. */
  ariaLabel?: string;
  /** 뿌리에 더할 클래스. */
  className?: string;
  /** 뿌리 data-testid. */
  testId?: string;
}

export function DashboardGrid({
  children,
  fill = false,
  layoutKey,
  ariaLabel,
  className,
  testId,
}: DashboardGridProps) {
  const grid = (
    <div
      className={className ? `cm-dash-grid ${className}` : "cm-dash-grid"}
      aria-label={ariaLabel}
      data-testid={testId}
    >
      <DashboardStyle />
      {children}
    </div>
  );
  // fill: 바깥 감싸개가 남은 높이를 채우고 세로로 스크롤한다. 격자는 내용 높이를 그대로 갖는다.
  return (
    <DashboardLayoutProvider layoutKey={layoutKey}>
      {fill ? <div className="cm-dash-scroll">{grid}</div> : grid}
    </DashboardLayoutProvider>
  );
}

export interface DashboardCellProps extends DashboardSpanProps {
  children: ReactNode;
  /** 뿌리에 더할 클래스. */
  className?: string;
  /** 뿌리 data-testid. */
  testId?: string;
}

export function DashboardCell({ children, className, testId, ...span }: DashboardCellProps) {
  return (
    <div
      className={className ? `cm-dash-cell ${className}` : "cm-dash-cell"}
      data-testid={testId}
      {...spanAttributes(span)}
    >
      {children}
    </div>
  );
}
