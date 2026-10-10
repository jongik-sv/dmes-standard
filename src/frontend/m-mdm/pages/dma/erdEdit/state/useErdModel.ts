"use client";

/**
 * ERD 모델 상태(스펙 4.4 두 층) — 아래층은 view·SSE 로 맞춘 서버 상태, 위층은 내 대기 묶음(state/pending.ts). state 는 투영 값이다.
 * - 쓰기 줄: apply·undo·exclusive 는 한 줄(chain)로 돈다. 그래서 보내는 묶음은 늘 하나 이하다(S2-17).
 * - 다시 읽기는 세대 번호로 늦은 응답을 버린다(Local-Rules §37). 다시 읽는 동안 온 델타는 모았다가 응답 rev 보다 큰 것만 얹는다.
 *   다시 읽으면 대기 묶음·보관 델타를 버린다. 보내지 않은 묶음의 apply 는 RELOAD 알림으로 끝난다. 다시 읽는 중에는 보내지 않는다.
 * - 모델을 바꾸거나 reload({dropMine:true})(SSE reload — DRAFT 삭제·새 DRAFT) 하면 세대(epoch)가 오른다.
 *   묶음은 줄에 넣을 때의 모델·세대를 기억한다. 보내기 전에 바뀌었으면 보내지 않고, 응답 뒤에 바뀌었으면 얹지 않고 myRevs 에도 넣지 않는다.
 *   다른 모델의 SSE 델타는 다시 읽는 동안 모은 것까지 버린다. dropMine 이면 myRevs 도 비운다. 그 앞 rev 는 되돌릴 수 없다.
 * - myRevs: 반영 응답 rev 만(되돌리기 제외, 오래된 순). undo 는 그 rev 를 먼저 꺼낸다. 요청이 서버에 닿지 않으면(연결 실패·RELOAD 거절)
 *   다시 넣는다. 서버가 거절(CONFLICT 등)하거나 5xx·시간 초과(서버가 반영했을 수 있다)면 꺼낸 채로 둔다.
 * - 화면을 닫으면 세대가 오른다. 줄에 남은 묶음은 보내지 않는다.
 * - exclusive(S2-29): fn 결과에 숫자 rev 가 있으면 아래층 rev 가 그 rev 에 닿을 때(최대 HOLD_LIMIT_MS) 다음 일을 놓는다.
 *   늦은 SSE 에코가 다음 묶음의 에코로 잘못 읽히지 않게 한다. 5초를 넘으면 다시 읽은 뒤 놓는다. 부른 쪽은 결과를 바로 받는다.
 * - 보관 델타가 있으면 1초마다 보고 5초를 넘으면 다시 읽는다. 다시 읽는 중에는 새로 읽지 않는다.
 * - presence·claim 이 바뀌지 않았으면 상태를 바꾸지 않는다(Screen-Performance R7).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { HttpError } from "@dk-oasis/shared/http";

import { applyCommands, undoRev, viewModel } from "../api";
import { localNotice, noticeFromRejection, type ApplyOutcome, type ErdNotice } from "../edit-context";
import type { ErdApplyResult, ErdClaim, ErdCommandJson, ErdDelta, ErdModelView, ErdPresence, ErdState, ErdVersionEvent } from "../types";
import { applyDelta, fromView, touchesColumns, withVersion } from "./model-delta";
import {
  HOLD_LIMIT_MS, dropBatch, enqueue, initLayers, markSending, onReloaded, onResult, onStream, onTick, pendingIds, project, resultDelta,
  type Layers, type PendingBatch,
} from "./pending";

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
  /** 쓰기 줄이 빌 때까지 기다렸다가 fn 을 돈다. fn 안에서 apply·undo·exclusive 를 부르지 않는다(같은 줄을 기다려 멈춘다). */
  exclusive<T>(fn: () => Promise<T>): Promise<T>;
}

const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const NO_REVS: readonly number[] = [];
const NO_PENDING: readonly PendingBatch[] = [];
const MY_REVS_MAX = 100;
const TICK_MS = 1000;

