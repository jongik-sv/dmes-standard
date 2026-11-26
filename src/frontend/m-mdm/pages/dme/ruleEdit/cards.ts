/**
 * 룰 내용 편집 화면 카드 슬롯(TSK-08-02 design §6.8 확장 지점, decisions.md D-105).
 *
 * <p>D-105 — 헤더·버전 카드가 `ruleMng` 화면으로 옮겨 갔다. 이 화면은 내용 편집만 한다.
 *
 * <p>2026-11-04 — 한 화면에 내용이 너무 많다는 사용자 의견으로 본문에는 의사결정표와 활용처만 둔다. 열 설정(`ColumnSettingsSection`)과
 * 테스트(`RuleTestsPopup` — 값 테스트·테스트 결과·테스트 케이스)는 표 카드 머리의 버튼으로 여는 팝업이다.
 */
import { createElement, type ComponentType } from "react";

import type { NextVer } from "./state/useRuleEdit";
import type { RuleEditNotice, RuleEditView } from "./types";
import { RuleUsageCard } from "./cards/RuleUsageCard";
import { DecisionTableCard } from "./decision-table/DecisionTableCard";
import { TABLE_SECTIONS } from "./sections";

export interface RuleEditCardProps {
  view: RuleEditView;
  me: string;
  /** 표 편집 가능(서버 판정 `view.editable`, I7). */
  editable: boolean;
  reload: (ver?: NextVer) => Promise<void>;
  selectVer: (ver: string) => Promise<void>;
  notify: (notice: RuleEditNotice | null) => void;
  /** 쓰기 한 번 — 성공하면 view 를 다시 불러온다(next 가 돌려준 버전, 없으면 지금 버전). */
  runWrite: <T>(fn: () => Promise<T>, next?: (result: T) => NextVer) => Promise<T | undefined>;
  /** 저장 안 한 변경 표시 — 룰·버전을 바꿀 때 확인을 받는다. */
  setDirty: (cardId: string, dirty: boolean) => void;
  /** 카드 안 버튼의 RBAC(§6.7.0) — action 은 §6.1 의 RBAC 키. 권한이 없으면 숨기지 않고 비활성. */
  canDo: (action: string) => boolean;
  busy: boolean;
  /** 테스트 팝업을 연다(표 카드 [테스트]). 없으면(카드 단독 렌더) 버튼을 그리지 않는다. */
  openTests?: () => void;
}

export interface RuleEditCardSlot {
  id: string;
  /** 16칸 격자에서 차지하는 칸 수. */
  span: 6 | 8 | 10 | 16;
  Component: ComponentType<RuleEditCardProps>;
}

/** 표 카드 안 섹션(08-03 확장 자리). */
export interface RuleTableSection {
  id: string;
  Component: ComponentType<RuleEditCardProps>;
}

/** 섹션은 `sections/index.ts` 의 `TABLE_SECTIONS` 에 줄을 더해 늘린다. */
export const RULE_TABLE_SECTIONS: RuleTableSection[] = TABLE_SECTIONS;

/** 의사결정표 카드 — 표 카드 안 섹션 목록을 넘긴다. */
function TableCardSlot(props: RuleEditCardProps) {
  return createElement(DecisionTableCard, { ...props, extraSections: RULE_TABLE_SECTIONS });
}

export const RULE_EDIT_CARDS: RuleEditCardSlot[] = [
  { id: "table", span: 16, Component: TableCardSlot },
  { id: "usage", span: 16, Component: RuleUsageCard },
];
