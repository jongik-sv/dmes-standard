"use client";

/**
 * 블록 접기 상태(3단계 계획 D16) — 접힌 분기 ID 집합. 화면 상태이고 서버에 저장하지 않는다.
 * - 세트가 바뀌면 비운다.
 * - 흐름에서 분기가 사라지거나 블록이 닫히지 않게 되면 집합에서 뺀다(다시 생겨도 접히지 않는다).
 * - 접힌 블록의 멤버 구성이 바뀌면(접힌 채 갈래를 더하는 등 안쪽 편집) 그 분기를 편다 — 편집 결과를 눈으로 확인하게(스펙 D16 "먼저 펼친다").
 * - 위치만 바뀌는 흐름 변경에는 집합 참조를 그대로 둔다(캔버스가 노드를 다시 만들지 않게, Local-Rules §16).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { blockMembers, type EditFlow } from "../flow-edit";

export interface CollapseState {
  collapsed: ReadonlySet<string>;
  /** 분기 하나를 접거나 편다. */
  toggle(splitId: string): void;
  /** 이 노드를 감춘 접힌 블록을 모두 편다(찾기·검사 항목 이동 전). */
  expandFor(nodeId: string): void;
}

const NONE: ReadonlySet<string> = new Set<string>();

/** 접은 분기 ID → 접을 때의 블록 멤버 서명. */
type Folded = ReadonlyMap<string, string>;
interface Owned { setId: string | null; folded: Folded }
const EMPTY: Folded = new Map();

const signatureOf = (flow: EditFlow | null, splitId: string): string | null => {
  const members = flow ? blockMembers(flow, splitId) : null;
  return members ? members.join("|") : null;
};

export function useCollapse(flow: EditFlow | null, setId: string | null): CollapseState {
  const [owned, setOwned] = useState<Owned>({ setId, folded: EMPTY });
  const flowRef = useRef(flow);
  flowRef.current = flow;
  const setIdRef = useRef(setId);
  setIdRef.current = setId;

  /** 지금 세트·흐름에서 여전히 유효한 접힘만. */
  const live = useMemo<Folded>(() => {
    if (owned.setId !== setId || owned.folded.size === 0) return EMPTY;
    const next = new Map<string, string>();
    for (const [id, sig] of owned.folded) if (signatureOf(flow, id) === sig) next.set(id, sig);
    return next.size === owned.folded.size ? owned.folded : next;
  }, [owned, setId, flow]);

  // 유효하지 않게 된 접힘은 상태에서도 지운다(흐름이 되돌아와도 다시 접히지 않게).
  useEffect(() => {
    if (owned.setId !== setId || live !== owned.folded) setOwned({ setId, folded: live });
  }, [live, owned, setId]);

  // 집합 참조는 내용이 같으면 그대로 둔다.
  const setRef = useRef<ReadonlySet<string>>(NONE);
  const collapsed = useMemo<ReadonlySet<string>>(() => {
    const prev = setRef.current;
    if (live.size === prev.size && [...live.keys()].every((id) => prev.has(id))) return prev;
    const next = live.size === 0 ? NONE : new Set(live.keys());
    setRef.current = next;
    return next;
  }, [live]);

  const toggle = useCallback((splitId: string) => {
    setOwned((cur) => {
      const base: Folded = cur.setId === setIdRef.current ? cur.folded : EMPTY;
      const next = new Map(base);
      if (next.has(splitId)) next.delete(splitId);
      else {
        const sig = signatureOf(flowRef.current, splitId);
        if (sig === null) return cur;
        next.set(splitId, sig);
      }
      return { setId: setIdRef.current, folded: next };
    });
  }, []);

  const expandFor = useCallback((nodeId: string) => {
    setOwned((cur) => {
      if (cur.setId !== setIdRef.current || cur.folded.size === 0) return cur;
      const next = new Map(cur.folded);
      for (const id of cur.folded.keys()) {
        if (id === nodeId) continue;
        const members = flowRef.current ? blockMembers(flowRef.current, id) : null;
        if (members?.includes(nodeId)) next.delete(id);
      }
      return next.size === cur.folded.size ? cur : { setId: cur.setId, folded: next };
    });
  }, []);

  return useMemo(() => ({ collapsed, toggle, expandFor }), [collapsed, toggle, expandFor]);
}