/** 공통 http 가 fetch 실패(TypeError)를 바꿔 던지는 글의 앞머리. 그 상수는 내보내지 않으므로 앞머리로 가린다. */
const NETWORK_PREFIX = "서버와 연결할 수 없습니다";

/** 요청이 서버에 닿지 않은 실패인가 — fetch 의 TypeError, 또는 공통 http 가 바꾼 연결 실패(HttpError 가 아닌 Error). */
export function isNetworkError(e: unknown): boolean {
  if (e instanceof TypeError) return true;
  return e instanceof Error && !(e instanceof HttpError) && e.message.startsWith(NETWORK_PREFIX);
}

export const errorNotice = (e: unknown) =>
  localNotice(isNetworkError(e) ? "NETWORK" : "INVALID", e instanceof Error ? e.message : String(e));

/** 아래층이 prev → next 로 바뀌며 표·컬럼이 바뀌었나. d 와 drain 이 함께 얹은 보관 델타(d.rev 뒤 ~ next rev)를 본다. */
function columnsChanged(prev: Layers, next: Layers, d: ErdDelta): boolean {
  if (next.server === prev.server) return false;
  if (touchesColumns(d)) return true;
  return prev.held.some((h) => h.rev > d.rev && h.rev <= next.server.rev && touchesColumns(h));
}

/** rev 하나를 넣는다 — 겹치지 않게, 오래된 순으로, 최근 MY_REVS_MAX 개만. */
const withRev = (revs: readonly number[], rev: number): readonly number[] =>
  [...new Set([...revs, rev])].sort((a, b) => a - b).slice(-MY_REVS_MAX);

/** exclusive 결과에서 따라잡을 rev(S2-29). 숫자 rev 가 없으면 null. */
function revOf(r: unknown): number | null {
  if (r === null || typeof r !== "object") return null;
  const rev = (r as { rev?: unknown }).rev;
  return typeof rev === "number" ? rev : null;
}

/** exclusive 가 기다리는 rev. commit 이 아래층 rev 가 닿으면(또는 모델이 바뀌면) done 을 부른다. */
interface RevWaiter { rev: number; modelId: string; done(): void }

