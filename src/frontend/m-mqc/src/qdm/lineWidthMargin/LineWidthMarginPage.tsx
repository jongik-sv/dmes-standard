"use client";

/**
 * 폭마진량관리(lineWidthMargin) — 룰 기준 공통 틀(RuleStandardScreen)로 그린다. 레거시 업무기준 2종(C10B1073 PLTCM · C10B1079 정전)을
 * 공정 묶음으로 한 화면에서 보고, 「공정별 마진」 탭에서 두 공정을 같은 주문 폭으로 따로 판정해 합산 마진폭과 제품 폭을 본다.
 * 목록은 룰 ID(WM-)·우선순위·순번(0 예외)·원본주의 배지와 굵은 마진폭을 보인다(../width/display.ts). 간편판정은 주문 폭 → 제품 폭 타일을 더한다.
 */
import type { PageProps } from "@dk-oasis/shared/portal-shell-core";

import { RuleStandardScreen, type RuleExtraTab } from "@/common/rule";

import { widthDisplay } from "../width/display";
import { FlowPanel } from "../width/FlowPanel";

export const SCREEN_ID = "lineWidthMargin";

/** 결과 표시 — 룰 ID·우선순위·순번·원본주의·마진폭, 간편판정 주문 폭 → 제품 폭. */
export const DISPLAY = widthDisplay("margin");

const EXTRA_TABS: RuleExtraTab[] = [
  {
    key: "margin",
    label: "공정별 마진",
    render: (ctx) => <FlowPanel {...ctx} mode="parallel" />,
  },
];

export function LineWidthMarginPage(_props: PageProps) {
  return (
    <RuleStandardScreen
      screenId={SCREEN_ID}
      extraTabs={EXTRA_TABS}
      display={DISPLAY}
    />
  );
}
