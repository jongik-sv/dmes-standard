"use client";

/**
 * 세트 테스트 케이스 상태(3단계 계획 E6·P-D11·P-D19) — 케이스 목록·마지막 실행 결과·저장·삭제·[모두 실행].
 * page 수준에서 부른다(디버그 모드를 나갔다 와도 방금 저장한 케이스·마지막 결과가 남게).
 *
 * 목록의 정본은 이 훅 상태다. `initial`(view 응답의 `cases`)은 page 가 세트를 열거나 [다시 불러오기] 했을 때(`viewEpoch`·setId)만 새 참조로 넘기고,
 * 참조가 바뀌면 목록을 갈아 끼우고 결과를 비운다(F25). 세트 저장·폐기·되살리기 뒤의 자기 쓰기 다시 불러오기는 참조를 바꾸지 않으므로 그대로다.
 * 케이스 쓰기 뒤에는 `viewSet` 을 직접 불러 **`cases` 만** 받는다 — 세트 흐름·모드·dirty·이력·커서는 건드리지 않는다(P-D11, Review Focus 2).
 * 쓰기가 MDM001(row_version 충돌)이면 목록을 다시 읽고 `CONFLICT_MESSAGE` 를 둔다.
 * 마지막 결과는 화면 메모리에만 두고, 흐름 구조(`flowVersion`)가 바뀌거나 세트를 바꾸면 모두 "안 돌림" 으로 돌아간다(P-D19).
 * 늦게 온 응답은 요청 순번으로 버린다(목록 다시 읽기·모두 실행 따로, Local-Rules §11).
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { isRowVersionConflict } from "@/dme/oasis-call";

import { deleteCase, runCases, saveCase, viewSet } from "../api";
import { CONFLICT_MESSAGE } from "../state/useRuleSetEdit";
import { NO_DRAFTS, type CaseDraft, type CaseRunResult, type DraftVersions, type RuleSetCaseView, type RuleVersionMode } from "../types";

export interface TestCases {
  cases: RuleSetCaseView[];
  /** 케이스 ID → 마지막 실행 판정(안 돌렸으면 키 없음). */
  results: Record<number, CaseRunResult>;
  running: boolean;
  error: string | null;
  /** 저장(새 케이스·고치기). 성공하면 true. */
  save(d: CaseDraft): Promise<boolean>;
  remove(c: RuleSetCaseView): Promise<void>;
  /** 저장된 케이스를 지금 흐름(저장하지 않은 흐름 포함)으로 모두 돌린다. */
  runAll(): Promise<void>;
  /** 마지막 일괄 실행이 내 DRAFT 우선이었으면 그 모드·DRAFT 목록, 아니면 null. */
  draft: { ruleVersions: RuleVersionMode; draftVersions: DraftVersions } | null;
}

/** 빈 결과 — 참조가 렌더마다 바뀌지 않게 모듈 상수로 둔다. */
const NO_RESULTS: Record<number, CaseRunResult> = {};

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** 결과 맵에서 한 케이스를 뺀다(고친·지운 케이스의 옛 결과는 지금 케이스의 결과가 아니다). */
function without(results: Record<number, CaseRunResult>, caseId: number | null): Record<number, CaseRunResult> {
  if (caseId == null || !(caseId in results)) return results;
  const next = { ...results };
  delete next[caseId];
  return Object.keys(next).length === 0 ? NO_RESULTS : next;
}

/**
 * @param setId 지금 세트 ID(없으면 null)
 * @param initial view 응답의 `cases` — page 가 세트를 열거나 [다시 불러오기] 했을 때(`viewEpoch`·setId)만 새 참조로 넘긴다(F25)
 * @param flowVersion 흐름 구조 버전 — 바뀌면 마지막 결과를 지운다(P-D19)
 * @param flowJson 지금 흐름의 정규 JSON(저장하지 않은 흐름)
 * @param ruleVersions 지금 룰 버전 모드 — 실행 때 읽는다(spec 2026-10-06)
 */
