/**
 * ruleConfirm 응답 타입(TSK-08-05 design.md §6.5). 서버 `RuleConfirmService` 의 `data.result` 모양이다.
 * 룰 버전(ver)은 소수 셋째 자리 문자열이다(`"1.001"`, D-144 — I37 정수 규칙을 대신한다). 날짜는 `yyyy-MM-dd HH:mm:ss`(KST) 문자열이다.
 */
import type { MdmVersionStatus } from "@/shell";

/** 확정 대기 목록 한 행 — MDM 원천 룰의 DRAFT 마다 한 행(룰 ID 오름차순). */
export interface PendingDraft {
  maruRuleId: string;
  maruRuleName: string;
  ruleKind: string;
  ver: string;
  ownerId: string | null;
  /** 계산 상태(ADR-0002 D6). */
  ruleStatus: string;
}

export interface SearchResult {
  rows?: PendingDraft[];
}

export interface ConfirmRule {
  maruRuleId: string;
  maruRuleName: string;
  ruleKind: string;
  /** 계산 상태. */
  status: string;
  sourceKind: string;
}

export interface ConfirmVersion {
  ver: string;
  status: MdmVersionStatus;
  ownerId: string | null;
  rowVersion: number;
  hitPolicy: string | null;
  baseVer: string | null;
  applyFrom: string | null;
  applyTo: string | null;
  requestedBy: string | null;
  releasedAt: string | null;
}

export interface PreviousReleased {
  ver: string;
  hitPolicy: string | null;
  applyFrom: string | null;
  applyTo: string | null;
}

export type DiffKind = "ADDED" | "REMOVED" | "CHANGED" | "SAME";

/** row_id diff 한 행(06 「버전 비교」). ADDED 는 old 쪽, REMOVED 는 new 쪽이 null 이다. */
export interface DiffRow {
  rowId: number;
  kind: DiffKind;
  oldSeq: number | null;
  newSeq: number | null;
  oldCells: string | null;
  newCells: string | null;
  /** CHANGED 행에서 정규화 셀이 다른 var_id. */
  changedVarIds?: number[];
}

export type DiffCounts = Partial<Record<DiffKind, number>>;

/** 변수 라벨(대상 버전 ∪ 직전 버전) — diff 의 바뀐 칸 표시용. */
export interface VarLabel {
  varId: number;
  varKind: string;
  label: string | null;
  varName: string | null;
}

export interface ViewResult {
  rule: ConfirmRule;
  version: ConfirmVersion;
  previous: PreviousReleased | null;
  firstVersion: boolean;
  diff?: DiffRow[];
  diffCounts?: DiffCounts;
  vars?: VarLabel[];
  serverNow?: string;
}

export type CheckStatus = "PASSED" | "WARNED" | "REJECTED" | "EXEMPT";

export interface CheckIssue {
  /** ERROR | WARNING */
  severity: string;
  code: string;
  message: string;
  /** 항목 이름(`MdmRuleConfirmCheckItem`). */
  field: string | null;
  itemKey: string | null;
}

/** 검사 결과 한 항목(`MdmRuleConfirmCheckItem` 4행 중 하나). */
export interface CheckItem {
  item: string;
  status: CheckStatus;
  issues?: CheckIssue[];
}

/** 적용 순서 검사(직전 RELEASED apply_from 보다 뒤). 최초 버전은 EXEMPT. */
export interface ApplyFromCheck {
  status: "PASSED" | "REJECTED" | "EXEMPT";
  previousApplyFrom: string | null;
  message: string | null;
}

export interface CaseSummary {
  total: number;
  withExpected: number;
  passed: number;
  failed: number;
}

export interface ValidateResult {
  items?: CheckItem[];
  applyFromCheck?: ApplyFromCheck;
  contractWarnings?: CheckIssue[];
  caseSummary?: CaseSummary;
  rejectedCount?: number;
  warnedCount?: number;
  applyFrom?: string;
  futureApplyFrom?: boolean;
  serverNow?: string;
}

export interface ConfirmResult extends Partial<ViewResult> {
  confirmed?: { ver: string; rowVersion: number };
  closedPreviousVer?: string | null;
  warnings?: CheckIssue[];
}
