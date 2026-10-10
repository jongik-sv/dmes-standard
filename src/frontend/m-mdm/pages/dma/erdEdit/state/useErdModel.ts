"use client";

/**
 * ERD 모델 상태(스펙 4.4). Task 9 뼈대: 아래층 하나 + 쓰기 줄. 서명은 README 정본이고 Task 10 이 속을 두 층(state/pending.ts)으로 바꾼다.
 * - 다시 읽기는 세대 번호로 늦은 응답을 버린다(Local-Rules §37). 다시 읽는 동안 온 델타는 모았다가 응답 rev 보다 큰 것만 얹는다.
 * - 쓰기 줄: apply·undo·exclusive 는 한 줄로 돈다(S2-17). 응답 델타는 applyDelta 로 얹고 같은 rev 의 SSE 는 stale 로 버린다.
 * - myRevs: 이 화면이 보낸 묶음의 반영 rev(되돌리기 제외, 오래된 순). reload({dropMine:true}) 면 비운다.
 * - presence·claim 이 바뀌지 않았으면 상태를 바꾸지 않는다(Screen-Performance R7).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { applyCommands, undoRev, viewModel } from "../api";
import { localNotice, noticeFromRejection, type ApplyOutcome } from "../edit-context";
import type { ErdApplyResult, ErdClaim, ErdCommandJson, ErdDelta, ErdModelView, ErdPresence, ErdState, ErdVersionEvent } from "../types";
import { applyDelta, fromView, touchesColumns, withVersion } from "./model-delta";
import type { PendingBatch } from "./pending";

export interface ErdModelApi {
  /** 투영 값(아래층 + 위층). 패널·캔버스는 이것만 읽는다. */
  state: ErdState | null;
  /** 아래층 — 서버가 확인한 마지막 rev. */
  server: ErdState | null;
  pending: readonly PendingBatch[];
  pendingIds: ReadonlySet<string>;
  myRevs: readonly number[];
  loading: boolean;
  error: string | null;
  /** 표·컬럼이 바뀔 때(전체 읽기 포함)마다 1 오른다. 화면은 이 값으로 표준 상태(view kind=STATUS)를 다시 읽는다. */
  columnsSeq: number;
  reload(opts?: { dropMine?: boolean }): Promise<void>;
  /** SSE change 입구. */
  applyDelta(delta: ErdDelta): void;
  setPresence(list: ErdPresence[]): void;
  setClaims(list: ErdClaim[]): void;
  onVersion(ev: ErdVersionEvent): void;
  apply(commands: ErdCommandJson[], label: string): Promise<ApplyOutcome>;
  undo(rev: number): Promise<ApplyOutcome>;
  exclusive<T>(fn: () => Promise<T>): Promise<T>;
}

const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const NO_REVS: readonly number[] = [];
const NO_PENDING: readonly PendingBatch[] = [];
const NO_IDS: ReadonlySet<string> = new Set();
const MY_REVS_MAX = 100;

export const errorNotice = (e: unknown) =>
  localNotice(e instanceof TypeError ? "NETWORK" : "INVALID", e instanceof Error ? e.message : String(e));

