"use client";

/**
 * commPermBench 초안(2단계 f3) — 화면 초안(변경 목록)과 서버 초안(관리자마다 하나)을 맞춘다.
 *
 * - 들어올 때 loadDraft 로 서버 초안을 읽는다(CHANGES_JSON camelCase → fromDraftChange). 깨졌으면(PERM_DRAFT_CORRUPT·JSON 오류)
 *   status = "corrupt" — 편집을 막고 「초안 버리기」를 권한다. 읽기 실패면 "failed"(다시 읽기 전까지 편집을 막는다 — 서버 초안을 덮지 않게).
 * - 편집하면 잠깐(SAVE_DELAY_MS) 뒤 목록 전부를 saveDraft 로 보낸다(시안에 저장 단추가 없다). 저장은 한 번에 하나만 하고,
 *   저장 중 바뀐 것은 끝난 뒤 이어서 저장한다. 저장이 끝나면 onSaved(DRAFT 자료 다시 읽기)와 impact 를 부른다.
 * - 적용(apply)·영향은 서버에 저장한 초안으로 계산하므로, 부르기 전에 남은 저장을 먼저 끝낸다(flush).
 * - 저장·버리기·화면 닫을 때 저장은 모두 한 줄(chain)로 돈다 — 같은 관리자의 saveDraft·discardDraft 가 겹치지 않는다(f3 리뷰 1·2).
 *   버리는 동안에는 편집을 받지 않는다(discarding).
 * - 저장·적용·영향이 PERM_DRAFT_CORRUPT(초안 범위가 기준 지문에 없음 포함)로 실패하면 status = "corrupt" — 「초안 버리기」로 이끈다.
 * 실패 글은 onError 로 알린다(화면이 메시지로 보인다). 자동 저장이 앞과 같은 오류로 다시 실패하면 막대 글만 두고 다시 알리지 않는다(f3 리뷰 7).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PermApplyError, type ApplyResult, type DraftResult, type ImpactResult, type PermBenchApi, type YN } from "./types";
import { EMPTY_DRAFT, draftRows, draftSig, parseChangesJson, type DraftMap } from "./draft";

/** 마지막 편집 뒤 저장까지 기다리는 시간(ms). */
export const SAVE_DELAY_MS = 600;
/** 화면을 닫을 때 저장이 잠금 충돌(PERM_DRAFT_BUSY·PERM_BUSY)이면 다시 보내기까지 기다리는 시간(ms)·횟수. */
export const BUSY_RETRY_MS = 800;
const UNMOUNT_BUSY_RETRIES = 2;

export type DraftStatus = "loading" | "ready" | "corrupt" | "failed";

/** 적용 전 저장 실패 — 저장 실패는 이미 onError 로 알렸다(화면은 다시 알리지 않는다, f3 리뷰 6). original = 저장 실패 원래 오류. */
export class DraftSaveError extends Error {
  readonly reported = true;
  readonly original: unknown;

  constructor(original: unknown) {
    super(original instanceof Error ? original.message : "초안을 저장하지 못해 적용하지 않았습니다.");
    this.name = "DraftSaveError";
    this.original = original;
  }
}

export interface BenchDraft {
  status: DraftStatus;
  /** 화면 초안(저장 전 편집 포함). */
  draft: DraftMap;
  /** 서버에 저장한 초안의 줄 수·시각. */
  savedCount: number;
  savedAt: string | null;
  /** 화면 초안이 서버 초안과 다르다(저장 대기·저장 중). */
  dirty: boolean;
  saving: boolean;
  /** 초안을 버리는 중(편집을 받지 않는다). */
  discarding: boolean;
  /** 마지막 저장 실패(다음 저장에 성공하면 지운다). */
  saveError: string | null;
  impact: ImpactResult | null;
  impactLoading: boolean;
  /** 화면 초안을 바꾼다(ready 이고 버리는 중이 아닐 때만). 저장 실패 글을 지워 자동 저장을 다시 건다. */
  mutate: (fn: (d: DraftMap) => DraftMap) => void;
  /** 현재 값을 다시 읽은 뒤 초안을 맞춘다(mutate 와 같지만 저장 실패 글은 그대로 둔다). */
  rebase: (fn: (d: DraftMap) => DraftMap) => void;
  /** 남은 저장을 지금 끝낸다. 저장에 실패하면 false. */
  flush: () => Promise<boolean>;
  /** 남은 저장 뒤에 서버 초안을 버린다. 버렸으면 true(실패는 onError 로 알리고 false). */
  discard: () => Promise<boolean>;
  /** 남은 저장을 끝낸 뒤 적용한다. 실패는 그대로 던진다(PermApplyError · 저장 실패는 DraftSaveError). */
  apply: (memo: string, confirmLoss: YN) => Promise<ApplyResult>;
  /** 서버 초안을 다시 읽는다(읽기 실패 뒤). */
  reloadDraft: () => void;
}

export interface BenchDraftOptions {
  /** 편집을 받을지(2단계부터). false 면 서버 초안도 읽지 않는다. */
  enabled: boolean;
  onSaved?: () => void;
  onError?: (e: unknown) => void;
}

