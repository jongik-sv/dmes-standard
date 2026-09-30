"use client";

/**
 * 왼쪽 룰 패널(3단계 계획 A4·P-D10) — 편집 모드면 위에 팔레트(누르거나 캔버스로 끌어 놓기), 아래에 룰 목록(찾기·끌어 넣기).
 * 보기 모드는 목록만(팔레트·끌기 없음). 디버그 모드의 왼쪽은 입력 패널(`DebugInputs`)이라 page 가 이 패널을 그리지 않는다.
 * Task 0 은 틀과 팔레트만 둔다. 룰 목록은 Task 7 이 채운다.
 */
import type { FlowMode } from "../state/useRuleSetEdit";
import type { RuleIo } from "../types";
import type { PaletteItem } from "./FlowCanvas";
import { FlowPalette } from "./FlowPalette";

export interface RulePanelProps {
  mode: FlowMode;
  loading: boolean;
  /** 룰 줄 [넣기] 의 대상 선. */
  selectedEdgeId: string | null;
  /** 팔레트 항목 누르기. */
  onPick(item: PaletteItem): void;
  /** 찾은 룰의 입출력을 page 의 룰 맵에 더한다. */
  onRules(ios: RuleIo[]): void;
  /** 룰 줄 [넣기] — 고른 선(없으면 END 앞 선)에 끼운다. */
  onInsertRule(ruleId: string): void;
  onError(e: unknown): void;
}

export function RulePanel(props: RulePanelProps) {
  const { mode, loading, onPick } = props;
  return (
    <div className="rsf-rule-panel" data-testid="flow-rule-panel">
      {mode === "edit" && <FlowPalette onPick={onPick} disabled={loading} />}
      {/* SEAM(T7): 룰 목록(flow-rule-panel-toggle·search·find·flow-rule-row-{ruleId}, RULE_MIME 끌기) — props.selectedEdgeId·onRules·onInsertRule·onError */}
    </div>
  );
}