export function useErdModel(
  modelId: string | null, session: string, me: string | null, load: (modelId: string) => Promise<ErdModelView> = viewModel,
): ErdModelApi {
  const [myRevs, setMyRevs] = useState<readonly number[]>(NO_REVS);
  const myRevsRef = useRef<readonly number[]>(NO_REVS);
  const chainRef = useRef<Promise<unknown>>(Promise.resolve());
  const meRef = useRef({ userId: me ?? "", session });
  meRef.current = { userId: me ?? "", session };
  const setRevs = useCallback((next: readonly number[]) => {
    myRevsRef.current = next;
    setMyRevs(next);
  }, []);
  const [state, setState] = useState<ErdState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [columnsSeq, setColumnsSeq] = useState(0);
  const stateRef = useRef<ErdState | null>(null);
  const genRef = useRef(0);
  /** 다시 읽는 중이면 배열(그동안 온 델타), 아니면 null. */
  const bufferRef = useRef<ErdDelta[] | null>(null);
  const lateRef = useRef<{ presence?: ErdPresence[]; claims?: ErdClaim[] }>({});
  /** 지금 화면의 모델 id. 다른 모델의 늦은 델타·응답을 버린다. */
  const modelIdRef = useRef(modelId);
  modelIdRef.current = modelId;
  /** 모델을 바꾸거나 reload({dropMine:true}) 하면 1 오른다. 그 앞에 보낸 묶음의 응답은 얹지 않고 myRevs 에도 넣지 않는다. */
  const epochRef = useRef(0);

  const commit = useCallback((next: ErdState | null) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const reload = useCallback(async (opts?: { dropMine?: boolean }) => {
    if (opts?.dropMine) {
      epochRef.current++;
      setRevs(NO_REVS);
    }
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
        if (d.modelId !== modelId) continue;
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
  }, [modelId, load, commit, setRevs]);

  useEffect(() => {
    if (stateRef.current && stateRef.current.modelId !== modelId) {
      epochRef.current++;
      commit(null);
      setRevs(NO_REVS);
    }
    void reload();
  }, [reload, commit, setRevs, modelId]);

  const applyDeltaCb = useCallback(
    (d: ErdDelta) => {
      if (d.modelId !== modelIdRef.current) return;
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

  const onVersion = useCallback((ev: ErdVersionEvent) => {
    const cur = stateRef.current;
    if (!cur || cur.modelId !== ev.modelId) return;
    if (ev.ver !== cur.ver) {
      void reload();
      return;
    }
    const next = withVersion(cur, ev);
    if (next !== cur) commit(next);
  }, [reload, commit]);

  /** 쓰기 줄 — 앞 일이 끝난 뒤 돈다. 앞 일이 실패해도 다음 일은 돈다. */
  const exclusive = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    const run = chainRef.current.then(fn, fn);
    chainRef.current = run.catch(() => undefined);
    return run;
  }, []);

  const send = useCallback((commands: ErdCommandJson[], undoOf: number | null): Promise<ApplyOutcome> => {
    // 줄에 넣을 때의 모델·세대. 앞 묶음을 기다리는 사이 모델이 바뀌면 다른 모델로 보내지 않는다.
    const queuedModel = stateRef.current?.modelId ?? null;
    const queuedEpoch = epochRef.current;
    return exclusive(async (): Promise<ApplyOutcome> => {
      const cur = stateRef.current;
      if (!cur || bufferRef.current || cur.modelId !== queuedModel || epochRef.current !== queuedEpoch) {
        return { ok: false, notice: localNotice("RELOAD", "모델을 다시 읽는 중이라 보내지 않았습니다.", "모델을 읽은 뒤 다시 하세요.") };
      }
      let r: ErdApplyResult;
      try {
        r = undoOf === null
          ? await applyCommands(cur.modelId, cur.rev, session, commands)
          : await undoRev(cur.modelId, undoOf, session);
      } catch (e) {
        return { ok: false, notice: errorNotice(e) };
      }
      if (!r.applied) return { ok: false, notice: noticeFromRejection(r.rejection, commands) };
      // 응답을 기다리는 사이 모델을 바꿨거나 reload({dropMine:true}) 했으면 얹지 않는다(다시 읽은 모델·SSE 가 맞춘다).
      if (epochRef.current !== queuedEpoch) return { ok: true, rev: r.rev, warnings: r.warnings };
      applyDeltaCb({
        modelId: cur.modelId, rev: r.rev, userId: meRef.current.userId, session, source: "UI", rowVersion: r.rowVersion ?? null, changes: r.changes,
      });
      if (undoOf === null) setRevs([...myRevsRef.current, r.rev].slice(-MY_REVS_MAX));
      return { ok: true, rev: r.rev, warnings: r.warnings };
    });
  }, [exclusive, session, applyDeltaCb, setRevs]);

  const apply = useCallback((commands: ErdCommandJson[], _label: string) => send(commands, null), [send]);
  /** 되돌리기. 그 rev 를 먼저 myRevs 에서 뺀다(CONFLICT 여도 다시 꺼내지 않는다). */
  const undo = useCallback((rev: number) => {
    setRevs(myRevsRef.current.filter((x) => x !== rev));
    return send([], rev);
  }, [send, setRevs]);

  return useMemo(
    () => ({
      state, server: state, pending: NO_PENDING, pendingIds: NO_IDS, myRevs, loading, error, columnsSeq, reload,
      applyDelta: applyDeltaCb, setPresence, setClaims, onVersion, apply, undo, exclusive,
    }),
    [state, myRevs, loading, error, columnsSeq, reload, applyDeltaCb, setPresence, setClaims, onVersion, apply, undo, exclusive],
  );
}
