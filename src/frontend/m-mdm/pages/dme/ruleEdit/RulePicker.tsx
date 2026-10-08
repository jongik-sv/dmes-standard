"use client";

/**
 * 룰 고르기 — 룰 화면 조회 영역(`SearchField` 라벨 "룰")의 검색 칸·[찾기]와 그 아래 드롭다운 목록. 모양·키 동작은 공통 `IdPicker`(`@/shell`)다.
 * 서버가 `SEARCH_LIMIT`(20)건에서 자르므로 꽉 차면 좁혀 검색하라고 안내한다.
 */
import { IdPicker, type IdPickRow } from "@/shell";

import { searchRulePrefix } from "./api";

/** 서버 `RuleEditService.SEARCH_LIMIT` 과 같다. */
export const RULE_PICK_LIMIT = 20;

const KIND_LABEL: Record<string, string> = { DECISION: "판정", DERIVE: "산출" };

async function searchRules(keyword: string): Promise<IdPickRow[]> {
  const rows = await searchRulePrefix(keyword);
  return rows.map((r) => ({
    id: r.maruRuleId,
    name: r.maruRuleName,
    external: r.sourceKind !== "MDM",
    kind: KIND_LABEL[r.ruleKind] ?? r.ruleKind,
    status: r.status,
  }));
}

export interface RulePickerProps {
  /** 지금 연 룰 ID — 칸에 채운다(링크로 열렸을 때 포함). */
  currentId?: string | null;
  onPick: (ruleId: string) => void;
  onError: (message: string) => void;
}

export function RulePicker({ currentId, onPick, onError }: RulePickerProps) {
  return (
    <IdPicker
      placeholder="룰 ID·룰명 앞부분"
      noun="룰"
      testId="rule-pick"
      search={searchRules}
      limit={RULE_PICK_LIMIT}
      currentId={currentId}
      onPick={onPick}
      onError={onError}
    />
  );
}
