/**
 * 홈 차트 크기 — 카드 본문 크기(DashboardCard 함수 children 의 { width, height })로 차트 높이를 정한다.
 * StackedColumnChart 는 폭을 스스로 재고(글자 10px 고정, 막대·간격만 늘어남), 높이는 여기서 본문 높이에 맞춘다.
 * 기존 shared 차트(DonutChart·HBarChart·StackedBarChart)는 props·모습을 바꾸지 않으므로 기본 크기로 두고
 * 카드 안 가운데에 놓는다(home-styles 의 mcm-home-chart-center).
 */
import type { DashboardBodySize } from "@dk-oasis/shared/dashboard";

/** 범례 줄(여백 포함) 높이. */
const LEGEND_HEIGHT = 26;
/** 카드 높이가 정해지지 않았을 때(내용 높이) 월별 차트 높이. */
export const MONTHLY_DEFAULT_HEIGHT = 230;

/** 월별 생산 실적 차트 높이(px) — 카드 높이가 정해졌으면 본문 높이에서 범례 줄을 뺀 값, 아니면 기본 230. */
export function monthlyChartHeight({ height }: DashboardBodySize): number {
  if (height == null) return MONTHLY_DEFAULT_HEIGHT;
  return Math.max(140, Math.round(height - LEGEND_HEIGHT));
}
