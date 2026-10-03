import type { WidgetTypeMeta } from "@dk-oasis/shared/widget";

/**
 * 단위 계산기 유형 — 길이·무게·면적·부피·온도·압력·힘·속도·에너지 환산(철강 현장 단위 포함).
 * 설정은 보일 분류·기본 분류뿐이고, 서버 호출 없이 브라우저에서 계산한다.
 * 초기 설정은 unit-model.ts UNIT_DEFAULT_CONFIG 와 같다(시험이 같음을 확인).
 */
export const meta: WidgetTypeMeta = {
  id: "unit-converter",
  title: "단위 계산기",
  description: "길이·무게·압력·온도 등 단위 환산",
  defaultSize: { w: 8, h: 12 },
  minSize: { w: 5, h: 8 },
  initialConfig: { categories: [], defaultCategory: "length" },
};
