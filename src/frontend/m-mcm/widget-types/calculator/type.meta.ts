import { IconCalculator } from "@tabler/icons-react";

import type { WidgetTypeMeta } from "@dk-oasis/shared/widget";

/**
 * 계산기 유형 — 사칙연산(연산자 우선순위)·백분율·계산 기록. 계산 기록은 화면 상태로만 들고 저장하지 않는다.
 * 설정은 showHistory 하나. 초기 설정은 calculator-model.ts CALCULATOR_DEFAULT_CONFIG 와 같다(시험이 같음을 확인).
 */
export const meta: WidgetTypeMeta = {
  id: "calculator",
  title: "계산기",
  description: "사칙연산 계산기(우선순위·백분율·계산 기록)",
  defaultSize: { w: 6, h: 12 },
  minSize: { w: 4, h: 9 },
  initialConfig: { showHistory: true },
  floatable: true,
  icon: IconCalculator,
};
