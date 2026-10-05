"use client";

/**
 * 디버거 들어가기 상태(하위 세트 계획 Ruling 15) — 들어간 하위 프레임 목록. 캔버스·값 표·노드 상세는 맨 위 프레임(`top`)을 본다.
 * 프레임은 그 프레임을 만든 기록(`last`)에 묶어 두고, 기록이 바뀌면(새 실행·중지) 같은 렌더에서 빈 목록으로 본다(효과로 지우면 한 렌더 동안 옛 프레임이 보인다).
 * 디버그 모드를 나갈 때 비우는 일은 편집기가 `backTo(0)` 으로 한다.
 */
import { useCallback, useMemo, useState } from "react";

import { enterFrame, type CallFrame } from "./call-stack";
import type { SimResult } from "./useSimulation";

export interface CallStack {
  frames: CallFrame[];
  top: CallFrame | null;
  /** 맨 위 프레임(없으면 최상위 기록)의 SET 노드로 들어간다. 들어갈 수 없으면(하위 기록·하위 흐름 없음) 그대로다. */
  enter(nodeId: string): void;
  /** 그 깊이까지 돌아간다 — 0 은 최상위. */
  backTo(depth: number): void;
  /** 맨 위 프레임의 커서를 옮긴다(0..n). */
  step(delta: number): void;
}

const NO_FRAMES: CallFrame[] = [];

interface Held {
  owner: SimResult | null;
  frames: CallFrame[];
}

export function useCallStack(last: SimResult | null): CallStack {
  const [held, setHeld] = useState<Held>({ owner: null, frames: NO_FRAMES });
  const frames = held.owner === last ? held.frames : NO_FRAMES;
  const enter = useCallback(
    (nodeId: string) => {
      if (!last) return;
      setHeld((h) => {
        const fs = h.owner === last ? h.frames : NO_FRAMES;
        const parent = fs[fs.length - 1];
        const f = enterFrame(parent ? parent.trace : last.trace, parent ? parent.flow : last.flow, nodeId, last.calledFlows ?? {});
        return f ? { owner: last, frames: [...fs, f] } : h;
      });
    },
    [last],
  );
  const backTo = useCallback(
    (depth: number) =>
      setHeld((h) => (h.frames.length === 0 || depth >= h.frames.length ? h : { owner: h.owner, frames: depth <= 0 ? NO_FRAMES : h.frames.slice(0, depth) })),
    [],
  );
  const step = useCallback(
    (delta: number) =>
      setHeld((h) => {
        const t = h.frames[h.frames.length - 1];
        if (!t) return h;
        const c = Math.min(t.trace.nodes.length, Math.max(0, t.cursor + delta));
        return c === t.cursor ? h : { owner: h.owner, frames: [...h.frames.slice(0, -1), { ...t, cursor: c }] };
      }),
    [],
  );
  const top = frames[frames.length - 1] ?? null;
  return useMemo(() => ({ frames, top, enter, backTo, step }), [frames, top, enter, backTo, step]);
}
