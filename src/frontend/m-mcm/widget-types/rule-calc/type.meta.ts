import { IconCalculator } from "@tabler/icons-react";

import type { WidgetTypeMeta } from "@dk-oasis/shared/widget";

/**
 * 룰 계산기 유형 — 룰 ID 또는 룰 세트 ID 만 정의 설정에 넣으면 입력 칸을 자동으로 만들고 계산 결과를 보인다(조업 계산기).
 * 설정은 {targetTp, targetId, showSteps, fillMode}. 초기 설정은 rule-calc-model.ts RULE_CALC_DEFAULT_CONFIG 와 같다(시험이 같음을 확인).
 * 도구 창(도크)으로도 쓰므로 floatable. 틀 머리 「?」 는 「업무 화면과 위젯 값 연결 안내」 문서를 연다(help-content.ts 는 원문의 생성 사본).
 */
export const meta: WidgetTypeMeta = {
  id: "rule-calc",
  title: "룰 계산기",
  description: "룰 또는 룰 세트를 골라 입력 칸을 만들고 계산 결과를 보입니다",
  defaultSize: { w: 6, h: 12 },
  minSize: { w: 4, h: 7 },
  initialConfig: { targetTp: "RULE", targetId: "", showSteps: false, fillMode: "auto" },
  floatable: true,
  icon: IconCalculator,
  help: {
    title: "업무 화면과 위젯 값 연결 안내",
    loadMarkdown: () => import("./help-content").then((m) => m.WIDGET_SCREEN_LINK_GUIDE_MARKDOWN),
  },
};
