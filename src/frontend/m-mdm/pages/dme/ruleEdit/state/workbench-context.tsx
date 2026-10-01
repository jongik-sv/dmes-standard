"use client";

/**
 * 룰 화면 카드 사이 공유 상태(TSK-08-04 design §2.5) — 표 카드(③)가 편집 중인 표를 올리고(`publishTableDraft`), 값 테스트 카드(④)가 그
 * 표로 BODY 값 테스트를 돌려 결과(`testRun`)를 올리면, 표 카드가 그 결과를 칠하고 테스트 결과 카드(⑤)가 그린다. 열 설정 초안 dirty 도
 * 싣는다(편집본 대상은 열 설정 초안을 반영하지 않는다는 안내, D4). 값 테스트 카드가 고른 대상·입력(`valueTestInput`)과 케이스 "불러오기"
 * 요청(`caseLoad`)도 싣는다 — 테스트 케이스 카드(⑥)가 같은 대상으로 모두 돌리고, 케이스 입력을 값 테스트 카드(④)에 채운다.
 *
 * 표 내용이 바뀔 때마다 rev 가 오른다. BODY 결과 뒤 rev 가 바뀌면 결과를 지우고 `testRunCleared` 로 안내한다(I33, `testRunAfterTableChange`).
 * Provider 는 `page.tsx` 가 카드 목록을 감싸 둔다. Provider 밖(카드 단독 렌더 테스트)에서는 아무것도 나누지 않는 기본값을 쓴다.
 */
import { createContext, useCallback, useContext, useMemo, useReducer, useState, type ReactNode } from "react";

import type { HitPolicyCode, StoredRow, ValueTestTarget } from "../types";
import type { InputFieldInfo } from "../value-test/test-input";
import { testRunAfterTableChange, type TestRunView } from "../value-test/test-marks";

/** 편집 중인 표 — rows 는 저장 형태(`tableStoredRows`, 새 행은 음수 임시 ID). */
export interface TableDraft {
  ruleId: string;
  ver: number | null;
  hitPolicy: HitPolicyCode | null;
  rows: StoredRow[];
  dirty: boolean;
  rev: number;
}

/** 값 테스트 카드(④)가 지금 고른 대상과 입력 레코드 — 테스트 케이스 카드(⑥)의 "모두 실행" 이 같은 대상·입력으로 돈다(B8). */
export interface ValueTestInput {
  ruleId: string;
  target: ValueTestTarget;
  ver: number;
  inputJson: string;
  /**
   * 지금 대상 정의의 입력 줄(계약 이름 순서). 테스트 케이스 입력 JSON 에 없는 키를
   * null 로 채우고(룰에 컬럼이 새로 들어오면 케이스에도 빈 칸으로 보여야 해서), 케이스 수정 팝업의 입력 폼 줄을 만든다.
   * 계약 계산이 실패해 입력 줄이 없으면 빈 배열이다.
   */
  fields: InputFieldInfo[];
}

/** 케이스 "불러오기" 요청 — seq 가 오를 때마다 값 테스트 카드가 입력 칸을 그 케이스로 채운다(B8). */
export interface CaseLoadRequest {
  ruleId: string;
  inputJson: string;
  seq: number;
}

export interface WorkbenchState {
  /** 지금 올라온 표 — 내용(룰·버전·적중 정책·행)이 같은 표가 다시 올라오면 rev 를 올리지 않는다(`sameTableContent`). */
  tableDraft: TableDraft | null;
  testRun: TestRunView | null;
  /** BODY 결과 뒤 표가 바뀌어 결과를 지웠다(새 결과를 받으면 꺼진다). */
  testRunCleared: boolean;
  colDirty: boolean;
}

export type WorkbenchAction =
  | { type: "publishTable"; draft: Omit<TableDraft, "rev"> }
  | { type: "setTestRun"; run: TestRunView | null }
  | { type: "setColDirty"; dirty: boolean };

export const INITIAL_WORKBENCH: WorkbenchState = { tableDraft: null, testRun: null, testRunCleared: false, colDirty: false };

/** 평범한 객체 한 단계 비교 — 키 순서·값이 같으면 같다(`JSON.stringify` 결과가 같은 것과 같은 판정, undefined 칸은 없는 칸으로 본다). */
function sameFlat(a: object, b: object): boolean {
  if (a === b) return true;
  const ka = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  if (ka.length !== kb.length) return false;
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] !== kb[i] || (a as Record<string, unknown>)[ka[i]] !== (b as Record<string, unknown>)[kb[i]]) return false;
  }
  return true;
}

/**
 * 두 표의 내용(룰·버전·적중 정책·행)이 같은가. 예전에는 표를 통째로 `JSON.stringify` 한 서명을 견주었다(편집 1회에 표 전체 직렬화).
 * 표 카드는 바뀌지 않은 행에 같은 저장 행 객체를 넘기므로 행 비교는 대부분 참조 비교로 끝난다.
 */
