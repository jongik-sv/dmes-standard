/**
 * 룰 내용 편집 화면 카드 슬롯(TSK-08-02 design §6.8 확장 지점, decisions.md D-105).
 *
 * 형제 Task 는 기존 줄을 고치지 않고 카드 파일을 만들어 `RULE_EDIT_CARDS` 에 항목을 더한다(08-04 값 테스트·테스트 결과·테스트
 * 케이스 카드). 08-03 은 표 카드 아래 섹션(열 설정·입력 계약·피벗)을 `RULE_TABLE_SECTIONS` 에 더한다.
 * 카드 ⑦ 배포 대상은 그리지 않는다(D11).
 *
 * <p>D-105 — 카드 ① 헤더·② 버전이 `ruleMng` 화면으로 옮겨 갔다. 이 화면은 ③ 의사결정표·열 설정과 ④⑤⑥ 값 테스트·케이스,
 * ⑧ 활용처 — <b>내용 편집만</b> 한다.
 */
import { createElement, type ComponentType } from "react";

import type { NextVer } from "./state/useRuleEdit";
import type { RuleEditNotice, RuleEditView } from "./types";
import { RuleUsageCard } from "./cards/RuleUsageCard";
import { TestCaseCard } from "./cards/TestCaseCard";
import { TestResultCard } from "./cards/TestResultCard";
import { ValueTestCard } from "./cards/ValueTestCard";
import { DecisionTableCard } from "./decision-table/DecisionTableCard";
import { TABLE_SECTIONS } from "./sections";

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
  /** 16칸 격자에서 차지하는 칸 수(묶음 안에서는 묶음 격자의 칸 수). */
  span: 6 | 8 | 10 | 16;
  Component: ComponentType<RuleEditCardProps>;
  /** 이어진 카드를 한 덩어리로 접는 묶음 id(`RULE_EDIT_GROUPS`). 없으면 혼자 선다. */
  group?: string;
}

/**
 * 접을 수 있는 카드 묶음 — 제목 줄 하나로 묶음 안 카드를 함께 접는다.
 *
 * <p>D-105 — `headerVersions`(① 헤더 · ② 버전) 묶음이 사라졌다. 헤더·버전 관리는 `ruleMng` 화면으로 옮겨 갔다
 * (마루 코드 D-101·마스터데이터 D-104 와 같은 분할). 여기 남는 것은 내용 편집뿐이다.
 */
export const RULE_EDIT_GROUPS: Record<string, { title: string }> = {
  valueTests: { title: "④ 값 테스트 · ⑤ 테스트 결과 · ⑥ 테스트 케이스" },
};

export type RuleEditCardSegment =
  | { kind: "card"; slot: RuleEditCardSlot }
  | { kind: "group"; id: string; title: string; slots: RuleEditCardSlot[] };

/** 카드 목록을 그릴 덩어리로 나눈다 — 같은 group 이 이어진 카드는 한 덩어리가 된다. */
export function cardSegments(cards: RuleEditCardSlot[]): RuleEditCardSegment[] {
  const out: RuleEditCardSegment[] = [];
  for (const slot of cards) {
    const last = out[out.length - 1];
    if (slot.group && last?.kind === "group" && last.id === slot.group) last.slots.push(slot);
    else if (slot.group) out.push({ kind: "group", id: slot.group, title: RULE_EDIT_GROUPS[slot.group]?.title ?? slot.group, slots: [slot] });
    else out.push({ kind: "card", slot });
  }
  return out;
}

/** 표 카드 아래 섹션(08-03 확장 자리). */
export interface RuleTableSection {
  id: string;
  Component: ComponentType<RuleEditCardProps>;
}

/** 섹션은 `sections/index.ts` 의 `TABLE_SECTIONS` 에 줄을 더해 늘린다(TSK-08-03: 열 설정, 다음 단계: 피벗·입력 계약). */
export const RULE_TABLE_SECTIONS: RuleTableSection[] = TABLE_SECTIONS;

/** 카드 ③ — 표 아래 섹션 목록을 넘긴다. */
function TableCardSlot(props: RuleEditCardProps) {
  return createElement(DecisionTableCard, { ...props, extraSections: RULE_TABLE_SECTIONS });
}

export const RULE_EDIT_CARDS: RuleEditCardSlot[] = [
  { id: "table", span: 16, Component: TableCardSlot },
  // ④·⑤·⑥ 은 위아래로 쌓는다 — 입력 표·결과 표가 좌우 절반 폭에서는 좁다.
  { id: "valueTest", span: 16, Component: ValueTestCard, group: "valueTests" },
  { id: "testResult", span: 16, Component: TestResultCard, group: "valueTests" },
  { id: "testCases", span: 16, Component: TestCaseCard, group: "valueTests" },
  { id: "usage", span: 16, Component: RuleUsageCard },
];
