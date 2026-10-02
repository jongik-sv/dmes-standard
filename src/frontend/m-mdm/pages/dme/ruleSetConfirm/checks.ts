/** 룰 세트 확정 검사 항목 제목(D-144 2단계, 서버 MdmRuleSetConfirmCheckItem). 확정 흐름 판정은 ruleConfirm/checks 를 그대로 쓴다. */
import { APPLY_FROM_ITEM } from "../ruleConfirm/checks";

export const SET_CHECK_TITLES: Record<string, string> = {
  FLOW_STRUCTURE: "흐름 구조",
  RULES_RELEASED: "참조 룰 RELEASED",
  ORDER: "순서·순환",
  TEST_CASES: "테스트 케이스",
  [APPLY_FROM_ITEM]: "적용 순서",
};

export function setCheckTitle(item: string): string {
  return SET_CHECK_TITLES[item] ?? item;
}