export function useErdModel(
  modelId: string | null, session: string, me: string | null, load: (modelId: string) => Promise<ErdModelView> = viewModel,
): ErdModelApi {
  const [layers, setLayers] = useState<Layers | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [columnsSeq, setColumnsSeq] = useState(0);
  const [myRevs, setMyRevs] = useState<readonly number[]>(NO_REVS);
  const layersRef = useRef<Layers | null>(null);
  const myRevsRef = useRef<readonly number[]>(NO_REVS);
  const genRef = useRef(0);
  /** 다시 읽는 중이면 배열(그동안 온 델타), 아니면 null. */
  const bufferRef = useRef<ErdDelta[] | null>(null);
  const lateRef = useRef<{ presence?: ErdPresence[]; claims?: ErdClaim[] }>({});
  const chainRef = useRef<Promise<unknown>>(Promise.resolve());
  const batchSeq = useRef(0);
  /** 마지막 다시 읽기가 버린 queued 묶음 id 와 그 수. 각 묶음이 알림을 내면 id 를 빼서 옛 수가 다음 묶음에 새지 않게 한다. */
  const droppedRef = useRef<{ ids: Set<number>; count: number }>({ ids: new Set(), count: 0 });
  const meRef = useRef({ userId: me ?? "", session });
  meRef.current = { userId: me ?? "", session };
  /** 지금 화면의 모델 id. 다른 모델의 늦은 델타를 버린다. */
  const modelIdRef = useRef(modelId);
  modelIdRef.current = modelId;
  /** 모델을 바꾸거나 reload({dropMine:true}) 하면 1 오른다. 그 앞에 줄에 넣은 묶음은 보내지 않고, 응답은 얹지 않는다. */
  const epochRef = useRef(0);
  const waiterRef = useRef<RevWaiter | null>(null);

  const commit = useCallback((next: Layers | null) => {
    layersRef.current = next;
    setLayers(next);
    const w = waiterRef.current;
    if (w && (!next || next.server.modelId !== w.modelId || next.server.rev >= w.rev)) w.done();
  }, []);
  const setRevs = useCallback((next: readonly number[]) => {
    myRevsRef.current = next;
    setMyRevs(next);
  }, []);
  /** 세대를 올린다. exclusive 가 옛 세대의 rev 를 기다리고 있으면 놓는다. */
  const bumpEpoch = useCallback(() => {
    epochRef.current++;
    waiterRef.current?.done();
  }, []);

  const reload = useCallback(async (opts?: { dropMine?: boolean }) => {
    if (opts?.dropMine) {
      bumpEpoch();
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
      const prev = layersRef.current;
      const late = lateRef.current;
      let server: ErdState = {
        ...fromView(view),
        presence: late.presence ?? view.presence,
        claims: late.claims ?? (prev?.server.modelId === modelId ? prev.server.claims : []),
      };
      for (const d of bufferRef.current ?? []) {
        if (d.modelId !== modelId) continue;
        const out = applyDelta(server, d);
        if (out.kind === "applied") server = out.state;
        else if (out.kind === "gap") break; // 다음 live 델타가 다시 gap 을 알려 한 번 더 읽는다
      }
      bufferRef.current = null;
      lateRef.current = {};
      if (prev && prev.server.modelId === modelId) {
        const back = onReloaded(prev, server);
        droppedRef.current = { ids: new Set(prev.pending.filter((b) => b.state === "queued").map((b) => b.id)), count: back.dropped };
        commit(back.layers);
      } else {
        commit(initLayers(server));
      }
      setError(null);
      setColumnsSeq((s) => s + 1);
    } catch (e) {
      if (gen !== genRef.current) return;
      bufferRef.current = null;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (gen === genRef.current) setLoading(false);
    }
  }, [modelId, load, commit, setRevs, bumpEpoch]);
  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  useEffect(() => {
    if (layersRef.current && layersRef.current.server.modelId !== modelId) {
      bumpEpoch();
      commit(null);
      setRevs(NO_REVS);
    }
    void reload();
  }, [reload, commit, setRevs, bumpEpoch, modelId]);

  const applyDeltaCb = useCallback((d: ErdDelta) => {
    if (d.modelId !== modelIdRef.current) return;
    if (bufferRef.current) {
      bufferRef.current.push(d);
      return;
    }
    const l = layersRef.current;
    if (!l || l.server.modelId !== d.modelId) return;
    const out = onStream(l, d, Date.now(), meRef.current);
    if (out.reload) {
      void reload();
      return;
    }
    if (out.layers === l) return;
    commit(out.layers);
    // SSE 가 틈을 채워 보관 델타까지 얹었으면 그 델타도 본다.
    if (columnsChanged(l, out.layers, d)) setColumnsSeq((s) => s + 1);
  }, [reload, commit]);

  const setPresence = useCallback((list: ErdPresence[]) => {
    if (bufferRef.current) lateRef.current.presence = list;
    const l = layersRef.current;
    if (!l || sameJson(l.server.presence, list)) return;
    commit({ ...l, server: { ...l.server, presence: list } });
  }, [commit]);

  const setClaims = useCallback((list: ErdClaim[]) => {
    if (bufferRef.current) lateRef.current.claims = list;
    const l = layersRef.current;
    if (!l || sameJson(l.server.claims, list)) return;
    commit({ ...l, server: { ...l.server, claims: list } });
  }, [commit]);

  const onVersion = useCallback((ev: ErdVersionEvent) => {
    const l = layersRef.current;
    if (!l || l.server.modelId !== ev.modelId) return;
    if (ev.ver !== l.server.ver) {
      void reload();
      return;
    }
    const server = withVersion(l.server, ev);
    if (server !== l.server) commit({ ...l, server });
  }, [reload, commit]);

  /** 쓰기 줄 — 앞 일이 끝난 뒤 돈다. 앞 일이 실패해도 다음 일은 돈다. */
  const chain = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    const run = chainRef.current.then(fn, fn);
    chainRef.current = run.catch(() => undefined);
    return run;
  }, []);

  /** 아래층 rev 가 rev 에 닿을 때까지 기다린다(S2-29). HOLD_LIMIT_MS 를 넘으면 다시 읽은 뒤 끝난다. */
  const waitForRev = useCallback((rev: number): Promise<void> => {
    const l = layersRef.current;
    if (!l || l.server.rev >= rev) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const w: RevWaiter = {
        rev, modelId: l.server.modelId,
        done: () => {
          clearTimeout(timer);
          if (waiterRef.current === w) waiterRef.current = null;
          resolve();
        },
      };
      const timer = setTimeout(() => {
        if (waiterRef.current === w) waiterRef.current = null;
        void reloadRef.current().finally(resolve);
      }, HOLD_LIMIT_MS);
      waiterRef.current = w;
    });
  }, []);
  // 화면을 닫으면 세대를 올린 뒤 기다리던 줄을 놓는다(타이머가 닫힌 화면을 다시 읽지 않게).
  // 세대를 먼저 올리므로 줄에 남은 묶음은 보내지 않고 notSent 로 끝나며, 날아오던 응답도 얹지 않는다.
  useEffect(() => () => bumpEpoch(), [bumpEpoch]);

  const exclusive = useCallback(<T,>(fn: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      void chain(async () => {
        let r: T;
        try {
          r = await fn();
        } catch (e) {
          reject(e);
          return;
        }
        resolve(r);
        const rev = revOf(r);
        if (rev !== null) await waitForRev(rev);
      });
    }), [chain, waitForRev]);

  const submit = useCallback((label: string, commands: ErdCommandJson[], undoOf?: number): Promise<ApplyOutcome> => {
    const l = layersRef.current;
    if (!l) return Promise.resolve<ApplyOutcome>({ ok: false, notice: localNotice("RELOAD", "모델을 아직 읽지 않았습니다.", "모델을 읽은 뒤 다시 하세요.") });
    // 되돌리기는 그 rev 를 먼저 꺼낸다 — 응답 전에 Ctrl+Z 를 또 눌러도 같은 rev 를 고르지 않는다.
    const wasMine = undoOf !== undefined && myRevsRef.current.includes(undoOf);
    if (wasMine) setRevs(myRevsRef.current.filter((x) => x !== undoOf));
    // 줄에 넣을 때의 모델·세대. 앞 묶음을 기다리는 사이 모델이 바뀌면 다른 모델로 보내지 않는다.
    const queuedModel = l.server.modelId;
    const queuedEpoch = epochRef.current;
    const id = ++batchSeq.current;
    commit(enqueue(l, { id, label, baseRev: l.server.rev, commands, undoOf }));

    const drop = () => {
      const cur = layersRef.current;
      const next = cur ? dropBatch(cur, id) : null;
      if (cur && next !== cur) commit(next);
    };
    /** 요청이 서버에 닿지 않았다. 묶음을 빼고, 되돌리기면 꺼낸 rev 를 다시 넣는다(같은 세대일 때만). */
    const notSent = (notice: ErdNotice): ApplyOutcome => {
      drop();
      if (wasMine && undoOf !== undefined && epochRef.current === queuedEpoch) setRevs(withRev(myRevsRef.current, undoOf));
      return { ok: false, notice };
    };

    return chain(async (): Promise<ApplyOutcome> => {
      const now = layersRef.current;
      if (!now || now.server.modelId !== queuedModel || epochRef.current !== queuedEpoch) {
        return notSent(localNotice("RELOAD", "모델이 바뀌어 보내지 않았습니다.", "바뀐 모델을 보고 다시 고치세요."));
      }
      if (bufferRef.current) return notSent(localNotice("RELOAD", "모델을 다시 읽는 중이라 보내지 않았습니다.", "모델을 읽은 뒤 다시 하세요."));
      const started = markSending(now, id);
      if (!started) {
        // 다시 읽기가 버린 묶음이면 그때 버린 수를 알리고 id 를 뺀다. 아니면 1건으로 알린다.
        const dropped = droppedRef.current;
        const count = dropped.ids.delete(id) ? dropped.count : 1;
        return notSent(localNotice("RELOAD", `모델을 다시 읽어 보내지 않은 변경 ${Math.max(count, 1)}건을 버렸습니다.`,
          "바뀐 모델을 보고 다시 고치세요."));
      }
      commit(started.layers);
      const b = started.batch;
      let r: ErdApplyResult;
      try {
        r = b.undoOf !== undefined ? await undoRev(queuedModel, b.undoOf, session) : await applyCommands(queuedModel, b.baseRev, session, b.commands);
      } catch (e) {
        if (isNetworkError(e)) return notSent(errorNotice(e));
        // 5xx·시간 초과는 서버가 반영했을 수 있다 — 묶음만 빼고 되돌릴 rev 는 다시 넣지 않는다(결과는 SSE·다시 읽기가 맞춘다).
        drop();
        return { ok: false, notice: errorNotice(e) };
      }
      const cur = layersRef.current;
      // 응답을 기다리는 사이 모델을 바꿨거나 reload({dropMine:true}) 했으면 얹지 않고 myRevs 에도 넣지 않는다(다시 읽은 모델·SSE 가 맞춘다).
      if (!cur || epochRef.current !== queuedEpoch) {
        drop();
        return r.applied ? { ok: true, rev: r.rev, warnings: r.warnings } : { ok: false, notice: noticeFromRejection(r.rejection, b.commands) };
      }
      const out = onResult(cur, id, r, meRef.current, Date.now());
      commit(out.layers);
      if (out.mine !== null) setRevs(withRev(myRevsRef.current, out.mine));
      if (columnsChanged(cur, out.layers, resultDelta(r, queuedModel, meRef.current))) setColumnsSeq((s) => s + 1);
      if (out.reload) void reload();
      if (r.applied) return { ok: true, rev: r.rev, warnings: r.warnings };
      return { ok: false, notice: out.notice ?? noticeFromRejection(r.rejection, b.commands) };
    });
  }, [commit, chain, session, setRevs, reload]);

  const apply = useCallback((commands: ErdCommandJson[], label: string) => submit(label, commands), [submit]);
  /** 되돌리기. 같은 줄로 보낸다(undoOf). 그 rev 는 먼저 myRevs 에서 꺼낸다(CONFLICT 여도 다시 넣지 않는다). */
  const undo = useCallback((rev: number) => submit(`rev ${rev} 되돌리기`, [], rev), [submit]);

  // 보관 델타가 있을 때만 1초마다 5초 초과를 본다.
  const hasHeld = layers?.pending.some((b) => b.state === "held") ?? false;
  useEffect(() => {
    if (!hasHeld) return;
    const t = setInterval(() => {
      // 다시 읽는 중이면 그 읽기가 끝날 때까지 새로 읽지 않는다(읽기가 1초를 넘으면 끝없이 다시 읽게 된다).
      if (bufferRef.current) return;
      const l = layersRef.current;
      if (l && onTick(l, Date.now()).reload) void reload();
    }, TICK_MS);
    return () => clearInterval(t);
  }, [hasHeld, reload]);

  const server = layers?.server ?? null;
  const pending = layers?.pending ?? NO_PENDING;
  const state = useMemo(() => (server ? project(server, pending) : null), [server, pending]);
  const ids = useMemo(() => pendingIds(pending), [pending]);

  return useMemo(
    () => ({
      state, server, pending, pendingIds: ids, myRevs, loading, error, columnsSeq, reload,
      applyDelta: applyDeltaCb, setPresence, setClaims, onVersion, apply, undo, exclusive,
    }),
    [state, server, pending, ids, myRevs, loading, error, columnsSeq, reload, applyDeltaCb, setPresence, setClaims, onVersion, apply, undo, exclusive],
  );
}
