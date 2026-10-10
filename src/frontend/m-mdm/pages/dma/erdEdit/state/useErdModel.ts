"use client";

/**
 * ERD 모델 상태(스펙 4.4 아래층) — view 로 모델 전체를 읽고 SSE 델타를 rev 순서대로 얹는다. 단계 1 은 읽기 뷰어라 위층(대기 명령)이 없다(S14).
 * - 다시 읽기는 세대 번호로 늦은 응답을 버린다(Local-Rules §37).
 * - 다시 읽는 동안 온 델타는 모아 두었다가 응답 rev 보다 큰 것만 순서대로 얹는다. 응답 rev 이하는 응답에 이미 있다.
 *   같은 동안 온 presence·claim 도 응답 값보다 새것이므로 그것을 쓴다.
 * - rev 를 건너뛴 델타(gap)는 모델 전체를 다시 읽게 한다. 같은 rev 를 두 번 받으면 두 번째는 버린다(save 응답을 먼저 얹은 경우).
 * - presence·claim 이 바뀌지 않았으면 상태를 바꾸지 않는다(Screen-Performance R7).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { viewModel } from "../api";
import type { ErdClaim, ErdDelta, ErdModelView, ErdPresence, ErdState } from "../types";
import { applyDelta, fromView, touchesColumns } from "./model-delta";

export interface ErdModelApi {
  state: ErdState | null;
  loading: boolean;
  error: string | null;
  /** 표·컬럼이 바뀔 때(전체 읽기 포함)마다 1 오른다. 화면은 이 값으로 표준 상태(view kind=STATUS)를 다시 읽는다. */
  columnsSeq: number;
  reload(): Promise<void>;
  applyDelta(delta: ErdDelta): void;
  setPresence(list: ErdPresence[]): void;
  setClaims(list: ErdClaim[]): void;
}

const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

export function useErdModel(modelId: string | null, load: (modelId: string) => Promise<ErdModelView> = viewModel): ErdModelApi {
  const [state, setState] = useState<ErdState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [columnsSeq, setColumnsSeq] = useState(0);
  const stateRef = useRef<ErdState | null>(null);
  const genRef = useRef(0);
  /** 다시 읽는 중이면 배열(그동안 온 델타), 아니면 null. */
  const bufferRef = useRef<ErdDelta[] | null>(null);
  const lateRef = useRef<{ presence?: ErdPresence[]; claims?: ErdClaim[] }>({});

  const commit = useCallback((next: ErdState | null) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const reload = useCallback(async () => {
    const gen = ++genRef.current;
    if (!modelId) {
      bufferRef.current = null;
      commit(null);
      // 앞선 읽기의 finally 는 세대가 바뀌어 loading 을 내리지 않으므로 여기서 내린다.
      setLoading(false);
      setError(null);
      return;
    }
    bufferRef.current = [];
    lateRef.current = {};
    setLoading(true);
    try {
      const view = await load(modelId);
      if (gen !== genRef.current) return;
      const prev = stateRef.current;
      const late = lateRef.current;
      let next: ErdState = {
        ...fromView(view),
        presence: late.presence ?? view.presence,
        claims: late.claims ?? (prev?.modelId === modelId ? prev.claims : []),
      };
      for (const d of bufferRef.current ?? []) {
        const out = applyDelta(next, d);
        if (out.kind === "applied") next = out.state;
        else if (out.kind === "gap") break; // 다음 live 델타가 다시 gap 을 알려 한 번 더 읽는다
      }
      bufferRef.current = null;
      lateRef.current = {};
      commit(next);
      setError(null);
      setColumnsSeq((s) => s + 1);
    } catch (e) {
      if (gen !== genRef.current) return;
      bufferRef.current = null;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (gen === genRef.current) setLoading(false);
    }
  }, [modelId, load, commit]);

  useEffect(() => {
    if (stateRef.current && stateRef.current.modelId !== modelId) commit(null);
    void reload();
  }, [reload, commit, modelId]);

  const applyDeltaCb = useCallback(
    (d: ErdDelta) => {
      if (bufferRef.current) {
        bufferRef.current.push(d);
        return;
      }
      const cur = stateRef.current;
      if (!cur || cur.modelId !== d.modelId) return;
      const out = applyDelta(cur, d);
      if (out.kind === "gap") {
        void reload();
        return;
      }
      if (out.kind === "stale") return;
      commit(out.state);
      if (touchesColumns(d)) setColumnsSeq((s) => s + 1);
    },
    [reload, commit],
  );

  const setPresence = useCallback(
    (list: ErdPresence[]) => {
      if (bufferRef.current) lateRef.current.presence = list;
      const cur = stateRef.current;
      if (!cur || sameJson(cur.presence, list)) return;
      commit({ ...cur, presence: list });
    },
    [commit],
  );

  const setClaims = useCallback(
    (list: ErdClaim[]) => {
      if (bufferRef.current) lateRef.current.claims = list;
      const cur = stateRef.current;
      if (!cur || sameJson(cur.claims, list)) return;
      commit({ ...cur, claims: list });
    },
    [commit],
  );

  return useMemo(
    () => ({ state, loading, error, columnsSeq, reload, applyDelta: applyDeltaCb, setPresence, setClaims }),
    [state, loading, error, columnsSeq, reload, applyDeltaCb, setPresence, setClaims],
  );
}
