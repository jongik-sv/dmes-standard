"use client";

/**
 * 폭수축량관리(lineWidthShrinkage) — 룰 기준 공통 틀(RuleStandardScreen)의 기준 화면.
 * 레거시 업무기준 5종(C10B1074 PLTCM · C10B1075 CGL · C10B1076 EGL · C10B1077 정전 · C10B1078 CCL)을 공정 묶음으로 한 화면에서 보고,
 * 「공정 흐름」 탭에서 5개 공정을 차례로 판정해 합산 폭수축량을 본다. 편집은 Maru 룰 편집 화면으로 넘긴다.
 * 목록은 룰 ID(WR-)·우선순위·순번(0 예외)·원본주의 배지와 굵은 폭감소량을 보인다(../width/display.ts).
 */
import type { PageProps } from "@dk-oasis/shared/portal-shell-core";

import {
  RuleStandardScreen,
  screenGroups,
  type RuleExtraTab,
  type RuleGroup,
} from "@/common/rule";

import { widthDisplay } from "../width/display";
import { FlowPanel } from "../width/FlowPanel";

export const SCREEN_ID = "lineWidthShrinkage";

/** catalog 가 비어 있을 때 쓰는 공정 묶음(공정 순서 = 흐름 순서). */
export const FALLBACK_GROUPS: RuleGroup[] = [
  { key: "PLTCM", label: "PLTCM", ruleIds: ["C10B1074"] },
  { key: "CGL", label: "CGL", ruleIds: ["C10B1075"] },
  { key: "EGL", label: "EGL", ruleIds: ["C10B1076"] },
  { key: "JZ", label: "정전", ruleIds: ["C10B1077"] },
  { key: "CCL", label: "CCL", ruleIds: ["C10B1078"] },
];

const catalogGroups = screenGroups(SCREEN_ID);
/** 공정 묶음 — catalog SCREEN_RULES 가 있으면 그것, 없으면 FALLBACK_GROUPS. 모듈 상수다(렌더마다 새 배열을 만들지 않는다). */
export const GROUPS: RuleGroup[] =
  catalogGroups.length > 0 ? catalogGroups : FALLBACK_GROUPS;

/** 결과 표시 — 룰 ID·우선순위·순번·원본주의·폭감소량, 간편판정 진입 폭 → 출측 폭. */
export const DISPLAY = widthDisplay("shrink");

const EXTRA_TABS: RuleExtraTab[] = [
  { key: "flow", label: "공정 흐름", render: (ctx) => <FlowPanel {...ctx} /> },
];

export function LineWidthShrinkagePage(_props: PageProps) {
  return (
    <RuleStandardScreen
      screenId={SCREEN_ID}
      groups={GROUPS}
      extraTabs={EXTRA_TABS}
      display={DISPLAY}
    />
  );
}
