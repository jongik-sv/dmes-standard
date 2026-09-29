/**
 * 표 카드 아래 섹션 목록(TSK-08-03). 순서대로 그린다: 열 설정 → 입력 계약 변경 알림(달라진 것이 있을 때만 한 줄씩).
 * `cards.ts` 의 `RULE_TABLE_SECTIONS` 가 이 배열을 그대로 쓴다.
 *
 * 2026-09-28 — 피벗 보기 섹션을 뺐다. 결과 열 그룹(`res_grp`/`grp_cond`)이 같은 정보를 조건식 안에서 표현하는데,
 * 피벗은 그것을 표로 한 번 더 펼쳐 두기만 했다(엔진은 축을 읽지 않았다). 두 표현 중 그룹만 남긴다.
 *
 * 2026-09-29 — 입력 계약 섹션(조건 변수·행별 필수·선택 표)을 RELEASED 대비 변경 알림으로 줄였다. 같은 계약은 ④ 값 테스트 입력 표가 보인다.
 */
import type { RuleTableSection } from "../cards";
import { ColumnSettingsSection } from "./columns/ColumnSettingsSection";
import { ContractChangeNotice } from "./contract/ContractChangeNotice";

export const TABLE_SECTIONS: RuleTableSection[] = [
  { id: "columns", Component: ColumnSettingsSection },
  { id: "contract", Component: ContractChangeNotice },
];
