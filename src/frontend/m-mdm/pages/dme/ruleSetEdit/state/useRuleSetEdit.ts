"use client";

/**
 * 룰 세트 편집 상태(TSK-08-06 design §2.3·§6.9) — 불러온 view, 편집 중 목록(`ids`)·룰 입출력 맵(`rules`, 불러온 IO + 룰 추가·지침으로 받은 IO)·
 * 세트명·설명, dirty, 쓰기(save·delete·restore)를 한 곳에 둔다.
 *
 * 목록 편집(▲▼✕·드래그·룰 추가·지침 적용)은 이 상태만 바꾸고 서버를 부르지 않는다. 세트 계산은 화면이 `set-model.ts` 로 다시 한다(I21).
 * 쓰기가 성공하면 view 를 다시 불러 row_version 을 서버 값으로 맞추고 결과 문구를 남긴다. 거부는 편집 중 목록을 그대로 두고 서버 문구를 보이며,
 * MDM001 이면 충돌 안내와 다시 불러오기를 준다.
 */
import { useCallback, useRef, useState } from "react";

import { isRowVersionConflict } from "@/dme/oasis-call";

import { deprecateSet, restoreSet, saveSet, viewSet } from "../api";
import type { RuleIo, RuleSetCheck, RuleSetView } from "../types";

export const CONFLICT_MESSAGE = "다른 창에서 바뀌었습니다. 다시 불러오세요";
const DIRTY_CONFIRM = "저장하지 않은 변경이 있습니다. 버리고 이동할까요?";

/** 세트 카드 메시지 줄(`set-message`) — 결과 문구와 그에 딸린 경고 문장. */
export interface RuleSetMessage {
  kind: "info" | "error";
  text: string;
  lines?: string[];
}

export interface RuleSetEditState {
  view: RuleSetView | null;
  ids: string[];
  rules: Record<string, RuleIo>;
  setName: string;
  description: string;
  dirty: boolean;
  loading: boolean;
  conflict: boolean;
  message: RuleSetMessage | null;
  error: string | null;
  /** 세트를 연다. 저장 안 한 변경이 있으면 확인을 받는다. */
  open: (setId: string) => Promise<void>;
  /** 지금 세트를 서버 값으로 다시 불러온다(편집 버림). */
  reload: () => Promise<void>;
  setSetName: (v: string) => void;
  setDescription: (v: string) => void;
  moveUp: (id: string) => void;
  moveDown: (id: string) => void;
  remove: (id: string) => void;
  /** 드래그로 바뀐 순서(행 키 목록). */
  reorder: (keys: readonly (string | number)[]) => void;
  /** 목록 끝에 더한다. 이미 담은 룰이면 false. */
  addRule: (io: RuleIo) => boolean;
  /** 구성 지침의 제안 순서로 목록을 바꾸고 받은 IO 를 맵에 더한다. */
  applyGuide: (order: readonly string[], ios: readonly RuleIo[]) => void;
  save: () => Promise<void>;
  deprecate: () => Promise<void>;
  restore: () => Promise<void>;
  /** 쓰기 밖(찾기 등) 오류를 오류 창으로 보인다. */
  reportError: (e: unknown) => void;
  clearError: () => void;
}

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const warnLines = (checks: RuleSetCheck[] | null | undefined) => (checks ?? []).map((c) => c.message);

function toMap(ios: readonly RuleIo[] | null | undefined, base: Record<string, RuleIo> = {}): Record<string, RuleIo> {
  const out = { ...base };
  for (const r of ios ?? []) out[r.ruleId] = r;
  return out;
}

