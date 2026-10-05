"use client";

/**
 * ruleSetEdit — 룰 세트 편집(TSK-08-06). 정본: docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md.
 * 화면은 세트 탭 틀(`RuleSetTabs`, 하위 세트 spec §10)이고 탭마다 편집기(`RuleSetEditor`)가 하나씩 뜬다(최대 8).
 */
import { RuleSetTabs } from "./RuleSetTabs";

export default function RuleSetEditPage({ tabId }: { tabId?: string }) {
  return <RuleSetTabs tabId={tabId} />;
}
