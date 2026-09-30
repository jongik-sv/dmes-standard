"use client";

/**
 * 노드 찾기(3단계 계획 B11) — 툴바 찾기 칸의 글자로 룰 ID·룰 이름·노드 라벨을 찾고 [다음] 으로 돌며 그 노드로 옮긴다(`onReveal`).
 * 글자를 바꾸면 순번만 0 으로 돌리고(옮기지 않는다), 첫 [다음]·Enter 는 첫 결과로, 그다음부터 옮기는 것은 다음 결과로 돈다(끝에서 처음으로). 접힌 블록 안의 노드를 펴는 것은 `onReveal` 의 몫이다.
 */
import { useCallback, useMemo, useRef, useState } from "react";

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

/** 룰 ID·룰 이름·노드 라벨에 질의가 들어 있는 흐름 노드 ID(대소문자 무시, 흐름 노드 순서). 빈 질의면 빈 목록. */
export function findNodes(flow: EditFlow | null, rules: RuleIoMap, query: string): string[] {
  const needle = query.trim().toLowerCase();
  if (!flow || needle === "") return NO_HITS;
  const out: string[] = [];
  for (const n of flow.nodes) {
    const rule = n.ruleId ? rules[n.ruleId] : undefined;
    const fields = [n.ruleId, rule?.ruleName, n.label];
    if (fields.some((x) => !!x && x.toLowerCase().includes(needle))) out.push(n.id);
  }
  return out.length > 0 ? out : NO_HITS;
}

export function useFind(flow: EditFlow | null, rules: RuleIoMap, onReveal: (nodeId: string) => void): FindState {
  const [query, setQueryState] = useState("");
  const [cursor, setCursor] = useState(0);
  /** 글자를 친 뒤 아직 한 번도 옮기지 않았는가 — 첫 [다음] 은 첫 결과로 간다. */
  const [moved, setMoved] = useState(false);
  const hits = useMemo(() => findNodes(flow, rules, query), [flow, rules, query]);
  // 흐름이 바뀌어 결과가 줄었으면 순번을 끝으로 당긴다.
  const index = hits.length === 0 ? -1 : Math.min(cursor, hits.length - 1);

  const ref = useRef({ onReveal, hits, index, moved });
  ref.current = { onReveal, hits, index, moved };

  const setQuery = useCallback((q: string) => {
    setQueryState(q);
    setCursor(0);
    setMoved(false);
  }, []);

  const next = useCallback(() => {
    const { hits: h, index: i, moved: was, onReveal: reveal } = ref.current;
    if (h.length === 0) return;
    const to = was ? (i + 1) % h.length : i;
    setCursor(to);
    setMoved(true);
    reveal(h[to]);
  }, []);

  return { query, setQuery, hits, index, next };
}
