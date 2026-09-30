"use client";

/**
 * 오른쪽 패널 — 선택이 없을 때(2단계 계획 Task 10, P10). 세트명·설명(편집 모드만 입력), 세트 입출력 표(`flowIo`), 구성 지침.
 * 1단계 룰 세트 카드의 세트명·설명과 오른쪽 지침 카드를 옮겼다.
 */
import { useMemo } from "react";

import { DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { Input, Textarea } from "@dk-oasis/shared/form";

import { MutedText } from "../../ruleEdit/cards/CardFrame";
import { GuideCard } from "../cards/GuideCard";
import { SetIoTables } from "../cards/SetIoTables";
import type { EditFlow } from "../flow-edit";
import { flowIo } from "../set-model";
import type { RuleIo, RuleIoMap } from "../types";

import "./panels.css";

export interface SetPanelProps {
  flow: EditFlow;
  rules: RuleIoMap;
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
}

export function SetPanel(props: SetPanelProps) {
  const { flow, rules, setName, description, editable } = props;
  const io = useMemo(() => flowIo(flow, rules), [flow, rules]);
  return (
    <div className="rsf-panel" data-testid="flow-prop-set">
      <p className="rsf-panel-title">룰 세트</p>
      <table style={DETAIL_TABLE_STYLE}>
        <tbody>
          <tr>
            <th style={DETAIL_LABEL_CELL}>세트명 *</th>
            <td style={DETAIL_VALUE_CELL}>
              <Input data-testid="set-name" value={setName} disabled={!editable} onChange={props.onSetName} />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>설명</th>
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

      <SetIoTables io={io} />

      <div className="rsf-panel-block">
        <GuideCard canApply={props.canApplyGuide} applyHint={props.guideHint} onApply={props.onApplyGuide} onError={props.onError} />
      </div>
    </div>
  );
}
