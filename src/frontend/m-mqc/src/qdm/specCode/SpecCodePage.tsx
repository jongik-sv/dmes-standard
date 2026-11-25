"use client";

/**
 * 규격약호관리(specCode) — 룰 기준 공통 틀(RuleStandardScreen)로 그린다. 룰 두 개를 한 프로그램으로 본다:
 *   두께관리기준(QD_SPEC_THK_STD, 규격코드 → BMT/TCT), 원판강종 매핑(QD_SPEC_BASE_GRADE, 규격코드 + 강종코드 → 원판강종코드).
 * 「간편조회」 탭에서 규격코드·강종코드 한 벌로 두 값을 함께 본다(LookupPanel). 목록은 룰 ID(TK-·MP-)와 굵은 결과를 보인다.
 */
import type { PageProps } from "@dk-oasis/shared/portal-shell-core";

import {
  RuleStandardScreen,
  type RuleDisplay,
  type RuleExtraTab,
  type RuleGroup,
} from "@/common/rule";

import { BASE_GRADE_RULE, THK_STD_RULE } from "./lookup";
import { LookupPanel } from "./LookupPanel";

export const SCREEN_ID = "specCode";

/** 룰 묶음 — 프로토타입 탭 이름(두께관리기준·원판강종 매핑). */
export const GROUPS: RuleGroup[] = [
  { key: "THK_STD", label: "두께관리기준", ruleIds: [THK_STD_RULE] },
  { key: "BASE_GRADE", label: "원판강종 매핑", ruleIds: [BASE_GRADE_RULE] },
];

/** 결과 표시 — 룰 ID 열, 두께관리기준·원판강종코드 굵게. */
export const DISPLAY: RuleDisplay = {
  keyVar: "RULE_KEY",
  primaryVars: ["THK_STD_CD", "BASE_STL_GRD_CD"],
  blankValues: ["-"],
};

const EXTRA_TABS: RuleExtraTab[] = [
  {
    key: "lookup",
    label: "간편조회",
    render: (ctx) => <LookupPanel {...ctx} />,
  },
];

export function SpecCodePage(_props: PageProps) {
  return (
    <RuleStandardScreen
      screenId={SCREEN_ID}
      groups={GROUPS}
      display={DISPLAY}
      extraTabs={EXTRA_TABS}
    />
  );
}
