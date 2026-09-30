"use client";

/**
 * 놓인 노드·블록 끌어 옮기기(3단계 계획 A2) — 선 위에 놓으면 그 선으로 옮기고 놓은 위치를 같은 편집 한 번에 적는다(되돌리기 한 번).
 * Task 0 은 서명과 임시 본문(위치만 적기)만 둔다. 본문은 Task 7 이 채운다.
 */
import { useCallback } from "react";

import { setPositions, type FlowPos } from "../flow-edit";
import type { RuleSetEditState } from "./useRuleSetEdit";

export interface DragActions {
  moveNodeTo(nodeId: string, edgeId: string, pos: Record<string, FlowPos>): void;
}

export function useDragActions(state: RuleSetEditState): DragActions {
  const { edit } = state;
  const moveNodeTo = useCallback(
    (_nodeId: string, _edgeId: string, pos: Record<string, FlowPos>) => {
      edit((f) => setPositions(f, pos)); // SEAM(T7): moveNode + setPositions 한 번의 edit
    },
    [edit],
  );
  return { moveNodeTo };
}