const errText = (e: unknown) => (e instanceof Error ? e.message : "요청을 처리하지 못했습니다.");
const errKey = (e: unknown) => `${e instanceof PermApplyError ? e.code : ""}|${errText(e)}`;
const isCode = (e: unknown, ...codes: string[]) => e instanceof PermApplyError && codes.includes(e.code);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface SaveOptions {
  /** 앞과 같은 오류면 onError 를 부르지 않는다(자동 저장). */
  quietRepeat?: boolean;
  /** 잠금 충돌이면 다시 보낼 횟수(화면 닫을 때). */
  busyRetries?: number;
}

export function useBenchDraft(api: PermBenchApi, { enabled, onSaved, onError }: BenchDraftOptions): BenchDraft {
  const [status, setStatus] = useState<DraftStatus>(enabled ? "loading" : "ready");
  const [draft, setDraft] = useState<DraftMap>(EMPTY_DRAFT);
  const [savedSig, setSavedSig] = useState(() => draftSig(EMPTY_DRAFT));
  const [saved, setSaved] = useState<{ count: number; at: string | null }>({ count: 0, at: null });
  const [saving, setSaving] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [impact, setImpact] = useState<ImpactResult | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [loadNo, setLoadNo] = useState(0);

  // 비동기 처리기가 최신 값을 읽도록 커밋 뒤 맞춘다
  const draftRef = useRef(draft);
  const savedSigRef = useRef(savedSig);
  const statusRef = useRef(status);
  const cb = useRef({ onSaved, onError });
  useEffect(() => {
    draftRef.current = draft;
    statusRef.current = status;
    cb.current = { onSaved, onError };
  }, [draft, status, onSaved, onError]);

  const chain = useRef<Promise<boolean>>(Promise.resolve(true));
  const impactSeq = useRef(0);
  const discardingRef = useRef(false);
  /** 마지막 저장 실패(원래 오류)와 그 서명 — 성공하면 지운다. */
  const lastSaveErr = useRef<unknown>(null);
  const lastErrKey = useRef<string | null>(null);

  /** 서버가 초안을 깨진 것으로 본다 — 편집을 막고 「초안 버리기」로 이끈다. */
  const markCorrupt = useCallback(() => {
    statusRef.current = "corrupt";
    setStatus("corrupt");
  }, []);

  const refreshImpact = useCallback(
    (count: number) => {
      const seq = ++impactSeq.current;
      if (!count) {
        setImpact(null);
        setImpactLoading(false);
        return;
      }
      setImpactLoading(true);
      api.impact().then(
        (r) => {
          if (seq !== impactSeq.current) return;
          setImpact(r);
          setImpactLoading(false);
        },
        (e: unknown) => {
          if (seq !== impactSeq.current) return;
          setImpactLoading(false);
          if (isCode(e, "PERM_DRAFT_CORRUPT")) markCorrupt();
          cb.current.onError?.(e);
        },
      );
    },
    [api, markCorrupt],
  );

  /** 서버 초안 읽기. 응답 때만 상태를 바꾼다. */
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    api.loadDraft().then(
      (res) => {
        if (!alive) return;
        const row = res.draft[0];
        let d: DraftMap;
        try {
          d = parseChangesJson(row?.CHANGES_JSON);
        } catch {
          setStatus("corrupt");
          return;
        }
        const sig = draftSig(d);
        savedSigRef.current = sig;
        setSavedSig(sig);
        setDraft(d);
        setSaved({ count: d.size, at: row?.U_AT ?? null });
        setStatus("ready");
        refreshImpact(d.size);
      },
      (e: unknown) => {
        if (!alive) return;
        if (e instanceof PermApplyError && e.code === "PERM_DRAFT_CORRUPT") setStatus("corrupt");
        else {
          setStatus("failed");
          setSaveError(errText(e));
          cb.current.onError?.(e);
        }
      },
    );
    return () => {
      alive = false;
    };
  }, [api, enabled, loadNo, refreshImpact]);

  /** 화면 초안이 서버와 다르면 저장한다. 앞 저장·버리기가 끝난 뒤에 돈다(한 번에 하나). */
  const runSave = useCallback(
    ({ quietRepeat = false, busyRetries = 0 }: SaveOptions = {}): Promise<boolean> => {
      const p = chain.current.then(async () => {
        const d = draftRef.current;
        const sig = draftSig(d);
        if (sig === savedSigRef.current) return true;
        setSaving(true);
        try {
          const req = { grids: { changes: { rows: draftRows(d) } } };
          let res: DraftResult;
          for (let i = 0; ; i++) {
            try {
              res = await api.saveDraft(req);
              break;
            } catch (e) {
              if (i < busyRetries && isCode(e, "PERM_DRAFT_BUSY", "PERM_BUSY")) await sleep(BUSY_RETRY_MS);
              else throw e;
            }
          }
          const row = res.draft[0];
          savedSigRef.current = sig;
          lastSaveErr.current = null;
          lastErrKey.current = null;
          setSavedSig(sig);
          setSaved({ count: row?.CHANGE_CNT ?? d.size, at: row?.U_AT ?? null });
          setSaveError(null);
          cb.current.onSaved?.();
          refreshImpact(row?.CHANGE_CNT ?? d.size);
          return true;
        } catch (e) {
          const key = errKey(e);
          const repeat = key === lastErrKey.current;
          lastSaveErr.current = e;
          lastErrKey.current = key;
          setSaveError(errText(e));
          if (isCode(e, "PERM_DRAFT_CORRUPT")) markCorrupt();
          if (!(quietRepeat && repeat)) cb.current.onError?.(e);
          return false;
        } finally {
          setSaving(false);
        }
      });
      chain.current = p;
      return p;
    },
    [api, refreshImpact, markCorrupt],
  );

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sig = useMemo(() => draftSig(draft), [draft]);
  const dirty = status === "ready" && sig !== savedSig;

  // 편집 뒤 잠깐 기다렸다 저장한다. 저장에 실패한 내용은 다음 편집·「다시 저장」(flush) 때 다시 보낸다
  useEffect(() => {
    if (!dirty || saveError || discarding) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      void runSave({ quietRepeat: true });
    }, SAVE_DELAY_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [dirty, sig, saveError, discarding, runSave]);

  // 화면을 닫을 때 저장 대기 중인 편집이 있으면 기다리지 않고 보낸다(마지막 편집 뒤 SAVE_DELAY_MS 안에 닫아도 잃지 않게).
  // 저장 줄(chain)을 거쳐 앞 저장이 끝난 뒤 보낸다 — 같은 관리자의 저장이 겹쳐 잠금 충돌·순서 뒤집힘이 나지 않게(f3 리뷰 1).
  // 그래도 다른 창의 저장과 겹쳐 잠금 충돌이면 잠깐 뒤 다시 보낸다. 언마운트 뒤 setState 는 아무 일도 하지 않는다.
  useEffect(
    () => () => {
      if (statusRef.current !== "ready" || discardingRef.current) return;
      void runSave({ busyRetries: UNMOUNT_BUSY_RETRIES });
    },
    [runSave],
  );

  const mutate = useCallback((fn: (d: DraftMap) => DraftMap) => {
    if (statusRef.current !== "ready" || discardingRef.current) return;
    setDraft((prev) => fn(prev));
    setSaveError(null);
  }, []);

  const rebase = useCallback((fn: (d: DraftMap) => DraftMap) => {
    if (statusRef.current !== "ready" || discardingRef.current) return;
    setDraft((prev) => fn(prev));
  }, []);

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (statusRef.current !== "ready") return false;
    return runSave();
  }, [runSave]);

  const reset = useCallback(() => {
    const s = draftSig(EMPTY_DRAFT);
    draftRef.current = EMPTY_DRAFT;
    savedSigRef.current = s;
    lastSaveErr.current = null;
    lastErrKey.current = null;
    setDraft(EMPTY_DRAFT);
    setSavedSig(s);
    setSaved({ count: 0, at: null });
    setSaveError(null);
    refreshImpact(0);
  }, [refreshImpact]);

  // 버리기도 저장 줄(chain)에 넣는다 — 앞 저장이 끝난 뒤 버리고, 버리는 동안 편집·자동 저장을 받지 않는다(f3 리뷰 2)
  const discard = useCallback(async (): Promise<boolean> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (discardingRef.current) return false;
    discardingRef.current = true;
    setDiscarding(true);
    const p = chain.current.then(async () => {
      try {
        await api.discardDraft();
      } catch (e) {
        cb.current.onError?.(e);
        return false;
      }
      reset();
      statusRef.current = "ready";
      setStatus("ready");
      cb.current.onSaved?.();
      return true;
    });
    chain.current = p;
    const ok = await p;
    discardingRef.current = false;
    setDiscarding(false);
    return ok;
  }, [api, reset]);

  const apply = useCallback(
    async (memo: string, confirmLoss: YN) => {
      if (statusRef.current !== "ready") throw new Error("초안을 고칠 수 없는 상태라 적용하지 않았습니다.");
      const ok = await flush();
      // 저장 실패는 runSave 가 이미 알렸다 — 원래 오류를 담아 던져 화면이 다시 알리지 않게 한다(f3 리뷰 6)
      if (!ok) throw new DraftSaveError(lastSaveErr.current);
      try {
        const res = await api.apply({ memo, confirmLoss });
        reset();
        return res;
      } catch (e) {
        if (isCode(e, "PERM_DRAFT_CORRUPT")) markCorrupt();
        throw e;
      }
    },
    [api, flush, reset, markCorrupt],
  );

  const reloadDraft = useCallback(() => {
    setStatus("loading");
    setSaveError(null);
    setLoadNo((n) => n + 1);
  }, []);

  return useMemo(
    () => ({
      status, draft, savedCount: saved.count, savedAt: saved.at, dirty, saving, discarding, saveError, impact, impactLoading,
      mutate, rebase, flush, discard, apply, reloadDraft,
    }),
    [status, draft, saved, dirty, saving, discarding, saveError, impact, impactLoading, mutate, rebase, flush, discard, apply, reloadDraft],
  );
}
