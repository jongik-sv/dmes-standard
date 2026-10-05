"use client";

/**
 * 오른쪽 패널 — 선택이 없을 때(2단계 계획 Task 10, P10). 세트명·설명(편집 모드만 입력), 세트 입출력 표(`flowIo`), 구성 지침.
 * 1단계 룰 세트 카드의 세트명·설명과 오른쪽 지침 카드를 옮겼다.
 * 4단계 Task 8: 머리글(세트명)은 `SidePanel`, 본문은 접는 섹션(기본 정보·세트 입출력·구성 지침) — testid 는 그대로.
 */
import { useMemo } from "react";

import { MutedText } from "@dk-oasis/shared/card";
import { DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { Input, Textarea } from "@dk-oasis/shared/form";
import { MdmFieldLabel } from "@dk-oasis/shared/mdm-meta";
import { DESCRIPTION_LABEL } from "@/ui-meta";

import { GuideCard } from "../cards/GuideCard";
import { SetIoTables } from "../cards/SetIoTables";
import type { EditFlow } from "../flow-edit";
import { flowIo } from "../set-model";
import type { RuleIo, RuleIoMap, SetCallIoMap } from "../types";
import { Section, type SectionMemory } from "./Section";

export interface SetPanelProps {
  flow: EditFlow;
  rules: RuleIoMap;
  /** 하위 세트 겉모양 — 입출력 표가 SET 노드의 입력·출력을 "세트 {ID}" 로 센다(하위 세트 spec §9). */
  calls?: SetCallIoMap;
  setName: string;
  description: string;
  /** 편집 모드이고 쓰는 중이 아님 — 세트명·설명을 고칠 수 있다. */
  editable: boolean;
  onSetName: (v: string) => void;
  onDescription: (v: string) => void;
  canApplyGuide: boolean;
  guideHint: string | undefined;
  onApplyGuide: (order: readonly string[], ios: readonly RuleIo[]) => void;
  onError: (e: unknown) => void;
  sections: SectionMemory;
}

const NO_CALLS: SetCallIoMap = {};

export function SetPanel(props: SetPanelProps) {
  const { flow, rules, calls = NO_CALLS, setName, description, editable, sections } = props;
  const io = useMemo(() => flowIo(flow, rules, calls), [flow, rules, calls]);
  return (
    <div className="rsf-panel" data-testid="flow-prop-set">
      <Section kind="SET" id="set-basic" title="기본 정보" memory={sections}>
        <table style={DETAIL_TABLE_STYLE}>
          <tbody>
            <tr>
              <th style={DETAIL_LABEL_CELL}>
                <MdmFieldLabel name="setName" meta="MARU_RULE_SETS_NM" label="세트명" required />
              </th>
              <td style={DETAIL_VALUE_CELL}>
                <Input data-testid="set-name" value={setName} disabled={!editable} onChange={props.onSetName} />
              </td>
            </tr>
            <tr>
              <th style={DETAIL_LABEL_CELL}>
                <MdmFieldLabel {...DESCRIPTION_LABEL} />
              </th>
              <td style={DETAIL_VALUE_CELL}>
                <Textarea data-testid="set-desc" value={description} rows={2} disabled={!editable} onChange={props.onDescription} />
              </td>
            </tr>
          </tbody>
        </table>
        <p className="rsf-panel-note">
          <MutedText>
            저장하면 바로 반영된다. 배포(스냅샷 발행)는 보류다. 세트 안의 룰은 각자 판정 시각에 유효한 RELEASED 버전으로 돈다. 노드를 누르면 그 노드의 속성을
            보인다
          </MutedText>
        </p>
      </Section>
      <Section kind="SET" id="set-io" title="세트 입출력" memory={sections}>
        <SetIoTables io={io} />
      </Section>
      <Section kind="SET" id="set-guide" title="구성 지침" memory={sections}>
        <GuideCard canApply={props.canApplyGuide} applyHint={props.guideHint} onApply={props.onApplyGuide} onError={props.onError} />
      </Section>
    </div>
  );
}
