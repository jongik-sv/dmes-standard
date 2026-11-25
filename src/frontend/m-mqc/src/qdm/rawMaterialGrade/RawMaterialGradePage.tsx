"use client";

/**
 * 원자재강종관리(rawMaterialGrade) — 룰 기준 공통 틀(RuleStandardScreen)로 그린다. 룰 QD_RAW_MATERIAL_GRADE 하나:
 * 품명·규격약호·주문용도·두께 → 재질코드·적정원료·차선원료·메시지. 도금기준 룰을 원판으로 칼라파생 룰이 결과를 물려받는다(원판연계).
 * 「원판연계」 탭에서 도금기준 → 칼라파생 나무와 칼라전용 룰, 재검토 필요(원판과 다름·원판 변경)를 본다(LineagePanel).
 * 원판 변경은 버전 이력으로 보므로 화면이 이력을 한 번 읽어 목록 배지와 원판연계 탭에 함께 쓴다.
 */
import { useMemo } from "react";

import type { PageProps } from "@dk-oasis/shared/portal-shell-core";

import {
  RuleStandardScreen,
  useRuleHistory,
  type RuleExtraTab,
} from "@/common/rule";

import { rawMaterialDisplay } from "./display";
import { RULE_ID } from "./lineage";
import { LineagePanel } from "./LineagePanel";

export const SCREEN_ID = "rawMaterialGrade";

export function RawMaterialGradePage(_props: PageProps) {
  // 원판 변경(앞 버전과 비교)에 쓰는 이력. 못 읽으면 원판 변경만 빠진다(나머지 검사는 그대로).
  const { versions } = useRuleHistory(RULE_ID);
  const display = useMemo(() => rawMaterialDisplay(versions), [versions]);
  const extraTabs = useMemo<RuleExtraTab[]>(
    () => [
      {
        key: "lineage",
        label: "원판연계",
        render: (ctx) => <LineagePanel {...ctx} versions={versions} />,
      },
    ],
    [versions],
  );
  return (
    <RuleStandardScreen
      screenId={SCREEN_ID}
      display={display}
      extraTabs={extraTabs}
    />
  );
}
