/**
 * 표 카드 아래 섹션 목록(TSK-08-03). 순서대로 그린다: 열 설정 → 피벗 → 입력 계약.
 * `cards.ts` 의 `RULE_TABLE_SECTIONS` 가 이 배열을 그대로 쓴다.
 */
import type { RuleTableSection } from "../cards";
import { ColumnSettingsSection } from "./columns/ColumnSettingsSection";
import { InputContractSection } from "./contract/InputContractSection";
import { PivotSection } from "./pivot/PivotSection";

export const TABLE_SECTIONS: RuleTableSection[] = [
  { id: "columns", Component: ColumnSettingsSection },
  { id: "pivot", Component: PivotSection },
  { id: "contract", Component: InputContractSection },
];
