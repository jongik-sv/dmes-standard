"use client";

/**
 * 공정라우팅관리(processRouting) — 룰 기준 공통 틀(RuleStandardScreen)로 그린다. 룰 QD_PROCESS_ROUTING 하나:
 * 제품군·재질·엠보스·Spangle·도금량·표면처리·두께·폭 → 냉연도금공정(라우팅 코드). 목록은 룰 ID(PR-)와 굵은 냉연도금공정을 보인다.
 */
import type { PageProps } from "@dk-oasis/shared/portal-shell-core";

import { RuleStandardScreen, type RuleDisplay } from "@/common/rule";

export const SCREEN_ID = "processRouting";

/** 결과 표시 — 룰 ID 열, 냉연도금공정 굵게. 빈 결과("-")는 미정. */
export const DISPLAY: RuleDisplay = {
  keyVar: "RULE_KEY",
  primaryVars: ["ROUTE_CD"],
  blankValues: ["-"],
};

export function ProcessRoutingPage(_props: PageProps) {
  return <RuleStandardScreen screenId={SCREEN_ID} display={DISPLAY} />;
}
