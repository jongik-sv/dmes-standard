"use client";

/**
 * 세트 테스트 케이스 상태(3단계 계획 E6·P-D11·P-D19) — 케이스 목록·마지막 실행 결과·저장·삭제·[모두 실행].
 * page 수준에서 부른다(디버그 모드를 나갔다 와도 방금 저장한 케이스·마지막 결과가 남게).
 *
 * 케이스 쓰기 뒤에는 view 를 다시 불러 `cases` 만 받는다 — 세트 흐름·모드·dirty·이력·커서는 건드리지 않는다(P-D11, Review Focus 2).
 * 마지막 결과는 화면 메모리에만 두고, 흐름 구조(`flowVersion`)가 바뀌거나 세트를 바꾸면 모두 "안 돌림" 으로 돌아간다(P-D19).
 *
 * Task 0 은 최종 서명과 임시 본문만 둔다. 본문은 Task 10 이 채운다.
 */
import type { CaseDraft, CaseRunResult, RuleSetCaseView } from "../types";

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
}

/** 임시 본문의 빈 결과 — 참조가 렌더마다 바뀌지 않게 모듈 상수로 둔다. */
const NO_RESULTS: Record<number, CaseRunResult> = {};
const noSave = async (_d: CaseDraft) => false;
const noRemove = async (_c: RuleSetCaseView) => {};
const noRunAll = async () => {};

/**
 * @param setId 지금 세트 ID(없으면 null)
 * @param initial view 응답의 `cases` — page 가 세트를 열거나 [다시 불러오기] 했을 때(`viewEpoch`·setId)만 새 참조로 넘긴다(F25)
 * @param flowVersion 흐름 구조 버전 — 바뀌면 마지막 결과를 지운다(P-D19)
 * @param flowJson 지금 흐름의 정규 JSON(저장하지 않은 흐름)
 */
export function useTestCases(setId: string | null, initial: RuleSetCaseView[], flowVersion: number, flowJson: () => string): TestCases {
  // SEAM(T10): 케이스 상태(initial 참조가 바뀌면 — 세트 열기·[다시 불러오기], page 가 viewEpoch 로 정한다 — 목록을 다시 받음)·saveCase/deleteCase 뒤 cases 만 다시 받기(P-D11)·runCases·결과 지우기(P-D19)
  return { cases: initial, results: NO_RESULTS, running: false, error: null, save: noSave, remove: noRemove, runAll: noRunAll };
}
