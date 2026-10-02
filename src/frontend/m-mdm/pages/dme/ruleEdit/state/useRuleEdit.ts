"use client";

/**
 * 룰 화면 상태(TSK-08-02 design §2.1-FE) — view 로드·선택 버전·새로 고침·쓰기 뒤 다시 불러오기·오류 처리를 한 곳에 둔다.
 *
 * 쓰기(save·delete·copy·lock·unlock·handover)는 `runWrite` 로만 한다. 성공하면 view 를 다시 불러 row_version 을 서버 값으로 맞추고,
 * 실패가 MDM001(row_version 충돌)이면 "다른 창에서 바뀌었습니다" 와 다시 불러오기를 준다(§6.2).
 */
import { useCallback, useRef, useState } from "react";

import { isRowVersionConflict } from "@/dme/oasis-call";

import { viewRule } from "../api";
import type { RuleEditNotice, RuleEditView } from "../types";

export const CONFLICT_MESSAGE = "다른 창에서 바뀌었습니다. 다시 불러오세요";
const DIRTY_CONFIRM = "저장하지 않은 변경이 있습니다. 버리고 이동할까요?";

/** 쓰기 뒤 다시 불러올 버전 — undefined 면 지금 선택한 버전, null 이면 서버 기본 고르기. */
export type NextVer = string | null | undefined;

export interface RuleEditState {
  ruleId: string | null;
  view: RuleEditView | null;
  loading: boolean;
  error: string | null;
  conflict: boolean;
  notice: RuleEditNotice | null;
  /** 룰(과 버전)을 연다. 저장 안 한 변경이 있으면 확인을 받는다. */
  open: (ruleId: string, ver?: string | null) => Promise<void>;
  selectVer: (ver: string) => Promise<void>;
  reload: (ver?: NextVer) => Promise<void>;
  runWrite: <T>(fn: () => Promise<T>, next?: (result: T) => NextVer) => Promise<T | undefined>;
  notify: (notice: RuleEditNotice | null) => void;
  setDirty: (cardId: string, dirty: boolean) => void;
  clearError: () => void;
}

export function useRuleEdit(): RuleEditState {
  const [ruleId, setRuleId] = useState<string | null>(null);
  const [view, setView] = useState<RuleEditView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [notice, setNotice] = useState<RuleEditNotice | null>(null);
  const dirtyCards = useRef(new Set<string>());
  const ruleIdRef = useRef<string | null>(null);
  const viewRef = useRef<RuleEditView | null>(null);

  const fail = useCallback((e: unknown) => {
    if (isRowVersionConflict(e)) {
      setConflict(true);
      setError(CONFLICT_MESSAGE);
      return;
    }
    setError(e instanceof Error ? e.message : String(e));
  }, []);

  const load = useCallback(
    async (id: string, ver?: string | null) => {
      setLoading(true);
      try {
        const next = await viewRule(id, ver);
        ruleIdRef.current = id;
        viewRef.current = next;
        dirtyCards.current.clear();
        setRuleId(id);
        setView(next);
        setConflict(false);
      } catch (e) {
        fail(e);
      } finally {
        setLoading(false);
      }
    },
    [fail],
  );

  const confirmLeave = useCallback(() => {
    if (dirtyCards.current.size === 0) return true;
    return typeof window === "undefined" || window.confirm(DIRTY_CONFIRM);
  }, []);

  const open = useCallback(
    async (id: string, ver?: string | null) => {
      if (!confirmLeave()) return;
      setNotice(null);
      await load(id, ver);
    },
    [confirmLeave, load],
  );

  const selectVer = useCallback(
    async (ver: string) => {
      const id = ruleIdRef.current;
      if (!id || !confirmLeave()) return;
      await load(id, ver);
    },
    [confirmLeave, load],
  );

  const reload = useCallback(
    async (ver?: NextVer) => {
      const id = ruleIdRef.current;
      if (!id) return;
      const target = ver === undefined ? (viewRef.current?.selectedVer ?? null) : ver;
      await load(id, target);
    },
    [load],
  );

  const runWrite = useCallback(
    async <T,>(fn: () => Promise<T>, next?: (result: T) => NextVer): Promise<T | undefined> => {
      setLoading(true);
      let result: T;
      try {
        result = await fn();
      } catch (e) {
        fail(e);
        setLoading(false);
        return undefined;
      }
      setLoading(false);
      await reload(next ? next(result) : undefined);
      return result;
    },
    [fail, reload],
  );

  const setDirty = useCallback((cardId: string, dirty: boolean) => {
    if (dirty) dirtyCards.current.add(cardId);
    else dirtyCards.current.delete(cardId);
  }, []);

  return {
    ruleId,
    view,
    loading,
    error,
    conflict,
    notice,
    open,
    selectVer,
    reload,
    runWrite,
    notify: setNotice,
    setDirty,
    clearError: () => setError(null),
  };
}
