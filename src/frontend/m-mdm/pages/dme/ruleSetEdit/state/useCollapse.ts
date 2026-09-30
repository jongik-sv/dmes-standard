"use client";

/**
 * 블록 접기 상태(3단계 계획 D16) — 접힌 분기 ID 집합. 화면 상태이고 서버에 저장하지 않는다.
 * Task 0 은 서명과 빈 본문만 둔다. 본문은 Task 11 이 채운다.
 */
import { useCallback } from "react";

import type { EditFlow } from "../flow-edit";

export interface CollapseState {
  collapsed: ReadonlySet<string>;
  /** 분기 하나를 접거나 편다. */
  toggle(splitId: string): void;
  /** 이 노드를 감춘 접힌 블록을 모두 편다(찾기·검사 항목 이동 전). */
  expandFor(nodeId: string): void;
}

const NONE: ReadonlySet<string> = new Set<string>();

export function useCollapse(flow: EditFlow | null, setId: string | null): CollapseState {
  const toggle = useCallback((_splitId: string) => {}, []);
  const expandFor = useCallback((_nodeId: string) => {}, []);
  // SEAM(T11): 접힌 분기 집합(세트가 바뀌면 비움, 흐름에 없는 분기는 버림)·toggle·expandFor(blockMembers 로 감춘 블록 찾기)
  return { collapsed: NONE, toggle, expandFor };
}
