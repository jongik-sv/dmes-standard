/** 변경 분류 표(TSK-05-03 design.md §2 — html p-ver 5행 그대로)와 전환 방식 라벨. 판정은 서버 LayoutChangeClassifier 가 한다. */

export type SwitchMode = "SEQUENTIAL" | "SIMULTANEOUS";

export interface ChangeClassRow {
  change: string;
  lengthOffset: "불변" | "변함";
  mode: SwitchMode;
  note: string;
}

export const CHANGE_CLASS_TABLE: ChangeClassRow[] = [
  { change: "여분을 쪼개 항목 추가", lengthOffset: "불변", mode: "SEQUENTIAL", note: "이전 버전으로 파싱하는 상대가 깨지지 않는다" },
  { change: "항목 길이 변경(도메인 길이 변경 포함)", lengthOffset: "변함", mode: "SIMULTANEOUS", note: "새 버전, 양측 동시" },
  { change: "항목 순서 변경", lengthOffset: "변함", mode: "SIMULTANEOUS", note: "새 버전, 양측 동시" },
  { change: "헤더 구성 변경, 헤더 추가·제거", lengthOffset: "변함", mode: "SIMULTANEOUS", note: "그 헤더를 쓰는 전문 전체" },
  { change: "CONST 값 재정의", lengthOffset: "불변", mode: "SEQUENTIAL", note: "" },
];

export function switchModeLabel(mode: string | null | undefined): string {
  if (mode === "SEQUENTIAL") return "순차 전환";
  if (mode === "SIMULTANEOUS") return "동시 전환";
  return "-";
}
