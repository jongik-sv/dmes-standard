/**
 * 디버거 모델(3단계 계획 P9) — 서버 기록 실행(`execute`) 한 번의 기록 위에서 커서를 옮기는 순수 함수. React 의존이 없다.
 * 커서 k(0 ≤ k ≤ n, n = 기록 노드 수)는 "노드 k 실행 전"이다(P-D13). 기록이 없으면 커서는 -1 이다.
 *
 * Task 0 은 서명만 박는다. 본문은 Task 5(변수·멈춤·여기까지·실행 비교)와 Task 10(툴바 문구·기대값 JSON)이 채운다.
 */
import type { RunTrace, RuleSetFlow, TypedValue } from "@/contract/engine-contract.generated";

/** 변수 패널 한 줄 — 커서 자리에서 본 값. created·changed 는 바로 앞 노드가 만들었거나 바꿨는가. */
export interface DebugVar {
  name: string;
  value: TypedValue;
  created: boolean;
  changed: boolean;
}

/** [여기까지 실행] 결과 — 멈출 자리(index) 또는 한 줄 알림. */
export type RunToResult = { index: number } | { notice: string };

export const PASSED_NOTICE = "이 노드는 이미 지났다. [처음부터] 뒤 다시 누른다";
export const NOT_ON_PATH_NOTICE = "이 입력으로는 이 노드를 지나지 않는다";

/** 실행 비교(E7) 값 한 줄. */
export interface ValueDiffRow {
  name: string;
  before: TypedValue | null;
  after: TypedValue | null;
  same: boolean;
}

/** 실행 비교 — 결과 값 차이와 한쪽 실행에만 지난 노드. */
export interface RunDiff {
  values: ValueDiffRow[];
  onlyBefore: string[];
  onlyAfter: string[];
}

/** 커서 k 에서 본 변수(이름 순). k < n 이면 노드 k 실행 전 그 노드 범위의 ctx, k ≥ n 이면 마지막 노드 뒤. */
export function variablesAt(trace: RunTrace, flow: RuleSetFlow, cursor: number): DebugVar[] {
  return []; // SEAM(T5): frames 의 before·ctx 로 이름 순 변수 목록(created·changed)
}

/** from(inclusive 면 포함) 부터 중단점 노드가 있는 첫 커서, 없으면 null. */
export function nextStop(trace: RunTrace, from: number, inclusive: boolean, stops: ReadonlySet<string>): number | null {
  return null; // SEAM(T5): stops 에 든 첫 기록 노드 순번
}

/** [여기까지 실행] — 커서(inclusive 면 포함) 뒤에서 nodeId 를 찾는다. 앞에만 있으면 PASSED_NOTICE, 기록에 없으면 NOT_ON_PATH_NOTICE. */
export function runToIndex(trace: RunTrace, cursor: number, inclusive: boolean, nodeId: string): RunToResult {
  return { notice: NOT_ON_PATH_NOTICE }; // SEAM(T5): 커서 뒤 첫 칸·지난 노드·지나지 않는 노드 판정
}

/** 두 실행 기록 비교(E7) — 최종 결과 값과 지난 노드 차이. */
export function compareRuns(before: RunTrace, after: RunTrace): RunDiff {
  return { values: [], onlyBefore: [], onlyAfter: [] }; // SEAM(T5): finalValues 이름별 비교(sameTyped)·경로 차이
}

/** 디버그 툴바 상태 문구(예: "3/7 r2 실행 전"). 기록이 없으면 빈 글자. */
export function debugStatus(trace: RunTrace | null, cursor: number): string {
  return ""; // SEAM(T10): 툴바 문구(진행·끝·멈춤)
}

/** 케이스 기대값 JSON — 실행 결과의 최종 변수로 채운다(Review Focus 1). */
export function expectedFromFinal(finalValues: Record<string, TypedValue>): string {
  return "{}"; // SEAM(T10): 최종 변수 → 기대값 JSON(숫자 표기·BOOLEAN 왕복)
}
