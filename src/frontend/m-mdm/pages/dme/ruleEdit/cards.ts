/**
 * 룰 화면 카드 슬롯(TSK-08-02 design §6.8 확장 지점).
 *
 * 형제 Task 는 기존 줄을 고치지 않고 카드 파일을 만들어 `RULE_EDIT_CARDS` 에 항목을 더한다(08-04 값 테스트·테스트 결과·테스트
 * 케이스 카드). 08-03 은 표 카드 아래 섹션(열 설정·입력 계약·피벗)을 `RULE_TABLE_SECTIONS` 에 더한다.
 * 카드 ⑦ 배포 대상은 그리지 않는다(D11).
 */
import { createElement, type ComponentType } from "react";

import type { NextVer } from "./state/useRuleEdit";
import type { RuleEditNotice, RuleEditView } from "./types";
import { RuleHeaderCard } from "./cards/RuleHeaderCard";
import { RuleUsageCard } from "./cards/RuleUsageCard";
import { RuleVersionCard } from "./cards/RuleVersionCard";
import { DecisionTableCard } from "./decision-table/DecisionTableCard";

export interface RuleEditCardProps {
  view: RuleEditView;
  me: string;
  /** 표 편집 가능(서버 판정 `view.editable`, I7). */
  editable: boolean;
  reload: (ver?: NextVer) => Promise<void>;
  selectVer: (ver: number) => Promise<void>;
  notify: (notice: RuleEditNotice | null) => void;
  /** 쓰기 한 번 — 성공하면 view 를 다시 불러온다(next 가 돌려준 버전, 없으면 지금 버전). */
  runWrite: <T>(fn: () => Promise<T>, next?: (result: T) => NextVer) => Promise<T | undefined>;
  /** 저장 안 한 변경 표시 — 룰·버전을 바꿀 때 확인을 받는다. */
  setDirty: (cardId: string, dirty: boolean) => void;
  /** 카드 안 버튼의 RBAC(§6.7.0) — action 은 §6.1 의 RBAC 키. 권한이 없으면 숨기지 않고 비활성. */
  canDo: (action: string) => boolean;
  busy: boolean;
}

export interface RuleEditCardSlot {
  id: string;
  /** 16칸 격자에서 차지하는 칸 수. */
  span: 6 | 8 | 10 | 16;
  Component: ComponentType<RuleEditCardProps>;
}

/** 표 카드 아래 섹션(08-03 확장 자리). */
export interface RuleTableSection {
  id: string;
  Component: ComponentType<RuleEditCardProps>;
}

export const RULE_TABLE_SECTIONS: RuleTableSection[] = [];

/** 카드 ③ — 표 아래 섹션 목록을 넘긴다. */
function TableCardSlot(props: RuleEditCardProps) {
  return createElement(DecisionTableCard, { ...props, extraSections: RULE_TABLE_SECTIONS });
}

export const RULE_EDIT_CARDS: RuleEditCardSlot[] = [
  { id: "header", span: 8, Component: RuleHeaderCard },
  { id: "versions", span: 8, Component: RuleVersionCard },
  { id: "table", span: 16, Component: TableCardSlot },
  { id: "usage", span: 16, Component: RuleUsageCard },
];
