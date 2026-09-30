"use client";

/**
 * 놓인 노드·블록 끌어 옮기기(3단계 계획 A2) — 선 위에 놓으면 그 선으로 옮기고 놓은 위치를 같은 편집 한 번에 적는다(되돌리기 한 번).
 * 노드 옮기기와 위치 적기를 한 번의 edit 으로 묶는다. 옮기기가 거부되면 위치도 적지 않고 사유만 알린다.
 */
import { useCallback } from "react";

import { moveNode, setPositions, type FlowPos } from "../flow-edit";
import type { RuleSetEditState } from "./useRuleSetEdit";

export interface DragActions {
  moveNodeTo(nodeId: string, edgeId: string, pos: Record<string, FlowPos>): void;
}

export function useDragActions(state: RuleSetEditState): DragActions {
  const { edit } = state;
  const moveNodeTo = useCallback(
    (nodeId: string, edgeId: string, pos: Record<string, FlowPos>) => {
      edit((f) => {
        const r = moveNode(f, nodeId, edgeId);
        return r.ok ? { ok: true, flow: setPositions(r.flow, pos) } : r;
      });
    },
    [edit],
  );
  return { moveNodeTo };
}
