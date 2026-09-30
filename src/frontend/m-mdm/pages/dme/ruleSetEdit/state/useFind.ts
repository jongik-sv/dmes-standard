"use client";

/**
 * 노드 찾기(3단계 계획 B11) — 툴바 찾기 칸의 글자로 룰 ID·룰 이름·노드 라벨을 찾고 [다음] 으로 돌며 그 노드로 옮긴다(`onReveal`).
 * Task 0 은 서명과 빈 결과만 둔다. 본문은 Task 8 이 채운다.
 */
import { useCallback, useState } from "react";

import type { EditFlow } from "../flow-edit";
import type { RuleIoMap } from "../types";

export interface FindState {
  query: string;
  setQuery(q: string): void;
  /** 찾은 흐름 노드 ID(흐름 순서). */
  hits: string[];
  /** 지금 가리키는 hits 순번(없으면 -1). */
  index: number;
  /** 다음 결과로 옮기고 onReveal 을 부른다. */
  next(): void;
}

const NO_HITS: string[] = [];

export function useFind(flow: EditFlow | null, rules: RuleIoMap, onReveal: (nodeId: string) => void): FindState {
  const [query, setQueryState] = useState("");
  const setQuery = useCallback((q: string) => setQueryState(q), []);
  const next = useCallback(() => {}, []);
  // SEAM(T8): flow·rules 에서 query 로 hits 계산(Local-Rules §16 — useMemo), next 로 index 를 돌며 onReveal(hits[index])
  return { query, setQuery, hits: NO_HITS, index: -1, next };
}
