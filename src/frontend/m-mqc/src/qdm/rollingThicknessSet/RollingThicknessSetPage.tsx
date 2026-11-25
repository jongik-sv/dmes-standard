"use client";

/**
 * 압연두께Set보정관리(rollingThicknessSet) — 룰 기준 공통 틀(RuleStandardScreen)로 그린다. 레거시 업무기준 C10B2060 압연두께Set치보정기준 하나.
 * 주문 조건(품명·규격·용도·고객사·두께관리코드·도금량·두께/폭)에 맞는 첫 행의 두께보정치를 Set 두께에 더한다: Set 두께 = 주문두께 + 보정치.
 * 목록은 룰 ID(TS-)·굵은 두께보정치, 간편판정은 Set 두께 타일을 더한다(display.ts).
 */
import type { PageProps } from "@dk-oasis/shared/portal-shell-core";

import { RuleStandardScreen } from "@/common/rule";

import { DISPLAY } from "./display";

export const SCREEN_ID = "rollingThicknessSet";

export function RollingThicknessSetPage(_props: PageProps) {
  return <RuleStandardScreen screenId={SCREEN_ID} display={DISPLAY} />;
}
