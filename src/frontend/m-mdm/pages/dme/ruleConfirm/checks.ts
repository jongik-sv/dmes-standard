/**
 * ruleConfirm 순수 판정(TSK-08-05 design.md §6.8, 불변 규칙 I34·I38·I41). React·fetch 없이 시험한다.
 */
import type { ApplyFromCheck, CheckIssue, CheckItem, CheckStatus } from "./types";

/** 입력 계약 변경 경고의 세부 코드(`ContractChangeCheck`). */
export const CONTRACT_CHANGED = "CONTRACT_CHANGED";

/** 적용 순서 행의 item 자리 이름 — 검사 표 testid `rc-check-APPLY_FROM`. */
export const APPLY_FROM_ITEM = "APPLY_FROM";

const STATUS_LABELS: Record<CheckStatus, string> = {
  PASSED: "통과",
  WARNED: "경고",
  REJECTED: "거부",
  EXEMPT: "면제",
};

/** 검사 결과 표의 결과 칸 라벨. 모르는 값은 그대로 보인다. */
export function checkStatusLabel(status: CheckStatus | string): string {
  return STATUS_LABELS[status as CheckStatus] ?? status;
}

/** 항목 제목(06 「상신 시 검사」). 서버 `item`(enum 이름)은 표에 함께 보인다. */
const CHECK_TITLES: Record<string, string> = {
  SAVE_CHECKS: "저장 시 검사 전부",
  NOT_EMPTY: "비어 있음",
  TEST_CASES: "값 테스트",
  RESULT_VAR_RELEASED: "결과 변수 참조",
  [APPLY_FROM_ITEM]: "적용 순서",
};

export function checkTitle(item: string): string {
  return CHECK_TITLES[item] ?? item;
}

/** 확정 버튼 활성 판정 입력. applyFrom·checkedApplyFrom 은 둘 다 `toServerDateTime` 결과다. */
export interface ConfirmGate {
  status: string | null | undefined;
  ownerId: string | null | undefined;
  /** 현재 사용자 ID(`useUserButtonRbac().userId`). */
  me: string | null | undefined;
  /** `confirm` 버튼 RBAC. */
  permitted: boolean;
  /** 마지막 `validate` 결과 항목. 검사하지 않았으면 null. */
  items: readonly CheckItem[] | null;
  /** 마지막 `validate` 의 적용 순서 판정. */
  applyFromCheck: ApplyFromCheck | null | undefined;
  /** 마지막 `validate` 에 보낸 apply_from. */
  checkedApplyFrom: string | null;
  /** 지금 입력된 apply_from. */
  applyFrom: string | null;
}

/**
 * I34 — DRAFT && 소유자 본인 && confirm 권한 && 검사 결과 있음 && REJECTED 0건 && 적용 순서가 REJECTED 아님 && 검사한
 * apply_from 이 지금 입력값과 같음. 서버는 어느 경우든 다시 검사하므로(I28) 이 판정은 버튼 안내일 뿐이다.
 */
export function canConfirm(gate: ConfirmGate): boolean {
  if (gate.status !== "DRAFT") return false;
  if (!gate.me || !gate.ownerId || gate.ownerId !== gate.me) return false;
  if (!gate.permitted) return false;
  if (!gate.items || gate.items.length === 0) return false;
  if (gate.items.some((row) => row.status === "REJECTED")) return false;
  if (gate.applyFromCheck?.status === "REJECTED") return false;
  return gate.applyFrom !== null && gate.checkedApplyFrom === gate.applyFrom;
}

const DATE_TIME = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::(\d{2})(?:\.\d+)?)?$/;

/**
 * I38 — `DateTimePicker` 입력(`2026-07-01 09:30:15`, 시·분·초가 항상 있다)을 서버 형식 `yyyy-MM-dd HH:mm:ss`
 * (KST 벽시계 그대로)로 바꾼다. 초가 있는 입력은 초까지 보존한다. 옛 `datetime-local` 값(`2026-07-01T00:00`,
 * 초 없음)도 받으려고 초가 없으면 `:00` 을 붙이고, 소수 초는 버린다. 빈 값이나 읽을 수 없는 값은 null 이다.
 */
export function toServerDateTime(input: string | null | undefined): string | null {
  const m = DATE_TIME.exec((input ?? "").trim());
  if (!m) return null;
  return `${m[1]} ${m[2]}:${m[3] ?? "00"}`;
}

export interface WarningLine {
  item: string;
  issue: CheckIssue;
}

export interface SplitWarnings {
  /** 계약 변경이 아닌 WARNING — 대화상자 `rc-ack`. */
  general: WarningLine[];
  /** 입력 계약 변경 WARNING — 대화상자 `rc-contract-ack`. */
  contract: WarningLine[];
}

const issueKey = (i: CheckIssue) => `${i.code}|${i.message}|${i.itemKey ?? ""}`;

/**
 * 항목의 WARNING 이슈를 항목 순서대로 펴서 `code === "CONTRACT_CHANGED"` 인 것과 나머지로 나눈다(D4). validate 의
 * `contractWarnings` 도 계약 변경으로 받되, 항목에 이미 있는 같은 경고는 한 번만 담는다.
 */
export function splitWarnings(
  items: readonly CheckItem[] | null, contractWarnings: readonly CheckIssue[] = [],
): SplitWarnings {
  const general: WarningLine[] = [];
  const contract: WarningLine[] = [];
  for (const row of items ?? []) {
    for (const issue of row.issues ?? []) {
      if (issue.severity !== "WARNING") continue;
      (issue.code === CONTRACT_CHANGED ? contract : general).push({ item: row.item, issue });
    }
  }
  const seen = new Set(contract.map((w) => issueKey(w.issue)));
  for (const issue of contractWarnings) {
    if (seen.has(issueKey(issue))) continue;
    seen.add(issueKey(issue));
    contract.push({ item: issue.field ?? "SAVE_CHECKS", issue });
  }
  return { general, contract };
}

/**
 * 계약 변경 영역의 상태(I41). 저장 시 검사에 ERROR 가 있으면 원장 검사(계약 변경 포함)가 돌지 않으므로 "변경 없음" 으로
 * 단정하지 않고 BLOCKED 를 돌려준다. 검사 전도 단정하지 않는다(NOT_CHECKED).
 */
export type ContractState = "FIRST" | "NOT_CHECKED" | "BLOCKED" | "CHANGED" | "NONE";

export function contractState(
  firstVersion: boolean, items: readonly CheckItem[] | null, contractWarnings: readonly CheckIssue[],
): ContractState {
  if (firstVersion) return "FIRST";
  if (!items) return "NOT_CHECKED";
  if (items.some((row) => row.item === "SAVE_CHECKS" && row.status === "REJECTED")) return "BLOCKED";
  return splitWarnings(items, contractWarnings).contract.length > 0 ? "CHANGED" : "NONE";
}
