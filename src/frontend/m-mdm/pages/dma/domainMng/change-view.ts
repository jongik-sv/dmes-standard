/** 변경 분류·diff 방향·검사 수준·테스트 결과 → 화면 문구(기능설계서 §6·§10 LV-003·LV-004). */

const CLASSIFICATION: Record<string, string> = {
  NEW: "신규",
  COMPATIBLE: "호환",
  NARROW_OR_WIDEN: "좁히기·넓히기",
  STRUCTURAL: "구조 변경(금지)",
};

const DIRECTION: Record<string, string> = {
  NARROW: "좁히기",
  WIDEN: "넓히기",
  CHANGE: "변경",
  STRUCTURAL: "구조 변경",
  COMPATIBLE: "호환",
};

const LEVEL: Record<string, string> = { ERROR: "오류", WARN: "경고" };

const RESULT: Record<string, string> = {
  MATCH: "일치",
  MISMATCH: "불일치",
  UNDECIDED: "판정 불가",
  ERROR: "판정 오류",
};

export function classificationLabel(kind: string | null | undefined): string {
  return kind ? (CLASSIFICATION[kind] ?? kind) : "-";
}

export function directionLabel(direction: string | null | undefined): string {
  return direction ? (DIRECTION[direction] ?? direction) : "-";
}

export function issueLevelLabel(level: string | null | undefined): string {
  return level ? (LEVEL[level] ?? level) : "-";
}

export function resultLabel(result: string | null | undefined): string {
  return result ? (RESULT[result] ?? result) : "-";
}

/** diff 칸 값 표시 — null 은 "(비움)". */
export function diffValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "(비움)";
  return String(v);
}