function sameTableContent(prev: TableDraft | null, d: Omit<TableDraft, "rev">): boolean {
  if (!prev || prev.ruleId !== d.ruleId || prev.ver !== d.ver || prev.hitPolicy !== d.hitPolicy) return false;
  if (prev.rows === d.rows) return true;
  if (prev.rows.length !== d.rows.length) return false;
  for (let i = 0; i < d.rows.length; i++) if (!sameFlat(prev.rows[i], d.rows[i])) return false;
  return true;
}

export function workbenchReducer(state: WorkbenchState, action: WorkbenchAction): WorkbenchState {
  switch (action.type) {
    case "publishTable": {
      const d = action.draft;
      const same = sameTableContent(state.tableDraft, d);
      if (same && d.dirty === state.tableDraft?.dirty) return state;
      const rev = (state.tableDraft?.rev ?? 0) + (same ? 0 : 1);
      const tableDraft: TableDraft = { ...d, rev };
      const next = testRunAfterTableChange(state.testRun, tableDraft);
      // 안내는 같은 룰·버전의 표를 계속 고치는 동안 남고, 룰·버전을 바꾸면 꺼진다.
      const sameTable = state.tableDraft?.ruleId === d.ruleId && state.tableDraft?.ver === d.ver;
      const cleared = next.cleared || (sameTable && state.testRunCleared && next.run === null);
      return { ...state, tableDraft, testRun: next.run, testRunCleared: cleared };
    }
    case "setTestRun":
      return { ...state, testRun: action.run, testRunCleared: false };
    case "setColDirty":
      return state.colDirty === action.dirty ? state : { ...state, colDirty: action.dirty };
  }
  return state;
}

export interface RuleWorkbench {
  tableDraft: TableDraft | null;
  publishTableDraft: (draft: Omit<TableDraft, "rev">) => void;
  testRun: TestRunView | null;
  /** 값 테스트 결과를 올린다(null 이면 지운다). BODY 는 돌릴 때의 `tableDraft.rev` 를 run.rev 에 싣는다. */
  setTestRun: (run: TestRunView | null) => void;
  testRunCleared: boolean;
  colDirty: boolean;
  setColDirty: (dirty: boolean) => void;
  valueTestInput: ValueTestInput | null;
  publishValueTestInput: (input: ValueTestInput | null) => void;
  caseLoad: CaseLoadRequest | null;
  loadCase: (ruleId: string, inputJson: string) => void;
}

const NOOP: RuleWorkbench = {
  tableDraft: null,
  publishTableDraft: () => {},
  testRun: null,
  setTestRun: () => {},
  testRunCleared: false,
  colDirty: false,
  setColDirty: () => {},
  valueTestInput: null,
  publishValueTestInput: () => {},
  caseLoad: null,
  loadCase: () => {},
};

const RuleWorkbenchContext = createContext<RuleWorkbench>(NOOP);

export function RuleWorkbenchProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(workbenchReducer, INITIAL_WORKBENCH);
  const publishTableDraft = useCallback((draft: Omit<TableDraft, "rev">) => dispatch({ type: "publishTable", draft }), []);
  const setTestRun = useCallback((run: TestRunView | null) => dispatch({ type: "setTestRun", run }), []);
  const setColDirty = useCallback((dirty: boolean) => dispatch({ type: "setColDirty", dirty }), []);
  const [valueTestInput, setValueTestInput] = useState<ValueTestInput | null>(null);
  const publishValueTestInput = useCallback(
    (input: ValueTestInput | null) => setValueTestInput((prev) => (JSON.stringify(prev) === JSON.stringify(input) ? prev : input)),
    [],
  );
  const [caseLoad, setCaseLoad] = useState<CaseLoadRequest | null>(null);
  const loadCase = useCallback((ruleId: string, inputJson: string) => setCaseLoad((prev) => ({ ruleId, inputJson, seq: (prev?.seq ?? 0) + 1 })), []);
  const value = useMemo<RuleWorkbench>(
    () => ({
      tableDraft: state.tableDraft,
      publishTableDraft,
      testRun: state.testRun,
      setTestRun,
      testRunCleared: state.testRunCleared,
      colDirty: state.colDirty,
      setColDirty,
      valueTestInput,
      publishValueTestInput,
      caseLoad,
      loadCase,
    }),
    [state, publishTableDraft, setTestRun, setColDirty, valueTestInput, publishValueTestInput, caseLoad, loadCase],
  );
  return <RuleWorkbenchContext.Provider value={value}>{children}</RuleWorkbenchContext.Provider>;
}

export function useRuleWorkbench(): RuleWorkbench {
  return useContext(RuleWorkbenchContext);
}