function swap(list: readonly string[], i: number, j: number): string[] {
  if (i < 0 || j < 0 || i >= list.length || j >= list.length) return [...list];
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export function useRuleSetEdit(): RuleSetEditState {
  const [view, setView] = useState<RuleSetView | null>(null);
  const [ids, setIds] = useState<string[]>([]);
  const [rules, setRules] = useState<Record<string, RuleIo>>({});
  const [setName, setSetName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [message, setMessage] = useState<RuleSetMessage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    !!view &&
    (!sameList(ids, view.set.ruleIds ?? []) || setName !== (view.set.setName ?? "") || description !== (view.set.description ?? ""));
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  const idsRef = useRef<string[]>([]);
  idsRef.current = ids;
  const setIdRef = useRef<string | null>(null);

  const load = useCallback(async (setId: string): Promise<boolean> => {
    setLoading(true);
    try {
      const next = await viewSet(setId);
      setIdRef.current = setId;
      setView(next);
      setIds([...(next.set.ruleIds ?? [])]);
      setRules(toMap(next.rules));
      setSetName(next.set.setName ?? "");
      setDescription(next.set.description ?? "");
      setConflict(false);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const confirmLeave = useCallback(() => {
    if (!dirtyRef.current) return true;
    return typeof window === "undefined" || window.confirm(DIRTY_CONFIRM);
  }, []);

  const open = useCallback(
    async (setId: string) => {
      if (!confirmLeave()) return;
      setMessage(null);
      await load(setId);
    },
    [confirmLeave, load],
  );

  const reload = useCallback(async () => {
    const id = setIdRef.current;
    if (!id) return;
    setMessage(null);
    await load(id);
  }, [load]);

  const fail = useCallback((e: unknown) => {
    if (isRowVersionConflict(e)) {
      setConflict(true);
      setMessage({ kind: "error", text: CONFLICT_MESSAGE });
      return;
    }
    setMessage({ kind: "error", text: e instanceof Error ? e.message : String(e) });
  }, []);

  const runWrite = useCallback(
    async <T>(fn: () => Promise<T>, done: (result: T) => RuleSetMessage) => {
      const id = setIdRef.current;
      if (!id) return;
      setLoading(true);
      let result: T;
      try {
        result = await fn();
      } catch (e) {
        fail(e);
        setLoading(false);
        return;
      }
      setLoading(false);
      await load(id);
      setMessage(done(result));
    },
    [fail, load],
  );

  const moveUp = useCallback((id: string) => setIds((prev) => swap(prev, prev.indexOf(id), prev.indexOf(id) - 1)), []);
  const moveDown = useCallback((id: string) => setIds((prev) => swap(prev, prev.indexOf(id), prev.indexOf(id) + 1)), []);
  const remove = useCallback((id: string) => setIds((prev) => prev.filter((x) => x !== id)), []);
  const reorder = useCallback((keys: readonly (string | number)[]) => setIds(keys.map(String)), []);

  const addRule = useCallback((io: RuleIo) => {
    if (idsRef.current.includes(io.ruleId)) return false;
    setRules((prev) => ({ ...prev, [io.ruleId]: io }));
    setIds((prev) => (prev.includes(io.ruleId) ? prev : [...prev, io.ruleId]));
    return true;
  }, []);

  const applyGuide = useCallback((order: readonly string[], ios: readonly RuleIo[]) => {
    setRules((prev) => toMap(ios, prev));
    setIds([...order]);
  }, []);

  const save = useCallback(async () => {
    if (!view || view.set.branched) return;
    await runWrite(
      () => saveSet(view.set.setId, setName, description, view.set.rowVersion, ids),
      (r) => ({ kind: "info", text: `저장 · row_version ${r.rowVersion}`, lines: warnLines(r.checks) }),
    );
  }, [view, setName, description, ids, runWrite]);

  const deprecate = useCallback(async () => {
    if (!view) return;
    await runWrite(
      () => deprecateSet(view.set.setId, view.set.rowVersion),
      (r) => ({ kind: "info", text: `폐기 · row_version ${r.rowVersion}. 행은 남기고 되살릴 수 있다` }),
    );
  }, [view, runWrite]);

  const restore = useCallback(async () => {
    if (!view) return;
    await runWrite(
      () => restoreSet(view.set.setId, view.set.rowVersion),
      (r) => ({ kind: "info", text: `되살림 · row_version ${r.rowVersion}`, lines: warnLines(r.checks) }),
    );
  }, [view, runWrite]);

  return {
    view,
    ids,
    rules,
    setName,
    description,
    dirty,
    loading,
    conflict,
    message,
    error,
    open,
    reload,
    setSetName,
    setDescription,
    moveUp,
    moveDown,
    remove,
    reorder,
    addRule,
    applyGuide,
    save,
    deprecate,
    restore,
    reportError: (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    clearError: () => setError(null),
  };
}
