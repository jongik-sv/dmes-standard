/** 변경 분류·diff 방향·검사 수준·테스트 결과 → 화면 문구(기능설계서 §6·§10 LV-003·LV-004). */
import type { CSSProperties } from "react";
import { badgeStyle } from "@/shell";

const CLASSIFICATION: Record<string, string> = {
  NEW: "신규",
  COMPATIBLE: "호환",
  NARROW_OR_WIDEN: "좁히기·넓히기",
  STRUCTURAL: "구조 변경(금지)",
  PARENT_CHANGE: "부모 변경",
};

const DIRECTION: Record<string, string> = {
  NARROW: "좁히기",
  WIDEN: "넓히기",
  CHANGE: "변경",
  STRUCTURAL: "구조 변경",
  COMPATIBLE: "호환",
  LINK: "연결",
  RELINK: "교체",
  UNLINK: "연결 제거",
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

/** 결과가 실패(불일치·판정 오류)인가 — 실패는 붉게 보인다. */
export function isFailedResult(result: string | null | undefined): boolean {
  return result === "MISMATCH" || result === "ERROR";
}

/**
 * 테스트 결과 배지 모양 — 룰 화면 테스트 케이스 배지(ruleEdit value-test/case-model caseBadgeCss)와 같다.
 * 실패는 위험 색, 일치는 성공 색, 판정 불가는 경고 색.
 */
export function resultBadgeCss(result: string | null | undefined): CSSProperties {
  if (isFailedResult(result)) return { ...badgeStyle("neutral"), color: "var(--color-danger)", background: "var(--color-danger-soft)" };
  if (result === "MATCH") return badgeStyle("success");
  if (result === "UNDECIDED") return badgeStyle("warning");
  return badgeStyle("muted");
}

/** 검사 수준 배지 모양 — 오류는 위험 색, 경고는 경고 색. */
export function issueLevelBadgeCss(level: string | null | undefined): CSSProperties {
  if (level === "ERROR") return { ...badgeStyle("neutral"), color: "var(--color-danger)", background: "var(--color-danger-soft)" };
  return badgeStyle("warning");
}