export function useTestCases(
  setId: string | null,
  initial: RuleSetCaseView[],
  flowVersion: number,
  flowJson: () => string,
  ruleVersions: () => RuleVersionMode = () => "RELEASED",
): TestCases {
  const [cases, setCases] = useState<RuleSetCaseView[]>(initial);
  const [results, setResults] = useState<Record<number, CaseRunResult>>(NO_RESULTS);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<TestCases["draft"]>(null);

  const setIdRef = useRef(setId);
  setIdRef.current = setId;
  const flowJsonRef = useRef(flowJson);
  flowJsonRef.current = flowJson;
  const ruleVersionsRef = useRef(ruleVersions);
  ruleVersionsRef.current = ruleVersions;
  /** 목록 다시 읽기 순번 — 세트가 바뀌거나 initial 이 새로 오면 올려 떠난 응답을 버린다. */
  const listSeq = useRef(0);
  /** [모두 실행] 순번 — 세트·흐름 구조가 바뀌면 올려 떠난 응답을 버린다. */
  const runSeq = useRef(0);

  // initial 참조가 바뀌면(세트 열기·[다시 불러오기]) 목록을 갈아 끼우고 결과·오류를 비운다.
  const seenInitial = useRef(initial);
  useEffect(() => {
    if (seenInitial.current === initial) return;
    seenInitial.current = initial;
    listSeq.current += 1;
    runSeq.current += 1;
    setCases(initial);
    setResults(NO_RESULTS);
    setDraft(null);
    setRunning(false);
    setError(null);
  }, [initial]);

  // 세트·흐름 구조가 바뀌면 마지막 결과를 지운다(P-D19). 첫 렌더는 건너뛴다.
  const seenKey = useRef(`${setId ?? ""}\u0000${flowVersion}`);
  useEffect(() => {
    const k = `${setId ?? ""}\u0000${flowVersion}`;
    if (seenKey.current === k) return;
    seenKey.current = k;
    runSeq.current += 1;
    setResults(NO_RESULTS);
    setDraft(null);
    setRunning(false);
  }, [setId, flowVersion]);

  /** 목록만 다시 받는다 — 세트 상태(`useRuleSetEdit`)는 부르지 않는다(P-D11). */
  const refreshList = useCallback(async (forSet: string) => {
    const mine = ++listSeq.current;
    try {
      const v = await viewSet(forSet);
      if (mine !== listSeq.current || setIdRef.current !== forSet) return;
      setCases(v.cases ?? []);
    } catch (e) {
      if (mine !== listSeq.current || setIdRef.current !== forSet) return;
      setError(errorText(e));
    }
  }, []);

  /** 쓰기 한 번 — 성공하면 목록을 다시 받고 true, MDM001 이면 목록을 다시 받고 충돌 문구, 그 밖 실패는 문구만. */
  const write = useCallback(
    async (call: (forSet: string) => Promise<unknown>, touched: number | null): Promise<boolean> => {
      const forSet = setIdRef.current;
      if (!forSet) return false;
      setError(null);
      try {
        await call(forSet);
      } catch (e) {
        if (setIdRef.current !== forSet) return false;
        if (isRowVersionConflict(e)) {
          await refreshList(forSet);
          setError(CONFLICT_MESSAGE);
        } else {
          setError(errorText(e));
        }
        return false;
      }
      if (setIdRef.current !== forSet) return false;
      setResults((r) => without(r, touched));
      await refreshList(forSet);
      return true;
    },
    [refreshList],
  );

  const save = useCallback((d: CaseDraft) => write((forSet) => saveCase(forSet, d), d.caseId), [write]);

  const remove = useCallback(
    async (c: RuleSetCaseView) => {
      await write((forSet) => deleteCase(forSet, c.caseId, c.rowVersion), c.caseId);
    },
    [write],
  );

  const runAll = useCallback(async () => {
    const forSet = setIdRef.current;
    if (!forSet) return;
    const mine = ++runSeq.current;
    setRunning(true);
    setError(null);
    try {
      const res = await runCases(forSet, flowJsonRef.current(), [], ruleVersionsRef.current());
      if (mine !== runSeq.current) return;
      const next: Record<number, CaseRunResult> = {};
      for (const c of res.cases ?? []) next[c.caseId] = c;
      setResults(Object.keys(next).length === 0 ? NO_RESULTS : next);
      setDraft(res.ruleVersions === "MY_DRAFT" ? { ruleVersions: "MY_DRAFT", draftVersions: res.draftVersions ?? NO_DRAFTS } : null);
    } catch (e) {
      if (mine !== runSeq.current) return;
      setError(errorText(e));
    } finally {
      if (mine === runSeq.current) setRunning(false);
    }
  }, []);

  return { cases, results, running, error, save, remove, runAll, draft };
}
