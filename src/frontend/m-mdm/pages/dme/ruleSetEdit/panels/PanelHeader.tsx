"use client";

/**
 * 오른쪽 패널 머리글(4단계 계획 Task 8, 스펙 §1.3) — 종류 아이콘(도구 상자와 같은 아이콘)·종류 이름(작은 굵은 글씨)·그 아래 이름(제목·룰명·세트명).
 * 보기·편집 모드에서 늘 맨 위다. 디버그 모드 오른쪽은 변수 패널이라 없다.
 */
import {
  IconArrowRight, IconArrowsSplit, IconBoxMultiple, IconGitBranch, IconGitMerge, IconListDetails, IconNote, IconPlayerPlay, IconPlayerStop, IconSitemap,
} from "@tabler/icons-react";

import { TASK_LABEL, type EditFlow } from "../flow-edit";
import type { RuleIoMap } from "../types";

/** 머리글·섹션 기억의 종류. 흐름 노드 종류는 이름 그대로다(TASK 는 Task 9 가 흐름에 더한다 — 여기서는 자기 유니온의 문자열일 뿐이다). */
export type PanelKind = "SET" | "EDGE" | "START" | "END" | "RULE" | "TASK" | "IF" | "PARALLEL" | "MERGE" | "NOTE" | "GROUP";

/** 종류 이름·아이콘 — 룰·빈 단계·IF·병렬·메모·그룹은 도구 상자(`PALETTE_ITEMS`)와 같은 아이콘이다(빈 단계는 [룰] 단추가 놓는다). */
export const PANEL_KIND: Readonly<Record<PanelKind, { label: string; icon: typeof IconNote }>> = {
  SET: { label: "룰 세트", icon: IconSitemap },
  EDGE: { label: "연결선", icon: IconArrowRight },
  START: { label: "시작", icon: IconPlayerPlay },
  END: { label: "끝", icon: IconPlayerStop },
  RULE: { label: "룰", icon: IconListDetails },
  TASK: { label: "빈 단계", icon: IconListDetails },
  IF: { label: "IF 분기", icon: IconGitBranch },
  PARALLEL: { label: "병렬 분기", icon: IconArrowsSplit },
  MERGE: { label: "합류", icon: IconGitMerge },
  NOTE: { label: "메모", icon: IconNote },
  GROUP: { label: "그룹", icon: IconBoxMultiple },
};

export interface PanelTarget {
  kind: PanelKind;
  /** 노드·메모·그룹·선 ID, 세트면 null. */
  id: string | null;
  name: string;
}

/** 고른 것(노드·메모·그룹, 없으면 선, 없으면 세트)의 머리글 대상. 흐름에 없는 ID 는 고르지 않은 것으로 본다. */
export function panelTargetOf(flow: EditFlow, rules: RuleIoMap, selectedId: string | null, selectedEdgeId: string | null, setName: string): PanelTarget {
  if (selectedId) {
    const n = flow.nodes.find((x) => x.id === selectedId);
    if (n) {
      if (n.kind === "RULE") {
        const io = n.ruleId ? rules[n.ruleId] : undefined;
        return { kind: "RULE", id: n.id, name: io && io.exists ? (io.ruleName ?? n.ruleId ?? n.id) : "(없는 룰)" };
      }
      return { kind: n.kind as PanelKind, id: n.id, name: n.label ?? (n.kind === "TASK" ? TASK_LABEL : n.id) };
    }
    const note = flow.view.notes.find((x) => x.id === selectedId);
    if (note) return { kind: "NOTE", id: note.id, name: note.text.split("\n")[0].trim() || note.id };
    const group = flow.view.groups.find((x) => x.id === selectedId);
    if (group) return { kind: "GROUP", id: group.id, name: group.title || group.id };
  }
  if (selectedEdgeId) {
    const e = flow.edges.find((x) => x.id === selectedEdgeId);
    if (e) return { kind: "EDGE", id: e.id, name: e.label ?? `${e.from} → ${e.to}` };
  }
  return { kind: "SET", id: null, name: setName };
}

export function PanelHeader({ target }: { target: PanelTarget }) {
  const { label, icon: Icon } = PANEL_KIND[target.kind];
  return (
    <div className="rsf-panel-header" data-testid="flow-panel-header" data-kind={target.kind}>
      <span className="rsf-panel-header-icon" aria-hidden="true">
        <Icon size={20} />
      </span>
      <div className="rsf-panel-header-text">
        <p className="rsf-panel-header-kind" data-testid="flow-panel-kind">
          {label}
        </p>
        <p className="rsf-panel-header-name" data-testid="flow-panel-name">
          {target.name}
        </p>
      </div>
    </div>
  );
}
