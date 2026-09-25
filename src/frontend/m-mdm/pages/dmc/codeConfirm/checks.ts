/**
 * codeConfirm 순수 판정(TSK-06-05 design.md §6.7, 불변 규칙 I30·I34). React·fetch 없이 시험한다.
 */
import type { CheckIssue, CheckRow, CheckStatus } from "./types";

const STATUS_LABELS: Record<CheckStatus, string> = {
  PASSED: "통과",
  WARNED: "경고",
  REJECTED: "거부",
  EXEMPT: "면제",
  DELEGATED: "공통 검사",
  DEFERRED: "보류",
};

/** 검사 결과 표의 결과 칸 라벨. 모르는 값은 그대로 보인다. */
export function checkStatusLabel(status: CheckStatus | string): string {
  return STATUS_LABELS[status as CheckStatus] ?? status;
}

/** 확정 버튼 활성 판정 입력. applyFrom·checkedApplyFrom 은 둘 다 `toServerDateTime` 결과다. */
export interface ConfirmGate {
  status: string | null | undefined;
  ownerId: string | null | undefined;
  /** 현재 사용자 ID(`useUserButtonRbac().userId`). */
  me: string | null | undefined;
  /** `confirm` 버튼 RBAC. */
  permitted: boolean;
  /** 마지막 `validate` 결과 행. 검사하지 않았으면 null. */
  checks: readonly CheckRow[] | null;
  /** 마지막 `validate` 에 보낸 apply_from. */
  checkedApplyFrom: string | null;
  /** 지금 입력된 apply_from. */
  applyFrom: string | null;
}

/**
 * I30 — DRAFT && 소유자 본인 && confirm 권한 && 검사 결과 있음 && REJECTED 0건 && 검사한 apply_from 이 지금 입력값과
 * 같음. 서버는 어느 경우든 다시 검사하므로(I23) 이 판정은 버튼 안내일 뿐이다.
 */
export function canConfirm(gate: ConfirmGate): boolean {
  if (gate.status !== "DRAFT") return false;
  if (!gate.me || !gate.ownerId || gate.ownerId !== gate.me) return false;
  if (!gate.permitted) return false;
  if (!gate.checks || gate.checks.length === 0) return false;
  if (gate.checks.some((row) => row.status === "REJECTED")) return false;
  return gate.applyFrom !== null && gate.checkedApplyFrom === gate.applyFrom;
}

const DATE_TIME = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::(\d{2})(?:\.\d+)?)?$/;

/**
 * I34 — `datetime-local` 입력(`2026-07-01T00:00`, 초 있을 수 있음)을 서버 형식 `yyyy-MM-dd HH:mm:ss`(KST 벽시계 그대로)로
 * 바꾼다. 초가 없으면 `:00`, 소수 초는 버린다. 빈 값이나 읽을 수 없는 값은 null 이다.
 */
export function toServerDateTime(input: string | null | undefined): string | null {
  const m = DATE_TIME.exec((input ?? "").trim());
  if (!m) return null;
  return `${m[1]} ${m[2]}:${m[3] ?? "00"}`;
}

export interface WarningLine {
  no: string;
  item: string;
  issue: CheckIssue;
}

/** WARNED 행의 이슈를 행 순서대로 편다 — 확정 대화상자의 경고 목록. */
export function warningLines(rows: readonly CheckRow[] | null): WarningLine[] {
  return (rows ?? [])
    .filter((row) => row.status === "WARNED")
    .flatMap((row) => (row.issues ?? []).map((issue) => ({ no: row.no, item: row.item, issue })));
}
